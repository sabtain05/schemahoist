import type { ProviderProfile, TargetProvider } from "./types.js";

const CORE_KEYWORDS = [
  "type",
  "description",
  "title",
  "properties",
  "required",
  "items",
  "anyOf",
  "enum"
] as const;

const NUMERIC_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf"
] as const;

const BASE_FORMATS = [
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid"
] as const;

const OPENAI_STRICT_PROFILE: ProviderProfile = {
  target: "openai-strict",
  allowedKeywords: new Set([
    ...CORE_KEYWORDS,
    "additionalProperties",
    "const",
    "pattern",
    "format",
    ...NUMERIC_KEYWORDS,
    "minItems",
    "maxItems"
  ]),
  supportedFormats: new Set(BASE_FORMATS),
  requireRootObject: true,
  forceAdditionalPropertiesFalse: true,
  stripAdditionalProperties: false,
  requireAllProperties: true,
  nullableStrategy: "type-array",
  convertConstToEnum: false,
  convertOneOfToAnyOf: true
};

const ANTHROPIC_PROFILE: ProviderProfile = {
  target: "anthropic",
  allowedKeywords: new Set([
    ...CORE_KEYWORDS,
    "additionalProperties",
    "const",
    "format",
    "minItems"
  ]),
  supportedFormats: new Set([...BASE_FORMATS, "uri"]),
  requireRootObject: true,
  forceAdditionalPropertiesFalse: true,
  stripAdditionalProperties: false,
  requireAllProperties: false,
  nullableStrategy: "type-array",
  convertConstToEnum: false,
  convertOneOfToAnyOf: true,
  maxMinItems: 1
};

const GEMINI_PROFILE: ProviderProfile = {
  target: "gemini",
  allowedKeywords: new Set([
    ...CORE_KEYWORDS,
    "nullable",
    "format",
    "propertyOrdering",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "minProperties",
    "maxProperties",
    "pattern"
  ]),
  supportedFormats: new Set(["enum", "date-time", "float", "double", "int32", "int64"]),
  requireRootObject: false,
  forceAdditionalPropertiesFalse: false,
  stripAdditionalProperties: true,
  requireAllProperties: false,
  nullableStrategy: "nullable-flag",
  convertConstToEnum: true,
  convertOneOfToAnyOf: true
};

const MCP_PROFILE: ProviderProfile = {
  target: "mcp",
  allowedKeywords: new Set([
    ...CORE_KEYWORDS,
    "additionalProperties",
    "const",
    "format",
    "minLength",
    "maxLength",
    "pattern",
    ...NUMERIC_KEYWORDS,
    "minItems",
    "maxItems",
    "uniqueItems",
    "default"
  ]),
  supportedFormats: new Set([...BASE_FORMATS, "uri"]),
  requireRootObject: true,
  forceAdditionalPropertiesFalse: false,
  stripAdditionalProperties: false,
  requireAllProperties: false,
  nullableStrategy: "type-array",
  convertConstToEnum: false,
  convertOneOfToAnyOf: true
};

export const PROVIDER_PROFILES: Readonly<Record<TargetProvider, ProviderProfile>> = {
  "openai-strict": OPENAI_STRICT_PROFILE,
  anthropic: ANTHROPIC_PROFILE,
  gemini: GEMINI_PROFILE,
  mcp: MCP_PROFILE
};

export function getProviderProfile(target: TargetProvider): ProviderProfile {
  const profile = PROVIDER_PROFILES[target];
  if (!profile) {
    throw new Error(`Unsupported target provider: ${String(target)}`);
  }
  return profile;
}
