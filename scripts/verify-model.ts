import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { analyzeImage, providerError } from "../server/src/audit.js";
import { getConfig } from "../server/src/config.js";

const { apiKey, model } = getConfig();
if (!apiKey) {
  console.error(
    "BLOCKED: Set GEMINI_API_KEY privately in server/.env. No live model call was made; no fallback exists.",
  );
  process.exitCode = 2;
} else {
  try {
    try {
      await new GoogleGenAI({ apiKey }).models.get({
        model,
        config: { httpOptions: { timeout: 15_000 } },
      });
      console.info(`Model metadata available: ${model}`);
    } catch {
      console.info(
        "Model metadata unavailable. Checking actual image generation next.",
      );
    }
    const report = await analyzeImage(
      await readFile("client/public/sample-ui.png"),
      "image/png",
    );
    console.info(
      `LIVE VERIFIED: ${model} returned a Zod-validated report with ${report.findings.length} findings from the sample screenshot.`,
    );
  } catch (cause) {
    const error = providerError(cause);
    console.error(`LIVE NOT VERIFIED: ${error.code}: ${error.message}`);
    process.exitCode = 1;
  }
}
