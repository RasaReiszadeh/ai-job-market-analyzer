import { readFile } from "node:fs/promises";
import path from "node:path";
import { zodResponseFormat } from "openai/helpers/zod";
import { getClient, debugLog } from "./utils.js";
import { ResumeSchema, type Resume } from "./resume-schemas.js";

const MODEL = "openai/gpt-4.1-mini";

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(
    import.meta.dirname,
    "RESUME_EXTRACTION_PROMPT.md",
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Extracts structured fields from raw resume text using an LLM with
 * Zod-validated structured outputs. Same pattern as extract-posting.ts.
 * Throws if the model returns something invalid - callers should catch
 * this and surface a clear error rather than silently continuing with a
 * blank resume.
 */
export async function extractResume(resumeText: string): Promise<Resume> {
  const systemPrompt = await loadPrompt();
  const client = getClient();

  const userPrompt = `Extract structured data from this resume text:

<resume>
${resumeText}
</resume>`;

  debugLog(`Extracting resume (${resumeText.length} chars), model=${MODEL}`);

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(ResumeSchema, "resume"),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Structured output validation: passed (message.parsed)");
    return message.parsed;
  }

  if (message.content) {
    try {
      const json = JSON.parse(message.content);
      const parsed = ResumeSchema.parse(json);
      debugLog("Structured output validation: passed (manual parse)");
      return parsed;
    } catch (err) {
      debugLog("Structured output validation: FAILED", err);
      throw new Error(
        `Model returned invalid JSON that did not match the Resume schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  throw new Error("Model returned no content for resume extraction.");
}
