import {
  GraduationCap,
  FileText,
  Microscope,
  Presentation,
  Image as ImageIcon,
  Video as VideoIcon,
  Globe,
  Check,
  type LucideIcon,
} from "lucide-react";
import type { AgentDef } from "@/lib/agentRegistry";

type DesktopChipId =
  | "website"
  | "images"
  | "video"
  | "deep-research"
  | "slides"
  | "docs"
  | "learning";

interface DesktopModeChipsProps {
  chatMode: string;
  selectedAgent: AgentDef | null;
  handleModeChange: (mode: any) => void;
  setChatMode: (mode: any) => void;
  setSelectedAgent: (agent: AgentDef | null) => void;
  /** Kept for backwards-compat with existing callers; no longer used. */
  tryActivateMegsyOs?: () => void;
  /** When provided, clicking a suggestion fills the composer with its text. */
  setInput?: (value: string) => void;
  /** Slice the chip list — `offset` items skipped from the start. */
  offset?: number;
  /** Slice the chip list — at most `limit` items rendered after `offset`. */
  limit?: number;
}

// Trending English prompts per service. Picked from common search/usage
// patterns so the suggestions feel current and high-intent.
const SUGGESTIONS: Record<DesktopChipId, string[]> = {
  website: [
    "Modern SaaS landing page with pricing",
    "AI startup homepage with waitlist",
    "Restaurant website with online menu",
    "Personal portfolio for a UI designer",
  ],
  images: [
    "Cinematic 3D product shot, studio lighting",
    "Anime-style portrait, vibrant colors",
    "Minimal logo for a coffee brand",
    "Flat icon set, pastel palette",
  ],
  video: [
    "15-second product ad, cinematic",
    "Drone intro of a city skyline at sunset",
    "Talking AI avatar explaining a feature",
    "Animated whiteboard explainer, 30s",
  ],
  "deep-research": [
    "Compare top AI coding tools in 2026",
    "State of the AI agents market this year",
    "Best SEO strategies for SaaS in 2026",
    "Crypto and stablecoin trends report",
  ],
  slides: [
    "Pitch deck for an AI SaaS startup",
    "Quarterly business review, 10 slides",
    "Product launch presentation",
    "Marketing strategy 2026, executive style",
  ],
  docs: [
    "Build a Next.js auth system with JWT",
    "REST API in Python FastAPI + Postgres",
    "React + Supabase realtime chat app",
    "Integrate Stripe subscriptions end-to-end",
  ],
  learning: [
    "Learn Python from scratch, 7-day plan",
    "Master React hooks with examples",
    "SQL for data analysis, beginner to pro",
    "Prompt engineering crash course",
  ],
};

// One hue per mode (used for the resting icon dot) — but the active "pill"
// state collapses to a single blue, matching the Referral landing tab pattern
// ("Dashboard / Program / Tasks" — active = blue pill, white text).
const INK = "hsl(var(--brand-ink))";
const PARCHMENT = "hsl(var(--brand-parchment))";
const SURFACE = "hsl(var(--surface-1))";
const BORDER = "hsl(var(--surface-4))";
const BLUE = "#5B8DEF";

const CHIPS: { id: DesktopChipId; label: string; Icon: LucideIcon; color: string }[] = [
  { id: "website", label: "Create Website", Icon: Globe, color: "#FFEE00" },
  { id: "images", label: "Images", Icon: ImageIcon, color: "hsl(var(--brand-mint))" },
  { id: "video", label: "Videos", Icon: VideoIcon, color: "#C9A8FF" },
  {
    id: "deep-research",
    label: "Deep Research",
    Icon: Microscope,
    color: "hsl(var(--brand-blush))",
  },
  { id: "slides", label: "Slides", Icon: Presentation, color: "#FFB347" },
  { id: "docs", label: "Docs", Icon: FileText, color: "#FF9F7A" },
  { id: "learning", label: "Learning", Icon: GraduationCap, color: "#7DD3FC" },
];

export const DesktopModeChips = ({
  chatMode,
  selectedAgent,
  handleModeChange,
  setChatMode,
  setSelectedAgent,
  setInput,
  offset = 0,
  limit,
}: DesktopModeChipsProps) => {
  const activeChip: DesktopChipId | null =
    selectedAgent?.id === "docs"
      ? "docs"
      : (CHIPS.find((c) => c.id === chatMode)?.id ?? null);
  const activeSuggestions = activeChip ? SUGGESTIONS[activeChip] : null;

  const visibleChips =
    offset || limit !== undefined
      ? CHIPS.slice(offset, limit !== undefined ? offset + limit : undefined)
      : CHIPS;

  return (
    <>
      {visibleChips.map((a) => {
        const active = a.id === "docs" ? selectedAgent?.id === "docs" : chatMode === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              if (a.id === "docs") {
                if (active) {
                  setSelectedAgent(null);
                } else {
                  setChatMode("normal");
                  import("@/lib/agentRegistry").then(({ AGENTS }) => {
                    const def = AGENTS.find((x) => x.id === "docs");
                    if (def) setSelectedAgent(def);
                  });
                }
              } else {
                handleModeChange(active ? "normal" : a.id);
              }
            }}
            style={
              active
                ? {
                    backgroundColor: BLUE,
                    color: "#fff",
                    border: `1.5px solid ${BLUE}`,
                    boxShadow: `0 0 0 3px ${BLUE}33, 0 6px 18px -6px ${BLUE}`,
                    transform: "translateY(-1px) scale(1.04)",
                  }
                : {
                    backgroundColor: SURFACE,
                    color: PARCHMENT,
                    border: `1.5px solid ${BORDER}`,
                    boxShadow: "none",
                  }
            }
            aria-pressed={active}
            className="relative inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-bold shrink-0 transition-all hover:-translate-y-[1px] hover:border-[hsl(var(--brand-parchment))]/40 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {active && (
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/95 shrink-0"
                style={{ color: BLUE }}
              >
                <Check className="w-3 h-3" strokeWidth={3.5} />
              </span>
            )}
            <a.Icon
              className="w-3.5 h-3.5"
              strokeWidth={2.4}
              style={{ color: active ? "#fff" : a.color }}
            />
            <span>{a.label}</span>
          </button>
        );
      })}

    </>
  );
};

export default DesktopModeChips;
