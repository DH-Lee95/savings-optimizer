import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { importFinlifeProducts } from "./import-finlife-products.js";

test("importFinlifeProducts merges fetched raw products into review queue", () => {
  const dir = mkdtempSync(join(tmpdir(), "finlife-import-"));
  const incomingPath = join(dir, "finlife-products.json");
  const rawPath = join(dir, "raw-products.json");
  const changeLogPath = join(dir, "change-log.json");

  writeFileSync(
    incomingPath,
    JSON.stringify({
      metadata: { source: "finlife-api", scrapedAt: "2026-07-18" },
      products: [
        {
          source: "finlife-api",
          sourceUrl: "https://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
          scrapedAt: "2026-07-18",
          reviewStatus: "pending",
          bankName: "테스트은행",
          productName: "정기예금 12개월",
          productType: "deposit",
          baseRateText: "연 3.1%",
          maxRateText: "최고 연 4.0%",
          termText: "12개월",
          maxAmountText: "50000000원",
          monthlyLimitText: "",
          channelText: "스마트폰",
          protectionText: "예금자보호 확인 필요",
          conditionText: "첫거래 우대 연 0.3%p",
          officialUrl: "",
        },
      ],
    }),
  );
  writeFileSync(rawPath, "[]");

  const summary = importFinlifeProducts({ incomingPath, rawPath, changeLogPath });
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));

  assert.equal(summary.importedCount, 1);
  assert.equal(summary.newCount, 1);
  assert.equal(raw[0].reviewStatus, "pending");
});
