import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../supabase/server";
import { createServiceClient } from "../../../../../supabase/service";
import { loadAIProviderForUser } from "@/utils/load-ai-provider-server";
import { resolveGenerationModel } from "@/utils/email-prompts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { replyBody, replySubject, leadName, leadNiche, fromEmail } = await request.json();

    if (!replyBody) {
      return NextResponse.json({ success: false, error: "Reply body is required" }, { status: 400 });
    }

    // Load this user's active AI provider (service client so RLS is bypassed).
    const service = createServiceClient();
    const aiProvider = await loadAIProviderForUser(service, user.id);

    if (!aiProvider?.api_key) {
      return NextResponse.json({
        success: false,
        error: "No AI provider configured. Go to Settings → AI Settings and add your API key.",
      }, { status: 400 });
    }

    const { provider, api_key: apiKey, active_model } = aiProvider;
    const model = resolveGenerationModel(provider, active_model);

    // Build the prompt
    const prompt = `You are an AI assistant helping to write a professional email reply.

Original email from ${fromEmail} (${leadName}${leadNiche ? `, ${leadNiche}` : ""}):
Subject: ${replySubject}
Body: ${replyBody}

Generate a professional, friendly reply email. The reply should:
- Be concise and to the point
- Address their inquiry or interest
- Suggest next steps (like scheduling a call)
- Maintain a professional yet warm tone

Return ONLY a JSON object with this exact format:
{
  "subject": "Re: [original subject]",
  "body": "[email body text]"
}`;

    // ── Call the right provider ────────────────────────────────────────────
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let url = "";
    let body: object;

    if (provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 };
    } else if (provider === "groq") {
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 };
    } else if (provider === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, max_tokens: 600, messages: [{ role: "user", content: prompt }] };
    } else if (provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      body = { contents: [{ parts: [{ text: prompt }] }] };
    } else if (provider === "mistral") {
      url = "https://api.mistral.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 };
    } else {
      return NextResponse.json({
        success: false,
        error: `Unsupported AI provider: ${provider}`,
      }, { status: 400 });
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`${provider} API error (${res.status}): ${detail.slice(0, 200)}`);
    }

    const data = await res.json();

    // Extract text from each provider's response shape
    let rawText: string;
    if (provider === "anthropic") {
      rawText = data.content[0].text as string;
    } else if (provider === "gemini") {
      rawText = data.candidates[0].content.parts[0].text as string;
    } else {
      rawText = data.choices[0].message.content as string;
    }

    // Parse JSON out of the AI response
    let parsedResponse: { subject: string; body: string };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsedResponse = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { subject: `Re: ${replySubject}`, body: rawText };
    } catch {
      parsedResponse = { subject: `Re: ${replySubject}`, body: rawText };
    }

    return NextResponse.json({
      success: true,
      subject: parsedResponse.subject,
      body: parsedResponse.body,
      model,
      provider,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to generate AI reply";
    console.error("[generate-reply]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
