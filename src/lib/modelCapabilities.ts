// Per-model capability inference for the unified Studio composer.
// Audio attachment is data-driven via `supports_audio` on the DB row.
// Video-as-input is inferred from slug because the DB column doesn't
// exist yet; these slugs map to backend video-edit / VACE models that
// accept a `video_url` input.

import type { FalImageModel, FalVideoModel } from "@/hooks/useFalModels";

const VIDEO_INPUT_SLUGS = new Set<string>([
  // Frontend slugs that route to backend video-edit / VACE pipelines
  "runway-gen-4-5",
  "runway",
  "firefly-video",
  "firefly",
  "happyhorse-videoedit",
  "happyhorse-video-edit",
  "wan-2-7-videoedit",
  "wan-2-7-video-edit",
  "wan-2-1-vace-plus",
]);

export function modelSupportsAudioInput(
  model: FalImageModel | FalVideoModel | null | undefined,
): boolean {
  if (!model) return false;
  return !!(model as FalVideoModel).supports_audio;
}

export function modelSupportsVideoInput(
  model: FalImageModel | FalVideoModel | null | undefined,
): boolean {
  if (!model) return false;
  return VIDEO_INPUT_SLUGS.has(model.slug);
}

export function modelSupportsImageInput(
  model: FalImageModel | FalVideoModel | null | undefined,
): boolean {
  if (!model) return false;
  // Images are supported when the model declares any image input capacity
  // (multi-image, first-frame, or has a non-zero max_input_images budget).
  const m = model as any;
  if (m.supports_multi_image) return true;
  if (m.supports_first_frame || m.supports_last_frame || m.supports_start_end_frame) return true;
  if (typeof m.max_input_images === "number" && m.max_input_images > 0) return true;
  // Image models default to accepting an image as a reference/edit input
  // when they expose an image_to_image / multi_reference / edit endpoint.
  if (m.endpoint_image_to_image || m.endpoint_multi_reference) return true;
  if (m.supports_image_editing) return true;
  return false;
}

export function modelMaxImages(model: FalImageModel | FalVideoModel | null | undefined): number {
  if (!model) return 0;
  const m = model as any;
  if (typeof m.max_input_images === "number" && m.max_input_images > 0) return m.max_input_images;
  if (m.supports_multi_image) return 10;
  return modelSupportsImageInput(model) ? 1 : 0;
}
