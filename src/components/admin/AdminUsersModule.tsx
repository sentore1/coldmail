"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "../../../supabase/client";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ShieldCheck, ArrowLeft, LogOut, Loader2, Users, BadgeCheck, UserCog, Ban } from "lucide-react";

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  is_disabled: boolean;
  created_at: string | null;
  subscription: {
    status: string;
    plan: string | null;
    current_period_end: string | null;
    active: boolean;
  };
}

export default function AdminUsersModule({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load");
      setUsers(data.users ?? []);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Request failed");
      return data;
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleDisabled = async (u: UserRow, next: boolean) => {
    try {
      await patch(u.id, { action: "set_disabled", disabled: next });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_disabled: next } : x)));
      toast.success(next ? "User disabled" : "User enabled");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleSetRole = async (u: UserRow, role: string) => {
    try {
      await patch(u.id, { action: "set_role", role });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      toast.success(`Role set to ${role}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleGrant = async (u: UserRow, plan: "monthly" | "yearly", days: number) => {
    try {
      await patch(u.id, { action: "grant_subscription", plan, days });
      const end = new Date(Date.now() + days * 86400000).toISOString();
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, subscription: { ...x.subscription, status: "active", plan, current_period_end: end, active: true } }
            : x
        )
      );
      toast.success(`Granted ${days} days of access`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
  };

  const stats = {
    total: users.length,
    active: users.filter((u) => u.subscription.active).length,
    admins: users.filter((u) => u.role === "admin").length,
    disabled: users.filter((u) => u.is_disabled).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0084FF] flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">Admin Panel</h1>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate">{adminEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft size={14} /> Dashboard
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut size={14} /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Users size={18} />} label="Total users" value={stats.total} color="#0084FF" />
          <StatCard icon={<BadgeCheck size={18} />} label="Active subscriptions" value={stats.active} color="#16a34a" />
          <StatCard icon={<UserCog size={18} />} label="Admins" value={stats.admins} color="#7c3aed" />
          <StatCard icon={<Ban size={18} />} label="Disabled" value={stats.disabled} color="#dc2626" />
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Users</h2>
              <p className="text-xs text-gray-500">View, disable, promote and grant access to your users.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : null} Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-500">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase">User</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase">Role</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase">Subscription</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase">Access</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={u.is_disabled ? "opacity-60" : undefined}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.email || "—"}</p>
                          <p className="text-xs text-gray-400 truncate">{u.name || "No name"}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          {u.role === "admin" ? (
                            <Badge className="bg-violet-600 border-transparent text-white">Admin</Badge>
                          ) : (
                            <Badge variant="outline">User</Badge>
                          )}
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleSetRole(u, v)}
                            disabled={busyId === u.id}
                          >
                            <SelectTrigger className="h-7 w-[90px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>

                      <TableCell>
                        {u.subscription.active ? (
                          <div>
                            <Badge className="bg-green-600 border-transparent text-white">Active</Badge>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {u.subscription.plan} • until{" "}
                              {u.subscription.current_period_end
                                ? new Date(u.subscription.current_period_end).toLocaleDateString()
                                : "—"}
                            </p>
                          </div>
                        ) : (
                          <Badge variant="secondary">No active plan</Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!u.is_disabled}
                            disabled={busyId === u.id}
                            onCheckedChange={(checked) => handleToggleDisabled(u, !checked)}
                          />
                          <span className={`text-xs ${u.is_disabled ? "text-red-500" : "text-gray-500"}`}>
                            {u.is_disabled ? "Disabled" : "Enabled"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGrant(u, "monthly", 30)}
                            disabled={busyId === u.id}
                          >
                            Grant 30d
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGrant(u, "yearly", 365)}
                            disabled={busyId === u.id}
                          >
                            Grant 1yr
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Tip: disabling a user signs them out on their next attempt to access the app. Admins cannot be
          disabled — demote them to “User” first.
        </p>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + "1a", color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}
