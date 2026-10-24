import type { AuditReport } from "../../shared/audit";

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}[\]()#+.!|>~-])/g, "\\$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\r?\n/g, " ");
}

export function reportMarkdown(report: AuditReport): string {
  return [
    "# BlindSpot UI audit",
    "",
    escapeMarkdown(report.summary),
    "",
    "AI-assisted visual observations, not verified WCAG violations. Human review required.",
    "",
    ...report.findings.flatMap((finding, index) => [
      `## ${index + 1}. ${escapeMarkdown(finding.title)}`,
      "",
      `- Category: ${finding.category}`,
      `- Severity: ${finding.severity}`,
      `- Confidence (model estimate): ${Math.round(finding.confidence * 100)}%`,
      `- Evidence: ${escapeMarkdown(finding.evidence)}`,
      `- Impact: ${escapeMarkdown(finding.impact)}`,
      `- Recommendation: ${escapeMarkdown(finding.recommendation)}`,
      ...(finding.region ?
        [
          `- Approximate region (%): x=${finding.region.x}, y=${finding.region.y}, width=${finding.region.width}, height=${finding.region.height}`,
        ]
      : []),
      "",
    ]),
  ].join("\n");
}
