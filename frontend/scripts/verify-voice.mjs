/**
 * End-to-end verification for the local voice-to-text flow.
 *
 * The browser is launched with a fake microphone and a synthetic WAV so the
 * real MediaRecorder -> WebAudio -> Whisper WASM path runs without a physical
 * microphone. It checks the transcript, the "Add to the description" action,
 * the permission-denied and missing-model paths, browser storage and network
 * destinations.
 *
 * Start the frontend on port 3000 first, generate the voice fixture with
 * `scripts/make_voice_fixtures.ps1`, then:
 *   node scripts/verify-voice.mjs [baseUrl] [fixtureFolder]
 *
 * The synthetic phrase contains no personal data.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
const fixtureFolder = resolve(process.argv[3] || join(process.cwd(), "..", ".tmp-test", "fixtures"));
const voiceFile = join(fixtureFolder, "voice-en.wav");
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
      }, 300000);
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

async function waitFor(session, expression, label, timeoutMs = 120000) {
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
    console.log(`[voice] PASS ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`[voice] FAIL ${name}${detail ? ` (${detail})` : ""}`);
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

async function setLanguage(session, language) {
  await waitFor(session, "!!document.querySelector('.nav-lang')", "language button");
  await sleep(750);
  if ((await evaluate(session, "document.documentElement.lang")) !== language) {
    await evaluate(session, "document.querySelector('.nav-lang').click()");
  }
  await waitFor(
    session,
    `document.documentElement.lang === ${JSON.stringify(language)}`,
    `${language} language`
  );
}

async function openPage(debugPort) {
  const target = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/grs`)}`,
    { method: "PUT" }
  ).then((response) => response.json());
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Network.enable");
  await session.send("Log.enable");
  return { session, target };
}

async function closeTarget(debugPort, target) {
  try {
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`);
  } catch {}
}

async function openComplaintPage(session) {
  await navigate(session, "/grs");
  await hydration(session, "#complaint-description");
  await setLanguage(session, "en");
  await waitFor(session, "!!document.querySelector('button[aria-pressed]')", "microphone button");
}

async function startRecording(session) {
  await evaluate(session, "document.querySelector('button[aria-pressed]').click()");
  await waitFor(
    session,
    `document.querySelector('button[aria-pressed="true"]') !== null`,
    "recording state",
    60000
  );
  await sleep(3500);
}

async function stopRecording(session) {
  await evaluate(session, "document.querySelector('button[aria-pressed]').click()");
  try {
    await waitFor(
      session,
      `(() => {
        const area = document.querySelector('textarea:not(#complaint-description)');
        if (area && area.value.trim().length > 0) return true;
        return /could not be transcribed|No speech|no speech/i.test(document.body.innerText);
      })()`,
      "local transcript or speech error",
      300000
    );
  } catch (error) {
    const state = await evaluate(
      session,
      `(() => ({
        text: document.body.innerText.slice(-1200),
        pressed: document.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed'),
        errors: window.__voiceConsoleErrors || [],
        networkErrors: window.__voiceNetworkErrors || [],
        requests: (window.__voiceRequests || []).filter((url) => /models|ort|wasm/.test(url))
      }))()`
    );
    throw new Error(`${error.message}; state=${JSON.stringify(state)}`);
  }
  const transcript = await evaluate(
    session,
    "document.querySelector('textarea:not(#complaint-description)')?.value?.trim() || ''"
  );
  if (!transcript) {
    const state = await evaluate(
      session,
      `(() => ({
        text: document.body.innerText.slice(-1200),
        errors: window.__voiceConsoleErrors || [],
        networkErrors: window.__voiceNetworkErrors || [],
        requests: (window.__voiceRequests || []).filter((url) => /models|ort|wasm/.test(url))
      }))()`
    );
    throw new Error(`speech failed; state=${JSON.stringify(state)}`);
  }
  return transcript;
}

async function run() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("No Chrome or Edge found");
  if (!existsSync(voiceFile)) {
    throw new Error(
      `missing voice fixture ${voiceFile}; run scripts/make_voice_fixtures.ps1`
    );
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "sheba-voice-"));
  const debugPort = 9361;
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${voiceFile}`,
      "--autoplay-policy=no-user-gesture-required",
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

    // ---- Successful local transcription ------------------------------------
    {
      const { session, target } = await openPage(debugPort);
      const requests = [];
      const consoleErrors = [];
      session.on((message) => {
        if (message.method === "Network.requestWillBeSent") {
          const url = message.params.request.url;
          requests.push(url);
          void evaluate(
            session,
            `(window.__voiceRequests ||= []).push(${JSON.stringify(url)})`
          ).catch(() => {});
          const postData = message.params.request.postData;
          if (postData) {
            void evaluate(
              session,
              `(window.__voiceRequestBodies ||= []).push(${JSON.stringify(postData)})`
            ).catch(() => {});
          }
        }
        if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
          const text = message.params.args?.map((arg) => arg.value || arg.description || "").join(" ");
          consoleErrors.push(text);
          void evaluate(
            session,
            `(window.__voiceConsoleErrors ||= []).push(${JSON.stringify(text)})`
          ).catch(() => {});
        }
        if (message.method === "Runtime.exceptionThrown") {
          const text = message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || "";
          consoleErrors.push(text);
          void evaluate(
            session,
            `(window.__voiceConsoleErrors ||= []).push(${JSON.stringify(text)})`
          ).catch(() => {});
        }
        if (message.method === "Network.responseReceived") {
          const response = message.params.response;
          if (response.status >= 400) {
            const text = `${response.status} ${response.url}`;
            void evaluate(
              session,
              `(window.__voiceNetworkErrors ||= []).push(${JSON.stringify(text)})`
            ).catch(() => {});
          }
        }
        if (message.method === "Network.loadingFailed") {
          const text = `${message.params.errorText} ${message.params.blockedReason || ""}`.trim();
          void evaluate(
            session,
            `(window.__voiceNetworkErrors ||= []).push(${JSON.stringify(text)})`
          ).catch(() => {});
        }
        if (message.method === "Log.entryAdded") {
          const text = message.params.entry?.text || "";
          void evaluate(
            session,
            `(window.__voiceConsoleErrors ||= []).push(${JSON.stringify(text)})`
          ).catch(() => {});
        }
      });
      await openComplaintPage(session);

      await startRecording(session);
      const transcript = await stopRecording(session);
      check("microphone recording reaches a non-empty local transcript", transcript.length > 0, `${transcript.length} characters`);
      check(
        "English transcript looks like the synthetic complaint",
        /fee|passport|office|complaint|delay/i.test(transcript),
        "keyword check only"
      );

      await evaluate(
        session,
        `(() => {
          const button = Array.from(document.querySelectorAll('button')).find((item) =>
            item.innerText.includes('Add to the description')
          );
          if (!button) throw new Error('add transcript button missing');
          button.click();
          return true;
        })()`
      );
      const description = await evaluate(session, "document.querySelector('#complaint-description').value");
      check("transcript can be added to the complaint description", description.trim().length > 0);

      const external = requests.filter((url) => {
        if (!/^https?:/i.test(url)) return false;
        try {
          const parsed = new URL(url);
          if (parsed.origin === new URL(baseUrl).origin) return false;
          // The shared layout checks the local backend health endpoint. It
          // carries no document or audio content.
          if (parsed.pathname === "/health") return false;
          return true;
        } catch {
          return true;
        }
      });
      check("voice flow makes no third-party HTTP requests", external.length === 0, external.slice(0, 3).join(", "));
      const requestBodies = await evaluate(session, "window.__voiceRequestBodies || []");
      check("voice flow sends no request body", requestBodies.length === 0, `${requestBodies.length} body/bodies`);
      check(
        "voice model and runtime are served locally",
        requests.some((url) => url.includes("/models/onnx-community/whisper-base/")) &&
          requests.some((url) => url.includes("/ort/")),
        "local model/runtime requests observed"
      );

      const stored = await evaluate(
        session,
        `JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) })`
      );
      check("voice audio and transcript are not in browser storage", !stored.includes(transcript.slice(0, 12)));
      check("voice flow logs no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
      await closeTarget(debugPort, target);
    }

    // ---- Bangla language path ----------------------------------------------
    {
      const { session, target } = await openPage(debugPort);
      await openComplaintPage(session);
      await setLanguage(session, "bn");
      await startRecording(session);
      const transcript = await stopRecording(session);
      check("Bangla voice path returns text without crashing", transcript.length > 0, `${transcript.length} characters; accuracy not asserted`);
      await closeTarget(debugPort, target);
    }

    // ---- Permission denied -------------------------------------------------
    {
      const { session, target } = await openPage(debugPort);
      await openComplaintPage(session);
      await evaluate(
        session,
        `(() => {
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException('Permission denied', 'NotAllowedError');
          };
          window.__restoreGetUserMedia = () => { navigator.mediaDevices.getUserMedia = original; };
          return true;
        })()`
      );
      await evaluate(session, "document.querySelector('button[aria-pressed]').click()");
      await waitFor(
        session,
        "document.body.innerText.includes('Microphone permission was denied')",
        "permission denied message"
      );
      check("microphone permission denial is explained", true);
      await closeTarget(debugPort, target);
    }

    // ---- Missing model -----------------------------------------------------
    {
      const { session, target } = await openPage(debugPort);
      await openComplaintPage(session);
      await session.send("Network.setBlockedURLs", { urls: ["*models/onnx-community/whisper-base*"] });
      await evaluate(session, "document.querySelector('button[aria-pressed]').click()");
      await waitFor(
        session,
        "document.body.innerText.includes('voice model files are not part of this deployment')",
        "missing model message"
      );
      check("missing local voice model is explained", true);
      await closeTarget(debugPort, target);
    }
  } finally {
    chromeProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  if (notes.length) {
    console.log("\n[voice] notes:");
    for (const note of notes) console.log(`[voice] note: ${note}`);
  }
  if (failures.length) {
    console.error(`\n[voice] ${failures.length} failure(s):`);
    for (const failure of failures) console.error(`[voice] - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n[voice] all ${passes.length} checks passed`);
  }
}

run().catch((error) => {
  console.error("[voice] error:", error);
  process.exitCode = 1;
});
