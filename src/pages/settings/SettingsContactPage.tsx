/** @doc Quick contact form from within settings. */
// Contact human support — cartoon redesign on mobile.
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { HumanSupportIcon } from "@/components/settings/SettingsIcons";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, MINT, PEACH, TEXT, MUTED, SURFACE_2 } from "@/pages/billing/ReferralsPage";
import contactSticker from "@/assets/settings/contact-sticker.png";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoLabel,
  BentoTitle,
  BentoBody,
} from "@/components/settings/bento/Bento";

export default function SettingsContactPage() {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || "");
      const meta = (u.user_metadata as any) || {};
      setName(meta.full_name || meta.name || u.email?.split("@")[0] || "");
    });
  }, []);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in name, email and message");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("contact_submissions").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim() || null,
      message: message.trim(),
      form_type: "support",
    });
    setSending(false);
    if (error) {
      toast.error("Failed to send. Please try again.");
      return;
    }
    toast.success("Message sent. We'll reply by email within 24h.");
    setSubject("");
    setMessage("");
  };

  const desktopField =
    "w-full px-3.5 py-3 rounded-xl bg-secondary/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40 focus:bg-secondary/60 transition-colors";

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div>
      <BentoLabel>{label}</BentoLabel>
      <div className="mt-1.5">{children}</div>
    </div>
  );
  const desktopForm = (
    <div>
      <BentoHero
        eyebrow="Contact"
        title="We're here for you"
        description="Write what's going on and a human will reply by email within 24 hours."
        span={4}
        rows={1}
        right={
          <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center text-primary">
            <HumanSupportIcon className="w-6 h-6" />
          </div>
        }
      />
      <div className="mt-6">
        <BentoGrid rowHeight={120}>
          <BentoCard span={2} rows={1}>
            <Field label="Your name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={desktopField}
              />
            </Field>
          </BentoCard>
          <BentoCard span={2} rows={1}>
            <Field label="Your email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={desktopField}
              />
            </Field>
          </BentoCard>
          <BentoCard span={4} rows={1}>
            <Field label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Billing question"
                className={desktopField}
              />
            </Field>
          </BentoCard>
        </BentoGrid>
        <div className="mt-4">
          <BentoGrid rowHeight={260}>
            <BentoCard span={4} rows={1}>
              <Field label="Message">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Describe your issue in detail…"
                  className={`${desktopField} resize-none`}
                />
              </Field>
            </BentoCard>
          </BentoGrid>
        </div>
        <button
          onClick={submit}
          disabled={sending}
          className="mt-4 w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Contact our team"
        subtitle="A human will reply by email within 24 hours."
      >
        {desktopForm}
      </DesktopSettingsLayout>
    );
  }

  const cartoonField = "w-full px-4 py-3 rounded-2xl text-[14px] outline-none transition";
  const fieldStyle = {
    backgroundColor: SURFACE_2,
    border: `1.5px solid hsl(var(--surface-4))`,
    color: TEXT,
    fontWeight: 600,
  } as const;

  return (
    <CartoonPage title="Contact our team">
      <CartoonHero
        sticker={contactSticker}
        bg={PEACH}
        title="We're here for you"
        subtitle="A human will reply by email within 24 hours."
      />

      <CartoonCard className="space-y-4 mt-3">
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
            style={{ color: MUTED, fontWeight: 800 }}
          >
            Your name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cartoonField}
            style={fieldStyle}
          />
        </div>
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
            style={{ color: MUTED, fontWeight: 800 }}
          >
            Your email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className={cartoonField}
            style={fieldStyle}
          />
        </div>
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
            style={{ color: MUTED, fontWeight: 800 }}
          >
            Subject
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Billing question"
            className={cartoonField}
            style={fieldStyle}
          />
        </div>
        <div>
          <label
            className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
            style={{ color: MUTED, fontWeight: 800 }}
          >
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Describe your issue in detail…"
            className={`${cartoonField} resize-none`}
            style={fieldStyle}
          />
        </div>

        <button
          onClick={submit}
          disabled={sending}
          className="w-full h-12 rounded-full text-[14px] flex items-center justify-center gap-2 active:translate-x-[1px] active:translate-y-[1px] transition disabled:opacity-50"
          style={{
            background: MINT,
            color: INK,
            border: `2.5px solid ${INK}`,
            fontWeight: 900,
            boxShadow: `3px 3px 0 ${INK}`,
          }}
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          {sending ? "Sending…" : "Send message"}
        </button>
      </CartoonCard>
    </CartoonPage>
  );
}
