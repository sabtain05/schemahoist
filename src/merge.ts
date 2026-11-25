import type { JsonSchema, JsonSchemaType } from "./types.js";

const MAX_BOUND_KEYS = new Set(["minimum", "minLength", "minItems"]);
const MIN_BOUND_KEYS = new Set(["maximum", "maxLength", "maxItems"]);

function intersectTypes(
  a: JsonSchemaType | JsonSchemaType[] | undefined,
  b: JsonSchemaType | JsonSchemaType[] | undefined
): JsonSchemaType | JsonSchemaType[] | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  const listA = Array.isArray(a) ? a : [a];
  const listB = Array.isArray(b) ? b : [b];
  const common = listA.filter((t) => listB.includes(t));
  if (common.length === 0) {
    return b;
  }
  return common.length === 1 ? common[0] : common;
}

export function mergeSchemas(schemas: readonly JsonSchema[]): JsonSchema {
  const merged: JsonSchema = {};
  const descriptions: string[] = [];
  const requiredSet = new Set<string>();
  const properties: Record<string, JsonSchema> = {};
  let hasProperties = false;

  for (const part of schemas) {
    for (const key of Object.keys(part)) {
      const val = part[key];
      if (val === undefined) {
        continue;
      }
      if (key === "description" && typeof val === "string" && val.trim().length > 0) {
        if (!descriptions.includes(val.trim())) {
          descriptions.push(val.trim());
        }
        continue;
      }
      if (key === "required" && Array.isArray(val)) {
        for (const reqKey of val) {
          if (typeof reqKey === "string") {
            requiredSet.add(reqKey);
          }
        }
        continue;
      }
      if (key === "properties" && val && typeof val === "object" && !Array.isArray(val)) {
        hasProperties = true;
        const propRecord = val as Record<string, JsonSchema>;
        for (const propName of Object.keys(propRecord)) {
          const existing = properties[propName];
          const incoming = propRecord[propName];
          properties[propName] = existing ? mergeSchemas([existing, incoming]) : incoming;
        }
        continue;
      }
      if (key === "type") {
        merged.type = intersectTypes(merged.type, val as JsonSchemaType | JsonSchemaType[]);
        continue;
      }
      if (MAX_BOUND_KEYS.has(key) && typeof val === "number") {
        const prev = merged[key];
        merged[key] = typeof prev === "number" ? Math.max(prev, val) : val;
        continue;
      }
      if (MIN_BOUND_KEYS.has(key) && typeof val === "number") {
        const prev = merged[key];
        merged[key] = typeof prev === "number" ? Math.min(prev, val) : val;
        continue;
      }
      merged[key] = val;
    }
  }

  if (descriptions.length > 0) {
    merged.description = descriptions.join(" ");
  }
  if (hasProperties) {
    merged.properties = properties;
  }
  if (requiredSet.size > 0) {
    merged.required = Array.from(requiredSet).sort();
  }
  return merged;
}
