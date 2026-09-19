import type { GapAnalysisResult } from "./resume-schemas.js";

const TRIAGE_LABELS: Record<string, string> = {
  quick_win: "Quick Win",
  short_term: "Short-Term (days-weeks)",
  medium_term: "Medium-Term (weeks-months)",
  long_term: "Long-Term (significant investment)",
};

const TRIAGE_ORDER = ["quick_win", "short_term", "medium_term", "long_term"];

export function generateGapReport(
  analysis: GapAnalysisResult,
  generatedAt: string,
): string {
  const lines: string[] = [];

  lines.push("# Resume Gap Analysis");
  lines.push("");
  lines.push(
    `Generated ${new Date(generatedAt).toLocaleDateString("en-CA")}, based on the market analysis from Phase 1.`,
  );
  lines.push("");

  lines.push("## Strengths");
  lines.push("");
  lines.push(
    "Skills your resume already has that are commonly requested in the market:",
  );
  lines.push("");
  lines.push("| Skill | Market Demand | Where It Shows on Your Resume |");
  lines.push("| :--- | :--- | :--- |");
  for (const s of analysis.strengths) {
    lines.push(`| ${s.skill} | ${s.market_demand} | ${s.resume_evidence} |`);
  }
  lines.push("");

  lines.push("## Gaps (Triaged)");
  lines.push("");
  for (const level of TRIAGE_ORDER) {
    const gapsAtLevel = analysis.gaps.filter((g) => g.triage_level === level);
    if (gapsAtLevel.length === 0) continue;
    lines.push(`### ${TRIAGE_LABELS[level]}`);
    lines.push("");
    for (const g of gapsAtLevel) {
      lines.push(`**${g.skill}** (${g.market_demand})`);
      lines.push("");
      lines.push(g.recommendation);
      lines.push("");
    }
  }

  lines.push("## Unique Value");
  lines.push("");
  lines.push(
    "Things on your resume that aren't commonly requested but could set you apart:",
  );
  lines.push("");
  for (const u of analysis.unique_value) {
    lines.push(`- ${u}`);
  }
  lines.push("");

  return lines.join("\n");
}
