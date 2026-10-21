/**
 * Checks that the local speech model and the speech pipeline work with the
 * files that the app ships.
 *
 * The check runs outside the browser (Node runtime) and feeds two seconds of
 * silence through the model: it proves the model files, the tokenizer and the
 * inference pipeline are complete and loadable. It does not measure
 * recognition quality and it does not test the microphone.
 *
 * Usage: node scripts/verify-speech-model.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");

const { env, pipeline } = await import("@huggingface/transformers");

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = join(frontend, "public", "models") + "/";
env.useBrowserCache = false;

const modelId = "onnx-community/whisper-base";

try {
  const transcriber = await pipeline("automatic-speech-recognition", modelId, { dtype: "q8" });
  const silence = new Float32Array(16000 * 2);
  const output = await transcriber(silence, { language: "bn" });
  console.log(`[speech] PASS the local model loaded and ran (text: ${JSON.stringify(output?.text ?? "")})`);
  await transcriber.dispose?.();
} catch (error) {
  console.error("[speech] FAIL the local model could not be loaded:", error?.message ?? error);
  console.error("[speech] hint: run `npm run fetch-models` before this check");
  process.exitCode = 1;
}
