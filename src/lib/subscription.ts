/**
 * Server-only helpers for roles, disabled state and subscriptions.
 * All reads/writes go through the service-role client (bypasses RLS) so
 * admin pages and the dashboard guard can see any user's row.
 */
import { createServiceClient } from "../../supabase/service";
import type { MomoPlanId } from "./momo";

export type UserRole = "user" | "admin";

export interface UserAccessInfo {
  role: UserRole;
  is_disabled: boolean;
  email: string | null;
  name: string | null;
}

/**
 * Read a user's role + disabled flag from public.users.
 * Returns role='user', is_disabled=false if the profile row is missing
 * (e.g. created before this migration ran) so access isn't accidentally denied.
 */
export async function getUserAccessInfo(userId: string): Promise<UserAccessInfo> {
  const service = createServiceClient();
  const { data } = await service
    .from("users")
    .select("role, is_disabled, email, name")
    .eq("id", userId)
    .maybeSingle();

  return {
    role: (data?.role as UserRole) ?? "user",
    is_disabled: Boolean(data?.is_disabled),
    email: data?.email ?? null,
    name: data?.name ?? null,
  };
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { role } = await getUserAccessInfo(userId);
  return role === "admin";
}

export interface SubscriptionInfo {
  status: string; // 'active' | 'inactive' | 'expired' | 'cancelled'
  plan: string | null;
  current_period_end: string | null;
}

export async function getSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status,
    plan: data.plan,
    current_period_end: data.current_period_end,
  };
}

/**
 * A subscription is "active" if status='active' and the period hasn't ended.
 * Admins don't need a subscription — check isAdmin() separately.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  if (!sub || sub.status !== "active") return false;
  if (!sub.current_period_end) return true; // no expiry recorded — treat as active
  return new Date(sub.current_period_end).getTime() > Date.now();
}

/**
 * Grant / extend a subscription for a user. Used after a successful MoMo
 * payment, and by the admin "grant subscription" action.
 * If the plan is recurring, extend from the current period end if still
 * active; otherwise start from now.
 */
export async function activateSubscription(
  userId: string,
  plan: MomoPlanId,
  durationDays: number,
  referenceId?: string
): Promise<void> {
  const service = createServiceClient();

  const { data: existing } = await service
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const now = Date.now();
  const currentEnd = existing?.current_period_end
    ? new Date(existing.current_period_end).getTime()
    : 0;
  // Extend from the later of "now" or "current end".
  const start = currentEnd > now ? currentEnd : now;
  const newEnd = new Date(start + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await service.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status: "active",
      current_period_end: newEnd,
      momo_reference_id: referenceId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Failed to activate subscription: ${error.message}`);
  }
}

/** Convenience used by the dashboard guard. */
export async function canAccessApp(
  userId: string
): Promise<{ allowed: boolean; reason?: "disabled" | "no_subscription"; role: UserRole; hasSubscription: boolean }> {
  const info = await getUserAccessInfo(userId);
  if (info.is_disabled && info.role !== "admin") {
    return { allowed: false, reason: "disabled", role: info.role, hasSubscription: false };
  }
  if (info.role === "admin") {
    return { allowed: true, role: info.role, hasSubscription: true };
  }
  const active = await hasActiveSubscription(userId);
  if (!active) {
    return { allowed: false, reason: "no_subscription", role: info.role, hasSubscription: false };
  }
  return { allowed: true, role: info.role, hasSubscription: true };
}
