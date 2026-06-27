// Smart family grouping for the Fal model picker.
// Groups DB models by slug prefix into a single visual card with sub-variants.

import type { FalImageModel, FalVideoModel } from "@/hooks/useFalModels";
import type { ProviderKey } from "@/lib/modelFamilies";

export interface FamilyDef {
  key: string; // family key
  name: string; // clean display name (NO company)
  provider: ProviderKey; // logo provider
  /** Short capability tag — shown under the name. */
  tag: string;
  match: (slug: string) => boolean;
  describe?: string; // optional override description
  hero?: "TOP" | "NEW" | "PRO";
  /** Kept for backwards compatibility — unused by new UI. */
  providerLabel?: string;
  /** Image-only spec card (researched). 4-word blurb + tech specs. */
  imageSpec?: {
    blurb: string; // ≤ 4 words
    dim: string; // max image dimensions, e.g. "4096 × 4096"
    aspect: string; // supported aspect ratios, e.g. "1:1 · 16:9 · 9:16"
    quality: "Flagship" | "Pro" | "Premium" | "Standard" | "Lite" | "Fast" | "Legacy";
  };
}

// Order matters — first match wins.  More specific patterns FIRST.
const FAMILIES: FamilyDef[] = [
  // ── Wan / Wanx (Alibaba) ───────────────────────────────────
  {
    key: "wan-2-7",
    name: "Wan 2.7",
    provider: "alibaba",
    tag: "All-in-one",
    match: (s) => s.startsWith("wan-2-7"),
    hero: "TOP",
    describe: "Image, video, editing and lipsync — all in one flagship.",
    imageSpec: {
      blurb: "All-in-one flagship",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Flagship",
    },
  },
  {
    key: "wan-2-5",
    name: "Wan 2.5",
    provider: "alibaba",
    tag: "Preview model",
    match: (s) => s.startsWith("wan-2-5"),
    hero: "NEW",
    describe: "Latest Alibaba Wan preview — text-to-image & text-to-video.",
    imageSpec: {
      blurb: "Preview text to image",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Premium",
    },
  },
  {
    key: "wan-2-2",
    name: "Wan 2.2",
    provider: "alibaba",
    tag: "T2V / I2V Plus",
    match: (s) => s.startsWith("wan-2-2"),
    describe: "Wan 2.2 Plus — text-to-video and image-to-video.",
  },
  {
    key: "wan-2-1-vace",
    name: "Wan 2.1 VACE",
    provider: "alibaba",
    tag: "Video editing",
    match: (s) => s.startsWith("wan-2-1-vace"),
    describe: "Video repaint, local edit, extension and frame expansion.",
  },
  {
    key: "wanx-2-1",
    name: "Wanx 2.1",
    provider: "alibaba",
    tag: "Image & video",
    match: (s) => s.startsWith("wanx-2-1"),
    describe: "Alibaba Wanx 2.1 — T2I, T2V, I2V & keyframe variants.",
    imageSpec: {
      blurb: "Standard image generation",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3",
      quality: "Standard",
    },
  },
  {
    key: "wanx-2-0",
    name: "Wanx 2.0",
    provider: "alibaba",
    tag: "Image generation",
    match: (s) => s.startsWith("wanx-2-0"),
    describe: "Lightweight Alibaba Wanx 2.0 image generation.",
    imageSpec: {
      blurb: "Lightweight Alibaba image",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Lite",
    },
  },
  {
    key: "wanx-v1",
    name: "Wanx V1",
    provider: "alibaba",
    tag: "Sketch to image",
    match: (s) => s.startsWith("wanx-v1") || s.startsWith("wanx-sketch"),
    describe: "Legacy Wanx image + sketch-to-image.",
    imageSpec: {
      blurb: "Legacy sketch to image",
      dim: "1024 × 1024",
      aspect: "1:1 · 4:3 · 3:4",
      quality: "Legacy",
    },
  },
  // ── HappyHorse ─────────────────────────────────────────────
  {
    key: "happyhorse-i2v",
    name: "HappyHorse I2V",
    provider: "happyhorse",
    tag: "Image to Video",
    match: (s) => s === "happyhorse-i2v" || s.startsWith("happyhorse-i2v"),
    hero: "TOP",
    describe: "HappyHorse image-to-video — cinematic motion from a single frame.",
  },
  {
    key: "happyhorse-t2v",
    name: "HappyHorse T2V",
    provider: "happyhorse",
    tag: "Text to Video",
    match: (s) => s === "happyhorse-t2v" || s.startsWith("happyhorse-t2v"),
    describe: "HappyHorse text-to-video — prompt-driven cinematic generation.",
  },
  {
    key: "happyhorse-r2v",
    name: "HappyHorse R2V",
    provider: "happyhorse",
    tag: "Reference to Video",
    match: (s) => s === "happyhorse-r2v" || s.startsWith("happyhorse-r2v"),
    describe: "#1 globally for reference-to-video — character & style consistency.",
  },
  {
    key: "happyhorse-videoedit",
    name: "HappyHorse Video Edit",
    provider: "happyhorse",
    tag: "Video editing",
    match: (s) => s.startsWith("happyhorse-videoedit") || s.startsWith("happyhorse-video-edit"),
    describe: "HappyHorse video editing — repaint, extend and local edits.",
  },
  // ── Qwen ───────────────────────────────────────────────────
  {
    key: "qwen-image",
    name: "Qwen Image 2.0",
    provider: "qwen",
    tag: "Typography & editing",
    match: (s) => s.startsWith("qwen-image"),
    describe: "Best-in-class typography and style / pose / object editing.",
    imageSpec: {
      blurb: "Typography and editing",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Pro",
    },
  },
  // ── FLUX (BFL) ─────────────────────────────────────────────
  {
    key: "flux-kontext",
    name: "FLUX Kontext",
    provider: "bfl",
    tag: "Smart image editing",
    match: (s) => s.startsWith("flux-kontext"),
    describe: "Context-aware editing and typography.",
    imageSpec: {
      blurb: "Smart contextual editing",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Pro",
    },
  },
  {
    key: "flux-2-klein",
    name: "FLUX.2 Klein",
    provider: "bfl",
    tag: "Lightweight",
    match: (s) => s.startsWith("flux-2-klein"),
    describe: "Smaller, cheaper FLUX.2 variants for fast iteration.",
    imageSpec: {
      blurb: "Lightweight FLUX variant",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Lite",
    },
  },
  {
    key: "flux-2",
    name: "FLUX.2",
    provider: "bfl",
    tag: "Commercial-grade",
    match: (s) => s.startsWith("flux-2"),
    hero: "TOP",
    describe: "Up to 10 references, exact color match, 4 MP output.",
    imageSpec: {
      blurb: "Commercial-grade image gen",
      dim: "2048 × 2048 (4 MP)",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4 · 21:9",
      quality: "Pro",
    },
  },
  {
    key: "flux-schnell",
    name: "FLUX Schnell",
    provider: "bfl",
    tag: "Ultra fast",
    match: (s) => s.includes("flux-fast-schnell") || s.startsWith("flux-schnell"),
    describe: "Ultra-fast, low-cost generation.",
    imageSpec: {
      blurb: "Ultra fast generation",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16 · 4:3",
      quality: "Fast",
    },
  },
  // ── OpenAI ─────────────────────────────────────────────────
  {
    key: "gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    tag: "Native editing",
    match: (s) => s.startsWith("gpt-image-2"),
    describe: "OpenAI native editing, inpainting and flexible aspects.",
    imageSpec: {
      blurb: "Native editing & inpainting",
      dim: "4096 × 4096",
      aspect: "1:1 · 3:2 · 2:3 · 16:9 · 9:16",
      quality: "Flagship",
    },
  },
  {
    key: "gpt-image-1",
    name: "GPT Image 1",
    provider: "openai",
    tag: "Image editing",
    match: (s) => s.startsWith("gpt-image-1"),
    describe: "Original GPT Image with editing — plus a cheaper mini tier.",
    imageSpec: {
      blurb: "Image generation & editing",
      dim: "1792 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Standard",
    },
  },
  {
    key: "sora-2",
    name: "Sora 2",
    provider: "sora",
    tag: "Cinematic T2V",
    match: (s) => s.startsWith("sora"),
    hero: "TOP",
    describe: "Cinematic text-to-video generation.",
  },
  // ── Google ─────────────────────────────────────────────────
  {
    key: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "gemini",
    tag: "High-res reasoning",
    match: (s) => s.startsWith("gemini-3-pro-image"),
    hero: "PRO",
    describe: "Google Search grounded + high-res reasoning (Gemini 3 Pro Image).",
    imageSpec: {
      blurb: "High-res reasoning model",
      dim: "4096 × 4096 (4K)",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Flagship",
    },
  },
  {
    key: "nano-banana",
    name: "Nano Banana 2",
    provider: "gemini",
    tag: "Fast image gen",
    match: (s) => s.startsWith("nano-banana") || s.startsWith("gemini-3-1-flash-image"),
    describe: "Fast Gemini image generation and editing.",
    imageSpec: {
      blurb: "Fast Gemini image",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Premium",
    },
  },
  {
    key: "gemini-2-5-image",
    name: "Nano Banana (2.5)",
    provider: "gemini",
    tag: "Image generation",
    match: (s) => s.startsWith("gemini-2-5-flash-image"),
    describe: "Gemini 2.5 Flash Image — original Nano Banana.",
    imageSpec: {
      blurb: "Original Nano Banana",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Standard",
    },
  },
  {
    key: "gemini-video",
    name: "Gemini Video",
    provider: "gemini",
    tag: "Text-to-video",
    match: (s) => s === "gemini-video" || s.startsWith("gemini-video"),
    describe: "Text-to-video generation.",
  },
  {
    key: "veo-3-1",
    name: "Veo 3.1",
    provider: "google",
    tag: "Flagship T2V",
    match: (s) => s.startsWith("veo-3-1"),
    hero: "TOP",
    describe: "Flagship cinematic text-to-video and image-to-video.",
  },
  {
    key: "veo-3-0",
    name: "Veo 3",
    provider: "google",
    tag: "Standard T2V",
    match: (s) => s === "veo-3" || s.startsWith("veo-3-0") || s.startsWith("veo-3"),
    describe: "Standard cinematic video generation.",
  },
  // ── ByteDance ──────────────────────────────────────────────
  {
    key: "seedream",
    name: "Seedream 4.5",
    provider: "bytedance",
    tag: "Stylized image",
    match: (s) => s.startsWith("seedream"),
    describe: "Strong stylization + SOTA image editing.",
    imageSpec: {
      blurb: "Stylized image & editing",
      dim: "4096 × 4096 (4K)",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4 · 21:9",
      quality: "Pro",
    },
  },
  {
    key: "seedance-2",
    name: "Seedance 2.0",
    provider: "bytedance",
    tag: "Video + audio",
    match: (s) => s.startsWith("seedance-2"),
    hero: "NEW",
    describe: "T2V + I2V + Ref2V + Edit with multilingual native audio.",
  },
  {
    key: "seedance-1",
    name: "Seedance 1.0",
    provider: "bytedance",
    tag: "Affordable video",
    match: (s) => s.startsWith("seedance-1") || s.startsWith("seedance"),
    describe: "Affordable T2V / I2V tiers.",
  },
  // ── Kling ──────────────────────────────────────────────────
  {
    key: "kling-3",
    name: "Kling 3.0",
    provider: "kling",
    tag: "Cinematic T2V/I2V",
    match: (s) => s.startsWith("kling-v3") || s.startsWith("kling-3"),
    describe: "Cinematic text-to-video and image-to-video.",
  },
  {
    key: "kling-2-5",
    name: "Kling 2.5 Turbo",
    provider: "kling",
    tag: "Fast video",
    match: (s) => s.startsWith("kling-v2-5") || s.startsWith("kling-2-5"),
    describe: "Fast, affordable text-to-video and image-to-video.",
  },
  // ── Other premium video providers ──────────────────────────
  {
    key: "runway",
    name: "Runway Gen-4.5",
    provider: "runway",
    tag: "T2V & video edit",
    match: (s) => s.startsWith("runway"),
    hero: "PRO",
    describe: "Cinematic text-to-video and video editing.",
  },
  {
    key: "luma-ray",
    name: "Luma Ray 3",
    provider: "luma",
    tag: "I2V cinematic",
    match: (s) => s.startsWith("luma") || s.startsWith("ray"),
    describe: "Image-to-video with smooth cinematic motion.",
  },
  {
    key: "pika",
    name: "Pika 2.5",
    provider: "pika",
    tag: "Stylized video",
    match: (s) => s.startsWith("pika"),
    describe: "Stylized text-to-video generation.",
  },
  {
    key: "pixverse",
    name: "PixVerse V6",
    provider: "pixverse",
    tag: "Affordable video",
    match: (s) => s.startsWith("pixverse") || s.startsWith("pix-verse"),
    describe: "Affordable text-to-video generation.",
  },
  {
    key: "hailuo",
    name: "Hailuo 2.3",
    provider: "hailuo",
    tag: "I2V realistic",
    match: (s) => s.startsWith("hailuo") || s.startsWith("minimax"),
    describe: "Realistic image-to-video generation.",
  },
  {
    key: "firefly",
    name: "Adobe Firefly Video",
    provider: "firefly",
    tag: "Video editing",
    match: (s) => s.startsWith("firefly") || s.startsWith("adobe"),
    describe: "Video editing and generation.",
  },
  {
    key: "grok-video",
    name: "Grok Video",
    provider: "grok",
    tag: "Text-to-video",
    match: (s) => s.startsWith("grok"),
    describe: "Text-to-video generation.",
  },
  // ── Recraft ────────────────────────────────────────────────
  // ── WaveSpeed-only families (no Alibaba/Fal equivalent) ────
  {
    key: "imagen-4",
    name: "Imagen 4",
    provider: "google",
    tag: "Photoreal text-to-image",
    match: (s) => s.includes("imagen-4") || s.includes("imagen4"),
    hero: "PRO",
    describe: "Google Imagen 4 — photoreal generation with crisp typography.",
    imageSpec: {
      blurb: "Photoreal text to image",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Pro",
    },
  },
  {
    key: "ideogram-v4",
    name: "Ideogram V4",
    provider: "ideogram",
    tag: "Best typography",
    match: (s) => s.includes("ideogram"),
    describe: "Ideogram V4 — best-in-class text rendering inside images.",
    imageSpec: {
      blurb: "Best in class text",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Premium",
    },
  },
  {
    key: "grok-imagine",
    name: "Grok Imagine",
    provider: "grok",
    tag: "xAI image gen",
    match: (s) => s.includes("grok-imagine") || s.includes("grok-image"),
    describe: "xAI Grok Imagine — fresh photoreal generation.",
    imageSpec: {
      blurb: "xAI photoreal image",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Premium",
    },
  },
  {
    key: "mai-image",
    name: "MAI Image 2.5",
    provider: "vercel",
    tag: "Microsoft image",
    match: (s) => s.includes("mai-image") || s.includes("mai-2-5"),
    describe: "Microsoft MAI Image 2.5 — fast, balanced image generation.",
    imageSpec: {
      blurb: "Balanced fast image",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Standard",
    },
  },
  {
    key: "z-image",
    name: "Z Image",
    provider: "vercel",
    tag: "Cheapest image",
    match: (s) => s.includes("z-image"),
    describe: "WaveSpeed Z Image — ultra-cheap fast image generation.",
    imageSpec: {
      blurb: "Ultra cheap image",
      dim: "1024 × 1024",
      aspect: "1:1 · 16:9 · 9:16",
      quality: "Fast",
    },
  },
  // ── Recraft ────────────────────────────────────────────────
  {
    key: "recraft",
    name: "Recraft V4.1",
    provider: "recraft",
    tag: "Brand & vector",
    match: (s) => s.startsWith("recraft") || s.includes("recraft"),
    describe: "Brand illustration, 20+ presets, native vector output.",
    imageSpec: {
      blurb: "Brand & vector art",
      dim: "2048 × 2048",
      aspect: "1:1 · 16:9 · 9:16 · 4:3 · 3:4",
      quality: "Pro",
    },
  },
];

const FALLBACK: FamilyDef = {
  key: "other",
  name: "Other",
  provider: "vercel",
  tag: "",
  match: () => true,
};

export function familyFor(slug: string): FamilyDef {
  // Strip provider prefixes ("ws-" for WaveSpeed) so a model like
  // "ws-gemini-3-pro-image" still resolves to the "nano-banana-pro" family.
  const normalised = slug.replace(/^ws-/, "");
  return (
    FAMILIES.find((f) => f.match(slug)) ?? FAMILIES.find((f) => f.match(normalised)) ?? FALLBACK
  );
}

// Variant short label for a video model (T2V / I2V / R2V / Edit)
export function videoVariantLabel(m: FalVideoModel): { short: string; long: string } {
  const slug = m.slug;
  if (slug.includes("videoedit") || slug.includes("video-edit"))
    return { short: "Edit", long: "Video Edit" };
  if (slug.includes("r2v") || slug.endsWith("-r2v"))
    return { short: "R→V", long: "Reference to Video" };
  if (slug.includes("i2v") || slug.endsWith("-i2v"))
    return { short: "I→V", long: "Image to Video" };
  if (slug.includes("t2v") || slug.endsWith("-t2v")) return { short: "T→V", long: "Text to Video" };
  if (slug.includes("vace")) return { short: "Edit", long: "Video Edit" };
  if (slug.includes("fast")) return { short: "Fast", long: "Fast tier" };
  return { short: "Video", long: "Video" };
}

// Variant short label for an image model — usually a tier (Pro/Max/Standard)
export function imageVariantLabel(m: FalImageModel): { short: string; long: string } {
  const name = m.display_name.toLowerCase();
  const slug = m.slug.toLowerCase();
  if (name.includes("max") || slug.includes("max")) return { short: "Max", long: "Max tier" };
  if (name.includes("pro") || slug.includes("pro")) return { short: "Pro", long: "Pro tier" };
  if (name.includes("fast") || slug.includes("fast")) return { short: "Fast", long: "Fast tier" };
  if (name.includes("edit") || slug.includes("edit") || slug.includes("kontext"))
    return { short: "Edit", long: "Editing" };
  if (name.includes("nano") || slug.includes("nano")) return { short: "Fast", long: "Fast tier" };
  return { short: "Std", long: "Standard" };
}

export type ImageFamilyGroup = {
  def: FamilyDef;
  variants: FalImageModel[];
  primary: FalImageModel;
};
export type VideoFamilyGroup = {
  def: FamilyDef;
  variants: FalVideoModel[];
  primary: FalVideoModel;
};

export function groupImageModels(models: FalImageModel[]): ImageFamilyGroup[] {
  const map = new Map<string, FalImageModel[]>();
  for (const m of models) {
    const f = familyFor(m.slug);
    const arr = map.get(f.key) ?? [];
    arr.push(m);
    map.set(f.key, arr);
  }
  const rank = (key: string) => {
    const i = IMAGE_RANK.indexOf(key);
    return i === -1 ? 999 : i;
  };
  return Array.from(map.entries())
    .map(([key, variants]) => {
      const def = FAMILIES.find((f) => f.key === key) ?? FALLBACK;
      const sorted = [...variants].sort((a, b) => a.sort_order - b.sort_order);
      return { def, variants: sorted, primary: sorted[0] };
    })
    .sort((a, b) => rank(a.def.key) - rank(b.def.key));
}

export function groupVideoModels(models: FalVideoModel[]): VideoFamilyGroup[] {
  const map = new Map<string, FalVideoModel[]>();
  for (const m of models) {
    const f = familyFor(m.slug);
    const arr = map.get(f.key) ?? [];
    arr.push(m);
    map.set(f.key, arr);
  }
  const rank = (key: string) => {
    const i = VIDEO_RANK.indexOf(key);
    return i === -1 ? 999 : i;
  };
  return Array.from(map.entries())
    .map(([key, variants]) => {
      const def = FAMILIES.find((f) => f.key === key) ?? FALLBACK;
      const sorted = [...variants].sort((a, b) => a.sort_order - b.sort_order);
      return { def, variants: sorted, primary: sorted[0] };
    })
    .sort((a, b) => rank(a.def.key) - rank(b.def.key));
}

// ── Global popularity ranking (most powerful / most-used → least) ──────────
// Drives the order of family cards in the image / video model pickers.
const IMAGE_RANK = [
  "nano-banana-pro", // Gemini 3 Pro Image — current SOTA
  "gpt-image-2", // OpenAI GPT Image 2 — SOTA
  "nano-banana", // Nano Banana 2 (Gemini 3.1 Flash Image)
  "flux-2", // FLUX.2
  "seedream", // Seedream 4.5
  "imagen-4", // Google Imagen 4 (WaveSpeed)
  "ideogram-v4", // Ideogram V4 (WaveSpeed)
  "flux-kontext", // FLUX Kontext (editing)
  "qwen-image", // Qwen Image 2.0
  "gpt-image-1", // GPT Image 1
  "grok-imagine", // xAI Grok Imagine
  "mai-image", // Microsoft MAI Image 2.5
  "gemini-2-5-image", // Original Nano Banana
  "recraft", // Recraft V4.1
  "wan-2-7", // Wan 2.7 (all-in-one — also covers image)
  "wan-2-5",
  "flux-2-klein",
  "flux-schnell",
  "wanx-2-1",
  "wanx-2-0",
  "wanx-v1",
  "z-image", // Cheapest fallback
];

const VIDEO_RANK = [
  "veo-3-1", // Veo 3.1 — 4K + audio flagship
  "sora-2", // OpenAI Sora 2
  "kling-3", // Kling 3.0
  "runway", // Runway Gen-4.5
  "seedance-2", // ByteDance Seedance 2.0
  "hailuo", // MiniMax Hailuo 2.3 — huge global usage
  "wan-2-7", // Wan 2.7 — Alibaba flagship
  "happyhorse-r2v", // HappyHorse R2V — #1 globally for reference-to-video
  "happyhorse-i2v", // HappyHorse I2V
  "veo-3-0", // Veo 3
  "kling-2-5", // Kling 2.5 Turbo
  "happyhorse-t2v", // HappyHorse T2V
  "happyhorse-videoedit", // HappyHorse Video Edit
  "luma-ray", // Luma Ray 3
  "pixverse", // PixVerse V6
  "pika", // Pika 2.5
  "wan-2-2",
  "wan-2-1-vace",
  "seedance-1",
  "gemini-video",
  "firefly",
  "grok-video",
];

// ── Smart router ───────────────────────────────────────────────
export interface RouteInputs {
  hasImage: boolean; // at least one attached image
  hasRefs: boolean; // 2+ reference images
  hasStartEndFrame: boolean;
}

function slugMatches(slug: string, keys: string[]): boolean {
  const s = slug.toLowerCase();
  return keys.some((k) => s.includes(k));
}

/** Pick the best image variant for the user's current inputs. */
export function pickBestImageVariant(
  variants: FalImageModel[],
  inputs: RouteInputs,
): FalImageModel {
  if (variants.length === 1) return variants[0];
  if (inputs.hasImage) {
    const edit = variants.find((v) => slugMatches(v.slug, ["edit", "kontext"]));
    if (edit) return edit;
  }
  const tierRank = (v: FalImageModel) => {
    const s = v.slug.toLowerCase();
    if (s.includes("max")) return 3;
    if (s.includes("pro")) return 2;
    if (s.includes("fast") || s.includes("nano")) return 0;
    return 1;
  };
  return [...variants].sort((a, b) => tierRank(b) - tierRank(a) || a.sort_order - b.sort_order)[0];
}

/** Pick the best video variant for the user's current inputs. */
export function pickBestVideoVariant(
  variants: FalVideoModel[],
  inputs: RouteInputs,
): FalVideoModel {
  if (variants.length === 1) return variants[0];
  const find = (...keys: string[]) => variants.find((v) => slugMatches(v.slug, keys));

  if (inputs.hasStartEndFrame) return find("i2v") ?? find("frame") ?? variants[0];
  if (inputs.hasRefs) return find("r2v", "reference") ?? find("i2v") ?? find("t2v") ?? variants[0];
  if (inputs.hasImage) return find("i2v") ?? find("t2v") ?? variants[0];
  return find("t2v") ?? find("i2v") ?? variants[0];
}

/** Re-route to the best sibling variant within the same family for current
 *  inputs. Returns null when the active model is already the best fit. */
export function rerouteWithinFamily<T extends FalImageModel | FalVideoModel>(
  current: T,
  pool: T[],
  inputs: RouteInputs,
  kind: "image" | "video",
): T | null {
  const fam = familyFor(current.slug);
  const siblings = pool.filter((m) => familyFor(m.slug).key === fam.key);
  if (siblings.length <= 1) return null;
  const best =
    kind === "video"
      ? (pickBestVideoVariant(siblings as FalVideoModel[], inputs) as T)
      : (pickBestImageVariant(siblings as FalImageModel[], inputs) as T);
  if (best.slug === current.slug) return null;
  return best;
}
