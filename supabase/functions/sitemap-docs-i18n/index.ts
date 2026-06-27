/** @doc Emits a fully multilingual sitemap for /docs in all 25 supported languages, with proper hreflang alternates for SEO. */
// sitemap-docs-i18n
// ─────────────────────────────────────────────────────────────────────────────
// Generates a multilingual XML sitemap for every Megsy AI /docs URL across
// the 25 supported locales, with full <xhtml:link rel="alternate" hreflang>
// matrix per URL — the format Google requires for high-quality multilingual
// indexing.
//
// Group list is kept here as the canonical export from DocsPage. Update by
// adding/removing entries from DOC_GROUP_IDS below; the function emits one
// URL per (locale × group) plus the docs root.
// ─────────────────────────────────────────────────────────────────────────────

import { BLOG_LANGS } from "../_shared/blog-langs.ts";

const SITE = "https://megsyai.com";

// Mirror of the GROUPS array in src/pages/marketing/DocsPage.tsx.
// Keep in sync when adding new docs groups.
const DOC_GROUP_IDS = [
  "intro",
  "account",
  "chat",
  "agents",
  "operator",
  "research",
  "learn",
  "media",
  "slides",
  "music",
  "code",
  "workspace",
  "personalize",
  "pwa",
  "billing",
  "referrals",
  "developer",
  "integrations",
  "skills",
  "enterprise",
  "trust",
  "legal",
  "compliance",
  "blog-system",
  "support",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function buildAlternates(path: string): string {
  // <xhtml:link rel="alternate" hreflang="..."> for each locale + x-default.
  const lines = BLOG_LANGS.map((l) => {
    const prefix = l.code === "en" ? "" : `/${l.code}`;
    return `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${SITE}${prefix}${path}"/>`;
  });
  lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${path}"/>`);
  return lines.join("\n");
}

function buildUrlEntry(prefix: string, path: string, priority: string): string {
  return `  <url>
    <loc>${SITE}${prefix}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
${buildAlternates(path)}
  </url>`;
}

function buildSitemap(): string {
  const urls: string[] = [];
  const paths: Array<{ p: string; priority: string }> = [
    { p: "/docs", priority: "0.9" },
    ...DOC_GROUP_IDS.map((id) => ({ p: `/docs/${id}`, priority: "0.85" })),
  ];

  for (const l of BLOG_LANGS) {
    const prefix = l.code === "en" ? "" : `/${l.code}`;
    for (const { p, priority } of paths) {
      urls.push(buildUrlEntry(prefix, p, priority));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const xml = buildSitemap();
  return new Response(xml, {
    headers: {
      ...cors,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
