import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { debugLog } from "./utils.js";

export interface PdfExtractionResult {
  ok: boolean;
  text: string;
  error?: string;
}

/**
 * Extracts raw text from a PDF file, page by page. Never throws - returns
 * { ok: false, error } on any failure (missing file, corrupted PDF,
 * scanned/image-only PDF with no text layer, password-protected file, etc.)
 * so callers can log the failure and skip that posting rather than
 * crashing the whole batch.
 */
export async function extractPdfText(
  filePath: string,
): Promise<PdfExtractionResult> {
  try {
    const buffer = await readFile(filePath);
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      // Silence pdf.js's own console warnings about non-standard fonts, etc.
      verbosity: 0,
    }).promise;

    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pageTexts.push(pageText);
    }

    const text = pageTexts.join("\n\n").trim();

    if (!text) {
      return {
        ok: false,
        text: "",
        error:
          "PDF parsed successfully but contained no extractable text. This usually means it's a scanned image with no text layer (would need OCR).",
      };
    }

    debugLog(
      `Extracted ${text.length} characters across ${doc.numPages} page(s) from ${filePath}`,
    );
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      text: "",
      error: `Failed to read/parse PDF at ${filePath}: ${message}`,
    };
  }
}
