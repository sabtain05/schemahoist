# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-24

### Added

- Core `normalizeSchema` and `createNormalizer` APIs with zero runtime dependencies and dual ESM/CJS builds (`< 5 KB` gzipped).
- Provider capability profiles for `openai-strict`, `anthropic`, `gemini`, and `mcp`.
- Deterministic constraint hoisting engine (`formatConstraint`, `appendHoistedConstraints`) with `customHoistFormatter` hook.
- Cycle-safe RFC 6901 `$ref` dereferencer (`resolveJsonPointer`) with configurable `maxDepth` capping for direct and mutual recursion.
- `allOf` schema flattening (`mergeSchemas`), `oneOf` to `anyOf` normalization, Draft-04 boolean `exclusiveMinimum`/`exclusiveMaximum` support, OpenAPI 3.0 `nullable` handling, and tuple (`prefixItems` / `items` array) normalization.
- Exhaustive 24-case conformance test suite verified on Node.js native test runner across both ESM and CJS bundles.
