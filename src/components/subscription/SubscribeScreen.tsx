"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "../../../supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Smartphone, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";

interface Plan {
  id: "monthly" | "yearly";
  label: string;
  amount: string;
  currency: string;
  durationDays: number;
  description: string;
  highlight?: boolean;
}

type PayState = "idle" | "pending" | "success" | "failed";

export default function SubscribeScreen({ userEmail }: { userEmail?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency, setCurrency] = useState("EUR");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<PayState>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/momo/plans", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPlans(d.plans);
          setCurrency(d.currency);
          setConfigured(Boolean(d.configured));
        }
      })
      .catch(() => setConfigured(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/sign-in");
  };

  const startPolling = (referenceId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~3 minutes at 3s intervals
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/momo/payment-status?referenceId=${encodeURIComponent(referenceId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data.success) return;

        if (data.status === "success") {
          if (pollRef.current) clearInterval(pollRef.current);
          setState("success");
          toast.success("Payment received — activating your subscription…");
          // Give the subscription upsert a moment, then reload so the server guard re-evaluates.
          setTimeout(() => router.refresh(), 800);
        } else if (data.status === "failed" || data.status === "cancelled" || data.status === "timeout") {
          if (pollRef.current) clearInterval(pollRef.current);
          setState("failed");
          toast.error(`Payment ${data.status}. Please try again.`);
        }
      } catch {
        /* ignore transient polling errors */
      }
      if (attempts >= maxAttempts && pollRef.current) {
        clearInterval(pollRef.current);
        setState("failed");
        toast.error("Payment confirmation timed out. If money was deducted, your access will be activated shortly.");
      }
    }, 3000);
  };

  const handlePay = async () => {
    const clean = phone.replace(/[\s+]/g, "");
    if (!/^\d{8,15}$/.test(clean)) {
      toast.error("Enter a valid phone number (e.g. 256770000000).");
      return;
    }
    setState("pending");
    try {
      const res = await fetch("/api/momo/request-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, phone: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not start payment");
      }
      toast.success("Approve the payment prompt on your phone.");
      startPolling(data.referenceId);
    } catch (err) {
      setState("failed");
      toast.error(String(err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0084FF] flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">Pryro Mail</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block">{userEmail}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <Badge className="bg-amber-100 text-amber-700 border-transparent mb-3">Subscription required</Badge>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Activate your access</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Subscribe with MTN Mobile Money to use the platform. Approve the payment prompt on your phone to confirm.
            </p>
          </div>

          {/* Plan cards */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {plans.map((p) => {
              const selected = selectedPlan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id)}
                  className={`text-left rounded-2xl border-2 p-5 transition-all bg-white relative ${
                    selected ? "border-[#0084FF] shadow-md" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-2.5 right-4 bg-[#0084FF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      POPULAR
                    </span>
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">{p.amount}</span>
                    <span className="text-sm text-gray-500">{p.currency}</span>
                    <span className="text-xs text-gray-400">/{p.label.toLowerCase()}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{p.description}</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    {selected ? (
                      <CheckCircle2 size={16} className="text-[#0084FF]" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={`text-xs font-medium ${selected ? "text-[#0084FF]" : "text-gray-400"}`}>
                      {selected ? "Selected" : "Select"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Payment form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            {configured === false && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                Mobile Money isn&apos;t set up yet. Please contact support — an admin can grant you access manually.
              </div>
            )}

            <Label htmlFor="phone" className="text-sm text-gray-700 mb-1.5 block">
              MTN Mobile Money number
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  id="phone"
                  inputMode="tel"
                  placeholder="256770000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                  disabled={state === "pending" || configured === false}
                />
              </div>
              <Button
                onClick={handlePay}
                disabled={state === "pending" || configured === false || configured === null}
                className="bg-[#0084FF] hover:bg-[#0073e0] text-white px-6"
              >
                {state === "pending" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Pay {plans.find((p) => p.id === selectedPlan)?.amount || ""} {currency} <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Enter your number without the “+”. We&apos;ll send a payment prompt to your phone — approve it to finish.
            </p>

            {state === "pending" && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
                <Loader2 size={16} className="animate-spin mt-0.5" />
                <span>Waiting for you to approve the payment on your phone. This page will update automatically.</span>
              </div>
            )}
            {state === "success" && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">
                <CheckCircle2 size={16} className="mt-0.5" />
                <span>Payment received! Redirecting you to the platform…</span>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            By subscribing you agree to be billed for access to Pryro Mail.
          </p>
        </div>
      </main>
    </div>
  );
}
