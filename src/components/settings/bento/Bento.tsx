/** @doc Clean Linear/Vercel-style primitives shared across all desktop settings pages.
 *  The original bento API names are preserved so existing pages keep compiling;
 *  visually everything renders as flat, stacked sections with subtle borders. */
import { ReactNode, ElementType, ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "gradient" | "danger" | "muted";

const toneStyles: Record<Tone, string> = {
  default: "border-border/60 bg-card/40",
  accent: "border-primary/30 bg-primary/[0.04]",
  gradient: "border-border/60 bg-card/40",
  danger: "border-destructive/30 bg-destructive/[0.04]",
  muted: "border-border/60 bg-muted/20",
};

/** Grid is now a vertical stack of sections — span/rows are ignored on purpose
 *  so legacy pages render in a single clean column. */
export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  rowHeight?: number;
}) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
}

type BentoCardOwnProps = {
  children?: ReactNode;
  className?: string;
  span?: 1 | 2 | 3 | 4;
  rows?: 1 | 2 | 3 | 4;
  tone?: Tone;
  interactive?: boolean;
  as?: ElementType;
  padded?: boolean;
};

export function BentoCard({
  children,
  className,
  tone = "default",
  interactive = false,
  padded = true,
  as,
  span: _span,
  rows: _rows,
  ...rest
}: BentoCardOwnProps & ComponentPropsWithoutRef<"div"> & ComponentPropsWithoutRef<"button">) {
  const Comp: ElementType = as || (rest.onClick ? "button" : "div");
  return (
    <Comp
      className={cn(
        "relative w-full rounded-lg border transition-colors text-left",
        toneStyles[tone],
        padded && "p-5",
        interactive &&
          "hover:border-border hover:bg-card/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer",
        className,
      )}
      {...(rest as any)}
    >
      {children}
    </Comp>
  );
}

export function BentoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function BentoTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[15px] font-semibold text-foreground tracking-tight", className)}>
      {children}
    </h3>
  );
}

export function BentoBody({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function BentoSectionTitle({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 mt-10 first:mt-0 pb-3 border-b border-border/40", className)}>
      <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 text-[12.5px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function BentoStat({
  value,
  label,
  hint,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <BentoLabel>{label}</BentoLabel>
      <div className="text-3xl font-semibold text-foreground leading-none tracking-tight">
        {value}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function BentoFieldTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="text-[13px] text-foreground font-medium truncate">{value}</div>
    </div>
  );
}

export function BentoHero({
  eyebrow,
  title,
  description,
  children,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  span?: 1 | 2 | 3 | 4;
  rows?: 1 | 2 | 3 | 4;
  tone?: Tone;
  children?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pb-6 mb-2 border-b border-border/40", className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && <BentoLabel>{eyebrow}</BentoLabel>}
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground mt-1">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-[13.5px] text-muted-foreground max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function BentoToggleRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function BentoDivider() {
  return <div className="h-px w-full bg-border/60" />;
}