import { redirect } from "next/navigation";
import { createClient } from "../../../supabase/server";
import { getUserAccessInfo } from "@/lib/subscription";
import AdminUsersModule from "@/components/admin/AdminUsersModule";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const info = await getUserAccessInfo(user.id);
  if (info.role !== "admin") {
    // Non-admins get sent back to the app.
    return redirect("/dashboard");
  }

  return <AdminUsersModule adminEmail={user.email ?? info.email ?? ""} />;
}
