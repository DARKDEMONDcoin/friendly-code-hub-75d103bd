/** @doc On-demand AI blog post generator used by the editor. */
// blog-generate
// Generates ONE high-quality English blog post from a topic and inserts
// it into blog_posts as the "original" of a new translation group.
// Designed for Google's helpful-content & E-E-A-T criteria: clear author
// signals, FAQ schema, depth ~2000-2800 words, original analysis.
//
// POST body: { topic: string, angle?: string, requested_by?: string }
// Returns:    { ok, post_id, translation_group_id, slug }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getLLM, getLovableGateway, lovableEquivalent } from "../_shared/llm-router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function ensureUniqueSlug(base: string, lang = "en"): Promise<string> {
  let slug = base;
  let i = 1;
  while (true) {
    const { data } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("slug", slug)
      .eq("language", lang)
      .maybeSingle();
    if (!data) return slug;
    i += 1;
    slug = `${base}-${i}`;
  }
}

function readingMinutes(md: string): number {
  const words = md.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 220));
}

interface GenResult {
  title: string;
  slug_suggestion: string;
  meta_description: string;
  excerpt: string;
  content_md: string;        // 2000-2800 words, markdown
  keywords: string[];
  tags: string[];
  category: string;
  faq: { q: string; a: string }[];
  author_name: string;
}

const MEGSY_BRAND = `Megsy AI is an all-in-one AI platform offering:
- AI Image (text-to-image with multiple top models)
- AI Video (text-to-video, image-to-video — Veo, Kling, Pixverse families)
- AI Chat (multi-model assistant with web search)
- AI Slides (one-prompt deck generation)
- AI Code (autonomous coding agent)
- AI Faceswap & Portraits, AI Headshots
- AI Voice / TTS, AI Music generation
- AI Document & PPTX, AI Operator (long-horizon agent), AI Research, AI Learning
- Telegram bot integration, Workspace collaboration
URL: https://megsyai.com`;

const SYSTEM = `You are a senior content strategist writing exclusively for Megsy AI — an all-in-one AI creation platform.
${MEGSY_BRAND}

EVERY article you write MUST be about Megsy AI. Always:
- Name Megsy AI in the title, opening paragraph, at least 2 H2 sections, and the conclusion.
- Connect the topic to a specific Megsy AI feature, workflow, or comparison.
- If the topic is a "vs" comparison, give an honest, balanced take but anchor the verdict in how Megsy AI handles the same job.
- If the topic is a tutorial, show the exact steps inside Megsy AI.
- If the topic is industry analysis, frame it through Megsy AI's positioning.

Write for Google's Helpful-Content guidelines: original insight, first-hand examples, concrete numbers (ranges only — never invented), and a clear point of view.
NEVER fabricate statistics, names, dates, quotes, prices, or benchmarks. If a precise number is unknown, use qualitative phrasing or a clearly-labeled range.
Use second-person voice ("you"), short paragraphs (2-3 sentences max), descriptive H2 / H3, and concrete examples.
Length target: 2200-2800 English words.`;

const USER_TEMPLATE = (topic: string, angle?: string) => `Write a high-quality, original SEO blog post for Megsy AI's own blog.

TOPIC: ${topic}
${angle ? `ANGLE / KEY ARGUMENT: ${angle}` : ""}

Requirements:
- Title MUST contain "Megsy AI".
- Opening paragraph MUST mention Megsy AI by name.
- Include at least one comparison table in markdown.
- Include one concrete step-by-step workflow that uses Megsy AI.
- Add an internal link suggestion (markdown) to https://megsyai.com or a relevant tool subpath at least once.
- Avoid AI-cliché openers ("in today's world", "in the rapidly evolving", "in the digital age").
- Never invent stats. Use ranges or qualitative phrasing.
- Never trash competitors — frame comparisons as honest trade-offs.

Return a single JSON object — no markdown fences, no commentary — with this exact shape:
{
  "title": "compelling 50-65 char title containing 'Megsy AI' and the primary keyword",
  "slug_suggestion": "kebab-case-slug-under-80-chars",
  "meta_description": "140-158 char meta with primary keyword + Megsy AI + benefit + soft CTA",
  "excerpt": "2-sentence hook mentioning Megsy AI",
  "content_md": "FULL markdown body, 2200-2800 words, no H1 (title rendered separately). Use H2 sections, occasional H3, bullet lists, and at least one comparison table. Include the workflow steps. End with a 'Key takeaways' section.",
  "keywords": ["5-10 SEO keywords, primary first; include 'Megsy AI' as one of them"],
  "tags": ["3-6 short tags"],
  "category": "AI Guides | AI Tools | Productivity | Creator Economy | SEO | Tutorials",
  "faq": [{"q":"natural question","a":"40-80 word answer mentioning Megsy AI where natural"}, ...4-6 items],
  "author_name": "Megsy Editorial"
}

Output MUST be a single valid JSON object and nothing else.`;

async function callLLM(topic: string, angle?: string): Promise<GenResult> {
  const llm = await getLLM();
  if (!llm) throw new Error("no LLM provider available");

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: USER_TEMPLATE(topic, angle) },
  ];

  const doCall = async (endpoint: { url: string; key: string }, model: string) =>
    await fetch(endpoint.url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${endpoint.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7, response_format: { type: "json_object" } }),
    });

  // Primary: Qwen-Max (Alibaba flagship) for SEO-grade English originals.
  let res = await doCall(llm, llm.mapModel("qwen-max"));

  // Fallback: Lovable Gateway (Gemini Pro) when Qwen is out of quota.
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`blog-generate primary failed ${res.status}: ${errText.slice(0, 200)} — trying Lovable Gateway`);
    const lov = getLovableGateway();
    if (!lov) throw new Error(`LLM failed ${res.status}: ${errText.slice(0, 400)}`);
    res = await doCall(lov, lovableEquivalent("qwen-max"));
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`LLM fallback failed ${res.status}: ${t.slice(0, 400)}`);
    }
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as GenResult;


  // Defensive defaults
  parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 12) : [];
  parsed.tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [];
  parsed.faq = Array.isArray(parsed.faq) ? parsed.faq.slice(0, 8) : [];
  if (!parsed.slug_suggestion) parsed.slug_suggestion = slugify(parsed.title);
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  try {
    const { topic, angle, requested_by } = await req.json();
    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const gen = await callLLM(topic.trim(), angle?.trim());
    const slug = await ensureUniqueSlug(slugify(gen.slug_suggestion || gen.title), "en");
    const groupId = crypto.randomUUID();

    const contentMd = `$$md$$\n${gen.content_md}\n$$md$$`;

    const { data: inserted, error } = await supabase
      .from("blog_posts")
      .insert({
        slug,
        title: gen.title,
        meta_description: gen.meta_description,
        excerpt: gen.excerpt,
        content_md: contentMd,
        keywords: gen.keywords,
        tags: gen.tags,
        category: gen.category || "AI Guides",
        author_name: gen.author_name || "Megsy Editorial",
        language: "en",
        status: "published",
        published_at: new Date().toISOString(),
        reading_minutes: readingMinutes(gen.content_md),
        translation_group_id: groupId,
        is_original: true,
        faq: gen.faq,
        jsonld: {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: gen.title,
          description: gen.meta_description,
          keywords: gen.keywords.join(", "),
          inLanguage: "en",
          author: { "@type": "Organization", name: gen.author_name || "Megsy Editorial" },
          publisher: { "@type": "Organization", name: "Megsy AI" },
        },
      })
      .select("id")
      .single();

    if (error) throw error;
    if (requested_by) {
      await supabase.from("blog_topic_queue").update({
        status: "done",
        done_at: new Date().toISOString(),
        result_post_id: inserted!.id,
      }).eq("topic", topic).eq("status", "picked").limit(1);
    }

    return new Response(JSON.stringify({ ok: true, post_id: inserted!.id, translation_group_id: groupId, slug }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("blog-generate error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
