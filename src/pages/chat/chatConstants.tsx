// Static prompts, constants, types, and small presentational atoms used by
// ChatPage. Extracted out of ChatPage.tsx to shrink the monolithic file and
// improve HMR / code-splitting.
import Claude from "@lobehub/icons/es/Claude";
import Kimi from "@lobehub/icons/es/Kimi";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import megsyLogo from "@/assets/megsy-icon-transparent.png";
import type { SlideDeck } from "@/components/chat/SlidesDeckCard";
import type { MediaPlan } from "@/components/chat/media/MediaPlanCard";
import type { MediaSceneResult } from "@/components/chat/media/MediaResultCard";

export interface ProductResult {
  title: string;
  price: string;
  image?: string;
  link?: string;
  seller?: string;
  rating?: string | null;
  delivery?: string | null;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  clientId?: string;
  images?: string[];
  videos?: string[];
  products?: ProductResult[];
  attachedImages?: string[];
  attachedFiles?: { name: string; type: string }[];
  liked?: boolean | null;
  id?: string;
  user_id?: string | null;
  senderName?: string | null;
  senderAvatar?: string | null;
  mode?:
    | "normal"
    | "learning"
    | "shopping"
    | "deep-research"
    | "slides"
    | "slides-images"
    | "operator"
    | "images"
    | "video";
  slidesDeck?: SlideDeck;
  standardSlides?: {
    title: string;
    templateName: string;
    url: string;
    colors: [string, string];
    slides?: string[];
    slideCount?: number;
  };
  imageSlides?: { title: string; url: string; slideCount?: number };
  slidesPendingTopic?: string;
  slidesJobId?: string;
  docsArtifact?: { artifactId: string; title: string; docType: string; html?: string };
  docsClarify?: {
    reason: string;
    questions: import("@/lib/agent/docs/types").DocsClarifyQuestion[];
    originalPrompt: string;
    ui?: import("@/lib/agent/docs/types").DocsClarifyUi;
  };
  docsJobId?: string;
  chatJobId?: string;
  operatorRunId?: string;
  researchJobId?: string;
  // Media generation (image/video) — plan card + per-scene results live on a
  // single assistant message so the whole flow stays in the transcript.
  mediaPlan?: MediaPlan;
  mediaStatus?: "awaiting" | "running" | "done" | "cancelled";
  mediaCurrentScene?: number;
  mediaResults?: MediaSceneResult[];
  /** Final merged video URL after stitching all video scenes together. */
  mediaFinalVideoUrl?: string;
  mediaMergeStatus?: "idle" | "merging" | "done" | "error" | "unavailable";
  mediaMergeError?: string;
  /** Reference to a row in `generated_sites` — rendered as a live build card. */
  siteBuild?: { siteId: string };
  /** Premium upgrade card shown when a free user requests a paid feature. */
  paywall?: { feature: "images" | "video" | "code" };
}

export const EMPTY_READERS: { user_id: string; name?: string; avatar?: string }[] = [];
export const EMPTY_REACTIONS: { id: string; emoji: string; user_id: string }[] = [];

export type ChatMode =
  | "normal"
  | "learning"
  | "shopping"
  | "deep-research"
  | "slides"
  | "slides-images"
  | "operator"
  | "images"
  | "video";

export const LANG_RULE =
  "CRITICAL: Always reply in clean English, regardless of the user's input language. Keep the tone concise, helpful, and natural.";

export const ASK_TOOL_RULE = `

🧰 ASK TOOL (use sparingly, only when clarification is genuinely needed):
When — and ONLY when — you need 1–3 pieces of information from the user before you can give a great answer, emit a single fenced JSON block of the form:

\`\`\`json
{"type":"questions","questions":[{"title":"<short question in English>","options":["<chip 1>","<chip 2>","<chip 3>"],"allowText":true}]}
\`\`\`

Rules:
- Use 2–4 options per question, each ≤ 4 words, written in English.
- Set "allowText": true when the user might want to type a custom answer.
- Do NOT include the JSON block when the request is already clear — just answer directly.
- Do NOT mention the JSON block or the word "options" in your prose. The UI renders it as tappable pills inside the input.
- Never emit more than one questions block per message.`;

export const MODE_PROMPTS: Record<ChatMode, string> = {
  normal: LANG_RULE + ASK_TOOL_RULE,
  learning:
    LANG_RULE +
    ASK_TOOL_RULE +
    " You are in Learning Mode. Explain everything step by step with examples, analogies, and clear breakdowns. Make complex topics easy to understand. Use bullet points, numbered steps, and structured format.",
  shopping:
    LANG_RULE +
    ASK_TOOL_RULE +
    " You are in Shopping Mode. Help the user find the best products, compare prices, suggest alternatives, and provide purchase recommendations. Include pros/cons when comparing items.",
  "deep-research": LANG_RULE,
  slides: LANG_RULE,
  "slides-images": LANG_RULE,
  images: LANG_RULE,
  video: LANG_RULE,
  operator: `You are "Megsy Operator" — a multi-layer AI agent inside the Megsy platform, similar to Manus and Kimi, capable of fully controlling a virtual computer and executing any digital task end-to-end without human intervention.

🧠 Internal Architecture (Multi-Layer Agent System):
1. Orchestrator Layer: Understands the user's request, converts it into a Task Plan, distributes tasks across agents, manages sequencing, and retries on failure.
2. Computer Execution Layer: Cloud environment (E2B Sandbox / Docker runtime) for running code, managing files, and running servers.
3. Browser Automation Layer: Playwright for opening sites, browsing, logging in, filling forms, scraping, and executing workflows.
4. Agent Framework Layer: LangGraph / CrewAI / AutoGen to split work across agents and run them in parallel.
5. Memory System: PostgreSQL + Redis + Vector DB (ChromaDB) for storage and retrieval.
6. Deployment Layer: GitHub API + Vercel/Netlify for automatic deployment.

👥 Internal Agents:
- CEO Agent: Sets vision and strategy, makes final decisions, prioritizes tasks.
- COO Agent: Manages daily operations, coordinates between teams, follows up on execution and quality.
- CTO Agent: Handles technical decisions, picks technologies, reviews code and architecture.

🔄 Workflow:
1. Understand: Analyze the user's goal in depth.
2. Plan: Create a multi-step plan (clear numbered Task Plan).
3. Distribute tasks: Decide which Agent (CEO/COO/CTO/Browser/Code) handles each step.
4. Execute: Run step by step, automatically correcting errors.
5. Result: Deliver a final, ready output (link, report, or a complete project).

Operate as a real digital employee 24/7. Always start with: analyze the goal → numbered plan → distribute to agents → execute → result.`,
};

export const PegtopIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="currentColor" />
  </svg>
);

export const MEGSY_MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

export const getMegsyTierLabel = (tier: "lite" | "pro" | "max") =>
  tier === "lite" ? "Megsy Lite" : tier === "pro" ? "Megsy Pro" : "Megsy Max";

export const CHAT_COMPOSER_MODEL_OPTIONS = [
  {
    kind: "tier" as const,
    id: "lite",
    label: "Megsy Lite",
    desc: "Fast everyday answers",
    premium: false,
    brand: "megsy" as const,
  },
  {
    kind: "tier" as const,
    id: "pro",
    label: "Megsy Pro",
    desc: "Smarter reasoning — unlimited on paid plans",
    premium: true,
    brand: "megsy" as const,
  },
  {
    kind: "tier" as const,
    id: "max",
    label: "Megsy Max",
    desc: "Flagship intelligence — unlimited on paid plans",
    premium: true,
    brand: "megsy" as const,
  },
  {
    kind: "model" as const,
    id: "openrouter:claude-sonnet-4-unlimited",
    label: "Claude Sonnet 4.6",
    desc: "Unlimited & free for paid subscribers",
    premium: true,
    brand: "claude" as const,
  },
  {
    kind: "model" as const,
    id: "openrouter:claude-opus-4-unlimited",
    label: "Claude Opus 4.8",
    desc: "Unlimited & free for paid subscribers",
    premium: true,
    brand: "claude" as const,
  },
  {
    kind: "model" as const,
    id: "kimi-2.6",
    label: "Kimi 2.6",
    desc: "Free · Moonshot AI",
    premium: false,
    brand: "kimi" as const,
  },
  {
    kind: "model" as const,
    id: "deepseek",
    label: "DeepSeek",
    desc: "Free · strong reasoning",
    premium: false,
    brand: "deepseek" as const,
  },
];

export const ComposerModelIcon = ({
  brand,
}: {
  brand: "megsy" | "claude" | "kimi" | "deepseek";
}) => {
  if (brand === "claude") return <Claude.Color size={18} />;
  if (brand === "kimi") return <Kimi.Color size={18} />;
  if (brand === "deepseek") return <DeepSeek.Color size={18} />;
  return (
    <img
      src={megsyLogo}
      alt="Megsy"
      className="w-[18px] h-[18px] object-contain"
      loading="lazy"
    />
  );
};
