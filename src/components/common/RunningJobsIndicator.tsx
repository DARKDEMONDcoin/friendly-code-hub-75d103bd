/** @doc Floating indicator: shows how many long-running jobs (slides, docs, research, video, code) the user has in progress across the whole app. Click to navigate back to the conversation. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useRunningJobs } from "@/hooks/useRunningJobs";
import { getUserSafe } from "@/lib/authSafe";
import { supabase } from "@/integrations/supabase/client";

const KIND_LABEL: Record<string, string> = {
  slides: "عرض تقديمي",
  docs: "مستند",
  deep_research: "بحث عميق",
  video: "فيديو",
  image: "صورة",
  chat: "محادثة",
  code_build: "كود",
};

export function RunningJobsIndicator() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getUserSafe().then((u) => {
      if (!cancelled) setUserId(u?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  const jobs = useRunningJobs(userId);
  const navigate = useNavigate();

  if (!userId || jobs.length === 0) return null;

  const top = jobs[0];
  const label = KIND_LABEL[top.kind] ?? top.kind;
  const stage = top.status_text || top.phase || "جاري التنفيذ…";
  const showAttempt = top.attempt > 0;

  return (
    <button
      type="button"
      onClick={() => {
        if (top.conversation_id) navigate(`/chat/${top.conversation_id}`);
      }}
      className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur hover:bg-background"
      title={jobs.map((j) => `${KIND_LABEL[j.kind] ?? j.kind}: ${j.status_text ?? j.status}`).join("\n")}
      aria-label={`${jobs.length} مهام قيد التنفيذ`}
    >
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="font-medium">
        {jobs.length > 1 ? `${jobs.length} مهام` : label}
      </span>
      <span className="text-muted-foreground max-w-[200px] truncate">{stage}</span>
      {showAttempt && (
        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
          المحاولة {top.attempt + 1}/{top.max_attempts}
        </span>
      )}
      {typeof top.progress === "number" && top.progress > 0 && top.progress < 100 && (
        <span className="text-muted-foreground">{top.progress}%</span>
      )}
    </button>
  );
}
