import dotenv from "dotenv";
import { findUp } from "find-up";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { extractPdfText } from "./pdf.js";
import { extractResume } from "./extract-resume.js";
import { matchResumeSkills } from "./gap-matching.js";
import { generateGapAnalysis } from "./gap-analysis.js";
import { generateGapReport } from "./generate-gap-report.js";
import { debugLog, initDebugFromArgs, configureAgentClient } from "./utils.js";
import type { MarketAnalysis } from "./schemas.js";
import type { Resume, GapAnalysis } from "./resume-schemas.js";

const envPath = await findUp(".env");
if (envPath) dotenv.config({ path: envPath, quiet: true });

configureAgentClient();

const KNOWN_FLAGS = new Set(["--debug", "--verbose"]);
const positionalArgs = process.argv.slice(2).filter((a) => !KNOWN_FLAGS.has(a));
const RESUME_PDF_PATH = positionalArgs[0];
const RESUME_OUTPUT_PATH = "data/resume/resume.json";
const MARKET_ANALYSIS_PATH = "data/analysis/market-analysis.json";
const GAP_ANALYSIS_JSON_PATH = "data/analysis/gap-analysis.json";
const GAP_REPORT_PATH = "reports/gap-analysis.md";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadMarketAnalysis(): Promise<MarketAnalysis> {
  if (!(await fileExists(MARKET_ANALYSIS_PATH))) {
    throw new Error(
      `${MARKET_ANALYSIS_PATH} not found. Run Phase 1 first: npm run market -- postings`,
    );
  }
  const raw = await readFile(MARKET_ANALYSIS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function getOrExtractResume(): Promise<Resume> {
  if (await fileExists(RESUME_OUTPUT_PATH)) {
    console.log(`Resume already extracted, using: ${RESUME_OUTPUT_PATH}`);
    console.log(`  (delete this file to force re-extraction)`);
    const raw = await readFile(RESUME_OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  }

  if (!RESUME_PDF_PATH) {
    throw new Error(
      "No resume PDF path provided and no existing data/resume/resume.json found. Usage: npm run gaps -- path/to/resume.pdf",
    );
  }

  console.log(`Extracting resume: ${RESUME_PDF_PATH}`);
  const extraction = await extractPdfText(RESUME_PDF_PATH);
  if (!extraction.ok) {
    throw new Error(`PDF extraction failed: ${extraction.error}`);
  }

  const resume = await extractResume(extraction.text);

  await mkdir("data/resume", { recursive: true });
  await writeFile(RESUME_OUTPUT_PATH, JSON.stringify(resume, null, 2), "utf-8");
  console.log(`  Saved: ${RESUME_OUTPUT_PATH}`);
  debugLog(
    `  Hard skills (${resume.hard_skills.length}): ${resume.hard_skills.join(", ")}`,
  );
  debugLog(`  Work experience entries: ${resume.work_experience.length}`);

  return resume;
}

async function main() {
  initDebugFromArgs(process.argv);

  let marketAnalysis: MarketAnalysis;
  try {
    marketAnalysis = await loadMarketAnalysis();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let resume: Resume;
  try {
    resume = await getOrExtractResume();
  } catch (err) {
    console.error(
      `Resume extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const { matched, missing } = matchResumeSkills(resume, marketAnalysis);
  console.log(
    `\nSkill match: ${matched.length} matched, ${missing.length} gaps (against ${marketAnalysis.postings_analyzed} market postings)`,
  );
  debugLog(`Matched: ${matched.map((m) => m.skill).join(", ")}`);
  debugLog(`Missing: ${missing.map((m) => m.skill).join(", ")}`);

  console.log(
    "\nRunning gap analysis (this uses web_search for recommendations, may take a bit)...",
  );
  let result;
  try {
    result = await generateGapAnalysis(resume, matched, missing);
  } catch (err) {
    console.error(
      `Gap analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const gapAnalysis: GapAnalysis = { ...result, generated_at: generatedAt };

  await mkdir("data/analysis", { recursive: true });
  await mkdir("reports", { recursive: true });

  await writeFile(
    GAP_ANALYSIS_JSON_PATH,
    JSON.stringify(gapAnalysis, null, 2),
    "utf-8",
  );
  console.log(`  Saved: ${GAP_ANALYSIS_JSON_PATH}`);

  const report = generateGapReport(result, generatedAt);
  await writeFile(GAP_REPORT_PATH, report, "utf-8");
  console.log(`  Saved: ${GAP_REPORT_PATH}`);

  console.log("\nPhase 2 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
