import test from "node:test";
import assert from "node:assert/strict";

import {
  PAID_PRODUCT,
  consumePaidReportAccess,
  createPaidAccessStore,
  createPaidCheckout,
  recalculatePaidReport,
} from "./paid-access.js";

const baseInput = {
  monthlySavings: 1500000,
  horizonMonths: 12,
  contributionStyle: "balanced",
  financialSectorLimit: "savingsBankIncluded",
  maxAllocationCount: null,
  conditions: { salaryTransfer: true },
  specialEligibility: {},
  excludedProductIds: [],
};

function fakeReport(input) {
  return {
    reportId: `report-${input.excludedProductIds?.join("-") || "base"}`,
    inputSnapshot: input,
  };
}

test("paid product is a one-week half-price launch offer at 1490 KRW", () => {
  assert.equal(PAID_PRODUCT.code, "monthly-savings-report");
  assert.equal(PAID_PRODUCT.price, 1490);
  assert.equal(PAID_PRODUCT.originalPrice, 2980);
  assert.match(PAID_PRODUCT.promoText, /일주일|1주일/);
  assert.match(PAID_PRODUCT.promoText, /반값/);
});

test("paid access token can create one locked report for the purchased input", async () => {
  const store = createPaidAccessStore();
  const checkout = createPaidCheckout(store, {
    email: "paid@example.com",
    input: baseInput,
    mode: "mock",
  });

  const result = await consumePaidReportAccess(store, {
    accessToken: checkout.accessToken,
    input: baseInput,
    excludedProductIds: [],
    createReport: fakeReport,
  });

  assert.equal(result.report.reportId, "report-base");
  assert.equal(result.entitlement.consumed, true);

  await assert.rejects(() => consumePaidReportAccess(store, {
    accessToken: checkout.accessToken,
    input: { ...baseInput, monthlySavings: 2000000 },
    excludedProductIds: [],
    createReport: fakeReport,
  }), /PAID_INPUT_MISMATCH/);
});

test("same paid report can be recalculated only by excluding products, not by changing the paid input", async () => {
  const store = createPaidAccessStore();
  const checkout = createPaidCheckout(store, {
    email: "paid@example.com",
    input: baseInput,
    mode: "mock",
  });

  await consumePaidReportAccess(store, {
    accessToken: checkout.accessToken,
    input: baseInput,
    excludedProductIds: [],
    createReport: fakeReport,
  });

  const recalculated = await recalculatePaidReport(store, {
    accessToken: checkout.accessToken,
    excludedProductIds: ["product-a"],
    createReport: fakeReport,
  });

  assert.equal(recalculated.report.reportId, "report-product-a");
  assert.deepEqual(recalculated.report.inputSnapshot.excludedProductIds, ["product-a"]);
});

test("unpaid or already failed access cannot create a paid report", async () => {
  const store = createPaidAccessStore();
  const checkout = createPaidCheckout(store, {
    email: "paid@example.com",
    input: baseInput,
    mode: "pending",
  });

  await assert.rejects(() => consumePaidReportAccess(store, {
    accessToken: checkout.accessToken,
    input: baseInput,
    excludedProductIds: [],
    createReport: fakeReport,
  }), /PAYMENT_NOT_CONFIRMED/);
});
