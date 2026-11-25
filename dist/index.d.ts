export type TargetProvider = "openai-strict" | "anthropic" | "gemini" | "mcp";

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  nullable?: boolean;
  enum?: JsonValue[];
  const?: JsonValue;
  default?: JsonValue;
  examples?: JsonValue[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  propertyNames?: JsonSchema;
  propertyOrdering?: string[];
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JsonSchema>;
  unevaluatedProperties?: boolean | JsonSchema;
  items?: JsonSchema | JsonSchema[];
  prefixItems?: JsonSchema[];
  additionalItems?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: JsonSchema;
  minContains?: number;
  maxContains?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  contentEncoding?: string;
  contentMediaType?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  [key: string]: unknown;
}

export type NullableStrategy = "type-array" | "nullable-flag" | "preserve";

export interface ProviderProfile {
  readonly target: TargetProvider;
  readonly allowedKeywords: ReadonlySet<string>;
  readonly supportedFormats: ReadonlySet<string>;
  readonly requireRootObject: boolean;
  readonly forceAdditionalPropertiesFalse: boolean;
  readonly stripAdditionalProperties: boolean;
  readonly requireAllProperties: boolean;
  readonly nullableStrategy: NullableStrategy;
  readonly convertConstToEnum: boolean;
  readonly convertOneOfToAnyOf: boolean;
  readonly maxMinItems?: number;
}

export interface NormalizeOptions {
  target: TargetProvider;
  hoistUnsupportedConstraints?: boolean;
  maxDepth?: number;
  deterministicKeys?: boolean;
  preserveTitle?: boolean;
  customHoistFormatter?: (keyword: string, value: unknown) => string | null | undefined;
}

export type NormalizerFn = (schema: Readonly<JsonSchema>) => JsonSchema;

export declare const PROVIDER_PROFILES: Readonly<Record<TargetProvider, ProviderProfile>>;
export declare function getProviderProfile(target: TargetProvider): ProviderProfile;
export declare function formatConstraint(
  keyword: string,
  value: unknown,
  customFormatter?: (keyword: string, value: unknown) => string | null | undefined
): string | null;
export declare function appendHoistedConstraints(
  baseDescription: string | undefined,
  constraints: readonly string[]
): string | undefined;
export declare function resolveJsonPointer(root: Readonly<JsonSchema>, ref: string): JsonSchema | null;
export declare function mergeSchemas(schemas: readonly JsonSchema[]): JsonSchema;
export declare function normalizeSchema(
  schema: Readonly<JsonSchema>,
  options: NormalizeOptions
): JsonSchema;
export declare function createNormalizer(options: NormalizeOptions): NormalizerFn;
