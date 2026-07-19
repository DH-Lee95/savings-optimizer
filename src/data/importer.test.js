import test from "node:test";
import assert from "node:assert/strict";

import { mergeRawProducts } from "./importer.js";

const existing = [
  {
    source: "manual",
    sourceUrl: "https://example.com/a",
    scrapedAt: "2026-07-17",
    reviewStatus: "approved",
    bankName: "새봄은행",
    productName: "첫거래 정기예금",
    productType: "예금",
    baseRateText: "3.0%",
    maxRateText: "4.3%",
    termText: "12개월",
    maxAmountText: "4000만원",
    monthlyLimitText: "",
    channelText: "모바일 앱",
    protectionText: "예금자보호 대상",
    conditionText: "첫거래 연 0.6%p",
    officialUrl: "https://example.com/a",
  },
];

test("mergeRawProducts preserves approved status when imported product is unchanged", () => {
  const imported = [
    {
      ...existing[0],
      source: "fss-csv",
      scrapedAt: "2026-07-18",
      reviewStatus: "pending",
      productType: "deposit",
    },
  ];
  const result = mergeRawProducts(existing, imported);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].reviewStatus, "approved");
  assert.equal(result.changeLog.length, 0);
  assert.equal(result.summary.unchangedCount, 1);
});

test("mergeRawProducts marks changed approved product as pending review", () => {
  const imported = [
    {
      ...existing[0],
      source: "fss-csv",
      scrapedAt: "2026-07-18",
      reviewStatus: "pending",
      maxRateText: "4.6%",
    },
  ];

  const result = mergeRawProducts(existing, imported);

  assert.equal(result.products[0].reviewStatus, "pending");
  assert.equal(result.products[0].previousReviewStatus, "approved");
  assert.equal(result.changeLog.length, 1);
  assert.equal(result.changeLog[0].changes[0].field, "maxRateText");
  assert.equal(result.summary.changedCount, 1);
});

test("mergeRawProducts appends new imported products as pending review", () => {
  const imported = [
    {
      ...existing[0],
      bankName: "하나은행",
      productName: "모바일 우대예금",
      sourceUrl: "https://example.com/b",
      officialUrl: "https://example.com/b",
      reviewStatus: "pending",
    },
  ];

  const result = mergeRawProducts(existing, imported);
  const newProduct = result.products.find((product) => product.productName === "모바일 우대예금");

  assert.equal(result.products.length, 2);
  assert.equal(newProduct.reviewStatus, "pending");
  assert.equal(result.summary.newCount, 1);
});

test("mergeRawProducts marks missing source products as removed when requested", () => {
  const result = mergeRawProducts([
    {
      ...existing[0],
      source: "naver-pay-savings",
      productType: "deposit",
    },
  ], [], {
    markMissingSource: "naver-pay-savings",
    scrapedAt: "2026-07-18",
  });

  assert.equal(result.products[0].reviewStatus, "pending");
  assert.equal(result.products[0].availabilityStatus, "removed");
  assert.equal(result.summary.removedCount, 1);
  assert.equal(result.changeLog[0].changes[0].field, "availabilityStatus");
});
