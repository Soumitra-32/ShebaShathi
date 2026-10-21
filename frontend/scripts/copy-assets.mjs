/**
 * Copies the browser-side runtime assets that ship inside npm packages into
 * `public/`, so the app never has to load a script, worker or WebAssembly
 * binary from a third-party CDN.
 *
 * Runs automatically on `npm install` (postinstall).
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");
const modules = join(frontend, "node_modules");
const publicDir = join(frontend, "public");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyFileInto(source, targetDir, label) {
  if (!(await exists(source))) {
    console.warn(`[assets] skipped ${label}: ${source} not found`);
    return;
  }
  await mkdir(targetDir, { recursive: true });
  await cp(source, join(targetDir, source.split(/[\\/]/).pop()), { force: true });
  console.log(`[assets] ${label} -> ${targetDir}`);
}

async function copyDirContentsInto(source, targetDir, label) {
  if (!(await exists(source))) {
    console.warn(`[assets] skipped ${label}: ${source} not found`);
    return;
  }
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(source)) {
    await cp(join(source, entry), join(targetDir, entry), { recursive: true, force: true });
  }
  console.log(`[assets] ${label} -> ${targetDir}`);
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  // tesseract.js worker + WebAssembly core
  await copyFileInto(
    join(modules, "tesseract.js", "dist", "worker.min.js"),
    join(publicDir, "tesseract"),
    "tesseract worker"
  );
  await copyDirContentsInto(
    join(modules, "tesseract.js-core"),
    join(publicDir, "tesseract"),
    "tesseract core"
  );

  // pdf.js worker + character maps and standard fonts (needed for Bengali text)
  await copyFileInto(
    join(modules, "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    join(publicDir, "pdf"),
    "pdf.js worker"
  );
  await copyDirContentsInto(
    join(modules, "pdfjs-dist", "cmaps"),
    join(publicDir, "pdf", "cmaps"),
    "pdf.js cmaps"
  );
  await copyDirContentsInto(
    join(modules, "pdfjs-dist", "standard_fonts"),
    join(publicDir, "pdf", "standard_fonts"),
    "pdf.js standard fonts"
  );

  // onnxruntime-web WebAssembly binaries (local speech recognition)
  const ortSource = join(modules, "onnxruntime-web", "dist");
  if (await exists(ortSource)) {
    const ortFiles = (await readdir(ortSource)).filter((name) => name.startsWith("ort-wasm"));
    await mkdir(join(publicDir, "ort"), { recursive: true });
    for (const file of ortFiles) {
      await cp(join(ortSource, file), join(publicDir, "ort", file), { force: true });
    }
    console.log(`[assets] onnxruntime wasm (${ortFiles.length} files) -> ${join(publicDir, "ort")}`);
  } else {
    console.warn(`[assets] skipped onnxruntime wasm: ${ortSource} not found`);
  }

  console.log("[assets] done");
}

main().catch((error) => {
  console.error("[assets] failed:", error?.message ?? error);
  process.exitCode = 1;
});
