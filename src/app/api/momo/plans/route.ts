import { NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { getPlans, isMoMoConfigured } from "@/lib/momo";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const currency = process.env.MTN_MOMO_CURRENCY || "EUR";
  return NextResponse.json({
    success: true,
    configured: isMoMoConfigured(),
    currency,
    plans: getPlans(currency),
  });
}
