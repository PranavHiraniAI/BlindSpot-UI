import { config } from "dotenv";
import { resolve } from "node:path";
import { MAX_IMAGE_BYTES } from "../../shared/audit.js";

config({ path: [resolve("server/.env"), resolve(".env")], quiet: true });

export function getConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || "",
    model: process.env.GEMMA_MODEL?.trim() || "gemma-4-26b-a4b-it",
    port: Number(process.env.PORT || 3001),
    maxImageBytes:
      process.env.VERCEL === "1" ? 4 * 1024 * 1024 : MAX_IMAGE_BYTES,
  };
}
