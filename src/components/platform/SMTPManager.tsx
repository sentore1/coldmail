
import { useState, useEffect } from "react";
import { Plus, Mail, Trash2, CheckCircle, XCircle, AlertCircle, Settings, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "../../../supabase/client";

interface SMTPManagerProps {
  userId: string;
}

// ── Provider presets ───────────────────────────────────────────────────────
const PROVIDERS: Record<string, { label: string; host: string; port: number; limit: number; note?: string }> = {
  Gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    limit: 500,
    note: "Requires a 16-character App Password — not your regular Gmail password.",
  },
  Outlook: {
    label: "Outlook / Hotmail",
    host: "smtp-mail.outlook.com",
    port: 587,
    limit: 300,
    note: "Use your Microsoft account password or an app password.",
  },
  Yahoo: {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 587,
    limit: 300,
    note: "Requires an App Password from Yahoo account security settings.",
  },
  Zoho: {
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 587,
    limit: 500,
    note: "Use your Zoho account credentials.",
  },
  SendGrid: {
    label: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    limit: 1000,
    note: "Username is 'apikey', password is your SendGrid API key.",
  },
  Mailgun: {
    label: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    limit: 1000,
    note: "Use your Mailgun SMTP credentials from the domain settings.",
  },
  Custom: {
    label: "Custom SMTP",
    host: "",
    port: 587,
    limit: 100,
    note: "Enter your SMTP server details manually.",
  },
};

const DEFAULT_FORM = {
  provider: "Gmail",
  email: "",
  host: PROVIDERS.Gmail.host,
  port: PROVIDERS.Gmail.port,
  user: "",
  password: "",
  daily_limit: PROVIDERS.Gmail.limit,
  sender_name: "",
};

export default function SMTPManager({ userId }: SMTPManagerProps) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [capacity, setCapacity] = useState({ total: 0, used: 0, remaining: 0 });
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const supabase = createClient();

  useEffect(() => { loadAccounts(); }, [userId]);

  const loadAccounts = async () => {
    const { data: ownData, error: ownError } = await supabase
      .from("smtp_accounts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    const { data: sharedData } = await supabase
      .from("smtp_accounts").select("*").eq("is_shared", true).order("created_at", { ascending: false });

    if (ownError) { toast.error("Failed to load SMTP accounts"); return; }

    const all = [...(ownData || []), ...(sharedData || [])];
    const seen = new Set<string>();
    const merged = all.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
    setAccounts(merged);

    const totalCapacity = merged.reduce((s: number, a: any) => s + a.daily_limit, 0);
    const totalUsed = merged.reduce((s: number, a: any) => s + (a.sent_today || 0), 0);
    setCapacity({ total: totalCapacity, used: totalUsed, remaining: totalCapacity - totalUsed });
  };

  const handleProviderChange = (provider: string) => {
    const p = PROVIDERS[provider];
    setFormData(f => ({
      ...f,
      provider,
      host: p.host,
      port: p.port,
      daily_limit: p.limit,
      // Reset user to email for preset providers; keep manual for custom
      user: provider !== "Custom" ? f.email : f.user,
    }));
  };

  const handleEmailChange = (email: string) => {
    setFormData(f => ({
      ...f,
      email,
      // Auto-fill username from email for non-custom providers
      user: f.provider !== "Custom" ? email : f.user,
    }));
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!formData.email.includes("@")) { toast.error("Invalid email address"); setLoading(false); return; }

      const derivedName = formData.sender_name.trim() ||
        formData.email.split("@")[0].replace(/[._\-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      const newAccount: Record<string, any> = {
        user_id: userId,
        email: formData.email,
        host: formData.host,
        port: formData.port,
        user_name: formData.user || formData.email,
        password: formData.password,
        provider: formData.provider,
        daily_limit: formData.daily_limit,
        sent_today: 0,
        status: "active",
        last_reset: new Date().toISOString(),
        sender_name: derivedName,
      };

      let { data, error } = await supabase.from("smtp_accounts").insert(newAccount).select();

      if (error && (error.message?.includes("sender_name") || error.code === "42703")) {
        const { sender_name: _, ...without } = newAccount;
        const retry = await supabase.from("smtp_accounts").insert(without).select();
        data = retry.data; error = retry.error;
      }

      if (error) {
        if (error.code === "23505") toast.error("This email address is already added");
        else toast.error("Failed to add SMTP account: " + (error.message || "Unknown error"));
        setLoading(false); return;
      }

      setShowAddForm(false);
      setFormData({ ...DEFAULT_FORM });
      await loadAccounts();

      try {
        const checkRes = await fetch("/api/smtp-check");
        const checkData = await checkRes.json();
        if (checkData.success && checkData.count > 0)
          toast.success(`Account added ✓ — server sees ${checkData.count} account(s)`);
        else toast.success("SMTP account added successfully!");
      } catch { toast.success("SMTP account added successfully!"); }
    } catch (err) {
      toast.error("Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally { setLoading(false); }
  };

  const handleDeleteAccount = async (accountId: string) => {
    const { error } = await supabase.from("smtp_accounts").delete().eq("id", accountId).eq("user_id", userId);
    if (error) { toast.error("Failed to delete SMTP account"); return; }
    toast.success("SMTP account deleted");
    await loadAccounts();
  };

  const toggleShared = async (accountId: string, currentlyShared: boolean) => {
    const { error } = await supabase.from("smtp_accounts").update({ is_shared: !currentlyShared }).eq("id", accountId).eq("user_id", userId);
    if (error) { toast.error("Failed to update sharing"); return; }
    toast.success(currentlyShared ? "Account is now private" : "Account is now shared");
    await loadAccounts();
  };

  const getStatusIcon = (status: string) => {
    if (status === "active") return <CheckCircle size={16} className="text-green-500" />;
    if (status === "error")  return <XCircle size={16} className="text-red-500" />;
    return <AlertCircle size={16} className="text-yellow-500" />;
  };

  const selectedProvider = PROVIDERS[formData.provider] || PROVIDERS.Custom;
  const isCustom = formData.provider === "Custom";

  return (
    <div className="flex flex-col gap-6 p-6 h-full bg-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SMTP Accounts</h2>
          <p className="text-sm text-gray-500 mt-1">Add any email provider — Gmail, Outlook, Zoho, or custom SMTP</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0084FF] text-white rounded-lg hover:bg-[#0070d6] transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* Capacity cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Mail,         label: "Total Capacity",   value: capacity.total,     suffix: "emails per day" },
          { icon: CheckCircle,  label: "Remaining Today",  value: capacity.remaining, suffix: "emails available" },
          { icon: Settings,     label: "Active Accounts",  value: accounts.filter(a => a.status === "active").length, suffix: `of ${accounts.length} total` },
        ].map(({ icon: Icon, label, value, suffix }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} className="text-[#0084FF]" />
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{suffix}</p>
          </div>
        ))}
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Add SMTP Account</h3>

          {/* Provider picker */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
                    formData.provider === key
                      ? "bg-[#0084FF] text-white border-[#0084FF]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#0084FF] hover:text-[#0084FF]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {selectedProvider.note && (
              <p className="mt-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                ℹ️ {selectedProvider.note}
                {formData.provider === "Gmail" && (
                  <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" className="text-[#0084FF] underline ml-1">
                    How to create an App Password
                  </a>
                )}
              </p>
            )}
          </div>

          <form onSubmit={handleAddAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Email */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => handleEmailChange(e.target.value)}
                  placeholder={formData.provider === "Gmail" ? "you@gmail.com" : "you@yourdomain.com"}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF] placeholder:text-gray-400"
                  required
                />
              </div>

              {/* Sender name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sender Name <span className="text-gray-400 font-normal">(shown in email From field)</span>
                </label>
                <input
                  type="text"
                  value={formData.sender_name}
                  onChange={e => setFormData(f => ({ ...f, sender_name: e.target.value }))}
                  placeholder="e.g. Alice Smith"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF] placeholder:text-gray-400"
                />
              </div>

              {/* Custom SMTP fields */}
              {isCustom && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host *</label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={e => setFormData(f => ({ ...f, host: e.target.value }))}
                      placeholder="smtp.yourprovider.com"
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF] placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port *</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={e => setFormData(f => ({ ...f, port: parseInt(e.target.value) }))}
                      placeholder="587"
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF]"
                      required
                    />
                    <p className="text-xs text-gray-400 mt-1">Common ports: 587 (TLS), 465 (SSL), 25</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username *</label>
                    <input
                      type="text"
                      value={formData.user}
                      onChange={e => setFormData(f => ({ ...f, user: e.target.value }))}
                      placeholder="Usually your email address"
                      className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF] placeholder:text-gray-400"
                      required
                    />
                  </div>
                </>
              )}

              {/* For non-custom providers show the auto-filled host as read-only */}
              {!isCustom && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Server</label>
                  <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500">
                    {formData.host}:{formData.port}
                  </div>
                </div>
              )}

              {/* Password */}
              <div className={isCustom ? "md:col-span-2" : ""}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.provider === "Gmail" ? "App Password *" : "Password *"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                  placeholder={formData.provider === "Gmail" ? "16-character app password" : "SMTP password"}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF] placeholder:text-gray-400"
                  required
                />
              </div>

              {/* Daily limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Daily Sending Limit</label>
                <input
                  type="number"
                  value={formData.daily_limit}
                  onChange={e => setFormData(f => ({ ...f, daily_limit: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0084FF] focus:border-[#0084FF]"
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-[#0084FF] text-white rounded-lg hover:bg-[#0070d6] disabled:opacity-50 font-medium">
                {loading ? "Adding…" : "Add Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Status", "Email", "Provider", "Usage Today", "Daily Limit", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map(account => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(account.status)}
                    <span className="text-sm capitalize text-gray-700">{account.status}</span>
                    {account.is_shared && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">SHARED</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {account.email}
                  {account.user_id !== userId && account.is_shared && (
                    <span className="ml-2 text-[10px] text-gray-400">(shared)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{account.provider}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                      <div className="bg-[#0084FF] h-1.5 rounded-full" style={{ width: `${Math.min((account.sent_today / account.daily_limit) * 100, 100)}%` }} />
                    </div>
                    <span className="text-sm text-gray-600">{account.sent_today}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{account.daily_limit}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {account.user_id === userId && (
                      <>
                        <button onClick={() => handleDeleteAccount(account.id)} className="text-red-500 hover:text-red-700" title="Delete">
                          <Trash2 size={15} />
                        </button>
                        <button
                          onClick={() => toggleShared(account.id, account.is_shared)}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            account.is_shared ? "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {account.is_shared ? "Shared" : "Share"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {accounts.length === 0 && (
          <div className="text-center py-12" style={{ backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
            <Mail size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No SMTP accounts yet</p>
            <p className="text-sm text-gray-400 mt-1">Add Gmail, Outlook, Zoho, or any custom SMTP server</p>
          </div>
        )}
      </div>
    </div>
  );
}
