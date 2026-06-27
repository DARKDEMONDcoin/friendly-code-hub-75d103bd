import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeModel } from "./model-router.ts";

Deno.test("routeModel avoids turbo when the user switches from Arabic to English", () => {
  const result = routeModel({
    messages: [
      { role: "user", content: "ازيك" },
      { role: "assistant", content: "تمام" },
      { role: "user", content: "hi" },
    ],
    userPickedExplicit: false,
    resolvedModel: "qwen-plus-latest",
    hasIntegrations: false,
  });

  assertEquals(result.model, "qwen-plus-latest");
  assertEquals(result.reason, "language_switch");
});