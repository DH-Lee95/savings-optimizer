import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildNaverProductDetailUrl,
  buildNaverProductDetailsApiUrl,
  buildNaverProductInterestApiUrl,
  buildNaverProductListUrl,
  enrichNaverProductWithDetail,
  extractNaverRateGuideFromHtml,
  extractNaverRateGuideFromPayload,
  getNaverListFilter,
  getNaverListPageUrl,
  mapNaverSavingsResponseToRawProducts,
} from "../src/data/adapters/naver-savings.js";

const DEFAULT_OUTPUT_PATH = "data/incoming/naver-products.json";
const DEFAULT_DETAIL_CACHE_PATH = "data/incoming/naver-detail-cache.json";
const DEFAULT_CATEGORIES = ["deposit", "saving", "parking"];
const NAVER_ORIGIN = "https://pay.naver.com";
const DETAIL_CACHE_VERSION = 5;
const execFileAsync = promisify(execFile);
const SIGNATURE_FIELDS = [
  "bankName",
  "productName",
  "productType",
  "baseRateText",
  "maxRateText",
  "termText",
  "maxAmountText",
  "monthlyLimitText",
  "channelText",
  "protectionText",
  "conditionText",
  "officialUrl",
  "naverProductCode",
];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? "");
}

function productDetailKey(product) {
  return [
    product.naverProductCode,
    product.bankName,
    product.productName,
    product.productType,
  ].filter(Boolean).join("|");
}

function productSignature(product) {
  const snapshot = {};
  for (const field of SIGNATURE_FIELDS) snapshot[field] = product[field] ?? "";
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

async function curlFetch(url, options = {}) {
  const args = ["--location", "--fail", "--silent", "--show-error"];
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    args.push("--header", `${key}: ${value}`);
  }
  args.push(String(url));

  const { stdout } = await execFileAsync("curl", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    ok: true,
    status: 200,
    text: async () => stdout,
    json: async () => JSON.parse(stdout),
  };
}

export function createNaverFetcher(fetchImpl = globalThis.fetch) {
  return async (url, options = {}) => {
    if (typeof fetchImpl === "function") {
      try {
        return await fetchImpl(url, options);
      } catch {
        return curlFetch(url, options);
      }
    }

    return curlFetch(url, options);
  };
}

async function fetchText(fetcher, url) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Naver page request failed: ${response.status ?? "unknown"}`);
  return response.text();
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url, {
    headers: {
      accept: "application/json",
      referer: NAVER_ORIGIN,
      "user-agent": "Mozilla/5.0 savings-optimizer-data-pipeline",
    },
  });
  if (!response.ok) throw new Error(`Naver product request failed: ${response.status ?? "unknown"}`);
  return response.json();
}

async function fetchProductDetail(fetcher, product) {
  const detailsUrl = buildNaverProductDetailsApiUrl(product, NAVER_ORIGIN);
  const interestUrl = buildNaverProductInterestApiUrl(product, NAVER_ORIGIN);
  if (detailsUrl && interestUrl) {
    const [detailsPayload, interestPayload] = await Promise.all([
      fetchJson(fetcher, detailsUrl.toString()),
      fetchJson(fetcher, interestUrl.toString()),
    ]);
    return extractNaverRateGuideFromPayload(detailsPayload, interestPayload);
  }

  const detailUrl = buildNaverProductDetailUrl(product);
  if (!detailUrl) throw new Error("Naver product detail url not found");
  const detailHtml = await fetchText(fetcher, detailUrl);
  return extractNaverRateGuideFromHtml(detailHtml);
}

export async function fetchNaverProducts({
  outputPath = DEFAULT_OUTPUT_PATH,
  detailCachePath = DEFAULT_DETAIL_CACHE_PATH,
  categories = DEFAULT_CATEGORIES,
  scrapedAt = new Date().toISOString().slice(0, 10),
  maxProductsPerCategory = Number(process.env.NAVER_FETCH_LIMIT ?? 0),
  fetcher = createNaverFetcher(),
} = {}) {
  if (typeof fetcher !== "function") throw new Error("fetch is not available in this Node.js runtime");

  const products = [];
  const categorySummaries = [];
  const previousCache = readJson(detailCachePath, { entries: {} });
  const nextCache = { generatedAt: new Date().toISOString(), entries: {} };
  const detailSummary = {
    fetchedCount: 0,
    reusedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    removedCount: 0,
  };

  for (const category of categories) {
    const listPageUrl = getNaverListPageUrl(category);
    const html = await fetchText(fetcher, listPageUrl);
    const filter = getNaverListFilter(html);
    let offset = 0;
    let totalCount = 0;
    const categoryProducts = [];

    do {
      const productListUrl = buildNaverProductListUrl({
        origin: NAVER_ORIGIN,
        productTypeCode: filter.productTypeCode,
        offset,
      });
      const payload = await fetchJson(fetcher, productListUrl.toString());
      const pageProducts = mapNaverSavingsResponseToRawProducts(payload, {
        productCategory: filter.productCategory,
        scrapedAt,
        sourceUrl: listPageUrl,
      });
      const result = payload.result ?? {};
      categoryProducts.push(...pageProducts);

      totalCount = Number(result.totalCount ?? pageProducts.length);
      const pageSize = Number(result.size ?? pageProducts.length);
      if (!pageSize) break;
      offset += pageSize;
    } while (offset < totalCount && (!maxProductsPerCategory || categoryProducts.length < maxProductsPerCategory));

    const limitedCategoryProducts = maxProductsPerCategory
      ? categoryProducts.slice(0, maxProductsPerCategory)
      : categoryProducts;

    for (const product of limitedCategoryProducts) {
      const detailKey = productDetailKey(product);
      const signature = productSignature(product);
      const cached = previousCache.entries?.[detailKey];

      if (cached?.cacheVersion === DETAIL_CACHE_VERSION && cached?.signature === signature && cached.product) {
        products.push({
          ...product,
          ...cached.product,
          scrapedAt,
          lastImportedAt: scrapedAt,
        });
        nextCache.entries[detailKey] = { ...cached, lastSeenAt: scrapedAt };
        detailSummary.reusedCount += 1;
        continue;
      }

      const detailUrl = buildNaverProductDetailUrl(product);
      if (!detailUrl) {
        products.push(product);
        nextCache.entries[detailKey] = { signature, product, lastSeenAt: scrapedAt };
        detailSummary.skippedCount += 1;
        continue;
      }

      try {
        const detail = await fetchProductDetail(fetcher, product);
        const enriched = enrichNaverProductWithDetail(product, detail, {
          fetchedAt: scrapedAt,
          detailSourceUrl: detailUrl,
        });
        products.push(enriched);
        nextCache.entries[detailKey] = {
          cacheVersion: DETAIL_CACHE_VERSION,
          signature,
          product: {
            baseRateText: enriched.baseRateText,
            maxRateText: enriched.maxRateText,
            termText: enriched.termText,
            maxAmountText: enriched.maxAmountText,
            monthlyLimitText: enriched.monthlyLimitText,
            channelText: enriched.channelText,
            protectionText: enriched.protectionText,
            officialUrl: enriched.officialUrl,
            updatedAt: enriched.updatedAt,
            conditionText: enriched.conditionText,
            eligibilityText: enriched.eligibilityText,
            eligibility: enriched.eligibility,
            rateGuideText: enriched.rateGuideText,
            detailConditionText: enriched.detailConditionText,
            detailSections: enriched.detailSections,
            tieredRateRules: enriched.tieredRateRules,
            structuredConditions: enriched.structuredConditions,
            detailSourceUrl: enriched.detailSourceUrl,
            detailFetchedAt: enriched.detailFetchedAt,
          },
          lastSeenAt: scrapedAt,
        };
        detailSummary.fetchedCount += 1;
      } catch (error) {
        products.push({
          ...product,
          detailFetchError: error.message,
        });
        nextCache.entries[detailKey] = {
          cacheVersion: DETAIL_CACHE_VERSION,
          signature,
          product,
          lastSeenAt: scrapedAt,
          lastError: error.message,
        };
        detailSummary.failedCount += 1;
      }
    }

    categorySummaries.push({
      category,
      productTypeCode: filter.productTypeCode,
      count: categoryProducts.length,
      importedCount: limitedCategoryProducts.length,
    });
  }

  for (const key of Object.keys(previousCache.entries ?? {})) {
    if (!nextCache.entries[key]) {
      nextCache.entries[key] = {
        ...previousCache.entries[key],
        missingSince: previousCache.entries[key].missingSince ?? scrapedAt,
      };
      detailSummary.removedCount += 1;
    }
  }

  const payload = {
    metadata: {
      source: "naver-pay-savings",
      scrapedAt,
      categories: categorySummaries,
      productCount: products.length,
      isPartial: Boolean(maxProductsPerCategory),
      maxProductsPerCategory: maxProductsPerCategory || null,
      detailSummary,
    },
    products,
  };

  writeJson(outputPath, payload);
  writeJson(detailCachePath, nextCache);

  return {
    productCount: products.length,
    categoryCount: categorySummaries.length,
    detailSummary,
    outputPath,
  };
}

async function main() {
  try {
    const summary = await fetchNaverProducts();
    console.log(`Fetched Naver savings products: ${summary.productCount} products from ${summary.categoryCount} categories`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
