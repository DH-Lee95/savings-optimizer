import test from "node:test";
import assert from "node:assert/strict";

import { SAMPLE_PRODUCTS } from "./products.js";

test("sample products cover parking, deposit, and installment products", () => {
  const types = new Set(SAMPLE_PRODUCTS.map((product) => product.type));
  assert.ok(types.has("parking"));
  assert.ok(types.has("deposit"));
  assert.ok(types.has("installment"));
});

test("sample products expose mobile MVP payment-report data needs", () => {
  for (const product of SAMPLE_PRODUCTS) {
    assert.ok(product.id);
    assert.ok(product.bank);
    assert.ok(product.name);
    assert.ok(product.officialUrl);
    assert.ok(product.updatedAt);
    assert.ok(product.baseRate <= product.maxRate);
    assert.ok(Array.isArray(product.conditions));
  }
});
