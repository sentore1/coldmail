import { redirect } from "next/navigation";
import { createClient } from "../../supabase/server";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import DashboardPreview from "@/components/DashboardPreview";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">

      {/* ── Navbar ── */}
      <nav className="w-full bg-white px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <Image
          src="/pryro-logo.png"
          alt="Pryro Mail"
          width={80}
          height={24}
          priority
          className="h-6 w-auto"
        />
        <div className="flex items-center overflow-hidden" style={{ borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }}>
          <Link
            href="/sign-in"
            className="text-xs text-gray-600 hover:bg-gray-50 transition-colors px-3 py-1.5 bg-white"
          >
            Sign in
          </Link>
          <div className="w-px h-4 bg-gray-200" />
          <Link
            href="/sign-up"
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 text-white transition-colors"
            style={{ backgroundColor: "#0084FF" }}
          >
            Get started <ArrowRight size={11} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-white w-full pt-20 pb-14" style={{ paddingLeft: "calc(24px + 176px + 24px)", paddingRight: "48px" }}>
        {/* Two-col row: buttons left, text right */}
        <div className="flex items-center gap-12">
          {/* Buttons — single vertical pill */}
          <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{ borderRadius: 4, boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)" }}>
            <Link
              href="/sign-up"
              className="flex items-center justify-center gap-2 px-6 py-2.5 text-white text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#0084FF" }}
            >
              Start free <ArrowRight size={14} />
            </Link>
            <div className="h-px bg-gray-200" />
            <Link
              href="/sign-in"
              className="flex items-center justify-center px-6 py-2.5 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Sign in
            </Link>
          </div>
          {/* Text */}
          <div className="flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-900 mb-3">
              Cold outreach platform
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-4 whitespace-nowrap">
              Find leads. Write emails. Close deals.
            </h1>
            <p className="text-base text-gray-500 whitespace-nowrap">
              Pryro Mail scrapes targeted leads, writes AI-powered cold emails, and tracks your whole pipeline — in one place.
            </p>
          </div>
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="w-full px-6 pb-20 mx-auto" style={{ maxWidth: "1480px" }}>
        <DashboardPreview />
        <p className="text-center text-xs text-gray-400 mt-4">
          Live preview — scrape leads, write emails, track your pipeline
        </p>
      </section>

      {/* ── 3-step flow ── */}
      <section className="border-t border-gray-100 bg-white py-16 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { step: "01", title: "Scrape leads",   desc: "Search any niche and location. Get names, emails, and phones instantly." },
            { step: "02", title: "Write with AI",  desc: "One click generates a personalized cold email for every lead." },
            { step: "03", title: "Track & close",  desc: "Kanban pipeline, follow-ups, and campaign analytics in one view." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex flex-col items-center gap-3">
              <span className="text-xs font-bold tracking-widest mb-1" style={{ color: "#0084FF" }}>{step}</span>
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-6 px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-[140px] font-bold text-gray-200 tracking-tight leading-none select-none">Pryro ColdMail</span>
        <p className="text-[10px] text-gray-400 tracking-widest">
          POWERED BY SUPABASE · GROQ · AI-NATIVE
        </p>
        <div className="flex gap-4 text-xs text-gray-400">
          <Link href="/sign-in" className="hover:text-gray-600">Sign in</Link>
          <Link href="/sign-up" className="hover:text-gray-600">Sign up</Link>
        </div>
      </footer>

    </div>
  );
}
