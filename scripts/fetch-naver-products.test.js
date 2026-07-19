import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetchNaverProducts } from "./fetch-naver-products.js";

const pageHtml = (category, code) => `
  <script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"listPage":{"filter":{"productCategory":"${category}","productTypeCode":"${code}"}}}}}
  </script>
`;

test("fetchNaverProducts fetches deposit, saving, and parking lists into incoming json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "naver-fetch-"));
  const outputPath = join(dir, "naver-products.json");
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    if (url.includes("/list/deposit")) return { ok: true, text: async () => pageHtml("deposit", "1002") };
    if (url.includes("/list/saving")) return { ok: true, text: async () => pageHtml("saving", "1003") };
    if (url.includes("/list/parking")) return { ok: true, text: async () => pageHtml("parking", "1001") };
    return {
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: {
          products: [
            {
              companyName: "테스트은행",
              productName: "모바일 상품",
              topRates: "4.2",
              defaultRates: "3.1",
              period: "12개월",
              maxAmount: "1,000만원",
              tagList: ["첫가입"],
            },
          ],
        },
      }),
    };
  };

  const summary = await fetchNaverProducts({ outputPath, scrapedAt: "2026-07-18", fetcher });
  const payload = JSON.parse(readFileSync(outputPath, "utf8"));

  assert.equal(summary.productCount, 3);
  assert.equal(summary.categoryCount, 3);
  assert.equal(urls.filter((url) => url.includes("/savings/api/v1/productList")).length, 3);
  assert.equal(payload.metadata.source, "naver-pay-savings");
  assert.equal(payload.products[2].productType, "parking");
});

test("fetchNaverProducts fetches detail rate guide once and reuses it while list summary is unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "naver-fetch-detail-"));
  const outputPath = join(dir, "naver-products.json");
  const detailCachePath = join(dir, "naver-detail-cache.json");
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    if (url.includes("/list/deposit")) return { ok: true, text: async () => pageHtml("deposit", "1002") };
    if (url.includes("/savings/api/v1/productList")) {
      return {
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: {
            products: [
              {
                productCode: "P001",
                companyName: "테스트은행",
                productName: "상세 우대 예금",
                topRates: "4.0",
                defaultRates: "3.0",
                period: "12개월",
                maxAmount: "1,000만원",
                productUrl: "https://pay.naver.com/savings/detail/P001",
              },
            ],
          },
        }),
      };
    }
    if (url.includes("/savings/api/v1/productDetails")) {
      return {
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: {
            interestRate: "3.0",
            primeInterestRate: "4.0",
            joinPeriodText: "12개월",
            joinAmountText: "1,000만원",
            joinTarget: "만 19세 이상 만 34세 이하",
            channel: "모바일",
            specialOfferSummary: "금리 안내 첫가입 우대 연 0.5%p",
          },
        }),
      };
    }
    if (url.includes("/savings/api/v1/productInterest")) {
      return {
        ok: true,
        json: async () => ({
          isSuccess: true,
          result: {
            interestCalculation: { interestRate: "3.0", primeInterestRate: "4.0" },
            interestDetail: { rows: [["12개월", "3.000%"]] },
            specialConditions: [{ description: "첫가입 우대 연 0.5%p" }],
          },
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  await fetchNaverProducts({
    outputPath,
    detailCachePath,
    categories: ["deposit"],
    scrapedAt: "2026-07-18",
    fetcher,
  });
  const firstPayload = JSON.parse(readFileSync(outputPath, "utf8"));

  urls.length = 0;
  const summary = await fetchNaverProducts({
    outputPath,
    detailCachePath,
    categories: ["deposit"],
    scrapedAt: "2026-07-19",
    fetcher,
  });
  const secondPayload = JSON.parse(readFileSync(outputPath, "utf8"));

  assert.match(firstPayload.products[0].rateGuideText, /첫가입 우대/);
  assert.equal(firstPayload.products[0].eligibility.maxAge, 34);
  assert.equal(summary.detailSummary.reusedCount, 1);
  assert.equal(urls.some((url) => url.includes("/savings/api/v1/productDetails")), false);
  assert.match(secondPayload.products[0].rateGuideText, /첫가입 우대/);
});
