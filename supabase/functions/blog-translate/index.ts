/** @doc Translates blog posts into every supported language. */
// blog-translate
// Translates an existing English blog post into the remaining 24 languages
// and inserts each as a separate blog_posts row sharing the same
// translation_group_id. Used by blog-daily-publish, but also safe to call
// standalone with { post_id, target_langs?: string[] }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getLLM, getLovableGateway, lovableEquivalent } from "../_shared/llm-router.ts";
import { BLOG_LANGS, BLOG_LANG_CODES, getLang } from "../_shared/blog-langs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function slugify(input: string): string {
  // For non-Latin scripts (zh, ja, ar, …) the LLM returns a transliterated slug.
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function ensureUniqueSlug(base: string, lang: string): Promise<string> {
  let slug = base || `post-${lang}`;
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

const SYSTEM = (langName: string) =>
  `You are a native ${langName} translator specialized in SEO content.
Translate the supplied article fully and naturally into ${langName}.
Adapt idioms — do NOT translate word-for-word. Keep the markdown structure
(##, ###, lists, tables). Keep brand names like "Megsy AI", "ChatGPT",
"Midjourney" untranslated. Keep the FAQ Q&A structure. Return ONE JSON
object only.`;

const USER = (post: any, langName: string, langCode: string) => `Translate this article into ${langName} (${langCode}).

Return JSON:
{
  "title": "translated title (50-65 chars target)",
  "slug_suggestion": "kebab-case-latin-slug (transliterate if needed; never translate to non-Latin)",
  "meta_description": "translated 140-158 char meta",
  "excerpt": "translated 2-sentence hook",
  "content_md": "translated full markdown body",
  "keywords": ["5-10 ${langName} SEO keywords"],
  "faq": [{"q":"...","a":"..."}]
}

ORIGINAL ARTICLE:
TITLE: ${post.title}
META: ${post.meta_description}
EXCERPT: ${post.excerpt || ""}
KEYWORDS: ${(post.keywords || []).join(", ")}

BODY:
${post.content_md}

FAQ:
${JSON.stringify(post.faq || [])}
`;

async function callTranslator(
  endpoint: { url: string; key: string },
  model: string,
  systemMsg: string,
  userMsg: string,
): Promise<Response> {
  return await fetch(endpoint.url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${endpoint.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(
  endpoint: { url: string; key: string },
  model: string,
  systemMsg: string,
  userMsg: string,
  label: string,
): Promise<Response> {
  let res = await callTranslator(endpoint, model, systemMsg, userMsg);
  let attempt = 0;
  while ((res.status === 429 || res.status === 503) && attempt < 3) {
    const wait = 5000 * Math.pow(2, attempt); // 5s, 10s, 20s
    console.warn(`${label} ${res.status} — backing off ${wait}ms (attempt ${attempt + 1})`);
    await sleep(wait);
    res = await callTranslator(endpoint, model, systemMsg, userMsg);
    attempt++;
  }
  return res;
}

async function translateOne(post: any, langCode: string): Promise<any> {
  const lang = getLang(langCode);
  if (!lang) throw new Error(`unknown lang ${langCode}`);
  const llm = await getLLM();
  if (!llm) throw new Error("no LLM provider available");

  const systemMsg = SYSTEM(lang.name);
  const userMsg = USER(post, lang.name, langCode);

  // Primary: Qwen-Plus via the resolved provider (usually DashScope)
  let res = await callWithRetry(llm, llm.mapModel("qwen-plus"), systemMsg, userMsg, `translate ${langCode} primary`);

  // Fallback: Lovable Gateway (Gemini) when Qwen is out of quota / 4xx / 5xx.
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`translate ${langCode} primary failed ${res.status}: ${errText.slice(0, 200)} — trying Lovable Gateway`);
    const lov = getLovableGateway();
    if (!lov) throw new Error(`translate ${langCode} failed ${res.status}: ${errText.slice(0, 300)}`);
    res = await callWithRetry(lov, lovableEquivalent("qwen-plus"), systemMsg, userMsg, `translate ${langCode} fallback`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`translate ${langCode} fallback failed ${res.status}: ${t.slice(0, 300)}`);
    }
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  try {
    const { post_id, target_langs, max_langs } = await req.json();
    if (!post_id) return new Response(JSON.stringify({ error: "post_id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: source, error: srcErr } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", post_id)
      .single();
    if (srcErr || !source) throw srcErr || new Error("source not found");

    const groupId = source.translation_group_id || crypto.randomUUID();
    if (!source.translation_group_id) {
      await supabase.from("blog_posts").update({ translation_group_id: groupId }).eq("id", post_id);
    }

    // What's already translated?
    const { data: existing } = await supabase
      .from("blog_posts")
      .select("language")
      .eq("translation_group_id", groupId);
    const have = new Set((existing || []).map((r: any) => r.language));

    // Cap per invocation to avoid worker resource limits (24 sequential translations
    // exceed the function's CPU budget). Daily-publish calls us in batches.
    const cap = Math.max(1, Math.min(Number(max_langs) || 8, 24));
    const targets = (target_langs && Array.isArray(target_langs) ? target_langs : BLOG_LANG_CODES)
      .filter((c: string) => c !== source.language && !have.has(c))
      .slice(0, cap);


    // Strip $$md$$ wrappers from source content_md if present, so the model
    // sees clean markdown.
    const cleanMd = String(source.content_md || "").replace(/\$\$md\$\$/g, "").trim();
    const sourceForLLM = { ...source, content_md: cleanMd };

    const results: { lang: string; ok: boolean; error?: string; slug?: string }[] = [];

    // Translate sequentially to keep within rate / token limits.
    for (const code of targets) {
      try {
        const t = await translateOne(sourceForLLM, code);
        const slugBase = slugify(t.slug_suggestion || `${source.slug}-${code}`);
        const slug = await ensureUniqueSlug(slugBase, code);
        await supabase.from("blog_posts").insert({
          slug,
          title: t.title,
          meta_description: t.meta_description,
          excerpt: t.excerpt,
          content_md: `$$md$$\n${t.content_md}\n$$md$$`,
          keywords: Array.isArray(t.keywords) ? t.keywords : [],
          tags: source.tags,
          category: source.category,
          author_name: source.author_name,
          language: code,
          status: "published",
          published_at: new Date().toISOString(),
          reading_minutes: source.reading_minutes,
          translation_group_id: groupId,
          is_original: false,
          faq: t.faq || source.faq,
          hero_image_url: source.hero_image_url,
          jsonld: {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: t.title,
            description: t.meta_description,
            inLanguage: code,
            translationOfWork: { "@id": source.slug },
            author: { "@type": "Organization", name: source.author_name || "Megsy Editorial" },
            publisher: { "@type": "Organization", name: "Megsy AI" },
          },
        });
        results.push({ lang: code, ok: true, slug });
      } catch (e) {
        console.error(`translate ${code} failed`, e);
        results.push({ lang: code, ok: false, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, translation_group_id: groupId, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("blog-translate error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
