/**
 * Document text extraction that runs entirely in the browser.
 *
 * PDFs are read from their text layer first; a scanned PDF (no usable text
 * layer) is rendered page by page and read with the local OCR engine. Images
 * are read with the local OCR engine directly.
 */
import { FileKind } from "./files";
import { recognizeImage, OcrProgress } from "./ocr";
import { extractPdfText, renderPdfPage } from "./pdf";

/** A PDF page needs at least this many characters to count as a text page. */
export const MIN_TEXT_LAYER_CHARACTERS = 40;
/** Upper bound on the number of scanned pages that are rendered and read. */
export const MAX_OCR_PAGES = 3;

export type ExtractionMethod = "pdf_text" | "pdf_ocr" | "image_ocr";

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  pages: number;
  /** True when only part of a longer document could be read. */
  truncated: boolean;
  /** Number of pages that were actually read with OCR. */
  pagesRead: number;
}

export interface ExtractionOptions {
  onProgress?: (progress: OcrProgress & { page?: number }) => void;
}

export async function extractDocumentText(
  file: File,
  kind: FileKind,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  if (kind === "image") {
    const result = await recognizeImage(file, options.onProgress);
    return { text: result.text, method: "image_ocr", pages: 1, truncated: false, pagesRead: 1 };
  }

  const textLayer = await extractPdfText(await file.arrayBuffer());
  const totalCharacters = textLayer.pages.reduce((sum, page) => sum + page.text.length, 0);

  if (textLayer.hasTextLayer && totalCharacters >= MIN_TEXT_LAYER_CHARACTERS) {
    return {
      text: textLayer.pages.map((page) => page.text).filter(Boolean).join("\n"),
      method: "pdf_text",
      pages: textLayer.totalPages,
      truncated: false,
      pagesRead: textLayer.totalPages,
    };
  }

  // Scanned PDF: render the pages locally and read them with local OCR.
  const pageCount = Math.min(textLayer.totalPages, MAX_OCR_PAGES);
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const canvas = await renderPdfPage(await file.arrayBuffer(), pageNumber);
    const result = await recognizeImage(canvas, (progress) =>
      options.onProgress?.({ ...progress, page: pageNumber })
    );
    if (result.text) parts.push(result.text);
  }
  return {
    text: parts.join("\n"),
    method: "pdf_ocr",
    pages: textLayer.totalPages,
    truncated: textLayer.totalPages > pageCount,
    pagesRead: pageCount,
  };
}
