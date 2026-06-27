import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildLanguageLockPrompt, detectResponseLanguage } from "./language.ts";

Deno.test("detectResponseLanguage detects English instead of defaulting to Arabic", () => {
  assertEquals(detectResponseLanguage("Please explain the pricing in detail"), "English");
});

Deno.test("detectResponseLanguage keeps Arabic dialect lock for Arabic input", () => {
  assert(detectResponseLanguage("صلح المشكلة دي فورًا").startsWith("Arabic"));
});

Deno.test("buildLanguageLockPrompt explicitly blocks Arabic after an English last message", () => {
  const prompt = buildLanguageLockPrompt([
    { role: "user", content: "اتكلم عربي" },
    { role: "assistant", content: "تمام" },
    { role: "user", content: "Now answer in English please" },
  ]);

  assert(prompt.includes("English"));
  assert(prompt.includes("NOT Arabic"));
  assert(prompt.includes("LAST message"));
});