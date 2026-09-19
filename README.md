# 🚀 AI Job Market & Career Fit Analyzer

> An autonomous LLM pipeline for tech recruitment intelligence, candidate-role alignment, and market trend synthesis.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI_API-412991?style=flat-square&logo=openai&logoColor=white)](https://openai.com/)
[![Zod](https://img.shields.io/badge/Zod_Validation-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Overview](#overview) • [Architecture](#system-architecture) • [Core Features](#core-features) • [Tech Stack](#tech-stack) • [Project Structure](#project-structure) • [Quick Start](#quick-start)

---

## 📌 Overview

Evaluating technical job postings across disparate platforms involves noise, ambiguous requirements, and unverified opportunities.

This project delivers an automated analysis pipeline built with **TypeScript** and **OpenAI Structured Outputs**. It parses unstructured job postings and developer resumes into typed schemas, runs company verification agents, computes objective multi-dimensional fit scores, and synthesizes market-wide gap analytics to pinpoint high-yield skill acquisitions.

---

## ⚙️ System Architecture

```text
 ┌───────────────────────────┐         ┌──────────────────────────┐
 │   Unstructured Postings   │         │     Candidate Profile    │
 │       (PDF / Text)        │         │      (resume.json)       │
 └─────────────┬─────────────┘         └────────────┬─────────────┘
               │                                    │
               ▼                                    ▼
 ┌───────────────────────────┐         ┌──────────────────────────┐
 │    Structured Ingestion   │         │ Resume Schema Extraction │
 │    (LLM + Zod Schemas)    │         │    (Skills & Domains)    │
 └─────────────┬─────────────┘         └────────────┬─────────────┘
               │                                    │
               ▼                                    │
 ┌───────────────────────────┐                      │
 │ Company Legitimacy Agent  │                      │
 │    (WHOIS & Domain Age)   │                      │
 └─────────────┬─────────────┘                      │
               │                                    │
               └─────────────────► ◄────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │    Fit Scoring Engine    │
                      │ (Languages, Stacks, Ops) │
                      └────────────┬─────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │   Market Gap Analyzer    │
                      │ & Actionable HTML Report │
                      └──────────────────────────┘
```

---

## ✨ Core Features

- **Type-Safe Extraction:** Enforces strict schema conformity via Zod validation for role duties, seniority levels, salary benchmarks, and tech stacks.
- **Legitimacy Agent:** Automates domain investigation and WHOIS lookups to evaluate company digital footprints and identify suspicious postings.
- **Fit Scoring Engine:** Calculates alignment metrics across programming languages, cloud stacks, testing frameworks, and engineering methodologies.
- **Market Trend Synthesis:** Aggregates data across listings to highlight in-demand frameworks, emerging tools, and baseline requirements.
- **Executive Reporting:** Generates standalone HTML and Markdown reports providing candidate-role alignment scores and targeted learning roadmaps.

---

## 🛠️ Tech Stack

- **Runtime & Language:** Node.js (ES Modules), TypeScript
- **AI Integration:** OpenAI API (`gpt-4o` with strict structured outputs)
- **Data Validation:** Zod schemas
- **Networking & Protocols:** WHOIS protocol client, native Fetch

---

## 📂 Project Structure

```text
├── data/
│   ├── analysis/             # Aggregated gap and market analysis data
│   ├── jobs/                 # Structured job posting records and manifest
│   └── resume/               # Candidate profile input
├── src/
│   ├── advise.ts             # Candidate guidance and strategic advisement
│   ├── aggregate-insights.ts # Multi-posting trend and pattern extraction
│   ├── analyze-market.ts     # High-level market requirement analysis
│   ├── fit-scoring.ts        # Scoring algorithm for candidate-role matching
│   ├── gap-analysis.ts       # Technical and domain gap assessment
│   ├── legitimacy-agent.ts   # Domain age and entity verification tools
│   ├── research-company.ts   # Autonomous organizational footprint checks
│   └── schemas.ts            # Strongly typed Zod schema definitions
├── tsconfig.json             # TypeScript compiler configuration
└── package.json              # Project scripts and dependencies
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm
- An active OpenAI API key

### 1. Clone & Install

```bash
git clone https://github.com/RasaReiszadeh/ai-job-market-analyzer.git
cd ai-job-market-analyzer
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Set your OpenAI API key inside `.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Execution Pipeline

Run the pipeline steps sequentially:

```bash
# 1. Ingest and structure raw job postings
npm run extract

# 2. Score candidate fit and execute market gap analysis
npm run analyze

# 3. Generate summary reports
npm run report
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
