import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Lock,
  Video as VideoIcon,
  Volume2,
  Film,
  Layers,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu as AnimateDropdownMenu,
  DropdownMenuContent as AnimateDropdownMenuContent,
  DropdownMenuItem as AnimateDropdownMenuItem,
  DropdownMenuTrigger as AnimateDropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import type { AgentModel } from "@/lib/agentRegistry";
import { useDynamicModels } from "@/hooks/useModels";
import { isPaidUser } from "@/lib/subscriptionGating";
import type { MediaModelChoice } from "@/components/chat/media/MediaModelPickerSheet";
import type { ChatMode } from "./chatConstants";
import { CHAT_COMPOSER_MODEL_OPTIONS, ComposerModelIcon, getMegsyTierLabel } from "./chatConstants";
import megsyLogo from "@/assets/megsy-icon-transparent.png";
import { BrandIcon, hasBrandIcon } from "@/components/chat/media/BrandIcon";

const menuContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};

const menuItemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 28, stiffness: 300 } },
};

interface Props {
  mode: ChatMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  selectedModel: AgentModel | null;
  megsyTier: "lite" | "pro" | "max";
  userPlan: string;
  mediaModel: MediaModelChoice | null;
  onTierSelect: (tier: "lite" | "pro" | "max") => void;
  onChatModelSelect: (model: { id: string; label: string }) => void;
  onMediaModelSelect: (model: MediaModelChoice) => void;
  noIcon?: boolean;
  variant?: "pill" | "segment";
  centerOnMobile?: boolean;
}

const asMediaChoice = (model: any, mode: "images" | "video"): MediaModelChoice => ({
  slug: model.slug || model.id,
  name: model.name,
  provider: model.provider,
  credits: Number(model.credits) || 0,
  thumbnail: model.thumbnailUrl || model.iconUrl,
  type: mode === "video" ? "video" : "image",
});

export default function ComposerModelMenu({
  mode,
  open,
  onOpenChange,
  side = "top",
  align = "end",
  selectedModel,
  megsyTier,
  userPlan,
  mediaModel,
  onTierSelect,
  onChatModelSelect,
  onMediaModelSelect,
  noIcon = false,
  variant = "pill",
}: Props) {
  const isMediaMode = mode === "images" || mode === "video";
  const paid = isPaidUser(userPlan);
  const { models: dynamicModels, loading } = useDynamicModels();

  const mediaOptions = useMemo(() => {
    if (!isMediaMode) return [];
    const target = mode === "video" ? ["video", "video-i2v"] : ["image"];
    return dynamicModels
      .filter((model) => target.includes(model.type as string))
      .sort(
        (a, b) =>
          Number(b.isFeatured) - Number(a.isFeatured) || (a.credits || 0) - (b.credits || 0),
      );
  }, [dynamicModels, isMediaMode, mode]);

  useEffect(() => {
    if (!isMediaMode || loading || mediaOptions.length === 0) return;
    if (mediaModel?.type === (mode === "video" ? "video" : "image")) return;
    onMediaModelSelect(asMediaChoice(mediaOptions[0], mode));
  }, [isMediaMode, loading, mediaModel?.type, mediaOptions, mode, onMediaModelSelect]);

  const activeChatOption = CHAT_COMPOSER_MODEL_OPTIONS.find((item) =>
    item.kind === "tier" ? !selectedModel && megsyTier === item.id : selectedModel?.id === item.id,
  );
  const triggerLabel = isMediaMode
    ? mediaModel?.name ||
      (loading ? "Loading models" : mode === "video" ? "Video model" : "Image model")
    : selectedModel?.label || getMegsyTierLabel(megsyTier);

  return (
    <AnimateDropdownMenu open={open} onOpenChange={onOpenChange}>
      <AnimateDropdownMenuTrigger asChild>
        <button
          type="button"
          data-tier-trigger
          className={
            variant === "segment"
              ? "group inline-flex h-11 w-full max-w-full items-center gap-2.5 pl-1 pr-3 text-[13px] font-black text-brand-ink rounded-[18px] bg-brand-action border-[2.5px] border-brand-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition shadow-[3px_3px_0_rgba(0,0,0,0.18)]"
              : "group inline-flex h-9 max-w-[52vw] items-center gap-2 pl-1 pr-1.5 text-[12.5px] font-black text-brand-parchment bg-transparent border-0 hover:opacity-80 active:translate-x-[1px] active:translate-y-[1px] transition-all"
          }
          aria-label="Choose model"
          aria-expanded={open}
        >
          {!noIcon && !(variant === "pill" && isMediaMode) && (
            <span
              className={
                variant === "segment"
                  ? "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-ink text-brand-action border-2 border-brand-ink"
                  : "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent border-0"
              }
            >
              {isMediaMode ? (
                hasBrandIcon(mediaModel?.name, mediaModel?.provider) ? (
                  <BrandIcon name={mediaModel?.name} provider={mediaModel?.provider} size={28} />
                ) : mediaModel?.thumbnail ? (
                  <img src={mediaModel.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : mode === "video" ? (
                  <VideoIcon className="h-3.5 w-3.5 text-foreground/75" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 text-foreground/75" />
                )
              ) : activeChatOption ? (
                <ComposerModelIcon brand={activeChatOption.brand} />
              ) : (
                <img
                  src={megsyLogo}
                  alt=""
                  className="h-[68%] w-[68%] object-contain"
                />
              )}
            </span>
          )}
          <span className="truncate tracking-tight">{triggerLabel}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${variant === "segment" ? "text-brand-ink/70" : "text-brand-muted"} ${open ? "rotate-180" : ""}`}
          />
        </button>
      </AnimateDropdownMenuTrigger>
      <AnimateDropdownMenuContent
        data-tier-menu
        className="z-[61] max-h-[270px] overflow-y-auto overscroll-contain w-[min(340px,calc(100vw-16px))] bg-[#141414] text-brand-parchment border-2 border-surface-4 rounded-[20px] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-none"
        side={side}
        align={align}
        sideOffset={8}
      >
        {isMediaMode ? (
          mediaOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-white/50">
              {loading ? "Loading models…" : "No models available."}
            </div>
          ) : (
            <>
              <div className="px-2.5 pt-1.5 pb-1.5 flex items-center gap-3 whitespace-nowrap">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-muted">
                  {mode === "video" ? "Video models" : "Image models"}
                </span>
              </div>
              <motion.div
                variants={menuContainerVariants}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-1"
              >
                {mediaOptions.map((model) => {
                  const choice = asMediaChoice(model, mode);
                  const active = mediaModel?.slug === choice.slug;
                  const locked = !!model.isPremium && !paid;
                  return (
                    <AnimateDropdownMenuItem
                      key={choice.slug}
                      onClick={() => {
                        if (locked) {
                          toast.info(`${choice.name} is available on premium plans only`);
                          return;
                        }
                        onMediaModelSelect(choice);
                        onOpenChange(false);
                      }}
                      className={`group relative flex w-full items-center gap-2.5 rounded-[14px] px-2 py-1.5 text-left transition-all border ${
                        active
                          ? "bg-surface-3 text-brand-parchment border-brand-action"
                          : "bg-transparent text-brand-parchment border-transparent hover:bg-surface-3"
                      }`}
                    >
                      <motion.div
                        variants={menuItemVariants}
                        className="flex w-full items-center gap-2.5"
                      >
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-4 bg-[#0F0F0F]">
                          <BrandIcon name={choice.name} provider={choice.provider} size={28} />
                          {!hasBrandIcon(choice.name, choice.provider) &&
                            (choice.thumbnail ? (
                              <img
                                src={choice.thumbnail}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : mode === "video" ? (
                              <VideoIcon className="h-3.5 w-3.5 text-white/55" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-white/55" />
                            ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-black leading-tight tracking-tight text-brand-parchment">
                          {choice.name}
                        </span>
                        {locked ? (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-white/45" />
                        ) : active ? (
                          <span className="shrink-0 grid place-items-center h-4 w-4 rounded-full bg-brand-action text-brand-ink">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        ) : null}
                      </motion.div>
                    </AnimateDropdownMenuItem>
                  );
                })}
              </motion.div>
            </>
          )
        ) : (
          <div className="flex flex-col gap-1">
            {CHAT_COMPOSER_MODEL_OPTIONS.map((item) => {
              const locked = item.premium && (userPlan === "free" || userPlan === "trial");
              const active =
                item.kind === "tier"
                  ? !selectedModel && megsyTier === item.id
                  : selectedModel?.id === item.id;
              return (
                <AnimateDropdownMenuItem
                  key={item.id}
                  onClick={() => {
                    if (locked) {
                      toast.info(`${item.label} is available on premium plans only`);
                      return;
                    }
                    if (item.kind === "tier") onTierSelect(item.id as "lite" | "pro" | "max");
                    else onChatModelSelect({ id: item.id, label: item.label });
                    onOpenChange(false);
                  }}
                  className={`flex items-center gap-3 rounded-[16px] px-2.5 py-2.5 text-left transition-all border ${
                    active
                      ? "bg-surface-3 text-brand-parchment border-brand-action"
                      : "bg-transparent text-brand-parchment border-transparent hover:bg-surface-3"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                    <ComposerModelIcon brand={item.brand} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-black leading-tight truncate tracking-tight text-white">
                      {item.label}
                    </span>
                  </span>
                  <span className="shrink-0 w-5 flex items-center justify-end">
                    {locked ? (
                      <Lock className="h-4 w-4 text-white/45" />
                    ) : active ? (
                      <span className="grid place-items-center h-5 w-5 rounded-full bg-brand-action text-brand-ink">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                </AnimateDropdownMenuItem>
              );
            })}
          </div>
        )}
      </AnimateDropdownMenuContent>
    </AnimateDropdownMenu>
  );
}
// ─────────────────────────── helpers ───────────────────────────

type CapChip = { label: string; title: string; icon: React.ReactNode };

function getCapabilityChips(model: any, mode: ChatMode): CapChip[] {
  const chips: CapChip[] = [];
  if (mode === "video") {
    const t2v = Array.isArray(model.modes) && model.modes.includes("text-to-video");
    const i2v = Array.isArray(model.modes) && model.modes.includes("image-to-video");
    if (t2v && i2v) {
      chips.push({
        label: "T+I→V",
        title: "Text & image to video",
        icon: <Wand2 className="h-2.5 w-2.5" />,
      });
    } else if (i2v) {
      chips.push({
        label: "I→V",
        title: "Image to video",
        icon: <ImageIcon className="h-2.5 w-2.5" />,
      });
    } else if (t2v) {
      chips.push({
        label: "T→V",
        title: "Text to video",
        icon: <VideoIcon className="h-2.5 w-2.5" />,
      });
    }
    if (model.supportsStartEndFrame) {
      chips.push({
        label: "End frame",
        title: "Supports start + end frame interpolation",
        icon: <Film className="h-2.5 w-2.5" />,
      });
    }
    if (model.supportsAudio) {
      chips.push({
        label: "Audio",
        title: "Accepts an audio input (lip-sync / score)",
        icon: <Volume2 className="h-2.5 w-2.5" />,
      });
    }
    if (model.supportsMultiImage && model.maxImages > 1) {
      chips.push({
        label: `Refs ×${model.maxImages}`,
        title: `Up to ${model.maxImages} reference images`,
        icon: <Layers className="h-2.5 w-2.5" />,
      });
    }
  } else {
    if (model.acceptsImages) {
      chips.push({
        label: "Refs",
        title: "Accepts reference images",
        icon: <Layers className="h-2.5 w-2.5" />,
      });
    }
  }
  return chips.slice(0, 3);
}
