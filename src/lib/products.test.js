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

test("active catalog marks military and child restricted products with profile eligibility flags", () => {
  const militaryProducts = SAMPLE_PRODUCTS.filter((product) => /장병|군인/.test(product.name));
  const childProducts = SAMPLE_PRODUCTS.filter((product) => /아이사랑|우리아이|아이키움|아이든든|아이통장|자녀/.test(product.name));

  assert.ok(militaryProducts.length > 0);
  assert.ok(childProducts.length > 0);
  assert.equal(
    militaryProducts.every((product) => product.eligibility?.flags?.includes("military")),
    true,
  );
  assert.equal(
    childProducts.every((product) => product.eligibility?.flags?.includes("child")),
    true,
  );
});
