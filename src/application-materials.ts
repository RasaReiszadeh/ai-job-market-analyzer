import { zodResponseFormat } from "openai/helpers/zod";
import {
  ApplicationMaterialsSchema,
  type ApplicationMaterials,
} from "./application-schemas.js";
import { getClient, debugLog } from "./utils.js";
import type { CompanyResearch, JobPosting } from "./schemas.js";
import type { Resume } from "./resume-schemas.js";
import type { FitAssessment, LegitimacyAssessment } from "./application-schemas.js";

const MODEL = "openai/gpt-4.1-mini";

export async function generateApplicationMaterials(
  posting: JobPosting,
  resume: Resume,
  fitAssessment: FitAssessment,
  legitimacyAssessment: LegitimacyAssessment | null,
  companyResearch: CompanyResearch | null,
): Promise<ApplicationMaterials> {
  const client = getClient();

  const systemPrompt = `You are helping a candidate prepare a highly specific application package for one job posting.

Rules:
- Be specific to the actual posting and actual resume.
- Name concrete roles, projects, certifications, technologies, and themes from the resume.
- Do not give generic advice like "tailor your resume" without saying exactly how.
- Resume adaptation should mention actual resume sections or bullets to emphasize or rewrite.
- Cover letter guidance should give concrete talking points, not a full letter.
- Interview prep should focus on this role's likely questions, relevant stories, and technical areas.
- If legitimacy is yellow or red, avoid telling the candidate to ignore that; keep the advice practical while acknowledging caution.`;

  const userPrompt = `Job posting:
${JSON.stringify(posting, null, 2)}

Resume:
${JSON.stringify(resume, null, 2)}

Fit assessment:
${JSON.stringify(fitAssessment, null, 2)}

Legitimacy assessment:
${JSON.stringify(legitimacyAssessment, null, 2)}

Company research:
${JSON.stringify(companyResearch, null, 2)}`;

  debugLog(`Generating application materials for ${posting.company_name}`);

  const completion = (await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(
      ApplicationMaterialsSchema,
      "application_materials",
    ),
  })) as any;

  const message = completion.choices[0].message;

  if (message.parsed) {
    debugLog("Application materials validation: passed (message.parsed)");
    return message.parsed;
  }

  if (message.content) {
    const json = JSON.parse(message.content);
    const parsed = ApplicationMaterialsSchema.parse(json);
    debugLog("Application materials validation: passed (manual parse)");
    return parsed;
  }

  throw new Error("Model returned no content for application materials.");
}
