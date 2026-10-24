import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const severities = ["high", "medium", "low"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const percent = z.number().min(0).max(100);
export const regionSchema = z
  .object({
    x: percent,
    y: percent,
    width: percent.positive(),
    height: percent.positive(),
  })
  .refine(
    (region) =>
      region.x + region.width <= 100 && region.y + region.height <= 100,
  );

export const findingSchema = z.object({
  title: text(180),
  category: z.enum([
    "readability",
    "contrast",
    "hierarchy",
    "interaction",
    "forms",
    "layout",
    "other",
  ]),
  severity: z.enum(severities),
  evidence: text(1600),
  impact: text(1200),
  recommendation: text(1600),
  confidence: z.number().min(0).max(1),
  region: z.preprocess((value) => {
    const parsed = regionSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }, regionSchema.optional()),
});

export const auditSchema = z.object({
  summary: text(2000),
  findings: z.array(findingSchema).max(8),
});

export type AuditReport = z.infer<typeof auditSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Severity = Finding["severity"];

export function prioritize(report: AuditReport): AuditReport {
  return {
    ...report,
    findings: [...report.findings].sort(
      (first, second) =>
        severities.indexOf(first.severity) -
        severities.indexOf(second.severity),
    ),
  };
}
