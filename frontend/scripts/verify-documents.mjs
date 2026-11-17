/**
 * Headless verification for the local document consistency check.
 *
 * It uploads synthetic text-layer PDFs, a scanned PDF and images through the
 * real Next.js page, then checks the same-document and cross-document results.
 * It also checks rejection paths, browser storage, network requests, the
 * self-hosted PDF worker and the 375px layout.
 *
 * Start the frontend on port 3000 first:
 *   npm run dev
 * Then:
 *   node scripts/verify-documents.mjs [baseUrl] [fixtureFolder]
 *
 * The fixtures contain fictional data only. The script never prints extracted
 * values; it prints only field names and statuses.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const baseUrl = process.argv[2] || "http://localhost:3000";
const fixtureFolder = process.argv[3] || join(process.cwd(), "..", ".tmp-test", "fixtures");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const passes = [];
const notes = [];

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      for (const listener of this.listeners) listener(message);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }
  on(listener) {
    this.listeners.push(listener);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout ${method}`));
        }
      }, 180000);
    });
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpSession(socket);
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(session, expression, label, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(session, expression)) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function check(name, condition, detail = "") {
  if (condition) {
    passes.push(name);
    console.log(`[documents] PASS ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`[documents] FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function hydration(session, selector) {
  return waitFor(
    session,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return !!el && Object.keys(el).some((key) => key.startsWith('__react'));
    })()`,
    `hydration of ${selector}`,
    60000
  );
}

async function navigate(session, path) {
  await session.send("Page.navigate", { url: `${baseUrl}${path}` });
  await sleep(500);
  await waitFor(
    session,
    "document.readyState === 'complete' || document.readyState === 'interactive'",
    `page load ${path}`
  );
}

async function ensureEnglish(session) {
  await waitFor(session, "!!document.querySelector('.nav-lang')", "language button");
  await sleep(750);
  if ((await evaluate(session, "document.documentElement.lang")) !== "en") {
    await evaluate(session, "document.querySelector('.nav-lang').click()");
  }
  await waitFor(session, "document.documentElement.lang === 'en'", "English language");
}

async function openPage(debugPort, path) {
  const target = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}${path}`)}`,
    { method: "PUT" }
  ).then((response) => response.json());
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Network.enable");
  await session.send("DOM.enable");
  return { session, target };
}

async function closeTarget(debugPort, target) {
  try {
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`);
  } catch {}
}

async function uploadFile(session, filePath) {
  const { root } = await session.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "#identity-documents",
  });
  if (!nodeId) throw new Error("the document file input was not found");
  await session.send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
}

async function documentCount(session) {
  return evaluate(session, "document.querySelectorAll('select[id^=\"doc-type-\"]').length");
}

async function uploadAndWait(session, filePath, expectedCount, timeoutMs = 180000) {
  await uploadFile(session, filePath);
  await waitFor(
    session,
    `document.querySelectorAll('select[id^="doc-type-"]').length >= ${expectedCount}`,
    `document ${expectedCount}`,
    timeoutMs
  );
  await waitFor(
    session,
    `document.querySelectorAll('input[id^="doc-reviewed-"]').length >= ${expectedCount}`,
    `read document ${expectedCount}`,
    timeoutMs
  );
}

async function setType(session, index, type) {
  await evaluate(
    session,
    `(() => {
      const select = document.querySelectorAll('select[id^="doc-type-"]')[${index}];
      if (!select) throw new Error('document type select missing');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, ${JSON.stringify(type)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`
  );
  await waitFor(
    session,
    `document.querySelectorAll('select[id^="doc-type-"]')[${index}]?.value === ${JSON.stringify(type)}`,
    `document type ${type}`
  );
}

async function setReviewed(session, index) {
  await evaluate(
    session,
    `(() => {
      const input = document.querySelectorAll('input[id^="doc-reviewed-"]')[${index}];
      if (!input) throw new Error('review checkbox missing');
      if (!input.checked) input.click();
      return input.checked;
    })()`
  );
  await waitFor(
    session,
    `document.querySelectorAll('input[id^="doc-reviewed-"]')[${index}]?.checked === true`,
    "reviewed document"
  );
}

async function statuses(session) {
  return evaluate(
    session,
    `(() => {
      return Array.from(document.querySelectorAll('tbody tr')).map((row) => {
        const cells = row.querySelectorAll('td');
        const statusCell = cells[cells.length - 1];
        return {
          field: row.querySelector('th')?.innerText?.trim() || "",
          status: statusCell?.querySelector('span')?.innerText?.trim() || "",
          reason: statusCell?.querySelector('p')?.innerText?.trim() || ""
        };
      });
    })()`
  );
}

function statusFor(rows, field) {
  return rows.find((row) => row.field.toLowerCase().includes(field.toLowerCase()));
}

async function setMode(session, mode) {
  await evaluate(
    session,
    `(() => {
      const button = Array.from(document.querySelectorAll('[role="radio"]')).find((item) =>
        item.innerText.includes(${JSON.stringify(mode === "same" ? "Same type" : "Different")})
      );
      if (!button) throw new Error('comparison mode button missing');
      button.click();
      return true;
    })()`
  );
  await waitFor(
    session,
    `Array.from(document.querySelectorAll('[role="radio"]')).some((item) =>
      item.getAttribute('aria-checked') === 'true' &&
      item.innerText.includes(${JSON.stringify(mode === "same" ? "Same type" : "Different")})
    )`,
    `${mode} comparison mode`
  );
}

async function openDocuments(session) {
  await navigate(session, "/identity-check");
  await hydration(session, "#identity-documents");
  await ensureEnglish(session);
}

async function run() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("No Chrome or Edge found");
  const files = await readdir(fixtureFolder);
  const required = [
    "identity-text.pdf",
    "nid-text.pdf",
    "passport-text.pdf",
    "passport-different.pdf",
    "ambiguous-date-a.pdf",
    "ambiguous-date-b.pdf",
    "missing-field.pdf",
    "scanned.pdf",
    "corrupt.pdf",
    "empty.pdf",
    "oversize.pdf",
    "renamed-pdf.png",
  ];
  const missing = required.filter((name) => !files.includes(name));
  if (missing.length) throw new Error(`missing fixtures: ${missing.join(", ")}`);

  const userDataDir = await mkdtemp(join(tmpdir(), "sheba-documents-"));
  const debugPort = 9356;
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        targets = await response.json();
        if (targets.length) break;
      } catch {}
      await sleep(250);
    }
    if (!targets?.length) throw new Error("Chrome debugging endpoint did not start");

    // ---- Same-document flow -------------------------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      const requests = [];
      const consoleErrors = [];
      const workerRequests = [];
      session.on((message) => {
        if (message.method === "Network.requestWillBeSent") {
          const request = message.params.request;
          requests.push({ url: request.url, method: request.method, postData: request.postData || "" });
          if (request.url.includes("pdf.worker")) workerRequests.push(request.url);
        }
        if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
          consoleErrors.push(message.params.args?.map((arg) => arg.value || "").join(" "));
        }
      });
      await openDocuments(session);
      await setMode(session, "same");

      await uploadAndWait(session, join(fixtureFolder, "identity-text.pdf"), 1);
      await setType(session, 0, "nid");
      await uploadAndWait(session, join(fixtureFolder, "nid-text.pdf"), 2);
      await setType(session, 1, "nid");

      let rows = await statuses(session);
      check("same-document name needs verification before review", statusFor(rows, "Full name")?.status === "Needs verification");
      check("same-document date needs verification before review", statusFor(rows, "Date of birth")?.status === "Needs verification");

      await setReviewed(session, 0);
      await setReviewed(session, 1);
      rows = await statuses(session);
      check("same-document name matches after review", statusFor(rows, "Full name")?.status === "Matches", statusFor(rows, "Full name")?.reason);
      check("same-document date matches after review", statusFor(rows, "Date of birth")?.status === "Matches", statusFor(rows, "Date of birth")?.reason);

      const stored = await evaluate(
        session,
        `JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) })`
      );
      check("extracted values are not in browser storage", !stored.includes("Rahim"));
      const leaked = requests.filter(
        (request) => request.postData.includes("Rahim") || request.url.includes("Rahim")
      );
      check("document content is not transmitted", leaked.length === 0, `${requests.length} request(s)`);
      check("PDF worker is self-hosted", workerRequests.length > 0 && workerRequests.every((url) => url.startsWith(baseUrl)), workerRequests.join(", "));
      check("document flow logs no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
      await closeTarget(debugPort, target);
    }

    // ---- Cross-document flow with a difference ------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      await openDocuments(session);
      await uploadAndWait(session, join(fixtureFolder, "nid-text.pdf"), 1);
      await setType(session, 0, "nid");
      await uploadAndWait(session, join(fixtureFolder, "passport-different.pdf"), 2);
      await setType(session, 1, "passport");
      await setReviewed(session, 0);
      await setReviewed(session, 1);
      const rows = await statuses(session);
      check("cross-document name matches", statusFor(rows, "Full name")?.status === "Matches", statusFor(rows, "Full name")?.reason);
      check("cross-document differing date is detected", statusFor(rows, "Date of birth")?.status === "Differs", statusFor(rows, "Date of birth")?.reason);
      check("cross-document parent name matches", statusFor(rows, "Father's name")?.status === "Matches", statusFor(rows, "Father's name")?.reason);
      await closeTarget(debugPort, target);
    }

    // ---- Ambiguous date and missing field -----------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      await openDocuments(session);
      await uploadAndWait(session, join(fixtureFolder, "ambiguous-date-a.pdf"), 1);
      await setType(session, 0, "birth");
      await uploadAndWait(session, join(fixtureFolder, "ambiguous-date-b.pdf"), 2);
      await setType(session, 1, "birth");
      await setReviewed(session, 0);
      await setReviewed(session, 1);
      let rows = await statuses(session);
      check("ambiguous date needs verification", statusFor(rows, "Date of birth")?.status === "Needs verification", statusFor(rows, "Date of birth")?.reason);

      await openDocuments(session);
      await uploadAndWait(session, join(fixtureFolder, "identity-text.pdf"), 1);
      await setType(session, 0, "birth");
      await uploadAndWait(session, join(fixtureFolder, "missing-field.pdf"), 2);
      await setType(session, 1, "birth");
      await setReviewed(session, 0);
      await setReviewed(session, 1);
      rows = await statuses(session);
      check("missing field is not treated as a match", statusFor(rows, "Mother's name")?.status === "Not available", statusFor(rows, "Mother's name")?.reason);
      await closeTarget(debugPort, target);
    }

    // ---- Scanned PDF / OCR path ---------------------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      await openDocuments(session);
      await uploadAndWait(session, join(fixtureFolder, "scanned.pdf"), 1, 240000);
      check("scanned PDF is read locally", (await documentCount(session)) === 1);
      const text = await evaluate(session, "document.body.innerText");
      check("scanned PDF shows the review control", /checked these values|Needs verification/i.test(text));
      await closeTarget(debugPort, target);
    }

    // ---- Rejection and malformed-file paths ---------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      await openDocuments(session);
      await uploadFile(session, join(fixtureFolder, "oversize.pdf"));
      await waitFor(session, "document.body.innerText.includes('too large')", "oversize rejection");
      check("oversized file is rejected", true);
      await uploadFile(session, join(fixtureFolder, "empty.pdf"));
      await waitFor(session, "document.body.innerText.includes('empty')", "empty rejection");
      check("empty file is rejected", true);
      await uploadFile(session, join(fixtureFolder, "renamed-pdf.png"));
      await waitFor(session, "document.body.innerText.includes('Only images and PDF')", "renamed rejection");
      check("renamed PDF with image MIME is rejected", true);
      await uploadFile(session, join(fixtureFolder, "corrupt.pdf"));
      await waitFor(session, "document.body.innerText.includes('could not be read')", "corrupt PDF error");
      check("corrupt PDF shows a safe error", true);
      await uploadFile(session, join(fixtureFolder, "identity-text.pdf"));
      await waitFor(
        session,
        "document.querySelectorAll('input[id^=\"doc-reviewed-\"]').length >= 1",
        "first valid document"
      );
      await uploadFile(session, join(fixtureFolder, "identity-text.pdf"));
      await waitFor(session, "document.body.innerText.includes('already been added')", "duplicate rejection");
      check("duplicate file is rejected", true);
      await closeTarget(debugPort, target);
    }

    // ---- Mobile layout ------------------------------------------------------
    {
      const { session, target } = await openPage(debugPort, "/identity-check");
      await openDocuments(session);
      await uploadAndWait(session, join(fixtureFolder, "identity-text.pdf"), 1);
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: true,
      });
      const overflow = await evaluate(
        session,
        "Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
      );
      check("document page has no horizontal overflow at 375px", overflow <= 1, `delta=${overflow}`);
      await closeTarget(debugPort, target);
    }
  } finally {
    chromeProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  if (notes.length) {
    console.log("\n[documents] notes:");
    for (const note of notes) console.log(`[documents] note: ${note}`);
  }
  if (failures.length) {
    console.error(`\n[documents] ${failures.length} failure(s):`);
    for (const failure of failures) console.error(`[documents] - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n[documents] all ${passes.length} checks passed`);
  }
}

run().catch((error) => {
  console.error("[documents] error:", error);
  process.exitCode = 1;
});
