import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetchFinlifeProducts } from "./fetch-finlife-products.js";

const responses = {
  deposit: {
    result: {
      err_cd: "000",
      max_page_no: 1,
      baseList: [
        {
          fin_co_no: "001",
          kor_co_nm: "테스트은행",
          fin_prdt_cd: "D001",
          fin_prdt_nm: "정기예금",
          join_way: "스마트폰",
          spcl_cnd: "앱 가입 연 0.2%p",
        },
      ],
      optionList: [
        {
          fin_co_no: "001",
          fin_prdt_cd: "D001",
          save_trm: "12",
          intr_rate: "3.0",
          intr_rate2: "3.8",
          max_limit: "50000000",
        },
      ],
    },
  },
  installment: {
    result: {
      err_cd: "000",
      max_page_no: 1,
      baseList: [
        {
          fin_co_no: "002",
          kor_co_nm: "모바일은행",
          fin_prdt_cd: "S001",
          fin_prdt_nm: "자유적금",
          join_way: "스마트폰",
          spcl_cnd: "급여이체 연 0.5%p",
        },
      ],
      optionList: [
        {
          fin_co_no: "002",
          fin_prdt_cd: "S001",
          save_trm: "12",
          intr_rate: "3.5",
          intr_rate2: "4.5",
          max_limit: "500000",
        },
      ],
    },
  },
};

test("fetchFinlifeProducts fetches deposit and installment data and writes incoming json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "finlife-fetch-"));
  const outputPath = join(dir, "finlife-products.json");
  const calledUrls = [];
  const fetcher = async (url) => {
    calledUrls.push(url);
    const type = url.includes("savingProductsSearch") ? "installment" : "deposit";
    return {
      ok: true,
      json: async () => responses[type],
    };
  };

  const summary = await fetchFinlifeProducts({
    apiKey: "secret",
    outputPath,
    scrapedAt: "2026-07-18",
    fetcher,
  });
  const payload = JSON.parse(readFileSync(outputPath, "utf8"));

  assert.equal(summary.productCount, 2);
  assert.equal(summary.pageCount, 2);
  assert.equal(calledUrls.length, 2);
  assert.equal(payload.metadata.source, "finlife-api");
  assert.equal(payload.products[0].reviewStatus, "pending");
  assert.equal(payload.products[1].productType, "installment");
});

test("fetchFinlifeProducts requires api key", async () => {
  await assert.rejects(
    () =>
      fetchFinlifeProducts({
        apiKey: "",
        outputPath: "unused.json",
        fetcher: async () => ({ ok: true, json: async () => ({}) }),
      }),
    /FINLIFE_API_KEY/,
  );
});
