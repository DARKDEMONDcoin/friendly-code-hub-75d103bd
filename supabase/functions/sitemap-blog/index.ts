/** @doc Generates a dynamic sitemap for /blog and its translations. */
// Public dynamic sitemap for blog posts — multilingual, with full
// hreflang alternates inline. Google's recommended format:
// https://developers.google.com/search/docs/specialty/international/localized-versions
//
// Every URL entry carries <xhtml:link rel="alternate" hreflang="<code>" href="..."/>
// pointing to every published translation in its translation_group, plus an
// x-default pointing at the English original. This lets Google show the
// right language in every country's SERP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://megsyai.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function xmlEscape(s: string): string {
  return s.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function postUrl(slug: string, lang: string): string {
  return lang === "en" ? `${SITE_URL}/blog/${slug}` : `${SITE_URL}/${lang}/blog/${slug}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug,title,language,published_at,updated_at,hero_image_url,translation_group_id,is_original")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20000);

    const all = posts || [];

    // Group by translation_group_id so each entry knows all its siblings.
    const groups = new Map<string, any[]>();
    for (const p of all) {
      const gid = p.translation_group_id || `solo-${p.slug}`;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid)!.push(p);
    }

    const urlBlocks: string[] = [];

    for (const p of all) {
      const gid = p.translation_group_id || `solo-${p.slug}`;
      const siblings = groups.get(gid)!;
      const original = siblings.find((s) => s.is_original) || siblings.find((s) => s.language === "en") || siblings[0];

      const lastmod = (p.updated_at || p.published_at || new Date().toISOString()).slice(0, 10);
      const loc = postUrl(p.slug, p.language || "en");

      const alts = siblings
        .map((s) => `    <xhtml:link rel="alternate" hreflang="${s.language || "en"}" href="${xmlEscape(postUrl(s.slug, s.language || "en"))}" />`)
        .join("\n");
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(postUrl(original.slug, original.language || "en"))}" />`;
      const img = p.hero_image_url
        ? `\n    <image:image><image:loc>${xmlEscape(p.hero_image_url)}</image:loc><image:title>${xmlEscape(p.title || "")}</image:title></image:image>`
        : "";

      urlBlocks.push(`  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${alts}
${xDefault}${img}
  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE_URL}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${urlBlocks.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (e) {
    return new Response(`<!-- sitemap error: ${String(e)} -->`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  }
});
