import { expect, test, type Page } from "@playwright/test";

const fixture = {
  summary: "Three potential concerns are visible in the fictional interface.",
  findings: [
    {
      title: "Faint helper text",
      category: "contrast",
      severity: "high",
      evidence: "The helper text beneath the form appears faint.",
      impact: "It may be hard to read.",
      recommendation: "Darken the text and verify contrast in source.",
      confidence: 0.88,
      region: { x: 65, y: 50, width: 30, height: 15 },
    },
    {
      title: "Ambiguous form labels",
      category: "forms",
      severity: "medium",
      evidence: "The fields display placeholder-like labels.",
      impact: "Context may be unclear.",
      recommendation: "Provide persistent labels.",
      confidence: 0.76,
      region: { x: 65, y: 35, width: 30, height: 15 },
    },
    {
      title: "Small menu affordance",
      category: "interaction",
      severity: "low",
      evidence: "The row menu marks look small.",
      impact: "They may be difficult to target.",
      recommendation: "Increase the interactive hit area in source.",
      confidence: 0.61,
    },
  ],
};

async function selectSample(page: Page) {
  await page.getByRole("button", { name: /Use sample screenshot/ }).click();
  await expect(
    page.getByRole("img", {
      name: "Selected screenshot for visual audit",
      exact: true,
    }),
  ).toBeVisible();
}

test("hosted upload limits and plain-text platform errors are understandable", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        configured: false,
        model: "gemma-4-26b-a4b-it",
        maxImageBytes: 4 * 1024 * 1024,
      },
    }),
  );
  await page.route("**/api/audit", (route) => {
    requests++;
    return route.fulfill({
      status: 413,
      contentType: "text/plain",
      body: "FUNCTION_PAYLOAD_TOO_LARGE",
    });
  });
  await page.goto("/");
  await expect(page.getByText(/Up to 4 MB/)).toBeVisible();
  await page.getByLabel("Upload screenshot").setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("no larger than 4 MB");
  expect(requests).toBe(0);
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("server upload limit");
  expect(requests).toBe(1);
});

test("keyboard controls select a sample, open a modal and restore focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "BlindSpot UI home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Source on GitHub" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Choose screenshot" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /Use sample screenshot/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Expand screenshot" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand screenshot" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Expanded screenshot" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close preview" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Expanded screenshot" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expand screenshot" }),
  ).toBeFocused();
});

test("real sample upload reaches the backend and reports missing credentials honestly", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Analyze UI", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("workspace-idle.png"),
    fullPage: true,
  });
  await selectSample(page);
  await expect(
    page.getByText("No screenshot has been analyzed yet."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("GEMINI_API_KEY");
  await expect(
    page.getByRole("button", { name: "Analyze UI", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-setup-error.png"),
    fullPage: true,
  });
});

test("dashboard filters, approximate regions, full exports and replacement work", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/audit", (route) => route.fulfill({ json: fixture }));
  await page.goto("/");
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Faint helper text/ }),
  ).toBeVisible();
  await expect(page.locator(".finding")).toHaveCount(3);
  await expect(page.locator(".metric.total strong")).toHaveText("03");
  await expect(page.locator(".metric.high strong")).toHaveText("01");
  await expect(page.locator(".region")).toHaveCount(2);
  const image = await page.locator(".image-bounds > img").boundingBox();
  const region = await page.locator(".region.high").boundingBox();
  expect(image).not.toBeNull();
  expect(region).not.toBeNull();
  expect(Math.abs(region!.x - (image!.x + image!.width * 0.65))).toBeLessThan(
    2,
  );
  expect(Math.abs(region!.width - image!.width * 0.3)).toBeLessThan(2);
  await page.getByRole("button", { name: "medium", exact: true }).click();
  await expect(page.locator(".finding")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: /Ambiguous form labels/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "low", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).findings).toHaveLength(3);
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Markdown copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Faint helper text",
  );
  await page.getByRole("button", { name: "all", exact: true }).click();
  await page
    .getByRole("button", { name: "Finding 1: Faint helper text", exact: true })
    .click();
  await expect(page.locator("#finding-0")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-report.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Upload screenshot")
    .setInputFiles("client/public/sample-ui.png");
  await expect(page.locator(".finding")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export JSON", exact: true }),
  ).toBeDisabled();
});

test("loading prevents duplicate analysis and changing screenshots", async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/audit", async (route) => {
    await pending;
    await route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  try {
    await expect(
      page.getByRole("button", { name: /Analyzing UI/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Use sample screenshot/ }),
    ).toBeDisabled();
    await expect(page.getByLabel("Upload screenshot")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator(".finding")).toHaveCount(3);
});

test("malformed successful responses become errors, not invented findings", async ({
  page,
}) => {
  await page.route("**/api/audit", (route) =>
    route.fulfill({ json: { summary: "invalid" } }),
  );
  await page.goto("/");
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid report");
  await expect(page.locator(".finding")).toHaveCount(0);
});

test("zero findings and denied clipboard access have honest states", async ({
  page,
}) => {
  await page.route("**/api/audit", (route) =>
    route.fulfill({
      json: {
        summary: "No clear visible concern was identified.",
        findings: [],
      },
    }),
  );
  await page.goto("/");
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze UI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No clear issues identified" }),
  ).toBeVisible();
  await expect(
    page.getByText("This visual review is not a compliance assessment."),
  ).toBeVisible();
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Clipboard access was denied",
  );
});
