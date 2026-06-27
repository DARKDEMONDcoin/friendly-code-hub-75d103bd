// Shared mobile shell + sticker hero for cartoon-styled settings pages.
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { INK, SURFACE, BORDER, TEXT, PAGE_BG } from "@/pages/billing/ReferralsPage";

export function CartoonHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        backgroundColor: `${PAGE_BG}E6`,
        backdropFilter: "saturate(160%) blur(18px)",
        WebkitBackdropFilter: "saturate(160%) blur(18px)",
        borderBottom: `1.5px solid ${BORDER}`,
      }}
    >
      <div className="max-w-lg mx-auto px-5 flex items-center justify-between py-3 safe-top">
        <button
          onClick={() => (onBack ? onBack() : navigate("/settings"))}
          className="grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
          style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}`, color: TEXT }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <h1
          className="text-[17px]"
          style={{ fontWeight: 900, letterSpacing: "-0.02em", color: TEXT }}
        >
          {title}
        </h1>
        <div className="w-10" />
      </div>
    </header>
  );
}

export function CartoonHero({
  sticker,
  bg,
  title,
  subtitle,
  trailing,
}: {
  sticker: string;
  bg: string;
  title?: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div
      className="mt-4 rounded-[28px] p-6 flex flex-col items-center text-center"
      style={{ backgroundColor: bg, border: `2.5px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}
    >
      <img src={sticker} alt="" width={130} height={130} loading="lazy" />
      {title && (
        <h2
          className="mt-2 text-[20px]"
          style={{ fontWeight: 900, color: INK, letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          className="mt-1 text-[13px] max-w-[280px]"
          style={{ fontWeight: 700, color: INK, opacity: 0.8 }}
        >
          {subtitle}
        </p>
      )}
      {trailing}
    </div>
  );
}

export function CartoonPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="relative min-h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: PAGE_BG, color: TEXT }}
    >
      <CartoonHeader title={title} />
      <div className="max-w-lg mx-auto px-4 pb-12 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export function CartoonCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-3 rounded-[24px] p-5 ${className}`}
      style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
    >
      {children}
    </div>
  );
}
