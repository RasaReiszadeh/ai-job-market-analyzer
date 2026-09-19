import type { MarketStats } from "./schemas.js";
import type { Resume } from "./resume-schemas.js";

function normalizeKey(skill: string): string {
  return skill.trim().toLowerCase();
}

export interface DemandedSkill {
  skill: string;
  count: number;
  companies: string[];
  postingsAnalyzed: number;
}

export interface SkillMatchResult {
  matched: DemandedSkill[];
  missing: DemandedSkill[];
}

/**
 * Combines required + preferred skill demand from market stats into one
 * ranked list (summing counts if a skill appears in both), then splits it
 * into "matched" (resume has it) vs "missing" (resume doesn't) using exact
 * case/whitespace-insensitive matching. This is deliberately simple - it
 * will miss near-synonyms (e.g. resume says "React.js", market says
 * "React"). That's intentional: the LLM step that follows this is asked to
 * catch those cases, since fuzzy matching in code risks false positives
 * that are just as bad as false negatives.
 */
export function matchResumeSkills(
  resume: Resume,
  stats: MarketStats,
): SkillMatchResult {
  const demandMap = new Map<string, DemandedSkill>();

  for (const s of [
    ...stats.top_required_skills,
    ...stats.top_preferred_skills,
  ]) {
    const key = normalizeKey(s.skill);
    const existing = demandMap.get(key);
    if (existing) {
      existing.count += s.count;
      existing.companies = Array.from(
        new Set([...existing.companies, ...s.companies]),
      );
    } else {
      demandMap.set(key, {
        skill: s.skill,
        count: s.count,
        companies: [...s.companies],
        postingsAnalyzed: stats.postings_analyzed,
      });
    }
  }

  const resumeSkillKeys = new Set(
    [...resume.hard_skills, ...resume.keywords_domain_expertise].map(
      normalizeKey,
    ),
  );

  const matched: DemandedSkill[] = [];
  const missing: DemandedSkill[] = [];

  for (const demanded of Array.from(demandMap.values()).sort(
    (a, b) => b.count - a.count,
  )) {
    const key = normalizeKey(demanded.skill);
    if (resumeSkillKeys.has(key)) {
      matched.push(demanded);
    } else {
      missing.push(demanded);
    }
  }

  return { matched, missing };
}
