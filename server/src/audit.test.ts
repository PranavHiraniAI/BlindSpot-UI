import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { auditSchema, MAX_IMAGE_BYTES } from "../../shared/audit.js";
import {
  analyzeImage,
  AuditError,
  parseAudit,
  providerError,
} from "./audit.js";
import { createApp } from "./app.js";

const finding = {
  title: "Potentially faint secondary text",
  category: "contrast",
  severity: "medium",
  evidence: "The helper text appears faint against the light background.",
  impact: "Some readers may have difficulty reading it.",
  recommendation: "Use a darker text color and measure contrast in the source.",
  confidence: 0.78,
};
const report = {
  summary: "One potential issue merits a closer look.",
  findings: [finding],
};
const png = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: "#fff" } })
    .png()
    .toBuffer();
afterEach(() => vi.unstubAllEnvs());

describe("model output boundary", () => {
  it("validates, trims, strips unknown keys and prioritizes findings", () => {
    const parsed = parseAudit(
      JSON.stringify({
        ...report,
        extra: "ignored",
        findings: [
          finding,
          { ...finding, title: " High ", severity: "high", extra: true },
        ],
      }),
    );
    expect(parsed.findings[0].title).toBe("High");
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.findings[0]).not.toHaveProperty("extra");
  });
  it("accepts zero findings and a single complete JSON fence", () => {
    expect(
      parseAudit(
        '```json\n{"summary":"Nothing clearly visible.","findings":[]}\n```',
      ).findings,
    ).toEqual([]);
  });
  it.each([
    undefined,
    "",
    "not JSON",
    "{",
    'Before {"summary":"x","findings":[]} after',
  ])("rejects malformed output: %s", (text) => {
    expect(() => parseAudit(text)).toThrow(AuditError);
  });
  it.each([-0.1, 1.1, "0.8", Infinity])(
    "rejects invalid confidence %s",
    (confidence) => {
      expect(
        auditSchema.safeParse({
          ...report,
          findings: [{ ...finding, confidence }],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects nine findings and invalid enum values", () => {
    expect(
      auditSchema.safeParse({ ...report, findings: Array(9).fill(finding) })
        .success,
    ).toBe(false);
    expect(
      auditSchema.safeParse({
        ...report,
        findings: [{ ...finding, severity: "critical" }],
      }).success,
    ).toBe(false);
  });
  it.each([
    { x: 90, y: 10, width: 20, height: 10 },
    { x: -1, y: 0, width: 5, height: 5 },
    null,
  ])("omits unusable optional regions", (region) => {
    expect(
      auditSchema.parse({ ...report, findings: [{ ...finding, region }] })
        .findings[0].region,
    ).toBeUndefined();
  });
  it("preserves valid coarse regions", () => {
    const region = { x: 10, y: 20, width: 30, height: 15 };
    expect(
      auditSchema.parse({ ...report, findings: [{ ...finding, region }] })
        .findings[0].region,
    ).toEqual(region);
  });
  it.each([
    [404, 503],
    [401, 503],
    [429, 429],
    [500, 502],
    [504, 504],
  ])("sanitizes provider status %s", (status, expected) => {
    const error = providerError({
      status,
      message: "secret raw provider payload",
    });
    expect(error.status).toBe(expected);
    expect(error.message).not.toContain("secret raw");
  });
});

describe("POST /api/audit", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "accepts real %s bytes and passes them to the analysis boundary",
    async (format) => {
      const bytes = await sharp(await png())
        .toFormat(format)
        .toBuffer();
      const analyze = vi.fn().mockResolvedValue(report);
      const response = await request(createApp(analyze))
        .post("/api/audit")
        .attach("screenshot", bytes, {
          filename: `ui.${format}`,
          contentType: `image/${format}`,
        });
      expect(response.status).toBe(200);
      expect(response.body).toEqual(report);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(analyze).toHaveBeenCalledOnce();
      expect(analyze.mock.calls[0][0]).toEqual(bytes);
    },
  );
  it("rejects missing, unsupported, corrupt and MIME-mismatched files before analysis", async () => {
    const analyze = vi.fn();
    const app = createApp(analyze);
    expect((await request(app).post("/api/audit")).status).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/audit")
          .attach("screenshot", Buffer.from("<svg/>"), "ui.svg")
      ).status,
    ).toBe(415);
    expect(
      (
        await request(app)
          .post("/api/audit")
          .attach("screenshot", Buffer.from("broken"), "ui.png")
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/audit")
          .attach("screenshot", await png(), {
            filename: "ui.jpg",
            contentType: "image/jpeg",
          })
      ).status,
    ).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("rejects oversized images and extra files/fields before analysis", async () => {
    const analyze = vi.fn();
    const app = createApp(analyze);
    const oversized = await request(app)
      .post("/api/audit")
      .attach("screenshot", Buffer.alloc(MAX_IMAGE_BYTES + 1), "ui.png");
    expect(oversized.status).toBe(413);
    const multiple = await request(app)
      .post("/api/audit")
      .attach("screenshot", await png(), "a.png")
      .attach("screenshot", await png(), "b.png");
    expect(multiple.status).toBe(400);
    expect(
      (await request(app).post("/api/audit").field("extra", "x")).status,
    ).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("accepts the exact 5 MiB boundary without confusing it with oversized uploads", async () => {
    const bytes = await png();
    const exact = Buffer.concat([
      bytes,
      Buffer.alloc(MAX_IMAGE_BYTES - bytes.length),
    ]);
    const analyze = vi.fn().mockResolvedValue(report);
    const response = await request(createApp(analyze))
      .post("/api/audit")
      .attach("screenshot", exact, "boundary.png");
    expect(response.status).toBe(200);
    expect(analyze).toHaveBeenCalledOnce();
  });
  it("rejects excessive decoded dimensions and truncated image data", async () => {
    const analyze = vi.fn();
    const app = createApp(analyze);
    const huge = await sharp({
      create: { width: 5001, height: 5000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await request(app)
          .post("/api/audit")
          .attach("screenshot", huge, "large-dimensions.png")
      ).status,
    ).toBe(400);
    const bytes = await png();
    expect(
      (
        await request(app)
          .post("/api/audit")
          .attach(
            "screenshot",
            bytes.subarray(0, bytes.length - 15),
            "truncated.png",
          )
      ).status,
    ).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("returns an honest missing-key error, including for a sample image", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await request(createApp())
      .post("/api/audit")
      .attach("screenshot", await png(), "sample.png");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("MISSING_API_KEY");
    await expect(analyzeImage(await png(), "image/png")).rejects.toMatchObject({
      code: "MISSING_API_KEY",
    });
  });
  it("does not expose unexpected error details", async () => {
    const response = await request(
      createApp(vi.fn().mockRejectedValue(new Error("raw secret"))),
    )
      .post("/api/audit")
      .attach("screenshot", await png(), "ui.png");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("raw secret");
  });
});
