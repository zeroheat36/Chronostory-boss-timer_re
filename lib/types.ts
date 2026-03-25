export type TargetModel = "midjourney" | "sdxl" | "flux";

export type PromptResult = {
  targetModel: TargetModel;
  analysisModel: string;
  promptSet: {
    mainPrompt: string;
    negativePrompt: string;
    styleKeywords: string[];
  };
  analysis: {
    composition: string;
    lighting: string;
    color: string;
    camera: string;
  };
  tips: string[];
};

export function isTargetModel(value: string): value is TargetModel {
  return value === "midjourney" || value === "sdxl" || value === "flux";
}