import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowUp, Check, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Claude from "@lobehub/icons/es/Claude";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Kimi from "@lobehub/icons/es/Kimi";
import {
  GlassSheet,
  GlassSheetContent,
  GlassSheetHeader,
  GlassSheetTitle,
  GlassSheetDescription,
} from "@/components/ui/glass-sheet";
import { MEGSY_TYPING_PHRASES, pickMegsyPhrase } from "./megsyPhrases";

export type LandingChipId = "image" | "video" | "website";

export interface LandingChip {
  id: LandingChipId;
  label: string;
}

// Megsy glyph set — custom duotone marks: rounded monoline + soft solid accents.
type GlyphProps = { className?: string };
const glyphBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};
const ImageGlyph = ({ className }: GlyphProps) => (
  <svg {...glyphBase} className={className}>
    <rect x="3" y="4.2" width="18" height="15.6" rx="4.5" />
    <circle cx="9.1" cy="9.5" r="1.7" fill="currentColor" stroke="none" />
    <path d="M3.6 16.8l4-4a2.2 2.2 0 0 1 3.1 0l4.9 4.9" />
    <path d="M13.5 15.3l1.6-1.6a2.2 2.2 0 0 1 3.1 0l2.2 2.2" opacity=".5" />
  </svg>
);
const VideoGlyph = ({ className }: GlyphProps) => (
  <svg {...glyphBase} className={className}>
    <rect x="2.8" y="5" width="18.4" height="14" rx="4.5" />
    <path
      d="M10.4 9.2l4.4 2.8-4.4 2.8z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);
const WebsiteGlyph = ({ className }: GlyphProps) => (
  <svg {...glyphBase} className={className}>
    <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="3.2" />
    <path d="M2.8 9.2h18.4" />
    <circle cx="5.6" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="7.6" cy="6.8" r="0.6" fill="currentColor" stroke="none" opacity=".6" />
    <circle cx="9.6" cy="6.8" r="0.6" fill="currentColor" stroke="none" opacity=".4" />
    <path d="M6.2 13.2h7M6.2 16h4.6" opacity=".7" />
  </svg>
);
const DocumentGlyph = ({ className }: GlyphProps) => (
  <svg {...glyphBase} className={className}>
    <path d="M13.6 2.9H7.2A2.7 2.7 0 0 0 4.5 5.6v12.8a2.7 2.7 0 0 0 2.7 2.7h9.6a2.7 2.7 0 0 0 2.7-2.7V8.8z" />
    <path d="M13.6 2.9V8.8h5.9" opacity=".5" />
    <path d="M8.5 13h7M8.5 16.6h4.6" />
  </svg>
);
const LearningGlyph = ({ className }: GlyphProps) => (
  <svg {...glyphBase} className={className}>
    <path d="M2.8 9.3L12 4.9l9.2 4.4L12 13.7z" />
    <path d="M6.6 11.6v4c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-4" />
    <path d="M21.2 9.3v4.6" opacity=".5" />
  </svg>
);

const CHIP_ICONS: Record<LandingChipId, React.ComponentType<{ className?: string }>> = {
  image: ImageGlyph,
  video: VideoGlyph,
  website: WebsiteGlyph,
};

export const DEFAULT_LANDING_CHIPS: LandingChip[] = [
  { id: "website", label: "Create Website" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
];

export type AgentCardId = "slides" | "research" | "megsy-os" | "resume" | "document" | "learning";

export interface AgentCard {
  id: string;
  title: string;
  subtitle?: string;
  agentId: AgentCardId;
  image: string;
}

export interface LandingModel {
  id: string;
  label: string;
  sub?: string;
  pro?: boolean;
  icon: React.ReactNode;
}

import MEGSY_ICON_URL from "@/assets/megsy-model-icon.png";
const MegsyIcon = () => (
  <img src={MEGSY_ICON_URL} alt="Megsy" className="w-full h-full object-contain" />
);

export const DEFAULT_LANDING_MODELS: LandingModel[] = [
  { id: "megsy-lite", label: "Megsy Lite", sub: "Fast everyday model", icon: <MegsyIcon /> },
  { id: "megsy-pro", label: "Megsy Pro", sub: "Balanced quality", icon: <MegsyIcon /> },
  { id: "megsy-max", label: "Megsy Max", sub: "Most capable", pro: true, icon: <MegsyIcon /> },
  {
    id: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    sub: "Anthropic flagship",
    pro: true,
    icon: <Claude.Color size={20} />,
  },
  {
    id: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    sub: "Fast & smart",
    pro: true,
    icon: <Claude.Color size={20} />,
  },
  { id: "kimi-2.6", label: "Kimi 2.6", sub: "Free · Moonshot", icon: <Kimi.Color size={20} /> },
  {
    id: "deepseek",
    label: "DeepSeek",
    sub: "Free · reasoning",
    icon: <DeepSeek.Color size={20} />,
  },
];

export interface ActivePill {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Optional thumbnail (e.g. the currently selected template cover) */
  image?: string;
  onClear?: () => void;
  onClick?: () => void;
  accent?: string;
}

export interface LandingSuggestion {
  id: string;
  label: string;
  highlight?: boolean;
  icon?: React.ReactNode;
}

interface Props {
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  modelLabel: string;
  greeting?: string;
  userName?: string;
  chips?: LandingChip[];
  onChipClick: (id: LandingChipId) => void;
  agentCards?: AgentCard[];
  onShowMore?: () => void;
  onAgentClick?: (card: AgentCard) => void;
  models?: LandingModel[];
  selectedModelId?: string;
  onModelSelect?: (m: LandingModel) => void;
  isPaid?: boolean;
  activePills?: ActivePill[];
  onPlusClick?: () => void;
  suggestions?: LandingSuggestion[];
  onSuggestionClick?: (s: LandingSuggestion) => void;
  modeBarSlot?: React.ReactNode;
  modelControlSlot?: React.ReactNode;
}

const DEFAULT_AGENTS: AgentCard[] = [];

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  resume: DocumentGlyph,
  document: DocumentGlyph,
  learning: LearningGlyph,
};

// Connect strip — integrations surfaced inside the composer
type ConnectItem = {
  id: string;
  name: string;
  domain: string;
  description: string;
  category?: string;
};
const CONNECT_ITEMS: ConnectItem[] = [
  {
    id: "github",
    name: "GitHub",
    domain: "github.com",
    description: "Browse repos, issues and pull requests.",
    category: "Development",
  },
  {
    id: "supabase",
    name: "Supabase",
    domain: "supabase.com",
    description: "Manage your database, auth and edge functions.",
    category: "Development",
  },
  {
    id: "vercel",
    name: "Vercel",
    domain: "vercel.com",
    description: "Deploy and inspect production projects.",
    category: "Deployment",
  },
  {
    id: "notion",
    name: "Notion",
    domain: "notion.so",
    description: "Search pages and update docs in your workspace.",
    category: "Productivity",
  },
  {
    id: "linear",
    name: "Linear",
    domain: "linear.app",
    description: "Create issues and track sprints in seconds.",
    category: "Productivity",
  },
  {
    id: "gmail",
    name: "Gmail",
    domain: "gmail.com",
    description: "Draft replies and search your inbox from chat.",
    category: "Communication",
  },
  {
    id: "slack",
    name: "Slack",
    domain: "slack.com",
    description: "Send messages and fetch channel context.",
    category: "Communication",
  },
  {
    id: "discord",
    name: "Discord",
    domain: "discord.com",
    description: "Bridge your servers and channels with the agent.",
    category: "Communication",
  },
  {
    id: "figma",
    name: "Figma",
    domain: "figma.com",
    description: "Pull frames and turn designs into code.",
    category: "Design",
  },
  {
    id: "drive",
    name: "Google Drive",
    domain: "drive.google.com",
    description: "Search, read and upload files instantly.",
    category: "Storage",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    domain: "dropbox.com",
    description: "Access shared folders and recent uploads.",
    category: "Storage",
  },
  {
    id: "stripe",
    name: "Stripe",
    domain: "stripe.com",
    description: "Inspect customers, charges and subscriptions.",
    category: "Payments",
  },
  {
    id: "x",
    name: "X",
    domain: "x.com",
    description: "Post updates and pull trending threads.",
    category: "Social",
  },
  {
    id: "instagram",
    name: "Instagram",
    domain: "instagram.com",
    description: "Publish posts and read insights.",
    category: "Social",
  },
  {
    id: "youtube",
    name: "YouTube",
    domain: "youtube.com",
    description: "Search videos and fetch transcripts.",
    category: "Social",
  },
  {
    id: "telegram",
    name: "Telegram",
    domain: "telegram.org",
    description: "Send and receive messages across chats.",
    category: "Communication",
  },
];

// Real Pipedream Connect app slugs — must match pipedream_accounts.app_slug
const PIPEDREAM_SLUGS: Record<string, string> = {
  vercel: "vercel",
  notion: "notion",
  linear: "linear",
  gmail: "gmail",
  slack: "slack",
  discord: "discord",
  figma: "figma",
  drive: "google_drive",
  dropbox: "dropbox",
  stripe: "stripe",
  x: "twitter",
  instagram: "instagram_business",
  youtube: "youtube_data_api",
  telegram: "telegram_bot_api",
};

// Inline brand SVG paths (white, single-color) for icons where CDN fails or for reliability.
const INLINE_BRAND_PATHS: Record<string, string> = {
  slack:
    "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.98 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
};

const SIMPLE_ICON_SLUGS: Record<string, string> = {
  github: "github",
  supabase: "supabase",
  vercel: "vercel",
  notion: "notion",
  linear: "linear",
  gmail: "gmail",
  discord: "discord",
  figma: "figma",
  drive: "googledrive",
  dropbox: "dropbox",
  stripe: "stripe",
  youtube: "youtube",
  telegram: "telegram",
};

const BrandLogo = ({ id, className = "w-5 h-5" }: { id: string; className?: string }) => {
  const inline = INLINE_BRAND_PATHS[id];
  if (inline) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d={inline} />
      </svg>
    );
  }
  const slug = SIMPLE_ICON_SLUGS[id] ?? id;
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}/ffffff`}
      alt=""
      className={`${className} object-contain`}
      loading="lazy"
    />
  );
};

const MobileChatLanding = ({
  input,
  onInputChange,
  onSend,
  isLoading,
  modelLabel,
  userName,
  chips = DEFAULT_LANDING_CHIPS,
  onChipClick,
  agentCards = DEFAULT_AGENTS,
  onAgentClick,
  models = DEFAULT_LANDING_MODELS,
  selectedModelId,
  onModelSelect,
  isPaid = false,
  activePills = [],
  onPlusClick,
  suggestions,
  onSuggestionClick,
  modeBarSlot,
  modelControlSlot,
}: Props) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  void models;
  void selectedModelId;
  void onModelSelect;
  void isPaid;

  const timeGreeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  }, []);
  const [typed, setTyped] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    setTyped("");
    setTypingDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(timeGreeting.slice(0, i));
      if (i >= timeGreeting.length) {
        clearInterval(id);
        setTypingDone(true);
      }
    }, 110);
    return () => clearInterval(id);
  }, [timeGreeting]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const canSend = input.trim().length > 0 && !isLoading;

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  // Fetch the REAL connected accounts (Pipedream + first-party OAuth)
  const fetchConnected = useCallback(async (): Promise<Set<string>> => {
    const next = new Set<string>();
    const [pd, gh, sb] = await Promise.all([
      supabase.functions.invoke("pipedream-connect", { body: { action: "list_accounts" } }),
      supabase.functions.invoke("github-push", { body: { action: "status" } }),
      supabase.functions.invoke("supabase-link-manager", { body: { action: "status" } }),
    ]);
    const accounts = (pd.data?.accounts ?? []) as Array<{
      app?: { name_slug?: string; slug?: string };
      app_slug?: string;
    }>;
    const slugs = new Set(
      accounts
        .map((a) => a.app?.name_slug ?? a.app?.slug ?? a.app_slug)
        .filter(Boolean) as string[],
    );
    for (const it of CONNECT_ITEMS) {
      const slug = PIPEDREAM_SLUGS[it.id];
      if (slug && slugs.has(slug)) next.add(it.id);
    }
    if (!gh.error && gh.data?.connected) next.add("github");
    if (!sb.error && sb.data?.connected) next.add("supabase");
    return next;
  }, []);

  // Load real connection state whenever the sheet opens
  useEffect(() => {
    if (!connectOpen) return;
    fetchConnected()
      .then(setConnectedIds)
      .catch(() => {});
  }, [connectOpen, fetchConnected]);

  const handleConnect = async (it: ConnectItem) => {
    if (connectedIds.has(it.id) || connectingId) return;
    setConnectingId(it.id);
    try {
      if (it.id === "github" || it.id === "supabase") {
        // First-party OAuth
        const startFn = it.id === "github" ? "oauth-github-connect" : "supabase-oauth-start";
        const { data, error } = await supabase.functions.invoke(startFn, {
          body: { redirect_to: window.location.href },
        });
        if (error || data?.error || !data?.authorize_url) {
          throw new Error(data?.error || error?.message || `${it.name} OAuth is not configured`);
        }
        window.open(data.authorize_url, "_blank", "noopener,noreferrer");
      } else {
        // Pipedream Connect — real account linking
        const slug = PIPEDREAM_SLUGS[it.id];
        if (!slug) throw new Error(`${it.name} is not available yet`);
        const { data, error } = await supabase.functions.invoke("pipedream-connect", {
          body: { action: "create_token" },
        });
        if (error || data?.error || !data?.connect_link_url) {
          throw new Error(data?.error || error?.message || "Sign in to connect apps");
        }
        window.open(
          `${data.connect_link_url}&app=${encodeURIComponent(slug)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
      toast.success(`Finish connecting ${it.name} in the new tab`);
      // Poll until the account is actually linked (max ~2 minutes)
      let attempts = 0;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        attempts += 1;
        try {
          const next = await fetchConnected();
          setConnectedIds(next);
          if (next.has(it.id)) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setConnectingId(null);
            toast.success(`${it.name} connected — chat can use it now`);
            return;
          }
        } catch {
          /* keep polling */
        }
        if (attempts >= 40) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setConnectingId(null);
        }
      }, 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to connect ${it.name}`);
      setConnectingId(null);
    }
  };

  // agentCards/onAgentClick kept for backwards compat; not currently rendered in landing hero
  void agentCards;
  void onAgentClick;

  const firstName = (userName || "").split(" ")[0] || "there";
  const isTyping = input.trim().length > 0;
  const hasActiveMode = (activePills?.length ?? 0) > 0;
  // Hero hides for either typing or active mode, but the floating mascot only
  // appears while the user is typing — otherwise it overlaps the service panel
  // that opens above the composer when a mode is picked.
  const isReactive = isTyping || hasActiveMode;
  const showFloatingOrb = isTyping && !hasActiveMode;

  // Speech bubble — picks a fresh phrase only when a new typing session begins
  // (input goes from empty to non-empty). Stays put while the user keeps typing.
  const [phrase, setPhrase] = useState<string>(() => pickMegsyPhrase(userName));
  const wasTypingRef = useRef(false);
  useEffect(() => {
    if (isTyping && !wasTypingRef.current) {
      setPhrase(pickMegsyPhrase(userName));
    }
    wasTypingRef.current = isTyping;
  }, [isTyping, userName]);
  void MEGSY_TYPING_PHRASES;

  const OrbSvg = ({ lookDown = false }: { lookDown?: boolean }) => (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <defs>
        <radialGradient id="kimiFace" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#7ec5ff" />
          <stop offset="40%" stopColor="#1f7be8" />
          <stop offset="100%" stopColor="#0b3aa6" />
        </radialGradient>
        <radialGradient id="kimiShine" cx="35%" cy="26%" r="24%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kimiRim" cx="50%" cy="80%" r="55%">
          <stop offset="0%" stopColor="#4ea4ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#4ea4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="46" fill="url(#kimiFace)" />
      <circle cx="60" cy="60" r="46" fill="url(#kimiRim)" />
      <ellipse cx="46" cy="38" rx="20" ry="13" fill="url(#kimiShine)" />
      <motion.g
        fill="#fdeccd"
        animate={lookDown ? { scaleY: [1, 0.85, 1], y: [0, 6, 0] } : { scaleY: [1, 1, 0.1, 1, 1] }}
        transition={{
          duration: lookDown ? 2.2 : 4.2,
          repeat: Infinity,
          times: lookDown ? [0, 0.5, 1] : [0, 0.46, 0.5, 0.54, 1],
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "60px 62px" }}
      >
        <ellipse cx="50" cy="62" rx="4.6" ry="6" />
        <ellipse cx="70" cy="62" rx="4.6" ry="6" />
      </motion.g>
    </svg>
  );

  return (
    <div className="md:hidden relative w-full h-full overflow-hidden bg-transparent text-foreground">
      {modelControlSlot ? (
        <div
          className="fixed top-0 left-1/2 z-40 -translate-x-1/2"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.25rem)" }}
        >
          {modelControlSlot}
        </div>
      ) : null}

      {/* Scrollable hero area — neobrutalist sticker style (matches /settings/referrals) */}
      <div
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y pt-[max(env(safe-area-inset-top),16px)] pb-[clamp(180px,32vh,260px)] px-5"
        style={{
          backgroundColor: "hsl(var(--brand-ink))",
          color: "hsl(var(--brand-parchment))",
          fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
        }}
      >
        <div className="min-h-full flex flex-col items-center justify-start text-center pt-[clamp(48px,14vh,140px)]">
          <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm">
            {/* Display headline — 900 weight, tight letter spacing */}
            {!isReactive && (
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                className="text-[40px] leading-[1.0] tracking-tight"
                style={{
                  fontWeight: 900,
                  color: "hsl(var(--brand-parchment))",
                  letterSpacing: "-0.03em",
                }}
              >
                Let's build{firstName && firstName !== "there" ? `, ${firstName}` : ""}!
              </motion.h1>
            )}

            {/* Subline with bright color highlights */}
            {!isReactive && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, delay: 0.15 }}
                className="mx-auto max-w-[280px] text-[15px] leading-relaxed"
                style={{ color: "hsl(var(--brand-muted))", fontWeight: 600 }}
              >
                Create{" "}
                <span style={{ color: "hsl(var(--brand-action))", fontWeight: 900 }}>websites</span>
                , <span style={{ color: "hsl(var(--brand-mint))", fontWeight: 900 }}>images</span> &{" "}
                <span style={{ color: "#C9A8FF", fontWeight: 900 }}>videos</span> — all in one chat.
              </motion.p>
            )}
          </div>
        </div>
      </div>

      {/* Floating orb that flies down to hover above the composer when the user
          starts typing or picks a mode. Speaks rotating short phrases. */}
      <AnimatePresence>
        {showFloatingOrb && (
          <motion.div
            key="float-orb"
            initial={{ opacity: 0, y: -120, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="md:hidden fixed left-4 z-30 pointer-events-none flex items-end gap-2"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 210px)" }}
          >
            <motion.div
              animate={{ y: [0, -5, 0], rotate: [-3, 3, -3] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="w-[64px] h-[64px] shrink-0"
            >
              <OrbSvg lookDown />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.div
                key={phrase}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="relative mb-2 max-w-[58vw] rounded-2xl rounded-bl-sm px-3 py-1.5 text-[12.5px]"
                style={{
                  backgroundColor: "hsl(var(--brand-action))",
                  color: "hsl(var(--brand-ink))",
                  border: "2px solid hsl(var(--brand-ink))",
                  boxShadow: "3px 3px 0 rgba(59,130,246,0.35)",
                  fontWeight: 800,
                }}
              >
                <span className="block leading-snug">{phrase}</span>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Integrations bottom sheet — pure black, transparent brand icons */}
      <GlassSheet open={connectOpen} onOpenChange={setConnectOpen}>
        <GlassSheetContent
          contentClassName="px-0 pt-2 bg-black"
          className="bg-black"
          style={{ background: "#000", backdropFilter: "none", WebkitBackdropFilter: "none" }}
        >
          <GlassSheetHeader className="px-5">
            <GlassSheetTitle>Connect apps</GlassSheetTitle>
            <GlassSheetDescription>
              Tap Connect to link an app — it stays inside the chat.
            </GlassSheetDescription>
          </GlassSheetHeader>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {CONNECT_ITEMS.map((it) => {
              const isConnected = connectedIds.has(it.id);
              const isLoadingThis = connectingId === it.id;
              return (
                <li key={it.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="w-9 h-9 flex items-center justify-center shrink-0 text-white">
                    <BrandLogo id={it.id} className="w-7 h-7" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-white truncate">{it.name}</div>
                    <p className="text-[12px] text-white/55 line-clamp-2">{it.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleConnect(it)}
                    disabled={isConnected || isLoadingThis}
                    className={`shrink-0 inline-flex items-center justify-center h-8 min-w-[88px] px-3.5 rounded-full text-[12.5px] font-semibold transition-colors ${
                      isConnected
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "theme-fixed bg-white text-black hover:opacity-90"
                    } disabled:opacity-70`}
                  >
                    {isLoadingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isConnected ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Connected
                      </span>
                    ) : (
                      "Connect"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassSheetContent>
      </GlassSheet>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default MobileChatLanding;
