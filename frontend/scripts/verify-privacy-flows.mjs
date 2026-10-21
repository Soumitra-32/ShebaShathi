/**
 * Headless verification that the sensitive workflows do not transmit user data.
 *
 * It drives the real application in headless Chrome over the DevTools protocol
 * and records every network request the page makes. The script then asserts
 * that no request body or URL contains the synthetic values it typed, that the
 * browser storage stays empty of them, and that the pages still work.
 *
 * Usage:
 *   node scripts/verify-privacy-flows.mjs [baseUrl] [fixtureFolder]
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] || "http://localhost:3000";
const fixtureFolder = process.argv[3] || join(here, "..", "..", ".tmp-test", "fixtures");

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const SECRET_TEXT = "SYNTHETIC-PRIVATE-DETAIL-9f3a";
const SECRET_AMOUNT = "987654";

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
  console.log(`[privacy] FAIL ${message}`);
}

function pass(message) {
  console.log(`[privacy] PASS ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findChrome() {
  const { existsSync } = await import("node:fs");
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("No Chrome or Edge binary was found.");
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout for ${method}`));
        }
      }, 120000);
    });
  }

  on(listener) {
    this.listeners.push(listener);
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

async function openPage(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  const target = await response.json();
  return { target, session: await connect(target.webSocketDebuggerUrl) };
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Evaluation failed: ${details}`);
  }
  return result.result?.value;
}

async function waitForText(session, text, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(
      session,
      `document.body ? document.body.innerText.includes(${JSON.stringify(text)}) : false`
    );
    if (found) return true;
    await sleep(400);
  }
  return false;
}

/** Wait until React has hydrated the element, so synthetic events are handled. */
async function waitForHydration(session, selector, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await evaluate(
      session,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        return Object.keys(element).some((key) => key.startsWith('__react'));
      })()`
    );
    if (ready) return true;
    await sleep(300);
  }
  return false;
}

async function run() {
  const chrome = await findChrome();
  const userDataDir = await mkdtemp(join(tmpdir(), "sheba-privacy-"));
  const debugPort = 9333;
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const stop = async () => {
    chromeProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // Wait for the debugging endpoint.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const probe = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        if (probe.ok) break;
      } catch {
        // not ready yet
      }
      await sleep(500);
    }

    // ---- Flow A: complaint drafting -------------------------------------
    {
      const { session } = await openPage(debugPort, `${baseUrl}/grs`);
      const requests = [];
      const consoleErrors = [];
      session.on((message) => {
        if (message.method === "Network.requestWillBeSent") {
          requests.push({
            url: message.params.request.url,
            method: message.params.request.method,
            postData: message.params.request.postData || "",
          });
        }
        if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
          consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
        }
      });
      await session.send("Network.enable");
      await session.send("Runtime.enable");
      await session.send("Page.enable");
      await waitForText(session, "অভিযোগের খসড়া তৈরি করুন");
      if (!(await waitForHydration(session, "#complaint-description"))) {
        fail("the complaint page did not hydrate");
      }

      await evaluate(
        session,
        `(() => {
          const setValue = (element, value) => {
            const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
          };
          const date = document.querySelector('input[type="date"]');
          if (date) setValue(date, '2026-10-02');
          const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
          const location = textInputs[0];
          if (location) setValue(location, 'Synthetic Test Office');
          const area = document.querySelector('textarea');
          if (area) setValue(area, ${JSON.stringify(SECRET_TEXT)});
          const form = document.querySelector('form');
          form.querySelector('button[type="submit"]').click();
          return true;
        })()`
      );
      const drafted = await waitForText(session, "অভিযোগের খসড়া", 20000);
      const draftValue = await evaluate(
        session,
        `(() => { const area = document.querySelector('#draft-body'); return area ? area.value : ''; })()`
      );
      if (drafted && draftValue.includes(SECRET_TEXT)) {
        pass("complaint draft created from the typed description");
      } else {
        fail("complaint draft was not created from the typed description");
      }

      const leaked = requests.filter(
        (request) => request.postData.includes(SECRET_TEXT) || request.url.includes(SECRET_TEXT)
      );
      if (leaked.length === 0) pass(`complaint workflow sent ${requests.length} request(s), none with the complaint text`);
      else fail(`complaint text was transmitted in ${leaked.length} request(s)`);

      const stored = await evaluate(
        session,
        `JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) })`
      );
      if (!stored.includes(SECRET_TEXT)) pass("complaint text is not in localStorage or sessionStorage");
      else fail("complaint text was written to browser storage");

      if (consoleErrors.length === 0) pass("complaint workflow logged no console errors");
      else notes.push(`complaint workflow console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);

      // Missing-information detection: an empty description must trigger the
      // contextual follow-up questions instead of a draft.
      await evaluate(
        session,
        `(() => {
          const area = document.querySelector('#complaint-description');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(area, '');
          area.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('form button[type="submit"]').click();
          return true;
        })()`
      );
      const asked = await waitForText(session, "কী ঘটেছিল, বিস্তারিত লিখুন বা কণ্ঠে বলুন।", 15000);
      if (asked) pass("missing details trigger contextual follow-up questions");
      else fail("the follow-up questions did not appear for the missing description");
    }

    // ---- Flow B: document comparison ------------------------------------
    {
      const { session } = await openPage(debugPort, `${baseUrl}/identity-check`);
      const requests = [];
      const consoleErrors = [];
      session.on((message) => {
        if (message.method === "Network.requestWillBeSent") {
          requests.push({
            url: message.params.request.url,
            method: message.params.request.method,
            postData: message.params.request.postData || "",
          });
        }
        if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
          consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
        }
        if (message.method === "Runtime.exceptionThrown") {
          consoleErrors.push(message.params.exceptionDetails?.exception?.description || "exception");
        }
      });
      await session.send("Network.enable");
      await session.send("Runtime.enable");
      await session.send("DOM.enable");
      await waitForText(session, "তথ্য মিল যাচাই");
      if (!(await waitForHydration(session, "#identity-documents"))) {
        fail("the identity-check page did not hydrate");
      }

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(fixtureFolder);
      const image = files.find((name) => name.endsWith("-en.png"));
      if (!image) {
        notes.push("no PNG fixture found; the document upload flow was not exercised");
      } else {
        const { root } = await session.send("DOM.getDocument", { depth: -1 });
        const { nodeId } = await session.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "#identity-documents",
        });
        if (!nodeId) throw new Error("the file input was not found");
        await session.send("DOM.setFileInputFiles", {
          nodeId,
          files: [join(fixtureFolder, image)],
        });
        const extracted = await waitForText(session, "পড়া হয়েছে", 180000);
        if (extracted) pass("document was read locally and marked as read");
        else {
          fail("the document was not read within the time limit");
          const state = await evaluate(session, "document.body.innerText.slice(0, 1200)");
          notes.push(`document page state: ${String(state).replace(/\s+/g, " ").slice(0, 600)}`);
          notes.push(
            `document page requests: ${requests.map((r) => r.url.replace(baseUrl, "")).slice(0, 40).join(", ")}`
          );
          if (consoleErrors.length) {
            notes.push(`document page console errors: ${consoleErrors.slice(0, 3).join(" | ").slice(0, 500)}`);
          }
        }

        const leaked = requests.filter(
          (request) =>
            request.postData.includes("Rahim") ||
            request.url.toLowerCase().includes(".png") ||
            request.postData.includes("application/octet-stream")
        );
        if (leaked.length === 0) pass(`document workflow sent ${requests.length} request(s), none with the document`);
        else fail(`document content was transmitted in ${leaked.length} request(s)`);

        const stored = await evaluate(
          session,
          `JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) })`
        );
        if (!stored.includes("Rahim")) pass("extracted identity values are not in browser storage");
        else fail("extracted identity values were written to browser storage");
      }
    }

    // ---- Flow C: fee checker --------------------------------------------
    {
      const { session } = await openPage(debugPort, `${baseUrl}/redflag`);
      const requests = [];
      session.on((message) => {
        if (message.method === "Network.requestWillBeSent") {
          requests.push({
            url: message.params.request.url,
            method: message.params.request.method,
            postData: message.params.request.postData || "",
          });
        }
      });
      await session.send("Network.enable");
      await session.send("Runtime.enable");
      await waitForText(session, "ফি যাচাই করুন");
      if (!(await waitForHydration(session, "#claimed-amount"))) {
        fail("the fee checker did not hydrate");
      }
      await waitForText(session, "সরকারি মোট ফি", 30000);
      await evaluate(
        session,
        `(() => {
          const input = document.querySelector('#claimed-amount');
          if (!input) return false;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(SECRET_AMOUNT)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`
      );
      await sleep(1500);
      const leaked = requests.filter(
        (request) => request.postData.includes(SECRET_AMOUNT) || request.url.includes(SECRET_AMOUNT)
      );
      if (leaked.length === 0) pass(`fee workflow sent ${requests.length} request(s), none with the claimed amount`);
      else fail("the claimed amount was transmitted");

      const feeText = await evaluate(session, "document.body.innerText");
      if (feeText.includes("সরকারি মোট ফি") && feeText.includes("পার্থক্য")) {
        pass("the fee checker shows the official total and the difference");
      } else {
        fail("the fee checker did not show the official total and the difference");
      }
    }
  } finally {
    await stop();
  }

  if (notes.length) {
    console.log("\n[privacy] notes:");
    for (const note of notes) console.log(` - ${note}`);
  }
  if (failures.length) {
    console.error(`\n[privacy] ${failures.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("\n[privacy] all checks passed");
  }
}

run().catch((error) => {
  console.error("[privacy] error:", error);
  process.exitCode = 1;
});
