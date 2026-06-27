import { ReactNode } from "react";
import "@/styles/agents-theme.css";
import { cn } from "@/lib/utils";

/**
 * Wraps any /agents page in a scoped theme that inherits the SITE's
 * design tokens (background, foreground, primary, etc.). This means
 * the agents pages always follow the user's chosen theme + accent.
 */
export default function AgentsShell({
  children,
  className,
  full = true,
}: {
  children: ReactNode;
  className?: string;
  full?: boolean;
}) {
  return <div className={cn("agents-theme av-bg", full && "min-h-dvh", className)}>{children}</div>;
}

export function AvHeader({
  title,
  subtitle,
  leading,
  trailing,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[hsl(var(--av-bg)/0.75)] border-b border-[hsl(var(--av-border))]">
      <div className="px-4 sm:px-8 py-3 flex items-center gap-3">
        {leading}
        <div className="flex-1 min-w-0">
          {title && (
            <h1 className="av-display text-base sm:text-lg font-semibold text-[hsl(var(--av-fg))] truncate leading-tight">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[11px] text-[hsl(var(--av-fg-3))] truncate">{subtitle}</p>
          )}
        </div>
        {trailing}
      </div>
    </header>
  );
}
