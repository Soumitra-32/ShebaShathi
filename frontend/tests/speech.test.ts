// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalSpeechRecorder,
  SpeechError,
  isSpeechModelInstalled,
  isSpeechSupported,
  transcribeLocally,
} from "../lib/local/speech";

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function setMediaDevices(getUserMedia: (() => Promise<MediaStream>) | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setMediaDevices(undefined);
  delete window.MediaRecorder;
});

describe("local speech support checks", () => {
  it("reports unsupported when the browser has no recorder", () => {
    setMediaDevices(async () => ({}) as MediaStream);
    expect(isSpeechSupported()).toBe(false);
  });

  it("reports supported when media capture and WebAssembly exist", () => {
    setMediaDevices(async () => ({}) as MediaStream);
    // @ts-expect-error test double
    window.MediaRecorder = FakeMediaRecorder;
    expect(isSpeechSupported()).toBe(true);
  });

  it("checks the model config without using a remote host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(isSpeechModelInstalled()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/models/onnx-community/whisper-base/config.json",
      expect.objectContaining({ method: "HEAD" })
    );
  });

  it("reports a missing model without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(isSpeechModelInstalled()).resolves.toBe(false);
  });
});

describe("LocalSpeechRecorder", () => {
  it("maps a denied microphone to permission_denied", async () => {
    setMediaDevices(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    // @ts-expect-error test double
    window.MediaRecorder = FakeMediaRecorder;
    const recorder = new LocalSpeechRecorder();
    await expect(recorder.start()).rejects.toMatchObject({
      name: "SpeechError",
      code: "permission_denied",
    } satisfies Partial<SpeechError>);
  });

  it("stops the microphone tracks when cancelled", async () => {
    const stop = vi.fn();
    setMediaDevices(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    // @ts-expect-error test double
    window.MediaRecorder = FakeMediaRecorder;
    const recorder = new LocalSpeechRecorder();
    await recorder.start();
    recorder.cancel();
    expect(stop).toHaveBeenCalled();
  });
});

describe("transcribeLocally", () => {
  it("rejects empty audio before loading the model", async () => {
    await expect(transcribeLocally(new Float32Array(0))).rejects.toMatchObject({
      name: "SpeechError",
      code: "no_speech",
    } satisfies Partial<SpeechError>);
  });
});
