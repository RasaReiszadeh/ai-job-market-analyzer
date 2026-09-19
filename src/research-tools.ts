import { tool } from "@openai/agents";
import { z } from "zod";
import { getTavilyClient, debugLog } from "./utils.js";
import { CompanyResearchSchema } from "./schemas.js";

export const webSearchTool = tool({
  name: "web_search",
  description:
    "Searches the web for information about a company. Use this to find company size/industry, recent news (layoffs, expansions, funding), culture signals (Glassdoor/Indeed reviews, blog posts), or anything else relevant to a job applicant researching this employer.",
  parameters: z.object({
    query: z.string().describe("The search query"),
  }),
  async execute({ query }) {
    debugLog(`Tool call: web_search("${query}")`);
    try {
      const tavilyClient = getTavilyClient();
      const result = await tavilyClient.search(query, { maxResults: 5 });
      if (!result.results || result.results.length === 0) {
        debugLog(`  Search returned 0 results for "${query}"`);
        return `No search results found for "${query}". Note that you found no evidence either way - do not fabricate information to fill this gap.`;
      }
      debugLog(
        `  Search returned ${result.results.length} results, top: ${result.results[0].url}`,
      );
      return result.results
        .map(
          (r: any) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`,
        )
        .join("\n\n---\n\n");
    } catch (err) {
      debugLog(`  Search failed for "${query}": ${err}`);
      return `Search failed for "${query}": ${err instanceof Error ? err.message : String(err)}. This may be a rate limit or network issue - note this line of investigation was inconclusive rather than guessing at results.`;
    }
  },
});

export const recordResearchTool = tool({
  name: "record_research",
  description:
    "Records your final structured research summary. Call this only once, after you have used web_search to investigate the company (at least 1-2 searches). This tool has no side effects other than capturing your findings - it exists to force a structured, evidence-based summary rather than a guess.",
  parameters: z.object({ research: CompanyResearchSchema }),
  async execute({ research }) {
    return { status: "recorded", research };
  },
});

export const allResearchTools = [webSearchTool, recordResearchTool];
