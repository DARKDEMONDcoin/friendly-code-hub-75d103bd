import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import type { Integration } from "@/lib/integrationsData";
import { cn } from "@/lib/utils";

const FAVICON_SOURCES = (domain: string) => [
  `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];

const BrandLogo = ({ integration, size = 32 }: { integration: Integration; size?: number }) => {
  const [srcIdx, setSrcIdx] = useState(0);
  const sources = integration.domain ? FAVICON_SOURCES(integration.domain) : [];
  const url = sources[srcIdx];
  if (!url) {
    return (
      <span className="font-semibold text-foreground/70" style={{ fontSize: size * 0.55 }}>
        {integration.name.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="object-contain"
      onError={() => setSrcIdx((i) => i + 1)}
    />
  );
};

const descriptions: Record<string, string> = {
  github:
    "Connect GitHub via OAuth to push code, create repos, and read repository contents directly from the app.",
  supabase:
    "Link your Supabase project via OAuth to manage data, migrations, and edge functions from the app.",
  email:
    "Get important notifications by email. Powered by Resend on the backend — no third-party login required.",
  telegram:
    "Receive notifications on Telegram. Open the bot, send /start, then paste your chat id here.",
  cloudflare:
    "Cloudflare Pages deployment runs through a backend API token. Status is shown when the server token is configured.",
};

interface FormState {
  email_address?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
}

interface Props {
  integration: Integration | null;
  isConnected: boolean;
  isLoading: boolean;
  meta?: Record<string, any>;
  onConnect: (form?: FormState) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

export default function IntegrationDetailModal({
  integration,
  isConnected,
  isLoading,
  meta,
  onConnect,
  onDisconnect,
  onClose,
}: Props) {
  const [email, setEmail] = useState("");
  const [chatId, setChatId] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!integration) return;
    setEmail(meta?.email_address ?? "");
    setChatId(meta?.telegram_chat_id ?? "");
    setUsername(meta?.telegram_username ?? "");
  }, [integration, meta]);

  if (!integration) return null;

  const isService = integration.type === "service";
  const isNotification = integration.type === "notification";
  const available = meta?.available !== false;

  const submit = () => {
    if (integration.app === "email") return onConnect({ email_address: email });
    if (integration.app === "telegram")
      return onConnect({ telegram_chat_id: chatId, telegram_username: username });
    return onConnect();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden max-h-[88vh] flex flex-col bg-card text-foreground border border-border sm:rounded-2xl"
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-border/60 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="grid place-items-center shrink-0 rounded-lg bg-background border border-border" style={{ width: 52, height: 52 }}>
                <BrandLogo integration={integration} size={28} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight truncate text-foreground">
                  {integration.name}
                </h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {integration.category}
                  {isConnected ? " · Connected" : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Close
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <section>
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                About
              </p>
              <p className="text-[14px] leading-relaxed text-foreground/80">
                {descriptions[integration.app] ?? integration.description}
              </p>
            </section>

            {!available && (
              <div className="p-3 rounded-lg text-[12px] bg-secondary text-muted-foreground border border-border">
                This integration is not configured on the server yet.
              </div>
            )}

            {integration.app === "email" && (
              <div className="space-y-2">
                <label className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-border"
                />
              </div>
            )}

            {integration.app === "telegram" && (
              <div className="space-y-2">
                <label className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Your Telegram chat id
                </label>
                <input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="123456789"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-border"
                />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@username (optional)"
                  className="w-full px-3 py-2.5 rounded-lg bg-secondary text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-border"
                />
                <p className="text-[11px] text-muted-foreground">
                  Get your id by messaging @userinfobot on Telegram.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-border/60">
            {isService ? (
              <div className="w-full py-2.5 text-center text-[12px] font-medium rounded-lg bg-secondary text-foreground border border-border">
                {isConnected ? "Configured on the server" : "Not configured on the server"}
              </div>
            ) : isConnected ? (
              <button
                onClick={onDisconnect}
                disabled={isLoading}
                className="w-full py-2.5 text-[13px] font-medium rounded-lg border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                {isLoading ? "Working…" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={isLoading || !available}
                className={cn(
                  "w-full py-2.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50",
                )}
              >
                {isLoading
                  ? "Connecting…"
                  : isNotification
                    ? `Enable ${integration.name}`
                    : `Connect ${integration.name}`}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
