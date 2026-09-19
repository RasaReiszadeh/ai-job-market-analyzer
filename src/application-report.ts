import type {
  ApplicationMaterials,
  FitAssessment,
  LegitimacyAssessment,
} from "./application-schemas.js";
import type { CompanyResearch, JobPosting } from "./schemas.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function list(items: string[], ordered = false): string {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</${tag}>`;
}

function paragraph(value: string): string {
  return `<p>${escapeHtml(value)}</p>`;
}

function legitimacyBanner(assessment: LegitimacyAssessment | null): string {
  if (!assessment) {
    return `<div class="banner banner-yellow"><strong>Legitimacy assessment inconclusive.</strong> External checks failed or were incomplete, so review the posting carefully before sharing personal information.</div>`;
  }

  if (assessment.verdict === "green") return "";

  const label =
    assessment.verdict === "red"
      ? "Caution: significant legitimacy concerns."
      : "Caution: mixed legitimacy signals.";
  return `<div class="banner banner-${assessment.verdict}"><strong>${escapeHtml(label)}</strong> ${escapeHtml(assessment.recommendation)}</div>`;
}

function repeatedCautionBanner(
  assessment: LegitimacyAssessment | null,
  scope: string,
): string {
  if (!assessment || assessment.verdict === "green") return "";

  const text =
    assessment.verdict === "red"
      ? `${scope}: this posting was flagged red for legitimacy risk. Treat the content below as reference only and do not proceed without independent verification.`
      : `${scope}: legitimacy signals are mixed. Verify the employer and posting before acting on the content below.`;

  return `<div class="banner banner-${assessment.verdict} banner-inline"><strong>${escapeHtml(text)}</strong></div>`;
}

function sectionClassName(
  assessment: LegitimacyAssessment | null,
): string {
  if (!assessment || assessment.verdict === "green") return "";
  return assessment.verdict === "red" ? "section-caution section-red" : "section-caution section-yellow";
}

function renderSignals(assessment: LegitimacyAssessment | null): string {
  if (!assessment) {
    return paragraph(
      "Legitimacy checks were not conclusive because one or more external steps failed. Use extra caution and verify the employer independently.",
    );
  }

  return `
    <div class="signal-grid">
      ${assessment.signals
        .map(
          (signal) => `
            <article class="signal signal-${signal.type}">
              <div class="signal-type">${escapeHtml(signal.type.toUpperCase())}</div>
              <h3>${escapeHtml(signal.description)}</h3>
              <p>${escapeHtml(signal.evidence)}</p>
            </article>`,
        )
        .join("")}
    </div>
    <p class="recommendation"><strong>Recommendation:</strong> ${escapeHtml(assessment.recommendation)}</p>
  `;
}

export function generateApplicationReport(params: {
  posting: JobPosting;
  companyResearch: CompanyResearch | null;
  legitimacyAssessment: LegitimacyAssessment | null;
  fitAssessment: FitAssessment;
  materials: ApplicationMaterials;
  generatedAt: string;
}): string {
  const {
    posting,
    companyResearch,
    legitimacyAssessment,
    fitAssessment,
    materials,
    generatedAt,
  } = params;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Application Advisor Report</title>
    <style>
      :root {
        --bg: #f5f1e8;
        --panel: rgba(255, 252, 247, 0.92);
        --ink: #1f2933;
        --muted: #5b6772;
        --line: #d7c7ae;
        --green: #1f6f50;
        --yellow: #b7791f;
        --red: #9b2c2c;
        --accent: #0f4c5c;
        --shadow: 0 18px 45px rgba(31, 41, 51, 0.12);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 76, 92, 0.16), transparent 32%),
          radial-gradient(circle at top right, rgba(183, 121, 31, 0.14), transparent 28%),
          linear-gradient(180deg, #f9f6ef 0%, var(--bg) 100%);
      }

      .page {
        width: min(1100px, calc(100% - 32px));
        margin: 28px auto 40px;
      }

      .hero, section {
        background: var(--panel);
        border: 1px solid rgba(215, 199, 174, 0.8);
        border-radius: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }

      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }

      .eyebrow {
        font-size: 0.78rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 10px;
      }

      h1, h2, h3 {
        margin: 0 0 12px;
        line-height: 1.15;
      }

      h1 { font-size: clamp(2rem, 4vw, 3.1rem); }
      h2 { font-size: 1.45rem; }
      h3 { font-size: 1.05rem; }

      p, li {
        font-size: 1rem;
        line-height: 1.6;
        color: var(--ink);
      }

      .meta, .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .chip, .meta span {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.6);
        font-size: 0.92rem;
      }

      .banner {
        padding: 16px 18px;
        border-radius: 18px;
        margin: 0 0 18px;
        border: 1px solid currentColor;
        font-size: 1rem;
      }

      .banner-inline {
        margin: 0 0 16px;
        font-size: 0.95rem;
      }

      .banner-red { color: var(--red); background: rgba(155, 44, 44, 0.08); }
      .banner-yellow { color: var(--yellow); background: rgba(183, 121, 31, 0.10); }

      section {
        padding: 24px;
        margin-bottom: 18px;
      }

      .section-caution {
        position: relative;
      }

      .section-red {
        background: linear-gradient(180deg, rgba(255, 252, 247, 0.9), rgba(155, 44, 44, 0.05));
      }

      .section-yellow {
        background: linear-gradient(180deg, rgba(255, 252, 247, 0.92), rgba(183, 121, 31, 0.06));
      }

      .two-col {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 18px;
      }

      .signal-grid, .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }

      .signal, .card {
        border-radius: 18px;
        padding: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .signal-green { border-color: rgba(31, 111, 80, 0.35); }
      .signal-red { border-color: rgba(155, 44, 44, 0.35); }

      .signal-type {
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }

      .score {
        display: inline-flex;
        align-items: baseline;
        gap: 10px;
        margin: 8px 0 14px;
      }

      .score strong {
        font-size: 3.2rem;
        line-height: 1;
        color: var(--accent);
      }

      .muted { color: var(--muted); }

      .recommendation {
        margin-top: 16px;
      }

      ul, ol { padding-left: 22px; margin: 10px 0 0; }

      @media (max-width: 760px) {
        .page { width: min(100% - 20px, 1100px); }
        .hero, section { padding: 18px; border-radius: 18px; }
        .two-col { grid-template-columns: 1fr; }
        .score strong { font-size: 2.5rem; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <div class="eyebrow">Application Advisor</div>
        <h1>${escapeHtml(posting.job_title)}</h1>
        <p>${escapeHtml(posting.company_name)}</p>
        <div class="meta">
          <span>${escapeHtml(posting.location)}</span>
          <span>Generated ${escapeHtml(new Date(generatedAt).toLocaleString("en-CA"))}</span>
          <span>${escapeHtml(posting.salary_range ?? "Compensation not listed")}</span>
        </div>
      </header>

      ${legitimacyBanner(legitimacyAssessment)}

      <section>
        <div class="eyebrow">1. Legitimacy</div>
        <h2>Legitimacy Assessment</h2>
        <p class="muted">Company research: ${escapeHtml(companyResearch?.summary ?? "Unavailable or incomplete.")}</p>
        ${renderSignals(legitimacyAssessment)}
      </section>

      <section class="${sectionClassName(legitimacyAssessment)}">
        <div class="eyebrow">2. Fit</div>
        <h2>Fit Assessment</h2>
        ${repeatedCautionBanner(legitimacyAssessment, "Fit assessment")}
        <div class="two-col">
          <div>
            <div class="score">
              <strong>${escapeHtml(String(fitAssessment.score_percent))}%</strong>
              <span>${escapeHtml(fitAssessment.band_label)}</span>
            </div>
            <p>${escapeHtml(fitAssessment.encouragement)}</p>
            <p>${escapeHtml(fitAssessment.breakdown.summary)}</p>
          </div>
          <div class="card">
            <h3>Requirement Snapshot</h3>
            <p><strong>Matched required:</strong> ${escapeHtml(fitAssessment.matched_required.join(", ") || "None")}</p>
            <p><strong>Partial required:</strong> ${escapeHtml(fitAssessment.partial_required.join(", ") || "None")}</p>
            <p><strong>Missing required:</strong> ${escapeHtml(fitAssessment.missing_required.join(", ") || "None")}</p>
            <p><strong>Matched preferred:</strong> ${escapeHtml(fitAssessment.matched_preferred.join(", ") || "None")}</p>
            <p><strong>Partial preferred:</strong> ${escapeHtml(fitAssessment.partial_preferred.join(", ") || "None")}</p>
            <p><strong>Missing preferred:</strong> ${escapeHtml(fitAssessment.missing_preferred.join(", ") || "None")}</p>
          </div>
        </div>
        <div class="card-grid">
          <article class="card">
            <h3>Strengths</h3>
            ${list(fitAssessment.breakdown.strengths)}
          </article>
          <article class="card">
            <h3>Gaps</h3>
            ${list(fitAssessment.breakdown.gaps)}
          </article>
          <article class="card">
            <h3>Positioning Advice</h3>
            ${list(fitAssessment.breakdown.positioning_advice)}
          </article>
        </div>
      </section>

      <section class="${sectionClassName(legitimacyAssessment)}">
        <div class="eyebrow">3. Resume</div>
        <h2>Resume Adaptation</h2>
        ${repeatedCautionBanner(legitimacyAssessment, "Resume advice")}
        <div class="card-grid">
          <article class="card">
            <h3>Headline Strategy</h3>
            ${paragraph(materials.resume_adaptation.headline_strategy)}
            <h3>Summary Rewrite Direction</h3>
            ${paragraph(materials.resume_adaptation.summary_rewrite)}
          </article>
          <article class="card">
            <h3>Experience To Reframe</h3>
            ${list(materials.resume_adaptation.experience_reframes)}
          </article>
          <article class="card">
            <h3>Projects To Feature</h3>
            ${list(materials.resume_adaptation.project_reframes)}
          </article>
          <article class="card">
            <h3>Skills To Surface</h3>
            ${list(materials.resume_adaptation.skills_to_feature)}
          </article>
        </div>
      </section>

      <section class="${sectionClassName(legitimacyAssessment)}">
        <div class="eyebrow">4. Cover Letter</div>
        <h2>Cover Letter Guidance</h2>
        ${repeatedCautionBanner(legitimacyAssessment, "Cover letter guidance")}
        <div class="card-grid">
          <article class="card">
            <h3>Opening Hook</h3>
            ${paragraph(materials.cover_letter_guidance.opening_hook)}
            <h3>Company Connection</h3>
            ${paragraph(materials.cover_letter_guidance.company_connection)}
            <h3>Closing Note</h3>
            ${paragraph(materials.cover_letter_guidance.closing_note)}
          </article>
          <article class="card">
            <h3>Body Points</h3>
            ${list(materials.cover_letter_guidance.body_points, true)}
          </article>
        </div>
      </section>

      <section class="${sectionClassName(legitimacyAssessment)}">
        <div class="eyebrow">5. Interview</div>
        <h2>Interview Prep</h2>
        ${repeatedCautionBanner(legitimacyAssessment, "Interview prep")}
        <div class="card-grid">
          <article class="card">
            <h3>Likely Questions</h3>
            ${list(materials.interview_prep.likely_questions)}
          </article>
          <article class="card">
            <h3>Stories To Prepare</h3>
            ${list(materials.interview_prep.stories_to_prepare)}
          </article>
          <article class="card">
            <h3>Technical Topics</h3>
            ${list(materials.interview_prep.technical_topics)}
          </article>
          <article class="card">
            <h3>Smart Questions To Ask</h3>
            ${list(materials.interview_prep.smart_questions_to_ask)}
          </article>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
