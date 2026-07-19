import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reviewProducts } from "./review-products.js";

function writeRawProductFixture(rawPath) {
  writeFileSync(
    rawPath,
    JSON.stringify([
      {
        source: "fss-csv",
        sourceUrl: "https://example.com/a",
        scrapedAt: "2026-07-18",
        reviewStatus: "pending",
        previousReviewStatus: "approved",
        bankName: "하나은행",
        productName: "급여 우대 적금",
        productType: "적금",
        baseRateText: "3.0%",
        maxRateText: "5.2%",
        termText: "12개월",
        maxAmountText: "",
        monthlyLimitText: "50만원",
        channelText: "모바일 앱",
        protectionText: "예금자보호 대상",
        conditionText: "급여이체 연 0.5%p",
        officialUrl: "https://example.com/a",
      },
      {
        source: "naver-pay-savings",
        sourceUrl: "https://example.com/b",
        scrapedAt: "2026-07-18",
        reviewStatus: "pending",
        bankName: "OK저축은행",
        productName: "OK파킹통장",
        productType: "parking",
        baseRateText: "0.1%",
        maxRateText: "7.0%",
        termText: "",
        maxAmountText: "제한없음",
        monthlyLimitText: "",
        channelText: "모바일 앱",
        protectionText: "예금자보호 대상",
        conditionText: "간편결제 계좌 등록",
        officialUrl: "https://example.com/b",
        structuredConditions: [{ key: "payAccountRegistration" }],
      },
    ]),
  );
}

test("reviewProducts lists pending review items from files", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");
  const changeLogPath = join(dir, "change-log.json");

  writeRawProductFixture(rawPath);
  writeFileSync(
    changeLogPath,
    JSON.stringify({
      entries: [
        {
          key: "하나은행|급여 우대 적금|installment",
          changedAt: "2026-07-18",
          changes: [{ field: "maxRateText", before: "5.0%", after: "5.2%" }],
        },
      ],
    }),
  );

  const result = reviewProducts({ action: "list", rawPath, changeLogPath });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].changes.length, 1);
});

test("reviewProducts filters pending review list by source, type, condition, and limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");

  writeRawProductFixture(rawPath);

  const result = reviewProducts({
    action: "list",
    rawPath,
    filters: {
      source: "naver-pay-savings",
      type: "parking",
      condition: "payAccountRegistration",
      sort: "max-rate",
      limit: 1,
    },
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].bankName, "OK저축은행");
});

test("reviewProducts approves product and refreshes active catalog files", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");
  const activePath = join(dir, "active-products.json");
  const modulePath = join(dir, "products.js");

  writeRawProductFixture(rawPath);

  const result = reviewProducts({
    action: "approve",
    rawPath,
    activePath,
    modulePath,
    reviewedAt: "2026-07-18T09:00:00.000Z",
    today: "2026-07-18",
    selector: {
      bankName: "하나은행",
      productName: "급여 우대 적금",
      productType: "installment",
    },
  });
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const active = JSON.parse(readFileSync(activePath, "utf8"));
  const module = readFileSync(modulePath, "utf8");

  assert.equal(result.reviewedProduct.reviewStatus, "approved");
  assert.equal(raw[0].reviewStatus, "approved");
  assert.equal(active.products.length, 1);
  assert.match(module, /급여 우대 적금/);
});

test("reviewProducts auto-approves low-risk Naver candidates and refreshes catalog", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");
  const activePath = join(dir, "active-products.json");
  const modulePath = join(dir, "products.js");

  writeRawProductFixture(rawPath);

  const result = reviewProducts({
    action: "auto-approve",
    rawPath,
    activePath,
    modulePath,
    reviewedAt: "2026-07-18T09:00:00.000Z",
    today: "2026-07-18",
    filters: {
      source: "naver-pay-savings",
      limitsByType: { parking: 1 },
    },
  });
  const active = JSON.parse(readFileSync(activePath, "utf8"));

  assert.equal(result.summary.approvedCount, 1);
  assert.equal(active.products.length, 1);
  assert.equal(active.products[0].bank, "OK저축은행");
});

test("reviewProducts rejects product and keeps it out of active catalog", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");
  const activePath = join(dir, "active-products.json");
  const modulePath = join(dir, "products.js");

  writeRawProductFixture(rawPath);

  const result = reviewProducts({
    action: "reject",
    rawPath,
    activePath,
    modulePath,
    reviewedAt: "2026-07-18T09:00:00.000Z",
    today: "2026-07-18",
    reason: "공식 링크 확인 실패",
    selector: {
      bankName: "하나은행",
      productName: "급여 우대 적금",
      productType: "installment",
    },
  });
  const active = JSON.parse(readFileSync(activePath, "utf8"));

  assert.equal(result.reviewedProduct.reviewStatus, "rejected");
  assert.equal(active.products.length, 0);
  assert.equal(active.rejectedProducts[0].validationErrors[0], "not_approved");
});

test("reviewProducts rejects unknown actions before mutating files", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-products-"));
  const rawPath = join(dir, "raw-products.json");

  writeRawProductFixture(rawPath);

  assert.throws(
    () =>
      reviewProducts({
        action: "archive",
        rawPath,
        selector: {
          bankName: "하나은행",
          productName: "급여 우대 적금",
          productType: "installment",
        },
      }),
    /Unknown review action/,
  );

  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  assert.equal(raw[0].reviewStatus, "pending");
});
