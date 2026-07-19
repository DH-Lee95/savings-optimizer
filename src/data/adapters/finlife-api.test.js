import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinlifeUrl,
  mapFinlifeResponseToRawProducts,
} from "./finlife-api.js";

const payload = {
  result: {
    err_cd: "000",
    max_page_no: 1,
    baseList: [
      {
        fin_co_no: "0010001",
        kor_co_nm: "테스트은행",
        fin_prdt_cd: "D001",
        fin_prdt_nm: "정기예금",
        join_way: "인터넷, 스마트폰",
        mtrt_int: "만기 후 고시금리 적용",
        spcl_cnd: "첫거래 우대 연 0.3%p",
        join_member: "실명의 개인",
      },
    ],
    optionList: [
      {
        fin_co_no: "0010001",
        fin_prdt_cd: "D001",
        save_trm: "12",
        intr_rate: "3.1",
        intr_rate2: "4.0",
        intr_rate_type_nm: "단리",
        max_limit: "50000000",
      },
      {
        fin_co_no: "0010001",
        fin_prdt_cd: "D001",
        save_trm: "24",
        intr_rate: "3.2",
        intr_rate2: "4.1",
        intr_rate_type_nm: "단리",
        max_limit: "50000000",
      },
    ],
  },
};

test("buildFinlifeUrl creates official FinLife product API url", () => {
  const url = buildFinlifeUrl({
    apiKey: "secret",
    productType: "deposit",
    pageNo: 2,
    topFinGrpNo: "020000",
  });

  assert.equal(url.origin, "https://finlife.fss.or.kr");
  assert.match(url.pathname, /depositProductsSearch\.json$/);
  assert.equal(url.searchParams.get("auth"), "secret");
  assert.equal(url.searchParams.get("topFinGrpNo"), "020000");
  assert.equal(url.searchParams.get("pageNo"), "2");
});

test("mapFinlifeResponseToRawProducts maps each term option to pending raw product", () => {
  const products = mapFinlifeResponseToRawProducts(payload, {
    productType: "deposit",
    scrapedAt: "2026-07-18",
    sourceUrl: "https://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
  });

  assert.equal(products.length, 2);
  assert.equal(products[0].bankName, "테스트은행");
  assert.equal(products[0].productName, "정기예금 12개월");
  assert.equal(products[0].productType, "deposit");
  assert.equal(products[0].baseRateText, "연 3.1%");
  assert.equal(products[0].maxRateText, "최고 연 4.0%");
  assert.equal(products[0].termText, "12개월");
  assert.equal(products[0].maxAmountText, "50000000원");
  assert.equal(products[0].officialUrl, "");
  assert.equal(products[0].reviewStatus, "pending");
});

test("mapFinlifeResponseToRawProducts throws on FinLife API errors", () => {
  assert.throws(
    () =>
      mapFinlifeResponseToRawProducts(
        { result: { err_cd: "999", err_msg: "invalid auth" } },
        { productType: "deposit" },
      ),
    /invalid auth/,
  );
});
