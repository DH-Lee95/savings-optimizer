const TYPE_ALIASES = {
  deposit: "deposit",
  예금: "deposit",
  installment: "installment",
  saving: "installment",
  적금: "installment",
  parking: "parking",
  파킹: "parking",
  파킹통장: "parking",
};

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeType(value) {
  return TYPE_ALIASES[normalizeText(value)] ?? normalizeText(value);
}

function parsePercent(value) {
  return Number(String(value ?? "").match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
}

function conditionKeys(product) {
  return new Set((product.structuredConditions ?? []).map((condition) => condition.key));
}

function approvalRiskText(product) {
  return [
    product.productName,
    product.eligibilityText,
    product.conditionText,
    product.rateGuideText,
    product.detailConditionText,
  ].map(normalizeText).join(" ");
}

function isCalculableGenericManualText(value) {
  const text = normalizeText(value);
  return /^(?:실명의\s*)?개인(?:고객)?$/.test(text)
    || /^개인(?:,|\s*및|\s*또는)?\s*(?:개인사업자)?(?:,|\s*및|\s*또는)?\s*(?:법인|단체)?(?:\s*등)?$/.test(text)
    || /^실명의 개인(?:\s*및|\s*또는)?\s*개인사업자$/.test(text)
    || /^비거주 외국인 외 제한없음$/.test(text)
    || /^제한\s*없음(?:\s*\(.*\))?$/.test(text)
    || /^입금최소금액\s*\d+\s*원$/.test(text)
    || /^(?:월\s*)?(?:최소\s*)?(?:계약금액\s*)?[\d,\s.]+(?:원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*이상$/.test(text)
    || /[\d,\s.]+(?:원|천원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*(?:이상|부터).*(?:제한\s*없음|[\d,\s.]+(?:원|천원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*(?:이하|까지))/.test(text)
    || /^정부기여금/.test(text);
}

function hasYouthFutureGovernmentContribution(product) {
  const text = approvalRiskText(product);
  return /청년미래적금/.test(text) && /정부기여금/.test(text);
}

function hasManualReviewRisk(product) {
  if (hasYouthFutureGovernmentContribution(product)) return false;

  return (product.structuredConditions ?? []).some((condition) =>
    (condition.requiresManualReview || ["manualReview", "eventCoupon"].includes(condition.key))
      && condition.key !== "eventCoupon"
      && !isCalculableGenericManualText(condition.sourceText),
  );
}

function hasSpecialEligibilityRisk() {
  return false;
}

function hasRequiredApprovalFields(product) {
  if (!normalizeText(product.officialUrl)) return false;
  if (!parsePercent(product.baseRateText ?? product.baseRate)) return false;
  if (!parsePercent(product.maxRateText ?? product.maxRate)) return false;
  if (normalizeType(product.productType ?? product.type) !== "parking" && !normalizeText(product.termText ?? product.termMonths)) {
    return false;
  }
  return true;
}

function isAutoApprovalEligible(product, source) {
  return product.reviewStatus === "pending"
    && product.source === source
    && hasRequiredApprovalFields(product)
    && !hasManualReviewRisk(product)
    && !hasSpecialEligibilityRisk(product);
}

function groupByType(products) {
  const byType = new Map();
  for (const product of products) {
    const type = normalizeType(product.productType ?? product.type);
    byType.set(type, [...(byType.get(type) ?? []), product]);
  }
  return byType;
}

export function productKey(product) {
  const bankName = normalizeText(product.bankName ?? product.bank);
  const productName = normalizeText(product.productName ?? product.name);
  const productType = normalizeType(product.productType ?? product.type);
  return `${bankName}|${productName}|${productType}`;
}

function selectorKey(selector) {
  return productKey({
    bankName: selector.bankName ?? selector.bank,
    productName: selector.productName ?? selector.name,
    productType: selector.productType ?? selector.type,
  });
}

export function findProductIndex(products, selector) {
  const key = selectorKey(selector);
  return products.findIndex((product) => productKey(product) === key);
}

function requireProductIndex(products, selector) {
  const index = findProductIndex(products, selector);
  if (index < 0) {
    throw new Error(`Review target not found: ${selectorKey(selector)}`);
  }
  return index;
}

function changesForProduct(product, changeLog) {
  const key = productKey(product);
  return (changeLog.entries ?? [])
    .filter((entry) => entry.key === key)
    .flatMap((entry) =>
      (entry.changes ?? []).map((change) => ({
        ...change,
        changedAt: entry.changedAt,
      })),
    );
}

export function listReviewItems(products, changeLog = { entries: [] }, filters = {}) {
  let items = products
    .filter((product) => product.reviewStatus === "pending")
    .filter((product) => !filters.source || product.source === filters.source)
    .filter((product) => !filters.type || normalizeType(product.productType ?? product.type) === normalizeType(filters.type))
    .filter((product) => !filters.bank || normalizeText(product.bankName ?? product.bank).includes(normalizeText(filters.bank)))
    .filter((product) => !filters.condition || conditionKeys(product).has(filters.condition))
    .map((product) => ({
      ...product,
      key: productKey(product),
      statusLabel: product.previousReviewStatus === "approved" ? "변경 검수 필요" : "신규 검수 필요",
      changes: changesForProduct(product, changeLog),
    }));

  if (filters.sort === "max-rate") {
    items = items.sort((a, b) => parsePercent(b.maxRateText ?? b.maxRate) - parsePercent(a.maxRateText ?? a.maxRate));
  }

  if (filters.limit) {
    items = items.slice(0, Number(filters.limit));
  }

  return items;
}

export function approveProduct(products, options) {
  const index = requireProductIndex(products, options.selector);
  const reviewedAt = options.reviewedAt ?? new Date().toISOString();
  const updated = products.map((product) => ({ ...product }));

  updated[index] = {
    ...updated[index],
    ...(options.updates ?? {}),
    reviewStatus: "approved",
    reviewedAt,
    reviewedBy: options.reviewedBy ?? "operator",
    reviewNote: options.note ?? updated[index].reviewNote ?? "",
  };

  return updated;
}

export function getAutoApprovalCandidates(products, options = {}) {
  const source = options.source ?? "naver-pay-savings";
  const limitsByType = options.limitsByType ?? { parking: Infinity, deposit: Infinity, installment: Infinity };
  const candidates = products
    .filter((product) => isAutoApprovalEligible(product, source));

  const selected = [];
  for (const [type, typeProducts] of groupByType(candidates)) {
    const limit = Number(limitsByType[type] ?? 0);
    if (limit <= 0) continue;
    selected.push(
      ...typeProducts
        .sort((a, b) => parsePercent(b.maxRateText ?? b.maxRate) - parsePercent(a.maxRateText ?? a.maxRate))
        .slice(0, limit),
    );
  }

  return selected;
}

export function autoApproveProducts(products, options = {}) {
  const reviewedAt = options.reviewedAt ?? new Date().toISOString();
  const source = options.source ?? "naver-pay-savings";
  const resetExistingAutoApprovals = options.resetExistingAutoApprovals ?? true;
  const resetProducts = products.map((product) => {
    if (resetExistingAutoApprovals && product.source === source && product.reviewStatus === "approved" && product.reviewedBy === "auto-review") {
      return {
        ...product,
        reviewStatus: "pending",
        reviewedAt: undefined,
        reviewedBy: undefined,
        reviewNote: undefined,
      };
    }

    return product;
  });
  const candidates = getAutoApprovalCandidates(resetProducts, options);
  const candidateKeys = new Set(candidates.map(productKey));
  const productsWithReview = resetProducts.map((product) => {
    if (!candidateKeys.has(productKey(product))) return { ...product };

    return {
      ...product,
      reviewStatus: "approved",
      reviewedAt,
      reviewedBy: options.reviewedBy ?? "auto-review",
      reviewNote: options.note ?? "자동 검수: 수동확인/이벤트 조건 없는 네이버 상품",
    };
  });

  return {
    products: productsWithReview,
    approvedProducts: candidates,
    summary: {
      approvedCount: candidates.length,
      source,
    },
  };
}

export function rejectProduct(products, options) {
  const index = requireProductIndex(products, options.selector);
  const reviewedAt = options.reviewedAt ?? new Date().toISOString();
  const updated = products.map((product) => ({ ...product }));

  updated[index] = {
    ...updated[index],
    reviewStatus: "rejected",
    reviewedAt,
    reviewedBy: options.reviewedBy ?? "operator",
    reviewReason: options.reason ?? updated[index].reviewReason ?? "검수 거절",
  };

  return updated;
}
