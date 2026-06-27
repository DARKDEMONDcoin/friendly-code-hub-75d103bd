// =====================================================================
// CENTRALIZED PRICING DATA — single source of truth for plans, services,
// FAQs, and enterprise features. Imported by /pricing and by the support
// chat's auto-built knowledge base so they NEVER drift apart.
// =====================================================================

export type PlanTier = "starter" | "pro" | "elite" | "business";

export const PLAN_MONTHLY_CREDITS: Record<PlanTier, number> = {
  starter: 70,
  pro: 240,
  elite: 500,
  business: 1200,
};

export interface PlanCardConfig {
  tier: PlanTier;
  name: string;
  label: string;
  bg: string;
  text: string;
  subText: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyCredits: string;
  yearlyCredits: string;
  features: string[];
  ctaBg: string;
  ctaText: string;
  ctaHover: string;
  bubbleColor: string;
  topBadge?: boolean;
  glow?: string;
  isDark?: boolean;
}

export const PLANS: PlanCardConfig[] = [
  {
    tier: "pro",
    name: "Pro",
    label: "",
    bg: "linear-gradient(165deg, #1e64ff 0%, #2563eb 55%, #1d4fd8 100%)",
    text: "#ffffff",
    subText: "rgba(255, 255, 255, 0.78)",
    monthlyPrice: 25,
    yearlyPrice: 250,
    monthlyCredits: `${PLAN_MONTHLY_CREDITS.pro} MC / month`,
    yearlyCredits: "Save $50 + 480 bonus MC",
    features: [
      "Unlimited Chat — Megsy AI chat models",
      "Image generation with current active image models",
      "Video generation with current active video models",
      "Code Builder, Slides, Docs & Deep Research included",
      "Unlimited Slides, Docs & Deep Research",
      "Unlimited Megsy OS autonomous agents — runs 24/7",
      "Team workspace included",
      "Priority email support",
    ],
    ctaBg: "#0b1020",
    ctaText: "#ffffff",
    ctaHover: "#15203f",
    bubbleColor: "rgba(147, 197, 253, 0.45)",
    isDark: true,
  },
  {
    tier: "elite",
    name: "Elite",
    label: "MOST POPULAR",
    bg: "linear-gradient(165deg, #8b5cf6 0%, #7c3aed 55%, #6d28d9 100%)",
    text: "#ffffff",
    subText: "rgba(255, 255, 255, 0.78)",
    monthlyPrice: 59,
    yearlyPrice: 590,
    monthlyCredits: `${PLAN_MONTHLY_CREDITS.elite} MC / month`,
    yearlyCredits: "Save $118 + 1,000 bonus MC",
    features: [
      "Unlimited Chat — Megsy AI chat models",
      "Image generation with current active image models",
      "Video generation with current active video models",
      "Code Builder, Slides, Docs & Deep Research included",
      "Unlimited Slides, Docs & Deep Research",
      "Unlimited Megsy OS autonomous agents — runs 24/7",
      "Priority queue — 3× faster generations",
      "Team workspace included",
      "Advanced presets & custom branding",
      "Analytics dashboard",
      "24/7 priority chat support",
    ],
    ctaBg: "#0b0420",
    ctaText: "#ffffff",
    ctaHover: "#1a0a3a",
    bubbleColor: "rgba(216, 180, 254, 0.45)",
    topBadge: true,
    isDark: true,
  },
  {
    tier: "business",
    name: "Business",
    label: "BEST VALUE",
    bg: "linear-gradient(165deg, #050505 0%, #14100a 35%, #1c1608 55%, #0a0805 100%)",
    text: "#f5e6b8",
    subText: "rgba(245, 230, 184, 0.72)",
    monthlyPrice: 149,
    yearlyPrice: 1490,
    monthlyCredits: `${PLAN_MONTHLY_CREDITS.business} MC / month`,
    yearlyCredits: "Save $298 + 2,400 bonus MC",
    features: [
      "Unlimited Chat — Megsy AI chat models",
      "Image generation with current active image models",
      "Video generation with current active video models",
      "Code Builder, Slides, Docs & Deep Research included",
      "Unlimited Slides, Docs & Deep Research",
      "Unlimited Megsy OS autonomous agents — runs 24/7",
      "Unlimited team seats",
      "Priority queue — 3× faster generations",
      "Advanced presets & custom branding",
      "Analytics dashboard",
      "SSO & SAML authentication",
      "Dedicated infrastructure",
      "99.9% SLA guarantee",
      "White-glove onboarding & success manager",
    ],
    ctaBg: "linear-gradient(135deg, #f5d76b 0%, #c9a84c 50%, #8a6d22 100%)",
    ctaText: "#0a0805",
    ctaHover: "#f5d76b",
    bubbleColor: "rgba(245, 215, 107, 0.45)",
    isDark: true,
  },
];

export const ENTERPRISE_FEATURES: string[] = [
  "Custom MC Allocation",
  "Priority Megsy AI compute lane",
  "Dedicated Infrastructure",
  "SLA Guarantees",
  "Custom API Access & Integrations",
  "Enterprise Security (SOC2-ready, GDPR & Advanced Encryption)",
  "Data Privacy & Compliance",
  "Early access to new Megsy capabilities",
  "Advanced Analytics & Reporting",
  "Dedicated Account Manager",
  "24/7 Priority Support",
  "Priority Onboarding & Training",
  "Monthly Business Reviews",
  "Volume Discounts",
  "Custom Contract, Invoicing & Billing",
];

export const SERVICES_GUIDE: { name: string; desc: string }[] = [
  {
    name: "Unlimited Chat",
    desc: "Talk to Megsy AI — our own model, with no daily caps. Free plan uses Megsy Lite.",
  },
  {
    name: "Image Generation",
    desc: "Generate unlimited high-quality images during your unlimited window (7/15/30 days depending on plan). Outside the window, uses MC credits.",
  },
  {
    name: "Slides & Presentations",
    desc: "Create complete slide decks from a prompt — fully editable, exportable to PPT/PDF. Free plan: 3 / day.",
  },
  {
    name: "Docs & Deep Research",
    desc: "Long-form documents and multi-source research reports with citations. Free plan: 3 of each per day.",
  },
  {
    name: "Code Builder",
    desc: "Build full apps and websites in natural language, with one-click deploy. Unlimited during your plan window.",
  },
  {
    name: "Video Generation",
    desc: "Credit-based on all plans. Each video consumes MC from your monthly balance — never charged extra.",
  },
  {
    name: "Megsy OS",
    desc: "Your autonomous 24/7 agent. Runs tasks, monitors projects, and executes multi-step work in the background. Unlimited on all paid plans.",
  },
  {
    name: "Megsy Credits (MC)",
    desc: "Credits cover video generation and any usage outside your unlimited windows. Credits reset at the start of each billing cycle.",
  },
  {
    name: "Team Workspace",
    desc: "Shared projects, files, and chats for your team. Pro+ includes seats; Business is unlimited.",
  },
  {
    name: "Priority Queue",
    desc: "Elite & Business get 3× faster generation speeds and skip the standard queue.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Can I change or cancel my plan anytime?",
    a: "Yes. You can upgrade, downgrade, or cancel at any time from your billing settings. Upgrades take effect immediately; downgrades take effect at the end of the current billing cycle.",
  },
  {
    q: "What happens when I run out of Megsy Credits (MC)?",
    a: "Chat with Megsy AI is always unlimited and never uses MC. Images, Slides, Docs, Deep Research and Code Builder are unlimited inside your plan's window (7/15/30 days). MC are only consumed for video generation and any usage outside your unlimited window. You can top up MC anytime or wait for the next renewal.",
  },
  {
    q: "What's the difference between the 'unlimited window' and MC?",
    a: "Each paid plan gives you an unlimited window (7 days for Pro, 15 for Elite, all month for Business) where Images, Slides, Docs, Deep Research and Code Builder have no caps. Chat with Megsy AI is unlimited at all times. Video generation is always credit-based and uses your monthly MC balance.",
  },
  {
    q: "Do unused credits roll over?",
    a: "MC reset at the start of each billing cycle and don't roll over. Yearly plans get bonus MC upfront on top of saving 2 months on price.",
  },
  {
    q: "Do you offer refunds?",
    a: "See our Refund Policy in the footer for the latest terms and eligibility.",
  },
  {
    q: "Is my payment secure?",
    a: "All payments are processed by Dodo Payments with bank-grade encryption. We never store your card details on our servers.",
  },
  {
    q: "Do you offer team or enterprise plans?",
    a: "Yes. Business includes unlimited team seats. For custom MC allocation, SSO, SLA guarantees, or dedicated infrastructure, contact our sales team via the Enterprise card above.",
  },
];
