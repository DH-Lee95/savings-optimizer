const IDENTITY_FIELDS = ["bankName", "productName", "productType"];
const COMPARISON_FIELDS = [
  "baseRateText",
  "maxRateText",
  "termText",
  "maxAmountText",
  "monthlyLimitText",
  "channelText",
  "protectionText",
  "conditionText",
  "eligibilityText",
  "rateGuideText",
  "detailConditionText",
  "detailSections",
  "officialUrl",
  "sourceUrl",
];

function normalizeText(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeProductType(value) {
  const type = normalizeText(value);
  const aliases = {
    deposit: "deposit",
    예금: "deposit",
    installment: "installment",
    saving: "installment",
    적금: "installment",
    parking: "parking",
    파킹: "parking",
    파킹통장: "parking",
  };
  return aliases[type] ?? type;
}

function productKey(product) {
  return IDENTITY_FIELDS.map((field) => {
    if (field === "productType") return normalizeProductType(product[field]);
    return normalizeText(product[field]);
  }).join("|");
}

function findChanges(existing, imported) {
  const changes = [];

  for (const field of COMPARISON_FIELDS) {
    const before = normalizeText(existing[field]);
    const after = normalizeText(imported[field]);
    if (before !== after) {
      changes.push({ field, before, after });
    }
  }

  return changes;
}

function mergeProduct(existing, imported, changes) {
  if (changes.length === 0) {
    return {
      ...existing,
      source: imported.source,
      scrapedAt: imported.scrapedAt,
      lastImportedAt: imported.scrapedAt,
    };
  }

  return {
    ...existing,
    ...imported,
    previousReviewStatus: existing.reviewStatus,
    reviewStatus: "pending",
    changedAt: imported.scrapedAt,
  };
}

export function mergeRawProducts(existingProducts, importedProducts, options = {}) {
  const existingByKey = new Map(existingProducts.map((product) => [productKey(product), product]));
  const importedKeys = new Set();
  const products = [];
  const changeLog = [];
  const summary = {
    newCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    removedCount: 0,
    importedCount: importedProducts.length,
  };

  for (const imported of importedProducts) {
    const key = productKey(imported);
    importedKeys.add(key);
    const existing = existingByKey.get(key);

    if (!existing) {
      summary.newCount += 1;
      products.push({
        ...imported,
        reviewStatus: "pending",
        importedAt: imported.scrapedAt,
      });
      continue;
    }

    const changes = findChanges(existing, imported);
    if (changes.length === 0) {
      summary.unchangedCount += 1;
    } else {
      summary.changedCount += 1;
      changeLog.push({
        key,
        bankName: imported.bankName,
        productName: imported.productName,
        productType: imported.productType,
        changedAt: imported.scrapedAt,
        changes,
      });
    }

    products.push(mergeProduct(existing, imported, changes));
  }

  for (const existing of existingProducts) {
    const key = productKey(existing);
    if (importedKeys.has(key)) continue;

    if (
      options.markMissingSource
      && existing.source === options.markMissingSource
      && existing.availabilityStatus !== "removed"
    ) {
      summary.removedCount += 1;
      products.push({
        ...existing,
        previousReviewStatus: existing.reviewStatus,
        reviewStatus: "pending",
        availabilityStatus: "removed",
        changedAt: options.scrapedAt ?? new Date().toISOString().slice(0, 10),
      });
      changeLog.push({
        key,
        bankName: existing.bankName,
        productName: existing.productName,
        productType: existing.productType,
        changedAt: options.scrapedAt ?? new Date().toISOString().slice(0, 10),
        changes: [{ field: "availabilityStatus", before: existing.availabilityStatus ?? "listed", after: "removed" }],
      });
      continue;
    }

    products.push(existing);
  }

  return { products, changeLog, summary };
}
