import { ALLOWED_ANALYSIS_MODELS } from "./config";
import { normalizePromptPayload } from "./prompt-schema";
import type { PromptResult, TargetModel } from "./types";

type GeneratePromptSetParams = {
  base64Image: string;
  mimeType: string;
  targetModel: TargetModel;
  analysisModel: string;
  signal: AbortSignal;
};

type OpenRouterResponse = {
  error?: {
    message?: string;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function generatePromptSet({
  base64Image,
  mimeType,
  targetModel,
  analysisModel,
  signal
}: GeneratePromptSetParams): Promise<PromptResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY가 설정되어 있지 않습니다.");
  }

  if (!ALLOWED_ANALYSIS_MODELS.has(analysisModel)) {
    throw new Error("허용되지 않은 분석 AI 모델입니다.");
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Image Clone Prompt Generator"
    },
    signal,
    body: JSON.stringify({
      model: analysisModel,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(targetModel)
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPrompt(targetModel)
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    })
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenRouter API 호출에 실패했습니다.");
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI가 비어 있는 응답을 반환했습니다. 다시 시도해 주세요.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");
  }

  return normalizePromptPayload(parsed as Record<string, unknown>, targetModel, analysisModel);
}

function buildSystemPrompt(targetModel: TargetModel) {
  const modelStyleInstructions =
    targetModel === "midjourney"
      ? "Return a richly descriptive natural-language main prompt optimized for Midjourney. Negative prompt may be blank if not useful."
      : "Return a production-ready main prompt and a useful negative prompt optimized for diffusion workflows like SDXL or Flux.";

  return [
    "You are an expert prompt engineer for image generation systems.",
    "Infer visual intent from the reference image without claiming exact duplication.",
    "Respond in English only.",
    modelStyleInstructions,
    "Focus on subject, environment, color palette, lighting direction, camera perspective, lens feel, texture, mood, and composition.",
    "Return valid JSON only.",
    "Use this exact schema: {\"mainPrompt\": string, \"negativePrompt\": string, \"styleKeywords\": string[], \"compositionNotes\": string, \"lightingNotes\": string, \"colorNotes\": string, \"cameraNotes\": string, \"modelSpecificTips\": string[]}."
  ].join(" ");
}

function buildUserPrompt(targetModel: TargetModel) {
  return [
    `Analyze this reference image and generate a reusable English prompt set for ${targetModel}.`,
    "The goal is to help the user recreate a similar style, mood, composition, and lighting.",
    "Do not mention the JSON schema or explain your reasoning outside the fields."
  ].join(" ");
}