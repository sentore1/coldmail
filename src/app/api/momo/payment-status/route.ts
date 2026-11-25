import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { getPaymentStatus, mapStatus, getPlan, type MomoPlanId } from "@/lib/momo";
import { activateSubscription } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const referenceId = request.nextUrl.searchParams.get("referenceId");
  if (!referenceId) {
    return NextResponse.json({ success: false, error: "referenceId is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch the payment row — must belong to this user (prevents polling others' payments).
  const { data: payment, error: payError } = await service
    .from("momo_payments")
    .select("id, user_id, plan, status, currency")
    .eq("reference_id", referenceId)
    .maybeSingle();

  if (payError || !payment) {
    return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
  }
  if (payment.user_id !== user.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  // If already resolved, don't re-query MoMo — just report current state + subscription.
  if (payment.status === "success") {
    const { data: sub } = await service
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      status: "success",
      subscriptionActive: sub?.status === "active",
      current_period_end: sub?.current_period_end ?? null,
    });
  }

  // Query MoMo for the live status.
  let live: Awaited<ReturnType<typeof getPaymentStatus>>;
  try {
    live = await getPaymentStatus(referenceId);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Could not reach MoMo: " + String(err) },
      { status: 502 }
    );
  }

  const internal = mapStatus(live.status);

  // Update the payment row.
  await service
    .from("momo_payments")
    .update({
      status: internal,
      momo_financial_id: live.financialTransactionId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("reference_id", referenceId);

  // On success, activate the subscription.
  let subscriptionActive = false;
  let current_period_end: string | null = null;
  if (internal === "success") {
    const planDef = getPlan(payment.plan as MomoPlanId, payment.currency);
    const durationDays = planDef?.durationDays ?? 30;
    await activateSubscription(user.id, payment.plan as MomoPlanId, durationDays, referenceId);
    const { data: sub } = await service
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    subscriptionActive = true;
    current_period_end = sub?.current_period_end ?? null;
  }

  return NextResponse.json({
    success: true,
    status: internal,
    subscriptionActive,
    current_period_end,
  });
}
