import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve("server/.env"), quiet: true });

export function getConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || "",
    model: process.env.GEMMA_MODEL?.trim() || "gemma-4-26b-a4b-it",
    port: Number(process.env.PORT || 3001),
  };
}
