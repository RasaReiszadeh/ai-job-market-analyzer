import OpenAI from "openai";
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { tavily } from "@tavily/core";

/**
 * Configures the OpenAI Agents SDK to route all calls through OpenRouter
 * instead of OpenAI directly. Call this once at the top of each entry point,
 * after dotenv has loaded the .env file.
 */
export function configureAgentClient(): void {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("Error: OPENROUTER_API_KEY not found in .env");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
  });

  setDefaultOpenAIClient(client);

  // OpenRouter only implements the Chat Completions format, not OpenAI's
  // newer Responses API, which the Agents SDK uses by default.
  setOpenAIAPI("chat_completions");

  setTracingDisabled(true);
}

/**
 * Lazily-constructed OpenAI client for plain (non-Agents-SDK) structured
 * output calls, e.g. client.chat.completions.parse(...). Kept as a function
 * rather than a top-level instantiation so importing this module never
 * fails just because an env var hasn't loaded yet.
 */
export function getClient(): OpenAI {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("Error: OPENROUTER_API_KEY not found in .env");
    process.exit(1);
  }
  return new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
  });
}

export function getTavilyClient() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    console.error("Error: TAVILY_API_KEY not found in .env");
    process.exit(1);
  }
  return tavily({ apiKey: key });
}

/**
 * Debug/verbose logging. Controlled by LOG_LEVEL=debug in .env, or a
 * --verbose / --debug CLI flag (checked in each entry point).
 * Always logs to stderr so it never pollutes stdout output.
 */
let debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

export function debugLog(...args: unknown[]): void {
  if (!debugEnabled) return;
  console.error("[DEBUG]", ...args);
}

/** Call at the top of each entry point's main() to pick up --verbose/--debug flags or LOG_LEVEL. */
export function initDebugFromArgs(argv: string[]): void {
  const flagSet = argv.includes("--verbose") || argv.includes("--debug");
  const envSet = process.env.LOG_LEVEL?.toLowerCase() === "debug";
  setDebugEnabled(flagSet || envSet);
}

/** Turns a job title + company into a filesystem-safe slug, e.g. "Senior Backend Developer" + "Acme Corp" -> "senior-backend-developer-acme-corp" */
export function slugify(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
