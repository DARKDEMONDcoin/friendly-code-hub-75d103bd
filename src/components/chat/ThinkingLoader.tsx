import { memo, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import MegsyStar from "@/components/files/MegsyStar";

interface ThinkingLoaderProps {
  searchStatus?: string;
}

// Thinking states:
//  • 0 – <5s   : "Thinking…" (no icon — minimal)
//  • 5 – <15s : "Thinking deeply…" with brain icon
//  • >=15s   : star + status text (writing/working)
// honors prefers-reduced-motion via ai-shimmer class.
const ThinkingLoader = ({ searchStatus }: ThinkingLoaderProps) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed(Date.now() - start), 500);
    return () => window.clearInterval(t);
  }, []);

  const ar =
    typeof document !== "undefined" &&
    (document.documentElement.lang === "ar" || document.documentElement.dir === "rtl");

  // Explicit status from backend always wins — show star + label.
  if (searchStatus?.trim()) {
    return (
      <div className="flex items-center gap-2 py-1" aria-live="polite">
        <MegsyStar size={22} className="text-[#5B8DEF]" />
        <span className="ai-shimmer text-[13px] font-medium motion-reduce:animate-none">
          {searchStatus}
        </span>
      </div>
    );
  }

  if (elapsed < 5000) {
    return (
      <div className="flex items-center gap-2 py-1" aria-live="polite">
        <MegsyStar size={16} className="text-[#5B8DEF]" />
        <span className="ai-shimmer text-[13px] font-medium motion-reduce:animate-none">
          {"Thinking…"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1" aria-live="polite">
      <MegsyStar size={16} className="text-[#5B8DEF]" />
      <Brain className="w-4 h-4 text-[#5B8DEF] animate-pulse" />
      <span className="ai-shimmer text-[13px] font-medium motion-reduce:animate-none">
        {"Thinking deeply…"}
      </span>
    </div>
  );

};

export default memo(ThinkingLoader);
