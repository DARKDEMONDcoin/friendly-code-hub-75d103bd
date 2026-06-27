type ChatMessageLike = {
  role?: string;
  content?: unknown;
};

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => part?.text || part?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function latestUserText(messages: ChatMessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const text = contentToText(messages[i].content).trim();
      if (text) return text;
    }
  }
  return "";
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function detectLatinLanguage(text: string): string {
  const lower = ` ${text.toLowerCase()} `;
  if (/[¿¡ñáéíóúü]/i.test(text) || /\b(que|para|como|por|con|una|uno|los|las|del|qué|cómo)\b/i.test(lower)) {
    return "Spanish";
  }
  if (/[àâçéèêëîïôùûüÿœ]/i.test(text) || /\b(avec|pour|dans|est|une|des|les|bonjour|merci)\b/i.test(lower)) {
    return "French";
  }
  if (/[ãõáéíóúç]/i.test(text) || /\b(você|para|com|uma|obrigado|olá)\b/i.test(lower)) {
    return "Portuguese";
  }
  if (/[äöüß]/i.test(text) || /\b(und|oder|ich|nicht|danke|bitte|wie|was)\b/i.test(lower)) {
    return "German";
  }
  if (/\b(ciao|grazie|perché|come|sono|una|con|per)\b/i.test(lower)) {
    return "Italian";
  }
  if (/[ğışçöü]/i.test(text) || /\b(merhaba|teşekkür|nasıl|için|bir)\b/i.test(lower)) {
    return "Turkish";
  }
  if (/\b(the|what|why|how|when|where|please|thanks|hello|hi|fix|make|write|explain|test)\b/i.test(lower)) {
    return "English";
  }
  return "the exact Latin-script language used by the user";
}

export function detectResponseLanguage(text: string): string {
  const sample = text.trim();
  if (!sample) return "the user's exact language";

  const counts = [
    { name: "Arabic", count: countMatches(sample, /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g) },
    { name: "Hebrew", count: countMatches(sample, /[\u0590-\u05ff]/g) },
    { name: "Chinese", count: countMatches(sample, /[\u3400-\u4dbf\u4e00-\u9fff]/g) },
    { name: "Japanese", count: countMatches(sample, /[\u3040-\u30ff]/g) },
    { name: "Korean", count: countMatches(sample, /[\uac00-\ud7af]/g) },
    { name: "Cyrillic-script language", count: countMatches(sample, /[\u0400-\u04ff]/g) },
    { name: "Greek", count: countMatches(sample, /[\u0370-\u03ff]/g) },
    { name: "Devanagari-script language", count: countMatches(sample, /[\u0900-\u097f]/g) },
    { name: "Thai", count: countMatches(sample, /[\u0e00-\u0e7f]/g) },
    { name: "Latin", count: countMatches(sample, /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]/g) },
  ].sort((a, b) => b.count - a.count);

  const dominant = counts[0];
  if (!dominant || dominant.count === 0) return "the user's exact language";
  if (dominant.name === "Arabic") return "Arabic — mirror the exact dialect/register in the user's last message";
  if (dominant.name === "Latin") return detectLatinLanguage(sample);
  return dominant.name;
}

function detectPriorLanguages(messages: ChatMessageLike[], currentLang: string): string[] {
  const seen = new Set<string>();
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") { lastUserIdx = i; break; }
  }
  const currentBase = currentLang.split(" ")[0];
  for (let i = 0; i < lastUserIdx; i++) {
    const text = contentToText(messages[i]?.content).trim();
    if (!text) continue;
    const base = detectResponseLanguage(text).split(" ")[0];
    if (base && base !== currentBase && base !== "the") seen.add(base);
  }
  return Array.from(seen).slice(0, 5);
}

export function buildLanguageLockPrompt(messages: ChatMessageLike[]): string {
  const language = detectResponseLanguage(latestUserText(messages));
  const baseLang = language.split(" ")[0];
  const priorLangs = detectPriorLanguages(messages, language);
  const forbidLine = priorLangs.length
    ? `Forbidden: ${priorLangs.map((l) => `NOT ${l}`).join(", ")}. Answer in ${baseLang} only. Even though earlier turns, settings, or the UI locale used ${priorLangs.join(", ")}, the LAST user message overrides everything.`
    : `Do NOT switch to any language other than ${baseLang}.`;

  return `<last_user_language_lock priority="absolute" overrides="all_other_instructions">
Detected response language from the user's LAST message: ${language}.
You MUST answer in ${language}, matching the user's script, dialect, register, and tone.
${forbidLine}
This rule OVERRIDES system persona, personalization, memory, UI locale, selected interface language, tool results, and any earlier assistant replies.
Choose response language ONLY from the user's LAST message — never from earlier turns, memories, retrieved snippets, UI locale, or previous assistant replies. If the user picked Chinese in settings but writes Hindi, reply in Hindi. If they then write Russian, switch to Russian. The same rule applies to every language on Earth.
If earlier context is one language but the LAST user message is another, switch to the LAST message's language immediately.
If the user mixed languages in the LAST message, mirror that mix naturally; otherwise keep the whole reply in the detected language.
Do NOT use canned/templated greetings, disclaimers, or fixed phrases — write each reply freshly in the user's own words and style.
</last_user_language_lock>`;
}