import { NextRequest } from "next/server";
import { createClient } from "../../../../supabase/server";
import { createServiceClient } from "../../../../supabase/service";
import { scrapeWithoutAPI } from "@/utils/puppeteer-scraper";
import { insertScrapedLeadsToCrm } from "@/utils/scrape-lead-crm";
import { loadAIProviderForUser } from "@/utils/load-ai-provider-server";
import type { ScrapedLead } from "@/types/platform";
import type { AIProviderConfig } from "@/utils/ai-scraper-helper";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { niche, location, maxResults } = (await request.json().catch(() => ({}))) as {
    niche?: string;
    location?: string;
    maxResults?: number;
  };

  if (!niche?.trim()) {
    return new Response(JSON.stringify({ error: "Niche is required" }), { status: 400 });
  }

  const cappedMax = Math.max(1, Math.min(Number(maxResults ?? 100), 500));
  const nicheClean = niche.trim();
  const locationClean = location?.trim() ?? "";

  const service = createServiceClient();
  const aiProvider = await loadAIProviderForUser(service, user.id) as AIProviderConfig | null;

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

      const liveLeads: ScrapedLead[] = [];
      let found = 0;

      try {
        await scrapeWithoutAPI(
          nicheClean,
          locationClean,
          cappedMax,
          (lead: ScrapedLead) => {
            // Stream each lead as it arrives
            liveLeads.push(lead);
            found++;
            send("lead", { lead });
            send("progress", {
              totalFound: found,
              totalFailed: 0,
              remaining: Math.max(0, cappedMax - found),
              currentChunk: 1,
              totalChunks: 1,
              percentComplete: Math.min(99, Math.round((found / cappedMax) * 100)),
            });
          },
          aiProvider ?? null,
          { round: 1 }
        );

        // Save all scraped leads to CRM
        let crmAdded = 0;
        let callListAdded = 0;
        let crmDuplicates = 0;
        let realEmails = 0;

        if (liveLeads.length > 0) {
          try {
            const result = await insertScrapedLeadsToCrm(service, user.id, liveLeads, {
              searchLocation: locationClean,
              niche: nicheClean,
              autoResearch: false,
            });
            crmAdded = result.added;
            callListAdded = result.callListAdded;
            crmDuplicates = result.duplicates;
            realEmails = liveLeads.filter((l) => l.emailIsReal).length;
          } catch (crmErr) {
            console.error("[scrape-stream] CRM insert error:", crmErr);
          }
        }

        const withEmail = liveLeads.filter((l) => !l.phoneOnly && l.email).length;
        const phoneOnly = liveLeads.filter((l) => l.phoneOnly).length;

        send("done", {
          total: withEmail,
          target: cappedMax,
          totalFailed: 0,
          crmAdded,
          crmCallListAdded: callListAdded,
          crmDuplicates,
          phoneOnlyFound: phoneOnly,
          realEmails,
          exhausted: found < cappedMax,
          scrapeSummary: {
            withEmail,
            phoneOnly,
            crmAdded,
            callListAdded,
            researched: 0,
            realEmails,
          },
          chunksCompleted: 1,
        });
      } catch (err) {
        console.error("[scrape-stream] scrape error:", err);
        send("error", {
          message: err instanceof Error ? err.message : "Scraping failed",
        });
      }

      try {
        controller.close();
      } catch {
        /* already closed */
      }
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
