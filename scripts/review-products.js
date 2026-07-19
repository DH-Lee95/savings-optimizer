import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  approveProduct,
  autoApproveProducts,
  findProductIndex,
  listReviewItems,
  rejectProduct,
} from "../src/data/review.js";
import { updateProductFiles } from "./update-products.js";

const DEFAULT_RAW_PATH = "data/raw-products.json";
const DEFAULT_CHANGE_LOG_PATH = "data/product-change-log.json";
const DEFAULT_ACTIVE_PATH = "data/active-products.json";
const DEFAULT_MODULE_PATH = "src/lib/products.js";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function getReviewedProduct(products, selector) {
  const index = findProductIndex(products, selector);
  return index >= 0 ? products[index] : null;
}

export function reviewProducts({
  action,
  rawPath = DEFAULT_RAW_PATH,
  changeLogPath = DEFAULT_CHANGE_LOG_PATH,
  activePath = DEFAULT_ACTIVE_PATH,
  modulePath = DEFAULT_MODULE_PATH,
  selector,
  updates,
  filters = {},
  note = "",
  reason = "",
  reviewedAt = new Date().toISOString(),
  today,
  updateCatalog = true,
} = {}) {
  if (!["list", "approve", "reject", "auto-approve"].includes(action)) {
    throw new Error(`Unknown review action: ${action}`);
  }

  const rawProducts = readJson(rawPath, []);
  const changeLog = readJson(changeLogPath, { entries: [] });

  if (action === "list") {
    return { items: listReviewItems(rawProducts, changeLog, filters) };
  }

  if (action === "auto-approve") {
    const result = autoApproveProducts(rawProducts, {
      ...filters,
      reviewedAt,
      note,
    });
    writeJson(rawPath, result.products);
    const catalogSummary = updateCatalog
      ? updateProductFiles({ rawPath, activePath, modulePath, today })
      : null;
    return { ...result, catalogSummary };
  }

  if (!selector) throw new Error("selector is required for approve/reject");

  const products =
    action === "approve"
      ? approveProduct(rawProducts, { selector, note, reviewedAt, updates })
      : rejectProduct(rawProducts, { selector, reason, reviewedAt });
  const reviewedProduct = getReviewedProduct(products, selector);

  writeJson(rawPath, products);

  const catalogSummary = updateCatalog
    ? updateProductFiles({ rawPath, activePath, modulePath, today })
    : null;

  return { reviewedProduct, catalogSummary };
}

function parseArgs(argv) {
  const [action, ...tokens] = argv;
  const options = {
    action,
    rawPath: DEFAULT_RAW_PATH,
    changeLogPath: DEFAULT_CHANGE_LOG_PATH,
    activePath: DEFAULT_ACTIVE_PATH,
    modulePath: DEFAULT_MODULE_PATH,
    updateCatalog: true,
    selector: {},
    updates: {},
    filters: {},
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = tokens[index + 1];

    if (token === "--no-update") {
      options.updateCatalog = false;
      continue;
    }

    if (!token.startsWith("--")) continue;
    index += 1;

    if (token === "--bank" && action === "list") options.filters.bank = value;
    else if (token === "--bank") options.selector.bankName = value;
    if (token === "--name") options.selector.productName = value;
    if (token === "--type" && action === "list") options.filters.type = value;
    else if (token === "--type") options.selector.productType = value;
    if (token === "--source") options.filters.source = value;
    if (token === "--list-type") options.filters.type = value;
    if (token === "--condition") options.filters.condition = value;
    if (token === "--sort") options.filters.sort = value;
    if (token === "--limit") options.filters.limit = Number(value);
    if (token === "--parking-limit") {
      options.filters.limitsByType ??= {};
      options.filters.limitsByType.parking = Number(value);
    }
    if (token === "--deposit-limit") {
      options.filters.limitsByType ??= {};
      options.filters.limitsByType.deposit = Number(value);
    }
    if (token === "--installment-limit") {
      options.filters.limitsByType ??= {};
      options.filters.limitsByType.installment = Number(value);
    }
    if (token === "--note") options.note = value;
    if (token === "--reason") options.reason = value;
    if (token === "--official-url") options.updates.officialUrl = value;
    if (token === "--raw") options.rawPath = value;
    if (token === "--changes") options.changeLogPath = value;
    if (token === "--active") options.activePath = value;
    if (token === "--module") options.modulePath = value;
    if (token === "--today") options.today = value;
  }

  if (!Object.keys(options.selector).length) delete options.selector;
  if (!Object.keys(options.updates).length) delete options.updates;
  if (!Object.keys(options.filters).length) delete options.filters;
  return options;
}

function printList(items) {
  if (items.length === 0) {
    console.log("No pending review items.");
    return;
  }

  for (const [index, item] of items.entries()) {
    const structuredKeys = [...new Set((item.structuredConditions ?? []).map((condition) => condition.key))];
    console.log(`${index + 1}. [${item.statusLabel}] ${item.bankName} ${item.productName} (${item.productType})`);
    console.log(`   - rate: ${item.baseRateText ?? ""} / ${item.maxRateText ?? ""}`);
    if (item.termText) console.log(`   - term: ${item.termText}`);
    if (item.maxAmountText || item.monthlyLimitText) console.log(`   - limit: ${item.maxAmountText || item.monthlyLimitText}`);
    if (structuredKeys.length) console.log(`   - conditions: ${structuredKeys.join(", ")}`);
    if (item.officialUrl) console.log(`   - url: ${item.officialUrl}`);
    for (const change of item.changes) {
      console.log(`   - ${change.field}: ${change.before} -> ${change.after}`);
    }
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!["list", "approve", "reject", "auto-approve"].includes(options.action)) {
      throw new Error("Usage: npm run review-products -- list|approve|reject|auto-approve --bank <bank> --name <name> --type <type>");
    }

    const result = reviewProducts(options);
    if (options.action === "list") {
      printList(result.items);
      return;
    }

    if (options.action === "auto-approve") {
      console.log(`Auto-approved: ${result.summary.approvedCount} products`);
      if (result.catalogSummary) {
        console.log(
          `Catalog refreshed: ${result.catalogSummary.activeCount} active, ${result.catalogSummary.rejectedCount} rejected`,
        );
      }
      return;
    }

    console.log(`${options.action}d: ${result.reviewedProduct.bankName} ${result.reviewedProduct.productName}`);
    if (result.catalogSummary) {
      console.log(
        `Catalog refreshed: ${result.catalogSummary.activeCount} active, ${result.catalogSummary.rejectedCount} rejected`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
