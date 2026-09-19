import { tool } from "@openai/agents";
import { z } from "zod";
import { debugLog } from "./utils.js";

function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  const withoutEmail = trimmed.includes("@")
    ? trimmed.slice(trimmed.lastIndexOf("@") + 1)
    : trimmed;

  const withoutProtocol = withoutEmail.replace(/^https?:\/\//, "");
  const withoutWww = withoutProtocol.replace(/^www\./, "");
  return withoutWww.split("/")[0].split("?")[0].split("#")[0];
}

function readPath(
  value: unknown,
  paths: string[][],
): string | null {
  for (const path of paths) {
    let current: any = value;
    for (const key of path) {
      current = current?.[key];
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return null;
}

export const whoisLookupTool = tool({
  name: "whois_lookup",
  description:
    "Looks up WHOIS/RDAP data for a domain and returns a human-readable summary: registrant organization when available, registration/creation date, expiration date, registrar, and country.",
  parameters: z.object({
    domain: z.string().describe("The company or email domain to inspect"),
  }),
  async execute({ domain }) {
    const normalized = normalizeDomain(domain);
    debugLog(`Tool call: whois_lookup("${normalized || domain}")`);

    if (!normalized) {
      return `WHOIS lookup could not run because "${domain}" did not contain a usable domain name.`;
    }

    const apiKey = process.env.WHOIS_API_KEY;
    if (!apiKey) {
      return `WHOIS lookup unavailable for ${normalized}: WHOIS_API_KEY is not configured. Treat domain-age evidence as inconclusive rather than suspicious by itself.`;
    }

    try {
      const response = await fetch(
        `https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(normalized)}`,
        {
          headers: {
            Authorization: `TOKEN=${apiKey}`,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        return `WHOIS lookup failed for ${normalized}: HTTP ${response.status} ${response.statusText}. ${body || "No response body."} Treat this as inconclusive.`;
      }

      const payload = await response.json();
      const registrantOrg = readPath(payload, [
        ["registrant", "organization"],
        ["contacts", "registrant", "organization"],
        ["contacts", "owner", "organization"],
      ]);
      const creationDate = readPath(payload, [
        ["createdDate"],
        ["created"],
        ["creationDate"],
        ["registeredDate"],
      ]);
      const expirationDate = readPath(payload, [
        ["expiresDate"],
        ["expirationDate"],
        ["expiryDate"],
      ]);
      const registrar = readPath(payload, [
        ["registrar", "name"],
        ["registrarName"],
        ["registrar"],
      ]);
      const country = readPath(payload, [
        ["registrant", "country"],
        ["contacts", "registrant", "country"],
        ["contacts", "owner", "country"],
      ]);

      if (
        !registrantOrg &&
        !creationDate &&
        !expirationDate &&
        !registrar &&
        !country
      ) {
        return `WHOIS lookup for ${normalized} returned no useful registrant or registration fields. This can happen with privacy redaction, sparse RDAP records, or unregistered domains.`;
      }

      return [
        `WHOIS summary for ${normalized}:`,
        `Registrant organization: ${registrantOrg ?? "not available (possibly privacy-redacted)"}`,
        `Registration/creation date: ${creationDate ?? "not available"}`,
        `Expiration date: ${expirationDate ?? "not available"}`,
        `Registrar: ${registrar ?? "not available"}`,
        `Country: ${country ?? "not available"}`,
      ].join("\n");
    } catch (err) {
      debugLog(`  WHOIS lookup failed for "${normalized}": ${err}`);
      return `WHOIS lookup failed for ${normalized}: ${err instanceof Error ? err.message : String(err)}. Treat this as inconclusive rather than as proof of fraud.`;
    }
  },
});
