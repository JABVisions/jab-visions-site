/** Safari / WebKit: reading a detached File or IndexedDB Blob throws this. */
const MISSING_OBJECT_RE =
  /object can ?not be found|requested file could not be read|blob.*not found|notreadableerror/i;

export class MissingAudioObjectError extends Error {
  constructor(clipName?: string) {
    super(
      clipName
        ? `"${clipName}" could not be loaded. Re-add that soundboard clip — the rest of the session is still here.`
        : "That soundboard clip could not be loaded. Re-add the file — your timeline is still here."
    );
    this.name = "MissingAudioObjectError";
  }
}

export function isMissingAudioObjectError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof MissingAudioObjectError) return true;
  const record = error as { name?: unknown; message?: unknown };
  const name =
    error instanceof Error
      ? error.name
      : typeof record?.name === "string"
        ? record.name
        : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : String(error);
  return name === "NotFoundError" || name === "NotReadableError" || MISSING_OBJECT_RE.test(message);
}

export function asPlayableAudioError(error: unknown, clipName?: string): Error {
  if (error instanceof MissingAudioObjectError) return error;
  if (isMissingAudioObjectError(error)) return new MissingAudioObjectError(clipName);
  if (error instanceof Error) return error;
  return new Error("Couldn't play this session.");
}

export function playableAudioMessage(error: unknown, clipName?: string): string {
  return asPlayableAudioError(error, clipName).message;
}

export function clipFileKey(file: Pick<File, "name" | "size" | "lastModified">): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function toArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) {
    return value.byteLength > 0 ? value.slice(0) : null;
  }
  if (ArrayBuffer.isView(value) && value.byteLength > 0) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  }
  return null;
}

/** Copy clip bytes into an owned File so Safari cannot detach the original picker/IDB blob. */
export async function readClipBytes(file: Blob): Promise<ArrayBuffer | null> {
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > 0) return bytes;
  } catch {
    /* detached blob */
  }
  try {
    const copy = file.slice(0, file.size, file.type || "audio/wav");
    const bytes = await copy.arrayBuffer();
    if (bytes.byteLength > 0) return bytes;
  } catch {
    /* still unreadable */
  }
  return null;
}

export async function adoptAudioFile(file: File): Promise<File> {
  const lastModified = file.lastModified || Date.now();
  const type = file.type || "audio/wav";
  const name = file.name || "audio.wav";
  const bytes = await readClipBytes(file);
  if (!bytes) {
    throw new MissingAudioObjectError(name);
  }
  return new File([bytes], name, { type, lastModified });
}

export function placeholderClipFile(name: string, lastModified = 1): File {
  return new File([], name || "missing.wav", {
    type: "audio/wav",
    lastModified: lastModified || 1,
  });
}
