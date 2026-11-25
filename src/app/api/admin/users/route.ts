import { NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { isAdmin } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(user.id);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Forbidden — admins only" }, { status: 403 });
  }

  const service = createServiceClient();

  const { data: users, error: usersError } = await service
    .from("users")
    .select("id, email, name, full_name, role, is_disabled, created_at")
    .order("created_at", { ascending: false });

  if (usersError) {
    return NextResponse.json(
      { success: false, error: "Failed to load users: " + usersError.message },
      { status: 500 }
    );
  }

  const { data: subs } = await service
    .from("subscriptions")
    .select("user_id, status, plan, current_period_end");

  const subByUser = new Map<string, { status: string; plan: string | null; current_period_end: string | null }>();
  for (const s of subs ?? []) {
    subByUser.set(s.user_id, {
      status: s.status,
      plan: s.plan,
      current_period_end: s.current_period_end,
    });
  }

  const now = Date.now();
  const rows = (users ?? []).map((u) => {
    const sub = subByUser.get(u.id);
    const active =
      sub?.status === "active" &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > now);
    return {
      id: u.id,
      email: u.email,
      name: u.name ?? u.full_name ?? null,
      role: (u.role as string) ?? "user",
      is_disabled: Boolean(u.is_disabled),
      created_at: u.created_at,
      subscription: {
        status: sub?.status ?? "none",
        plan: sub?.plan ?? null,
        current_period_end: sub?.current_period_end ?? null,
        active,
      },
    };
  });

  return NextResponse.json({ success: true, users: rows });
}
