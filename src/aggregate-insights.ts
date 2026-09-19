import { readFile } from "node:fs/promises";
import path from "node:path";
import { zodResponseFormat } from "openai/helpers/zod";
import { getClient, debugLog } from "./utils.js";
import {
  AggregateInsightsSchema,
  type AggregateInsights,
  type ExtractedJobPosting,
  type MarketStats,
} from "./schemas.js";

const MODEL = "openai/gpt-4.1-mini";

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(import.meta.dirname, "AGGREGATE_PROMPT.md");
  return readFile(promptPath, "utf-8");
}

export async function generateAggregateInsights(
  postings: ExtractedJobPosting[],
  stats: MarketStats,
): Promise<AggregateInsights> {
  const systemPrompt = await loadPrompt();
  const client = getClient();

  const postingSummaries = postings.map((p) => ({
    job_title: p.job_title,
    company: p.company_name,
    key_responsibilities: p.key_responsibilities,
    company_research_summary:
      p.company_research?.summary ?? "No research available",
  }));

  const userPrompt = `Precomputed statistics:
${JSON.stringify(
  {
    postings_analyzed: stats.postings_analyzed,
    top_required_skills: stats.top_required_skills,
    top_preferred_skills: stats.top_preferred_skills,
  },
  null,
  2,
)}

Posting details:
${JSON.stringify(postingSummaries, null, 2)}`;

  debugLog(
    `Generating aggregate insights from ${postings.length} postings, model=${MODEL}`,
  );

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(AggregateInsightsSchema, "insights"),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Structured output validation: passed (message.parsed)");
    return message.parsed;
  }

  if (message.content) {
    try {
      const json = JSON.parse(message.content);
      const parsed = AggregateInsightsSchema.parse(json);
      debugLog("Structured output validation: passed (manual parse)");
      return parsed;
    } catch (err) {
      debugLog("Structured output validation: FAILED", err);
      throw new Error(
        `Model returned invalid JSON that did not match the AggregateInsights schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  throw new Error("Model returned no content for aggregate insights.");
}
