import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { importFssProducts } from "./import-fss-products.js";

test("importFssProducts merges csv feed and writes change log", () => {
  const dir = mkdtempSync(join(tmpdir(), "fss-import-"));
  const csvPath = join(dir, "feed.csv");
  const rawPath = join(dir, "raw-products.json");
  const changeLogPath = join(dir, "change-log.json");

  writeFileSync(
    csvPath,
    [
      "금융회사,상품명,상품유형,기본금리,최고금리,기간,최고한도,월납입한도,가입채널,예금자보호,우대조건,공식URL",
      "새봄은행,첫거래 정기예금,예금,3.0%,4.5%,12개월,4000만원,,모바일 앱,예금자보호 대상,첫거래 연 0.6%p,https://example.com/a",
    ].join("\n"),
  );
  writeFileSync(
    rawPath,
    JSON.stringify([
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
    ]),
  );

  const summary = importFssProducts({ csvPath, rawPath, changeLogPath, scrapedAt: "2026-07-18" });
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const log = JSON.parse(readFileSync(changeLogPath, "utf8"));

  assert.equal(summary.changedCount, 1);
  assert.equal(raw[0].reviewStatus, "pending");
  assert.equal(log.entries.length, 1);
});
