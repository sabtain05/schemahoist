import { appendHoistedConstraints, formatConstraint } from "./hoist.js";
import { mergeSchemas } from "./merge.js";
import { getProviderProfile } from "./profiles.js";
import { extractRefName, resolveJsonPointer } from "./ref.js";
import type {
  JsonSchema,
  JsonSchemaType,
  JsonValue,
  NormalizeOptions,
  NormalizerFn,
  ProviderProfile
} from "./types.js";

interface WalkContext {
  readonly root: Readonly<JsonSchema>;
  readonly profile: ProviderProfile;
  readonly hoist: boolean;
  readonly maxDepth: number;
  readonly deterministicKeys: boolean;
  readonly preserveTitle: boolean;
  readonly customHoistFormatter?: (keyword: string, value: unknown) => string | null | undefined;
}

const VALID_TYPES = new Set<JsonSchemaType>([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null"
]);

const HANDLED_KEYS = new Set([
  "type",
  "nullable",
  "description",
  "title",
  "properties",
  "required",
  "additionalProperties",
  "propertyOrdering",
  "items",
  "prefixItems",
  "additionalItems",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "const",
  "enum"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value !== "object") {
    return (value as JsonValue) ?? null;
  }
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = cloneJsonValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

function sortSchemaKeys(schema: JsonSchema): JsonSchema {
  const sorted: JsonSchema = {};
  for (const key of Object.keys(schema).sort()) {
    if (schema[key] !== undefined) {
      sorted[key] = schema[key];
    }
  }
  return sorted;
}

function isSchemaNullable(schema: JsonSchema): boolean {
  return (
    schema.nullable === true ||
    schema.type === "null" ||
    (Array.isArray(schema.type) && schema.type.includes("null")) ||
    (Array.isArray(schema.anyOf) && schema.anyOf.some((b) => b.type === "null"))
  );
}

function wrapNullableAnyOf(schema: JsonSchema): JsonSchema {
  const { description, title, ...branch } = schema;
  const wrapped: JsonSchema = { anyOf: [branch, { type: "null" }] };
  if (description !== undefined) {
    wrapped.description = description;
  }
  if (title !== undefined) {
    wrapped.title = title;
  }
  return wrapped;
}

function makeNullable(schema: JsonSchema, profile: ProviderProfile): JsonSchema {
  if (isSchemaNullable(schema)) {
    return schema;
  }
  const copy: JsonSchema = { ...schema };
  if (profile.nullableStrategy === "nullable-flag") {
    copy.nullable = true;
    return copy;
  }
  if (copy.const !== undefined) {
    return wrapNullableAnyOf(copy);
  }
  if (typeof copy.type === "string" && copy.type !== "null") {
    copy.type = [copy.type, "null"];
    if (Array.isArray(copy.enum) && !copy.enum.includes(null)) {
      copy.enum = [...copy.enum, null];
    }
    return copy;
  }
  if (Array.isArray(copy.type)) {
    copy.type = [...copy.type, "null"];
    if (Array.isArray(copy.enum) && !copy.enum.includes(null)) {
      copy.enum = [...copy.enum, null];
    }
    return copy;
  }
  if (Array.isArray(copy.anyOf)) {
    copy.anyOf = [...copy.anyOf, { type: "null" }];
    return copy;
  }
  return wrapNullableAnyOf(copy);
}

function inferPrimitiveType(sample: unknown): JsonSchemaType | undefined {
  if (typeof sample === "string") {
    return "string";
  }
  if (typeof sample === "number") {
    return Number.isInteger(sample) ? "integer" : "number";
  }
  if (typeof sample === "boolean") {
    return "boolean";
  }
  return sample === null ? "null" : undefined;
}

function inferSchemaType(schema: JsonSchema): JsonSchemaType | undefined {
  if (schema.properties !== undefined || schema.additionalProperties !== undefined || schema.required !== undefined) {
    return "object";
  }
  if (schema.items !== undefined || schema.prefixItems !== undefined) {
    return "array";
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return inferPrimitiveType(schema.enum[0]);
  }
  if (schema.const !== undefined) {
    return inferPrimitiveType(schema.const);
  }
  return undefined;
}

function buildCircularCap(ref: string, existingDescription: string | undefined, ctx: WalkContext): JsonSchema {
  const note = `recursive reference to ${extractRefName(ref)} truncated at max depth ${ctx.maxDepth}`;
  const base: JsonSchema = { type: "object", properties: {} };
  if (ctx.profile.forceAdditionalPropertiesFalse) {
    base.additionalProperties = false;
  }
  if (ctx.profile.requireAllProperties) {
    base.required = [];
  }
  base.description = ctx.hoist ? appendHoistedConstraints(existingDescription, [note]) : existingDescription;
  return ctx.deterministicKeys ? sortSchemaKeys(base) : base;
}

function expandRefsAndAllOf(
  node: Readonly<JsonSchema>,
  ctx: WalkContext,
  refStack: ReadonlyMap<string, number>
): { resolved: JsonSchema; nextRefStack: Map<string, number>; circularRef?: string } {
  const nextRefStack = new Map(refStack);
  let current: JsonSchema = { ...node };

  while (typeof current.$ref === "string") {
    const ref = current.$ref;
    const count = nextRefStack.get(ref) ?? 0;
    if (count >= ctx.maxDepth) {
      return { resolved: current, nextRefStack, circularRef: ref };
    }
    const target = resolveJsonPointer(ctx.root, ref);
    const { $ref: _, ...siblings } = current;
    if (!target) {
      current = siblings;
      break;
    }
    nextRefStack.set(ref, count + 1);
    current = mergeSchemas([target, siblings]);
  }

  if (Array.isArray(current.allOf) && current.allOf.length > 0) {
    const parts: JsonSchema[] = [];
    for (const part of current.allOf) {
      if (isPlainObject(part)) {
        const sub = expandRefsAndAllOf(part as JsonSchema, ctx, nextRefStack);
        parts.push(
          sub.circularRef
            ? buildCircularCap(sub.circularRef, part.description as string | undefined, ctx)
            : sub.resolved
        );
      }
    }
    const { allOf: _, ...rest } = current;
    parts.push(rest);
    current = mergeSchemas(parts);
  }

  return { resolved: current, nextRefStack };
}

function normalizeNode(
  rawNode: Readonly<JsonSchema>,
  ctx: WalkContext,
  refStack: ReadonlyMap<string, number>,
  isRoot: boolean
): JsonSchema {
  const { resolved, nextRefStack, circularRef } = expandRefsAndAllOf(rawNode, ctx, refStack);
  if (circularRef) {
    return buildCircularCap(circularRef, typeof resolved.description === "string" ? resolved.description : undefined, ctx);
  }

  const profile = ctx.profile;
  const hoisted: string[] = [];
  const out: JsonSchema = {};
  const baseDescription = typeof resolved.description === "string" ? resolved.description : undefined;

  if (ctx.preserveTitle && typeof resolved.title === "string" && profile.allowedKeywords.has("title")) {
    out.title = resolved.title;
  }

  let isNullable = resolved.nullable === true;
  const types: JsonSchemaType[] = [];
  const rawTypes = typeof resolved.type === "string" ? [resolved.type] : Array.isArray(resolved.type) ? resolved.type : [];
  for (const t of rawTypes) {
    if (t === "null") {
      isNullable = true;
    } else if (typeof t === "string" && VALID_TYPES.has(t as JsonSchemaType) && !types.includes(t as JsonSchemaType)) {
      types.push(t as JsonSchemaType);
    }
  }

  const unionSource = Array.isArray(resolved.anyOf)
    ? resolved.anyOf
    : Array.isArray(resolved.oneOf)
      ? resolved.oneOf
      : undefined;

  if (types.length === 0 && !isNullable && !unionSource) {
    const inferred = inferSchemaType(resolved) ?? (isRoot && profile.requireRootObject ? "object" : undefined);
    if (inferred) {
      types.push(inferred);
    }
  }

  if (unionSource && unionSource.length > 0) {
    if (isRoot && profile.requireRootObject) {
      const merged = mergeSchemas(unionSource.filter((b): b is JsonSchema => isPlainObject(b)));
      const { anyOf: _a, oneOf: _o, ...rest } = resolved;
      return normalizeNode({ ...rest, ...merged, type: "object" }, ctx, nextRefStack, true);
    }

    const branches: JsonSchema[] = [];
    for (const branch of unionSource) {
      if (!isPlainObject(branch)) {
        continue;
      }
      if (branch.type === "null" && profile.nullableStrategy === "nullable-flag") {
        isNullable = true;
        continue;
      }
      branches.push(normalizeNode(branch as JsonSchema, ctx, nextRefStack, false));
    }

    if (profile.nullableStrategy === "nullable-flag" && isNullable && branches.length === 1) {
      const single: JsonSchema = { ...branches[0], nullable: true };
      if (baseDescription !== undefined) {
        single.description = appendHoistedConstraints(baseDescription, hoisted);
      }
      return ctx.deterministicKeys ? sortSchemaKeys(single) : single;
    }

    if (branches.length > 0) {
      out.anyOf = branches;
      if (profile.nullableStrategy === "nullable-flag" && isNullable) {
        out.nullable = true;
      }
    }
  } else if (types.length > 1) {
    if (profile.nullableStrategy === "nullable-flag") {
      const { nullable: _n, description: _d, title: _t, ...subBase } = resolved;
      out.anyOf = types.map((t) => normalizeNode({ ...subBase, type: t }, ctx, nextRefStack, false));
      if (isNullable) {
        out.nullable = true;
      }
      if (baseDescription !== undefined) {
        out.description = baseDescription;
      }
      return ctx.deterministicKeys ? sortSchemaKeys(out) : out;
    }
    out.type = isNullable ? [...types, "null"] : [...types];
  } else if (types.length === 1) {
    const primary = types[0];
    if (isNullable && profile.nullableStrategy === "type-array") {
      out.type = [primary, "null"];
    } else {
      out.type = primary;
      if (isNullable) {
        out.nullable = true;
      }
    }
  } else if (isNullable) {
    if (profile.nullableStrategy === "nullable-flag") {
      out.type = "string";
      out.nullable = true;
    } else {
      out.type = "null";
    }
  }

  const primaryType = typeof out.type === "string"
    ? out.type
    : Array.isArray(out.type)
      ? out.type.find((t) => t !== "null")
      : undefined;

  if (primaryType === "object") {
    const rawProps = isPlainObject(resolved.properties) ? (resolved.properties as Record<string, JsonSchema>) : {};
    const rawRequired = new Set(
      Array.isArray(resolved.required) ? resolved.required.filter((k): k is string => typeof k === "string") : []
    );
    const propKeys = ctx.deterministicKeys ? Object.keys(rawProps).sort() : Object.keys(rawProps);
    const outProps: Record<string, JsonSchema> = {};

    for (const propKey of propKeys) {
      const propSchema = rawProps[propKey];
      if (!isPlainObject(propSchema)) {
        continue;
      }
      let norm = normalizeNode(propSchema as JsonSchema, ctx, nextRefStack, false);
      if (profile.requireAllProperties && !rawRequired.has(propKey)) {
        norm = makeNullable(norm, profile);
      }
      outProps[propKey] = ctx.deterministicKeys ? sortSchemaKeys(norm) : norm;
    }

    out.properties = outProps;
    if (profile.requireAllProperties) {
      out.required = [...propKeys];
    } else {
      const validRequired = propKeys.filter((k) => rawRequired.has(k));
      if (validRequired.length > 0) {
        out.required = validRequired;
      }
    }

    if (profile.forceAdditionalPropertiesFalse || profile.stripAdditionalProperties) {
      if (profile.forceAdditionalPropertiesFalse) {
        out.additionalProperties = false;
      }
      if (ctx.hoist && isPlainObject(resolved.additionalProperties)) {
        const valType = typeof resolved.additionalProperties.type === "string" ? resolved.additionalProperties.type : "any";
        hoisted.push(`dynamic values of type ${valType}`);
      }
    } else if (resolved.additionalProperties !== undefined) {
      if (typeof resolved.additionalProperties === "boolean") {
        out.additionalProperties = resolved.additionalProperties;
      } else if (isPlainObject(resolved.additionalProperties)) {
        out.additionalProperties = normalizeNode(resolved.additionalProperties as JsonSchema, ctx, nextRefStack, false);
      }
    }

    if (profile.allowedKeywords.has("propertyOrdering") && Array.isArray(resolved.propertyOrdering)) {
      const ordering = resolved.propertyOrdering.filter(
        (k): k is string => typeof k === "string" && Object.prototype.hasOwnProperty.call(outProps, k)
      );
      if (ordering.length > 0) {
        out.propertyOrdering = ordering;
      }
    }
  }

  if (primaryType === "array") {
    const tupleSource = Array.isArray(resolved.prefixItems) && resolved.prefixItems.length > 0
      ? resolved.prefixItems
      : Array.isArray(resolved.items) && resolved.items.length > 0
        ? resolved.items
        : undefined;
    if (tupleSource) {
      const tupleItems = tupleSource
        .filter((item): item is JsonSchema => isPlainObject(item))
        .map((item) => normalizeNode(item, ctx, nextRefStack, false));
      out.items = tupleItems.length === 1 ? tupleItems[0] : { anyOf: tupleItems };
      if (ctx.hoist) {
        hoisted.push(`tuple of length ${tupleItems.length}`);
      }
    } else if (isPlainObject(resolved.items)) {
      out.items = normalizeNode(resolved.items as JsonSchema, ctx, nextRefStack, false);
    } else {
      out.items = { type: "string" };
    }
  }

  if (resolved.const !== undefined) {
    if (profile.allowedKeywords.has("const") && !profile.convertConstToEnum) {
      out.const = cloneJsonValue(resolved.const);
    } else if (profile.convertConstToEnum && profile.allowedKeywords.has("enum") && typeof resolved.const === "string") {
      out.enum = [resolved.const];
    } else if (ctx.hoist) {
      const msg = formatConstraint("const", resolved.const, ctx.customHoistFormatter);
      if (msg) {
        hoisted.push(msg);
      }
    }
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    if (profile.allowedKeywords.has("enum")) {
      out.enum = profile.target === "gemini"
        ? resolved.enum.map((v) => String(v))
        : resolved.enum.map(cloneJsonValue);
    } else if (ctx.hoist) {
      hoisted.push(`allowed values: ${resolved.enum.map((v) => JSON.stringify(v)).join(", ")}`);
    }
  }

  const draft04ExclMin = resolved.exclusiveMinimum === true && typeof resolved.minimum === "number";
  const draft04ExclMax = resolved.exclusiveMaximum === true && typeof resolved.maximum === "number";

  for (const key of Object.keys(resolved).sort()) {
    if (HANDLED_KEYS.has(key)) {
      continue;
    }
    let val = resolved[key];
    if (val === undefined) {
      continue;
    }
    if (key === "exclusiveMinimum" && draft04ExclMin) {
      val = resolved.minimum;
    } else if (key === "exclusiveMaximum" && draft04ExclMax) {
      val = resolved.maximum;
    } else if ((key === "minimum" && draft04ExclMin) || (key === "maximum" && draft04ExclMax)) {
      continue;
    }

    const isAllowedFormat = key === "format" && typeof val === "string" && profile.allowedKeywords.has("format") && profile.supportedFormats.has(val);
    const isAllowedMinItems = key === "minItems" && typeof val === "number" && profile.allowedKeywords.has("minItems") && (profile.maxMinItems === undefined || val <= profile.maxMinItems);
    const isAllowedGeneric = key !== "format" && key !== "minItems" && profile.allowedKeywords.has(key);

    if (isAllowedFormat) {
      out.format = val as string;
    } else if (isAllowedMinItems) {
      out.minItems = val as number;
    } else if (isAllowedGeneric) {
      out[key] = cloneJsonValue(val);
    } else if (ctx.hoist) {
      const msg = formatConstraint(key, val, ctx.customHoistFormatter);
      if (msg) {
        hoisted.push(msg);
      }
    }
  }

  const finalDescription = ctx.hoist ? appendHoistedConstraints(baseDescription, hoisted) : baseDescription;
  if (finalDescription !== undefined) {
    out.description = finalDescription;
  }

  return ctx.deterministicKeys ? sortSchemaKeys(out) : out;
}

export function normalizeSchema(schema: Readonly<JsonSchema>, options: NormalizeOptions): JsonSchema {
  if (!isPlainObject(schema)) {
    throw new TypeError("Input schema must be a non-null plain object");
  }
  const profile = getProviderProfile(options.target);
  const maxDepth = options.maxDepth ?? 5;
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError("maxDepth must be a positive integer");
  }
  return normalizeNode(
    schema,
    {
      root: schema,
      profile,
      hoist: options.hoistUnsupportedConstraints ?? true,
      maxDepth,
      deterministicKeys: options.deterministicKeys ?? true,
      preserveTitle: options.preserveTitle ?? true,
      customHoistFormatter: options.customHoistFormatter
    },
    new Map<string, number>(),
    true
  );
}

export function createNormalizer(options: NormalizeOptions): NormalizerFn {
  const frozenOptions: NormalizeOptions = { ...options };
  return (schema: Readonly<JsonSchema>): JsonSchema => normalizeSchema(schema, frozenOptions);
}
