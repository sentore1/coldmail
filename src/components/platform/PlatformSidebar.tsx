"use client";

import { ActiveModule } from "@/types/platform";
import { Radio, Mail, Settings, Layout, Server, Send, Megaphone, Workflow, Puzzle } from "lucide-react";
import Image from "next/image";

interface SidebarProps {
  activeModule: ActiveModule;
  onModuleChange: (module: ActiveModule) => void;
  /** Leads needing Research / Generate / Send */
  pipelineActionCount?: number;
}

function buildNavGroups(pipelineActionCount: number) {
  const pipelineBadge =
    pipelineActionCount > 0 ? String(pipelineActionCount) : null;

  return [
    {
      label: "Outreach",
      items: [
        { id: "scraper" as ActiveModule, label: "Scraper", icon: Radio, badge: null },
        {
          id: "pipeline" as ActiveModule,
          label: "Pipeline",
          icon: Workflow,
          badge: pipelineBadge,
        },
        {
          id: "email-writer" as ActiveModule,
          label: "Email Writer",
          icon: Mail,
          badge: null,
        },
        {
          id: "campaigns" as ActiveModule,
          label: "Campaigns",
          icon: Megaphone,
          badge: null,
        },
        { id: "follow-up" as ActiveModule, label: "Follow-Up", icon: Send, badge: null },
      ],
    },
    {
      label: "Management",
      items: [
        { id: "crm" as ActiveModule, label: "CRM", icon: Layout, badge: null },
        { id: "skills" as ActiveModule, label: "Skills", icon: Puzzle, badge: null },
      ],
    },
    {
      label: "Settings",
      items: [
        {
          id: "smtp-manager" as ActiveModule,
          label: "SMTP Manager",
          icon: Server,
          badge: null,
        },
      ],
    },
  ];
}

export default function PlatformSidebar({
  activeModule,
  onModuleChange,
  pipelineActionCount = 0,
}: SidebarProps) {
  const navGroups = buildNavGroups(pipelineActionCount);
  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col bg-white border-r border-gray-200 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <Image
          src="/pryro-logo.png"
          alt="Pryro Mail"
          width={110}
          height={32}
          priority
          className="h-8 w-auto"
        />
        <span className="text-sm font-semibold text-gray-700 leading-none">coldmail</span>
      </div>

      {/* Nav Groups */}
      <nav className="flex flex-col gap-4 p-3 flex-1 mt-1 overflow-y-auto">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onModuleChange(item.id)}
                    className={`
                      flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 w-full text-left
                      ${isActive
                        ? "text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }
                    `}
                    style={isActive ? { backgroundColor: "#0084FF" } : undefined}
                  >
                    <Icon size={15} className="flex-shrink-0" />
                    <span className="text-[13px] font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-gray-200 flex flex-col gap-1.5">
        {/* AI Settings */}
        <button
          onClick={() => onModuleChange("ai-settings")}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 w-full text-left ${
            activeModule === "ai-settings" ? "text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
          style={activeModule === "ai-settings" ? { backgroundColor: "#0084FF" } : undefined}
        >
          <Settings size={15} className="flex-shrink-0" />
          <span className="text-[13px] font-medium">AI Settings</span>
        </button>
      </div>
    </aside>
  );
}
