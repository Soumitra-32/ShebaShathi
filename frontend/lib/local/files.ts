/**
 * Local file intake for sensitive documents.
 *
 * Everything here runs in the browser: files are validated by declared type,
 * by size, and by their actual leading bytes (magic numbers) so a renamed or
 * malformed file is rejected before it is decoded. No file content ever
 * leaves the page.
 */

export type FileKind = "image" | "pdf";

export type RejectionReason =
  | "unsupported_type"
  | "too_large"
  | "malformed"
  | "empty"
  | "limit_reached"
  | "duplicate";

export interface FileRejection {
  name: string;
  reason: RejectionReason;
  detail?: string;
}

export interface ValidatedFile {
  file: File;
  kind: FileKind;
  name: string;
  size: number;
  mime: string;
  /** SHA-256 hash of the file content, used for duplicate detection. */
  hash: string;
}

export interface ValidationOptions {
  maxFiles: number;
  maxBytesPerFile: number;
  acceptedKinds: FileKind[];
  currentCount: number;
  /** Hashes of files already attached; used to reject content duplicates. */
  existingHashes?: Set<string>;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg"];
const PDF_MIME_TYPES = ["application/pdf"];

/** Compute the SHA-256 hash of a file's content (runs in the browser only). */
export async function fileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Detect the real file type from the first bytes of the file. */
export function sniffKind(bytes: Uint8Array): FileKind | null {
  if (!bytes || bytes.length < 5) return null;
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(PNG_SIGNATURE) || startsWith(JPEG_SIGNATURE)) return "image";
  if (startsWith(PDF_SIGNATURE)) return "pdf";
  return null;
}

/** Format a byte count for display without locale-dependent rounding. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate one file. Returns the accepted file or a rejection reason.
 * The declared MIME type is only a hint; the leading bytes decide.
 */
export async function validateFile(file: File, options: ValidationOptions): Promise<
  { ok: true; value: ValidatedFile } | { ok: false; rejection: FileRejection }
> {
  if (file.size === 0) {
    return { ok: false, rejection: { name: file.name, reason: "empty" } };
  }
  if (file.size > options.maxBytesPerFile) {
    return { ok: false, rejection: { name: file.name, reason: "too_large" } };
  }
  if (!options.acceptedKinds.length) {
    return { ok: false, rejection: { name: file.name, reason: "unsupported_type" } };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniffKind(header);
  if (!kind) {
    return { ok: false, rejection: { name: file.name, reason: "malformed" } };
  }
  if (!options.acceptedKinds.includes(kind)) {
    return { ok: false, rejection: { name: file.name, reason: "unsupported_type" } };
  }
  const allowedMimes = kind === "pdf" ? PDF_MIME_TYPES : IMAGE_MIME_TYPES;
  if (file.type && !allowedMimes.includes(file.type.toLowerCase())) {
    return { ok: false, rejection: { name: file.name, reason: "unsupported_type" } };
  }

  const hash = await fileHash(file);
  return {
    ok: true,
    value: {
      file,
      kind,
      name: file.name,
      size: file.size,
      mime: kind === "pdf" ? "application/pdf" : file.type || "image/*",
      hash,
    },
  };
}

/** Validate a batch of files against the count limit. */
export async function validateFiles(
  files: File[],
  options: ValidationOptions
): Promise<{ accepted: ValidatedFile[]; rejected: FileRejection[] }> {
  const accepted: ValidatedFile[] = [];
  const rejected: FileRejection[] = [];
  const seenHashes = new Set(options.existingHashes);

  for (const file of files) {
    if (accepted.length + options.currentCount >= options.maxFiles) {
      rejected.push({ name: file.name, reason: "limit_reached" });
      continue;
    }
    const result = await validateFile(file, options);
    if ("value" in result) {
      const value = result.value;
      if (seenHashes.has(value.hash)) {
        rejected.push({ name: file.name, reason: "duplicate" });
        continue;
      }
      seenHashes.add(value.hash);
      accepted.push(value);
    } else {
      rejected.push(result.rejection);
    }
  }
  return { accepted, rejected };
}

/** Object URL lifecycle helper so previews can be released deterministically. */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function releasePreviewUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}
