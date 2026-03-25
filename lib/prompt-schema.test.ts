import assert from "node:assert/strict";
import test from "node:test";
import { normalizePromptPayload } from "./prompt-schema";

test("fills missing diffusion fields with safe defaults", () => {
  const result = normalizePromptPayload({}, "flux", "openai/gpt-4.1-mini");

  assert.match(result.promptSet.mainPrompt, /cinematic/);
  assert.match(result.promptSet.negativePrompt, /low quality/);
  assert.ok(result.promptSet.styleKeywords.length > 0);
  assert.ok(result.tips.length > 0);
});

test("preserves provided strings and arrays", () => {
  const result = normalizePromptPayload(
    {
      mainPrompt: "editorial portrait, rim light, muted teal palette",
      negativePrompt: "blurry, low detail",
      styleKeywords: ["editorial", "teal", "rim light"],
      compositionNotes: "Centered portrait with breathing room.",
      lightingNotes: "Back rim light with soft frontal fill.",
      colorNotes: "Muted teal with warm skin contrast.",
      cameraNotes: "85mm portrait framing.",
      modelSpecificTips: ["Lower stylize if the result drifts too far."]
    },
    "midjourney",
    "google/gemini-2.5-flash"
  );

  assert.equal(result.promptSet.mainPrompt, "editorial portrait, rim light, muted teal palette");
  assert.equal(result.analysis.camera, "85mm portrait framing.");
  assert.deepEqual(result.tips, ["Lower stylize if the result drifts too far."]);
  assert.equal(result.analysisModel, "google/gemini-2.5-flash");
});