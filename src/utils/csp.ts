import type { Context } from "hono";

const BASE: Record<string, readonly string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'wasm-unsafe-eval'",
    "https://cdn.jsdelivr.net",
    "https://cdnjs.buymeacoffee.com",
    "https://btczap.io",
    "https://esm.sh",
    "https://analytics.shantaram.xyz",
  ],
  "worker-src": ["'self'", "blob:"],
  "style-src": [
    "'self'",
    "'unsafe-inline'",
    "https://cdn.jsdelivr.net",
    "https://fonts.googleapis.com",
  ],
  "img-src": ["'self'", "data:", "https:"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "connect-src": [
    "'self'",
    "https://cdn.jsdelivr.net",
    "https://esm.sh",
    "https://btczap.io",
    "https://*.btczap.io",
    "https://analytics.shantaram.xyz",
  ],
  "frame-src": ["'self'", "https://btczap.io", "https://*.btczap.io"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "report-uri": ["/api/v1/csp-report"],
  "report-to": ["csp"],
};

export type CspExtras = {
  script?: readonly string[];
  connect?: readonly string[];
};

export function originOf(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function connectOrigins(html: string): string[] {
  const origins = new Set<string>();

  for (const match of html.matchAll(
    /endpoint\s*=\s*["'](https?:\/\/[^"']+)["']/gi,
  )) {
    const origin = originOf(match[1]);
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function scriptOrigins(source: string): string[] {
  const origins = new Set<string>();

  for (const match of source.matchAll(
    /(?:from|import)\s*\(?\s*["'](https?:\/\/[^"']+)["']/g,
  )) {
    const origin = originOf(match[1]);
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function buildCsp(extras: CspExtras = {}): string {
  const added: Record<string, readonly string[] | undefined> = {
    "script-src": extras.script,
    "connect-src": extras.connect,
  };

  return Object.entries(BASE)
    .map(([directive, sources]) => {
      const merged = [...new Set([...sources, ...(added[directive] ?? [])])];
      return `${directive} ${merged.join(" ")}`;
    })
    .join("; ");
}

const KEY = "csp" as never;

export function setCsp(context: Context, extras: CspExtras): void {
  context.set(KEY, extras as never);
}

export function getCsp(context: Context): CspExtras | undefined {
  return context.get(KEY) as CspExtras | undefined;
}
