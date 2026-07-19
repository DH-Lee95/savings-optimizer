import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseFssCsv } from "../src/data/adapters/fss-csv.js";
import { mergeRawProducts } from "../src/data/importer.js";

const DEFAULT_CSV_PATH = "data/incoming/fss-products.csv";
const DEFAULT_RAW_PATH = "data/raw-products.json";
const DEFAULT_CHANGE_LOG_PATH = "data/product-change-log.json";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function importFssProducts({
  csvPath = DEFAULT_CSV_PATH,
  rawPath = DEFAULT_RAW_PATH,
  changeLogPath = DEFAULT_CHANGE_LOG_PATH,
  scrapedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  const csv = readFileSync(csvPath, "utf8");
  const imported = parseFssCsv(csv, { scrapedAt });
  const existing = readJson(rawPath, []);
  const previousLog = readJson(changeLogPath, { entries: [] });
  const result = mergeRawProducts(existing, imported);

  writeJson(rawPath, result.products);
  writeJson(changeLogPath, {
    generatedAt: new Date().toISOString(),
    entries: [...result.changeLog, ...previousLog.entries].slice(0, 200),
  });

  return result.summary;
}

function main() {
  const summary = importFssProducts();
  console.log(
    `Imported FSS feed: ${summary.importedCount} imported, ${summary.newCount} new, ${summary.changedCount} changed, ${summary.unchangedCount} unchanged`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
