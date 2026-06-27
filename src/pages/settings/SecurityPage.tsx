/** @doc Security overview — sessions, MFA, recovery codes. */
// Security — cartoon redesign. Public marketing page with cartoon hero + cards.
import { motion } from "framer-motion";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import SEOHead from "@/components/common/SEOHead";
import { Lock, Server, Eye, FileCheck, AlertTriangle, Globe, Key, Shield } from "lucide-react";
import { INK, YELLOW, MINT, PINK, LAVENDER, PEACH, SURFACE_2 } from "@/pages/billing/ReferralsPage";
import securitySticker from "@/assets/settings/security-sticker.png";

const practices = [
  {
    icon: Lock,
    title: "Encryption",
    desc: "TLS 1.3 in transit and AES-256 at rest. API keys are hashed with bcrypt.",
    tone: MINT,
  },
  {
    icon: Server,
    title: "Infrastructure",
    desc: "SOC 2 cloud infra with automated backups, multi-region redundancy, 99.9% uptime SLA.",
    tone: YELLOW,
  },
  {
    icon: Key,
    title: "Authentication",
    desc: "Industry-standard auth, optional 2FA, secure sessions, automatic expiration.",
    tone: LAVENDER,
  },
  {
    icon: Eye,
    title: "Access control",
    desc: "RBAC across systems. Least-privilege enforced. All access is logged.",
    tone: PINK,
  },
  {
    icon: FileCheck,
    title: "Compliance",
    desc: "GDPR and CCPA compliant. Regular privacy impact assessments and DPAs.",
    tone: PEACH,
  },
  {
    icon: AlertTriangle,
    title: "Incident response",
    desc: "24/7 monitoring. Documented plan, <1 hour response, 72h GDPR notice.",
    tone: MINT,
  },
  {
    icon: Globe,
    title: "Data residency",
    desc: "Export anytime. Full deletion upon account closure within 30 days.",
    tone: YELLOW,
  },
  {
    icon: Shield,
    title: "Responsible AI",
    desc: "Content safety filters, harmful content detection, regular bias audits.",
    tone: LAVENDER,
  },
];

const SecurityPage = () => (
  <div className="min-h-dvh" style={{ backgroundColor: SURFACE_2 }}>
    <SEOHead
      title="Security"
      description="Learn about Megsy AI's security practices, data protection, encryption, and compliance commitments. Your data safety is our priority."
      path="/security"
    />
    <LandingNavbar />

    <section className="max-w-5xl mx-auto px-5 pt-20 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="rounded-[40px] p-8 sm:p-12 flex flex-col items-center text-center"
        style={{ backgroundColor: MINT, border: `3px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}` }}
      >
        <img src={securitySticker} alt="" width={180} height={180} loading="eager" />
        <p
          className="mt-4 inline-block px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.18em]"
          style={{ background: INK, color: MINT, fontWeight: 800 }}
        >
          Enterprise-grade security
        </p>
        <h1
          className="mt-5 text-4xl sm:text-6xl"
          style={{ color: INK, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          Security & Trust
        </h1>
        <p
          className="mt-5 max-w-2xl text-[15px] sm:text-base leading-relaxed"
          style={{ color: INK, fontWeight: 600, opacity: 0.85 }}
        >
          Your data security is foundational to everything we build. Here's how we protect your
          creative work and personal information.
        </p>
      </motion.div>
    </section>

    <section className="max-w-5xl mx-auto px-5 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {practices.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="rounded-[24px] p-6"
            style={{
              backgroundColor: "#fff",
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-2xl grid place-items-center"
                style={{ background: p.tone, border: `2px solid ${INK}`, color: INK }}
              >
                <p.icon className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <h2
                className="text-lg"
                style={{ color: INK, fontWeight: 900, letterSpacing: "-0.02em" }}
              >
                {p.title}
              </h2>
            </div>
            <p
              className="text-[14px] leading-relaxed"
              style={{ color: INK, fontWeight: 600, opacity: 0.75 }}
            >
              {p.desc}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-10 rounded-[28px] p-8 text-center"
        style={{
          backgroundColor: YELLOW,
          border: `2.5px solid ${INK}`,
          boxShadow: `4px 4px 0 ${INK}`,
        }}
      >
        <h2 className="text-xl mb-2" style={{ color: INK, fontWeight: 900 }}>
          Report a vulnerability
        </h2>
        <p className="text-[13.5px] mb-3" style={{ color: INK, fontWeight: 600, opacity: 0.8 }}>
          If you discover a vulnerability, please report it responsibly.
        </p>
        <a
          href="mailto:security@megsyai.com"
          className="inline-block px-5 py-2.5 rounded-full text-[13px] active:translate-x-[1px] active:translate-y-[1px] transition"
          style={{ background: INK, color: YELLOW, border: `2px solid ${INK}`, fontWeight: 800 }}
        >
          security@megsyai.com
        </a>
      </motion.div>
    </section>

    <LandingFooter />
  </div>
);

export default SecurityPage;
