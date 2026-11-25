/**
 * grant-access.js
 * ───────────────
 * Grants (or revokes) a subscription for any user by email.
 *
 * Usage:
 *   node scripts/grant-access.js grant  user@example.com monthly
 *   node scripts/grant-access.js grant  user@example.com yearly
 *   node scripts/grant-access.js revoke user@example.com
 *   node scripts/grant-access.js status user@example.com
 *   node scripts/grant-access.js list
 *
 * Plans:
 *   monthly  → 30 days
 *   yearly   → 365 days
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ── Load .env.local manually (no dotenv dependency needed) ─────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌  .env.local not found at", envPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PLAN_DAYS = { monthly: 30, yearly: 365 };

// ── Helpers ────────────────────────────────────────────────────────────────

async function findUserByEmail(email) {
  // Service role can list auth users
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error("Could not list users: " + error.message);
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  return user || null;
}

async function getSubscription(userId) {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdGrant(email, plan) {
  if (!PLAN_DAYS[plan]) {
    console.error(`❌  Unknown plan "${plan}". Use: monthly | yearly`);
    process.exit(1);
  }

  console.log(`\n🔍  Looking up user: ${email}`);
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`❌  No user found with email: ${email}`);
    process.exit(1);
  }
  console.log(`✅  Found user: ${user.id}`);

  const days = PLAN_DAYS[plan];

  // Extend from current end if still active, otherwise start from now
  const existing = await getSubscription(user.id);
  const now = Date.now();
  const currentEnd = existing?.current_period_end
    ? new Date(existing.current_period_end).getTime()
    : 0;
  const start  = currentEnd > now ? currentEnd : now;
  const newEnd = new Date(start + days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: user.id,
      plan,
      status: "active",
      current_period_end: newEnd,
      momo_reference_id: "admin-grant",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("❌  Failed to grant subscription:", error.message);
    process.exit(1);
  }

  console.log(`\n🎉  Subscription granted!`);
  console.log(`    User  : ${email}`);
  console.log(`    Plan  : ${plan}`);
  console.log(`    Until : ${formatDate(newEnd)}`);
}

async function cmdRevoke(email) {
  console.log(`\n🔍  Looking up user: ${email}`);
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`❌  No user found with email: ${email}`);
    process.exit(1);
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    console.error("❌  Failed to revoke:", error.message);
    process.exit(1);
  }
  console.log(`✅  Subscription revoked for ${email}`);
}

async function cmdStatus(email) {
  console.log(`\n🔍  Looking up user: ${email}`);
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`❌  No user found with email: ${email}`);
    process.exit(1);
  }

  const sub = await getSubscription(user.id);
  const isActive =
    sub?.status === "active" &&
    (!sub.current_period_end ||
      new Date(sub.current_period_end).getTime() > Date.now());

  console.log(`\n── Subscription status for ${email} ──`);
  console.log(`  User ID  : ${user.id}`);
  if (!sub) {
    console.log(`  Status   : ❌  No subscription record`);
  } else {
    console.log(`  Status   : ${isActive ? "✅  Active" : "❌  " + sub.status}`);
    console.log(`  Plan     : ${sub.plan}`);
    console.log(`  Expires  : ${formatDate(sub.current_period_end)}`);
  }
}

async function cmdList() {
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("user_id, plan, status, current_period_end")
    .order("current_period_end", { ascending: false });

  if (error) {
    console.error("❌  Failed to list subscriptions:", error.message);
    process.exit(1);
  }

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap = {};
  for (const u of users?.users || []) userMap[u.id] = u.email;

  console.log(`\n── All subscriptions (${subs.length}) ──\n`);
  console.log(
    "Email".padEnd(35) + "Plan".padEnd(10) + "Status".padEnd(12) + "Expires"
  );
  console.log("─".repeat(80));

  const now = Date.now();
  for (const s of subs) {
    const email   = userMap[s.user_id] || s.user_id;
    const active  = s.status === "active" && (!s.current_period_end || new Date(s.current_period_end).getTime() > now);
    const status  = active ? "✅ active" : `❌ ${s.status}`;
    const expires = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—";
    console.log(
      email.padEnd(35) + (s.plan || "—").padEnd(10) + status.padEnd(12) + expires
    );
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, ...args] = process.argv;

  const help = `
Usage:
  node scripts/grant-access.js grant  <email> <monthly|yearly>
  node scripts/grant-access.js revoke <email>
  node scripts/grant-access.js status <email>
  node scripts/grant-access.js list
`;

  switch (cmd) {
    case "grant":
      if (!args[0] || !args[1]) { console.log(help); process.exit(1); }
      await cmdGrant(args[0], args[1]);
      break;
    case "revoke":
      if (!args[0]) { console.log(help); process.exit(1); }
      await cmdRevoke(args[0]);
      break;
    case "status":
      if (!args[0]) { console.log(help); process.exit(1); }
      await cmdStatus(args[0]);
      break;
    case "list":
      await cmdList();
      break;
    default:
      console.log(help);
  }
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err.message);
  process.exit(1);
});
