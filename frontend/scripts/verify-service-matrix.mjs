/**
 * Browser matrix for every enabled service task.
 *
 * The script reads the public catalog from the local backend, opens the real
 * service guide for every task in English and Bangla, fills every required
 * question, submits the form, and checks that a deterministic checklist is
 * rendered without an error. It also checks the 375px layout for one task per
 * service.
 *
 * Start the backend on port 8000 and the frontend on port 3000 first:
 *   uvicorn app.main:app --app-dir backend --port 8000
 *   cd frontend && npm run dev
 *   node scripts/verify-service-matrix.mjs [siteUrl] [apiUrl]
 *
 * It uses only public catalog data and sends no personal information.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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

const siteUrl = process.argv[2] || "http://localhost:3000";
const apiUrl = process.argv[3] || "http://localhost:8000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const passes = [];

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

async function waitFor(session, expression, label, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(session, expression)) return true;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function check(name, condition, detail = "") {
  if (condition) {
    passes.push(name);
    console.log(`[services] PASS ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`[services] FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function navigate(session, path) {
  await session.send("Page.navigate", { url: `${siteUrl}${path}` });
  await sleep(300);
  await waitFor(
    session,
    "document.readyState === 'complete' || document.readyState === 'interactive'",
    `load ${path}`
  );
}

async function ensureLanguage(session, language) {
  await waitFor(session, "!!document.querySelector('.nav-lang')", "language button");
  await sleep(1500);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await evaluate(session, "document.documentElement.lang")) === language) return;
    await evaluate(session, "document.querySelector('.nav-lang').click()");
    await sleep(1000);
  }
  await waitFor(
    session,
    `document.documentElement.lang === ${JSON.stringify(language)}`,
    `${language} language`
  );
}

function defaultValue(question) {
  if (question.type === "number") return String(question.min ?? 0);
  if (question.type === "select") return question.options[0]?.value ?? "";
  return true;
}

async function setQuestion(session, question, value) {
  const field = JSON.stringify(question.field);
  if (question.type === "boolean") {
    await evaluate(
      session,
      `(() => {
        const input = document.querySelector('#q-' + ${field});
        if (!input) throw new Error('missing boolean field ' + ${field});
        if (!input.checked) input.click();
        return input.checked;
      })()`
    );
    await waitFor(
      session,
      `document.querySelector('#q-' + ${field})?.checked === true`,
      `boolean ${question.field}`
    );
    return;
  }
  if (question.type === "select") {
    await evaluate(
      session,
      `(() => {
        const select = document.querySelector('#q-' + ${field});
        if (!select) throw new Error('missing select field ' + ${field});
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return select.value;
      })()`
    );
    await waitFor(
      session,
      `document.querySelector('#q-' + ${field})?.value === ${JSON.stringify(value)}`,
      `select ${question.field}`
    );
    return;
  }
  await evaluate(
    session,
    `(() => {
      const input = document.querySelector('#q-' + ${field});
      if (!input) throw new Error('missing number field ' + ${field});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.value;
    })()`
  );
  await waitFor(
    session,
    `document.querySelector('#q-' + ${field})?.value === ${JSON.stringify(value)}`,
    `number ${question.field}`
  );
}

async function selectTask(session, taskId) {
  await waitFor(
    session,
    `!!document.querySelector('#task-select') && document.querySelector('#task-select').value === ${JSON.stringify(taskId)}`,
    `task ${taskId}`
  );
}

async function submitTask(session) {
  await evaluate(
    session,
    `(() => {
      const form = document.querySelector('form');
      if (!form) throw new Error('service form missing');
      form.requestSubmit();
      return true;
    })()`
  );
  await waitFor(
    session,
    `document.querySelector('input[id^="phase-"], p[role="alert"]') !== null`,
    "checklist result or error",
    60000
  );
  const state = await evaluate(
    session,
    `(() => ({
      phases: document.querySelectorAll('input[id^="phase-"]').length,
      docs: document.querySelectorAll('input[id^="doc-"]').length,
      alert: document.querySelector('p[role="alert"]')?.innerText?.trim() || "",
      text: document.body.innerText.slice(-600)
    }))()`
  );
  return state;
}

async function run() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("No Chrome or Edge found");

  let catalog;
  try {
    const response = await fetch(`${apiUrl}/api/services`);
    if (!response.ok) throw new Error(`catalog returned ${response.status}`);
    catalog = await response.json();
  } catch (error) {
    throw new Error(`could not read ${apiUrl}/api/services: ${error.message}`);
  }
  const tasks = [];
  for (const service of catalog.services) {
    const detail = await fetch(`${apiUrl}/api/services/${service.service_id}`).then((response) => response.json());
    for (const task of detail.tasks) tasks.push({ service, task });
  }
  check("catalog exposes every expected task", tasks.length === 24, `${tasks.length} tasks`);

  const userDataDir = await mkdtemp(join(tmpdir(), "sheba-services-"));
  const debugPort = 9366;
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
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${siteUrl}/services`)}`,
      { method: "PUT" }
    ).then((response) => response.json());
    const session = await connect(target.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");

    for (const language of ["en", "bn"]) {
      await navigate(session, "/services");
      await ensureLanguage(session, language);
      let languagePasses = 0;
      for (const { service, task } of tasks) {
        const label = `${language}:${service.service_id}/${task.id}`;
        try {
          await navigate(
            session,
            `/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`
          );
          await selectTask(session, task.id);
          for (const question of task.questions) {
            if (!question.required) continue;
            await setQuestion(session, question, defaultValue(question));
          }
          const result = await submitTask(session);
          if (result.alert) {
            throw new Error(`UI alert: ${result.alert}`);
          }
          if (result.phases < 1) {
            throw new Error("no workflow steps rendered");
          }
          languagePasses += 1;
          passes.push(label);
        } catch (error) {
          failures.push(label);
          console.log(`[services] FAIL ${label}: ${error.message}`);
          await navigate(session, "/services");
        }
      }
      check(`${language} service matrix renders every task`, languagePasses === tasks.length, `${languagePasses}/${tasks.length}`);
    }

    // Mobile overflow on the first task of each service.
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    });
    for (const service of catalog.services) {
      const task = service.tasks[0];
      await navigate(
        session,
        `/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`
      );
      await selectTask(session, task.id);
      const overflow = await evaluate(
        session,
        "Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
      );
      check(`${service.service_id} guide has no horizontal overflow at 375px`, overflow <= 1, `delta=${overflow}`);
    }
  } finally {
    chromeProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  if (failures.length) {
    console.error(`\n[services] ${failures.length} failure(s):`);
    for (const failure of failures) console.error(`[services] - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n[services] all ${passes.length} checks passed`);
  }
}

run().catch((error) => {
  console.error("[services] error:", error);
  process.exitCode = 1;
});
