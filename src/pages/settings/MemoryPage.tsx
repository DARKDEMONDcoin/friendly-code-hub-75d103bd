/** @doc Manage what Megsy remembers across conversations. */
// Memory — clean, single-column list of what Megsy remembers.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Trash2, RotateCcw, Plus, ArrowLeft, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { Switch } from "@/components/ui/switch";
import { goBackOr } from "@/lib/navigation";
import { CleanCard, CleanButton } from "@/components/settings/CleanSettings";
import { cn } from "@/lib/utils";

interface MemoryEntry {
  id: string;
  title: string;
  summary: string;
  scope: string | null;
  created_at: string;
}

interface MemoryProfile {
  account_summary: string | null;
  preferences: Record<string, any> | null;
}

const MemoryPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Manual add
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);
      await refresh(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (uid: string) => {
    const [{ data: prof }, { data: rows }] = await Promise.all([
      supabase
        .from("user_memory_profiles")
        .select("account_summary, preferences")
        .eq("user_id", uid)
        .maybeSingle(),
      supabase
        .from("user_memory_entries")
        .select("id, title, summary, scope, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setProfile((prof as MemoryProfile) ?? { account_summary: null, preferences: null });
    setEnabled(((prof as any)?.preferences?.enabled ?? true) !== false);
    setEntries((rows as MemoryEntry[]) ?? []);
  };

  const handleToggle = async (next: boolean) => {
    if (!userId) return;
    setBusy(true);
    setEnabled(next);
    try {
      const nextPrefs = { ...(profile?.preferences ?? {}), enabled: next };
      const { error } = await supabase
        .from("user_memory_profiles")
        .upsert({ user_id: userId, preferences: nextPrefs }, { onConflict: "user_id" });
      if (error) throw error;
      setProfile((p) => ({
        ...(p ?? { account_summary: null, preferences: null }),
        preferences: nextPrefs,
      }));
      toast.success(next ? "Memory enabled" : "Memory paused");
    } catch (e: any) {
      setEnabled(!next);
      toast.error(e?.message || "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("user_memory_entries").delete().eq("id", id);
      if (error) throw error;
      setEntries((es) => es.filter((e) => e.id !== id));
      toast.success("Memory removed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleReset = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("user_memory_entries").delete().eq("user_id", userId);
      if (error) throw error;
      setEntries([]);
      setResetOpen(false);
      toast.success("All memories reset");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!userId) return;
    const title = newTitle.trim().slice(0, 200);
    const summary = newSummary.trim().slice(0, 2000);
    if (!title || !summary) {
      toast.error("Title and summary are required");
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("user_memory_entries")
        .insert({ user_id: userId, title, summary, scope: "manual" })
        .select("id, title, summary, scope, created_at")
        .maybeSingle();
      if (error) throw error;
      if (data) setEntries((es) => [data as MemoryEntry, ...es]);
      setNewTitle("");
      setNewSummary("");
      setAddOpen(false);
      toast.success("Memory added");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const grouped = useMemo(() => {
    const auto = entries.filter((e) => e.scope !== "manual");
    const manual = entries.filter((e) => e.scope === "manual");
    return { auto, manual };
  }, [entries]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="p-4 border border-border/60 rounded-lg bg-card">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight text-foreground leading-none">
        {value}
      </p>
    </div>
  );

  const AddForm = () => (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-5 space-y-3">
      <p className="text-[12px] font-semibold text-foreground">New memory</p>
      <input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder="Short title (e.g. Loves espresso)"
        maxLength={200}
        className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40"
      />
      <textarea
        value={newSummary}
        onChange={(e) => setNewSummary(e.target.value)}
        placeholder="One-sentence fact Megsy should remember about you"
        rows={3}
        maxLength={2000}
        className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setAddOpen(false);
            setNewTitle("");
            setNewSummary("");
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background disabled:opacity-50 inline-flex items-center gap-2"
        >
          {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );

  const EntryGroup = ({
    title,
    items,
    dashed,
  }: {
    title: string;
    items: MemoryEntry[];
    dashed?: boolean;
  }) => (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-card divide-y divide-border/60 overflow-hidden",
        )}
      >
        {items.map((e) => (
          <div
            key={e.id}
            className="group flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-foreground leading-snug">{e.title}</p>
              <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                {e.summary}
              </p>
            </div>
            <button
              onClick={() => handleDelete(e.id)}
              disabled={deletingId === e.id}
              className="shrink-0 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
              aria-label="Delete memory"
            >
              {deletingId === e.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const body = (
    <div className="space-y-8">
      {/* Status */}
      <div
        className={cn(
          "rounded-xl border p-5 transition-colors",
          enabled
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full",
                enabled ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500",
              )}
            >
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">
                {enabled ? "Memory is active" : "Memory is paused"}
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                {enabled
                  ? "Megsy captures durable facts across every conversation."
                  : "New facts won't be saved and existing ones won't be recalled."}
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={busy} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={entries.length} />
        <Stat label="Added by you" value={grouped.manual.length} />
        <Stat label="From chats" value={grouped.auto.length} />
      </div>

      {/* Add memory */}
      <CleanCard
        title="Teach Megsy a new fact"
        description="Add something you want Megsy to remember every time you chat."
      >
        {!addOpen ? (
          <CleanButton variant="secondary" onClick={() => setAddOpen(true)} className="w-full">
            <Plus className="w-4 h-4" />
            Add memory
          </CleanButton>
        ) : (
          <AddForm />
        )}
      </CleanCard>

      {/* Account summary */}
      {profile?.account_summary && (
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Account summary
          </h2>
          <div className="rounded-lg border border-border/60 bg-secondary/30 px-5 py-4">
            <p className="text-[13.5px] leading-relaxed text-foreground whitespace-pre-wrap">
              {profile.account_summary}
            </p>
          </div>
        </div>
      )}

      {/* Memories list */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-14 text-center">
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            Nothing remembered yet
          </p>
          <p className="text-[13px] text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
            Share durable facts in chat ("I'm a designer based in Cairo") and Megsy will save them
            automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.manual.length > 0 && <EntryGroup title="Added by you" items={grouped.manual} />}
          {grouped.auto.length > 0 && <EntryGroup title="Learned from chats" items={grouped.auto} dashed />}
        </div>
      )}

      {/* Reset */}
      {entries.length > 0 && !resetOpen && (
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg h-10 border border-destructive/30 text-[13px] font-medium text-destructive hover:bg-destructive/5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset all memories
        </button>
      )}

      {resetOpen && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-4">
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-destructive">
              Reset all memories?
            </p>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              Megsy will forget every fact it learned about you. This can't be undone.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reset everything
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (!isMobile) {
    return (
      <DesktopSettingsLayout
        title="Memory"
        subtitle="What Megsy remembers about you, across every conversation."
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl mx-auto py-4"
        >
          {body}
        </motion.div>
      </DesktopSettingsLayout>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-y-auto bg-background text-foreground pb-16">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-lg mx-auto px-4 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => goBackOr(navigate, "/settings")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">Memory</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 safe-bottom">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-5">
            <h2 className="text-[22px] font-semibold tracking-tight">Megsy's Memory</h2>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              You're in control — pause it, delete any memory, or add your own.
            </p>
          </div>
          {body}
        </motion.div>
      </main>
    </div>
  );
};

export default MemoryPage;
