/**
 * Local PDF handling with a self-hosted pdf.js worker.
 *
 * The worker and the library are served from this project's own origin. Text
 * is read from the PDF text layer; pages without a usable text layer are
 * rendered to a canvas so the OCR step can read them locally.
 */

const WORKER_SRC = "/pdf/pdf.worker.min.mjs";
const CMAP_URL = "/pdf/cmaps/";
const STANDARD_FONT_URL = "/pdf/standard_fonts/";

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((module) => {
      const lib = module as unknown as { GlobalWorkerOptions: { workerSrc: string } };
      lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      return module;
    });
  }
  return pdfjsPromise;
}

/** Load a document with the self-hosted character maps and standard fonts. */
async function loadDocument(data: ArrayBuffer) {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_URL,
  }).promise;
}

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfTextResult {
  pages: PdfPageText[];
  totalPages: number;
  /** True when at least one page carried a real text layer. */
  hasTextLayer: boolean;
}

interface PdfTextItemLike {
  str: string;
  transform?: number[];
  hasEOL?: boolean;
}

/**
 * Rebuild readable lines from pdf.js text items.
 *
 * Joining every item with a space destroys the line boundaries and makes the
 * local field extractor read a label and an unrelated neighbouring column as
 * one value. pdf.js gives each item a text-space y coordinate and an
 * end-of-line flag, so group by y and start a new line on a y change.
 */
export function textItemsToText(items: PdfTextItemLike[]): string {
  const lines: string[] = [];
  let current: string[] = [];
  let currentY: number | null = null;

  const flush = () => {
    const line = current.join(" ").replace(/[ \t]+/g, " ").trim();
    if (line) lines.push(line);
    current = [];
    currentY = null;
  };

  for (const item of items) {
    if (!("str" in item) || typeof item.str !== "string") continue;
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (
      current.length > 0 &&
      currentY !== null &&
      typeof y === "number" &&
      Math.abs(y - currentY) > 1
    ) {
      flush();
    }
    if (item.str.trim()) current.push(item.str.trim());
    if (typeof y === "number") currentY = y;
    if (item.hasEOL) flush();
  }
  flush();

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Read the text layer of every page.
 * The caller must pass a fresh ArrayBuffer because pdf.js detaches it.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<PdfTextResult> {
  const pdfDocument = await loadDocument(data);
  const pages: PdfPageText[] = [];
  let hasTextLayer = false;

  const totalPages = pdfDocument.numPages;
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = textItemsToText(content.items as PdfTextItemLike[]);
    if (text.length > 0) hasTextLayer = true;
    pages.push({ pageNumber, text });
    page.cleanup();
  }
  await pdfDocument.destroy();
  return { pages, totalPages, hasTextLayer };
}

/**
 * Render one page to a canvas for local OCR.
 * The caller must pass a fresh ArrayBuffer because pdf.js detaches it.
 */
export async function renderPdfPage(
  data: ArrayBuffer,
  pageNumber: number,
  targetWidth = 1600
): Promise<HTMLCanvasElement> {
  const pdfDocument = await loadDocument(data);
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, targetWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    await pdfDocument.destroy();
    throw new Error("The browser could not create a canvas for this page.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  await pdfDocument.destroy();
  return canvas;
}
