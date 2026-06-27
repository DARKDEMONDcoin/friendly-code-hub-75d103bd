import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { ReactNode } from "react";

const iosSpring = { type: "spring" as const, damping: 22, stiffness: 350 };

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-3 -mb-1 text-[11px] font-black tracking-wider uppercase text-brand-muted">
    {children}
  </div>
);

export const SectionCard = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[24px] overflow-hidden bg-surface-1 border-[2.5px] border-brand-ink shadow-[4px_4px_0_hsl(var(--brand-action)/0.18)]">
    {children}
  </div>
);

export const SheetDivider = () => <div className="h-[1.5px] bg-surface-4 ml-12" />;

interface SheetRowProps {
  Icon?: LucideIcon;
  customIcon?: ReactNode;
  label: string;
  desc?: string;
  badge?: string;
  active?: boolean;
  chevron?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  /** hex color for the icon chip background */
  accent?: string;
  /** kept for backwards compat — ignored (icons are now flat monochrome) */
  tint?: string;
}

export const SheetRow = ({
  Icon,
  customIcon,
  label,
  desc,
  badge,
  active,
  chevron,
  trailing,
  onClick,
  accent = "hsl(var(--brand-action))",
}: SheetRowProps) => (
  <motion.button
    whileTap={{ scale: 0.985 }}
    transition={iosSpring}
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-3 text-left active:translate-x-[2px] active:translate-y-[2px] transition-transform"
  >
    <span
      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-brand-ink border-2 border-brand-ink"
      style={{ backgroundColor: accent }}
    >
      {customIcon ? (
        customIcon
      ) : Icon ? (
        <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
      ) : null}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[14.5px] font-black text-brand-parchment leading-tight truncate">
          {label}
        </span>
        {badge && (
          <span className="text-[9px] font-black px-1.5 py-px rounded-full bg-brand-blush text-brand-ink border border-brand-ink leading-none tracking-wide">
            {badge}
          </span>
        )}
        {active && (
          <span className="w-2 h-2 rounded-full bg-brand-mint border border-brand-ink ml-0.5" />
        )}
      </div>
      {desc && (
        <div className="text-[12px] text-brand-muted font-semibold leading-tight mt-0.5 truncate">
          {desc}
        </div>
      )}
    </div>
    {trailing}
    {chevron && !trailing && (
      <ChevronRight className="w-4 h-4 text-brand-parchment/60 shrink-0" strokeWidth={2.5} />
    )}
  </motion.button>
);

interface DesktopRowProps {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  chevron?: boolean;
  /** Optional hex/css color for the leading icon. Defaults to brand-action. */
  color?: string;
}

export const DesktopRow = ({ Icon, label, onClick, chevron, color }: DesktopRowProps) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-surface-3 active:translate-x-[2px] active:translate-y-[2px] transition-all"
  >
    <Icon
      className="w-[18px] h-[18px] shrink-0"
      strokeWidth={2.2}
      style={{ color: color ?? "hsl(var(--brand-action))" }}
    />
    <span className="flex-1 text-[13.5px] font-bold text-brand-parchment">{label}</span>
    {chevron && <ChevronRight className="w-3.5 h-3.5 text-brand-muted" />}
  </button>
);
