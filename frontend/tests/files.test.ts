import { describe, expect, it } from "vitest";
import {
  formatBytes,
  sniffKind,
  validateFile,
  validateFiles,
} from "../lib/local/files";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

const options = {
  maxFiles: 2,
  maxBytesPerFile: 1024,
  acceptedKinds: ["image", "pdf"] as Array<"image" | "pdf">,
  currentCount: 0,
};

describe("sniffKind", () => {
  it("detects png, jpeg and pdf from the leading bytes", () => {
    expect(sniffKind(PNG_BYTES)).toBe("image");
    expect(sniffKind(JPEG_BYTES)).toBe("image");
    expect(sniffKind(PDF_BYTES)).toBe("pdf");
  });

  it("returns null for anything else", () => {
    expect(sniffKind(EXE_BYTES)).toBeNull();
    expect(sniffKind(new Uint8Array([0x25, 0x50]))).toBeNull();
  });
});

describe("validateFile", () => {
  it("accepts a real png", async () => {
    const file = new File([PNG_BYTES], "id.png", { type: "image/png" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("image");
      expect(result.value.size).toBe(PNG_BYTES.length);
    }
  });

  it("rejects a file whose real content is not an image or a pdf", async () => {
    const file = new File([EXE_BYTES], "tool.exe", { type: "application/octet-stream" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("malformed");
  });

  it("rejects a renamed executable that claims to be a png", async () => {
    const file = new File([EXE_BYTES], "photo.png", { type: "image/png" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("malformed");
  });

  it("rejects an oversized file", async () => {
    const file = new File([new Uint8Array(2048)], "big.png", { type: "image/png" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("too_large");
  });

  it("rejects an empty file", async () => {
    const file = new File([], "empty.png", { type: "image/png" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("empty");
  });

  it("rejects a mime type that does not match the content", async () => {
    const file = new File([PNG_BYTES], "id.png", { type: "application/pdf" });
    const result = await validateFile(file, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("unsupported_type");
  });
});

describe("validateFiles", () => {
  it("stops accepting files once the limit is reached", async () => {
    const files = [
      new File([PNG_BYTES], "a.png", { type: "image/png" }),
      new File([JPEG_BYTES], "b.jpg", { type: "image/jpeg" }),
      new File([PDF_BYTES], "c.pdf", { type: "application/pdf" }),
    ];
    const result = await validateFiles(files, options);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("limit_reached");
  });

  it("counts files that are already on the page", async () => {
    const file = new File([PNG_BYTES], "a.png", { type: "image/png" });
    const result = await validateFiles([file], { ...options, currentCount: 2 });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("limit_reached");
  });

  it("rejects duplicate files by content hash (same bytes, different name)", async () => {
    const existingHash = await new Response(new Blob([PNG_BYTES])).arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", existingHash)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const files = [
      new File([PNG_BYTES], "original.png", { type: "image/png" }),
      new File([PNG_BYTES], "copy.png", { type: "image/png" }), // same content, different name
    ];
    const result = await validateFiles(files, {
      ...options,
      existingHashes: new Set([hash]),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((r) => r.reason === "duplicate")).toBe(true);
  });

  it("accepts different content even with the same name", async () => {
    const files = [
      new File([PNG_BYTES], "photo.png", { type: "image/png" }),
      new File([JPEG_BYTES], "photo.png", { type: "image/jpeg" }), // same name, different content
    ];
    const result = await validateFiles(files, options);
    expect(result.accepted).toHaveLength(2);
  });
});

describe("formatBytes", () => {
  it("formats byte counts for display", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
