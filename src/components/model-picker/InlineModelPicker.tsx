import { useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { type ModelDetail, HIDDEN_DUPLICATE_IDS } from "@/lib/modelDetails";
import { useDynamicModels } from "@/hooks/useModels";
import type { ModelOption } from "./ModelSelector";

const MODEL_BADGES: Record<string, string[]> = {
  "nano-banana-2": ["Multi-Image Input", "4K"],
  "nano-banana-pro": ["Multi-Image Input", "4K"],
  "seedream-4": ["Multi-Image Input", "3K"],
  "seedream-5-lite": ["Multi-Image Input", "4K"],
  "gpt-image": ["Multi-Image Input", "4K"],
  "gpt-image-1": ["Multi-Image Input", "1K"],
  "ideogram-3": ["1K", "Styles"],
  "flux-kontext": ["Image Input", "2K"],
  "flux-2-pro": ["Image Input", "2K"],
  "grok-imagine": ["Image Input", "1K"],
  "recraft-v4": ["2K"],
  "lucid-origin": ["Style Ref", "Content Ref"],
  "imagineart-1.5": ["Multi-Image Input", "4K"],
  "fal-hidream-i1": ["Multi-Image Input", "2K"],
  "fal-aura-v2": ["1K"],
  "fal-flux-realism": ["2K"],
  "megsy-v1-img": ["Image Ref"],
};

// Real provider logos (from public/model-logos/)
const MODEL_LOGOS: Record<string, string> = {
  // Image models
  "megsy-v1-img": "/model-logos/megsy.png",
  "gpt-image": "/model-logos/openai.svg",
  "gpt-image-1": "/model-logos/openai.svg",
  "nano-banana-2": "/model-logos/google.ico",
  "nano-banana-pro": "/model-logos/google.ico",
  "flux-kontext": "/model-logos/bfl.webp",
  "flux-2-pro": "/model-logos/bfl.webp",
  "fal-flux-realism": "/model-logos/bfl.webp",
  "ideogram-3": "/model-logos/ideogram.webp",
  "seedream-4": "/model-logos/bytedance.ico",
  "seedream-5-lite": "/model-logos/bytedance.ico",
  "recraft-v4": "/model-logos/recraft.webp",

  "imagineart-1.5": "/model-logos/fal.ico",
  "fal-hidream-i1": "/model-logos/fal.ico",
  "fal-aura-v2": "/model-logos/fal.ico",
  // Video models
  "megsy-video": "/model-logos/megsy.png",
  "megsy-video-i2v": "/model-logos/megsy.png",
  "veo-3.1": "/model-logos/google.ico",
  "veo-3.1-fast": "/model-logos/google.ico",
  "veo-3.1-fast-i2v": "/model-logos/google.ico",
  "kling-3-pro": "/model-logos/kling.webp",
  "kling-3-pro-i2v": "/model-logos/kling.webp",
  "kling-o1": "/model-logos/kling.webp",
  "kling-o1-i2v": "/model-logos/kling.webp",
  "kling-avatar-pro": "/model-logos/kling.webp",
  "kling-avatar-std": "/model-logos/kling.webp",
  "openai-sora": "/model-logos/openai.svg",
  "openai-sora-i2v": "/model-logos/openai.svg",
  "pika-2.2": "/model-logos/pika.webp",
  "luma-dream": "/model-logos/luma.webp",
  "seedance-pro": "/model-logos/bytedance.ico",
  "wan-2.6": "/model-logos/fal.ico",
  "wan-2.6-i2v": "/model-logos/fal.ico",
  "wan-flf": "/model-logos/fal.ico",
  "pixverse-5.5": "/model-logos/pika.webp",
  "pixverse-5.5-i2v": "/model-logos/pika.webp",
  sadtalker: "/model-logos/fal.ico",
  "sync-lipsync": "/model-logos/fal.ico",
};

const NEW_MODELS = ["nano-banana-2", "seedream-5-lite", "ideogram-3", "veo-3.1", "kling-3-pro"];

const VIDEO_BADGES: Record<string, string[]> = {
  "veo-3.1": ["Audio", "8s"],
  "veo-3.1-fast": ["Fast", "5s"],
  "kling-3-pro": ["Cinematic", "10s"],
  "kling-o1": ["Balanced", "5s"],
  "openai-sora": ["Realistic", "5s"],
  "pika-2.2": ["Creative", "4s"],
  "luma-dream": ["Smooth", "5s"],
  "seedance-pro": ["Budget", "5s"],
  "megsy-video": ["Default", "5s"],
  "wan-2.6": ["Open-source", "5s"],
  "pixverse-5.5": ["Effects", "5s"],
};

interface InlineModelPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (model: ModelOption) => void;
  selectedModelId: string;
  mode?: "images" | "videos";
}

const InlineModelPicker = ({
  open,
  onClose,
  onSelect,
  selectedModelId,
  mode = "images",
}: InlineModelPickerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { models: allModels } = useDynamicModels();

  const models = useMemo(() => {
    const visible = allModels.filter((m) => !HIDDEN_DUPLICATE_IDS.includes(m.id));
    if (mode === "videos") {
      return visible.filter((m) => m.type === "video" || m.type === "video-i2v");
    }
    return visible.filter((m) => m.type === "image");
  }, [mode, allModels]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const handleSelect = (model: ModelDetail) => {
    onSelect({
      id: model.id,
      name: model.name,
      credits: model.credits.toString(),
      requiresImage: model.requiresImage,
      category: "model",
    });
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] z-[70] md:absolute md:bottom-full md:left-0 md:right-0 md:mb-2 md:z-40"
        >
          <div className="max-w-4xl mx-auto">
            <div className="bg-surface-1 text-brand-parchment border-[2.5px] border-brand-ink rounded-[24px] shadow-[4px_4px_0_rgba(59,130,246,0.24)] overflow-hidden max-h-[74dvh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-surface-4 shrink-0">
                <h2 className="text-sm font-black text-brand-parchment">Models</h2>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-brand-ink bg-brand-action border-2 border-brand-ink active:translate-x-[1px] active:translate-y-[1px] transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Model Grid */}
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-2 gap-2">
                  {models.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    const isNew = NEW_MODELS.includes(model.id);
                    const isFree = model.credits === 0;
                    const badges =
                      mode === "videos"
                        ? VIDEO_BADGES[model.id] || []
                        : MODEL_BADGES[model.id] || [];
                    const logo = MODEL_LOGOS[model.id];
                    const isMegsyVideo =
                      model.id === "megsy-video" || model.id === "megsy-video-i2v";
                    const subscriberOnly = mode === "images" || isMegsyVideo;

                    // iOS 26 glass badge style
                    const glassBadge =
                      "text-[9px] px-1.5 py-0.5 rounded-md border border-white/15 bg-white/10 text-foreground/85 font-medium backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";

                    return (
                      <motion.button
                        key={model.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleSelect(model)}
                        className={`relative flex flex-col p-3.5 rounded-[18px] text-left transition-all duration-300 border-2 ${
                          isSelected
                            ? "bg-brand-action text-brand-ink border-brand-ink shadow-[3px_3px_0_rgba(59,130,246,0.28)]"
                            : "bg-surface-3 text-brand-parchment border-surface-4 hover:bg-[#242424]"
                        }`}
                      >
                        {/* Selected check */}
                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand-ink text-brand-action flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}

                        {/* Top row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {logo && (
                            <img
                              src={logo}
                              alt=""
                              className="w-5 h-5 rounded-md object-contain pointer-events-auto"
                            />
                          )}
                          <span
                            className={`text-[13px] font-black ${isSelected ? "text-brand-ink" : "text-white"}`}
                          >
                            {model.name}
                          </span>
                          {/* NEW / PRO chips removed per design */}
                        </div>

                        {/* Credits */}
                        {!subscriberOnly && model.credits > 0 && (
                          <div className="flex items-center justify-end mt-1">
                            <span
                              className={`text-[10px] font-black ${isSelected ? "text-brand-ink" : "text-brand-mint"}`}
                            >
                              {model.credits} MC
                            </span>
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InlineModelPicker;
