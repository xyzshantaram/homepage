import { readFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 20 * 1024 * 1024;

export async function loadContentSource(
  src: string,
  baseDir: string,
  contentRoot: string,
  maxBytes: number = MAX_BYTES,
): Promise<Buffer | undefined> {
  if (src.startsWith("/")) {
    const target = path.resolve(contentRoot, src.replace(/^\/+/, ""));
    const file = within(contentRoot, target);
    return file ? read(file) : undefined;
  }

  if (src.startsWith(".")) {
    const target = path.resolve(baseDir, src);
    const file = within(contentRoot, target);
    return file ? read(file) : undefined;
  }

  if (!/^https?:\/\//i.test(src)) {
    return undefined;
  }

  try {
    const response = await fetch(src, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return undefined;
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > maxBytes) {
      return undefined;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > maxBytes ? undefined : buffer;
  } catch {
    return undefined;
  }
}

async function read(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

function within(root: string, target: string): string | undefined {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return target;
}
