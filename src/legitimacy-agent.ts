import { readFile } from "node:fs/promises";
import path from "node:path";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import {
  LegitimacyAssessmentSchema,
  type LegitimacyAssessment,
} from "./application-schemas.js";
import { webSearchTool } from "./research-tools.js";
import { whoisLookupTool } from "./whois-tool.js";
import { debugLog } from "./utils.js";
import { buildSalaryComparison } from "./salary-context.js";
import type { CompanyResearch, JobPosting, MarketAnalysis } from "./schemas.js";

const MODEL = "google/gemini-3-flash-preview";
const MAX_TURNS = 20;

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(import.meta.dirname, "LEGITIMACY_PROMPT.md");
  return readFile(promptPath, "utf-8");
}

function summarizeLocalSignals(postingText: string) {
  const lower = postingText.toLowerCase();
  const emailDomains = Array.from(postingText.matchAll(EMAIL_REGEX)).map(
    (match) => match[1].toLowerCase(),
  );

  const piiRequests = [
    "social insurance number",
    "social security number",
    "bank account",
    "passport",
    "driver's license",
    "sin number",
  ].filter((needle) => lower.includes(needle));

  const paymentRequests = [
    "pay for equipment",
    "purchase equipment",
    "gift card",
    "wire transfer",
    "bitcoin",
    "crypto",
  ].filter((needle) => lower.includes(needle));

  const interviewChannelFlags = [
    "telegram",
    "whatsapp",
    "signal app",
    "text interview",
  ].filter((needle) => lower.includes(needle));

  return {
    email_domains: Array.from(new Set(emailDomains)),
    pii_requests_detected: piiRequests,
    payment_requests_detected: paymentRequests,
    interview_channel_flags: interviewChannelFlags,
  };
}

const recordLegitimacyTool = tool({
  name: "record_legitimacy",
  description:
    "Records the final structured legitimacy assessment. Call this exactly once after using both web_search and whois_lookup where possible.",
  parameters: z.object({ assessment: LegitimacyAssessmentSchema }),
  async execute({ assessment }) {
    return { status: "recorded", assessment };
  },
});

export async function assessLegitimacy(
  posting: JobPosting,
  postingText: string,
  marketAnalysis: MarketAnalysis,
  companyResearch: CompanyResearch | null,
): Promise<LegitimacyAssessment> {
  const instructions = await loadPrompt();
  const salaryComparison = buildSalaryComparison(posting, marketAnalysis);
  const localSignals = summarizeLocalSignals(postingText);

  const agent = new Agent({
    name: "Legitimacy Agent",
    instructions,
    model: MODEL,
    tools: [webSearchTool, whoisLookupTool, recordLegitimacyTool],
  });

  const prompt = `Assess this job posting's legitimacy.

Structured posting:
${JSON.stringify(posting, null, 2)}

Existing company research from the earlier pipeline:
${JSON.stringify(companyResearch, null, 2)}

Deterministic local scan of the posting text:
${JSON.stringify(localSignals, null, 2)}

Compensation context:
${salaryComparison.summary}

Comparable salary observations from Phase 1:
${JSON.stringify(marketAnalysis.salary_ranges_observed, null, 2)}

Raw posting text:
<posting>
${postingText}
</posting>`;

  debugLog(`Assessing legitimacy for ${posting.company_name} / ${posting.job_title}`);

  const result = await run(agent, prompt, { maxTurns: MAX_TURNS });

  for (const item of result.history) {
    if (item.type === "function_call" && item.name === "record_legitimacy") {
      const args = JSON.parse(item.arguments);
      const parsed = LegitimacyAssessmentSchema.safeParse(
        args.assessment ?? args,
      );
      if (parsed.success) {
        debugLog("record_legitimacy call validated successfully");
        return parsed.data;
      }
      debugLog(`record_legitimacy schema validation failed: ${parsed.error}`);
    }
  }

  throw new Error(
    `Agent did not produce a valid record_legitimacy call within ${MAX_TURNS} turns.`,
  );
}
