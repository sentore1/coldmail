import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";
import { signUpAction } from "@/lib/auth-actions";
import { UrlProvider } from "@/components/url-provider";

export default async function Signup(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  if ("message" in searchParams) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4 bg-white">
        <FormMessage message={searchParams} />
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
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Create account</h1>
        <p className="text-xs text-gray-400 mb-7">
          Already have one?{" "}
          <Link href="/sign-in" className="text-gray-700 hover:underline">
            Sign in
          </Link>
        </p>

        {/* Form — no card, no shadow */}
        <UrlProvider>
          <form className="flex flex-col gap-4">
            <div>
              <Label htmlFor="full_name" className="text-xs text-gray-500 mb-1.5 block">
                Full name
              </Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="John Doe"
                required
                className="w-full rounded-sm h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

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
              <Label htmlFor="password" className="text-xs text-gray-500 mb-1.5 block">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                name="password"
                placeholder="••••••••"
                minLength={6}
                required
                className="w-full rounded-sm h-9 text-sm border-gray-200 focus:border-gray-400 focus:ring-0"
              />
            </div>

            <SubmitButton
              formAction={signUpAction}
              pendingText="Creating account…"
              className="w-full h-9 rounded-sm bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors mt-1"
            >
              Get started
            </SubmitButton>

            <FormMessage message={searchParams} />
          </form>
        </UrlProvider>

        <p className="text-center mt-8 text-[11px] text-gray-300">
          <Link href="/" className="hover:text-gray-500">← Back</Link>
        </p>
      </div>
    </div>
  );
}
