import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type GlowVariant = "starter" | "pro" | "elite" | "business" | "enterprise" | "gold";

// Each tier gets a rotating highlight that matches its card identity.
// starter = mint, pro = electric blue, elite = violet, business = luxury gold.
const VARIANT_GRADIENTS: Record<GlowVariant, string> = {
  starter:
    "conic-gradient(from var(--glow-angle), #22c55e 0deg, #4ade80 70deg, #bbf7d0 95deg, #4ade80 130deg, #22c55e 220deg, #22c55e 360deg)",
  pro: "conic-gradient(from var(--glow-angle), #1e64ff 0deg, #60a5fa 70deg, #bfdbfe 95deg, #60a5fa 130deg, #1e64ff 220deg, #1e64ff 360deg)",
  elite:
    "conic-gradient(from var(--glow-angle), #7c3aed 0deg, #a855f7 70deg, #e9d5ff 95deg, #a855f7 130deg, #7c3aed 220deg, #7c3aed 360deg)",
  business:
    "conic-gradient(from var(--glow-angle), #8a6d22 0deg, #c9a84c 60deg, #fff4c2 95deg, #f5d76b 130deg, #c9a84c 200deg, #8a6d22 300deg, #8a6d22 360deg)",
  enterprise:
    "conic-gradient(from var(--glow-angle), hsl(var(--accent)) 0deg, hsl(var(--primary)) 70deg, hsl(var(--brand-silver)) 95deg, hsl(var(--primary)) 130deg, hsl(var(--accent)) 220deg, hsl(var(--accent)) 360deg)",
  gold: "conic-gradient(from var(--glow-angle), #8a6d22 0deg, #c9a84c 60deg, #fff4c2 95deg, #f5d76b 130deg, #c9a84c 200deg, #8a6d22 300deg, #8a6d22 360deg)",
};

const VARIANT_HALOS: Record<GlowVariant, string> = {
  starter: "rgba(74,222,128,0.45)",
  pro: "rgba(96,165,250,0.55)",
  elite: "rgba(168,85,247,0.60)",
  business: "rgba(245,215,107,0.65)",
  enterprise: "rgba(255,215,0,0.45)",
  gold: "rgba(245,215,107,0.65)",
};

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlowVariant;
  className?: string;
  innerBg?: string;
}

const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  (
    { variant = "gold", className = "", innerBg = "hsl(var(--card))", children, style, ...rest },
    ref,
  ) => {
    const cssVars: CSSProperties = {
      // @ts-expect-error CSS custom props
      "--glow-gradient": VARIANT_GRADIENTS[variant],
      "--glow-inner": innerBg,
      "--glow-halo": VARIANT_HALOS[variant],
      ...style,
    };
    return (
      <button ref={ref} {...rest} style={cssVars} className={`glow-btn ${className}`}>
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
      </button>
    );
  },
);
GlowButton.displayName = "GlowButton";

export default GlowButton;
