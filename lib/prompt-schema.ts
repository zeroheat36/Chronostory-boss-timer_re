import type { PromptResult, TargetModel } from "./types";

type RawPromptPayload = {
  mainPrompt?: unknown;
  negativePrompt?: unknown;
  styleKeywords?: unknown;
  compositionNotes?: unknown;
  lightingNotes?: unknown;
  colorNotes?: unknown;
  cameraNotes?: unknown;
  modelSpecificTips?: unknown;
};

function ensureString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function ensureStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

export function normalizePromptPayload(
  payload: RawPromptPayload,
  targetModel: TargetModel,
  analysisModel: string
): PromptResult {
  const fallbackMainPrompt =
    targetModel === "midjourney"
      ? "cinematic portrait with strong visual hierarchy, detailed environment, balanced color harmony, refined lighting, highly evocative atmosphere"
      : "cinematic detailed subject, coherent composition, refined lighting, layered textures, realistic depth, high quality";

  const fallbackNegativePrompt =
    targetModel === "midjourney"
      ? ""
      : "low quality, blurry, distorted anatomy, extra limbs, warped perspective, text, watermark, overexposed highlights";

  return {
    targetModel,
    analysisModel,
    promptSet: {
      mainPrompt: ensureString(payload.mainPrompt, fallbackMainPrompt),
      negativePrompt: ensureString(payload.negativePrompt, fallbackNegativePrompt),
      styleKeywords: ensureStringArray(payload.styleKeywords, [
        "cinematic",
        "detailed lighting",
        "layered composition"
      ])
    },
    analysis: {
      composition: ensureString(payload.compositionNotes, "Balanced focal point with readable subject separation."),
      lighting: ensureString(payload.lightingNotes, "Directional light with controlled highlight contrast."),
      color: ensureString(payload.colorNotes, "Curated palette with clear warm and cool balance."),
      camera: ensureString(payload.cameraNotes, "Natural depth perspective with editorial framing.")
    },
    tips: ensureStringArray(payload.modelSpecificTips, [
      targetModel === "midjourney"
        ? "Add aspect-ratio and stylize parameters separately when you paste the prompt."
        : "Adjust CFG, steps, and sampler after testing the base prompt on your workflow.",
      "Use the uploaded image as a style reference, not as a guarantee of exact replication."
    ])
  };
}