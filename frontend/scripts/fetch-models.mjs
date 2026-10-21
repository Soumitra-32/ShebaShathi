/**
 * Downloads the local OCR and speech-recognition model files into `public/`.
 *
 * These files are served by this project itself; the browser never contacts a
 * third-party model host. The download happens once, at setup time, and is
 * optional: without it the app explains that the local model is missing and
 * keeps the manual input paths working.
 *
 * Usage: npm run fetch-models            (default: whisper-base + tesseract data)
 *        npm run fetch-models -- --model whisper-tiny
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");
const publicDir = join(frontend, "public");

const TESSDATA_BASE = "https://tessdata.projectnaptha.com/4.0.0_fast";
const HUGGINGFACE_BASE = "https://huggingface.co";

const MODELS = {
  "whisper-tiny": {
    repo: "onnx-community/whisper-tiny",
    files: [
      "config.json",
      "generation_config.json",
      "preprocessor_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
  "whisper-base": {
    repo: "onnx-community/whisper-base",
    files: [
      "config.json",
      "generation_config.json",
      "preprocessor_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
};

function parseModel() {
  const index = process.argv.indexOf("--model");
  if (index === -1) return "whisper-base";
  const value = process.argv[index + 1];
  if (!value || !MODELS[value]) {
    console.error(`Unknown model. Choose one of: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }
  return value;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return buffer.length;
}

async function main() {
  const modelKey = parseModel();
  const model = MODELS[modelKey];

  console.log(`[models] Tesseract language data (ben, eng) -> ${join(publicDir, "tessdata")}`);
  for (const language of ["ben", "eng"]) {
    const target = join(publicDir, "tessdata", `${language}.traineddata.gz`);
    if (await exists(target)) {
      console.log(`[models]   ${language}.traineddata.gz already present`);
      continue;
    }
    const size = await download(`${TESSDATA_BASE}/${language}.traineddata.gz`, target);
    console.log(`[models]   ${language}.traineddata.gz (${(size / 1024).toFixed(0)} KB)`);
  }

  console.log(`[models] ${model.repo} (${modelKey}) -> ${join(publicDir, "models", model.repo)}`);
  for (const file of model.files) {
    const target = join(publicDir, "models", model.repo, file);
    if (await exists(target)) {
      console.log(`[models]   ${file} already present`);
      continue;
    }
    const size = await download(`${HUGGINGFACE_BASE}/${model.repo}/resolve/main/${file}`, target);
    console.log(`[models]   ${file} (${(size / (1024 * 1024)).toFixed(1)} MB)`);
  }

  console.log("[models] done. The app now serves every model from its own origin.");
}

main().catch((error) => {
  console.error("[models] failed:", error?.message ?? error);
  process.exitCode = 1;
});
