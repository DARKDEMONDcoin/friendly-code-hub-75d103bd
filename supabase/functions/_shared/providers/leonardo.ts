// Leonardo.ai unified provider — aggregator for image + video models.
// Routes through Leonardo's v1 (native modelId) and v2 (parameters wrapper) endpoints.
// Uses the shared DB-backed key rotator (service = 'leonardo').
import { withKeyRotation, pickKey, recordUsage } from "../key-pool.ts";
import { getLLM, ROUTER_MODELS } from "../llm-router.ts";

const BASE = "https://cloud.leonardo.ai/api/rest";

export class LeonardoError extends Error {
  status: number;
  constructor(msg: string, status = 500) {
    super(msg);
    this.status = status;
  }
}

export interface ModelSpec {
  api_version: "v1" | "v2" | "v1-i2v" | "v1-t2v";
  /** Leonardo model identifier — UUID for v1, slug for v2, or model enum for v1-i2v/v1-t2v */
  modelId: string;
}

export interface ImageGenInput {
  spec: ModelSpec;
  prompt: string;
  width?: number;
  height?: number;
  num_images?: number;
  seed?: number;
  negative_prompt?: string;
  /** Already-uploaded init/reference image IDs */
  referenceImageIds?: string[];
  /** Remote URLs that should be uploaded first then passed as references */
  referenceUrls?: string[];
}

export interface VideoGenInput {
  spec: ModelSpec;
  prompt: string;
  width?: number;
  height?: number;
  duration?: number;
  resolutionMode?: "RESOLUTION_480" | "RESOLUTION_720" | "RESOLUTION_1080";
  audio?: boolean;
  startFrameUrl?: string | null;
  endFrameUrl?: string | null;
  startFrameId?: string | null;
  endFrameId?: string | null;
}

export const LEONARDO_V2_PROMPT_MAX_LENGTH = 1500;

export function normalizeLeonardoPrompt(
  prompt: string,
  maxLength = LEONARDO_V2_PROMPT_MAX_LENGTH,
): string {
  return prompt.trim().slice(0, maxLength);
}

/**
 * Use Lovable AI Gateway (Gemini) to rewrite an overly long prompt into a
 * concise, high-quality image-generation prompt that fits within `maxLength`.
 * Falls back to a hard slice if the rewrite fails for any reason.
 */
export async function condenseLeonardoPrompt(
  prompt: string,
  maxLength = LEONARDO_V2_PROMPT_MAX_LENGTH,
): Promise<string> {
  const cleaned = prompt.trim();
  if (cleaned.length <= maxLength) return cleaned;

  const llm = await getLLM();
  if (!llm) {
    console.warn("condenseLeonardoPrompt: no LLM provider, falling back to slice");
    return cleaned.slice(0, maxLength);
  }

  const target = Math.max(400, maxLength - 100);
  const system =
    `You are a senior prompt engineer for text-to-image diffusion models. ` +
    `Rewrite the user's prompt into ONE dense English paragraph under ${target} characters. ` +
    `Preserve subject, style, composition, lighting, mood, camera and key descriptors. ` +
    `Drop redundancy and filler. Output ONLY the rewritten prompt, no preface, no quotes.`;

  try {
    const res = await fetch(llm.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.mapModel(ROUTER_MODELS.chat),
        messages: [
          { role: "system", content: system },
          { role: "user", content: cleaned },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      console.error("condenseLeonardoPrompt non-ok", res.status, await res.text().catch(() => ""));
      return cleaned.slice(0, maxLength);
    }
    const j = await res.json();
    const out = (j?.choices?.[0]?.message?.content || "").toString().trim();
    if (!out) return cleaned.slice(0, maxLength);
    return out.length <= maxLength ? out : out.slice(0, maxLength);
  } catch (e) {
    console.error("condenseLeonardoPrompt error", e);
    return cleaned.slice(0, maxLength);
  }
}

function lFetch(path: string, init: RequestInit, apiKey: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

/** Upload a remote image into Leonardo's init-image store, return imageId. */
async function uploadInitImageFromUrl(remoteUrl: string, apiKey: string): Promise<string> {
  const ext = (remoteUrl.split("?")[0].split(".").pop() || "png").toLowerCase();
  const extension = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "png";
  const presign = await lFetch(
    "/v1/init-image",
    {
      method: "POST",
      body: JSON.stringify({ extension }),
    },
    apiKey,
  );
  if (!presign.ok) throw new LeonardoError(`init_image_presign:${presign.status}`, presign.status);
  const j = await presign.json();
  const up = j?.uploadInitImage;
  if (!up?.url || !up?.fields || !up?.id) throw new LeonardoError("init_image_invalid", 502);
  const fields = typeof up.fields === "string" ? JSON.parse(up.fields) : up.fields;
  const src = await fetch(remoteUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MegsyAI/1.0; +https://megsyai.com)",
      Accept: "image/*,*/*;q=0.8",
    },
  });
  if (!src.ok) throw new LeonardoError(`source_image_unreachable:${src.status}`, 400);
  const blob = await src.blob();
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append("file", blob);
  const s3 = await fetch(up.url, { method: "POST", body: fd });
  if (!s3.ok && s3.status !== 204) throw new LeonardoError(`s3_upload:${s3.status}`, 502);
  return up.id as string;
}

async function pollGeneration(
  generationId: string,
  apiKey: string,
  kind: "image" | "video",
  maxWaitMs: number,
): Promise<{ urls: string[]; raw: unknown }> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await lFetch(`/v1/generations/${generationId}`, { method: "GET" }, apiKey);
    if (!res.ok) {
      const t = await res.text();
      throw new LeonardoError(`poll_failed: ${res.status} ${t}`, res.status);
    }
    const json = await res.json();
    const gen = json?.generations_by_pk;
    const status = gen?.status;
    if (status === "COMPLETE") {
      const imgs = (gen?.generated_images || []) as Array<Record<string, unknown>>;
      const urls = imgs
        .map((i) =>
          kind === "video" ? (i?.motionMP4URL as string) || (i?.url as string) : (i?.url as string),
        )
        .filter(Boolean) as string[];
      // Some video responses put the video URL directly on the generation
      if (kind === "video" && !urls.length) {
        const direct = (gen?.video_url as string) || (gen?.videoUrl as string);
        if (direct) urls.push(direct);
      }
      return { urls, raw: gen };
    }
    if (status === "FAILED") throw new LeonardoError("generation_failed", 502);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new LeonardoError("generation_timeout", 504);
}

/** Map a width/height pair to a Leonardo aspect_ratio enum supported by nano-banana. */
function toAspectRatio(w: number, h: number): string {
  const r = w / h;
  const ratios: Array<[string, number]> = [
    ["1:1", 1],
    ["3:4", 0.75],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["2:3", 2 / 3],
    ["3:2", 1.5],
  ];
  let best = ratios[0];
  let bestDiff = Math.abs(r - best[1]);
  for (const x of ratios) {
    const d = Math.abs(r - x[1]);
    if (d < bestDiff) {
      best = x;
      bestDiff = d;
    }
  }
  return best[0];
}

function v2ImageBody(p: ImageGenInput, refIds: string[]): Record<string, unknown> {
  const w = p.width ?? 1024;
  const h = p.height ?? 1024;
  const isNanoBanana = p.spec.modelId === "gemini-2.5-flash-image";
  const params: Record<string, unknown> = {
    prompt: normalizeLeonardoPrompt(p.prompt),
    quantity: Math.min(4, Math.max(1, p.num_images ?? 1)),
    prompt_enhance: "OFF",
  };
  // nano-banana (Gemini 2.5 Flash Image) on Leonardo v2 rejects width/height
  // and expects an `aspect_ratio` enum instead.
  if (isNanoBanana) {
    params.aspect_ratio = toAspectRatio(w, h);
  } else {
    params.width = w;
    params.height = h;
  }
  if (p.seed !== undefined) params.seed = p.seed;
  if (refIds.length) {
    params.guidances = {
      image_reference: refIds.map((id) => ({
        image: { id, type: "UPLOADED" },
        strength: "MID",
      })),
    };
  }
  return { model: p.spec.modelId, public: false, parameters: params };
}

function v1ImageBody(p: ImageGenInput, refIds: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: p.prompt,
    modelId: p.spec.modelId,
    width: p.width ?? 1024,
    height: p.height ?? 1024,
    num_images: Math.min(4, Math.max(1, p.num_images ?? 1)),
  };
  if (p.seed !== undefined) body.seed = p.seed;
  if (p.negative_prompt) body.negative_prompt = p.negative_prompt;
  if (refIds.length) {
    // FLUX.1 Kontext uses contextImages; legacy native models use init_image_id.
    if (p.spec.modelId === "28aeddf8-bd19-4803-80fc-79602d1a9989") {
      body.contextImages = refIds.map((id) => ({ type: "UPLOADED", id }));
    } else {
      body.init_image_id = refIds[0];
      body.init_strength = 0.5;
    }
  }
  return body;
}

export function extractLeonardoGenerationId(payload: unknown): string | null {
  const j = payload as Record<string, any> | null | undefined;
  return (
    j?.generate?.generationId ||
    j?.motionVideoGenerationJob?.generationId ||
    j?.sdGenerationJob?.generationId ||
    j?.generationJob?.generationId ||
    j?.generations_by_pk?.id ||
    j?.generation?.id ||
    j?.id ||
    null
  );
}

export async function leonardoGenerateImage(
  p: ImageGenInput,
): Promise<{ urls: string[]; generationId: string }> {
  // Leonardo v2 rejects prompts longer than ~1500 chars. Use AI to rewrite
  // long prompts into a dense, high-quality version that stays within the limit,
  // instead of hard-truncating mid-sentence.
  if (p.spec.api_version === "v2" && (p.prompt?.length ?? 0) > LEONARDO_V2_PROMPT_MAX_LENGTH) {
    const condensed = await condenseLeonardoPrompt(p.prompt);
    console.log("leonardo prompt condensed", { from: p.prompt.length, to: condensed.length });
    p = { ...p, prompt: condensed };
  }
  const r = await withKeyRotation<{ urls: string[]; generationId: string }>(
    "leonardo",
    async (key) => {
      // Upload reference URLs (if any) on this key so the IDs are valid for the same account.
      const refIds: string[] = [...(p.referenceImageIds || [])];
      for (const url of p.referenceUrls || []) {
        try {
          refIds.push(await uploadInitImageFromUrl(url, key));
        } catch (e) {
          const err = e as LeonardoError;
          return { ok: false, status: err.status ?? 500, errorText: err.message };
        }
      }
      const isV2 = p.spec.api_version === "v2";
      const path = isV2 ? "/v2/generations" : "/v1/generations";
      const body = isV2 ? v2ImageBody(p, refIds) : v1ImageBody(p, refIds);
      const submit = await lFetch(path, { method: "POST", body: JSON.stringify(body) }, key);
      if (!submit.ok) {
        const t = await submit.text();
        console.error(
          "leonardo image submit non-ok",
          submit.status,
          "body sent:",
          JSON.stringify(body),
          "resp:",
          t,
        );
        return { ok: false, status: submit.status, errorText: t };
      }
      const j = await submit.json();
      const id = extractLeonardoGenerationId(j);
      if (!id) {
        console.error(
          "leonardo image submit returned no id. req body:",
          JSON.stringify(body),
          "resp:",
          JSON.stringify(j),
        );
        return {
          ok: false,
          status: 502,
          errorText: `no_generation_id:${JSON.stringify(j).slice(0, 300)}`,
        };
      }
      try {
        const { urls } = await pollGeneration(id, key, "image", 5 * 60 * 1000);
        return { ok: true, status: 200, data: { urls, generationId: id }, costUsd: 0.01 };
      } catch (e) {
        const err = e as LeonardoError;
        return { ok: false, status: err.status ?? 500, errorText: err.message };
      }
    },
    5,
  );
  if (!r.ok || !r.data) throw new LeonardoError(r.errorText || "leonardo_failed", r.status);
  return r.data;
}

export async function leonardoGenerateVideo(
  p: VideoGenInput,
): Promise<{ url: string | null; generationId: string }> {
  if (p.spec.api_version === "v2" && (p.prompt?.length ?? 0) > LEONARDO_V2_PROMPT_MAX_LENGTH) {
    const condensed = await condenseLeonardoPrompt(p.prompt);
    console.log("leonardo video prompt condensed", { from: p.prompt.length, to: condensed.length });
    p = { ...p, prompt: condensed };
  }
  const r = await withKeyRotation<{ url: string | null; generationId: string }>(
    "leonardo",
    async (key) => {
      // Resolve frame URLs to IDs if needed
      let startId = p.startFrameId ?? null;
      let endId = p.endFrameId ?? null;
      try {
        if (!startId && p.startFrameUrl)
          startId = await uploadInitImageFromUrl(p.startFrameUrl, key);
        if (!endId && p.endFrameUrl) endId = await uploadInitImageFromUrl(p.endFrameUrl, key);
      } catch (e) {
        const err = e as LeonardoError;
        return { ok: false, status: err.status ?? 500, errorText: err.message };
      }

      let path = "";
      let body: Record<string, unknown> = {};
      const width = p.width ?? 1920;
      const height = p.height ?? 1080;
      const duration = p.duration ?? 5;
      const mode = p.resolutionMode || (height >= 1080 ? "RESOLUTION_1080" : "RESOLUTION_720");

      if (p.spec.api_version === "v2") {
        // Kling / Seedance / Hailuo / LTX
        path = "/v2/generations";
        const params: Record<string, unknown> = {
          prompt: p.prompt,
          width,
          height,
          duration,
          mode,
          prompt_enhance: "OFF",
        };
        // Audio routing per Leonardo docs:
        //  - LTX 2.0 (pro/fast): top-level `audio: true` in parameters
        //  - All other v2 models that support audio (Kling 3.0, Kling O3, Seedance 2.0, LTX 2.3): `motion_has_audio: true`
        const isLtx20 = ["ltxv-2.0-pro", "ltxv-2.0-fast"].includes(p.spec.modelId);
        if (p.audio) {
          if (isLtx20) params.audio = true;
          else params.motion_has_audio = true;
        }
        // LTX 2.0 expects start_frame as a plain object inside parameters (not nested under guidances).
        if (isLtx20) {
          if (startId) params.start_frame = { id: startId, type: "UPLOADED" };
        } else {
          const guidances: Record<string, unknown> = {};
          if (startId) guidances.start_frame = [{ image: { id: startId, type: "UPLOADED" } }];
          if (endId) guidances.end_frame = [{ image: { id: endId, type: "UPLOADED" } }];
          if (Object.keys(guidances).length) params.guidances = guidances;
        }
        body = { model: p.spec.modelId, public: false, parameters: params };
      } else if (p.spec.api_version === "v1-i2v" || p.spec.api_version === "v1-t2v") {
        // Veo 3.x and Kling 2.5 Turbo use /v1/generations-image-to-video for both T2V and I2V.
        // For T2V, simply omit imageId. Only Veo models support image-less generation.
        const isVeo = String(p.spec.modelId || "")
          .toUpperCase()
          .startsWith("VEO");
        if (!startId && !isVeo) {
          return { ok: false, status: 400, errorText: "image_required_for_i2v" };
        }
        path = "/v1/generations-image-to-video";
        body = {
          prompt: p.prompt,
          resolution: mode,
          duration,
          width,
          height,
          model: p.spec.modelId,
          isPublic: false,
        };
        if (startId) {
          body.imageId = startId;
          body.imageType = "UPLOADED";
        }
        if (endId) body.endFrameImage = { id: endId, type: "UPLOADED" };
      } else {
        return {
          ok: false,
          status: 400,
          errorText: `unsupported_api_version:${p.spec.api_version}`,
        };
      }

      const submit = await lFetch(path, { method: "POST", body: JSON.stringify(body) }, key);
      if (!submit.ok) {
        const t = await submit.text();
        return { ok: false, status: submit.status, errorText: t };
      }
      const j = await submit.json();
      const id = extractLeonardoGenerationId(j);
      if (!id) {
        console.error("leonardo video submit returned no id, body:", JSON.stringify(j));
        return {
          ok: false,
          status: 502,
          errorText: `no_generation_id:${JSON.stringify(j).slice(0, 300)}`,
        };
      }
      try {
        const { urls } = await pollGeneration(id, key, "video", 10 * 60 * 1000);
        return {
          ok: true,
          status: 200,
          data: { url: urls[0] ?? null, generationId: id },
          costUsd: 0.25,
        };
      } catch (e) {
        const err = e as LeonardoError;
        return { ok: false, status: err.status ?? 500, errorText: err.message };
      }
    },
    5,
  );
  if (!r.ok || !r.data) throw new LeonardoError(r.errorText || "leonardo_video_failed", r.status);
  return r.data;
}

/**
 * Submit a video generation to Leonardo WITHOUT polling. Returns the generation id
 * and the api_key_id that was used, so a separate poll endpoint can fetch status
 * using the same key (different keys = different Leonardo accounts).
 */
export async function leonardoSubmitVideo(
  p: VideoGenInput,
): Promise<{ generationId: string; apiKeyId: string }> {
  if (p.spec.api_version === "v2" && (p.prompt?.length ?? 0) > LEONARDO_V2_PROMPT_MAX_LENGTH) {
    const condensed = await condenseLeonardoPrompt(p.prompt);
    p = { ...p, prompt: condensed };
  }

  // Use key rotation but DO NOT poll inside the closure.
  // (pickKey/recordUsage imported at top)
  const triedIds = new Set<string>();
  let lastStatus = 503;
  let lastErr = "no_active_key";

  for (let attempt = 0; attempt < 5; attempt++) {
    const pick = await pickKey("leonardo");
    if (!pick || triedIds.has(pick.id)) break;
    triedIds.add(pick.id);
    const key = pick.api_key;

    try {
      let startId = p.startFrameId ?? null;
      let endId = p.endFrameId ?? null;
      if (!startId && p.startFrameUrl) startId = await uploadInitImageFromUrl(p.startFrameUrl, key);
      if (!endId && p.endFrameUrl) endId = await uploadInitImageFromUrl(p.endFrameUrl, key);

      let path = "";
      let body: Record<string, unknown> = {};
      const width = p.width ?? 1920;
      const height = p.height ?? 1080;
      const duration = p.duration ?? 5;
      const mode = p.resolutionMode || (height >= 1080 ? "RESOLUTION_1080" : "RESOLUTION_720");

      if (p.spec.api_version === "v2") {
        path = "/v2/generations";
        const params: Record<string, unknown> = {
          prompt: p.prompt,
          width,
          height,
          duration,
          mode,
          prompt_enhance: "OFF",
        };
        const isLtx20 = ["ltxv-2.0-pro", "ltxv-2.0-fast"].includes(p.spec.modelId);
        if (p.audio) {
          if (isLtx20) params.audio = true;
          else params.motion_has_audio = true;
        }
        if (isLtx20) {
          if (startId) params.start_frame = { id: startId, type: "UPLOADED" };
        } else {
          const guidances: Record<string, unknown> = {};
          if (startId) guidances.start_frame = [{ image: { id: startId, type: "UPLOADED" } }];
          if (endId) guidances.end_frame = [{ image: { id: endId, type: "UPLOADED" } }];
          if (Object.keys(guidances).length) params.guidances = guidances;
        }
        body = { model: p.spec.modelId, public: false, parameters: params };
      } else if (p.spec.api_version === "v1-i2v" || p.spec.api_version === "v1-t2v") {
        const isVeo = String(p.spec.modelId || "")
          .toUpperCase()
          .startsWith("VEO");
        if (!startId && !isVeo) throw new LeonardoError("image_required_for_i2v", 400);
        path = "/v1/generations-image-to-video";
        body = {
          prompt: p.prompt,
          resolution: mode,
          duration,
          width,
          height,
          model: p.spec.modelId,
          isPublic: false,
        };
        if (startId) {
          body.imageId = startId;
          body.imageType = "UPLOADED";
        }
        if (endId) body.endFrameImage = { id: endId, type: "UPLOADED" };
      } else {
        throw new LeonardoError(`unsupported_api_version:${p.spec.api_version}`, 400);
      }

      const submit = await lFetch(path, { method: "POST", body: JSON.stringify(body) }, key);
      if (!submit.ok) {
        const t = await submit.text();
        await recordUsage(pick.id, 0, false, submit.status, t);
        lastStatus = submit.status;
        lastErr = t;
        if (![401, 402, 403, 429].includes(submit.status)) {
          throw new LeonardoError(t || "submit_failed", submit.status);
        }
        continue;
      }
      const j = await submit.json();
      const id = extractLeonardoGenerationId(j);
      if (!id) {
        await recordUsage(pick.id, 0, false, 502, "no_generation_id");
        throw new LeonardoError(`no_generation_id:${JSON.stringify(j).slice(0, 300)}`, 502);
      }
      await recordUsage(pick.id, 0.25, true, 200);
      return { generationId: id, apiKeyId: pick.id };
    } catch (e) {
      if (e instanceof LeonardoError && ![401, 402, 403, 429].includes(e.status)) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      lastStatus = e instanceof LeonardoError ? e.status : 500;
    }
  }
  throw new LeonardoError(lastErr, lastStatus);
}

/**
 * Poll Leonardo once for a generation. Returns status: pending | complete | failed
 * and the video URL when complete. Caller must pass the same api_key_id used to submit.
 */
export async function leonardoPollVideoOnce(
  generationId: string,
  apiKey: string,
): Promise<{ status: "pending" | "complete" | "failed"; videoUrl: string | null; error?: string }> {
  const res = await lFetch(`/v1/generations/${generationId}`, { method: "GET" }, apiKey);
  if (!res.ok) {
    const t = await res.text();
    return { status: "failed", videoUrl: null, error: `poll_${res.status}: ${t.slice(0, 200)}` };
  }
  const json = await res.json();
  const gen = json?.generations_by_pk;
  const status = gen?.status;
  if (status === "COMPLETE") {
    const imgs = (gen?.generated_images || []) as Array<Record<string, unknown>>;
    let url: string | null = null;
    for (const i of imgs) {
      const u = (i?.motionMP4URL as string) || (i?.url as string);
      if (u) {
        url = u;
        break;
      }
    }
    if (!url) {
      const direct = (gen?.video_url as string) || (gen?.videoUrl as string);
      if (direct) url = direct;
    }
    return { status: "complete", videoUrl: url };
  }
  if (status === "FAILED") return { status: "failed", videoUrl: null, error: "generation_failed" };
  return { status: "pending", videoUrl: null };
}
