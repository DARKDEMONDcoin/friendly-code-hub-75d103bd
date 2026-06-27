// Smart Model Families — group variants (T2V/I2V/R2V/Edit/Image) under one family.
// The picker shows ONE card per family, then routes to the right variant based on
// the user's inputs (prompt only → T2V; image only → I2V; refs → R2V; video → Edit).
//
// Credits use a simple, transparent ratio: 1 USD ≈ 100 MC.
// Video credits are computed against an 8-second reference clip (or the model's
// fixed per-video price), so what users see on /plans-models matches the real
// generation cost they pay in the studio.

import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Type,
  Image as ImageIcon,
  Edit,
  Palette,
  Film,
  Video,
  Wand2,
  Scissors,
  Camera,
  Mic,
  Layers,
} from "lucide-react";

export type Capability =
  | "t2i" // text → image
  | "image-edit" // image + prompt → image
  | "t2v" // text → video
  | "i2v" // first image → video
  | "r2v" // reference images → video
  | "video-edit" // video → video
  | "lipsync"; // audio + video → lipsynced

export const CAPABILITY_META: Record<
  Capability,
  { label: string; icon: LucideIcon; short: string }
> = {
  t2i: { label: "Text to Image", icon: Type, short: "T→I" },
  "image-edit": { label: "Image Editing", icon: Edit, short: "Edit" },
  t2v: { label: "Text to Video", icon: Film, short: "T→V" },
  i2v: { label: "Image to Video", icon: Video, short: "I→V" },
  r2v: { label: "Reference to Video", icon: Layers, short: "R→V" },
  "video-edit": { label: "Video Editing", icon: Scissors, short: "V→V" },
  lipsync: { label: "Lipsync", icon: Mic, short: "Sync" },
};

export type ProviderKey =
  | "alibaba"
  | "vercel"
  | "bytedance"
  | "google"
  | "openai"
  | "bfl"
  | "recraft"
  | "kling"
  | "dashscope"
  | "qwen"
  | "gemini"
  | "flux"
  | "runway"
  | "luma"
  | "pika"
  | "ideogram"
  | "pixverse"
  | "minimax"
  | "hailuo"
  | "stability"
  | "firefly"
  | "xai"
  | "grok"
  | "sora"
  | "happyhorse";

export interface FamilyVariant {
  capability: Capability;
  modelId: string; // edge function model id (matches openrouter-media MODELS)
  credits: number; // MC per generation (8s reference clip for video)
  badge?: "NEW" | "PRO" | "TOP";
  note?: string;
}

export interface ModelFamily {
  id: string;
  name: string; // clean display name (NO company)
  description: string;
  provider: ProviderKey; // logo provider
  /** Kept for backwards compatibility; the UI no longer renders company names. */
  providerLabel: string;
  icon: LucideIcon;
  hero?: string; // optional headline (TOP / NEW / PRO)
  unlimitedForSubscribers: boolean;
  variants: FamilyVariant[];
}

// Helpers — keep prices consistent with the DB (`image_models.unit_cost_usd` and
// `video_models.cost_per_second_usd`).  Update both places together.
const imgMC = (usd: number) => Math.max(1, Math.round(usd * 100));
const vidMC = (usdPerSec: number, sec = 8) => Math.max(1, Math.round(usdPerSec * sec * 100));

export const MODEL_FAMILIES: ModelFamily[] = [
  // ───── Wan 2.7 ─────
  {
    id: "wan-2-7",
    name: "Wan 2.7",
    description: "Flagship all-in-one family: image, video and editing in one model.",
    provider: "alibaba",
    providerLabel: "",
    icon: Sparkles,
    hero: "TOP",
    unlimitedForSubscribers: true,
    variants: [
      {
        capability: "t2i",
        modelId: "wan-2-7-image-pro",
        credits: imgMC(0.08),
        badge: "TOP",
        note: "4K, multi-ref, 1000-token text",
      },
      { capability: "t2i", modelId: "wan-2-7-image", credits: imgMC(0.04) },
      {
        capability: "t2v",
        modelId: "wan-2-7-t2v",
        credits: vidMC(0.15),
        badge: "TOP",
        note: "Up to 15s, 1080p with audio",
      },
      {
        capability: "i2v",
        modelId: "wan-2-7-i2v",
        credits: vidMC(0.15),
        badge: "PRO",
        note: "First+Last frame, lipsync",
      },
      {
        capability: "video-edit",
        modelId: "wan-2-7-videoedit",
        credits: vidMC(0.15),
        badge: "NEW",
        note: "Outfit / background / object swap",
      },
    ],
  },
  // ───── Wan 2.1 VACE Plus ─────
  {
    id: "wan-2-1-vace",
    name: "Wan 2.1 VACE",
    description: "Video repaint, local edit, extension and frame expansion.",
    provider: "alibaba",
    providerLabel: "",
    icon: Scissors,
    unlimitedForSubscribers: true,
    variants: [{ capability: "video-edit", modelId: "wan-2-1-vace-plus", credits: vidMC(0.07) }],
  },
  // ───── HappyHorse 1.0 ─────
  {
    id: "happyhorse",
    name: "HappyHorse 1.0",
    description: "Cinematic video — #1 globally for reference-to-video and camera control.",
    provider: "alibaba",
    providerLabel: "",
    icon: Camera,
    hero: "TOP",
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2v", modelId: "happyhorse-t2v", credits: vidMC(0.28), badge: "NEW" },
      {
        capability: "i2v",
        modelId: "happyhorse-i2v",
        credits: vidMC(0.28),
        badge: "NEW",
        note: "Cinematic camera control",
      },
      {
        capability: "r2v",
        modelId: "happyhorse-r2v",
        credits: vidMC(0.28),
        badge: "TOP",
        note: "Up to 9 reference images",
      },
      {
        capability: "video-edit",
        modelId: "happyhorse-videoedit",
        credits: vidMC(0.28),
        note: "Up to 5 reference images",
      },
    ],
  },
  // ───── Qwen Image 2.0 ─────
  {
    id: "qwen-image",
    name: "Qwen Image 2.0",
    description: "Best-in-class typography plus style / pose / object editing.",
    provider: "qwen",
    providerLabel: "",
    icon: Type,
    unlimitedForSubscribers: true,
    variants: [
      {
        capability: "t2i",
        modelId: "qwen-image-2-0-pro",
        credits: imgMC(0.075),
        badge: "PRO",
        note: "2K, multi-image edit",
      },
      { capability: "t2i", modelId: "qwen-image-2-0", credits: imgMC(0.02) },
      { capability: "image-edit", modelId: "qwen-image-2-0", credits: imgMC(0.02), badge: "NEW" },
    ],
  },

  // ───── FLUX.2 ─────
  {
    id: "flux-2",
    name: "FLUX.2",
    description: "Commercial-grade image gen with up to 10 references and 4 MP output.",
    provider: "bfl",
    providerLabel: "",
    icon: Sparkles,
    hero: "TOP",
    unlimitedForSubscribers: true,
    variants: [
      {
        capability: "t2i",
        modelId: "flux-2-max",
        credits: imgMC(0.07),
        badge: "TOP",
        note: "Up to 10 refs, 4 MP",
      },
      { capability: "t2i", modelId: "flux-2-pro", credits: imgMC(0.03), badge: "PRO" },
      { capability: "t2i", modelId: "flux-2-flex", credits: imgMC(0.05) },
    ],
  },
  // ───── FLUX.2 Klein ─────
  {
    id: "flux-2-klein",
    name: "FLUX.2 Klein",
    description: "Lightweight FLUX.2 tier for fast, cheap iteration.",
    provider: "bfl",
    providerLabel: "",
    icon: Sparkles,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2i", modelId: "flux-2-klein-9b", credits: imgMC(0.015) },
      { capability: "t2i", modelId: "flux-2-klein-4b", credits: imgMC(0.014) },
    ],
  },
  // ───── FLUX Kontext ─────
  {
    id: "flux-kontext",
    name: "FLUX Kontext",
    description: "Context-aware image editing and typography.",
    provider: "bfl",
    providerLabel: "",
    icon: Edit,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "image-edit", modelId: "flux-kontext-max", credits: imgMC(0.08), badge: "PRO" },
      { capability: "image-edit", modelId: "flux-kontext-pro", credits: imgMC(0.04) },
    ],
  },
  // ───── FLUX Schnell ─────
  {
    id: "flux-schnell",
    name: "FLUX Schnell",
    description: "Ultra-fast, ultra-cheap image generation.",
    provider: "bfl",
    providerLabel: "",
    icon: Wand2,
    unlimitedForSubscribers: true,
    variants: [{ capability: "t2i", modelId: "flux-fast-schnell", credits: imgMC(0.003) }],
  },

  // ───── GPT Image 2 ─────
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    description: "Native editing, inpainting and flexible aspect ratios.",
    provider: "openai",
    providerLabel: "",
    icon: ImageIcon,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2i", modelId: "gpt-image-2", credits: imgMC(0.08), badge: "NEW" },
      { capability: "image-edit", modelId: "gpt-image-2", credits: imgMC(0.08) },
    ],
  },
  // ───── GPT Image 1 ─────
  {
    id: "gpt-image-1",
    name: "GPT Image 1",
    description: "Original GPT Image with editing — plus a cheaper mini tier.",
    provider: "openai",
    providerLabel: "",
    icon: ImageIcon,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2i", modelId: "gpt-image-1", credits: imgMC(0.04) },
      {
        capability: "t2i",
        modelId: "gpt-image-1-mini",
        credits: imgMC(0.01),
        note: "Cheaper mini tier",
      },
    ],
  },

  // ───── Nano Banana Pro ─────
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    description: "High-res reasoning with Google Search grounding.",
    provider: "gemini",
    providerLabel: "",
    icon: Sparkles,
    hero: "PRO",
    unlimitedForSubscribers: true,
    variants: [
      {
        capability: "t2i",
        modelId: "gemini-3-pro-image",
        credits: imgMC(0.15),
        badge: "TOP",
        note: "4K + search grounding",
      },
      { capability: "image-edit", modelId: "gemini-3-pro-image", credits: imgMC(0.15) },
    ],
  },
  // ───── Nano Banana 2 ─────
  {
    id: "nano-banana",
    name: "Nano Banana 2",
    description: "Fast image generation and editing.",
    provider: "gemini",
    providerLabel: "",
    icon: Sparkles,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2i", modelId: "nano-banana-2", credits: imgMC(0.08), badge: "PRO" },
      { capability: "image-edit", modelId: "nano-banana-2", credits: imgMC(0.08) },
    ],
  },

  // ───── Seedream 4.5 ─────
  {
    id: "seedream",
    name: "Seedream 4.5",
    description: "Strong stylization and image editing.",
    provider: "bytedance",
    providerLabel: "",
    icon: Palette,
    unlimitedForSubscribers: true,
    variants: [
      { capability: "t2i", modelId: "seedream-4-5", credits: imgMC(0.04) },
      { capability: "image-edit", modelId: "seedream-4-5", credits: imgMC(0.04) },
    ],
  },
  // ───── Seedance 2.0 ─────
  {
    id: "seedance-2",
    name: "Seedance 2.0",
    description: "Video family — T2V / I2V / Ref2V / Edit with multilingual audio.",
    provider: "bytedance",
    providerLabel: "",
    icon: Film,
    hero: "TOP",
    unlimitedForSubscribers: false,
    variants: [
      {
        capability: "t2v",
        modelId: "seedance-2-0",
        credits: vidMC(0.3),
        badge: "TOP",
        note: "Up to 15s, multimodal refs",
      },
      { capability: "i2v", modelId: "seedance-2-0", credits: vidMC(0.3) },
      { capability: "r2v", modelId: "seedance-2-0", credits: vidMC(0.3) },
      {
        capability: "t2v",
        modelId: "seedance-2-0-fast",
        credits: vidMC(0.15),
        badge: "PRO",
        note: "Faster, cheaper tier",
      },
      { capability: "i2v", modelId: "seedance-2-0-fast", credits: vidMC(0.15) },
    ],
  },
  // ───── Seedance 1.0 ─────
  {
    id: "seedance-1",
    name: "Seedance 1.0",
    description: "Affordable cinematic text-to-video and image-to-video tiers.",
    provider: "bytedance",
    providerLabel: "",
    icon: Film,
    unlimitedForSubscribers: false,
    variants: [
      { capability: "t2v", modelId: "seedance-1-0-pro", credits: vidMC(0.1) },
      {
        capability: "t2v",
        modelId: "seedance-1-0-lite-t2v",
        credits: vidMC(0.05),
        note: "Lite tier",
      },
      { capability: "i2v", modelId: "seedance-1-0-lite-i2v", credits: vidMC(0.05) },
    ],
  },

  // ───── Veo 3.1 ─────
  {
    id: "veo-3-1",
    name: "Veo 3.1",
    description: "Flagship cinematic text-to-video and image-to-video.",
    provider: "google",
    providerLabel: "",
    icon: Film,
    hero: "TOP",
    unlimitedForSubscribers: false,
    variants: [
      {
        capability: "t2v",
        modelId: "veo-3-1",
        credits: vidMC(0.4),
        badge: "TOP",
        note: "High quality",
      },
      { capability: "i2v", modelId: "veo-3-1", credits: vidMC(0.4) },
      {
        capability: "t2v",
        modelId: "veo-3-1-fast",
        credits: vidMC(0.2),
        badge: "PRO",
        note: "Faster, cheaper tier",
      },
      { capability: "i2v", modelId: "veo-3-1-fast", credits: vidMC(0.2) },
    ],
  },
  // ───── Veo 3.0 ─────
  {
    id: "veo-3-0",
    name: "Veo 3.0",
    description: "Standard cinematic video (standard and fast tiers).",
    provider: "google",
    providerLabel: "",
    icon: Film,
    unlimitedForSubscribers: false,
    variants: [
      { capability: "t2v", modelId: "veo-3-0", credits: vidMC(0.2) },
      { capability: "i2v", modelId: "veo-3-0", credits: vidMC(0.2) },
      {
        capability: "t2v",
        modelId: "veo-3-0-fast",
        credits: vidMC(0.1),
        note: "Faster, cheaper tier",
      },
      { capability: "i2v", modelId: "veo-3-0-fast", credits: vidMC(0.1) },
    ],
  },

  // ───── Kling 3.0 ─────
  {
    id: "kling-3",
    name: "Kling 3.0",
    description: "Cinematic text-to-video and image-to-video.",
    provider: "kling",
    providerLabel: "",
    icon: Camera,
    unlimitedForSubscribers: false,
    variants: [
      { capability: "t2v", modelId: "kling-v3-0-t2v", credits: vidMC(0.1) },
      {
        capability: "i2v",
        modelId: "kling-v3-0-i2v",
        credits: vidMC(0.1),
        badge: "PRO",
        note: "Image-to-video",
      },
    ],
  },
  // ───── Kling 2.5 Turbo ─────
  {
    id: "kling-2-5",
    name: "Kling 2.5 Turbo",
    description: "Fast, affordable text-to-video and image-to-video.",
    provider: "kling",
    providerLabel: "",
    icon: Camera,
    unlimitedForSubscribers: false,
    variants: [
      { capability: "t2v", modelId: "kling-v2-5-turbo-t2v", credits: vidMC(0.07) },
      { capability: "i2v", modelId: "kling-v2-5-turbo-i2v", credits: vidMC(0.07) },
    ],
  },

  // ───── Recraft V4.1 ─────
  {
    id: "recraft",
    name: "Recraft V4.1",
    description: "Brand illustration, 20+ presets and native vector output.",
    provider: "recraft",
    providerLabel: "",
    icon: Palette,
    unlimitedForSubscribers: true,
    variants: [{ capability: "t2i", modelId: "recraft-v4-1", credits: imgMC(0.04) }],
  },
];

// Smart router: given inputs (prompt/image/refs/video), pick the right variant.
export type RouteInputs = {
  hasPrompt: boolean;
  hasImage: boolean;
  hasRefs: boolean; // 2+ reference images
  hasVideo: boolean;
  hasAudio: boolean;
};

export function pickVariant(family: ModelFamily, inputs: RouteInputs): FamilyVariant | null {
  const has = (c: Capability) => family.variants.find((v) => v.capability === c);
  // Priority: video editing > lipsync > r2v > i2v > t2v > image-edit > t2i
  if (inputs.hasVideo) return has("video-edit") || has("lipsync") || null;
  if (inputs.hasAudio && (inputs.hasImage || inputs.hasVideo))
    return has("lipsync") || has("video-edit") || null;
  if (inputs.hasRefs) return has("r2v") || has("image-edit") || has("t2i") || null;
  if (inputs.hasImage) {
    return has("i2v") || has("image-edit") || has("t2i") || null;
  }
  if (inputs.hasPrompt) {
    return has("t2v") || has("t2i") || family.variants[0] || null;
  }
  return family.variants[0] || null;
}

export const findFamily = (id: string) => MODEL_FAMILIES.find((f) => f.id === id);
