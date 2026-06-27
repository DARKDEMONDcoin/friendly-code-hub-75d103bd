// Brand icons from @lobehub/icons. Falls back to provided thumbnail or null.
import Flux from "@lobehub/icons/es/Flux";
import Bfl from "@lobehub/icons/es/Bfl";
import OpenAI from "@lobehub/icons/es/OpenAI";
import Gemini from "@lobehub/icons/es/Gemini";
import NanoBanana from "@lobehub/icons/es/NanoBanana";
import Ideogram from "@lobehub/icons/es/Ideogram";
import Recraft from "@lobehub/icons/es/Recraft";
import ByteDance from "@lobehub/icons/es/ByteDance";
import Doubao from "@lobehub/icons/es/Doubao";
import Alibaba from "@lobehub/icons/es/Alibaba";
import Kling from "@lobehub/icons/es/Kling";
import Minimax from "@lobehub/icons/es/Minimax";
import Runway from "@lobehub/icons/es/Runway";
import Stability from "@lobehub/icons/es/Stability";
import Grok from "@lobehub/icons/es/Grok";
import XAI from "@lobehub/icons/es/XAI";
import Fal from "@lobehub/icons/es/Fal";

type LobeIcon = any;

function pickBrand(name = "", provider = ""): LobeIcon | null {
  const n = `${name} ${provider}`.toLowerCase();
  if (n.includes("nano banana") || n.includes("nano-banana") || n.includes("nanobanana"))
    return NanoBanana;
  if (n.includes("flux")) return Flux;
  if (n.includes("kontext")) return Flux;
  if (n.includes("bfl")) return Bfl;
  if (n.includes("imagen") || n.includes("gemini") || n.includes("veo")) return Gemini;
  if (n.includes("gpt") || n.includes("openai") || n.includes("dall") || n.includes("sora"))
    return OpenAI;
  if (n.includes("seedream") || n.includes("seedance") || n.includes("doubao")) return Doubao;
  if (n.includes("wanx") || n.includes("wan ") || n.includes("qwen") || n.includes("alibaba"))
    return Alibaba;
  if (n.includes("ideogram")) return Ideogram;
  if (n.includes("recraft")) return Recraft;
  if (n.includes("kling")) return Kling;
  if (n.includes("minimax") || n.includes("hailuo")) return Minimax;
  if (n.includes("runway")) return Runway;
  if (n.includes("stab")) return Stability;
  if (n.includes("grok")) return Grok;
  if (n.includes("xai")) return XAI;
  if (n.includes("bytedance")) return ByteDance;
  if (n.includes("fal")) return Fal;
  return null;
}

interface Props {
  name?: string;
  provider?: string;
  size?: number;
  variant?: "avatar" | "mono";
  className?: string;
}

export function BrandIcon({ name, provider, size = 28, variant = "avatar", className }: Props) {
  const Cmp = pickBrand(name, provider);
  if (!Cmp) return null;
  if (variant === "avatar" && Cmp.Avatar) {
    return <Cmp.Avatar size={size} shape="square" className={className} />;
  }
  return <Cmp size={size} className={className} />;
}

export function hasBrandIcon(name = "", provider = "") {
  return !!pickBrand(name, provider);
}
