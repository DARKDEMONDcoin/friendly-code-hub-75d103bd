import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, ArrowUp, Square, Mic } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  onPlus?: () => void;
  onMic?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

// iOS-feel spring — snappy, settles fast, no overshoot.
const TAP_SPRING = { type: "spring" as const, stiffness: 420, damping: 28, mass: 0.55 };

/**
 * Luma neutral mobile composer.
 * Single rounded surface: [+]  textarea  [send]
 * Uses framer-motion whileTap with iOS spring physics — feels closer to
 * a native UIButton press than a plain CSS :active flicker.
 */
export default function MobileComposer({
  value,
  onChange,
  onSend,
  onCancel,
  onPlus,
  onMic,
  disabled,
  isLoading,
  placeholder,
  autoFocus,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // auto-grow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const canSend = value.trim().length > 0 && !disabled;
  const ph = placeholder ?? "Ask anything…";

  return (
    <div
      data-testid="mobile-composer"
      className="md:hidden flex items-end gap-2 px-2 py-2 bg-foreground/[0.06] border border-foreground/15 rounded-2xl"
    >
      <motion.button
        type="button"
        aria-label="Attach"
        data-testid="mobile-composer-plus"
        onClick={onPlus}
        whileTap={{ scale: 0.9 }}
        transition={TAP_SPRING}
        className="shrink-0 flex items-center justify-center text-foreground/80 hover:text-foreground bg-foreground/[0.08] hover:bg-foreground/[0.12] transition-colors"
        style={{ height: "2.5rem", width: "2.5rem", borderRadius: "999px" }}
      >
        <Plus className="w-5 h-5" />
      </motion.button>

      <textarea
        ref={ref}
        value={value}
        data-testid="mobile-composer-input"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={() => {
          // Mobile composer: Enter inserts a newline by default (no send).
        }}
        placeholder={ph}
        rows={1}
        dir="auto"
        className="flex-1 resize-none bg-transparent border-0 outline-none text-[15px] leading-6 px-2 py-2 max-h-40 text-foreground placeholder:text-foreground/45"
      />

      {isLoading ? (
        <motion.button
          type="button"
          aria-label="Stop"
          data-testid="mobile-composer-stop"
          onClick={onCancel}
          whileTap={{ scale: 0.9 }}
          transition={TAP_SPRING}
          className="theme-fixed shrink-0 flex items-center justify-center bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
          style={{ height: "2.75rem", width: "2.75rem", borderRadius: "999px" }}
        >
          <Square className="w-4 h-4" />
        </motion.button>
      ) : (
        <motion.button
          type="button"
          aria-label="Send message"
          data-testid="mobile-composer-send"
          onClick={onSend}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.88 } : undefined}
          transition={TAP_SPRING}
          className="theme-fixed shrink-0 flex items-center justify-center bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:bg-foreground/15 disabled:text-foreground/60 disabled:shadow-none"
          style={{ height: "2.75rem", width: "2.75rem", borderRadius: "999px" }}
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </div>
  );
}
