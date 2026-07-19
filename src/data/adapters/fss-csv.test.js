import test from "node:test";
import assert from "node:assert/strict";

import { parseCsv, parseFssCsv } from "./fss-csv.js";

test("parseCsv handles quoted commas and Korean headers", () => {
  const rows = parseCsv('금융회사,상품명,우대조건\n"새봄은행","첫거래 예금","첫거래, 급여이체"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].금융회사, "새봄은행");
  assert.equal(rows[0].우대조건, "첫거래, 급여이체");
});

test("parseFssCsv maps daily feed rows to raw product shape", () => {
  const csv = [
    "금융회사,상품명,상품유형,기본금리,최고금리,기간,최고한도,월납입한도,가입채널,예금자보호,우대조건,공식URL",
    "새봄은행,첫거래 정기예금,예금,3.0%,4.3%,12개월,4000만원,,모바일 앱,예금자보호 대상,첫거래 연 0.6%p,https://example.com/a",
  ].join("\n");

  const products = parseFssCsv(csv, { scrapedAt: "2026-07-18" });

  assert.equal(products.length, 1);
  assert.equal(products[0].source, "fss-csv");
  assert.equal(products[0].bankName, "새봄은행");
  assert.equal(products[0].productType, "예금");
  assert.equal(products[0].reviewStatus, "pending");
});
