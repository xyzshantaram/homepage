import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { makeLimiter } from "../utils/rate-limit";
import {
  CSP_REPORT_BODY_LIMIT,
  CSP_REPORT_RATE_LIMIT,
  type Route,
} from "../utils";

type Violation = {
  directive: string;
  blocked: string;
  document: string;
  source?: string;
};

type LegacyBody = {
  "csp-report"?: {
    "effective-directive"?: string;
    "violated-directive"?: string;
    "blocked-uri"?: string;
    "document-uri"?: string;
    "source-file"?: string;
  };
};

type ModernReport = {
  type?: string;
  body?: {
    effectiveDirective?: string;
    blockedURL?: string;
    documentURL?: string;
    sourceFile?: string;
  };
};

function fromLegacy(body: unknown): Violation | undefined {
  const report = (body as LegacyBody)?.["csp-report"];
  if (!report) {
    return undefined;
  }

  return {
    directive: report["effective-directive"] ?? report["violated-directive"] ?? "unknown",
    blocked: report["blocked-uri"] ?? "unknown",
    document: report["document-uri"] ?? "",
    source: report["source-file"],
  };
}

function fromModern(body: unknown): Violation | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const report = (body as ModernReport[]).find(
    (entry) => entry?.type === "csp-violation",
  )?.body;

  if (!report) {
    return undefined;
  }

  return {
    directive: report.effectiveDirective ?? "unknown",
    blocked: report.blockedURL ?? "unknown",
    document: report.documentURL ?? "",
    source: report.sourceFile,
  };
}

export function CspReportRoute(): Route {
  return [
    "/api/v1/csp-report",
    makeLimiter(CSP_REPORT_RATE_LIMIT.limit, CSP_REPORT_RATE_LIMIT.windowMs),
    bodyLimit({
      maxSize: CSP_REPORT_BODY_LIMIT,
      onError: (c) => c.body(null, 204),
    }),
    async (c: Context) => {
      const body = await c.req.json().catch(() => null);
      const violation = fromLegacy(body) ?? fromModern(body);

      if (violation) {
        const source = violation.source ? ` from ${violation.source}` : "";
        console.warn(
          `[csp] ${violation.directive} blocked ${violation.blocked}${source} on ${violation.document}`,
        );
      }

      return c.body(null, 204);
    },
  ];
}
