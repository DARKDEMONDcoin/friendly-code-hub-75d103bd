/** @doc Help center entry inside settings. */
// Help center — cartoon redesign on mobile.
import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, YELLOW, TEXT, MUTED, SURFACE_2 } from "@/pages/billing/ReferralsPage";
import helpSticker from "@/assets/settings/help-sticker.png";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoTitle,
  BentoLabel,
  BentoSectionTitle,
} from "@/components/settings/bento/Bento";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const sections = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is Megsy?",
        a: "Megsy is an all-in-one AI creative platform — chat, images, videos, websites/code, presentations, and file analysis, all running on Megsy Credits (MC).",
      },
      {
        q: "How do credits (MC) work?",
        a: "Every action consumes MC. Chat costs 1 MC, images start at 2 MC, videos at 8 MC, and Build projects vary by complexity. Your balance is shown in Settings → Billing.",
      },
      {
        q: "How do I sign in?",
        a: "Go to /auth and sign in with email or Google. Forgot your password? Use the recovery link on the login screen.",
      },
      {
        q: "Free vs paid plans",
        a: "Free includes a starter credit allowance. Paid plans (Starter, Pro, Elite, Enterprise) add monthly MC, faster models, and team features. Compare at /pricing.",
      },
    ],
  },
  {
    title: "Chat",
    items: [
      {
        q: "How do I start a chat?",
        a: "Open /chat and type your prompt. You can attach files, enable web search, switch models, and pick agents from the composer.",
      },
      {
        q: "Can Megsy remember things about me?",
        a: "Yes — important details are saved in Memory. Manage them from Settings → Memory.",
      },
      {
        q: "How do I share a conversation?",
        a: "Open any chat → menu → Share. A read-only public link is created. You can revoke it anytime.",
      },
      {
        q: "What is Deep Research?",
        a: "An agent that runs multi-source web research and returns a structured report with citations.",
      },
      {
        q: "What is Slides mode?",
        a: "Generates a full editable presentation from a prompt. Export to PPTX from the slide deck view.",
      },
    ],
  },
  {
    title: "Images & Video",
    items: [
      {
        q: "How do I generate an image?",
        a: "Open Media → Image Studio, pick a model, write your prompt, choose ratio and quality, then generate.",
      },
      {
        q: "How do I generate a video?",
        a: "Open Media → Video Studio, pick a model, optionally upload a starting image, write your prompt, and generate.",
      },
      {
        q: "What is Lip Sync?",
        a: "Upload a portrait video and an audio file, and Megsy syncs the mouth movements to the audio.",
      },
      {
        q: "Can I edit a generated image?",
        a: "Yes — open the image and use the edit tools (inpaint, upscale, background remove). Each edit costs MC.",
      },
      {
        q: "Where are my generations saved?",
        a: "Everything you generate lives in your Library, scoped to your account or active workspace.",
      },
    ],
  },
  {
    title: "Build (websites & apps)",
    items: [
      {
        q: "How do I start a project?",
        a: "Open /build, describe what you want, and Megsy scaffolds a working project you can iterate on with chat.",
      },
      {
        q: "Can I preview my project?",
        a: "Yes — every project has a live preview pane that updates as the AI edits files.",
      },
      {
        q: "How do I publish a project?",
        a: "Open the project → Publish. You get a free megsy.app subdomain, or connect a custom domain from project Settings.",
      },
      {
        q: "Can I connect a database?",
        a: "Yes — projects can use Lovable Cloud for auth, database, storage, and edge functions.",
      },
    ],
  },
  {
    title: "Workspaces",
    items: [
      {
        q: "What is a workspace?",
        a: "A shared space for teams. Members share credits and content. Switch from the account switcher in Settings.",
      },
      {
        q: "How do I invite a member?",
        a: "Settings → Workspaces → pick a workspace → Members → Invite by email or shareable link.",
      },
      {
        q: "What are roles?",
        a: "Owner controls billing, Admin manages members and content, Member can create and edit, Viewer is read-only.",
      },
      {
        q: "How do credits work in a workspace?",
        a: "Workspace credits are a shared pool. Personal credits stay separate.",
      },
    ],
  },
  {
    title: "Billing & Plans",
    items: [
      {
        q: "How do I buy credits?",
        a: "Settings → Billing → Buy credits. You can pay with card or supported local methods.",
      },
      {
        q: "How do I upgrade my plan?",
        a: "Visit /pricing and choose a plan. Upgrades take effect immediately and unused credits roll over.",
      },
      {
        q: "How do I cancel?",
        a: "Settings → Billing → Manage subscription → Cancel. You keep access until the end of the billing period.",
      },
      {
        q: "Do you offer refunds?",
        a: "Yes within 14 days for unused credits. Contact our team from Help & Support → Contact our team.",
      },
      {
        q: "Can I get an invoice?",
        a: "Invoices are emailed automatically and also available in Settings → Billing → History.",
      },
    ],
  },
  {
    title: "Integrations & API",
    items: [
      {
        q: "Which integrations are available?",
        a: "Settings → Integrations lists every connector. Connect once to use across chat and Build.",
      },
      {
        q: "How do I get an API key?",
        a: "Visit api.megsyai.com → Dashboard → API keys. Each call consumes MC from the key's workspace.",
      },
      {
        q: "What models are exposed via API?",
        a: "All chat, image, video, and embedding models. See docs at api.megsyai.com/docs.",
      },
    ],
  },
  {
    title: "Settings & Privacy",
    items: [
      {
        q: "Where do I change my email or password?",
        a: "Settings → Account → Change email / Change password.",
      },
      {
        q: "How do I delete my account?",
        a: "Settings → Account → Delete account. This is irreversible and wipes all personal data within 30 days.",
      },
      { q: "How do I export my data?", a: "Settings → Privacy & Data → Export." },
      {
        q: "Is my data used for training?",
        a: "No. Your prompts and outputs are never used to train models.",
      },
      {
        q: "How do I enable two-factor auth?",
        a: "Settings → Account → Security → Enable 2FA. Use any TOTP app like 1Password or Authy.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        q: "A generation failed — am I charged?",
        a: "No. Failed generations are automatically refunded within a few minutes.",
      },
      {
        q: "The app feels slow",
        a: "Check status.megsyai.com for incidents. Try a hard refresh, then sign out and back in.",
      },
      {
        q: "I can't sign in",
        a: "Use the password reset link, check for typos in your email, and make sure cookies aren't blocked.",
      },
      {
        q: "Where do I report a bug?",
        a: "Help & Support → Contact our team. Include screenshots and the URL where it happened.",
      },
    ],
  },
];

export default function SettingsHelpPage() {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");

  const filtered = sections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((it) =>
        (it.q + " " + it.a).toLowerCase().includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((sec) => sec.items.length > 0);

  const desktopBody = (
    <div>
      <BentoHero
        eyebrow="Help"
        title="What can we help with?"
        description="Browse curated guides, or jump straight into the full docs."
        span={4}
        rows={1}
        right={
          <Link
            to="/docs"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-semibold text-primary"
          >
            <BookOpen className="w-4 h-4" />
            Open Docs
          </Link>
        }
      />
      {sections.map((sec) => (
        <div key={sec.title}>
          <BentoSectionTitle title={sec.title} />
          <BentoGrid rowHeight={Math.max(180, 70 + sec.items.length * 56)}>
            <BentoCard span={4} rows={1}>
              <Accordion type="single" collapsible className="divide-y divide-border/60">
                {sec.items.map((it, i) => (
                  <AccordionItem key={i} value={`${sec.title}-${i}`} className="border-0">
                    <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-3.5">
                      {it.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-3.5">
                      {it.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </BentoCard>
          </BentoGrid>
        </div>
      ))}
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Help Center"
        subtitle="Guides and answers for every page and section in Megsy."
      >
        {desktopBody}
      </DesktopSettingsLayout>
    );
  }

  return (
    <CartoonPage title="Help Center">
      <CartoonHero
        sticker={helpSticker}
        bg={YELLOW}
        title="What can we help with?"
        subtitle="Guides and answers for every page in Megsy."
      />

      <div className="mt-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FAQs…"
          className="w-full px-4 py-3 rounded-2xl text-[14px] outline-none"
          style={{
            backgroundColor: SURFACE_2,
            border: `1.5px solid hsl(var(--surface-4))`,
            color: TEXT,
            fontWeight: 600,
          }}
        />
      </div>

      <Link
        to="/docs"
        className="mt-4 flex items-center gap-3 p-4 rounded-2xl"
        style={{
          backgroundColor: YELLOW,
          border: `2.5px solid ${INK}`,
          boxShadow: `3px 3px 0 ${INK}`,
        }}
      >
        <span
          className="inline-flex w-10 h-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "#fff", border: `2px solid ${INK}` }}
        >
          <BookOpen className="w-4 h-4" style={{ color: INK }} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px]" style={{ color: INK, fontWeight: 900 }}>
            Read the full Docs
          </div>
          <div className="text-[12px]" style={{ color: INK, fontWeight: 700, opacity: 0.7 }}>
            Every feature + PWA install guide
          </div>
        </div>
        <span className="text-[12px]" style={{ color: INK, fontWeight: 900 }}>
          Open →
        </span>
      </Link>

      <div className="space-y-5 mt-4">
        {filtered.map((sec) => (
          <section key={sec.title}>
            <p
              className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
              style={{ color: MUTED, fontWeight: 800 }}
            >
              {sec.title}
            </p>
            <CartoonCard className="!p-0 overflow-hidden">
              <Accordion type="single" collapsible>
                {sec.items.map((it, i) => (
                  <AccordionItem
                    key={i}
                    value={`${sec.title}-${i}`}
                    className="border-0"
                    style={{ borderTop: i === 0 ? "none" : `1px solid hsl(var(--surface-4))` }}
                  >
                    <AccordionTrigger
                      className="text-[14px] hover:no-underline px-4 py-4"
                      style={{ color: TEXT, fontWeight: 800 }}
                    >
                      {it.q}
                    </AccordionTrigger>
                    <AccordionContent
                      className="text-[13px] leading-relaxed px-4 pb-4"
                      style={{ color: MUTED, fontWeight: 600 }}
                    >
                      {it.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CartoonCard>
          </section>
        ))}
        {filtered.length === 0 && (
          <CartoonCard className="text-center py-8">
            <p className="text-[14px]" style={{ color: TEXT, fontWeight: 800 }}>
              No matches
            </p>
            <p className="text-[12px] mt-1" style={{ color: MUTED, fontWeight: 600 }}>
              Try a different keyword.
            </p>
          </CartoonCard>
        )}
      </div>
    </CartoonPage>
  );
}
