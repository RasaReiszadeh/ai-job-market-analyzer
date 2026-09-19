import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  FitBreakdownSchema,
  type FitAssessment,
} from "./application-schemas.js";
import { getClient, debugLog } from "./utils.js";
import type { JobPosting } from "./schemas.js";
import type { Resume } from "./resume-schemas.js";

const MODEL = "openai/gpt-4.1-mini";

const ReconciledRequirementSchema = z.object({
  requirement: z.string(),
  status: z.enum(["met", "partial", "gap"]),
  evidence: z.string(),
});

const FitReconciliationSchema = z.object({
  required: z.array(ReconciledRequirementSchema),
  preferred: z.array(ReconciledRequirementSchema),
});

type ReconciledRequirement = z.infer<typeof ReconciledRequirementSchema>;

function normalizeKey(skill: string): string {
  return skill
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bskills?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const skill of skills) {
    const key = normalizeKey(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(skill.trim());
  }

  return result;
}

function splitMatches(targetSkills: string[], resumeSkillKeys: Set<string>) {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of uniqueSkills(targetSkills)) {
    if (resumeSkillKeys.has(normalizeKey(skill))) {
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  }

  return { matched, missing };
}

function toResultMap(
  requirements: string[],
  exactMatches: string[],
): Map<string, ReconciledRequirement> {
  const exactSet = new Set(exactMatches.map(normalizeKey));
  const map = new Map<string, ReconciledRequirement>();

  for (const requirement of requirements) {
    const key = normalizeKey(requirement);
    map.set(key, {
      requirement,
      status: exactSet.has(key) ? "met" : "gap",
      evidence: exactSet.has(key)
        ? "Exact case-insensitive match found against the resume skills inventory."
        : "No exact match found during deterministic matching.",
    });
  }

  return map;
}

async function reconcileMatches(
  posting: JobPosting,
  resume: Resume,
  requiredSkills: string[],
  preferredSkills: string[],
  exactMatchedRequired: string[],
  exactMissingRequired: string[],
  exactMatchedPreferred: string[],
  exactMissingPreferred: string[],
) {
  const client = getClient();

  const systemPrompt = `You are reconciling resume-to-job requirement matches after a deterministic exact-string pass.

Rules:
- Review the exact matches and exact misses, but do not trust the misses blindly.
- Check hard skills, soft skills, keywords/domain expertise, work experience, projects, education, and certifications for equivalent or adjacent evidence.
- A requirement should be "met" if the resume clearly demonstrates it, even under different wording.
- A requirement should be "partial" if the resume shows adjacent or foundational evidence but not a full direct match.
- A requirement should stay "gap" only if the resume truly does not show it.
- Soft-skill requirements should be compared against resume.soft_skills and experience evidence too.
- Return every required skill exactly once in the required array and every preferred skill exactly once in the preferred array.
- Keep evidence concrete and resume-specific.`;

  const userPrompt = `Job posting:
${JSON.stringify(posting, null, 2)}

Resume:
${JSON.stringify(resume, null, 2)}

Exact deterministic pass:
${JSON.stringify(
    {
      required_skills: requiredSkills,
      preferred_skills: preferredSkills,
      exact_matched_required: exactMatchedRequired,
      exact_missing_required: exactMissingRequired,
      exact_matched_preferred: exactMatchedPreferred,
      exact_missing_preferred: exactMissingPreferred,
    },
    null,
    2,
  )}`;

  debugLog(
    `Reconciling fit matches: exact required=${exactMatchedRequired.length}/${requiredSkills.length}, exact preferred=${exactMatchedPreferred.length}/${preferredSkills.length}`,
  );

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(
      FitReconciliationSchema,
      "fit_reconciliation",
    ),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Fit reconciliation validation: passed (message.parsed)");
    return message.parsed;
  }

  if (message.content) {
    const json = JSON.parse(message.content);
    const parsed = FitReconciliationSchema.parse(json);
    debugLog("Fit reconciliation validation: passed (manual parse)");
    return parsed;
  }

  throw new Error("Model returned no content for fit reconciliation.");
}

function mergeReconciliation(
  exactMap: Map<string, ReconciledRequirement>,
  reconciled: ReconciledRequirement[],
): ReconciledRequirement[] {
  for (const item of reconciled) {
    const key = normalizeKey(item.requirement);
    if (!exactMap.has(key)) continue;
    exactMap.set(key, item);
  }

  return Array.from(exactMap.values());
}

function scoreRequirements(
  requirements: ReconciledRequirement[],
  partialWeight: number,
): number {
  if (requirements.length === 0) return 1;

  const total = requirements.reduce((sum, requirement) => {
    if (requirement.status === "met") return sum + 1;
    if (requirement.status === "partial") return sum + partialWeight;
    return sum;
  }, 0);

  return total / requirements.length;
}

function computeScore(
  required: ReconciledRequirement[],
  preferred: ReconciledRequirement[],
): number {
  if (required.length === 0 && preferred.length === 0) return 100;

  if (required.length === 0) {
    return Math.round(scoreRequirements(preferred, 0.5) * 100);
  }

  const requiredWeight = preferred.length > 0 ? 0.75 : 1;
  const preferredWeight = preferred.length > 0 ? 0.25 : 0;

  const requiredRatio = scoreRequirements(required, 0.6);
  const preferredRatio = preferred.length > 0 ? scoreRequirements(preferred, 0.5) : 0;

  return Math.round((requiredRatio * requiredWeight + preferredRatio * preferredWeight) * 100);
}

function bandForScore(scorePercent: number): {
  band: FitAssessment["band"];
  bandLabel: string;
  encouragement: string;
} {
  if (scorePercent >= 80) {
    return {
      band: "strong_fit",
      bandLabel: "Strong fit",
      encouragement:
        "Definitely apply. Your background already aligns well with the core requirements.",
    };
  }

  if (scorePercent >= 50) {
    return {
      band: "good_fit",
      bandLabel: "Good fit",
      encouragement:
        "Apply and highlight your strongest overlaps early. This looks competitive with focused positioning.",
    };
  }

  if (scorePercent >= 30) {
    return {
      band: "stretch",
      bandLabel: "Stretch fit",
      encouragement:
        "Still worth applying if the role is genuinely interesting. Position yourself around adjacent evidence and fast-learning capacity.",
    };
  }

  return {
    band: "growth_target",
    bandLabel: "Growth target",
    encouragement:
      "Treat this as longer-term application material unless there is a compelling strategic reason to apply now.",
  };
}

async function generateBreakdown(
  posting: JobPosting,
  resume: Resume,
  requiredResults: ReconciledRequirement[],
  preferredResults: ReconciledRequirement[],
  scorePercent: number,
  bandLabel: string,
) {
  const client = getClient();

  const systemPrompt = `You are helping a candidate assess fit for one specific job posting.

Rules:
- Use the reconciled requirement statuses exactly as provided. Do not contradict the score band.
- Be encouraging and realistic. Never shame the candidate for applying.
- Be specific to the actual resume evidence and this posting's requirements.
- Point to named roles, projects, and technologies from the resume.
- If a requirement is marked partial, explain the adjacent evidence honestly instead of overstating it.`;

  const userPrompt = `Job posting:
${JSON.stringify(posting, null, 2)}

Resume:
${JSON.stringify(resume, null, 2)}

Reconciled overlap:
${JSON.stringify(
    {
      score_percent: scorePercent,
      band_label: bandLabel,
      required: requiredResults,
      preferred: preferredResults,
    },
    null,
    2,
  )}`;

  debugLog(
    `Generating fit breakdown: score=${scorePercent}, reconciled required=${requiredResults.length}, reconciled preferred=${preferredResults.length}`,
  );

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(FitBreakdownSchema, "fit_breakdown"),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Fit breakdown validation: passed (message.parsed)");
    return message.parsed;
  }

  if (message.content) {
    const json = JSON.parse(message.content);
    const parsed = FitBreakdownSchema.parse(json);
    debugLog("Fit breakdown validation: passed (manual parse)");
    return parsed;
  }

  throw new Error("Model returned no content for fit breakdown.");
}

function requirementNamesByStatus(
  requirements: ReconciledRequirement[],
  status: ReconciledRequirement["status"],
): string[] {
  return requirements
    .filter((requirement) => requirement.status === status)
    .map((requirement) => requirement.requirement);
}

function fallbackBreakdown(
  posting: JobPosting,
  requiredResults: ReconciledRequirement[],
  preferredResults: ReconciledRequirement[],
) {
  const metRequired = requirementNamesByStatus(requiredResults, "met");
  const partialRequired = requirementNamesByStatus(requiredResults, "partial");
  const gapRequired = requirementNamesByStatus(requiredResults, "gap");
  const metPreferred = requirementNamesByStatus(preferredResults, "met");
  const partialPreferred = requirementNamesByStatus(preferredResults, "partial");

  const strengths = [
    ...requiredResults
      .filter((requirement) => requirement.status !== "gap")
      .map(
        (requirement) =>
          `${requirement.status === "met" ? "Clear" : "Partial"} alignment on ${requirement.requirement}: ${requirement.evidence}`,
      ),
    ...preferredResults
      .filter((requirement) => requirement.status !== "gap")
      .map(
        (requirement) =>
          `${requirement.status === "met" ? "Bonus" : "Adjacent"} preferred alignment on ${requirement.requirement}: ${requirement.evidence}`,
      ),
  ].slice(0, 5);

  const gaps = requiredResults
    .filter((requirement) => requirement.status === "gap")
    .map(
      (requirement) =>
        `${requirement.requirement}: ${requirement.evidence}`,
    )
    .slice(0, 5);

  return {
    summary: `The resume shows ${metRequired.length + partialRequired.length} reconciled required matches for ${posting.job_title}, with the strongest evidence around ${[...metRequired, ...partialRequired].slice(0, 3).join(", ") || "adjacent QA experience"}. The main remaining gaps are ${gapRequired.slice(0, 3).join(", ") || "mostly preferred extras"}.`,
    strengths:
      strengths.length > 0
        ? strengths
        : ["The resume shows adjacent technical and QA experience relevant to the role."],
    gaps:
      gaps.length > 0
        ? gaps
        : ["No major unresolved required gaps were obvious after reconciliation."],
    positioning_advice: [
      "Lead with the clearest reconciled matches and name the role or project that proves each one.",
      "Use bullets that translate tooling work into the job's process language, like test planning, execution, and regression coverage.",
      "Address any remaining true gaps honestly while emphasizing fast ramp-up evidence from adjacent work.",
    ],
    requirement_analysis: [
      ...requiredResults,
      ...preferredResults.slice(0, Math.max(0, 8 - requiredResults.length)),
    ],
  };
}

export async function computeFitAssessment(
  posting: JobPosting,
  resume: Resume,
): Promise<FitAssessment> {
  const requiredSkills = uniqueSkills(posting.required_skills);
  const preferredSkills = uniqueSkills(posting.preferred_skills);
  const resumeSkillKeys = new Set(
    [
      ...resume.hard_skills,
      ...resume.keywords_domain_expertise,
      ...resume.soft_skills,
    ].map(normalizeKey),
  );

  const { matched: exactMatchedRequired, missing: exactMissingRequired } =
    splitMatches(requiredSkills, resumeSkillKeys);
  const { matched: exactMatchedPreferred, missing: exactMissingPreferred } =
    splitMatches(preferredSkills, resumeSkillKeys);

  const exactRequiredMap = toResultMap(requiredSkills, exactMatchedRequired);
  const exactPreferredMap = toResultMap(preferredSkills, exactMatchedPreferred);

  let requiredResults = Array.from(exactRequiredMap.values());
  let preferredResults = Array.from(exactPreferredMap.values());

  try {
    const reconciliation = await reconcileMatches(
      posting,
      resume,
      requiredSkills,
      preferredSkills,
      exactMatchedRequired,
      exactMissingRequired,
      exactMatchedPreferred,
      exactMissingPreferred,
    );

    requiredResults = mergeReconciliation(exactRequiredMap, reconciliation.required);
    preferredResults = mergeReconciliation(
      exactPreferredMap,
      reconciliation.preferred,
    );
  } catch (err) {
    debugLog(`Fit reconciliation failed: ${err}`);
  }

  const scorePercent = computeScore(requiredResults, preferredResults);
  const band = bandForScore(scorePercent);
  const matchedRequired = requirementNamesByStatus(requiredResults, "met");
  const partialRequired = requirementNamesByStatus(requiredResults, "partial");
  const missingRequired = requirementNamesByStatus(requiredResults, "gap");
  const matchedPreferred = requirementNamesByStatus(preferredResults, "met");
  const partialPreferred = requirementNamesByStatus(preferredResults, "partial");
  const missingPreferred = requirementNamesByStatus(preferredResults, "gap");

  try {
    const breakdown = await generateBreakdown(
      posting,
      resume,
      requiredResults,
      preferredResults,
      scorePercent,
      band.bandLabel,
    );

    return {
      score_percent: scorePercent,
      band: band.band,
      band_label: band.bandLabel,
      encouragement: band.encouragement,
      matched_required: matchedRequired,
      partial_required: partialRequired,
      missing_required: missingRequired,
      matched_preferred: matchedPreferred,
      partial_preferred: partialPreferred,
      missing_preferred: missingPreferred,
      breakdown,
    };
  } catch (err) {
    debugLog(`Fit breakdown generation failed: ${err}`);
    return {
      score_percent: scorePercent,
      band: band.band,
      band_label: band.bandLabel,
      encouragement: band.encouragement,
      matched_required: matchedRequired,
      partial_required: partialRequired,
      missing_required: missingRequired,
      matched_preferred: matchedPreferred,
      partial_preferred: partialPreferred,
      missing_preferred: missingPreferred,
      breakdown: fallbackBreakdown(posting, requiredResults, preferredResults),
    };
  }
}
