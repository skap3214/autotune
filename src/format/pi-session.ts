import { nanoid } from "nanoid";

export interface PiSessionHeader {
  type: "session";
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface PiMessageEntry {
  type: "message";
  id: string;
  timestamp: string;
  role: "user" | "assistant" | "system";
  text: string;
  parentId?: string;
}

export interface PiCustomEntry {
  type: "custom";
  id: string;
  timestamp: string;
  customType: string;
  value: unknown;
  parentId?: string;
}

export type PiSessionLine = PiSessionHeader | PiMessageEntry | PiCustomEntry;

export function createSessionHeader(input: {
  sessionId: string;
  cwd: string;
  parentSession?: string;
  timestamp?: string;
}): PiSessionHeader {
  return {
    type: "session",
    id: input.sessionId,
    cwd: input.cwd,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.parentSession ? { parentSession: input.parentSession } : {}),
  };
}

export function createMessageEntry(input: {
  role: "user" | "assistant" | "system";
  text: string;
  parentId?: string;
  timestamp?: string;
}): PiMessageEntry {
  return {
    type: "message",
    id: `msg_${nanoid(12)}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    role: input.role,
    text: input.text,
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
}

export function createCustomEntry(input: {
  customType: string;
  value: unknown;
  parentId?: string;
  timestamp?: string;
}): PiCustomEntry {
  return {
    type: "custom",
    id: `cus_${nanoid(12)}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    customType: input.customType,
    value: input.value,
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
}

export function stringifyJsonl(lines: PiSessionLine[]): string {
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

export function parseJsonlObjects(content: string): unknown[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export function cleanPiOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }
  return trimmed;
}
