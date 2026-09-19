import dotenv from "dotenv";
import { findUp } from "find-up";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./pdf.js";
import { extractJobPosting } from "./extract-posting.js";
import { researchCompany } from "./research-company.js";
import { assessLegitimacy } from "./legitimacy-agent.js";
import { computeFitAssessment } from "./fit-scoring.js";
import { generateApplicationMaterials } from "./application-materials.js";
import { generateApplicationReport } from "./application-report.js";
import { MarketAnalysisSchema, type CompanyResearch } from "./schemas.js";
import { ResumeSchema, type Resume } from "./resume-schemas.js";
import {
  configureAgentClient,
  debugLog,
  initDebugFromArgs,
} from "./utils.js";
import type {
  ApplicationMaterials,
  FitAssessment,
  LegitimacyAssessment,
} from "./application-schemas.js";

const envPath = await findUp(".env");
if (envPath) dotenv.config({ path: envPath, quiet: true });

configureAgentClient();

const KNOWN_FLAGS = new Set(["--debug", "--verbose"]);
const positionalArgs = process.argv.slice(2).filter((a) => !KNOWN_FLAGS.has(a));
const POSTING_PDF_PATH = positionalArgs[0];
const RESUME_PATH = "data/resume/resume.json";
const MARKET_ANALYSIS_PATH = "data/analysis/market-analysis.json";
const OUTPUT_PATH = "reports/application-report.html";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadRequiredJson(): Promise<{ resume: Resume; marketAnalysis: any }> {
  if (!(await fileExists(RESUME_PATH))) {
    throw new Error(
      `${RESUME_PATH} not found. Run Phase 2 first: npm run gaps -- path/to/resume.pdf`,
    );
  }

  if (!(await fileExists(MARKET_ANALYSIS_PATH))) {
    throw new Error(
      `${MARKET_ANALYSIS_PATH} not found. Run Phase 1 first: npm run market -- postings`,
    );
  }

  const [resumeRaw, marketRaw] = await Promise.all([
    readFile(RESUME_PATH, "utf-8"),
    readFile(MARKET_ANALYSIS_PATH, "utf-8"),
  ]);

  return {
    resume: ResumeSchema.parse(JSON.parse(resumeRaw)),
    marketAnalysis: MarketAnalysisSchema.parse(JSON.parse(marketRaw)),
  };
}

function fallbackLegitimacy(error: unknown): LegitimacyAssessment | null {
  debugLog(`Legitimacy assessment fallback: ${error}`);
  return null;
}

function fallbackMaterials(
  postingTitle: string,
  fitAssessment: FitAssessment,
): ApplicationMaterials {
  return {
    resume_adaptation: {
      headline_strategy: `Lead with the strongest overlap for ${postingTitle}, especially ${fitAssessment.matched_required.slice(0, 3).join(", ") || "your most relevant technical work"}.`,
      summary_rewrite:
        "Rewrite the top summary around the exact role target, strongest matching tools, and one concrete quality or automation outcome.",
      experience_reframes: [
        "Move the most relevant QA, automation, or adjacent engineering experience above less relevant work.",
        "Rewrite bullets so each one ties a tool or test activity to a concrete outcome.",
      ],
      project_reframes: [
        "Feature the project that best mirrors the role's stack or testing approach.",
        "Use project bullets to cover missing formal experience when you have real hands-on evidence.",
      ],
      skills_to_feature:
        fitAssessment.matched_required.length > 0
          ? fitAssessment.matched_required
          : ["Highlight the closest matching technical skills first."],
    },
    cover_letter_guidance: {
      opening_hook:
        "Open by naming the role, your most relevant overlap, and one reason the company or product space is a credible fit.",
      body_points: [
        "Connect your strongest exact-match skills to the job's core responsibilities.",
        "Use one project or work example to show you can ramp into any missing areas quickly.",
        "Close on why this specific team is a logical next step rather than a generic application.",
      ],
      company_connection:
        "Reference the company mission, product, or team context if you can verify it from the company site or prior research.",
      closing_note:
        "End with confidence and specifics about the value you could bring in the first few months.",
    },
    interview_prep: {
      likely_questions: [
        "Why are you interested in this role specifically?",
        "Which of your past projects best maps to this posting?",
        "How have you handled learning a tool or framework quickly?",
      ],
      stories_to_prepare: [
        "A concise story showing impact in your most relevant technical experience.",
        "An example of debugging, quality improvement, or cross-team collaboration.",
      ],
      technical_topics: [
        ...fitAssessment.matched_required.slice(0, 4),
        ...fitAssessment.missing_required.slice(0, 2),
      ],
      smart_questions_to_ask: [
        "What would success look like in the first 60-90 days?",
        "Which tools or workflows are most important for this role day to day?",
      ],
    },
  };
}

function applyLegitimacyGuardrails(
  legitimacyAssessment: LegitimacyAssessment | null,
  fitAssessment: FitAssessment,
  materials: ApplicationMaterials,
): {
  fitAssessment: FitAssessment;
  materials: ApplicationMaterials;
} {
  if (!legitimacyAssessment || legitimacyAssessment.verdict === "green") {
    return { fitAssessment, materials };
  }

  const cautionIntro =
    legitimacyAssessment.verdict === "red"
      ? "Caution: this posting was flagged with serious legitimacy concerns. Treat the fit score as reference only and do not invest further application effort unless you independently verify the opportunity."
      : "Caution: this posting has mixed legitimacy signals. Treat the fit score as reference only until the employer and posting are independently verified.";

  const bandLabelSuffix =
    legitimacyAssessment.verdict === "red"
      ? "reference only"
      : "pending verification";

  const sectionPrefix =
    legitimacyAssessment.verdict === "red"
      ? "This posting may not be a real opportunity. Use the notes below only if you decide to verify the employer first."
      : "Proceed carefully. Use the notes below only after verifying the employer and the posting independently.";

  return {
    fitAssessment: {
      ...fitAssessment,
      band_label: `${fitAssessment.band_label} (${bandLabelSuffix})`,
      encouragement: cautionIntro,
      breakdown: {
        ...fitAssessment.breakdown,
        summary:
          legitimacyAssessment.verdict === "red"
            ? `If this posting were legitimate, the resume would look technically relevant. Do not treat that overlap as a reason to proceed until the employer and application channel are independently verified. ${fitAssessment.breakdown.summary}`
            : `If the posting is verified as legitimate, the resume appears reasonably aligned. Confirm the employer first, then use the fit notes below as reference. ${fitAssessment.breakdown.summary}`,
        positioning_advice: [
          legitimacyAssessment.verdict === "red"
            ? "Application strategy is intentionally de-emphasized because the legitimacy assessment is red."
            : "Application strategy is secondary until the employer and posting are verified.",
          ...fitAssessment.breakdown.positioning_advice.map(
            (item) => `${sectionPrefix} ${item}`,
          ),
        ],
      },
    },
    materials: {
      resume_adaptation: {
        headline_strategy: `${sectionPrefix} ${materials.resume_adaptation.headline_strategy}`,
        summary_rewrite: `${sectionPrefix} ${materials.resume_adaptation.summary_rewrite}`,
        experience_reframes: materials.resume_adaptation.experience_reframes.map(
          (item) => `${sectionPrefix} ${item}`,
        ),
        project_reframes: materials.resume_adaptation.project_reframes.map(
          (item) => `${sectionPrefix} ${item}`,
        ),
        skills_to_feature: [
          sectionPrefix,
          ...materials.resume_adaptation.skills_to_feature,
        ],
      },
      cover_letter_guidance: {
        opening_hook: `${sectionPrefix} ${materials.cover_letter_guidance.opening_hook}`,
        body_points: materials.cover_letter_guidance.body_points.map(
          (item) => `${sectionPrefix} ${item}`,
        ),
        company_connection: `${sectionPrefix} ${materials.cover_letter_guidance.company_connection}`,
        closing_note: `${sectionPrefix} ${materials.cover_letter_guidance.closing_note}`,
      },
      interview_prep: {
        likely_questions: [
          legitimacyAssessment.verdict === "red"
            ? "Before interview prep: can you independently verify that the employer, recruiter, and application channel are real?"
            : "Before interview prep: can you independently verify that the employer and posting are legitimate?",
          ...materials.interview_prep.likely_questions.map(
            (item) => `${sectionPrefix} ${item}`,
          ),
        ],
        stories_to_prepare: materials.interview_prep.stories_to_prepare.map(
          (item) => `${sectionPrefix} ${item}`,
        ),
        technical_topics: [
          legitimacyAssessment.verdict === "red"
            ? "Pause technical prep until legitimacy is verified."
            : "Verify legitimacy before spending significant prep time.",
          ...materials.interview_prep.technical_topics,
        ],
        smart_questions_to_ask: [
          legitimacyAssessment.verdict === "red"
            ? "Can the recruiter provide a verifiable company email, official careers-page listing, and confirmed hiring contact?"
            : "Can the recruiter confirm the role through an official company channel or careers page?",
          ...materials.interview_prep.smart_questions_to_ask.map(
            (item) => `${sectionPrefix} ${item}`,
          ),
        ],
      },
    },
  };
}

async function main() {
  initDebugFromArgs(process.argv);

  if (!POSTING_PDF_PATH) {
    console.error("Usage: npm run advise -- <path-to-new-posting.pdf> [--debug]");
    process.exit(1);
  }

  let resume: Resume;
  let marketAnalysis: any;
  try {
    ({ resume, marketAnalysis } = await loadRequiredJson());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Reading posting PDF: ${POSTING_PDF_PATH}`);
  const extraction = await extractPdfText(POSTING_PDF_PATH);
  if (!extraction.ok) {
    console.error(`PDF extraction failed: ${extraction.error}`);
    process.exit(1);
  }

  const referenceDate = new Date().toISOString().slice(0, 10);
  let posting;
  try {
    posting = await extractJobPosting(extraction.text, referenceDate);
  } catch (err) {
    console.error(
      `Posting extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  console.log(`Generating application advisor report for ${posting.company_name} / ${posting.job_title}`);

  let companyResearch: CompanyResearch | null = null;
  try {
    companyResearch = await researchCompany(posting.company_name, posting.job_title);
  } catch (err) {
    console.error(
      `Company research failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let legitimacyAssessment: LegitimacyAssessment | null = null;
  try {
    legitimacyAssessment = await assessLegitimacy(
      posting,
      extraction.text,
      marketAnalysis,
      companyResearch,
    );
  } catch (err) {
    console.error(
      `Legitimacy assessment failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    legitimacyAssessment = fallbackLegitimacy(err);
  }

  let fitAssessment: FitAssessment;
  try {
    fitAssessment = await computeFitAssessment(posting, resume);
  } catch (err) {
    console.error(`Fit assessment failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let materials: ApplicationMaterials;
  try {
    materials = await generateApplicationMaterials(
      posting,
      resume,
      fitAssessment,
      legitimacyAssessment,
      companyResearch,
    );
  } catch (err) {
    console.error(
      `Application materials generation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    materials = fallbackMaterials(posting.job_title, fitAssessment);
  }

  ({ fitAssessment, materials } = applyLegitimacyGuardrails(
    legitimacyAssessment,
    fitAssessment,
    materials,
  ));

  const generatedAt = new Date().toISOString();
  const report = generateApplicationReport({
    posting,
    companyResearch,
    legitimacyAssessment,
    fitAssessment,
    materials,
    generatedAt,
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, report, "utf-8");
  console.log(`Saved: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
