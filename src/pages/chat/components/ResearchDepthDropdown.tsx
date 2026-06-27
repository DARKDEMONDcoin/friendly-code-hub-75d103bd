import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export type ResearchDepth = "lite" | "medium" | "max";

interface ResearchDepthDropdownProps {
  researchDepth: ResearchDepth;
  setResearchDepth: (depth: ResearchDepth) => void;
  researchDepthOpen: boolean;
  setResearchDepthOpen: (open: boolean | ((v: boolean) => boolean)) => void;
}

const DEPTH_OPTIONS: Array<{ id: ResearchDepth; label: string }> = [
  { id: "lite", label: "Lite" },
  { id: "medium", label: "Medium" },
  { id: "max", label: "Max" },
];

const LABEL_MAP: Record<ResearchDepth, string> = {
  lite: "Lite",
  medium: "Medium",
  max: "Max",
};

export default function ResearchDepthDropdown({
  researchDepth,
  setResearchDepth,
  researchDepthOpen,
  setResearchDepthOpen,
}: ResearchDepthDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setResearchDepthOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full bg-transparent text-white/85 hover:text-white border-0 transition-colors text-[12.5px] font-semibold"
        aria-label="Report depth"
        aria-expanded={researchDepthOpen}
      >
        <span>{LABEL_MAP[researchDepth]}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-70 transition-transform ${researchDepthOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {researchDepthOpen && (
          <>
            <div className="fixed inset-0 z-overlay" onClick={() => setResearchDepthOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="absolute bottom-full mb-2 right-0 z-[61] w-[140px] rounded-2xl bg-popover text-popover-foreground border border-border shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] p-1"
            >
              {DEPTH_OPTIONS.map((d) => {
                const active = researchDepth === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setResearchDepth(d.id);
                      setResearchDepthOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold text-left transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-popover-foreground/80 hover:bg-accent/60"
                    }`}
                  >
                    <span>{d.label}</span>
                    {active && <Check className="w-4 h-4" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
