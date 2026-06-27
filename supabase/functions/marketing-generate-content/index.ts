/** @doc Generate marketing post content (multi-language, multi-platform variants) using Alibaba Qwen models. */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pickAlibabaKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  // Prefer alibaba_keys table; fallback to api_keys with service in alibaba/qwen/dashscope.
  const { data: ali } = await admin
    .from("alibaba_keys")
    .select("api_key, is_active, is_blocked")
    .eq("is_active", true)
    .limit(50);
  const aliRow = (ali || []).find((r: any) => r.api_key && r.is_blocked !== true);
  if (aliRow?.api_key) return aliRow.api_key as string;

  const { data: apiKeys } = await admin
    .from("api_keys")
    .select("service, api_key, is_active, is_blocked")
    .limit(200);
  const services = new Set(["alibaba", "qwen", "dashscope", "aliyun", "ali"]);
  const row = (apiKeys || []).find(
    (r: any) =>
      services.has(String(r.service || "").toLowerCase()) &&
      r.api_key &&
      r.is_active !== false &&
      r.is_blocked !== true,
  );
  return row?.api_key || Deno.env.get("DASHSCOPE_API_KEY") || null;
}

const PLATFORM_LIMITS: Record<string, { chars: number; hint: string }> = {
  telegram: { chars: 4096, hint: "Long-form OK. Use emojis and line breaks for readability." },
  bluesky: { chars: 300, hint: "Strict 300-char limit. Concise hook." },
  mastodon: { chars: 500, hint: "Up to 500 chars. Friendly tone." },
  devto: { chars: 100000, hint: "Markdown article with title, intro, sections, code blocks." },
  hashnode: { chars: 100000, hint: "Markdown article with H2 sections." },
  wordpress: { chars: 100000, hint: "HTML/Markdown blog post." },
  ghost: { chars: 100000, hint: "Markdown blog post." },
  pinterest: { chars: 500, hint: "Pin description with keywords for SEO." },
  linkedin: { chars: 3000, hint: "Professional, story-driven, 3-5 short paragraphs, end with question." },
  tiktok: { chars: 2200, hint: "Hook in first line, hashtags at end. Casual." },
  facebook: { chars: 5000, hint: "Friendly, conversational." },
  instagram: { chars: 2200, hint: "Visual-first caption, emojis, hashtags." },
  threads: { chars: 500, hint: "Short, punchy, conversational." },
  youtube: { chars: 5000, hint: "Video description with timestamps placeholder and SEO keywords." },
  twitter: { chars: 280, hint: "Strict 280 chars. Single tweet." },
};

function buildPrompt(campaign: any, topic: string, language: string, platforms: string[]) {
  const platformBlock = platforms
    .map((p) => {
      const cfg = PLATFORM_LIMITS[p] || { chars: 1000, hint: "" };
      return `- ${p}: max ${cfg.chars} chars. ${cfg.hint}`;
    })
    .join("\n");

  const hashtags = (campaign.hashtags || []).join(" ");
  return `You are an expert social-media marketer.
Campaign: ${campaign.name}
Goal: ${campaign.goal || "Build audience and drive engagement"}
Tone: ${campaign.tone || "professional"}
Target audience: ${campaign.target_audience || "general"}
Language: ${language}
Suggested hashtags: ${hashtags}

Topic of today's post: ${topic}

Produce a JSON object with this exact shape:
{
  "title": "short title",
  "core_message": "1-2 sentence core message",
  "variants": {
    ${platforms.map((p) => `"${p}": "full post text optimized for that platform"`).join(",\n    ")}
  },
  "hashtags": ["#tag1","#tag2"]
}

Platform requirements:
${platformBlock}

Reply ONLY with the JSON object, no markdown fences, no commentary.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const {
      campaign_id,
      topic,
      language = "ar",
      platforms,
      scheduled_at,
      save = true,
    } = body || {};

    if (!campaign_id || !topic) return json({ error: "campaign_id and topic required" }, 400);

    const { data: campaign, error: cErr } = await admin
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (cErr || !campaign) return json({ error: "campaign not found" }, 404);

    // Default to all linked-account platforms for this campaign
    let targetPlatforms: string[] = Array.isArray(platforms) && platforms.length ? platforms : [];
    if (!targetPlatforms.length) {
      const { data: accounts } = await admin
        .from("marketing_accounts")
        .select("platform")
        .eq("campaign_id", campaign_id)
        .eq("status", "active");
      targetPlatforms = Array.from(new Set((accounts || []).map((a: any) => a.platform)));
    }
    if (!targetPlatforms.length) targetPlatforms = ["telegram", "bluesky", "mastodon"];

    const apiKey = await pickAlibabaKey(admin);
    if (!apiKey) return json({ error: "no Alibaba/Qwen API key configured" }, 500);

    const model = campaign.ai_model || "qwen-max";
    const prompt = buildPrompt(campaign, topic, language, targetPlatforms);

    const r = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You output ONLY valid JSON. No markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return json({ error: "qwen call failed", status: r.status, detail: txt.slice(0, 800) }, 502);
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const variants = parsed.variants || {};
    const coreContent = parsed.core_message || Object.values(variants)[0] || "";

    let postId: string | null = null;
    if (save) {
      const { data: inserted, error: iErr } = await admin
        .from("marketing_posts")
        .insert({
          user_id: userId,
          campaign_id,
          title: parsed.title || topic,
          content: String(coreContent),
          hashtags: parsed.hashtags || campaign.hashtags || [],
          language,
          platform_variants: variants,
          target_platforms: targetPlatforms,
          scheduled_at: scheduled_at || null,
          status: scheduled_at ? "queued" : "draft",
          ai_generated: true,
        })
        .select("id")
        .single();
      if (iErr) return json({ error: iErr.message }, 500);
      postId = inserted?.id || null;
    }

    return json({
      ok: true,
      post_id: postId,
      title: parsed.title || topic,
      core_message: coreContent,
      variants,
      hashtags: parsed.hashtags || [],
      target_platforms: targetPlatforms,
      model,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
