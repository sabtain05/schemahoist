# schemahoist

Zero-dependency, runtime-agnostic TypeScript library that compiles any valid JSON Schema (Zod, Valibot, TypeBox, or OpenAPI) into the strict provider-specific subset required by OpenAI Structured Outputs, Anthropic Claude Tool Use, Google Gemini Structured Outputs, or MCP servers — while hoisting unsupported validation constraints into `description` so the model still obeys them.

## Features

- **Zero dependencies & under 5 KB gzipped** (`4.72 KB` ESM / `4.75 KB` CJS gzipped).
- **Purely runtime-agnostic**: runs identically in Node.js, Bun, Deno, Cloudflare Workers, and browsers with zero platform built-ins.
- **Immutable & deterministic**: never mutates the input schema and sorts object keys deterministically to preserve LLM prompt caching.
- **Constraint hoisting**: automatically converts stripped keywords (`format`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `default`, `examples`, `uniqueItems`, `patternProperties`, `dependentRequired`, `not`, `readOnly`, `writeOnly`, `deprecated`) into concise natural-language rules appended to `description`.
- **Cycle-safe `$ref` dereferencing**: resolves `$defs`, `definitions`, and RFC 6901 escaped JSON Pointers (`~0`, `~1`), flattens `allOf`, converts `oneOf` to `anyOf`, and gracefully caps direct or mutual circular references at `maxDepth`.

## Installation

```bash
npm install schemahoist
```

## Quick Start

```ts
import { normalizeSchema } from "schemahoist";

const rawJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    id: {
      type: "string",
      format: "uuid",
      minLength: 36
    },
    homepage: {
      type: "string",
      description: "Company website",
      format: "uri",
      minLength: 10
    }
  },
  required: ["id"]
};

const openaiSchema = normalizeSchema(rawJsonSchema, {
  target: "openai-strict",
  hoistUnsupportedConstraints: true
});
```

Normalized `openai-strict` output:

```json
{
  "additionalProperties": false,
  "properties": {
    "homepage": {
      "description": "Company website (Must be a valid URI, min length 10)",
      "type": ["string", "null"]
    },
    "id": {
      "description": "(min length 36)",
      "format": "uuid",
      "type": "string"
    }
  },
  "required": ["homepage", "id"],
  "type": "object"
}
```

## Provider Compatibility Matrix

| Target | Root Object Enforced | `additionalProperties` | Optional Properties | Nullable Encoding | Unsupported Keywords |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `openai-strict` | Yes | Forced `false` | Added to `required` as nullable | `type: [T, "null"]` / `anyOf` | Stripped & hoisted |
| `anthropic` | Yes | Forced `false` | Preserved as optional | `type: [T, "null"]` | Stripped & hoisted |
| `gemini` | No | Stripped | Preserved as optional | `nullable: true` | Stripped & hoisted |
| `mcp` | Yes | Preserved | Preserved as optional | `type: [T, "null"]` | Stripped & hoisted |

## API Reference

### `normalizeSchema(schema, options)`

Compiles `schema` into a fresh, normalized JSON Schema object for the selected provider.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `target` | `"openai-strict" \| "anthropic" \| "gemini" \| "mcp"` | Required | Target LLM provider or MCP dialect. |
| `hoistUnsupportedConstraints` | `boolean` | `true` | Appends stripped validation keywords into `description`. |
| `maxDepth` | `number` | `5` | Maximum recursion depth for circular `$ref` dereferencing. |
| `deterministicKeys` | `boolean` | `true` | Sorts all output object keys lexicographically for prompt-cache stability. |
| `preserveTitle` | `boolean` | `true` | Retains `title` when permitted by the target profile. |
| `customHoistFormatter` | `(keyword: string, value: unknown) => string \| null \| undefined` | `undefined` | Optional hook to customize or suppress hoisted constraint strings. |

### `createNormalizer(options)`

Creates a reusable normalizer function bound to a fixed options object.

```ts
import { createNormalizer } from "schemahoist";

const toAnthropic = createNormalizer({
  target: "anthropic",
  hoistUnsupportedConstraints: true
});

const toolSchema = toAnthropic(rawJsonSchema);
```

### Additional Exports

- `PROVIDER_PROFILES`: Read-only registry of all built-in provider capability profiles.
- `getProviderProfile(target)`: Returns the profile for a given target or throws on unknown targets.
- `formatConstraint(keyword, value, customFormatter?)`: Formats a single JSON Schema keyword into a hoisted constraint phrase.
- `appendHoistedConstraints(baseDescription, constraints)`: Appends deduplicated constraint phrases to an existing description.
- `resolveJsonPointer(root, ref)`: Resolves an RFC 6901 local JSON Pointer against a root schema.
- `mergeSchemas(schemas)`: Deterministically merges an array of schemas (`allOf` flattening).

## Development & Testing

```bash
npm test
```

## License

MIT

---

<strong>A Sabtain Ali production</strong>
