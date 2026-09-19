import { readFile } from "node:fs/promises";
import path from "node:path";
import { zodResponseFormat } from "openai/helpers/zod";
import { getClient, debugLog } from "./utils.js";
import { JobPostingSchema, type JobPosting } from "./schemas.js";

const MODEL = "openai/gpt-4.1-mini";

/**
 * Models (especially smaller ones routed through OpenRouter) tend to default
 * nullable numeric fields to 0 instead of actually emitting null, even when
 * explicitly instructed not to. Rather than relying purely on prompt
 * compliance, enforce the null deterministically in code: if the model's own
 * evidence field says no date text was found, force posting_age_days to null
 * regardless of what number it produced.
 */
// Matches browser print-footer timestamps like "8/7/26, 5:55 PM" - a common
// artifact when postings are captured via Print to PDF. The model sometimes
// mistakes these for genuine "posted on" dates.
const PRINT_FOOTER_TIMESTAMP =
  /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}\s*(AM|PM)?$/i;

function reconcilePostingAge(posting: JobPosting): JobPosting {
  const looksLikePrintFooter =
    posting.posting_date_evidence !== null &&
    PRINT_FOOTER_TIMESTAMP.test(posting.posting_date_evidence.trim());

  if (!posting.date_information_found || looksLikePrintFooter) {
    if (posting.posting_age_days !== null) {
      const reason = looksLikePrintFooter
        ? `evidence "${posting.posting_date_evidence}" looks like a browser print-footer timestamp, not a real posting date`
        : "date_information_found=false";
      debugLog(
        `Reconciling: model returned posting_age_days=${posting.posting_age_days} but ${reason} - forcing to null`,
      );
    }
    return {
      ...posting,
      posting_age_days: null,
      posting_date_evidence: null,
      posting_age_note:
        posting.posting_age_note ??
        (looksLikePrintFooter
          ? "The only date-like text found was a browser print-footer timestamp, not a genuine posting date - treated as no date information."
          : "No date information found anywhere in the posting text."),
    };
  }
  return posting;
}

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(import.meta.dirname, "EXTRACTION_PROMPT.md");
  return readFile(promptPath, "utf-8");
}

/**
 * Extracts structured fields from raw job posting text using an LLM with
 * Zod-validated structured outputs (mirrors lab-04's flashcard-generator.ts
 * pattern). Throws if the model returns something that can't be parsed or
 * validated - callers should catch this and log/skip the posting rather
 * than crash the whole batch.
 */
export async function extractJobPosting(
  postingText: string,
  referenceDate: string,
): Promise<JobPosting> {
  const systemPrompt = await loadPrompt();
  const client = getClient();

  const userPrompt = `Today's/reference date: ${referenceDate}

Extract structured data from this job posting text:

<posting>
${postingText}
</posting>`;

  debugLog(`Extracting posting (${postingText.length} chars), model=${MODEL}`);

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(JobPostingSchema, "job_posting"),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Structured output validation: passed (message.parsed)");
    return reconcilePostingAge(message.parsed);
  }

  if (message.content) {
    try {
      const json = JSON.parse(message.content);
      const parsed = JobPostingSchema.parse(json);
      debugLog("Structured output validation: passed (manual parse)");
      return reconcilePostingAge(parsed);
    } catch (err) {
      debugLog("Structured output validation: FAILED", err);
      throw new Error(
        `Model returned invalid JSON that did not match the JobPosting schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  throw new Error("Model returned no content for job posting extraction.");
}
