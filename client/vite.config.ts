import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = `http://127.0.0.1:${process.env.API_PORT || "3001"}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": apiTarget } },
  preview: { proxy: { "/api": apiTarget } },
});
