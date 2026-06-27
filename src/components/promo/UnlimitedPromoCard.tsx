import { motion } from "framer-motion";
import MegsyStar from "@/components/files/MegsyStar";
import { usePromoCountdown } from "@/hooks/usePromoCountdown";

const pad = (n: number) => String(n).padStart(2, "0");

const UnlimitedPromoCard = () => {
  const { active, days, hours, minutes, seconds } = usePromoCountdown();

  if (!active) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-white/10 bg-gradient-to-br from-[#0f0f10] via-[#1c1c1f] to-[#0f0f10]"
      >
        {/* ambient gold glow */}
        <div
          aria-hidden
          className="absolute -top-24 -right-24 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(250,204,21,0.35) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(217,91,60,0.35) 0%, transparent 70%)",
          }}
        />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-semibold tracking-wide uppercase border border-white/10">
              Limited time offer
            </span>
            <h3 className="text-2xl sm:text-3xl font-black leading-tight">
              <span className="inline-flex items-center gap-2">
                <MegsyStar size={28} static className="text-[#facc15]" />
                Unlimited everything — free for your first month
              </span>
            </h3>
            <p className="text-white/80 text-sm sm:text-base leading-relaxed">
              Subscribe within the next 3 days and get unlimited Chat, Images, Videos, Slides, Docs,
              Deep Research and Code Builder for your entire first month — plus 50% OFF on every
              plan. After this offer ends, plans return to standard usage windows.
            </p>
          </div>

          <div className="shrink-0">
            <div className="text-xs uppercase tracking-wider opacity-70 mb-2 text-center lg:text-right">
              Offer ends in
            </div>
            <div className="flex items-center gap-2 font-mono tabular-nums" aria-live="polite">
              <TimeBox value={pad(days)} label="Days" />
              <Sep />
              <TimeBox value={pad(hours)} label="Hours" />
              <Sep />
              <TimeBox value={pad(minutes)} label="Min" />
              <Sep />
              <TimeBox value={pad(seconds)} label="Sec" />
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

const TimeBox = ({ value, label }: { value: string; label: string }) => (
  <div className="flex flex-col items-center">
    <div className="min-w-[3rem] sm:min-w-[3.5rem] px-2.5 py-2 rounded-xl bg-white/10 backdrop-blur text-2xl sm:text-3xl font-bold text-center border border-white/10 shadow-sm">
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">{label}</div>
  </div>
);

const Sep = () => (
  <span aria-hidden className="text-2xl sm:text-3xl font-bold opacity-50 -mt-4">
    :
  </span>
);

export default UnlimitedPromoCard;
