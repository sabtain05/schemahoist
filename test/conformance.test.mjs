import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  normalizeSchema,
  createNormalizer,
  getProviderProfile,
  PROVIDER_PROFILES,
  formatConstraint,
  appendHoistedConstraints,
  resolveJsonPointer,
  mergeSchemas
} from "../dist/index.mjs";

const require = createRequire(import.meta.url);
const cjs = require("../dist/index.cjs");

function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj)) {
      deepFreeze(val);
    }
  }
  return obj;
}

test("ESM and CJS bundles export identical public API", () => {
  assert.equal(typeof cjs.normalizeSchema, "function");
  assert.equal(typeof cjs.createNormalizer, "function");
  assert.equal(typeof cjs.getProviderProfile, "function");
  assert.equal(typeof cjs.formatConstraint, "function");
  assert.equal(typeof cjs.appendHoistedConstraints, "function");
  assert.equal(typeof cjs.resolveJsonPointer, "function");
  assert.equal(typeof cjs.mergeSchemas, "function");
  assert.deepEqual(Object.keys(cjs.PROVIDER_PROFILES).sort(), Object.keys(PROVIDER_PROFILES).sort());

  const input = {
    type: "object",
    properties: {
      id: { type: "string", format: "uri", minLength: 8 }
    }
  };
  assert.deepEqual(
    cjs.normalizeSchema(input, { target: "openai-strict", hoistUnsupportedConstraints: true }),
    normalizeSchema(input, { target: "openai-strict", hoistUnsupportedConstraints: true })
  );
});

test("openai-strict enforces additionalProperties: false and required on all nested objects", () => {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      user: {
        type: "object",
        properties: {
          name: { type: "string" },
          nickname: { type: "string" }
        },
        required: ["name"]
      },
      age: { type: "integer" }
    },
    required: ["user"]
  };

  const result = normalizeSchema(schema, { target: "openai-strict" });

  assert.equal(result.$schema, undefined);
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(result.required, ["age", "user"]);
  assert.deepEqual(result.properties.age.type, ["integer", "null"]);
  assert.equal(result.properties.user.additionalProperties, false);
  assert.deepEqual(result.properties.user.required, ["name", "nickname"]);
  assert.equal(result.properties.user.properties.name.type, "string");
  assert.deepEqual(result.properties.user.properties.nickname.type, ["string", "null"]);
});

test("openai-strict handles optional enum and optional const safely", () => {
  const schema = {
    type: "object",
    properties: {
      priority: { type: "string", enum: ["low", "high"] },
      version: { const: "v2" }
    },
    required: []
  };

  const result = normalizeSchema(schema, { target: "openai-strict" });
  assert.deepEqual(result.required, ["priority", "version"]);
  assert.deepEqual(result.properties.priority.type, ["string", "null"]);
  assert.deepEqual(result.properties.priority.enum, ["low", "high", null]);
  assert.ok(Array.isArray(result.properties.version.anyOf));
  assert.deepEqual(result.properties.version.anyOf, [
    { const: "v2", type: "string" },
    { type: "null" }
  ]);
});

test("openai-strict hoists unsupported minLength, maxLength, default, and format: uri", () => {
  const schema = {
    type: "object",
    properties: {
      homepage: {
        type: "string",
        description: "User website",
        format: "uri",
        minLength: 10,
        maxLength: 200,
        default: "https://example.com"
      }
    },
    required: ["homepage"]
  };

  const result = normalizeSchema(schema, {
    target: "openai-strict",
    hoistUnsupportedConstraints: true
  });

  const prop = result.properties.homepage;
  assert.equal(prop.format, undefined);
  assert.equal(prop.minLength, undefined);
  assert.equal(prop.maxLength, undefined);
  assert.equal(prop.default, undefined);
  assert.equal(
    prop.description,
    'User website (default: "https://example.com", Must be a valid URI, max length 200, min length 10)'
  );
});

test("anthropic preserves optional required fields while enforcing strict constraints and hoisting", () => {
  const schema = {
    type: "object",
    properties: {
      score: {
        type: "number",
        minimum: 0,
        maximum: 100,
        multipleOf: 0.5
      },
      tags: {
        type: "array",
        items: { type: "string", minLength: 2, pattern: "^[a-z]+$" },
        minItems: 2,
        maxItems: 10,
        uniqueItems: true
      },
      callbackUrl: {
        type: "string",
        format: "uri"
      }
    },
    required: ["score"]
  };

  const result = normalizeSchema(schema, {
    target: "anthropic",
    hoistUnsupportedConstraints: true
  });

  assert.equal(result.additionalProperties, false);
  assert.deepEqual(result.required, ["score"]);
  assert.equal(result.properties.score.minimum, undefined);
  assert.equal(result.properties.score.maximum, undefined);
  assert.equal(result.properties.score.multipleOf, undefined);
  assert.equal(result.properties.score.description, "(maximum 100, minimum 0, multiple of 0.5)");

  assert.equal(result.properties.tags.minItems, undefined);
  assert.equal(result.properties.tags.maxItems, undefined);
  assert.equal(result.properties.tags.uniqueItems, undefined);
  assert.equal(
    result.properties.tags.description,
    "(max items 10, min items 2, items must be unique)"
  );
  assert.equal(
    result.properties.tags.items.description,
    "(min length 2, matches pattern /^[a-z]+$/)"
  );
  assert.equal(result.properties.callbackUrl.format, "uri");
});

test("anthropic retains minItems: 0 and minItems: 1 natively", () => {
  const schema = {
    type: "object",
    properties: {
      items: { type: "array", items: { type: "string" }, minItems: 1 }
    },
    required: ["items"]
  };

  const result = normalizeSchema(schema, { target: "anthropic" });
  assert.equal(result.properties.items.minItems, 1);
  assert.equal(result.properties.items.description, undefined);
});

test("gemini converts type arrays to nullable flag and hoists unsupported uuid format", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    propertyOrdering: ["id", "note"],
    properties: {
      id: { type: "string", format: "uuid", minLength: 36 },
      note: { type: ["string", "null"] },
      status: { const: "active" }
    },
    required: ["id"]
  };

  const result = normalizeSchema(schema, {
    target: "gemini",
    hoistUnsupportedConstraints: true
  });

  assert.equal(result.additionalProperties, undefined);
  assert.deepEqual(result.propertyOrdering, ["id", "note"]);
  assert.equal(result.properties.id.format, undefined);
  assert.equal(result.properties.id.minLength, 36);
  assert.equal(result.properties.id.description, "(Must be a valid UUID)");
  assert.equal(result.properties.note.type, "string");
  assert.equal(result.properties.note.nullable, true);
  assert.deepEqual(result.properties.status.enum, ["active"]);
  assert.equal(result.properties.status.const, undefined);
});

test("gemini converts multi-type arrays into anyOf with nullable flag", () => {
  const schema = {
    type: "object",
    properties: {
      payload: { type: ["string", "number", "null"] }
    }
  };

  const result = normalizeSchema(schema, { target: "gemini" });
  assert.equal(result.properties.payload.nullable, true);
  assert.deepEqual(result.properties.payload.anyOf, [
    { type: "string" },
    { type: "number" }
  ]);
});

test("mcp enforces root object, dereferences $defs/$ref, and strips $schema", () => {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: {
      Filter: {
        type: "object",
        properties: {
          field: { type: "string" },
          value: { type: "string" }
        },
        required: ["field"]
      }
    },
    type: "object",
    properties: {
      filter: { $ref: "#/$defs/Filter" }
    },
    required: ["filter"]
  };

  const result = normalizeSchema(schema, { target: "mcp" });
  assert.equal(result.$schema, undefined);
  assert.equal(result.$defs, undefined);
  assert.equal(result.type, "object");
  assert.equal(result.properties.filter.$ref, undefined);
  assert.equal(result.properties.filter.type, "object");
  assert.deepEqual(result.properties.filter.required, ["field"]);
});

test("handles RFC 6901 escaped JSON Pointers (~0 and ~1)", () => {
  const schema = {
    definitions: {
      "a/b~c": {
        type: "string",
        minLength: 4
      }
    },
    type: "object",
    properties: {
      key: { $ref: "#/definitions/a~1b~0c" }
    },
    required: ["key"]
  };

  const result = normalizeSchema(schema, { target: "openai-strict" });
  assert.equal(result.properties.key.type, "string");
  assert.equal(result.properties.key.description, "(min length 4)");
});

test("detects and gracefully caps direct and mutual circular $ref recursion", () => {
  const treeSchema = {
    $defs: {
      TreeNode: {
        type: "object",
        properties: {
          label: { type: "string" },
          children: {
            type: "array",
            items: { $ref: "#/$defs/TreeNode" }
          }
        },
        required: ["label"]
      }
    },
    $ref: "#/$defs/TreeNode"
  };

  const result = normalizeSchema(treeSchema, {
    target: "openai-strict",
    maxDepth: 2,
    hoistUnsupportedConstraints: true
  });

  const depth1 = result.properties.children.items;
  const depth2 = depth1.properties.children.items;
  assert.equal(depth1.type, "object");
  assert.equal(depth2.type, "object");
  assert.deepEqual(depth2.properties, {});
  assert.equal(depth2.additionalProperties, false);
  assert.match(depth2.description, /recursive reference to TreeNode truncated at max depth 2/);
});

test("flattens allOf and converts oneOf to anyOf", () => {
  const schema = {
    type: "object",
    allOf: [
      {
        description: "Base entity.",
        properties: { id: { type: "string" } },
        required: ["id"]
      },
      {
        description: "Timestamped.",
        properties: { createdAt: { type: "string", format: "date-time" } },
        required: ["createdAt"]
      }
    ],
    properties: {
      choice: {
        oneOf: [{ type: "string" }, { type: "integer" }]
      }
    },
    required: ["choice"]
  };

  const result = normalizeSchema(schema, { target: "openai-strict" });
  assert.equal(result.allOf, undefined);
  assert.equal(result.description, "Base entity. Timestamped.");
  assert.deepEqual(result.required, ["choice", "createdAt", "id"]);
  assert.equal(result.properties.choice.oneOf, undefined);
  assert.deepEqual(result.properties.choice.anyOf, [{ type: "string" }, { type: "integer" }]);
});

test("handles Draft-04 boolean exclusiveMinimum/exclusiveMaximum and prefixItems tuples", () => {
  const schema = {
    type: "object",
    properties: {
      ratio: {
        type: "number",
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 1,
        exclusiveMaximum: true
      },
      coords: {
        type: "array",
        prefixItems: [{ type: "number" }, { type: "number" }]
      }
    },
    required: ["ratio", "coords"]
  };

  const result = normalizeSchema(schema, { target: "anthropic" });
  assert.equal(result.properties.ratio.description, "(must be < 1, must be > 0)");
  assert.equal(result.properties.coords.description, "(tuple of length 2)");
  assert.deepEqual(result.properties.coords.items, {
    anyOf: [{ type: "number" }, { type: "number" }]
  });
});

test("strictly immutable: never mutates deeply frozen input schemas", () => {
  const frozen = deepFreeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: {
      Tag: { type: "string", minLength: 3 }
    },
    type: "object",
    properties: {
      tags: { type: "array", items: { $ref: "#/$defs/Tag" } },
      meta: { type: "object", properties: { active: { type: "boolean" } } }
    },
    required: ["tags"]
  });

  const targets = ["openai-strict", "anthropic", "gemini", "mcp"];
  for (const target of targets) {
    const out = normalizeSchema(frozen, { target });
    assert.notEqual(out, frozen);
    assert.equal(out.type, "object");
  }
});

test("strictly deterministic: identical output regardless of input property insertion order", () => {
  const schemaA = {
    type: "object",
    properties: {
      zeta: { type: "string", maxLength: 50, minLength: 2 },
      alpha: { type: "integer", maximum: 10, minimum: 1 }
    },
    required: ["zeta", "alpha"]
  };

  const schemaB = {
    required: ["alpha", "zeta"],
    properties: {
      alpha: { minimum: 1, maximum: 10, type: "integer" },
      zeta: { minLength: 2, type: "string", maxLength: 50 }
    },
    type: "object"
  };

  for (const target of ["openai-strict", "anthropic", "gemini", "mcp"]) {
    const outA = JSON.stringify(normalizeSchema(schemaA, { target }));
    const outB = JSON.stringify(normalizeSchema(schemaB, { target }));
    assert.equal(outA, outB);
  }
});

test("hoistUnsupportedConstraints: false suppresses description hoisting", () => {
  const schema = {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid", minLength: 36 }
    },
    required: ["id"]
  };

  const result = normalizeSchema(schema, {
    target: "gemini",
    hoistUnsupportedConstraints: false
  });
  assert.equal(result.properties.id.format, undefined);
  assert.equal(result.properties.id.description, undefined);
});

test("supports customHoistFormatter and createNormalizer factory", () => {
  const normalizer = createNormalizer({
    target: "anthropic",
    customHoistFormatter: (keyword, value) => {
      if (keyword === "pattern") {
        return `regex=${value}`;
      }
      return undefined;
    }
  });

  const out = normalizer({
    type: "object",
    properties: {
      code: { type: "string", pattern: "^[A-Z]{3}$" }
    },
    required: ["code"]
  });

  assert.equal(out.properties.code.description, "(regex=^[A-Z]{3}$)");
});

test("normalizes root union into root object for providers requiring root object", () => {
  const schema = {
    oneOf: [
      { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      { type: "object", properties: { b: { type: "number" } }, required: ["b"] }
    ]
  };

  const out = normalizeSchema(schema, { target: "openai-strict" });
  assert.equal(out.type, "object");
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.required, ["a", "b"]);
});

test("validates bad inputs with explicit errors", () => {
  assert.throws(() => normalizeSchema(null, { target: "openai-strict" }), TypeError);
  assert.throws(() => normalizeSchema({}, { target: "unknown" }), Error);
  assert.throws(() => normalizeSchema({}, { target: "openai-strict", maxDepth: 0 }), RangeError);
});

test("helper exports work independently", () => {
  assert.equal(getProviderProfile("mcp").target, "mcp");
  assert.equal(formatConstraint("minLength", 8), "min length 8");
  assert.equal(formatConstraint("$schema", "draft"), null);
  assert.equal(appendHoistedConstraints("User ID", ["Must be a valid UUID"]), "User ID (Must be a valid UUID)");
  assert.deepEqual(resolveJsonPointer({ a: { b: { type: "string" } } }, "#/a/b"), { type: "string" });
  assert.deepEqual(
    mergeSchemas([
      { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      { type: "object", properties: { b: { type: "number" } }, required: ["b"] }
    ]),
    {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a", "b"]
    }
  );
});

test("caps mutual circular $ref recursion cleanly without infinite loop", () => {
  const mutual = {
    $defs: {
      Author: {
        type: "object",
        properties: {
          name: { type: "string" },
          books: { type: "array", items: { $ref: "#/$defs/Book" } }
        },
        required: ["name"]
      },
      Book: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { $ref: "#/$defs/Author" }
        },
        required: ["title"]
      }
    },
    $ref: "#/$defs/Author"
  };

  const out = normalizeSchema(mutual, { target: "mcp", maxDepth: 2 });
  assert.equal(out.type, "object");
  const book1 = out.properties.books.items;
  const author2 = book1.properties.author;
  const book2 = author2.properties.books.items;
  const cappedAuthor = book2.properties.author;
  assert.deepEqual(cappedAuthor.properties, {});
  assert.match(cappedAuthor.description, /recursive reference to Author truncated at max depth 2/);
});

test("hoists OpenAPI 3.0 nullable, patternProperties, dependentRequired, examples, not, and flags", () => {
  const openApiSchema = {
    type: "object",
    properties: {
      email: {
        type: "string",
        nullable: true,
        examples: ["a@b.com", "c@d.com"],
        readOnly: true,
        deprecated: true
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        patternProperties: { "^X-": { type: "string" } },
        minProperties: 1
      },
      secret: {
        type: "string",
        not: { const: "admin" }
      }
    },
    dependentRequired: {
      email: ["headers"]
    },
    required: ["email", "headers", "secret"]
  };

  const out = normalizeSchema(openApiSchema, { target: "openai-strict" });
  assert.deepEqual(out.properties.email.type, ["string", "null"]);
  assert.equal(out.properties.email.nullable, undefined);
  assert.match(out.properties.email.description, /deprecated/);
  assert.match(out.properties.email.description, /read-only/);
  assert.match(out.properties.email.description, /examples: "a@b.com", "c@d.com"/);
  assert.equal(out.properties.headers.additionalProperties, false);
  assert.match(out.properties.headers.description, /dynamic values of type string/);
  assert.match(out.properties.headers.description, /keys matching \/\^X-\//);
  assert.match(out.properties.headers.description, /min properties 1/);
  assert.match(out.properties.secret.description, /must not match \{"const":"admin"\}/);
  assert.match(out.description, /dependencies: email requires \[headers\]/);
});

test("eliminates phantom required keys not declared in properties", () => {
  const schema = {
    type: "object",
    properties: {
      id: { type: "string" }
    },
    required: ["id", "ghostField"]
  };

  for (const target of ["openai-strict", "anthropic", "gemini", "mcp"]) {
    const out = normalizeSchema(schema, { target });
    assert.deepEqual(out.required, ["id"]);
  }
});

test("normalizes real-world complex Zod/OpenAPI order payload across all four targets", () => {
  const orderSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://api.example.com/schemas/order.json",
    $defs: {
      Money: {
        type: "object",
        properties: {
          amount: { type: "number", minimum: 0, multipleOf: 0.01 },
          currency: { type: "string", enum: ["USD", "EUR", "GBP"] }
        },
        required: ["amount", "currency"]
      },
      LineItem: {
        type: "object",
        properties: {
          sku: { type: "string", minLength: 6, maxLength: 32, pattern: "^[A-Z0-9-]+$" },
          quantity: { type: "integer", minimum: 1, maximum: 999 },
          unitPrice: { $ref: "#/$defs/Money" }
        },
        required: ["sku", "quantity", "unitPrice"]
      }
    },
    type: "object",
    title: "CreateOrderInput",
    description: "Creates a customer order",
    properties: {
      orderId: { type: "string", format: "uuid", minLength: 36 },
      customerEmail: { type: "string", format: "email" },
      webhookUrl: { type: "string", format: "uri" },
      items: { type: "array", items: { $ref: "#/$defs/LineItem" }, minItems: 1, uniqueItems: true },
      couponCode: { type: "string", minLength: 4 },
      metadata: { type: "object", additionalProperties: { type: "string" } }
    },
    required: ["orderId", "customerEmail", "items"]
  };

  const openai = normalizeSchema(orderSchema, { target: "openai-strict" });
  assert.equal(openai.$schema, undefined);
  assert.equal(openai.$id, undefined);
  assert.equal(openai.$defs, undefined);
  assert.equal(openai.additionalProperties, false);
  assert.deepEqual(openai.required, ["couponCode", "customerEmail", "items", "metadata", "orderId", "webhookUrl"]);
  assert.deepEqual(openai.properties.couponCode.type, ["string", "null"]);
  assert.equal(openai.properties.webhookUrl.format, undefined);
  assert.match(openai.properties.webhookUrl.description, /Must be a valid URI/);
  assert.equal(openai.properties.items.items.additionalProperties, false);

  const anthropic = normalizeSchema(orderSchema, { target: "anthropic" });
  assert.equal(anthropic.additionalProperties, false);
  assert.deepEqual(anthropic.required, ["customerEmail", "items", "orderId"]);
  assert.equal(anthropic.properties.webhookUrl.format, "uri");
  assert.equal(anthropic.properties.items.minItems, 1);
  assert.match(anthropic.properties.items.description, /items must be unique/);

  const gemini = normalizeSchema(orderSchema, { target: "gemini" });
  assert.equal(gemini.additionalProperties, undefined);
  assert.equal(gemini.properties.orderId.format, undefined);
  assert.equal(gemini.properties.orderId.minLength, 36);
  assert.match(gemini.properties.orderId.description, /Must be a valid UUID/);

  const mcp = normalizeSchema(orderSchema, { target: "mcp" });
  assert.equal(mcp.type, "object");
  assert.equal(mcp.properties.items.items.properties.unitPrice.type, "object");
  assert.equal(mcp.properties.items.uniqueItems, true);
});
