"use client";

import { useState, useRef, useEffect } from "react";
import { ActiveModule } from "@/types/platform";
import { Radio, Mail, Settings, Layout, LogOut, Server, Clock, Menu, Megaphone, Workflow, Puzzle, User } from "lucide-react";
import { NotificationsBell } from "./NotificationsPanel";

interface TopBarProps {
  activeModule: ActiveModule;
  userEmail?: string;
  userId?: string;
  onLogout?: () => void;
  onMenuToggle?: () => void;
}

const moduleInfo: Record<ActiveModule, { label: string; desc: string; icon: React.ElementType }> = {
  scraper:        { label: "Email Scraper",     desc: "Find and scrape leads by niche & location",           icon: Radio },
  pipeline:       { label: "Outreach Pipeline", desc: "Research, draft, and send leads through each stage",  icon: Workflow },
  "email-writer": { label: "AI Email Writer",   desc: "Generate personalized cold outreach emails",          icon: Mail },
  crm:            { label: "CRM",               desc: "Track replies, interest, and relationship status",    icon: Layout },
  skills:         { label: "Agent Skills",      desc: "Inspect built-in skills, rules, schemas, and traces", icon: Puzzle },
  "smtp-manager": { label: "SMTP Manager",      desc: "Manage your email sending accounts",                  icon: Server },
  "ai-settings":  { label: "AI Settings",       desc: "Configure AI providers and active model",             icon: Settings },
  "follow-up":    { label: "Follow-Up System",  desc: "Manage automated email follow-up sequences",          icon: Clock },
  campaigns:      { label: "Campaigns",         desc: "Create and manage email campaigns",                   icon: Megaphone },
};

export default function TopBar({ activeModule, userEmail, userId, onLogout, onMenuToggle }: TopBarProps) {
  const info = moduleInfo[activeModule] || moduleInfo.scraper;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = userEmail ? userEmail[0].toUpperCase() : "U";

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-white"
      style={{ position: "sticky", top: 0, zIndex: 40 }}
    >
      {/* Left — page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-bold text-gray-900 truncate">{info.label}</h1>
          <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block truncate">{info.desc}</p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500 border border-green-600">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-bold text-white tracking-wide">LIVE</span>
        </div>

        {/* Notifications */}
        {userId && <NotificationsBell userId={userId} />}

        {/* Avatar with dropdown */}
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(v => !v)}
            className="w-8 h-8 rounded-full bg-[#0084FF] flex items-center justify-center text-white font-bold text-sm hover:opacity-90 transition-opacity focus:outline-none"
          >
            {initial}
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden z-50"
              style={{ top: "100%" }}
            >
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#0084FF] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">{initial}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{userEmail || "User"}</p>
                  <p className="text-[10px] text-gray-400">Logged in</p>
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { setOpen(false); onLogout?.(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
