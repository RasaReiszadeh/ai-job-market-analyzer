import type { JobPosting, MarketAnalysis } from "./schemas.js";

interface AnnualizedRange {
  low: number;
  high: number;
  source: string;
}

export interface SalaryComparison {
  postingAnnualized: AnnualizedRange | null;
  marketAnnualized: AnnualizedRange[];
  summary: string;
}

function extractCurrencyNumbers(text: string): number[] {
  return Array.from(
    text.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/g),
  )
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function annualizeRange(source: string): AnnualizedRange | null {
  const values = extractCurrencyNumbers(source);
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const lower = source.toLowerCase();

  let multiplier = 1;
  if (lower.includes("hour")) {
    multiplier = 40 * 52;
  } else if (lower.includes("month")) {
    multiplier = 12;
  } else if (
    lower.includes("year") ||
    lower.includes("annual") ||
    lower.includes("per year")
  ) {
    multiplier = 1;
  } else if (high < 500) {
    return null;
  }

  return {
    low: Math.round(low * multiplier),
    high: Math.round(high * multiplier),
    source,
  };
}

function formatAnnual(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildSalaryComparison(
  posting: JobPosting,
  market: MarketAnalysis,
): SalaryComparison {
  const marketAnnualized = market.salary_ranges_observed
    .map((entry) => annualizeRange(entry.range))
    .filter((entry): entry is AnnualizedRange => entry !== null);

  const postingAnnualized = posting.salary_range
    ? annualizeRange(posting.salary_range)
    : null;

  if (marketAnnualized.length === 0) {
    return {
      postingAnnualized,
      marketAnnualized,
      summary:
        "No market salary ranges from Phase 1 could be normalized, so compensation could not be compared reliably.",
    };
  }

  const marketLow = Math.round(
    marketAnnualized.reduce((sum, entry) => sum + entry.low, 0) /
      marketAnnualized.length,
  );
  const marketHigh = Math.round(
    marketAnnualized.reduce((sum, entry) => sum + entry.high, 0) /
      marketAnnualized.length,
  );

  if (!posting.salary_range) {
    return {
      postingAnnualized,
      marketAnnualized,
      summary: `This posting does not list compensation. Observed comparable market ranges from Phase 1 average roughly ${formatAnnual(marketLow)} to ${formatAnnual(marketHigh)} annualized.`,
    };
  }

  if (!postingAnnualized) {
    return {
      postingAnnualized,
      marketAnnualized,
      summary: `The posting lists compensation as "${posting.salary_range}", but it could not be normalized confidently. Observed comparable market ranges from Phase 1 average roughly ${formatAnnual(marketLow)} to ${formatAnnual(marketHigh)} annualized.`,
    };
  }

  let comparison = "roughly in line with";
  if (postingAnnualized.high < marketLow * 0.8) {
    comparison = "materially below";
  } else if (postingAnnualized.low > marketHigh * 1.2) {
    comparison = "materially above";
  }

  return {
    postingAnnualized,
    marketAnnualized,
    summary: `This posting's listed compensation annualizes to about ${formatAnnual(postingAnnualized.low)} to ${formatAnnual(postingAnnualized.high)}, which is ${comparison} the observed Phase 1 market average of roughly ${formatAnnual(marketLow)} to ${formatAnnual(marketHigh)}.`,
  };
}
