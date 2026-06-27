import { motion } from "framer-motion";
import { Image as ImageIcon, Video as VideoIcon, Play, Pencil, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MediaPlanScene {
  index: number;
  title: string;
  prompt: string;
  duration_seconds?: number;
  first_frame_url?: string;
  last_frame_url?: string;
}

export interface MediaPlan {
  mode: "images" | "video";
  modelSlug: string;
  modelName: string;
  summary: string;
  scenes: MediaPlanScene[];
  estimatedTotalSeconds?: number;
  notes?: string;
  /** User-selected aspect ratio (from MediaSettings) — passed through to the provider. */
  aspectRatio?: string;
}

interface Props {
  plan: MediaPlan;
  status: "awaiting" | "running" | "done" | "cancelled";
  currentSceneIndex?: number;
  onStart: () => void;
  onEditPrompt: () => void;
}

export default function MediaPlanCard({
  plan,
  status,
  currentSceneIndex,
  onStart,
  onEditPrompt,
}: Props) {
  const Icon = plan.mode === "video" ? VideoIcon : ImageIcon;
  const totalCount = plan.scenes.length;
  const hasGeneratedOutput = status === "running" || status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 max-w-[640px] rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-muted text-foreground flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">
            {plan.mode === "video" ? "Video plan" : "Image plan"}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{plan.modelName}</div>
        </div>
        {plan.estimatedTotalSeconds ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />~{plan.estimatedTotalSeconds}s
          </div>
        ) : null}
      </div>

      {plan.summary && (
        <p className="text-sm text-foreground/85 leading-relaxed mb-3">{plan.summary}</p>
      )}

      {hasGeneratedOutput ? (
        <ol className="mb-3 space-y-1.5">
          {plan.scenes.map((s) => {
            const active = status === "running" && currentSceneIndex === s.index;
            const done =
              (status === "running" &&
                typeof currentSceneIndex === "number" &&
                s.index < currentSceneIndex) ||
              status === "done";
            return (
              <li
                key={s.index}
                className={`rounded-xl border p-2.5 text-sm transition-colors ${
                  active
                    ? "border-foreground/40 bg-accent"
                    : done
                      ? "border-border bg-muted/40"
                      : "border-border bg-background/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center ${
                      done || active
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.index}
                  </span>
                  <span className="font-medium text-sm flex-1 min-w-0 truncate">{s.title}</span>
                  {s.duration_seconds && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {s.duration_seconds}s
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground leading-snug ps-7">{s.prompt}</p>
              </li>
            );
          })}
        </ol>
      ) : null}

      {plan.notes && <p className="text-[11px] text-muted-foreground italic mb-3">{plan.notes}</p>}

      {status === "awaiting" && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onStart} className="gap-1.5">
            <Play className="w-3.5 h-3.5" />
            Generate {totalCount}{" "}
            {plan.mode === "video"
              ? totalCount === 1
                ? "scene"
                : "scenes"
              : totalCount === 1
                ? "image"
                : "images"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditPrompt} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" />
            Edit prompt
          </Button>
        </div>
      )}
      {status === "running" && (
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-foreground/40 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-foreground" />
              </span>
              Generating {currentSceneIndex ?? 1} of {totalCount}…
            </span>
            <span className="text-muted-foreground">
              {Math.round((((currentSceneIndex ?? 1) - 1) / totalCount) * 100)}%
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-foreground"
              initial={{ width: 0 }}
              animate={{
                width: `${(((currentSceneIndex ?? 1) - 1) / totalCount) * 100}%`,
              }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
          </div>
        </div>
      )}
      {status === "done" && (
        <div className="pt-1 text-xs text-muted-foreground">All outputs are ready.</div>
      )}
      {status === "cancelled" && (
        <div className="pt-1 text-xs text-muted-foreground">Cancelled</div>
      )}
    </motion.div>
  );
}
