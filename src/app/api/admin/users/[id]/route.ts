import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../../supabase/server";
import { createServiceClient } from "../../../../../../supabase/service";
import { z } from "zod";
import { isAdmin, activateSubscription } from "@/lib/subscription";
import type { MomoPlanId } from "@/lib/momo";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["set_disabled", "set_role", "grant_subscription"]),
  // set_disabled
  disabled: z.boolean().optional(),
  // set_role
  role: z.enum(["user", "admin"]).optional(),
  // grant_subscription
  plan: z.enum(["monthly", "yearly"]).optional(),
  days: z.number().int().min(1).max(3650).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(user.id);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Forbidden — admins only" }, { status: 403 });
  }

  const { id: targetId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { action } = parsed.data;
  const service = createServiceClient();

  if (action === "set_disabled") {
    // Prevent an admin from disabling themselves or the last admin.
    if (parsed.data.disabled && targetId === user.id) {
      return NextResponse.json(
        { success: false, error: "You cannot disable your own account." },
        { status: 400 }
      );
    }
    const { data: existing } = await service
      .from("users")
      .select("role")
      .eq("id", targetId)
      .maybeSingle();
    if (existing?.role === "admin" && parsed.data.disabled) {
      return NextResponse.json(
        { success: false, error: "Disable the admin role first — admins cannot be disabled." },
        { status: 400 }
      );
    }
    const { error } = await service
      .from("users")
      .update({ is_disabled: parsed.data.disabled, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, is_disabled: parsed.data.disabled });
  }

  if (action === "set_role") {
    const role = parsed.data.role!;
    // Demoting yourself is disallowed to avoid locking out the only admin.
    if (role === "user" && targetId === user.id) {
      return NextResponse.json(
        { success: false, error: "You cannot remove your own admin role." },
        { status: 400 }
      );
    }
    const { error } = await service
      .from("users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, role });
  }

  // grant_subscription
  const plan = (parsed.data.plan ?? "monthly") as MomoPlanId;
  const days = parsed.data.days ?? (plan === "yearly" ? 365 : 30);
  try {
    await activateSubscription(targetId, plan, days, "admin-grant");
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Could not grant subscription: " + String(err) },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, plan, days });
}
