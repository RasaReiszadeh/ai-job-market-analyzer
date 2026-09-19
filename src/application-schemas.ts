import * as z from "zod";

export const LegitimacySignalSchema = z.object({
  type: z.enum(["red", "green"]),
  description: z.string(),
  evidence: z.string(),
});

export const LegitimacyAssessmentSchema = z.object({
  verdict: z.enum(["green", "yellow", "red"]),
  signals: z.array(LegitimacySignalSchema),
  recommendation: z.string(),
});

export type LegitimacyAssessment = z.infer<typeof LegitimacyAssessmentSchema>;

export const FitBandSchema = z.enum([
  "strong_fit",
  "good_fit",
  "stretch",
  "growth_target",
]);

export const FitRequirementMatchSchema = z.object({
  requirement: z.string(),
  status: z.enum(["met", "gap", "partial"]),
  evidence: z.string(),
});

export const FitBreakdownSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  positioning_advice: z.array(z.string()),
  requirement_analysis: z.array(FitRequirementMatchSchema),
});

export type FitBreakdown = z.infer<typeof FitBreakdownSchema>;

export const FitAssessmentSchema = z.object({
  score_percent: z.number(),
  band: FitBandSchema,
  band_label: z.string(),
  encouragement: z.string(),
  matched_required: z.array(z.string()),
  partial_required: z.array(z.string()),
  missing_required: z.array(z.string()),
  matched_preferred: z.array(z.string()),
  partial_preferred: z.array(z.string()),
  missing_preferred: z.array(z.string()),
  breakdown: FitBreakdownSchema,
});

export type FitAssessment = z.infer<typeof FitAssessmentSchema>;

export const ResumeAdaptationSchema = z.object({
  headline_strategy: z.string(),
  summary_rewrite: z.string(),
  experience_reframes: z.array(z.string()),
  project_reframes: z.array(z.string()),
  skills_to_feature: z.array(z.string()),
});

export type ResumeAdaptation = z.infer<typeof ResumeAdaptationSchema>;

export const CoverLetterGuidanceSchema = z.object({
  opening_hook: z.string(),
  body_points: z.array(z.string()),
  company_connection: z.string(),
  closing_note: z.string(),
});

export type CoverLetterGuidance = z.infer<typeof CoverLetterGuidanceSchema>;

export const InterviewPrepSchema = z.object({
  likely_questions: z.array(z.string()),
  stories_to_prepare: z.array(z.string()),
  technical_topics: z.array(z.string()),
  smart_questions_to_ask: z.array(z.string()),
});

export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;

export const ApplicationMaterialsSchema = z.object({
  resume_adaptation: ResumeAdaptationSchema,
  cover_letter_guidance: CoverLetterGuidanceSchema,
  interview_prep: InterviewPrepSchema,
});

export type ApplicationMaterials = z.infer<typeof ApplicationMaterialsSchema>;
