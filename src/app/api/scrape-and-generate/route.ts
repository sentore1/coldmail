import { NextRequest } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";
import { scrapeWithoutAPI } from "@/utils/puppeteer-scraper";
import { insertScrapedLeadsToCrm } from "@/utils/scrape-lead-crm";
import { loadAIProviderForUser } from "@/utils/load-ai-provider-server";
import { getPryroProfile, formatPryroOfferForPrompt } from "@/utils/pryro-website-profile";
import { resolveGenerationModel } from "@/utils/email-prompts";
import type { ScrapedLead } from "@/types/platform";
import type { AIProviderConfig } from "@/utils/ai-scraper-helper";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Minimal AI call (mirrors callPipelineAI in lead-email-generation.ts) ─────
async function callAI(
  provider: AIProviderConfig,
  systemMessage: string,
  userPrompt: string
): Promise<string> {
  const model = resolveGenerationModel(provider.provider, provider.active_model);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = "";
  let reqBody: object;

  if (provider.provider === "openai" || provider.provider === "groq") {
    url =
      provider.provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
    headers.Authorization = `Bearer ${provider.api_key}`;
    reqBody = {
      model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 600,
    };
  } else if (provider.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = provider.api_key;
    headers["anthropic-version"] = "2023-06-01";
    reqBody = {
      model: provider.active_model || "claude-3-5-haiku-20241022",
      max_tokens: 600,
      system: systemMessage,
      messages: [{ role: "user", content: userPrompt }],
    };
  } else if (provider.provider === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.api_key}`;
    reqBody = {
      contents: [{ parts: [{ text: `${systemMessage}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
    };
  } else {
    url = "https://api.mistral.ai/v1/chat/completions";
    headers.Authorization = `Bearer ${provider.api_key}`;
    reqBody = {
      model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 600,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(45_000),
  });

  if (res.status === 429) {
    // Brief back-off, single retry
    await new Promise((r) => setTimeout(r, 5_000));
    return callAI(provider, systemMessage, userPrompt);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (provider.provider === "anthropic") return data.content[0].text as string;
  if (provider.provider === "gemini") return data.candidates[0].content.parts[0].text as string;
  return data.choices[0].message.content as string;
}

function parseEmailOutput(raw: string): { subject: string; body: string } {
  const subjectMatch =
    raw.match(/Subject:\s*(.+)/i) ??
    raw.match(/"subject"\s*:\s*"([^"]+)"/i);
  const bodyMatch =
    raw.match(/Body:\s*([\s\S]+)/i) ??
    raw.match(/"body"\s*:\s*"([\s\S]+?)(?:"\s*}|"\s*,\s*")/i);

  const subject = subjectMatch?.[1]?.trim() ?? "Quick question";
  const body = bodyMatch?.[1]?.replace(/\\n/g, "\n").trim() ?? raw.trim();
  return { subject, body };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { niche, location, maxResults, tone } = (await request.json().catch(() => ({}))) as {
    niche?: string;
    location?: string;
    maxResults?: number;
    tone?: string;
  };

  if (!niche?.trim()) {
    return new Response(JSON.stringify({ error: "Niche is required" }), { status: 400 });
  }

  const cappedMax = Math.max(1, Math.min(Number(maxResults ?? 25), 100));
  const nicheClean = niche.trim();
  const locationClean = location?.trim() ?? "";

  const service = createServiceClient();
  const aiProvider = await loadAIProviderForUser(service, user.id) as AIProviderConfig | null;
  const pryroProfile = await getPryroProfile().catch(() => null);
  const offerBlock = pryroProfile ? formatPryroOfferForPrompt(pryroProfile) : "Business software for operations.";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* client disconnected */
        }
      };

      send("start", {
        niche: nicheClean,
        location: locationClean,
        maxResults: cappedMax,
        mode: "live",
      });

      // ── Phase 1: Scrape ────────────────────────────────────────────────────
      const liveLeads: ScrapedLead[] = [];
      let found = 0;

      try {
        await scrapeWithoutAPI(
          nicheClean,
          locationClean,
          cappedMax,
          (lead: ScrapedLead) => {
            liveLeads.push(lead);
            found++;
            send("lead", { lead });
            send("progress", {
              phase: "scraping",
              totalFound: found,
              totalFailed: 0,
              remaining: Math.max(0, cappedMax - found),
              percentComplete: Math.min(49, Math.round((found / cappedMax) * 50)),
            });
          },
          aiProvider ?? null,
          { round: 1 }
        );
      } catch (err) {
        console.error("[scrape-and-generate] scrape error:", err);
        send("error", { message: err instanceof Error ? err.message : "Scraping failed" });
        try { controller.close(); } catch { /* ok */ }
        return;
      }

      send("scrape_done", {
        total: liveLeads.filter((l) => !l.phoneOnly && l.email).length,
        phoneOnly: liveLeads.filter((l) => l.phoneOnly).length,
      });

      // Save to CRM
      let insertedLeadIds: string[] = [];
      let crmAdded = 0;
      let callListAdded = 0;

      if (liveLeads.length > 0) {
        try {
          const result = await insertScrapedLeadsToCrm(service, user.id, liveLeads, {
            searchLocation: locationClean,
            niche: nicheClean,
            autoResearch: false,
          });
          crmAdded = result.added;
          callListAdded = result.callListAdded;
          insertedLeadIds = result.insertedLeadIds;
        } catch (err) {
          console.error("[scrape-and-generate] CRM insert error:", err);
        }
      }

      // ── Phase 2: Generate emails ────────────────────────────────────────────
      let emailCount = 0;
      let failCount = 0;

      if (!aiProvider?.api_key) {
        send("progress", {
          phase: "generating",
          message: "No AI provider configured — emails skipped. Set up AI in Settings.",
          emailCount: 0,
          failCount: 0,
        });
      } else {
        // Map insertedLeadIds back to lead context
        const emailLeads = liveLeads
          .filter((l) => !l.phoneOnly && l.email?.trim())
          .slice(0, insertedLeadIds.length > 0 ? insertedLeadIds.length : cappedMax);

        // Fetch inserted lead IDs from DB to pair for draft saving
        const { data: dbLeads } = insertedLeadIds.length > 0
          ? await service
              .from("leads")
              .select("id, email, company_name")
              .in("id", insertedLeadIds)
          : { data: [] };

        const dbLeadByEmail = new Map(
          (dbLeads ?? []).map((l: { id: string; email: string | null; company_name: string }) => [l.email?.toLowerCase(), l])
        );

        const systemMsg = `You are a B2B cold email copywriter. Write short, direct cold emails (80–120 words). No greetings, no fluff. Output only:
Subject: <subject>
Body: <body>`;

        for (const lead of emailLeads) {
          const dbLead = dbLeadByEmail.get(lead.email?.toLowerCase() ?? "");

          const userPrompt = `Write a cold email for:
Company: ${lead.company_name}
Niche: ${lead.niche || nicheClean}
Location: ${lead.location || locationClean}
Context: ${(lead.company_context ?? "").slice(0, 300)}

Sender offer:
${offerBlock}

Tone: ${tone ?? "Direct"}`;

          try {
            const raw = await callAI(aiProvider, systemMsg, userPrompt);
            const { subject, body } = parseEmailOutput(raw);
            emailCount++;

            // Save draft to DB if we have the lead id
            if (dbLead?.id) {
              await service.from("generated_emails").insert({
                user_id: user.id,
                lead_id: dbLead.id,
                subject,
                body,
                tone: tone ?? "Direct",
                model_used: aiProvider.provider,
              });
            }

            send("email", {
              email: { lead_email: lead.email, company_name: lead.company_name, subject, body },
              count: emailCount,
            });
            send("progress", {
              phase: "generating",
              emailCount,
              failCount,
            });
          } catch (err) {
            failCount++;
            console.error("[scrape-and-generate] email gen error:", err);
          }
        }
      }

      send("done", {
        scraped: liveLeads.filter((l) => !l.phoneOnly).length,
        emails: emailCount,
        generated: emailCount,
        crmAdded,
        callListAdded,
        message: `${crmAdded} leads saved, ${emailCount} emails generated`,
      });

      try { controller.close(); } catch { /* ok */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
