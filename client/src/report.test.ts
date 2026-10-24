import { expect, it } from "vitest";
import { reportMarkdown } from "./report";

it("exports the whole report and escapes model-provided Markdown and HTML", () => {
  const markdown = reportMarkdown({
    summary: "<script>bad</script> & **bold**",
    findings: [
      {
        title: "[click](https://bad.example)",
        category: "forms",
        severity: "low",
        confidence: 0.7,
        evidence: "Visible placeholder",
        impact: "Possible ambiguity",
        recommendation: "Add a label",
        region: { x: 10, y: 10, width: 20, height: 30 },
      },
    ],
  });
  expect(markdown).toContain("&lt;script\\>");
  expect(markdown).not.toContain("<script>");
  expect(markdown).toContain("\\[click\\]\\(https://bad\\.example\\)");
  expect(markdown).toContain("Confidence (model estimate): 70%");
  expect(markdown).toContain("Approximate region (%)");
});
