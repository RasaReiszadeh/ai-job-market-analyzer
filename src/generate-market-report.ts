import type { AggregateInsights, MarketStats } from "./schemas.js";

/**
 * Builds the human-readable market-analysis.md report by templating the
 * deterministically-computed stats together with the LLM's qualitative
 * insights. No LLM call happens here - this keeps every number in the
 * report guaranteed-correct (see market-stats.ts for why we don't trust an
 * LLM to state counts accurately in prose).
 */
export function generateMarketReport(
  stats: MarketStats,
  insights: AggregateInsights,
  generatedAt: string,
): string {
  const lines: string[] = [];

  lines.push("# Job Market Analysis");
  lines.push("");
  lines.push(
    `Analysis of **${stats.postings_analyzed} job postings** in the QA/Software Testing domain. Generated ${new Date(generatedAt).toLocaleDateString("en-CA")}.`,
  );
  lines.push("");

  lines.push("## Most Commonly Required Skills");
  lines.push("");
  lines.push("| Skill | Postings | Companies |");
  lines.push("| :--- | :--- | :--- |");
  for (const s of stats.top_required_skills) {
    lines.push(
      `| ${s.skill} | ${s.count}/${stats.postings_analyzed} | ${s.companies.join(", ")} |`,
    );
  }
  lines.push("");

  lines.push("## Most Commonly Preferred (Nice-to-Have) Skills");
  lines.push("");
  lines.push("| Skill | Postings | Companies |");
  lines.push("| :--- | :--- | :--- |");
  for (const s of stats.top_preferred_skills) {
    lines.push(
      `| ${s.skill} | ${s.count}/${stats.postings_analyzed} | ${s.companies.join(", ")} |`,
    );
  }
  lines.push("");

  lines.push("## Experience Levels Requested");
  lines.push("");
  lines.push("| Company | Role | Experience Level |");
  lines.push("| :--- | :--- | :--- |");
  for (const e of stats.experience_levels) {
    lines.push(`| ${e.company} | ${e.job_title} | ${e.level} |`);
  }
  lines.push("");

  lines.push("## Education Requirements");
  lines.push("");
  lines.push("| Company | Role | Requirement |");
  lines.push("| :--- | :--- | :--- |");
  for (const e of stats.education_requirements) {
    lines.push(`| ${e.company} | ${e.job_title} | ${e.requirement} |`);
  }
  lines.push("");

  lines.push("## Salary Ranges Observed");
  lines.push("");
  if (stats.salary_ranges_observed.length === 0) {
    lines.push(
      `_No salary information was listed in any of the ${stats.postings_analyzed} postings analyzed._`,
    );
  } else {
    lines.push("| Company | Role | Range |");
    lines.push("| :--- | :--- | :--- |");
    for (const s of stats.salary_ranges_observed) {
      lines.push(`| ${s.company} | ${s.job_title} | ${s.range} |`);
    }
    lines.push(
      `\n_${stats.salary_ranges_observed.length}/${stats.postings_analyzed} postings listed a salary range._`,
    );
  }
  lines.push("");

  lines.push("## Common Responsibilities");
  lines.push("");
  for (const r of insights.common_responsibilities) {
    lines.push(`- ${r}`);
  }
  lines.push("");

  lines.push("## Notable Trends");
  lines.push("");
  for (const t of insights.notable_trends) {
    lines.push(`- ${t}`);
  }
  lines.push("");

  lines.push("## Industry & Culture Expectations");
  lines.push("");
  lines.push(insights.industry_culture_expectations);
  lines.push("");

  return lines.join("\n");
}
