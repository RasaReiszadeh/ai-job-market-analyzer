import { tool } from "@openai/agents";
import { z } from "zod";
import { webSearchTool } from "./research-tools.js";
import { GapAnalysisResultSchema } from "./resume-schemas.js";

export const recordGapAnalysisTool = tool({
  name: "record_gap_analysis",
  description:
    "Records your final structured gap analysis. Call this only once, after you've reviewed the matched/missing skill lists and used web_search to find specific recommendations for at least the higher-priority gaps. This tool has no side effects - it exists to force a structured, evidence-based analysis rather than generic advice.",
  parameters: z.object({ analysis: GapAnalysisResultSchema }),
  async execute({ analysis }) {
    return { status: "recorded", analysis };
  },
});

export const allGapTools = [webSearchTool, recordGapAnalysisTool];
