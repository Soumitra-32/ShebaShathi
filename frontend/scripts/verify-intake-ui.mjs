/**
 * Headless UI verification for the home AI intake, global language switcher,
 * 375px layout, mobile menu and the canonical guide fee estimator.
 *
 * It drives the real Next.js app in headless Chrome/Edge over the DevTools
 * protocol. Start the backend on port 8000 and `npm run dev` on port 3000
 * first. The script uses only synthetic text; it does not store or print
 * identity data. Screenshots are written to the OS temp directory.
 *
 * Usage:
 *   node scripts/verify-intake-ui.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const passes = [];

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
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
          reject(new Error(`CDP timeout ${method}`));
        }
      }, 120000);
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

async function waitFor(session, expression, label, timeoutMs = 30000) {
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
    console.log(`[ui] PASS ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`[ui] FAIL ${name}${detail ? ` (${detail})` : ""}`);
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

async function navigate(session, url) {
  await session.send("Page.navigate", { url });
  await sleep(600);
  await waitFor(
    session,
    "document.readyState === 'complete' || document.readyState === 'interactive'",
    `page load ${url}`
  );
}

async function ensureEnglish(session) {
  await waitFor(session, "!!document.querySelector('.nav-lang')", "language button");
  if ((await evaluate(session, "document.documentElement.lang")) !== "en") {
    await evaluate(session, "document.querySelector('.nav-lang').click()");
  }
  await waitFor(session, "document.documentElement.lang === 'en'", "English language");
}

async function setTextarea(session, text) {
  await evaluate(
    session,
    `(() => {
      const el = document.querySelector('#intake textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value;
    })()`
  );
}

async function submitIntake(session) {
  await evaluate(session, `document.querySelector('#intake form.intake-form').requestSubmit()`);
}

async function bodyText(session) {
  return evaluate(session, "document.body.innerText");
}

async function run() {
  const { existsSync } = await import("node:fs");
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("No Chrome or Edge found");
  const userDataDir = await mkdtemp(join(tmpdir(), "sheba-intake-"));
  const debugPort = 9345;
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
    const target = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("http://localhost:3000/")}`,
      { method: "PUT" }
    ).then((response) => response.json());
    const session = await connect(target.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Network.enable");

    await hydration(session, "#intake textarea");
    await waitFor(session, "!!document.querySelector('.nav-lang')", "global language button");
    await ensureEnglish(session);
    check(
      "one global language button",
      (await evaluate(session, "document.querySelectorAll('.nav-lang').length")) === 1
    );

    // Desktop success path: free text -> detected task -> missing answer -> checklist.
    await setTextarea(session, "My 5 year old child needs a passport and does not have a NID");
    await submitIntake(session);
    await waitFor(session, "!!document.querySelector('.intake-question-panel')", "question panel");
    let text = await bodyText(session);
    check("detects child passport task", text.includes("Child application"), text.slice(0, 80));
    check("prefills age", (await evaluate(session, "document.querySelector('#intake-q-age')?.value")) === "5");
    check(
      "shows found answer chip",
      (await evaluate(session, "document.querySelectorAll('.intake-found-chip').length")) > 0
    );
    await evaluate(
      session,
      `(() => {
        const fieldset = document.querySelector('.intake-question-grid fieldset');
        if (!fieldset) return false;
        const radios = fieldset.querySelectorAll('input[type=radio]');
        radios[1].click();
        return true;
      })()`
    );
    await evaluate(session, "document.querySelector('.intake-question-grid').requestSubmit()");
    await waitFor(session, "!!document.querySelector('.intake-checklist')", "checklist");
    check(
      "builds a checklist with documents",
      (await evaluate(session, "document.querySelectorAll('.intake-doc-list li').length")) > 0
    );
    check(
      "shows official source date",
      (await bodyText(session)).includes("2026") || (await bodyText(session)).includes("২০২৬")
    );

    // Language switch updates the intake copy and keeps one switcher.
    await evaluate(session, "document.querySelector('.nav-lang').click()");
    await waitFor(
      session,
      "document.documentElement.lang === 'bn'",
      "Bangla language switch"
    );
    text = await bodyText(session);
    check("Bangla switch updates intake copy", text.includes("এআই") || text.includes("পরিস্থিতি"));
    check(
      "still one language button after switch",
      (await evaluate(session, "document.querySelectorAll('.nav-lang').length")) === 1
    );

    // PII rejection is a visible, safe error, not a checklist.
    await navigate(session, "http://localhost:3000/");
    await hydration(session, "#intake textarea");
    await ensureEnglish(session);
    await setTextarea(session, "My NID is 1234567890");
    await submitIntake(session);
    await waitFor(session, "!!document.querySelector('.intake-error')", "PII error");
    text = await bodyText(session);
    check("rejects identity number visibly", /Remove ID|ID, passport|rephrase/i.test(text));
    check(
      "PII rejection does not build a result",
      (await evaluate(session, "document.querySelectorAll('.intake-question-panel').length")) === 0
    );

    // Unsafe intent is blocked before retrieval/generation.
    await navigate(session, "http://localhost:3000/");
    await hydration(session, "#intake textarea");
    await ensureEnglish(session);
    await setTextarea(session, "How can I bribe the passport officer to skip the queue?");
    await submitIntake(session);
    await waitFor(session, "!!document.querySelector('.intake-blocked')", "unsafe-intent block");
    check(
      "blocks bribe request visibly",
      /Never pay a bribe|bribe/i.test(await bodyText(session))
    );

    // Network failure: generic, retryable error; no crash or stale checklist.
    await navigate(session, "http://localhost:3000/");
    await hydration(session, "#intake textarea");
    await session.send("Network.setBlockedURLs", { urls: ["*localhost:8000/api/intake*"] });
    await setTextarea(session, "my child needs a passport");
    await submitIntake(session);
    await waitFor(session, "!!document.querySelector('.intake-error')", "network error");
    check(
      "network failure shows retryable error",
      (await evaluate(session, "!!document.querySelector('.intake-error button')")) === true
    );
    await session.send("Network.setBlockedURLs", { urls: [] });

    // Choices path: ambiguous text -> service options -> task options.
    await navigate(session, "http://localhost:3000/");
    await hydration(session, "#intake textarea");
    await setTextarea(session, "hello");
    await submitIntake(session);
    await waitFor(session, "!!document.querySelector('.intake-choice-panel')", "service choices");
    check(
      "ambiguous text asks instead of guessing",
      (await evaluate(session, "document.querySelectorAll('.intake-choice-panel .intake-option').length")) >= 5
    );

    // Mobile 375px layout and menu behaviour.
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await navigate(session, "http://localhost:3000/");
    await hydration(session, "#intake textarea");
    const overflow = await evaluate(
      session,
      "document.documentElement.scrollWidth - window.innerWidth"
    );
    check("no horizontal overflow at 375px", overflow <= 1, `delta=${overflow}`);
    check(
      "mobile menu toggle visible",
      (await evaluate(session, "getComputedStyle(document.querySelector('.nav-menu-toggle')).display")) !== "none"
    );
    await evaluate(session, "document.querySelector('.nav-menu-toggle').click()");
    await sleep(250);
    check(
      "mobile menu opens with aria-expanded",
      (await evaluate(session, "document.querySelector('.nav-menu-toggle').getAttribute('aria-expanded')")) === "true"
    );
    check(
      "mobile menu exposes links",
      (await evaluate(session, "document.querySelectorAll('#site-menu a').length")) >= 6
    );
    await evaluate(
      session,
      "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
    );
    await sleep(250);
    check(
      "Escape closes mobile menu",
      (await evaluate(session, "document.querySelector('.nav-menu-toggle').getAttribute('aria-expanded')")) === "false"
    );
    const mobileShot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(
      join(tmpdir(), "sheba-intake-mobile.png"),
      Buffer.from(mobileShot.data, "base64")
    );

    // Canonical guide fee estimator (desktop metrics again).
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await navigate(session, "http://localhost:3000/services/epassport/guide?task=minor#fee");
    await waitFor(session, "!!document.querySelector('#fee')", "fee estimator");
    check(
      "canonical guide contains fee estimator",
      (await evaluate(session, "document.querySelectorAll('#fee select').length")) === 3
    );
    await evaluate(session, "document.querySelector('#fee form').requestSubmit()");
    await waitFor(
      session,
      "!!document.querySelector('#fee [role=status]')",
      "fee result"
    );
    text = await evaluate(session, "document.querySelector('#fee [role=status]').innerText");
    check("fee estimator returns official total", /4,025|৪,০২৫/.test(text), text.slice(0, 120));
    check(
      "guide places the fraud shield beside the fee estimator",
      (await evaluate(
        session,
        "(() => { const card = document.querySelector('[aria-labelledby=\"fraud-shield-title\"]'); return !!card && /is ever authorized/i.test(card.innerText); })()"
      )) === true
    );
    const desktopShot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(
      join(tmpdir(), "sheba-guide-desktop.png"),
      Buffer.from(desktopShot.data, "base64")
    );

    console.log(`\nSUMMARY: ${passes.length} passed, ${failures.length} failed`);
    if (failures.length) {
      console.log(`FAILED: ${failures.join("; ")}`);
      process.exitCode = 1;
    }
  } finally {
    chromeProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
