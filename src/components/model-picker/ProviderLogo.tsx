// Brand provider logos powered by @lobehub/icons (mono variant tinted with the
// brand's primary color). Falls back to a neutral glyph for unknown providers.
import Alibaba from "@lobehub/icons/es/Alibaba";
import AlibabaCloud from "@lobehub/icons/es/AlibabaCloud";
import Bfl from "@lobehub/icons/es/Bfl";
import ByteDance from "@lobehub/icons/es/ByteDance";
import Flux from "@lobehub/icons/es/Flux";
import Gemini from "@lobehub/icons/es/Gemini";
import Google from "@lobehub/icons/es/Google";
import Kling from "@lobehub/icons/es/Kling";
import OpenAI from "@lobehub/icons/es/OpenAI";
import Qwen from "@lobehub/icons/es/Qwen";
import Recraft from "@lobehub/icons/es/Recraft";
import Runway from "@lobehub/icons/es/Runway";
import Luma from "@lobehub/icons/es/Luma";
import Pika from "@lobehub/icons/es/Pika";
import PixVerse from "@lobehub/icons/es/PixVerse";
import Ideogram from "@lobehub/icons/es/Ideogram";
import Minimax from "@lobehub/icons/es/Minimax";
import Hailuo from "@lobehub/icons/es/Hailuo";
import Stability from "@lobehub/icons/es/Stability";
import AdobeFirefly from "@lobehub/icons/es/AdobeFirefly";
import XAI from "@lobehub/icons/es/XAI";
import Grok from "@lobehub/icons/es/Grok";
import Sora from "@lobehub/icons/es/Sora";

import type { ProviderKey } from "@/lib/modelFamilies";
// Full-color brand marks for providers whose lobehub mono variant doesn't
// match the official identity well on both light and dark themes.
const IMAGE_LOGOS: Record<string, string> = {
  kling: "/model-logos/kling.webp",
  luma: "/model-logos/luma.webp",
  pixverse: "/model-logos/pika.webp",
  happyhorse: "/model-logos/fal.ico",
};

interface Props {
  provider:
    | ProviderKey
    | "gemini"
    | "qwen"
    | "flux"
    | "tongyi"
    | "sora"
    | "hailuo"
    | "firefly"
    | "grok";
  className?: string;
  size?: number;
}

const MAP: Record<string, { Icon: any; color?: string }> = {
  // Wan / VACE / HappyHorse come from Alibaba's Tongyi Lab — use the
  // Tongyi Wanxiang (Qwen-family) mark so they don't look like the
  // generic Alibaba.com orange logo.
  alibaba: { Icon: Qwen, color: Qwen.colorPrimary },
  tongyi: { Icon: Qwen, color: Qwen.colorPrimary },
  dashscope: { Icon: AlibabaCloud, color: AlibabaCloud.colorPrimary },
  qwen: { Icon: Qwen, color: Qwen.colorPrimary },
  bfl: { Icon: Bfl, color: Bfl.colorPrimary },
  flux: { Icon: Flux, color: Flux.colorPrimary },
  // Use the official ChatGPT green so the OpenAI mark doesn't render as a
  // flat black silhouette on dark surfaces.
  openai: { Icon: OpenAI, color: "#10A37F" },
  google: { Icon: Google, color: Google.colorPrimary },
  gemini: { Icon: Gemini, color: Gemini.colorPrimary },
  bytedance: { Icon: ByteDance, color: ByteDance.colorPrimary },
  kling: { Icon: Kling, color: Kling.colorPrimary },
  recraft: { Icon: Recraft, color: Recraft.colorPrimary },
  runway: { Icon: Runway, color: Runway.colorPrimary },
  luma: { Icon: Luma, color: Luma.colorPrimary },
  pika: { Icon: Pika, color: Pika.colorPrimary },
  pixverse: { Icon: PixVerse, color: PixVerse.colorPrimary },
  ideogram: { Icon: Ideogram, color: Ideogram.colorPrimary },
  minimax: { Icon: Minimax, color: Minimax.colorPrimary },
  hailuo: { Icon: Hailuo, color: Hailuo.colorPrimary },
  stability: { Icon: Stability, color: Stability.colorPrimary },
  firefly: { Icon: AdobeFirefly, color: AdobeFirefly.colorPrimary },
  xai: { Icon: XAI },
  grok: { Icon: Grok },
  sora: { Icon: Sora, color: Sora.colorPrimary },
};

export default function ProviderLogo({ provider, className = "", size = 18 }: Props) {
  const imgUrl = IMAGE_LOGOS[provider];
  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain", display: "inline-block" }}
        aria-hidden="true"
      />
    );
  }
  const entry = MAP[provider];
  if (!entry) {
    // Fallback dot
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: "currentColor",
          opacity: 0.4,
          display: "inline-block",
        }}
      />
    );
  }
  const { Icon, color } = entry;
  return <Icon size={size} color={color} className={className} />;
}
