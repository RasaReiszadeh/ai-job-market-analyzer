import { readFile } from "node:fs/promises";
import path from "node:path";
import { Agent, run } from "@openai/agents";
import { debugLog } from "./utils.js";
import { allGapTools } from "./gap-tools.js";
import {
  GapAnalysisResultSchema,
  type GapAnalysisResult,
  type Resume,
} from "./resume-schemas.js";
import type { DemandedSkill } from "./gap-matching.js";

const MODEL = "google/gemini-3-flash-preview";
const MAX_TURNS = 20;

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(import.meta.dirname, "GAP_ANALYSIS_PROMPT.md");
  return readFile(promptPath, "utf-8");
}

export async function generateGapAnalysis(
  resume: Resume,
  matched: DemandedSkill[],
  missing: DemandedSkill[],
): Promise<GapAnalysisResult> {
  const instructions = await loadPrompt();

  const agent = new Agent({
    name: "Gap Analysis Agent",
    instructions,
    model: MODEL,
    tools: allGapTools,
  });

  const resumeSummary = {
    work_experience: resume.work_experience,
    projects: resume.projects,
    education: resume.education,
    certifications: resume.certifications,
    soft_skills: resume.soft_skills,
  };

  const prompt = `Matched skills (resume already has these, market demand shown):
${JSON.stringify(matched, null, 2)}

Missing skills (market demands these, resume doesn't obviously have them):
${JSON.stringify(missing, null, 2)}

Resume summary (for finding evidence and unique value):
${JSON.stringify(resumeSummary, null, 2)}`;

  debugLog(
    `Generating gap analysis: ${matched.length} matched, ${missing.length} missing skills`,
  );

  const result = await run(agent, prompt, { maxTurns: MAX_TURNS });

  for (const item of result.history) {
    if (item.type === "function_call" && item.name === "record_gap_analysis") {
      const args = JSON.parse(item.arguments);
      const parsed = GapAnalysisResultSchema.safeParse(args.analysis ?? args);
      if (parsed.success) {
        debugLog("record_gap_analysis call validated successfully");
        return parsed.data;
      }
      debugLog(
        `record_gap_analysis call failed schema validation: ${parsed.error}`,
      );
    }
  }

  throw new Error(
    `Agent did not produce a valid record_gap_analysis call within ${MAX_TURNS} turns.`,
  );
}
