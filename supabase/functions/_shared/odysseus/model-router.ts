// Lightweight, zero-latency model router for the Megsy chat agent.
//
// Picks the cheapest Qwen tier that can still answer the user's request well,
// based on signals we can read from the message itself (length, code,
// reasoning cues, tool-use cues). No extra LLM call — pure heuristics.
//
// Tiers:
//   qwen-turbo         — cheapest, fastest. Greetings, translation,
//                        small talk, short factual Q&A.
//   qwen-plus-latest   — default. Most real chat turns, tool use, code.
//   qwen-max           — heaviest reasoning. Long multi-step problems,
//                        long context, hard reasoning prompts.
//   qwen-vl-max        — anything with an image.

export type QwenTier = "qwen-turbo" | "qwen-plus-latest" | "qwen-max" | "qwen-vl-max";

export interface RouterInput {
  /** OpenAI-style message array. */
  messages: Array<{ role?: string; content?: unknown }>;
  /** Whether the user explicitly chose a model in the UI. If true we honour it. */
  userPickedExplicit: boolean;
  /** The model string already resolved by pickQwenModel. */
  resolvedModel: string;
  /** Whether the user has any connectors connected (more likely to need tool calls). */
  hasIntegrations: boolean;
}

const REASONING_CUES = [
  /\b(why|how come|prove|explain in detail|step[- ]by[- ]step|reason|derive|analy[sz]e)\b/i,
  /\b(لماذا|ليه|اشرح|اشرحلي|حلل|برهن|استنتج|قارن|قارنّ|بالتفصيل|خطوة بخطوة)\b/,
];

const COMPLEX_CODE_CUES = [
  /\b(refactor|architecture|design pattern|trade[- ]?off|performance|optimi[sz]e|debug|race condition|concurrent)\b/i,
  /\b(معماري|أفضل طريقة|إعادة هيكلة|اضبط|اصلح هذا الخطأ|مشكلة في الأداء)\b/,
];

const SIMPLE_INTENT_CUES = [
  /^\s*(hi|hello|hey|yo|hola|salam|سلام|اهلا|أهلا|مرحبا|مرحبًا|صباح|مساء)\b/i,
  /^\s*(thanks|thank you|thx|شكرا|تمام|ok|okay|cool|nice|👍|❤️|😂)\s*[!.?]?\s*$/i,
  /^\s*(ya|ya3ny|ya3ne|ايوة|ايوه|نعم|لا|no|yes)\s*[!.?]?\s*$/i,
];

function lastUserText(messages: RouterInput["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const c = messages[i]?.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) return c.map((p: any) => p?.text || "").join(" ");
    }
  }
  return "";
}

function totalContextChars(messages: RouterInput["messages"]): number {
  let n = 0;
  for (const m of messages) {
    const c = m?.content;
    if (typeof c === "string") n += c.length;
    else if (Array.isArray(c)) {
      for (const p of c) n += p?.text?.length || 0;
    }
    if (n > 200_000) return n;
  }
  return n;
}

function dominantScript(text: string): string {
  const counts = [
    { script: "arabic", count: (text.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g) || []).length },
    { script: "latin", count: (text.match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]/g) || []).length },
    { script: "cjk", count: (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) || []).length },
    { script: "cyrillic", count: (text.match(/[\u0400-\u04ff]/g) || []).length },
  ].sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].script : "unknown";
}

function previousUserScript(messages: RouterInput["messages"]): string {
  let seenLast = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    if (!seenLast) {
      seenLast = true;
      continue;
    }
    const script = dominantScript(lastUserText([messages[i]]));
    if (script !== "unknown") return script;
  }
  return "unknown";
}

/**
 * Decide which Qwen tier to use. Honors the user's explicit choice unless
 * the request clearly needs more horsepower (e.g. very long context).
 */
export function routeModel(input: RouterInput): { model: QwenTier; reason: string } {
  // Multimodal always wins.
  if (input.resolvedModel === "qwen-vl-max") {
    return { model: "qwen-vl-max", reason: "image_in_message" };
  }

  // Respect explicit user pick of turbo / plus / max unless context is huge.
  const ctxChars = totalContextChars(input.messages);
  if (input.userPickedExplicit) {
    if (ctxChars > 60_000 && input.resolvedModel === "qwen-turbo") {
      return { model: "qwen-plus-latest", reason: "upgrade_long_context_from_turbo" };
    }
    return { model: input.resolvedModel as QwenTier, reason: "user_explicit" };
  }

  const text = lastUserText(input.messages).trim();
  const len = text.length;
  const currentScript = dominantScript(text);
  const priorScript = previousUserScript(input.messages);

  // Very long conversation → max.
  if (ctxChars > 80_000) {
    return { model: "qwen-max", reason: "long_context" };
  }

  // Heavy reasoning cues → max.
  if (REASONING_CUES.some((re) => re.test(text)) && len > 80) {
    return { model: "qwen-max", reason: "reasoning_cue" };
  }
  if (COMPLEX_CODE_CUES.some((re) => re.test(text))) {
    return { model: "qwen-max", reason: "complex_code_cue" };
  }

  // If the user switches language/script mid-thread, avoid the tiny model:
  // it is more likely to follow the previous conversation language.
  if (currentScript !== "unknown" && priorScript !== "unknown" && currentScript !== priorScript) {
    return { model: "qwen-plus-latest", reason: "language_switch" };
  }

  // Tiny / pure-chitchat messages → turbo (huge cost saver).
  if (len > 0 && len <= 60 && SIMPLE_INTENT_CUES.some((re) => re.test(text))) {
    return { model: "qwen-turbo", reason: "small_talk" };
  }
  if (len > 0 && len <= 30 && !input.hasIntegrations) {
    return { model: "qwen-turbo", reason: "very_short_input" };
  }

  // Default: balanced plus.
  return { model: "qwen-plus-latest", reason: "default" };
}
