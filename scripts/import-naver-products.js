import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mergeRawProducts } from "../src/data/importer.js";

const DEFAULT_INCOMING_PATH = "data/incoming/naver-products.json";
const DEFAULT_RAW_PATH = "data/raw-products.json";
const DEFAULT_CHANGE_LOG_PATH = "data/product-change-log.json";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function importNaverProducts({
  incomingPath = DEFAULT_INCOMING_PATH,
  rawPath = DEFAULT_RAW_PATH,
  changeLogPath = DEFAULT_CHANGE_LOG_PATH,
  allowPartial = process.env.ALLOW_PARTIAL_NAVER_IMPORT === "1",
} = {}) {
  const incoming = readJson(incomingPath, null);
  if (!incoming) throw new Error(`Incoming Naver file not found: ${incomingPath}`);
  if (incoming.metadata?.isPartial && !allowPartial) {
    throw new Error("Partial Naver incoming file cannot be imported without ALLOW_PARTIAL_NAVER_IMPORT=1");
  }

  const imported = incoming.products ?? [];
  const existing = readJson(rawPath, []);
  const previousLog = readJson(changeLogPath, { entries: [] });
  const result = mergeRawProducts(existing, imported, {
    markMissingSource: "naver-pay-savings",
    scrapedAt: incoming.metadata?.scrapedAt,
  });

  writeJson(rawPath, result.products);
  writeJson(changeLogPath, {
    generatedAt: new Date().toISOString(),
    entries: [...result.changeLog, ...previousLog.entries].slice(0, 200),
  });

  return result.summary;
}

function main() {
  try {
    const summary = importNaverProducts();
    console.log(
      `Imported Naver feed: ${summary.importedCount} imported, ${summary.newCount} new, ${summary.changedCount} changed, ${summary.unchangedCount} unchanged, ${summary.removedCount} removed`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
