"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Radio, Mail, Workflow, Megaphone, Layout,
  Server, Settings, Send, CheckCircle2, Puzzle, Upload,
  Search, MapPin, Plus, RefreshCw, Bell, ChevronDown,
} from "lucide-react";

type Tab = "scraper" | "pipeline" | "email-writer" | "campaigns";

const LEADS = [
  { name: "Aspire Rwanda NGO",              email: "aspirerwanda@gmail.com",   badge: "GUESS", phone: "—", loc: "KG 685 St, Kigali" },
  { name: "Never Again Rwanda",             email: "info@neveragainrwanda.org", badge: "REAL",  phone: "—", loc: "KG 13 Ave, Kigali" },
  { name: "Rwanda NGO Forum on Health",     email: "info@rwandangoforum.rw",    badge: "REAL",  phone: "—", loc: "KG 599 St, Kigali" },
  { name: "Save the Children Rwanda",       email: "rwanda@savechildren.org",   badge: "REAL",  phone: "—", loc: "KG 7 Ave, Kigali" },
  { name: "CARE International Rwanda",      email: "care@carerwanda.org",       badge: "REAL",  phone: "—", loc: "KG 234 St, Kigali" },
  { name: "ActionAid Rwanda",               email: "info@actionaid.rw",         badge: "REAL",  phone: "—", loc: "KN 3 Rd, Kigali" },
  { name: "Imbuto Foundation",              email: "contact@imbuto.rw",         badge: "GUESS", phone: "—", loc: "KG 9 Ave, Kigali" },
  { name: "Rwanda Red Cross",               email: "info@redcross.rw",          badge: "REAL",  phone: "—", loc: "KN 5 Rd, Kigali" },
  { name: "Handicap International",         email: "hi@handicap.rw",            badge: "REAL",  phone: "—", loc: "KG 11 Ave, Kigali" },
  { name: "UNHCR Rwanda",                   email: "rwa@unhcr.org",             badge: "REAL",  phone: "—", loc: "Boulevard de la Révolution" },
];

const PIPELINE_COLS = [
  {
    label: "Scraped", hint: "Run research to enrich context",
    stageBg: "bg-slate-100", stageText: "text-slate-700",
    cards: [
      { name: "Aspire Rwanda NGO",          tag: "NGO",         email: "aspirerwanda@gmail.com" },
      { name: "Never Again Rwanda",          tag: "NGO",         email: "info@neveragainrwanda.org" },
      { name: "CARE International",         tag: "INGO",        email: "care@carerwanda.org" },
      { name: "ActionAid Rwanda",           tag: "NGO",         email: "info@actionaid.rw" },
      { name: "Imbuto Foundation",          tag: "Foundation",  email: "contact@imbuto.rw" },
    ],
  },
  {
    label: "Researched", hint: "Generate a personalised email",
    stageBg: "bg-blue-50", stageText: "text-blue-700",
    cards: [
      { name: "Rwanda Red Cross",           tag: "NGO",         email: "info@redcross.rw" },
      { name: "Handicap International",     tag: "INGO",        email: "hi@handicap.rw" },
      { name: "Save the Children",          tag: "INGO",        email: "rwanda@savechildren.org" },
    ],
  },
  {
    label: "Needs Review", hint: "Batch approve before sending",
    stageBg: "bg-amber-50", stageText: "text-amber-800",
    cards: [
      { name: "UNHCR Rwanda",               tag: "UN Agency",   email: "rwa@unhcr.org" },
      { name: "Rwanda NGO Forum",           tag: "NGO",         email: "info@rwandangoforum.rw" },
      { name: "Africa Humanitarian Aid",    tag: "NGO",         email: "aha@africa.rw" },
    ],
  },
  {
    label: "Sent", hint: "Email delivered — awaiting reply",
    stageBg: "bg-green-50", stageText: "text-green-700",
    cards: [
      { name: "Oxfam Rwanda",               tag: "INGO",        email: "oxfam@rwanda.org" },
      { name: "World Vision Rwanda",        tag: "INGO",        email: "wv@worldvision.rw" },
    ],
  },
];

const CAMPAIGNS = [
  { name: "Kigali NGOs Q4",          sent: 142, opened: 89,  replied: 23, status: "active" },
  { name: "Rwanda Health Sector",    sent: 78,  opened: 41,  replied: 11, status: "active" },
  { name: "East Africa INGOs",       sent: 55,  opened: 20,  replied: 4,  status: "paused" },
  { name: "Education Partners",      sent: 94,  opened: 61,  replied: 18, status: "active" },
  { name: "Agricultural NGOs",       sent: 38,  opened: 14,  replied: 3,  status: "active" },
  { name: "Women Empowerment RW",    sent: 67,  opened: 29,  replied: 7,  status: "paused" },
];

const EMAIL_BODY = `Hi Jean,

I noticed Never Again Rwanda has been expanding its conflict prevention programs — impressive work in the region.

We help NGOs like yours reach partner organisations and donors through targeted cold outreach, cutting outreach time by 60%.

Worth a 15-minute call this week?

Best,
Alex`;

const NAV = [
  { id: "scraper"      as Tab, icon: Radio,    label: "Scraper",      group: "Outreach" },
  { id: "pipeline"     as Tab, icon: Workflow,  label: "Pipeline",     group: "Outreach" },
  { id: "email-writer" as Tab, icon: Mail,      label: "Email Writer", group: "Outreach" },
  { id: "campaigns"    as Tab, icon: Megaphone, label: "Campaigns",    group: "Outreach" },
  { id: null,                  icon: Send,      label: "Follow-Up",    group: "Outreach" },
  { id: null,                  icon: Layout,    label: "CRM",          group: "Management" },
  { id: null,                  icon: Puzzle,    label: "Skills",       group: "Management" },
  { id: null,                  icon: Server,    label: "SMTP Manager", group: "Settings" },
  { id: null,                  icon: Settings,  label: "AI Settings",  group: "Settings" },
];

const TAB_ORDER: Tab[] = ["scraper", "pipeline", "email-writer", "campaigns"];
const TAB_LABELS: Record<Tab, string> = {
  scraper: "Email Scraper",
  pipeline: "Outreach Pipeline",
  "email-writer": "AI Email Writer",
  campaigns: "Campaigns",
};
const TAB_DESCS: Record<Tab, string> = {
  scraper: "Find and scrape leads by niche & location",
  pipeline: "Research, draft, and send leads through each stage",
  "email-writer": "Generate personalized cold outreach emails",
  campaigns: "Create and manage email campaigns",
};

// ── Scraper ────────────────────────────────────────────────────────────────
function ScraperView({ visible }: { visible: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) { setVisibleRows(0); setProgress(0); return; }
    setVisibleRows(0); setProgress(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setVisibleRows(i);
      setProgress(Math.round((i / LEADS.length) * 100));
      if (i >= LEADS.length) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, [visible]);

  const real  = LEADS.slice(0, visibleRows).filter(l => l.badge === "REAL").length;
  const guess = LEADS.slice(0, visibleRows).filter(l => l.badge === "GUESS").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Web Scraper / CSV Import tabs */}
      <div className="flex gap-1 px-4 pt-3 border-b border-gray-200">
        <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold bg-[#0084FF] text-white rounded-t-lg">
          <Radio size={11} /> Web Scraper
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-gray-500">
          <Upload size={11} /> CSV Import
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-hidden">
        {/* Lead Scraper header */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={13} className="text-blue-700" />
            <span className="text-[11px] font-semibold text-gray-900">Lead Scraper</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[9px] text-gray-400 flex items-center gap-1"><MapPin size={8} /> Puppeteer Maps</span>
              <span className="text-[9px] text-[#0084FF] font-medium flex items-center gap-1"><Settings size={8} /> AI Settings</span>
            </div>
          </div>

          {/* Inputs */}
          <div className="flex gap-2 mb-2">
            <div className="flex-1 flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg">
              <Search size={9} className="text-gray-400 flex-shrink-0" />
              <span className="text-[10px] text-gray-800">NGO</span>
            </div>
            <div className="flex-1 flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg">
              <MapPin size={9} className="text-gray-400 flex-shrink-0" />
              <span className="text-[10px] text-gray-800">kigali</span>
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-500 border border-gray-200 px-2 py-1 rounded-lg">
              <Plus size={9} /> Add search
            </div>
            <div className="flex items-center gap-1 border border-gray-200 px-2 py-1 rounded-lg text-[10px] text-gray-600">
              100 leads <ChevronDown size={9} />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0084FF] text-white text-[10px] font-semibold rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-ping inline-block" />
              Scraping…
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0084FF] text-white text-[10px] font-semibold rounded-lg">
              Scrape + AI Emails
            </div>
          </div>

          {/* Status line */}
          {visibleRows > 0 && (
            <p className="text-[9px] text-gray-500 mt-2 flex items-center gap-1">
              <RefreshCw size={8} className="animate-spin text-[#0084FF]" />
              Found {visibleRows} unique leads so far — still scraping…
            </p>
          )}
        </div>

        {/* Progress card */}
        {visibleRows > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-700">Scrape Progress</span>
              <span className="text-[9px] text-gray-400">{progress}% complete</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-[#0084FF] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "SCRAPED",   val: visibleRows, color: "text-[#0084FF]" },
                { label: "ROUND",     val: "1/1",       color: "text-gray-900" },
                { label: "FAILED",    val: 0,           color: "text-gray-900" },
                { label: "REMAINING",val: Math.max(0, LEADS.length - visibleRows), color: "text-orange-500" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-[13px] font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-[8px] text-gray-400 tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results table */}
        {visibleRows > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
            {/* Table header bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-700">
                {visibleRows} leads found so far…
                <span className="ml-2 text-green-600 font-semibold">✓ {real} verified</span>
                {guess > 0 && <span className="ml-1.5 text-amber-600 font-semibold">· {guess} guessed</span>}
              </span>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 border border-gray-200 rounded text-[9px] text-gray-600">Export CSV</div>
                <div className="px-2 py-1 bg-[#0084FF] text-white rounded text-[9px] font-semibold">
                  + Add All to CRM ({visibleRows})
                </div>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-4 px-4 py-1.5 bg-gray-50 border-b border-gray-100">
              {["COMPANY", "EMAIL", "PHONE", "LOCATION"].map(h => (
                <span key={h} className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-hidden">
              {LEADS.slice(0, visibleRows).map((row, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-4 px-4 py-2 border-b border-gray-50 items-center ${i < visibleRows ? "opacity-100" : "opacity-0"}`}
                  style={{ transition: "opacity 0.3s" }}
                >
                  <span className="text-[10px] font-medium text-gray-800 truncate pr-2">{row.name}</span>
                  <div className="flex items-center gap-1.5 pr-2">
                    <span className="text-[9px] text-[#0084FF] truncate">{row.email}</span>
                    <span className={`text-[7px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                      row.badge === "REAL"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {row.badge === "REAL" ? "✓ REAL" : "~ GUESS"}
                    </span>
                  </div>
                  <span className="text-[9px] text-gray-400">{row.phone}</span>
                  <span className="text-[9px] text-gray-500 truncate">{row.loc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline ───────────────────────────────────────────────────────────────
function PipelineView({ visible }: { visible: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) { setShown(false); return; }
    const t = setTimeout(() => setShown(true), 80);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center gap-6 px-5 py-2.5 border-b border-gray-200 bg-white">
        {[
          { label: "In pipeline", val: 14 },
          { label: "Scraped", val: 5 },
          { label: "Researched", val: 3 },
          { label: "Drafted", val: 3 },
          { label: "Sent", val: 2 },
          { label: "Failed", val: 1 },
        ].map(s => (
          <div key={s.label}>
            <p className="text-[8px] text-gray-400 leading-none">{s.label}</p>
            <p className="text-[12px] font-bold text-gray-900">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex gap-3 p-3 flex-1 overflow-hidden bg-gray-50">
        {PIPELINE_COLS.map((col, ci) => (
          <div
            key={col.label}
            style={{ transition: `opacity 0.35s ${ci * 90}ms, transform 0.35s ${ci * 90}ms` }}
            className={`flex-1 flex flex-col min-w-0 ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            <div className="mb-2 px-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-700">{col.label}</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">{col.cards.length}</span>
              </div>
              <p className="text-[8px] text-gray-400 mt-0.5">{col.hint}</p>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 rounded-lg p-1.5 bg-gray-100 border-2 border-dashed border-transparent overflow-hidden">
              {col.cards.map((card, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-100 px-2.5 py-2 rounded-lg shadow-sm"
                  style={{
                    transition: `opacity 0.25s ${ci * 90 + i * 60}ms`,
                    opacity: shown ? 1 : 0,
                  }}
                >
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <p className="text-[9px] font-semibold text-gray-800 truncate leading-tight">{card.name}</p>
                    <span className={`text-[7px] font-semibold px-1 py-0.5 rounded border flex-shrink-0 ${col.stageBg} ${col.stageText}`}>
                      {col.label}
                    </span>
                  </div>
                  <p className="text-[8px] text-gray-400">{card.tag}</p>
                  <p className="text-[8px] text-[#0084FF] truncate mt-0.5">{card.email}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Email Writer ───────────────────────────────────────────────────────────
function EmailWriterView({ visible }: { visible: boolean }) {
  const [chars, setChars] = useState(0);
  const full = EMAIL_BODY;
  useEffect(() => {
    if (!visible) { setChars(0); return; }
    setChars(0);
    let i = 0;
    const t = setInterval(() => { i += 4; setChars(i); if (i >= full.length) clearInterval(t); }, 18);
    return () => clearInterval(t);
  }, [visible]);
  const displayed = full.slice(0, chars);

  return (
    <div className="flex gap-3 p-4 flex-1 overflow-hidden">
      {/* Left — lead list */}
      <div className="w-36 flex-shrink-0 flex flex-col gap-1.5 overflow-hidden">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Selected leads</p>
        {[
          { name: "Never Again Rwanda",     sub: "NGO · Kigali",          active: true },
          { name: "Aspire Rwanda NGO",      sub: "NGO · Kigali",          active: false },
          { name: "Save the Children",      sub: "INGO · Kigali",         active: false },
          { name: "CARE International",     sub: "INGO · Kigali",         active: false },
          { name: "ActionAid Rwanda",       sub: "NGO · Kigali",          active: false },
          { name: "Imbuto Foundation",      sub: "Foundation · Kigali",   active: false },
          { name: "Rwanda Red Cross",       sub: "NGO · Kigali",          active: false },
        ].map((lead, i) => (
          <div
            key={i}
            className={`px-2.5 py-1.5 flex flex-col gap-0.5 rounded-lg ${lead.active ? "bg-[#0084FF]" : "bg-white border border-gray-100"}`}
          >
            <p className={`text-[9px] font-semibold truncate ${lead.active ? "text-white" : "text-gray-800"}`}>{lead.name}</p>
            <p className={`text-[8px] truncate ${lead.active ? "text-blue-100" : "text-gray-400"}`}>{lead.sub}</p>
          </div>
        ))}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#0084FF] animate-pulse" />
          <span className="text-[9px] text-gray-400">AI writing…</span>
        </div>
      </div>

      {/* Right — email output */}
      <div className="flex-1 bg-white border border-gray-100 p-3 flex flex-col overflow-hidden rounded-lg">
        {/* Tone pills */}
        <div className="flex gap-2 mb-3">
          {[
            { label: "Direct", active: true },
            { label: "Aggressive", active: false },
            { label: "Surgical", active: false },
          ].map(t => (
            <div
              key={t.label}
              className={`px-2.5 py-1 text-[9px] font-semibold rounded-lg border-2 ${
                t.active ? "bg-[#0084FF] text-white border-transparent" : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-2">
          <span className="text-[9px] text-gray-400">To:</span>
          <span className="text-[9px] font-medium text-gray-700">info@neveragainrwanda.org</span>
        </div>
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-3">
          <span className="text-[9px] text-gray-400">Sub:</span>
          <span className="text-[9px] font-medium text-gray-700">Quick idea for Never Again Rwanda</span>
        </div>
        <pre className="text-[10px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans flex-1 overflow-hidden">
          {displayed}
          {chars < full.length && (
            <span className="inline-block w-0.5 h-3 bg-[#0084FF] ml-px align-middle animate-pulse" />
          )}
        </pre>
        {chars >= full.length && (
          <div className="flex justify-end mt-2">
            <div className="px-3 py-1.5 bg-[#0084FF] text-white text-[10px] font-semibold flex items-center gap-1 rounded-lg">
              <CheckCircle2 size={9} /> Send Email
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaigns ──────────────────────────────────────────────────────────────
function CampaignsView({ visible }: { visible: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) { setShown(false); return; }
    const t = setTimeout(() => setShown(true), 80);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="flex flex-col gap-3 p-4 flex-1 overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-700">Active campaigns</p>
        <div className="px-3 py-1 bg-[#0084FF] text-white text-[9px] font-semibold rounded-lg">+ New Campaign</div>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {CAMPAIGNS.map((c, i) => (
          <div
            key={c.name}
            style={{ transition: `opacity 0.3s ${i * 80}ms, transform 0.3s ${i * 80}ms` }}
            className={`bg-white border border-gray-100 px-4 py-2.5 rounded-lg ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-800">{c.name}</span>
              <span
                className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: c.status === "active" ? "#dcfce7" : "#fef3c7",
                  color: c.status === "active" ? "#166534" : "#92400e",
                }}
              >
                {c.status}
              </span>
            </div>
            <div className="flex gap-4 items-center">
              {[
                { label: "Sent",    val: c.sent,    color: "#111827" },
                { label: "Opened",  val: c.opened,  color: "#0084FF" },
                { label: "Replied", val: c.replied, color: "#16a34a" },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col">
                  <span className="text-[11px] font-bold" style={{ color: stat.color }}>{stat.val}</span>
                  <span className="text-[8px] text-gray-400">{stat.label}</span>
                </div>
              ))}
              <div className="flex-1 flex items-end gap-0.5 h-5 ml-2">
                <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: `${(c.sent / 160) * 100}%` }} />
                <div className="flex-1 rounded-sm" style={{ height: `${(c.opened / 160) * 100}%`, backgroundColor: "#0084FF" }} />
                <div className="flex-1 rounded-sm" style={{ height: `${(c.replied / 160) * 100}%`, backgroundColor: "#16a34a" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main shell ─────────────────────────────────────────────────────────────
export default function DashboardPreview() {
  const [active, setActive] = useState<Tab>("scraper");
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const durations: Record<Tab, number> = {
      scraper: 4500,
      pipeline: 3200,
      "email-writer": 5500,
      campaigns: 3000,
    };
    const t = setTimeout(() => {
      const idx = TAB_ORDER.indexOf(active);
      const next = TAB_ORDER[(idx + 1) % TAB_ORDER.length];
      setAnimating(true);
      setTimeout(() => { setActive(next); setAnimating(false); }, 220);
    }, durations[active]);
    return () => clearTimeout(t);
  }, [active]);

  const switchTab = (t: Tab) => {
    setAnimating(true);
    setTimeout(() => { setActive(t); setAnimating(false); }, 220);
  };

  const ActiveIcon = NAV.find(n => n.id === active)?.icon ?? Radio;
  const groups = ["Outreach", "Management", "Settings"];

  return (
    <div
      className="overflow-hidden bg-white"
      style={{ borderRadius: 4, boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.08), 0 32px 64px -12px rgba(0,0,0,0.10)" }}
    >
      <div className="flex h-[600px]">

        {/* ── Sidebar ── */}
        <div className="w-[200px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {/* Logo */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-200">
            <Image src="/pryro-logo.png" alt="Pryro" width={48} height={16} className="h-4 w-auto" />
            <span className="text-[11px] font-semibold text-gray-500 tracking-wide">coldmail</span>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-4 p-3 flex-1 mt-1 overflow-y-auto">
            {groups.map(group => (
              <div key={group}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5">{group}</p>
                <div className="flex flex-col gap-0.5">
                  {NAV.filter(n => n.group === group).map(({ id, icon: Icon, label }) => {
                    const isActive = id === active;
                    return (
                      <div
                        key={label}
                        onClick={() => { if (id) switchTab(id as Tab); }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                          isActive
                            ? "bg-[#0084FF] text-white shadow-sm cursor-pointer"
                            : id
                            ? "text-gray-600 hover:bg-gray-100 cursor-pointer"
                            : "text-gray-400"
                        }`}
                      >
                        <Icon size={15} className="flex-shrink-0" />
                        <span className="text-[13px] font-medium">{label}</span>
                        {label === "Pipeline" && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold">15</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom — AI Settings */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600">
              <Settings size={15} className="flex-shrink-0" />
              <span className="text-[13px] font-medium">AI Settings</span>
            </div>
          </div>
        </div>

        {/* ── Main panel ── */}
        <div className={`flex-1 bg-white flex flex-col overflow-hidden transition-opacity duration-200 ${animating ? "opacity-0" : "opacity-100"}`}>

          {/* Topbar */}
          <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-sm font-bold text-gray-900">{TAB_LABELS[active]}</h1>
                <p className="text-[10px] text-gray-500">{TAB_DESCS[active]}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* LIVE badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500 border border-green-600">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-wide">LIVE</span>
              </div>
              {/* Bell */}
              <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center">
                <Bell size={12} className="text-gray-500" />
              </div>
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-[#0084FF] flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">N</span>
              </div>
            </div>
          </header>

          {active === "scraper"      && <ScraperView     visible={active === "scraper"      && !animating} />}
          {active === "pipeline"     && <PipelineView    visible={active === "pipeline"     && !animating} />}
          {active === "email-writer" && <EmailWriterView visible={active === "email-writer" && !animating} />}
          {active === "campaigns"    && <CampaignsView   visible={active === "campaigns"    && !animating} />}
        </div>
      </div>
    </div>
  );
}
