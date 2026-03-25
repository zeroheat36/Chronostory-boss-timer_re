import type { TargetModel } from "./types";

const DEFAULT_ANALYSIS_MODEL_IDS = [
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-3.7-sonnet"
];

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? "10");
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? "45000");

export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const TARGET_MODEL_OPTIONS: Array<{ value: TargetModel; label: string }> = [
  { value: "midjourney", label: "Midjourney" },
  { value: "sdxl", label: "Stable Diffusion / SDXL" },
  { value: "flux", label: "Flux" }
];

function humanizeModelId(modelId: string) {
  return modelId
    .split("/")
    .map((part) => part.replace(/[-_]/g, " "))
    .map((part) => part.replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" / ");
}

function parseModelOptionIds(rawValue: string | undefined) {
  const values = (rawValue ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : DEFAULT_ANALYSIS_MODEL_IDS;
}

export const ANALYSIS_MODEL_OPTIONS = parseModelOptionIds(
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL_OPTIONS
).map((value) => ({
  value,
  label: humanizeModelId(value)
}));

export const ALLOWED_ANALYSIS_MODELS = new Set(
  parseModelOptionIds(process.env.OPENROUTER_MODEL_OPTIONS ?? process.env.NEXT_PUBLIC_OPENROUTER_MODEL_OPTIONS)
);