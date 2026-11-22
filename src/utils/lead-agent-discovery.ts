import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchBingHtml,
  parseBingHits,
  fetchDdgHtml,
  parseDdgHits,
  buildBingQueries,
  buildDdgQueries,
  type SearchHit,
} from "@/utils/search-engine-fetch";
import { enqueueAutomationJob } from "@/utils/automation-queue";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function extractEmail(text: string): string | null {
  return (
    text
      .match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0]
      ?.toLowerCase() ?? null
  );
}

function extractPhone(text: string): string | null {
  return (
    text
      .match(/(?:\+?\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){2,5}\d{2,4}/)?.[0]
      ?.replace(/\s+/g, " ")
      .trim() ?? null
  );
}

function titleToCompany(title: string): string {
  return cleanText(
    title
      .replace(/\s[-|–].*$/g, "")
      .replace(/\b(official website|contact|home|homepage|facebook|linkedin)\b/gi, "")
      .replace(/\s+/g, " ")
  ).slice(0, 140);
}

function discoveryQueries(niche: string, location: string): string[] {
  // Use the same query builders as puppeteer-scraper (Bing + DDG aware)
  const bing = buildBingQueries(niche, location);
  const ddg = buildDdgQueries(niche, location);
  // Merge deduplicated
  return Array.from(new Set([...bing, ...ddg]));
}

async function searchWeb(query: string, location: string): Promise<SearchHit[]> {
  // Try Bing first (most reliable without API key)
  try {
    const { html, via } = await fetchBingHtml(query, location);
    const hits = parseBingHits(html, 10);
    if (hits.length > 0) {
      console.log(`[lead-agent] bing: "${query}" -> ${hits.length} hit(s) via ${via}`);
      return hits;
    }
  } catch (err) {
    console.warn(`[lead-agent] bing failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fall back to DDG
  try {
    const result = await fetchDdgHtml(query);
    if (!result.blocked) {
      const hits = parseDdgHits(result.html, result.via);
      console.log(`[lead-agent] ddg: "${query}" -> ${hits.length} hit(s) via ${result.via}`);
      return hits;
    }
  } catch (err) {
    console.warn(`[lead-agent] ddg failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return [];
}

export async function runAgentDiscovery(
  supabase: SupabaseClient,
  userId: string,
  input: {
    niche: string;
    location?: string | null;
    maxResults?: number | null;
    generateDrafts?: boolean;
  }
): Promise<{ inserted: number; duplicates: number; researchJobs: number; leadIds: string[] }> {
  const niche = cleanText(input.niche);
  const location = cleanText(input.location ?? "");
  const maxResults = Math.max(1, Math.min(Number(input.maxResults ?? 25), 100));
  const seen = new Set<string>();
  const candidates: Array<{
    company_name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    company_context: string;
  }> = [];

  console.log(`[lead-agent] discover start: ${niche}${location ? ` in ${location}` : ""}`);
  for (const query of discoveryQueries(niche, location)) {
    console.log(`[lead-agent] discover searchWeb: ${query}`);
    const hits = await searchWeb(query, location);
    for (const hit of hits) {
      if (candidates.length >= maxResults) break;
      const company = titleToCompany(hit.title);
      if (!company || company.length < 3) continue;
      const host = hostFromUrl(hit.url);
      const key = `${company.toLowerCase()}|${host ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        company_name: company,
        email: extractEmail(`${hit.title} ${hit.snippet}`),
        phone: extractPhone(`${hit.title} ${hit.snippet}`),
        website: hit.url,
        company_context: `Discovery evidence: ${hit.title}. ${hit.snippet}`.slice(0, 900),
      });
    }
    if (candidates.length >= maxResults) break;
  }

  let inserted = 0;
  let duplicates = 0;
  const leadIds: string[] = [];
  for (const candidate of candidates) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .ilike("company_name", candidate.company_name)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      duplicates++;
      leadIds.push(existing.id as string);
      continue;
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        company_name: candidate.company_name,
        email: candidate.email,
        phone: candidate.phone,
        website: candidate.website,
        niche,
        location: location || null,
        company_context: candidate.company_context,
        status: "new",
        pipeline_stage: "scraped",
        pipeline_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    inserted++;
    leadIds.push(data.id as string);
  }

  for (const leadId of leadIds) {
    await enqueueAutomationJob(supabase, userId, "research_lead", { leadId });
    if (input.generateDrafts) {
      await enqueueAutomationJob(supabase, userId, "generate_draft", { leadId }, new Date(Date.now() + 30_000));
    }
  }

  console.log(
    `[lead-agent] discover done: ${inserted} inserted, ${duplicates} duplicate(s), ${leadIds.length} research job(s)`
  );
  return { inserted, duplicates, researchJobs: leadIds.length, leadIds };
}
