/**
 * Verifies the local OCR and PDF text-extraction stack outside the browser.
 *
 * It uses the same Tesseract build and the same language data that the app
 * serves from `public/`, and the same pdf.js library, so a failure here means
 * the shipped assets or the extraction logic are broken.
 *
 * Usage:
 *   node scripts/verify-local-processing.mjs [fixtureFolder]
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, OEM } from "tesseract.js";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");
const fixtures = process.argv[2] || join(frontend, "..", ".tmp-test", "fixtures");
const tessdata = join(frontend, "public", "tessdata");

async function ocr(file) {
  const worker = await createWorker("ben+eng", OEM.LSTM_ONLY, {
    langPath: tessdata,
    corePath: join(frontend, "node_modules", "tesseract.js-core"),
    cacheMethod: "none",
    gzip: true,
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function pdfText(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = new Uint8Array(await readFile(file));
  const document_ = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const parts = [];
  for (let page = 1; page <= document_.numPages; page += 1) {
    const pdfPage = await document_.getPage(page);
    const content = await pdfPage.getTextContent();
    parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await document_.destroy();
  return parts.join("\n");
}

const failures = [];

function expectText(label, text, needles) {
  const missing = needles.filter((needle) => !text.toLowerCase().includes(needle.toLowerCase()));
  if (missing.length) {
    failures.push(`${label}: missing ${missing.join(", ")} in:\n${text.slice(0, 400)}`);
    console.log(`[verify] FAIL ${label}`);
  } else {
    console.log(`[verify] PASS ${label}`);
  }
}

async function main() {
  const files = await readdir(fixtures);

  const enImage = files.find((name) => name.endsWith("-en.png"));
  if (enImage) {
    const text = await ocr(join(fixtures, enImage));
    expectText("ocr english image", text, ["Rahim", "Karim", "Salma"]);
  }

  const bnImage = files.find((name) => name.endsWith("-bn.png"));
  if (bnImage) {
    const text = await ocr(join(fixtures, bnImage));
    // Bengali OCR is not expected to be perfect; check that Bengali script came back.
    const hasBengali = /[\u0980-\u09FF]/.test(text);
    if (!hasBengali) failures.push(`ocr bengali image: no bengali characters in:\n${text.slice(0, 400)}`);
    console.log(hasBengali ? "[verify] PASS ocr bengali image" : "[verify] FAIL ocr bengali image");
  }

  const pdf = files.find((name) => name.endsWith(".pdf"));
  if (pdf) {
    const text = await pdfText(join(fixtures, pdf));
    expectText("pdf text layer", text, ["Rahim Uddin", "12/03/1990", "Salma Begum"]);
  }

  if (failures.length) {
    console.error("\n[verify] failures:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("[verify] all local-processing checks passed");
  }
}

main().catch((error) => {
  console.error("[verify] error:", error);
  process.exitCode = 1;
});
