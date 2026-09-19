import type { ExtractedJobPosting, MarketStats } from "./schemas.js";

/** Normalizes a skill string for case/whitespace-insensitive counting, while keeping the original casing for display. */
function normalizeKey(skill: string): string {
  return skill.trim().toLowerCase();
}

function countSkills(
  postings: ExtractedJobPosting[],
  field: "required_skills" | "preferred_skills",
  topN: number,
): MarketStats["top_required_skills"] {
  const counts = new Map<
    string,
    { display: string; count: number; companies: Set<string> }
  >();

  for (const posting of postings) {
    for (const skill of posting[field]) {
      const key = normalizeKey(skill);
      if (!key) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        existing.companies.add(posting.company_name);
      } else {
        counts.set(key, {
          display: skill.trim(),
          count: 1,
          companies: new Set([posting.company_name]),
        });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map((entry) => ({
      skill: entry.display,
      count: entry.count,
      companies: Array.from(entry.companies),
    }));
}

/**
 * Computes market statistics deterministically from the extracted postings.
 * Deliberately does NOT use an LLM - skill frequency counts, salary lists,
 * etc. need to be exactly right, and code can guarantee that in a way an
 * LLM summarizing a pile of JSON cannot.
 */
export function computeMarketStats(
  postings: ExtractedJobPosting[],
): MarketStats {
  return {
    postings_analyzed: postings.length,
    top_required_skills: countSkills(postings, "required_skills", 15),
    top_preferred_skills: countSkills(postings, "preferred_skills", 10),
    experience_levels: postings.map((p) => ({
      company: p.company_name,
      job_title: p.job_title,
      level: p.experience_level,
    })),
    education_requirements: postings.map((p) => ({
      company: p.company_name,
      job_title: p.job_title,
      requirement: p.education_requirements,
    })),
    salary_ranges_observed: postings
      .filter((p) => p.salary_range !== null)
      .map((p) => ({
        company: p.company_name,
        job_title: p.job_title,
        range: p.salary_range as string,
      })),
  };
}
