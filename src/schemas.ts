import * as z from "zod";

export const JobPostingSchema = z.object({
  job_title: z
    .string()
    .describe("The exact job title as written in the posting"),

  company_name: z.string().describe("The hiring company's name"),

  location: z
    .string()
    .describe(
      "Location and remote status, e.g. 'Toronto, ON (Hybrid)' or 'Remote (Canada-wide)'. If not stated, write 'not listed'.",
    ),

  date_information_found: z
    .boolean()
    .describe(
      "Set to true only if you find actual date-related text in the posting (e.g. 'posted X days ago', a date stamp, an application deadline). Set to false if there is no date information anywhere in the posting text.",
    ),

  posting_date_evidence: z
    .string()
    .nullable()
    .describe(
      "Quote or closely paraphrase the exact date-related text found, e.g. 'Posted 3 days ago' or 'Applications close June 1, 2026'. Must be null if date_information_found is false.",
    ),

  posting_age_days: z
    .number()
    .nullable()
    .describe(
      "How many days old the posting is, calculated relative to the reference date provided in the prompt. This MUST be null if date_information_found is false.",
    ),

  required_skills: z
    .array(z.string())
    .describe(
      "Hard skills and technologies explicitly required (not preferred/nice-to-have). Use consistent naming, e.g. 'JavaScript' not 'JS'.",
    ),

  preferred_skills: z
    .array(z.string())
    .describe(
      "Hard skills and technologies listed as preferred, nice-to-have, or a bonus. Empty array if none listed.",
    ),

  experience_level: z
    .string()
    .describe(
      "Seniority and years of experience required, e.g. 'Entry-level, 0-2 years' or 'Senior, 5+ years'. If not stated, write 'not listed'.",
    ),

  education_requirements: z
    .string()
    .describe(
      "Degree or educational requirements, e.g. 'Bachelor's in Computer Science or related field'. If not stated, write 'not listed'.",
    ),

  salary_range: z
    .string()
    .nullable()
    .describe(
      "Salary range exactly as listed, e.g. '$70,000-$85,000 CAD'. Null if no salary information is present.",
    ),

  key_responsibilities: z
    .array(z.string())
    .describe(
      "The main day-to-day responsibilities/duties listed for the role",
    ),

  posting_age_note: z
    .string()
    .nullable()
    .describe(
      "If posting_age_days was estimated rather than calculated directly (e.g. relative date like 'posted 3 days ago' with no absolute capture date available), briefly note the limitation here. Null if the age was calculated cleanly.",
    ),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

// Phase 1 also attaches company research (from the web_search tool) to each
// posting before saving to data/jobs/*.json. Kept as a separate schema since
// research is added in a second pass, after the initial structured extraction.
export const CompanyResearchSchema = z.object({
  summary: z
    .string()
    .describe(
      "2-4 sentence summary of what was found: company size/industry, recent news, culture signals. Note explicitly if little/no information was found rather than guessing.",
    ),
  sources: z
    .array(z.string())
    .describe("URLs of the sources used to produce the summary"),
});

export type CompanyResearch = z.infer<typeof CompanyResearchSchema>;

export const ExtractedJobPostingSchema = JobPostingSchema.extend({
  company_research: CompanyResearchSchema.nullable(),
  source_file: z
    .string()
    .describe("Original PDF filename this was extracted from"),
  extracted_at: z.string().describe("ISO timestamp when extraction ran"),
});

export type ExtractedJobPosting = z.infer<typeof ExtractedJobPostingSchema>;

// --- Market analysis (Phase 1 aggregation) ---
//
// Split into two parts on purpose: MarketStats is computed deterministically
// in code (skill frequency counts, salary lists, etc.) because LLMs are
// unreliable at counting things precisely - we saw this firsthand with the
// posting_age_days bug. AggregateInsights is the part that genuinely needs
// an LLM: qualitative synthesis (clustering responsibilities into themes,
// spotting trends, reading culture signals) that code can't do well.

export const SkillCountSchema = z.object({
  skill: z.string(),
  count: z.number(),
  companies: z.array(z.string()),
});

export const MarketStatsSchema = z.object({
  postings_analyzed: z.number(),
  top_required_skills: z.array(SkillCountSchema),
  top_preferred_skills: z.array(SkillCountSchema),
  experience_levels: z.array(
    z.object({ company: z.string(), job_title: z.string(), level: z.string() }),
  ),
  education_requirements: z.array(
    z.object({
      company: z.string(),
      job_title: z.string(),
      requirement: z.string(),
    }),
  ),
  salary_ranges_observed: z.array(
    z.object({ company: z.string(), job_title: z.string(), range: z.string() }),
  ),
});

export type MarketStats = z.infer<typeof MarketStatsSchema>;

export const AggregateInsightsSchema = z.object({
  common_responsibilities: z
    .array(z.string())
    .describe(
      "5-10 recurring responsibility THEMES synthesized across postings (not verbatim copies of any one posting), e.g. 'Writing and executing manual and automated test cases' if that theme appears across multiple postings.",
    ),
  notable_trends: z
    .array(z.string())
    .describe(
      "3-6 notable patterns or trends you observe across the postings as a set - e.g. a shift toward AI-assisted testing tools, heavy demand for a specific framework, a split between manual-only vs automation-heavy roles. Describe trends qualitatively - do NOT state specific counts or percentages, those are computed separately and inserted into the report automatically.",
    ),
  industry_culture_expectations: z
    .string()
    .describe(
      "2-4 sentences on what the postings and company research collectively suggest about industry/culture expectations for this role type - e.g. how much these companies value certifications, degrees vs practical skill, remote flexibility, etc.",
    ),
});

export type AggregateInsights = z.infer<typeof AggregateInsightsSchema>;

export const MarketAnalysisSchema = MarketStatsSchema.merge(
  AggregateInsightsSchema,
).extend({
  generated_at: z.string(),
});

export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;
