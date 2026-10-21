/**
 * Local OCR with a self-hosted Tesseract build.
 *
 * The worker, the WebAssembly core and the language data are all served from
 * this project's own origin, so no image or extracted text is ever sent to an
 * OCR service. Nothing is cached in the browser either: the worker keeps no
 * copy of the images it processed.
 */
import { createWorker, OEM, Worker } from "tesseract.js";

export type OcrProgress = { status: string; progress: number };

export type OcrFailure = "model_missing" | "not_supported" | "failed";

export class OcrError extends Error {
  readonly reason: OcrFailure;

  constructor(reason: OcrFailure, message: string) {
    super(message);
    this.name = "OcrError";
    this.reason = reason;
  }
}

const WORKER_OPTIONS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract",
  langPath: "/tessdata",
  workerBlobURL: false,
  cacheMethod: "none" as const,
  gzip: true,
};

let workerPromise: Promise<Worker> | null = null;

async function createOcrWorker(onProgress?: (progress: OcrProgress) => void): Promise<Worker> {
  try {
    return await createWorker("ben+eng", OEM.LSTM_ONLY, {
      ...WORKER_OPTIONS,
      logger: (message: { status: string; progress: number }) => onProgress?.(message),
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/404|not found|Failed to fetch/i.test(text)) {
      throw new OcrError(
        "model_missing",
        "The local OCR model files are not installed on this server."
      );
    }
    throw new OcrError("not_supported", "Local OCR could not start in this browser.");
  }
}

async function getWorker(onProgress?: (progress: OcrProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker(onProgress).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

/** Recognise text in an image or canvas, entirely on this device. */
export async function recognizeImage(
  source: Blob | HTMLCanvasElement,
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  try {
    const result = await worker.recognize(source);
    const data = result?.data;
    return {
      text: (data?.text ?? "").trim(),
      confidence: typeof data?.confidence === "number" ? data.confidence : 0,
    };
  } catch (error) {
    throw new OcrError(
      "failed",
      error instanceof Error ? error.message : "The local OCR step failed."
    );
  }
}

/** Release the OCR worker and its memory. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker never started; nothing to release.
  }
}
