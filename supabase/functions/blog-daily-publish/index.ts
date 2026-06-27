/** @doc Daily cron — publishes 3 fresh AI-generated blog posts. */
// blog-daily-publish
// Cron entry point — runs once a day at 06:00 UTC.
// Pipeline:
//   1. Pick up to 3 topics: prioritize 'telegram' queued topics, then
//      'auto' fallback topics generated on the fly by the LLM.
//   2. For each: call blog-generate (English), then blog-translate (24 langs).
//   3. Ping Google + Bing IndexNow with the new URLs so they get crawled fast.
//
// Safe to invoke manually too: POST {} returns { picked, results }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getLLM } from "../_shared/llm-router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://megsyai.com";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const POSTS_PER_DAY = 3;

// Rotation themes — every day picks one topic from each category, guaranteeing
// content stays anchored to Megsy AI's features, comparisons, and use cases.
const THEMES = [
  "feature_deepdive",   // a specific Megsy AI tool, end-to-end
  "vs_comparison",      // Megsy AI vs a specific competitor on a specific job
  "use_case_workflow",  // a real creator/business workflow built with Megsy AI
  "industry_analysis",  // 2026 AI landscape framed through Megsy AI's stack
  "tutorial_howto",     // step-by-step "how to X with Megsy AI"
  "playbook",           // monetization / growth playbook anchored on Megsy AI
] as const;

const MEGSY_FEATURES = [
  "AI Image (text-to-image, multi-model)",
  "AI Video (text-to-video, image-to-video, Veo / Kling / Pixverse)",
  "AI Chat (multi-model assistant with web search)",
  "AI Slides (one-prompt deck generation)",
  "AI Code (autonomous coding agent)",
  "AI Faceswap & Portraits",
  "AI Voice / TTS",
  "AI Music generation",
  "AI Headshots",
  "AI Document & PPTX",
  "AI Operator (long-horizon agent)",
  "AI Research (deep multi-source reports)",
  "AI Learning / Tutor",
  "Telegram bot integration",
  "Workspace / team collaboration",
];

const COMPETITORS = [
  "ChatGPT", "Claude", "Gemini", "Perplexity", "Midjourney", "DALL-E",
  "Sora", "Runway", "Veo", "Kling", "Pixverse", "Suno", "ElevenLabs",
  "Notion AI", "Jasper", "Copy.ai", "Cursor", "Bolt", "v0", "Lovable",
  "Gamma", "Tome", "Beautiful.ai", "Synthesia", "HeyGen", "Canva AI",
];

function pickFallback(n: number): { topic: string; angle: string }[] {
  const out: { topic: string; angle: string }[] = [];
  for (let i = 0; i < n; i++) {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    const feature = MEGSY_FEATURES[Math.floor(Math.random() * MEGSY_FEATURES.length)];
    const competitor = COMPETITORS[Math.floor(Math.random() * COMPETITORS.length)];
    if (theme === "vs_comparison") {
      out.push({
        topic: `Megsy AI vs ${competitor} for ${feature.split("(")[0].trim()} in 2026`,
        angle: `head-to-head on speed, quality, price, and workflow — concrete tasks tested in both, with screenshots and a verdict per use case.`,
      });
    } else if (theme === "feature_deepdive") {
      out.push({
        topic: `Inside Megsy AI ${feature.split("(")[0].trim()}: the complete 2026 guide`,
        angle: `what it does, every model behind it, prompt patterns that work, pricing per output, and 3 real projects built with it.`,
      });
    } else if (theme === "use_case_workflow") {
      out.push({
        topic: `How creators are using Megsy AI ${feature.split("(")[0].trim()} to ship faster in 2026`,
        angle: `3 real workflows (with steps), tools they replaced, and measurable outcomes (time saved, revenue impact).`,
      });
    } else if (theme === "industry_analysis") {
      out.push({
        topic: `The 2026 all-in-one AI platform shift: why creators consolidate on Megsy AI`,
        angle: `data-backed analysis of tool sprawl, switching cost, and how Megsy AI's stack compares to using 5+ separate tools.`,
      });
    } else if (theme === "tutorial_howto") {
      out.push({
        topic: `How to use Megsy AI ${feature.split("(")[0].trim()} — step-by-step tutorial (2026)`,
        angle: `beginner-friendly walkthrough with prompts, settings, and 3 finished examples — built in under 10 minutes.`,
      });
    } else {
      out.push({
        topic: `The Megsy AI playbook: turning ${feature.split("(")[0].trim()} into recurring revenue in 2026`,
        angle: `concrete niches, pricing models, first-5-clients template, and how to scale the offer.`,
      });
    }
  }
  return out;
}

async function recentTitles(days = 60): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await supabase
    .from("blog_posts")
    .select("title")
    .eq("language", "en")
    .gte("created_at", since)
    .limit(500);
  return (data || []).map((r: any) => r.title).filter(Boolean);
}

async function autoTopics(n: number): Promise<{ topic: string; angle?: string }[]> {
  const llm = await getLLM();
  const recents = await recentTitles(60);
  const avoidList = recents.slice(0, 40).map((t) => `- ${t}`).join("\n");

  if (!llm) { console.warn("autoTopics: no LLM, fallback"); return pickFallback(n); }
  try {
    const res = await fetch(llm.url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${llm.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: llm.mapModel("google/gemini-2.5-flash"),
        messages: [
          { role: "system", content: `You generate SEO-strong blog topics for Megsy AI — an all-in-one AI platform (image, video, chat, slides, code, music, faceswap, voice, headshots, operator agent, research). EVERY topic MUST be explicitly about Megsy AI: either a feature deep-dive, a "Megsy AI vs X" comparison, a workflow built on Megsy AI, or industry analysis framed through Megsy AI's product. NEVER suggest generic AI topics that don't mention Megsy AI. Mix across themes: ${THEMES.join(", ")}. Target 2026 reader intent. Reply with valid JSON only.` },
          { role: "user", content: `Return JSON: {"topics":[{"topic":"...","angle":"...","theme":"one of ${THEMES.join("|")}"}]}. Provide ${n} items, each in a DIFFERENT theme.\n\nAvoid duplicating these recent titles:\n${avoidList || "(none yet)"}\n\nMegsy AI features to potentially cover: ${MEGSY_FEATURES.join("; ")}.\nPotential competitors for comparison angles: ${COMPETITORS.join(", ")}.` },
        ],
        temperature: 0.95,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("autoTopics LLM HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return pickFallback(n);
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    const topics = Array.isArray(parsed.topics) ? parsed.topics.slice(0, n) : [];
    // Safety net: if model returned topic without "Megsy" mention, replace with fallback.
    const clean = topics.filter((t: any) => t?.topic && /megsy/i.test(t.topic));
    if (clean.length < n) {
      const filler = pickFallback(n - clean.length);
      return [...clean, ...filler];
    }
    return clean;
  } catch (e) {
    console.warn("autoTopics error:", (e as Error).message);
    return pickFallback(n);
  }
}

async function backfillTranslations(): Promise<{ checked: number; filled: number }> {
  // Find originals from the last 30 days that don't yet have all 25 languages.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: originals } = await supabase
    .from("blog_posts")
    .select("id, translation_group_id, language")
    .eq("is_original", true)
    .gte("created_at", since)
    .limit(50);
  if (!originals || originals.length === 0) return { checked: 0, filled: 0 };

  let filled = 0;
  for (const o of originals) {
    if (!o.translation_group_id) continue;
    const { count } = await supabase
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .eq("translation_group_id", o.translation_group_id);
    if ((count || 0) >= 25) continue;
    // Fill 8 more langs per backfill pass
    try {
      await callEdge("blog-translate", { post_id: o.id, max_langs: 8 });
      filled++;
    } catch (e) {
      console.warn("backfill failed for", o.id, (e as Error).message);
    }
  }
  return { checked: originals.length, filled };
}




async function callEdge(name: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

async function pingIndexNow(urls: string[]): Promise<void> {
  // IndexNow is honored by Bing, Yandex, Seznam, Naver and proxied to others.
  // Google does NOT participate but auto-discovers via sitemap ping below.
  const key = Deno.env.get("INDEXNOW_KEY");
  if (!key || urls.length === 0) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList: urls,
      }),
    });
  } catch (e) { console.warn("indexnow ping failed", e); }
}

async function pingGoogleSitemap(): Promise<void> {
  try {
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(`${SITE_URL}/sitemap-index.xml`)}`);
  } catch (e) { console.warn("google sitemap ping failed", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // 0. Backfill missing translations from prior days (safety net so no post
    //    is ever stuck with fewer than 25 languages).
    const bf = await backfillTranslations().catch((e) => { console.warn("backfill error", e); return { checked: 0, filled: 0 }; });


    // 1. Pick queued telegram/manual topics first
    const { data: queued } = await supabase
      .from("blog_topic_queue")
      .select("id, topic, angle, requested_by")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(POSTS_PER_DAY);

    let topics: { id?: string; topic: string; angle?: string; requested_by?: string }[] = queued || [];

    if (topics.length < POSTS_PER_DAY) {
      const auto = await autoTopics(POSTS_PER_DAY - topics.length);
      topics = [...topics, ...auto.map((a) => ({ topic: a.topic, angle: a.angle }))];
    }

    if (topics.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "no topics" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Mark queued rows as picked
    const queuedIds = topics.map((t) => t.id).filter(Boolean) as string[];
    if (queuedIds.length) {
      await supabase.from("blog_topic_queue").update({ status: "picked", picked_at: new Date().toISOString() }).in("id", queuedIds);
    }

    const results: any[] = [];
    const newUrls: string[] = [];

    for (const t of topics) {
      try {
        const gen = await callEdge("blog-generate", { topic: t.topic, angle: t.angle, requested_by: t.requested_by });
        if (!gen?.post_id) { results.push({ topic: t.topic, ok: false, step: "generate", error: gen?.error || "unknown" }); continue; }
        newUrls.push(`${SITE_URL}/blog/${gen.slug}`);

        // Translate in chunks of 8 langs per invocation to stay within worker
        // resource limits; loop until no more pending langs (or 5 max passes).
        let translatedTotal = 0;
        for (let pass = 0; pass < 5; pass++) {
          const tr = await callEdge("blog-translate", { post_id: gen.post_id, max_langs: 8 });
          const okLangs = (tr?.results || []).filter((r: any) => r.ok).map((r: any) => r.lang);
          translatedTotal += okLangs.length;
          if (!tr?.results || tr.results.length === 0) break;
        }
        results.push({ topic: t.topic, ok: true, post_id: gen.post_id, slug: gen.slug, translated: translatedTotal });


        // Mark queue row done if it was a queued topic
        if (t.id) {
          await supabase.from("blog_topic_queue").update({
            status: "done", done_at: new Date().toISOString(), result_post_id: gen.post_id,
          }).eq("id", t.id);
        }
      } catch (e) {
        console.error("daily publish step failed", e);
        results.push({ topic: t.topic, ok: false, error: String(e?.message || e) });
        if (t.id) {
          await supabase.from("blog_topic_queue").update({
            status: "failed", error: String(e?.message || e),
          }).eq("id", t.id);
        }
      }
    }

    // 3. Notify search engines
    await Promise.all([pingGoogleSitemap(), pingIndexNow(newUrls)]);

    return new Response(JSON.stringify({ ok: true, picked: topics.length, backfill: bf, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("blog-daily-publish error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
