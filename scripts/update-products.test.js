import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { updateProductFiles } from "./update-products.js";

test("updateProductFiles writes active catalog json and browser module", () => {
  const dir = mkdtempSync(join(tmpdir(), "savings-products-"));
  const rawPath = join(dir, "raw-products.json");
  const activePath = join(dir, "active-products.json");
  const modulePath = join(dir, "products.js");

  writeFileSync(
    rawPath,
    JSON.stringify([
      {
        source: "manual",
        sourceUrl: "https://example.com/a",
        scrapedAt: "2026-07-18",
        reviewStatus: "approved",
        bankName: "테스트은행",
        productName: "모바일 예금",
        productType: "deposit",
        baseRateText: "3.1%",
        maxRateText: "4.0%",
        termText: "12개월",
        maxAmountText: "5,000만원",
        monthlyLimitText: "",
        channelText: "앱",
        protectionText: "예금자보호",
        conditionText: "앱 가입 연 0.3%p",
        officialUrl: "https://example.com/a",
      },
    ]),
  );

  const summary = updateProductFiles({ rawPath, activePath, modulePath, today: "2026-07-18" });
  const active = JSON.parse(readFileSync(activePath, "utf8"));
  const module = readFileSync(modulePath, "utf8");

  assert.equal(summary.activeCount, 1);
  assert.equal(active.products[0].bank, "테스트은행");
  assert.match(module, /export const SAMPLE_PRODUCTS =/);
  assert.match(module, /모바일 예금/);
});
