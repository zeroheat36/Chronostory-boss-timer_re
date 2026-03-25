import { NextResponse } from "next/server";
import {
  ALLOWED_ANALYSIS_MODELS,
  MAX_UPLOAD_BYTES,
  REQUEST_TIMEOUT_MS,
  SUPPORTED_IMAGE_TYPES,
  TARGET_MODEL_OPTIONS
} from "@/lib/config";
import { generatePromptSet } from "@/lib/openrouter";
import { isTargetModel, type PromptResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const targetModel = formData.get("targetModel");
    const analysisModel = formData.get("analysisModel");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
    }

    if (typeof targetModel !== "string" || !isTargetModel(targetModel)) {
      return NextResponse.json(
        {
          error: `targetModel은 ${TARGET_MODEL_OPTIONS.map((option) => option.value).join(", ")} 중 하나여야 합니다.`
        },
        { status: 400 }
      );
    }

    if (typeof analysisModel !== "string" || !ALLOWED_ANALYSIS_MODELS.has(analysisModel)) {
      return NextResponse.json({ error: "허용되지 않은 분석 AI 모델입니다." }, { status: 400 });
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(image.type)) {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다. PNG, JPG, JPEG, WEBP만 허용됩니다." },
        { status: 400 }
      );
    }

    if (image.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `파일 크기는 최대 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB까지 허용됩니다.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await image.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

    let result: PromptResult;
    try {
      result = await generatePromptSet({
        base64Image,
        mimeType: image.type,
        targetModel,
        analysisModel,
        signal: timeoutController.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "프롬프트 생성 중 알 수 없는 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}