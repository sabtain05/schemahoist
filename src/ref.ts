import type { JsonSchema } from "./types.js";

function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function resolveJsonPointer(root: Readonly<JsonSchema>, ref: string): JsonSchema | null {
  if (ref === "#") {
    return root as JsonSchema;
  }
  if (!ref.startsWith("#/")) {
    return null;
  }
  const segments = ref.slice(2).split("/").map(unescapePointerSegment);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return null;
    }
    if (Array.isArray(current)) {
      const idx = Number(segment);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return null;
      }
      current = current[idx];
    } else {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, segment)) {
        return null;
      }
      current = record[segment];
    }
  }
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    return null;
  }
  return current as JsonSchema;
}

export function extractRefName(ref: string): string {
  if (ref === "#") {
    return "root";
  }
  const idx = ref.lastIndexOf("/");
  if (idx === -1) {
    return ref;
  }
  return unescapePointerSegment(ref.slice(idx + 1));
}
