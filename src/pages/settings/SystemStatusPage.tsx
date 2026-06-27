/** @doc Live system status — model providers and edge function health. */
// System Status — live service health from service_status / service_incidents.
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { supabase } from "@/integrations/supabase/client";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoLabel,
  BentoTitle,
  BentoSectionTitle,
} from "@/components/settings/bento/Bento";
import {
  INK,
  MINT,
  YELLOW,
  PINK,
  LAVENDER,
  TEXT,
  MUTED,
  SURFACE_2,
} from "@/pages/billing/ReferralsPage";
import systemStatusSticker from "@/assets/settings/system-status-sticker.png";

type Status = "operational" | "degraded" | "outage";

interface Service {
  name: string;
  desc: string;
  status: Status;
  checkedAt: string | null;
}

interface Incident {
  id: string;
  date: string;
  title: string;
  body: string;
  resolved: boolean;
  tone: string;
}

const STATUS_META: Record<Status, { label: string; color: string; ink: string }> = {
  operational: { label: "Operational", color: MINT, ink: INK },
  degraded: { label: "Degraded", color: YELLOW, ink: INK },
  outage: { label: "Outage", color: PINK, ink: INK },
};

// Canonical service list — order + descriptions for the page.
// Status comes from the live `service_status` table; if a row is missing
// we assume operational (no signal === no known issue), never fake.
const DEFAULT_SERVICES: Array<{ key: string; name: string; desc: string }> = [
  { key: "chat", name: "Chat API", desc: "Conversational endpoints" },
  { key: "image", name: "Image Generation", desc: "Image generation pipelines" },
  { key: "video", name: "Video Generation", desc: "Video generation pipelines" },
  { key: "code", name: "Build / Code", desc: "Workspace builds & previews" },
  { key: "auth", name: "Auth & Accounts", desc: "Login, sessions, OAuth" },
  { key: "billing", name: "Payments & Billing", desc: "Subscriptions & purchases" },
  { key: "storage", name: "Storage & CDN", desc: "Uploads, assets, delivery" },
  { key: "notifications", name: "Email & Notifications", desc: "Transactional emails" },
];

function normalizeStatus(raw: string | null | undefined): Status {
  const s = (raw ?? "").toLowerCase();
  if (s === "outage" || s === "down" || s === "major") return "outage";
  if (s === "degraded" || s === "partial" || s === "slow") return "degraded";
  return "operational";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Dot({ s }: { s: Status }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ backgroundColor: STATUS_META[s].color, border: `1px solid ${INK}` }}
    />
  );
}

export default function SystemStatusPage() {
  const isMobile = useIsMobile();
  const [now, setNow] = useState(new Date());
  const [statusRows, setStatusRows] = useState<
    Record<string, { status: Status; checkedAt: string | null }>
  >({});
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [{ data: statusData }, { data: incidentData }] = await Promise.all([
          supabase
            .from("service_status")
            .select("service_name,status,checked_at")
            .order("checked_at", { ascending: false })
            .limit(200),
          supabase
            .from("service_incidents")
            .select("id,service_name,status,title,message,started_at,resolved_at")
            .order("started_at", { ascending: false })
            .limit(8),
        ]);
        if (!alive) return;
        const map: Record<string, { status: Status; checkedAt: string | null }> = {};
        for (const row of statusData ?? []) {
          const key = (row.service_name ?? "").toLowerCase();
          if (!key || map[key]) continue; // keep latest only
          map[key] = { status: normalizeStatus(row.status), checkedAt: row.checked_at ?? null };
        }
        setStatusRows(map);
        setIncidents(
          (incidentData ?? []).map((row): Incident => {
            const resolved = !!row.resolved_at;
            const s = normalizeStatus(row.status);
            return {
              id: row.id,
              date: formatDate(row.started_at ?? row.resolved_at ?? new Date().toISOString()),
              title: row.title ?? row.service_name ?? "Incident",
              body: row.message ?? "",
              resolved,
              tone: s === "outage" ? PINK : YELLOW,
            };
          }),
        );
      } catch {
        // network/permission failure → show defaults, never crash
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const services: Service[] = useMemo(
    () =>
      DEFAULT_SERVICES.map((s) => {
        const row = statusRows[s.key] ?? statusRows[s.name.toLowerCase()];
        return {
          name: s.name,
          desc: s.desc,
          status: row?.status ?? "operational",
          checkedAt: row?.checkedAt ?? null,
        };
      }),
    [statusRows],
  );

  const overall: Status = services.some((s) => s.status === "outage")
    ? "outage"
    : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational";
  const overallMeta = STATUS_META[overall];

  const body = (
    <div className="space-y-5">
      {/* Overall banner */}
      <div
        className="rounded-[22px] p-5"
        style={{
          backgroundColor: SURFACE_2,
          border: `2px solid ${INK}`,
          boxShadow: `3px 3px 0 ${INK}`,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid place-items-center w-10 h-10 rounded-full"
            style={{ background: overallMeta.color, border: `2px solid ${INK}` }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: INK }} />
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{ color: MUTED, fontWeight: 800 }}
            >
              Overall status
            </p>
            <p
              className="text-[17px]"
              style={{ color: TEXT, fontWeight: 900, letterSpacing: "-0.01em" }}
            >
              {overall === "operational" ? "All systems operational" : overallMeta.label}
            </p>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-[11px]"
            style={{
              background: overallMeta.color,
              color: INK,
              border: `2px solid ${INK}`,
              fontWeight: 800,
            }}
          >
            {overallMeta.label}
          </span>
        </div>
        <p className="text-[12px] mt-3" style={{ color: MUTED, fontWeight: 600 }}>
          Updated {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {loading ? " · syncing…" : ""}
        </p>
      </div>

      {/* Services */}
      <section>
        <p
          className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
          style={{ color: MUTED, fontWeight: 800 }}
        >
          Services
        </p>
        <CartoonCard className="!p-0 overflow-hidden">
          {services.map((s, idx) => {
            const meta = STATUS_META[s.status];
            return (
              <div
                key={s.name}
                className="px-4 py-4"
                style={{ borderTop: idx === 0 ? "none" : `1px solid hsl(var(--surface-4))` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <Dot s={s.status} />
                    <div>
                      <p className="text-[14px]" style={{ color: TEXT, fontWeight: 800 }}>
                        {s.name}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: MUTED, fontWeight: 600 }}>
                        {s.desc}
                      </p>
                    </div>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] shrink-0"
                    style={{
                      background: meta.color,
                      color: INK,
                      border: `1.5px solid ${INK}`,
                      fontWeight: 800,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                {s.checkedAt && (
                  <p className="mt-2 text-[10.5px]" style={{ color: MUTED, fontWeight: 700 }}>
                    Last checked {new Date(s.checkedAt).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </CartoonCard>
      </section>

      {/* Incidents */}
      <section>
        <p
          className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
          style={{ color: MUTED, fontWeight: 800 }}
        >
          Recent incidents
        </p>
        {incidents.length === 0 ? (
          <CartoonCard>
            <p className="text-[13px]" style={{ color: TEXT, fontWeight: 700 }}>
              No incidents reported.
            </p>
            <p className="text-[12px] mt-1" style={{ color: MUTED, fontWeight: 600 }}>
              When something goes wrong we post live updates here.
            </p>
          </CartoonCard>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc) => (
              <motion.div
                key={inc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[20px] p-4"
                style={{
                  backgroundColor: SURFACE_2,
                  border: `2px solid ${INK}`,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px]"
                    style={{
                      background: inc.resolved ? MINT : inc.tone,
                      color: INK,
                      border: `1.5px solid ${INK}`,
                      fontWeight: 800,
                    }}
                  >
                    {inc.resolved ? "Resolved" : "Active"}
                  </span>
                  <p className="text-[11px]" style={{ color: MUTED, fontWeight: 700 }}>
                    {inc.date}
                  </p>
                </div>
                <p className="text-[14px]" style={{ color: TEXT, fontWeight: 800 }}>
                  {inc.title}
                </p>
                {inc.body && (
                  <p
                    className="text-[12px] mt-1 leading-relaxed"
                    style={{ color: MUTED, fontWeight: 600 }}
                  >
                    {inc.body}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <a
        href="mailto:support@megsyai.com?subject=System%20status%20updates"
        className="block text-center text-[12px] py-3 rounded-full"
        style={{ color: INK, background: LAVENDER, border: `2px solid ${INK}`, fontWeight: 800 }}
      >
        Contact support about an outage →
      </a>
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="System Status"
        subtitle="Live service health and recent incidents."
      >
        <div>
          <BentoHero
            eyebrow="Status"
            title={overall === "operational" ? "All systems operational" : overallMeta.label}
            description={`Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${loading ? " · syncing…" : ""}`}
            span={4}
            rows={1}
            tone={overall === "operational" ? "gradient" : "danger"}
            right={
              <span
                className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{
                  background: overallMeta.color,
                  color: "hsl(var(--background))",
                }}
              >
                {overallMeta.label}
              </span>
            }
          />
          <BentoSectionTitle title="Services" />
          <BentoGrid rowHeight={150}>
            {services.map((s) => {
              const meta = STATUS_META[s.status];
              return (
                <BentoCard
                  key={s.name}
                  span={2}
                  rows={1}
                  tone={s.status === "operational" ? "default" : s.status === "degraded" ? "muted" : "danger"}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between gap-3">
                      <BentoLabel>{s.name}</BentoLabel>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: meta.color, color: "hsl(var(--background))" }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-foreground font-semibold">{s.desc}</p>
                      {s.checkedAt && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Checked {new Date(s.checkedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </BentoCard>
              );
            })}
          </BentoGrid>
          <BentoSectionTitle title="Recent incidents" />
          {incidents.length === 0 ? (
            <BentoGrid rowHeight={140}>
              <BentoCard span={4} rows={1}>
                <div className="flex h-full flex-col justify-center">
                  <BentoTitle>No incidents reported</BentoTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    When something goes wrong we post live updates here.
                  </p>
                </div>
              </BentoCard>
            </BentoGrid>
          ) : (
            <BentoGrid rowHeight={160}>
              {incidents.map((inc) => (
                <BentoCard
                  key={inc.id}
                  span={2}
                  rows={1}
                  tone={inc.resolved ? "default" : "danger"}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inc.resolved
                            ? "bg-primary/20 text-primary"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {inc.resolved ? "Resolved" : "Active"}
                      </span>
                      <p className="text-[11px] text-muted-foreground">{inc.date}</p>
                    </div>
                    <div>
                      <BentoTitle>{inc.title}</BentoTitle>
                      {inc.body && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {inc.body}
                        </p>
                      )}
                    </div>
                  </div>
                </BentoCard>
              ))}
            </BentoGrid>
          )}
        </div>
      </DesktopSettingsLayout>
    );
  }

  return (
    <CartoonPage title="System Status">
      <CartoonHero
        sticker={systemStatusSticker}
        bg={MINT}
        title={overall === "operational" ? "All good" : overallMeta.label}
        subtitle="Live service health and recent incidents."
      />
      <div className="mt-2">{body}</div>
    </CartoonPage>
  );
}
