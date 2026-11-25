import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  getPlan,
  isMoMoConfigured,
  requestToPay,
  type MomoPlanId,
} from "@/lib/momo";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  // MSISDN phone number; we strip spaces and a leading "+".
  phone: z
    .string()
    .min(8, "Enter a valid phone number")
    .transform((v) => v.replace(/[\s+]/g, ""))
    .refine((v) => /^\d{8,15}$/.test(v), "Enter a valid phone number (digits only)"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isMoMoConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Mobile Money payments are not configured yet. Please contact support or ask an admin to grant your subscription manually.",
      },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { plan, phone } = parsed.data;

  // Look up plan amount + currency from the MoMo config.
  const currency = process.env.MTN_MOMO_CURRENCY || "EUR";
  const planDef = getPlan(plan as MomoPlanId, currency);
  if (!planDef) {
    return NextResponse.json({ success: false, error: "Unknown plan" }, { status: 400 });
  }

  const referenceId = randomUUID();
  const service = createServiceClient();

  // 1. Record the intent as a pending payment.
  const { error: insertError } = await service.from("momo_payments").insert({
    user_id: user.id,
    reference_id: referenceId,
    plan,
    amount: planDef.amount,
    currency: planDef.currency,
    payer_phone: phone,
    status: "pending",
  });
  if (insertError) {
    // Duplicate reference id is extremely unlikely (UUID) — surface other errors.
    return NextResponse.json(
      { success: false, error: "Could not start payment: " + insertError.message },
      { status: 500 }
    );
  }

  // 2. Ask MoMo to prompt the user to pay.
  try {
    await requestToPay({
      referenceId,
      amount: planDef.amount,
      currency: planDef.currency,
      payerPhone: phone,
      payerMessage: `${planDef.label} subscription`,
      payeeNote: "Thanks for subscribing to Pryro Mail",
    });
  } catch (err) {
    // Mark the attempt failed so it's not left dangling.
    await service
      .from("momo_payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("reference_id", referenceId);
    return NextResponse.json(
      { success: false, error: "Payment request failed: " + String(err) },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    referenceId,
    plan,
    amount: planDef.amount,
    currency: planDef.currency,
    status: "pending",
    message: "Check your phone and approve the MTN MoMo payment prompt.",
  });
}
