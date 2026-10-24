import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const { port } = getConfig();
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const server = createApp().listen(port, "127.0.0.1", () => {
  console.info(`BlindSpot API listening at http://127.0.0.1:${port}`);
});
server.on("error", () => {
  console.error("Could not start the API. Check that PORT is available.");
  process.exitCode = 1;
});
