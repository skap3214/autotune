import type { PiSessionLine, PiSessionHeader, PiMessageEntry, PiCustomEntry } from "../format/pi-session.js";

export type RedactionCategory =
  | "PROVIDER_TOKEN"
  | "JWT"
  | "AUTH_HEADER"
  | "API_KEY"
  | "PASSWORD"
  | "EMAIL"
  | "PHONE"
  | "IP_ADDRESS"
  | "FS_PATH";

export interface RedactionManifest {
  traceId: string;
  count: number;
  byCategory: Partial<Record<RedactionCategory, number>>;
}

export interface Redactor {
  redact(lines: PiSessionLine[]): { lines: PiSessionLine[]; manifest: RedactionManifest };
}

interface PatternDef {
  category: RedactionCategory;
  regex: RegExp;
}

// Order matters — more specific patterns first.
const PATTERNS: PatternDef[] = [
  // Provider tokens
  { category: "PROVIDER_TOKEN", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { category: "PROVIDER_TOKEN", regex: /sk-[A-Za-z0-9]{20,}/g },
  { category: "PROVIDER_TOKEN", regex: /ghp_[A-Za-z0-9]{36}/g },
  { category: "PROVIDER_TOKEN", regex: /gho_[A-Za-z0-9]{36}/g },
  { category: "PROVIDER_TOKEN", regex: /glpat-[A-Za-z0-9_-]{20,}/g },
  { category: "PROVIDER_TOKEN", regex: /xoxb-[0-9-]{20,}/g },
  { category: "PROVIDER_TOKEN", regex: /xoxp-[0-9-]{20,}/g },

  // JWT
  { category: "JWT", regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },

  // Auth headers
  { category: "AUTH_HEADER", regex: /(?:Authorization|X-Api-Key|X-Auth-Token)\s*:\s*\S+/gi },
  { category: "AUTH_HEADER", regex: /Bearer\s+[A-Za-z0-9._~+/=-]+/g },

  // Passwords
  { category: "PASSWORD", regex: /"password"\s*:\s*"[^"]*"/gi },
  { category: "PASSWORD", regex: /password\s*[=:]\s*\S+/gi },

  // Email
  { category: "EMAIL", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },

  // Phone
  { category: "PHONE", regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },

  // IP addresses (exclude private/loopback)
  { category: "IP_ADDRESS", regex: /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?!10\.\d)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },

  // Filesystem paths
  { category: "FS_PATH", regex: /\/(?:home|Users|root)\/[^\s"']+/g },
  { category: "FS_PATH", regex: /C:\\Users\\[^\s"']+/g },
];

function redactString(
  input: string,
  seen: Map<string, string>,
  counters: Record<string, number>,
): string {
  let result = input;

  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regexes.
    pattern.regex.lastIndex = 0;
    result = result.replace(pattern.regex, (match) => {
      const existing = seen.get(match);
      if (existing) return existing;

      const count = (counters[pattern.category] ?? 0) + 1;
      counters[pattern.category] = count;
      const placeholder = `<${pattern.category}_${count}>`;
      seen.set(match, placeholder);
      return placeholder;
    });
  }

  return result;
}

function redactUnknown(
  value: unknown,
  seen: Map<string, string>,
  counters: Record<string, number>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactString(value, seen, counters);

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, seen, counters));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = redactUnknown(v, seen, counters);
    }
    return result;
  }

  return value;
}

function redactLine(
  line: PiSessionLine,
  seen: Map<string, string>,
  counters: Record<string, number>,
): PiSessionLine {
  if (line.type === "session") {
    const header = line as PiSessionHeader;
    return { ...header, cwd: redactString(header.cwd, seen, counters) };
  }

  if (line.type === "message") {
    const msg = line as PiMessageEntry;
    return { ...msg, text: redactString(msg.text, seen, counters) };
  }

  if (line.type === "custom") {
    const custom = line as PiCustomEntry;
    return { ...custom, value: redactUnknown(custom.value, seen, counters) };
  }

  return line;
}

export function createRedactor(traceId: string): Redactor {
  const seen = new Map<string, string>();
  const counters: Record<string, number> = {};

  return {
    redact(lines) {
      const redacted = lines.map((line) => redactLine(line, seen, counters));

      const byCategory: Partial<Record<RedactionCategory, number>> = {};
      let count = 0;
      for (const [cat, num] of Object.entries(counters)) {
        byCategory[cat as RedactionCategory] = num;
        count += num;
      }

      return {
        lines: redacted,
        manifest: { traceId, count, byCategory },
      };
    },
  };
}
