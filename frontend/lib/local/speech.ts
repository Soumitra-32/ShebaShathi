/**
 * Local speech-to-text with a self-hosted Whisper model.
 *
 * The model runs in this browser through WebAssembly. The microphone audio is
 * decoded, resampled and transcribed on the device; the audio never leaves the
 * page and no speech-recognition service is contacted. The browser's own
 * Web Speech API is deliberately not used because some implementations send
 * the audio to a remote recognition service.
 */

export type SpeechStatus =
  | "idle"
  | "checking"
  | "loading"
  | "recording"
  | "transcribing"
  | "done"
  | "error";

export type SpeechErrorCode =
  | "unsupported"
  | "permission_denied"
  | "model_missing"
  | "no_speech"
  | "failed";

export interface SpeechState {
  status: SpeechStatus;
  error?: SpeechErrorCode;
  message?: string;
  progress?: number;
}

export const SPEECH_MODEL_ID = "onnx-community/whisper-base";
export const SPEECH_MODEL_LABEL = "Whisper (base), running locally";

type TransformersModule = typeof import("@huggingface/transformers");

let transformersPromise: Promise<TransformersModule> | null = null;
let pipelinePromise: Promise<unknown> | null = null;

/** True when this browser can run the local model and record audio. */
export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const hasMedia = Boolean(window.navigator?.mediaDevices?.getUserMedia);
  const hasRecorder = typeof window.MediaRecorder !== "undefined";
  const hasWasm = typeof window.WebAssembly !== "undefined";
  return hasMedia && hasRecorder && hasWasm;
}

/** Check whether the model files were installed on this server. */
export async function isSpeechModelInstalled(): Promise<boolean> {
  try {
    const response = await fetch(`/models/${SPEECH_MODEL_ID}/config.json`, {
      method: "HEAD",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getTransformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = import("@huggingface/transformers").then((module) => {
      const env = module.env;
      // Local models only: the browser must not contact a model host.
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = "/models/";
      // Nothing is written to the browser Cache Storage: no persistent storage.
      env.useBrowserCache = false;
      const wasm = env.backends?.onnx?.wasm;
      if (wasm) {
        // Serve the ONNX runtime from this project's own origin instead of the
        // CDN default that transformers.js would otherwise use.
        (wasm as unknown as { wasmPaths: unknown }).wasmPaths = {
          mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs",
          wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm",
        };
        // Single-threaded avoids the cross-origin isolation requirement.
        (wasm as unknown as { numThreads: number }).numThreads = 1;
      }
      return module;
    });
  }
  return transformersPromise;
}

async function getTranscriber(onProgress?: (progress: number) => void): Promise<
  (audio: Float32Array, options: { language: string }) => Promise<{ text: string }>
> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await getTransformers();
      return pipeline("automatic-speech-recognition", SPEECH_MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (message: { status?: string; progress?: number }) => {
          if (message?.status === "progress" && typeof message.progress === "number") {
            onProgress?.(message.progress);
          }
        },
      });
    })().catch((error) => {
      pipelinePromise = null;
      const text = error instanceof Error ? error.message : String(error);
      throw new SpeechError(
        /404|not found|Failed to fetch/i.test(text) ? "model_missing" : "failed",
        text
      );
    });
  }
  return pipelinePromise as unknown as (
    audio: Float32Array,
    options: { language: string }
  ) => Promise<{ text: string }>;
}

export class SpeechError extends Error {
  readonly code: SpeechErrorCode;

  constructor(code: SpeechErrorCode, message: string) {
    super(message);
    this.name = "SpeechError";
    this.code = code;
  }
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Records microphone audio and converts it to the 16 kHz mono float samples
 * the local model expects.
 */
export class LocalSpeechRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    if (!isSpeechSupported()) {
      throw new SpeechError("unsupported", "This browser cannot record audio locally.");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new SpeechError("permission_denied", "Microphone access was denied.");
      }
      throw new SpeechError("failed", "The microphone could not be opened.");
    }

    this.chunks = [];
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start(250);
  }

  /** Stop recording and return 16 kHz mono samples. */
  async stop(): Promise<Float32Array> {
    const recorder = this.recorder;
    if (!recorder) throw new SpeechError("failed", "No recording was running.");
    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await finished;
    this.releaseStream();

    const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
    this.chunks = [];
    if (blob.size === 0) throw new SpeechError("no_speech", "No audio was captured.");
    return decodeToMono16k(await blob.arrayBuffer());
  }

  /** Stop recording and discard the audio. */
  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // The recorder was already stopped.
    }
    this.chunks = [];
    this.releaseStream();
  }

  private releaseStream(): void {
    this.recorder = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}

async function decodeToMono16k(data: ArrayBuffer): Promise<Float32Array> {
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(data);
    const frames = Math.ceil(buffer.duration * 16000);
    const offline = new OfflineAudioContext(1, Math.max(frames, 1), 16000);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await audioContext.close();
  }
}

/** Transcribe 16 kHz mono samples with the local model. */
export async function transcribeLocally(
  samples: Float32Array,
  options: { language?: string; onProgress?: (progress: number) => void } = {}
): Promise<string> {
  if (!samples || samples.length === 0) {
    throw new SpeechError("no_speech", "No audio was captured.");
  }
  const transcriber = await getTranscriber(options.onProgress);
  const output = await transcriber(samples, { language: options.language ?? "bn" });
  const text = (output?.text ?? "").trim();
  if (!text) throw new SpeechError("no_speech", "No speech could be recognised.");
  return text;
}

/** Release the loaded model and its memory. */
export async function releaseSpeechModel(): Promise<void> {
  if (!pipelinePromise) return;
  const pending = pipelinePromise;
  pipelinePromise = null;
  try {
    const transcriber = (await pending) as { dispose?: () => Promise<void> };
    await transcriber?.dispose?.();
  } catch {
    // Nothing to release.
  }
}
