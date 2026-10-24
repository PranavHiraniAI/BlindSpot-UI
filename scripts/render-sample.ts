import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 820 },
    deviceScaleFactor: 1,
  });
  await page.setContent(await readFile(resolve("scripts/sample.html"), "utf8"));
  const font = await readFile(
    resolve(
      "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
    ),
  );
  await page.addStyleTag({
    content: `@font-face { font-family: SampleUI; src: url(data:font/woff2;base64,${font.toString("base64")}); } body { font-family: SampleUI, sans-serif; }`,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve("client/public/sample-ui.png") });
  console.info(
    "Generated client/public/sample-ui.png (original fictional interface).",
  );
} finally {
  await browser.close();
}
