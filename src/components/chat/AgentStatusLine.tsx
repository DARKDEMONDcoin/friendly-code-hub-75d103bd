import { memo, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Brain, Check, Wrench } from "lucide-react";
import MegsyStar from "@/components/files/MegsyStar";
import { resolveToolActivity, brandIconUrl } from "@/lib/toolActivity";
import * as Lucide from "lucide-react";

export interface ToolActivity {
  name: string;
  appSlug?: string;
  target?: string;
  status: "running" | "done" | "error";
}

interface AgentStatusLineProps {
  /** Backend-provided free-form status, e.g. "Searching the web…". Wins over phase text. */
  searchStatus?: string;
  /** Active tool, if any. */
  toolActivity?: ToolActivity | null;
  /** Latest user text — used to detect Arabic. */
  userText?: string;
}

const ARABIC_RE = /[\u0600-\u06ff]/;

type Phase = "connecting" | "thinking" | "thinking_deep" | "tool" | "tool_done";

const transition = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.7 };
const MEGSY_BLUE = "#5B8DEF";

const AgentStatusLine = ({ searchStatus, toolActivity, userText }: AgentStatusLineProps) => {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [lastDoneTool, setLastDoneTool] = useState<ToolActivity | null>(null);
  const [doneShownAt, setDoneShownAt] = useState<number>(0);

  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Date.now() - start), 250);
    return () => window.clearInterval(t);
  }, []);

  // Track tool transitions so we can briefly show a "done" state before the next phase.
  useEffect(() => {
    if (toolActivity?.status === "done" || toolActivity?.status === "error") {
      setLastDoneTool(toolActivity);
      setDoneShownAt(Date.now());
      const t = window.setTimeout(() => setLastDoneTool(null), 900);
      return () => window.clearTimeout(t);
    }
  }, [toolActivity?.name, toolActivity?.status]);

  const ar = useMemo(() => {
    if (userText && ARABIC_RE.test(userText)) return true;
    if (searchStatus && ARABIC_RE.test(searchStatus)) return true;
    if (toolActivity?.target && ARABIC_RE.test(toolActivity.target)) return true;
    if (typeof document !== "undefined") {
      const l = document.documentElement.lang || "";
      const d = document.documentElement.dir || "";
      if (l.startsWith("ar") || d === "rtl") return true;
    }
    return false;
  }, [userText, searchStatus, toolActivity?.target]);

  // Decide active phase
  let phase: Phase;
  if (toolActivity && toolActivity.status === "running") phase = "tool";
  else if (lastDoneTool && Date.now() - doneShownAt < 900) phase = "tool_done";
  else if (searchStatus?.trim())
    phase = "tool"; // backend-provided custom status renders like a tool row
  else if (elapsed < 800) phase = "connecting";
  else if (elapsed < 5000) phase = "thinking";
  else phase = "thinking_deep";

  // Build the visible row
  let key = phase as string;
  let icon: React.ReactNode = null;
  let label = "";
  let shimmer = true;

  if (phase === "connecting") {
    key = "connecting";
    icon = <Dots />;
    label = "";
    shimmer = false;
  } else if (phase === "thinking") {
    icon = <MegsyStar size={16} className="text-[#5B8DEF]" />;
    label = "Thinking…";
  } else if (phase === "thinking_deep") {
    icon = (
      <span className="relative inline-flex items-center justify-center w-5 h-5">
        <MegsyStar size={16} className="text-[#5B8DEF]" />
        <Brain className="absolute -bottom-1 -right-1 w-3 h-3 animate-pulse" style={{ color: MEGSY_BLUE }} />
      </span>
    );
    label = "Thinking deeply…";
  } else if (phase === "tool") {
    const active = toolActivity ?? null;
    const meta = active ? resolveToolActivity(active.name, active.appSlug) : null;
    key = `tool:${active?.name || "status"}`;
    icon = <ToolIcon meta={meta} />;
    const verb = meta ? meta.en : "";
    if (searchStatus?.trim()) label = searchStatus.trim();
    else if (active?.target) label = `${verb} ${active.target}`;
    else label = verb || "Working…";
  } else if (phase === "tool_done" && lastDoneTool) {
    const meta = resolveToolActivity(lastDoneTool.name, lastDoneTool.appSlug);
    key = `done:${lastDoneTool.name}`;
    const verb = meta.en;
    const isError = lastDoneTool.status === "error";
    icon = (
      <span className="relative inline-flex items-center justify-center w-5 h-5">
        <ToolIcon meta={meta} muted />
        <span
          className={
            "absolute -bottom-1 -right-1 inline-flex items-center justify-center w-3 h-3 rounded-full " +
            (isError ? "bg-destructive" : "bg-emerald-500")
          }
        >
          <Check className="w-2 h-2 text-white" strokeWidth={3} />
        </span>
      </span>
    );
    label = isError ? `${verb} — failed` : `${verb} — done`;
    shimmer = false;
  }

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 4, filter: "blur(2px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -4, filter: "blur(2px)" },
        transition,
      };

  return (
    <div
      className="flex items-center gap-2.5 py-1 min-h-[28px]"
      aria-live="polite"
      data-testid="agent-status"
      dir={ar ? "rtl" : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} className="flex items-center gap-2.5" {...motionProps}>
          <span className="relative inline-flex items-center justify-center w-5 h-5 shrink-0">
            {icon}
            {phase === "tool" && (
              <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: MEGSY_BLUE }} />
            )}
          </span>
          {label && (
            <span
              className={
                shimmer
                  ? "ai-shimmer text-[13px] font-medium motion-reduce:animate-none"
                  : "text-[13px] font-medium text-foreground/70 md:text-white/80"
              }
            >
              {label}
            </span>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const Dots = () => (
  <span className="inline-flex items-center gap-1" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1 h-1 rounded-full bg-foreground/40 md:bg-white/70 animate-pulse"
        style={{ animationDelay: `${i * 120}ms` }}
      />
    ))}
  </span>
);

const ToolIcon = ({
  meta,
  muted,
}: {
  meta: ReturnType<typeof resolveToolActivity> | null;
  muted?: boolean;
}) => {
  const [failed, setFailed] = useState(false);
  if (!meta) return <Wrench className="w-4 h-4 text-foreground/70 md:text-white/80" />;
  if (meta.slug && !failed) {
    return (
      <img
        src={brandIconUrl(meta.slug)}
        alt=""
        className={"w-4 h-4 dark:invert md:invert " + (muted ? "opacity-50" : "opacity-90")}
        onError={() => setFailed(true)}
      />
    );
  }
  const Comp = (meta.lucide && (Lucide as any)[meta.lucide]) || (Lucide as any).Wrench;
  return (
    <Comp
      className={
        "w-4 h-4 " +
        (muted ? "text-foreground/50 md:text-white/60" : "text-foreground/80 md:text-white/90")
      }
    />
  );
};

export default memo(AgentStatusLine);
