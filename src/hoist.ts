const FORMAT_LABELS: Readonly<Record<string, string>> = {
  uuid: "Must be a valid UUID",
  uri: "Must be a valid URI",
  "uri-reference": "Must be a valid URI reference",
  iri: "Must be a valid IRI",
  email: "Must be a valid email address",
  "idn-email": "Must be a valid email address",
  hostname: "Must be a valid hostname",
  ipv4: "Must be a valid IPv4 address",
  ipv6: "Must be a valid IPv6 address",
  "date-time": "Must be a valid ISO 8601 date-time",
  date: "Must be a valid ISO 8601 date",
  time: "Must be a valid ISO 8601 time",
  duration: "Must be a valid ISO 8601 duration",
  regex: "Must be a valid regular expression",
  "json-pointer": "Must be a valid JSON Pointer",
  password: "Must be a password string",
  byte: "Must be base64-encoded",
  binary: "Must be binary-encoded",
  int32: "Must be a 32-bit integer",
  int64: "Must be a 64-bit integer",
  float: "Must be a 32-bit float",
  double: "Must be a 64-bit float"
};

const NUMERIC_PREFIXES: Readonly<Record<string, string>> = {
  minLength: "min length",
  maxLength: "max length",
  minimum: "minimum",
  maximum: "maximum",
  exclusiveMinimum: "must be >",
  exclusiveMaximum: "must be <",
  multipleOf: "multiple of",
  minItems: "min items",
  maxItems: "max items",
  minProperties: "min properties",
  maxProperties: "max properties"
};

const BOOL_LABELS: Readonly<Record<string, string>> = {
  uniqueItems: "items must be unique",
  readOnly: "read-only",
  writeOnly: "write-only",
  deprecated: "deprecated"
};

const SILENT_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "definitions",
  "$comment",
  "$vocabulary",
  "$anchor",
  "$dynamicRef",
  "$dynamicAnchor"
]);

function stringifyCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatConstraint(
  keyword: string,
  value: unknown,
  customFormatter?: (keyword: string, value: unknown) => string | null | undefined
): string | null {
  if (SILENT_KEYWORDS.has(keyword)) {
    return null;
  }
  if (customFormatter) {
    const custom = customFormatter(keyword, value);
    if (custom !== undefined) {
      return custom;
    }
  }
  if (keyword in NUMERIC_PREFIXES) {
    return typeof value === "number" ? `${NUMERIC_PREFIXES[keyword]} ${value}` : null;
  }
  if (keyword in BOOL_LABELS) {
    return value === true ? BOOL_LABELS[keyword] : null;
  }
  if (keyword === "format") {
    return typeof value === "string" && value.length > 0
      ? FORMAT_LABELS[value] ?? `format: ${value}`
      : null;
  }
  if (keyword === "pattern") {
    return typeof value === "string" ? `matches pattern /${value}/` : null;
  }
  if (keyword === "default") {
    return value !== undefined ? `default: ${stringifyCompact(value)}` : null;
  }
  if (keyword === "const") {
    return value !== undefined ? `must equal ${stringifyCompact(value)}` : null;
  }
  if (keyword === "examples") {
    return Array.isArray(value) && value.length > 0
      ? `examples: ${value.slice(0, 3).map(stringifyCompact).join(", ")}`
      : null;
  }
  if (keyword === "patternProperties" && value && typeof value === "object" && !Array.isArray(value)) {
    const patterns = Object.keys(value).sort();
    return patterns.length > 0 ? `keys matching /${patterns.join("/, /")}/` : null;
  }
  if (keyword === "dependentRequired" && value && typeof value === "object" && !Array.isArray(value)) {
    const rules = Object.keys(value)
      .sort()
      .map((k) => {
        const deps = (value as Record<string, unknown>)[k];
        return Array.isArray(deps) ? `${k} requires [${deps.join(", ")}]` : null;
      })
      .filter((x): x is string => x !== null);
    return rules.length > 0 ? `dependencies: ${rules.join("; ")}` : null;
  }
  if (keyword === "contentEncoding") {
    return typeof value === "string" ? `content encoding: ${value}` : null;
  }
  if (keyword === "contentMediaType") {
    return typeof value === "string" ? `media type: ${value}` : null;
  }
  if (keyword === "not") {
    return value && typeof value === "object" ? `must not match ${stringifyCompact(value)}` : null;
  }
  return null;
}

export function appendHoistedConstraints(
  baseDescription: string | undefined,
  constraints: readonly string[]
): string | undefined {
  const unique: string[] = [];
  for (const item of constraints) {
    const trimmed = item.trim();
    if (trimmed.length > 0 && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  if (unique.length === 0) {
    return baseDescription;
  }
  const suffix = `(${unique.join(", ")})`;
  if (!baseDescription || baseDescription.trim().length === 0) {
    return suffix;
  }
  const cleanBase = baseDescription.trim();
  return cleanBase.includes(suffix) ? cleanBase : `${cleanBase} ${suffix}`;
}
