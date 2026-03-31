import { nanoid } from "nanoid";

export function createTraceId(): string {
  return `trace_${nanoid(12)}`;
}
