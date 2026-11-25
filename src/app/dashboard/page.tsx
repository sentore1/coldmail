import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import PlatformLayout from "@/components/platform/PlatformLayout";
import SubscribeScreen from "@/components/subscription/SubscribeScreen";
import { canAccessApp } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Check role / disabled / subscription in one go (service client, bypasses RLS).
  const access = await canAccessApp(user.id);

  if (access.reason === "disabled") {
    return redirect("/account-disabled");
  }

  // Non-admins without an active subscription must subscribe first.
  if (!access.allowed) {
    return <SubscribeScreen userEmail={user.email} />;
  }

  return (
    <PlatformLayout
      userId={user.id}
      userEmail={user.email}
      role={access.role}
    />
  );
}
