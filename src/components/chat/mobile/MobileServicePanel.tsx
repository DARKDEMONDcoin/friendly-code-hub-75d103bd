import { motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  label: string;
  Icon: LucideIcon;
  onClose: () => void;
  children?: ReactNode;
  /** Optional compact tabs/controls rendered inline in the header. */
  headerSlot?: ReactNode;
}

const SPRING = { type: "spring" as const, stiffness: 380, damping: 28, mass: 0.7 };

export default function MobileServicePanel({ label, Icon, onClose, children, headerSlot }: Props) {
  return (
    <motion.div
      data-testid="mobile-service-panel"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={SPRING}
      className="md:hidden -mb-3 rounded-t-[28px] border-[2.5px] border-b-0 border-brand-ink bg-surface-1 px-4 pt-2.5 pb-4 shadow-[0_-4px_0_rgba(59,130,246,0.18)]"
    >
      <div
        className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-brand-action border border-brand-ink"
        aria-hidden
      />
      <div className="flex items-center gap-2 px-0.5 pb-3">
        <div className="flex items-center gap-1.5 text-brand-parchment shrink-0">
          <Icon size={14} strokeWidth={2.5} className="text-brand-action" />
          <span className="text-[13px] font-black leading-none tracking-tight">{label}</span>
        </div>
        {headerSlot && <div className="flex-1 min-w-0 flex justify-center">{headerSlot}</div>}
        <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={onClose}
          className="shrink-0 ml-auto inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-action text-brand-ink border-2 border-brand-ink transition-colors"
        >
          <X size={16} strokeWidth={2.3} />
        </button>
      </div>
      {children ? <div className="flex flex-col gap-2.5">{children}</div> : null}
    </motion.div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}

export function ServiceSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex items-center p-1 rounded-full bg-surface-3 border-2 border-surface-4"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className="relative h-7 px-4 inline-flex items-center justify-center rounded-full text-[12px] font-semibold tracking-tight transition-colors whitespace-nowrap"
          >
            {active && (
              <motion.span
                layoutId={`svc-seg-${ariaLabel ?? "panel"}`}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-brand-action border-2 border-brand-ink"
              />
            )}
            <span
              className={`relative z-10 transition-colors ${active ? "text-brand-ink font-black" : "text-brand-parchment/65 hover:text-brand-parchment font-bold"}`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface RowProps {
  label: string;
  value?: string;
  onClick: () => void;
  trailing?: ReactNode;
}

export function ServiceRow({ label, value, onClick, trailing }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-11 flex items-center justify-between px-4 rounded-full bg-surface-3 border-2 border-surface-4 text-brand-parchment active:translate-x-[2px] active:translate-y-[2px] transition-all"
    >
      <span className="text-[13px] font-black">{label}</span>
      <span className="flex items-center gap-1.5 text-brand-muted text-[12px] font-bold">
        {value && <span className="truncate max-w-[160px]">{value}</span>}
        {trailing}
      </span>
    </button>
  );
}
