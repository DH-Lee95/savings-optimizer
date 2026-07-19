import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { importNaverProducts } from "./import-naver-products.js";

test("importNaverProducts merges Naver products into raw review queue", () => {
  const dir = mkdtempSync(join(tmpdir(), "naver-import-"));
  const incomingPath = join(dir, "naver-products.json");
  const rawPath = join(dir, "raw-products.json");
  const changeLogPath = join(dir, "change-log.json");

  writeFileSync(
    incomingPath,
    JSON.stringify({
      metadata: { source: "naver-pay-savings", scrapedAt: "2026-07-18" },
      products: [
        {
          source: "naver-pay-savings",
          sourceUrl: "https://pay.naver.com/savings/list/deposit",
          scrapedAt: "2026-07-18",
          reviewStatus: "pending",
          bankName: "테스트은행",
          productName: "정기예금",
          productType: "deposit",
          baseRateText: "연 3.0%",
          maxRateText: "최고 연 4.0%",
          termText: "12개월",
          maxAmountText: "1000만원",
          monthlyLimitText: "",
          channelText: "모바일",
          protectionText: "예금자보호 확인 필요",
          conditionText: "첫가입 연 0.5%p",
          officialUrl: "https://pay.naver.com/savings/detail/P001",
        },
      ],
    }),
  );
  writeFileSync(rawPath, "[]");

  const summary = importNaverProducts({ incomingPath, rawPath, changeLogPath });
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));

  assert.equal(summary.importedCount, 1);
  assert.equal(summary.newCount, 1);
  assert.equal(raw[0].source, "naver-pay-savings");
});

test("importNaverProducts rejects partial Naver fetches by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "naver-import-partial-"));
  const incomingPath = join(dir, "naver-products.json");
  const rawPath = join(dir, "raw-products.json");
  const changeLogPath = join(dir, "change-log.json");

  writeFileSync(
    incomingPath,
    JSON.stringify({
      metadata: { source: "naver-pay-savings", scrapedAt: "2026-07-18", isPartial: true },
      products: [],
    }),
  );
  writeFileSync(rawPath, "[]");

  assert.throws(
    () => importNaverProducts({ incomingPath, rawPath, changeLogPath }),
    /Partial Naver incoming file/,
  );
});
