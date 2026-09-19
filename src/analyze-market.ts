import dotenv from "dotenv";
import { findUp } from "find-up";
import { readdir, writeFile, readFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./pdf.js";
import { extractJobPosting } from "./extract-posting.js";
import { researchCompany } from "./research-company.js";
import { computeMarketStats } from "./market-stats.js";
import { generateAggregateInsights } from "./aggregate-insights.js";
import { generateMarketReport } from "./generate-market-report.js";
import {
  slugify,
  debugLog,
  initDebugFromArgs,
  configureAgentClient,
} from "./utils.js";
import type { ExtractedJobPosting, MarketAnalysis } from "./schemas.js";

const envPath = await findUp(".env");
if (envPath) dotenv.config({ path: envPath, quiet: true });

configureAgentClient();

const KNOWN_FLAGS = new Set(["--debug", "--verbose"]);
const positionalArgs = process.argv.slice(2).filter((a) => !KNOWN_FLAGS.has(a));
const POSTINGS_DIR = positionalArgs[0] ?? "postings";
const JOBS_OUTPUT_DIR = "data/jobs";
const MANIFEST_PATH = path.join(JOBS_OUTPUT_DIR, "_manifest.json");

// Maps source PDF filename -> output slug. Checked BEFORE any LLM call, so
// re-running the script never re-extracts (or re-researches) a posting
// that's already been processed - even if the LLM's extracted title/company
// text varies slightly between runs (which it does; that's exactly the bug
// this manifest fixes, since slug-based dedup alone isn't reliable).
type Manifest = Record<string, string>;

async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function processPosting(
  pdfPath: string,
  manifest: Manifest,
): Promise<void> {
  const filename = path.basename(pdfPath);
  console.log(`\nProcessing: ${filename}`);

  // Check the manifest FIRST, before spending anything on extraction. This
  // is what makes re-runs cheap and correct regardless of any variance in
  // what the LLM extracts as title/company on a given run.
  const existingSlug = manifest[filename];
  if (existingSlug) {
    const existingPath = path.join(JOBS_OUTPUT_DIR, `${existingSlug}.json`);
    if (await fileExists(existingPath)) {
      console.log(`  Skipped (already processed): ${existingPath}`);
      return;
    }
    // Manifest says processed but file is missing (e.g. manually deleted) -
    // fall through and re-extract.
  }

  const extraction = await extractPdfText(pdfPath);
  if (!extraction.ok) {
    console.error(`  Skipped (PDF extraction failed): ${extraction.error}`);
    return;
  }

  // Today's date as the reference point for posting_age_days calculations.
  // Note: this is the extraction date, not necessarily when the PDF was
  // captured/printed - if you know the capture date, pass it instead.
  const referenceDate = new Date().toISOString().slice(0, 10);

  let jobPosting;
  try {
    jobPosting = await extractJobPosting(extraction.text, referenceDate);
  } catch (err) {
    console.error(
      `  Skipped (LLM extraction failed): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }

  const slug = slugify(jobPosting.job_title, jobPosting.company_name);
  const outputPath = path.join(JOBS_OUTPUT_DIR, `${slug}.json`);

  const record: ExtractedJobPosting = {
    ...jobPosting,
    // Company research (web_search tool) is added in the next step of the
    // pipeline - left null here so this stage can be tested independently.
    company_research: null,
    source_file: filename,
    extracted_at: new Date().toISOString(),
  };

  await writeFile(outputPath, JSON.stringify(record, null, 2), "utf-8");
  manifest[filename] = slug;
  await saveManifest(manifest);

  console.log(`  Saved: ${outputPath}`);
  debugLog(`  Title: ${record.job_title} | Company: ${record.company_name}`);
  debugLog(
    `  Required skills (${record.required_skills.length}): ${record.required_skills.join(", ")}`,
  );
  debugLog(`  posting_age_days: ${record.posting_age_days}`);
}

async function researchAllCompanies(): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(JOBS_OUTPUT_DIR)).filter(
      (f) => f.endsWith(".json") && f !== "_manifest.json",
    );
  } catch {
    console.error(
      `Could not read ${JOBS_OUTPUT_DIR}/ - skipping company research.`,
    );
    return;
  }

  console.log(`\nResearching companies for ${files.length} posting(s)...`);

  for (const file of files) {
    const filePath = path.join(JOBS_OUTPUT_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const record: ExtractedJobPosting = JSON.parse(raw);

    if (record.company_research !== null) {
      console.log(`  Skipped (already researched): ${record.company_name}`);
      continue;
    }

    console.log(`  Researching: ${record.company_name}`);
    try {
      const research = await researchCompany(
        record.company_name,
        record.job_title,
      );
      record.company_research = research;
      await writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
      console.log(`    Saved research for ${record.company_name}`);
      debugLog(`    Sources: ${research.sources.join(", ")}`);
    } catch (err) {
      // Graceful degradation: a failed research call shouldn't crash the
      // batch or block the rest of Phase 1. The posting still has all its
      // extracted data - it just won't have company context.
      console.error(
        `    Research failed for ${record.company_name}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

async function aggregateMarket(): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(JOBS_OUTPUT_DIR)).filter(
      (f) => f.endsWith(".json") && f !== "_manifest.json",
    );
  } catch {
    console.error(`Could not read ${JOBS_OUTPUT_DIR}/ - skipping aggregation.`);
    return;
  }

  if (files.length === 0) {
    console.error("No processed postings found - skipping aggregation.");
    return;
  }

  console.log(
    `\nAggregating market analysis from ${files.length} posting(s)...`,
  );

  const postings: ExtractedJobPosting[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(JOBS_OUTPUT_DIR, file), "utf-8");
    postings.push(JSON.parse(raw));
  }

  const stats = computeMarketStats(postings);
  debugLog(
    `Computed stats: ${stats.top_required_skills.length} top required skills, ${stats.salary_ranges_observed.length} salary ranges observed`,
  );

  let insights;
  try {
    insights = await generateAggregateInsights(postings, stats);
  } catch (err) {
    console.error(
      `Failed to generate aggregate insights: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    console.error(
      "Aggregation incomplete - market-analysis.json/md not written.",
    );
    return;
  }

  const generatedAt = new Date().toISOString();
  const analysis: MarketAnalysis = {
    ...stats,
    ...insights,
    generated_at: generatedAt,
  };

  await mkdir("data/analysis", { recursive: true });
  await mkdir("reports", { recursive: true });

  await writeFile(
    "data/analysis/market-analysis.json",
    JSON.stringify(analysis, null, 2),
    "utf-8",
  );
  console.log("  Saved: data/analysis/market-analysis.json");

  const report = generateMarketReport(stats, insights, generatedAt);
  await writeFile("reports/market-analysis.md", report, "utf-8");
  console.log("  Saved: reports/market-analysis.md");
}

async function main() {
  initDebugFromArgs(process.argv);

  let files: string[];
  try {
    files = (await readdir(POSTINGS_DIR)).filter((f) =>
      f.toLowerCase().endsWith(".pdf"),
    );
  } catch {
    console.error(
      `Could not read postings directory "${POSTINGS_DIR}". Create it and add your job posting PDFs, or pass a different path: npm run market -- ./my-postings`,
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`No PDF files found in "${POSTINGS_DIR}".`);
    process.exit(1);
  }

  console.log(`Found ${files.length} posting(s) in ${POSTINGS_DIR}/`);

  const manifest = await loadManifest();

  for (const file of files) {
    await processPosting(path.join(POSTINGS_DIR, file), manifest);
  }

  await researchAllCompanies();
  await aggregateMarket();

  console.log("\nPhase 1 complete: extraction, research, and market analysis.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
