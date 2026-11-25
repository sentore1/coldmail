import { signInAction } from "@/lib/auth-actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";

interface LoginProps {
  searchParams: Promise<Message>;
}

export default async function SignInPage({ searchParams }: LoginProps) {
  const message = await searchParams;

  if ("message" in message) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4 bg-white">
        <FormMessage message={message} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[340px]">

        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image
            src="/pryro-logo.png"
            alt="Pryro Mail"
            width={90}
            height={28}
            priority
            className="h-7 w-auto"
          />
        </div>

        {/* Heading */}
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h1>
        <p className="text-xs text-gray-400 mb-7">
          No account?{" "}
          <Link href="/sign-up" className="text-gray-700 hover:underline">
            Create one free
          </Link>
        </p>

        {/* Form — no card, no shadow, just fields */}
        <form className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email" className="text-xs text-gray-500 mb-1.5 block">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="w-full rounded-sm h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <Label htmlFor="password" className="text-xs text-gray-500">
                Password
              </Label>
              <Link href="/forgot-password" className="text-[11px] text-gray-400 hover:text-gray-600">
                Forgot?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              placeholder="••••••••"
              required
              className="w-full rounded-sm h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
            />
          </div>

          <SubmitButton
            className="w-full h-9 rounded-sm bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors mt-1"
            pendingText="Signing in…"
            formAction={signInAction}
          >
            Sign in
          </SubmitButton>

          <FormMessage message={message} />
        </form>

        <p className="text-center mt-8 text-[11px] text-gray-300">
          <Link href="/" className="hover:text-gray-500">← Back</Link>
        </p>
      </div>
    </div>
  );
}
