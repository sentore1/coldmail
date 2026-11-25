"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../supabase/client";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";

export default function AccountDisabledPage() {
  const router = useRouter();
  const supabase = createClient();

  // Clear the session so the disabled user can't keep using the app cookie.
  useEffect(() => {
    supabase.auth.signOut().finally(() => {});
  }, [supabase]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <Ban size={28} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Your account has been disabled</h1>
        <p className="text-sm text-gray-500 mt-2">
          An administrator has disabled your account. Please contact support if you believe this is a mistake.
        </p>
        <div className="mt-6">
          <Link href="/sign-in">
            <Button>Back to sign in</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
