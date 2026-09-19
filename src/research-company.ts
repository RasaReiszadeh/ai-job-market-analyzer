import { readFile } from "node:fs/promises";
import path from "node:path";
import { Agent, run } from "@openai/agents";
import { debugLog } from "./utils.js";
import { allResearchTools } from "./research-tools.js";
import { CompanyResearchSchema, type CompanyResearch } from "./schemas.js";

const MODEL = "google/gemini-3-flash-preview";
const MAX_TURNS = 15;

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(
    import.meta.dirname,
    "COMPANY_RESEARCH_PROMPT.md",
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Runs a research agent (web_search + record_research tools) to investigate
 * a company. Extracts the structured result from the record_research tool
 * call arguments directly, rather than trusting the agent's free-text final
 * message - this is more reliable since the tool call arguments are already
 * Zod-validated by the Agents SDK before execute() even runs.
 *
 * Throws if the agent never calls record_research (e.g. hits MAX_TURNS
 * without concluding) - callers should catch this and continue with
 * company_research: null rather than crash the whole batch (graceful
 * degradation).
 */
export async function researchCompany(
  companyName: string,
  jobTitle: string,
): Promise<CompanyResearch> {
  const instructions = await loadPrompt();

  const agent = new Agent({
    name: "Company Research Agent",
    instructions,
    model: MODEL,
    tools: allResearchTools,
  });

  const prompt = `Research this company for a job applicant considering the role "${jobTitle}": ${companyName}`;

  debugLog(`Researching company: ${companyName} (role: ${jobTitle})`);

  const result = await run(agent, prompt, { maxTurns: MAX_TURNS });

  for (const item of result.history) {
    if (item.type === "function_call" && item.name === "record_research") {
      const args = JSON.parse(item.arguments);
      const parsed = CompanyResearchSchema.safeParse(args.research ?? args);
      if (parsed.success) {
        debugLog(`  record_research call validated successfully`);
        return parsed.data;
      }
      debugLog(
        `  record_research call failed schema validation: ${parsed.error}`,
      );
    }
  }

  throw new Error(
    `Agent did not produce a valid record_research call for "${companyName}" within ${MAX_TURNS} turns.`,
  );
}
