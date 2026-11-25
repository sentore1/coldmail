/**
 * MTN MoMo (Mobile Money) Collection API helper.
 *
 * Server-only. All secrets come from server env vars (no NEXT_PUBLIC_ prefix).
 *
 * Flow:
 *   1. getAccessToken()  -> Basic auth (API User ID : API Key) -> bearer token (cached)
 *   2. requestToPay()   -> POST /collection/v1_0/requesttopay  (returns 202, async)
 *   3. getPaymentStatus() -> GET /collection/v1_0/requesttopay/{referenceId}
 *
 * Sandbox setup (one time, at https://momodeveloper.mtn.com):
 *   - Subscribe to the "Collection" product.
 *   - Create an API User (provisioning) -> note the "API User ID" (a UUID).
 *   - Create an API Key for that user   -> note the "API Key".
 *   - Copy the "Primary Key" of the Collection subscription -> Ocp-Apim-Subscription-Key.
 *
 * Env vars (set in .env.local):
 *   MTN_MOMO_API_USER_ID        The API User ID (UUID)
 *   MTN_MOMO_API_KEY             The API Key for that user
 *   MTN_MOMO_SUBSCRIPTION_KEY    Ocp-Apim-Subscription-Key (Collection primary key)
 *   MTN_MOMO_TARGET_ENVIRONMENT  "sandbox" (default) or production e.g. "mtnuganda"
 *   MTN_MOMO_BASE_URL            https://sandbox.momodeveloper.mtn.com  (default)
 *   MTN_MOMO_CURRENCY            "EUR" in sandbox (default); e.g. "UGX"/"RWF" in prod
 */

export type MomoPlanId = "monthly" | "yearly";

export interface MomoPlan {
  id: MomoPlanId;
  label: string;
  amount: string; // MoMo requires amount as a string
  currency: string;
  durationDays: number;
  description: string;
  highlight?: boolean;
}

/**
 * Plans. Edit the amounts here to match your pricing + the currency you set
 * via MTN_MOMO_CURRENCY (EUR in the sandbox).
 */
export function getPlans(currency: string): MomoPlan[] {
  // Prices per currency. EUR = sandbox; RWF/Ugx-style = production (Rwanda).
  const rwf = currency === "RWF";
  return [
    {
      id: "monthly",
      label: "Monthly",
      amount: rwf ? "5000" : "10",
      currency,
      durationDays: 30,
      description: "Full access to the platform, billed every 30 days.",
      highlight: true,
    },
    {
      id: "yearly",
      label: "Yearly",
      amount: rwf ? "50000" : "100",
      currency,
      durationDays: 365,
      description: "Full access, billed annually — save ~2 months.",
    },
  ];
}

export function getPlan(id: MomoPlanId, currency: string): MomoPlan | undefined {
  return getPlans(currency).find((p) => p.id === id);
}

export function isMoMoConfigured(): boolean {
  return Boolean(
    process.env.MTN_MOMO_API_USER_ID &&
      process.env.MTN_MOMO_API_KEY &&
      process.env.MTN_MOMO_SUBSCRIPTION_KEY
  );
}

interface MoMoConfig {
  baseUrl: string;
  apiUserId: string;
  apiKey: string;
  subscriptionKey: string;
  targetEnvironment: string;
  currency: string;
}

function getConfig(): MoMoConfig {
  const apiUserId = process.env.MTN_MOMO_API_USER_ID;
  const apiKey = process.env.MTN_MOMO_API_KEY;
  const subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY;
  if (!apiUserId || !apiKey || !subscriptionKey) {
    throw new Error(
      "MTN MoMo is not configured. Set MTN_MOMO_API_USER_ID, MTN_MOMO_API_KEY and MTN_MOMO_SUBSCRIPTION_KEY in .env.local."
    );
  }
  return {
    baseUrl: (process.env.MTN_MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com").replace(/\/$/, ""),
    apiUserId,
    apiKey,
    subscriptionKey,
    targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT || "sandbox",
    currency: process.env.MTN_MOMO_CURRENCY || "EUR",
  };
}

// ── Access-token cache (per server process) ────────────────────────────────
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken(config: MoMoConfig): Promise<string> {
  const now = Date.now();
  // Refresh a little before real expiry to be safe.
  if (cachedToken && cachedTokenExpiresAt - now > 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${config.apiUserId}:${config.apiKey}`).toString("base64");
  const res = await fetch(`${config.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MoMo token request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("MoMo token response did not include access_token");
  }
  cachedToken = data.access_token;
  // expires_in is in seconds (default 3600); fall back to 3600.
  cachedTokenExpiresAt = now + (data.expires_in ? data.expires_in * 1000 : 3_600_000);
  return cachedToken;
}

export interface RequestToPayInput {
  referenceId: string; // UUID — used later to query status
  amount: string;
  currency: string;
  payerPhone: string; // MSISDN, e.g. "256770000000" (no "+")
  externalId?: string;
  payerMessage?: string;
  payeeNote?: string;
}

/**
 * POST /collection/v1_0/requesttopay
 * Returns nothing useful (202 Accepted, empty body). Poll getPaymentStatus().
 * Throws on non-2xx.
 */
export async function requestToPay(input: RequestToPayInput): Promise<void> {
  const config = getConfig();
  const token = await getAccessToken(config);

  const res = await fetch(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": input.referenceId,
      "X-Target-Environment": config.targetEnvironment,
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      externalId: input.externalId ?? input.referenceId,
      payer: {
        partyIdType: "MSISDN",
        partyId: input.payerPhone,
      },
      payerMessage: input.payerMessage ?? "Subscription payment",
      payeeNote: input.payeeNote ?? "Thanks for subscribing",
    }),
  });

  // 202 = accepted (payment pending user approval). 409 = duplicate reference.
  if (res.status !== 202 && res.status !== 201) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MoMo requestToPay failed (${res.status}): ${detail || res.statusText}`);
  }
}

export type MomoPaymentStatus =
  | "PENDING"
  | "SUCCESSFUL"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

interface RequestToPayStatus {
  amount?: string;
  currency?: string;
  financialTransactionId?: string;
  externalId?: string;
  status?: MomoPaymentStatus;
  reason?: { code?: string; message?: string } | null;
}

/**
 * GET /collection/v1_0/requesttopay/{referenceId}
 * Returns the current status of a request-to-pay transaction.
 */
export async function getPaymentStatus(
  referenceId: string
): Promise<{ status: MomoPaymentStatus; financialTransactionId?: string; raw: RequestToPayStatus }> {
  const config = getConfig();
  const token = await getAccessToken(config);

  const res = await fetch(
    `${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": config.targetEnvironment,
        "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      },
    }
  );

  if (res.status === 404) {
    // Not yet known to MoMo — treat as pending.
    return { status: "PENDING", raw: {} };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MoMo status request failed (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as RequestToPayStatus;
  return {
    status: data.status ?? "PENDING",
    financialTransactionId: data.financialTransactionId,
    raw: data,
  };
}

/** Map MoMo's status to our internal momo_payments.status values. */
export function mapStatus(status: MomoPaymentStatus): "pending" | "success" | "failed" | "cancelled" | "timeout" {
  switch (status) {
    case "SUCCESSFUL":
      return "success";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "TIMEOUT":
      return "timeout";
    default:
      return "pending";
  }
}
