import { ButtonHTMLAttributes } from "react";

interface UnlockProButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

/**
 * Translucent glass "Get Plus" pill — purple-tinted, frosted, sparkle icon.
 * Mirrors the megsyai.com header CTA: dark/glassy with subtle violet glow.
 */
const UnlockProButton = ({ text = "Get Plus", className = "", ...rest }: UnlockProButtonProps) => {
  return (
    <button
      {...rest}
      className={`relative inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] font-semibold text-white tracking-tight whitespace-nowrap transition-all active:scale-[0.97] hover:brightness-110 backdrop-blur-xl ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(168,85,247,0.18) 0%, rgba(124,58,237,0.28) 100%)",
        border: "1px solid rgba(196,181,253,0.45)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.25), 0 8px 24px -10px rgba(139,92,246,0.55), 0 0 0 1px rgba(167,139,250,0.08)",
      }}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M12 2 L13.8 9.2 L21 11 L13.8 12.8 L12 20 L10.2 12.8 L3 11 L10.2 9.2 Z"
          fill="url(#sparkle-grad)"
        />
        <defs>
          <linearGradient id="sparkle-grad" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#e9d5ff" />
          </linearGradient>
        </defs>
      </svg>
      <span>{text}</span>
    </button>
  );
};

export default UnlockProButton;
