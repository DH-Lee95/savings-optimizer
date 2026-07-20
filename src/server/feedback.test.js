import test from "node:test";
import assert from "node:assert/strict";

import {
  consumePaidReportAccess,
  createPaidAccessStore,
  createPaidCheckout,
} from "./paid-access.js";
import {
  createFeedbackStore,
  serializeFeedbackStore,
  submitReportFeedback,
} from "./feedback.js";

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

function fakeReport() {
  return {
    reportId: "report-feedback",
    inputSnapshot: baseInput,
  };
}

test("report feedback is stored only for a consumed paid report", async () => {
  const accessStore = createPaidAccessStore();
  const feedbackStore = createFeedbackStore();
  const checkout = createPaidCheckout(accessStore, {
    input: baseInput,
    mode: "mock",
  });

  await consumePaidReportAccess(accessStore, {
    accessToken: checkout.accessToken,
    input: baseInput,
    excludedProductIds: [],
    createReport: fakeReport,
  });

  const result = submitReportFeedback(feedbackStore, accessStore, {
    accessToken: checkout.accessToken,
    reportId: "report-feedback",
    couponEmail: "coupon@example.com",
    message: "조건 설명과 추천 제외 재계산 흐름이 도움이 됐습니다.",
  });

  assert.equal(result.feedback.reportId, "report-feedback");
  assert.equal(result.feedback.couponEmail, "coupon@example.com");
  assert.equal(result.feedback.message.includes("재계산"), true);
  assert.equal(result.feedback.accessTokenHash.length, 64);
  assert.equal(result.feedback.accessToken, undefined);
  assert.equal(serializeFeedbackStore(feedbackStore).length, 1);
});

test("report feedback rejects invalid email or report access", () => {
  const accessStore = createPaidAccessStore();
  const feedbackStore = createFeedbackStore();
  const checkout = createPaidCheckout(accessStore, {
    input: baseInput,
    mode: "mock",
  });

  assert.throws(() => submitReportFeedback(feedbackStore, accessStore, {
    accessToken: checkout.accessToken,
    reportId: "report-feedback",
    couponEmail: "not-an-email",
    message: "좋았습니다.",
  }), /REPORT_NOT_CREATED/);

  assert.throws(() => submitReportFeedback(feedbackStore, accessStore, {
    accessToken: "missing",
    reportId: "report-feedback",
    couponEmail: "coupon@example.com",
    message: "좋았습니다.",
  }), /INVALID_ACCESS_TOKEN/);
});
