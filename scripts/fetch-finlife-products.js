import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFinlifeUrl,
  getFinlifeMaxPage,
  mapFinlifeResponseToRawProducts,
} from "../src/data/adapters/finlife-api.js";

const DEFAULT_OUTPUT_PATH = "data/incoming/finlife-products.json";
const DEFAULT_PRODUCT_TYPES = ["deposit", "installment"];

async function fetchJson(fetcher, url) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`FinLife request failed: ${response.status ?? "unknown"}`);
  return response.json();
}

export async function fetchFinlifeProducts({
  apiKey = process.env.FINLIFE_API_KEY,
  outputPath = DEFAULT_OUTPUT_PATH,
  productTypes = DEFAULT_PRODUCT_TYPES,
  topFinGrpNo = "020000",
  scrapedAt = new Date().toISOString().slice(0, 10),
  fetcher = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("FINLIFE_API_KEY is required to fetch FinLife products");
  if (typeof fetcher !== "function") throw new Error("fetch is not available in this Node.js runtime");

  const products = [];
  let pageCount = 0;

  for (const productType of productTypes) {
    const firstUrl = buildFinlifeUrl({ apiKey, productType, topFinGrpNo, pageNo: 1 });
    const firstPayload = await fetchJson(fetcher, firstUrl.toString());
    const maxPage = getFinlifeMaxPage(firstPayload);
    pageCount += 1;
    products.push(
      ...mapFinlifeResponseToRawProducts(firstPayload, {
        productType,
        scrapedAt,
        sourceUrl: firstUrl.toString(),
      }),
    );

    for (let pageNo = 2; pageNo <= maxPage; pageNo += 1) {
      const url = buildFinlifeUrl({ apiKey, productType, topFinGrpNo, pageNo });
      const payload = await fetchJson(fetcher, url.toString());
      pageCount += 1;
      products.push(
        ...mapFinlifeResponseToRawProducts(payload, {
          productType,
          scrapedAt,
          sourceUrl: url.toString(),
        }),
      );
    }
  }

  const payload = {
    metadata: {
      source: "finlife-api",
      scrapedAt,
      productTypes,
      topFinGrpNo,
      productCount: products.length,
      pageCount,
    },
    products,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  return { productCount: products.length, pageCount, outputPath };
}

async function main() {
  try {
    const summary = await fetchFinlifeProducts();
    console.log(`Fetched FinLife products: ${summary.productCount} products from ${summary.pageCount} pages`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
