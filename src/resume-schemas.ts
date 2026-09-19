import * as z from "zod";

export const ResumeSchema = z.object({
  hard_skills: z
    .array(z.string())
    .describe(
      "Programming languages, frameworks, tools, platforms explicitly mentioned in the resume (e.g. 'Python', 'React', 'AWS', 'Docker', 'Selenium'). Use consistent naming, e.g. 'JavaScript' not 'JS'.",
    ),

  soft_skills: z
    .array(z.string())
    .describe(
      "Communication, leadership, collaboration, problem-solving, and similar soft skills explicitly mentioned or clearly evidenced in the resume.",
    ),

  work_experience: z
    .array(
      z.object({
        role: z.string(),
        company: z.string(),
        duration: z
          .string()
          .describe("e.g. 'Jan 2025 - Aug 2025' or 'Summer 2024'"),
        description: z
          .string()
          .describe(
            "Key responsibilities and achievements for this role, summarized",
          ),
      }),
    )
    .describe("Work experience, internships, and co-ops listed on the resume"),

  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        details: z
          .string()
          .describe(
            "Graduation date, relevant coursework, GPA if listed, etc. 'not listed' if nothing beyond degree/institution.",
          ),
      }),
    )
    .describe("Degrees and educational programs listed"),

  certifications: z
    .array(z.string())
    .describe(
      "Professional certifications or completed courses explicitly listed. Empty array if none.",
    ),

  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z
          .string()
          .describe(
            "What the project does/did and any quantifiable achievements or outcomes mentioned",
          ),
      }),
    )
    .describe("Notable projects or portfolio items listed on the resume"),

  keywords_domain_expertise: z
    .array(z.string())
    .describe(
      "Industry-specific terminology and methodologies mentioned (e.g. 'Agile', 'CI/CD', 'REST API design', 'Test-Driven Development', 'SDLC').",
    ),
});

export type Resume = z.infer<typeof ResumeSchema>;

// --- Gap analysis (Phase 2) ---
//
// Same hybrid split as market analysis: code does the exact skill-matching
// (SkillMatchSchema results are computed deterministically in
// gap-matching.ts), the LLM does the nuanced work code can't do well -
// recognizing near-synonyms the exact matcher missed, triaging gaps by
// actionability, and writing specific (not generic) recommendations.

export const TriageLevelSchema = z.enum([
  "quick_win",
  "short_term",
  "medium_term",
  "long_term",
]);

export const SkillGapSchema = z.object({
  skill: z.string(),
  market_demand: z
    .string()
    .describe(
      "e.g. '5/11 postings' - how often this appears in the market data",
    ),
  triage_level: TriageLevelSchema,
  recommendation: z
    .string()
    .describe(
      "A SPECIFIC, actionable recommendation - not generic advice like 'learn X'. Should name a specific certification, course, project idea, or concrete next step, ideally informed by web_search. E.g. 'Complete the free AWS Cloud Practitioner Essentials course (~6 hours) and add the certification once passed' rather than 'learn AWS'.",
    ),
});

export const SkillStrengthSchema = z.object({
  skill: z.string(),
  market_demand: z.string(),
  resume_evidence: z
    .string()
    .describe(
      "Where/how this skill is demonstrated on the resume - a specific role or project, not just 'listed in skills section'",
    ),
});

export const GapAnalysisResultSchema = z.object({
  strengths: z
    .array(SkillStrengthSchema)
    .describe(
      "Skills the resume has that are commonly requested across the market postings",
    ),
  gaps: z
    .array(SkillGapSchema)
    .describe(
      "Skills commonly requested in the market but missing or underrepresented on the resume, triaged by actionability",
    ),
  unique_value: z
    .array(z.string())
    .describe(
      "Things the resume shows that aren't commonly requested in the postings but could differentiate this candidate - be specific, cite what's on the resume.",
    ),
});

export type GapAnalysisResult = z.infer<typeof GapAnalysisResultSchema>;

export const GapAnalysisSchema = GapAnalysisResultSchema.extend({
  generated_at: z.string(),
});

export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;
