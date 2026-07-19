import { createHash, randomUUID } from "node:crypto";

export const PAID_PRODUCT = {
  code: "monthly-savings-report",
  name: "월 저축 최적화 리포트",
  price: 1490,
  originalPrice: 2980,
  currency: "KRW",
  promoText: "출시 첫 일주일 반값 할인",
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableValue(entryValue)]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizePaidInput(input) {
  const normalized = { ...input };
  delete normalized.excludedProductIds;
  return stableValue(normalized);
}

function hashPaidInput(input) {
  return createHash("sha256")
    .update(stableStringify(normalizePaidInput(input)))
    .digest("hex");
}

function publicEntitlement(entitlement) {
  return {
    id: entitlement.id,
    orderId: entitlement.orderId,
    productCode: entitlement.productCode,
    paid: entitlement.status === "paid",
    consumed: Boolean(entitlement.consumedAt),
    reportId: entitlement.reportId ?? null,
    createdAt: entitlement.createdAt,
    paidAt: entitlement.paidAt ?? null,
    consumedAt: entitlement.consumedAt ?? null,
  };
}

function accessError(code, message, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.detail = message;
  return error;
}

export function createPaidAccessStore(seed = []) {
  const entitlements = new Map(seed.map((item) => [item.accessToken, { ...item }]));

  return {
    put(entitlement) {
      entitlements.set(entitlement.accessToken, { ...entitlement });
      return this.get(entitlement.accessToken);
    },
    get(accessToken) {
      const entitlement = entitlements.get(accessToken);
      return entitlement ? { ...entitlement } : null;
    },
    update(accessToken, updater) {
      const current = entitlements.get(accessToken);
      if (!current) return null;
      const next = updater({ ...current });
      entitlements.set(accessToken, { ...next });
      return this.get(accessToken);
    },
    all() {
      return [...entitlements.values()].map((item) => ({ ...item }));
    },
  };
}

export function createPaidCheckout(store, { email, input, mode = "mock" }) {
  if (!String(email ?? "").includes("@")) {
    throw accessError("INVALID_EMAIL", "리포트를 받을 이메일을 입력하세요.", 422);
  }

  const now = new Date().toISOString();
  const accessToken = randomUUID();
  const entitlement = {
    id: randomUUID(),
    orderId: `order-${randomUUID()}`,
    accessToken,
    productCode: PAID_PRODUCT.code,
    price: PAID_PRODUCT.price,
    originalPrice: PAID_PRODUCT.originalPrice,
    promoText: PAID_PRODUCT.promoText,
    email,
    inputHash: hashPaidInput(input),
    lockedInput: normalizePaidInput(input),
    status: mode === "mock" ? "paid" : "pending",
    createdAt: now,
    paidAt: mode === "mock" ? now : null,
    consumedAt: null,
    reportId: null,
    lastExcludedProductIds: [],
  };

  store.put(entitlement);

  return {
    accessToken,
    entitlement: publicEntitlement(entitlement),
    checkout: {
      orderId: entitlement.orderId,
      productName: PAID_PRODUCT.name,
      price: PAID_PRODUCT.price,
      originalPrice: PAID_PRODUCT.originalPrice,
      promoText: PAID_PRODUCT.promoText,
      status: entitlement.status,
      paymentMode: mode,
    },
  };
}

export async function consumePaidReportAccess(store, {
  accessToken,
  input,
  excludedProductIds = [],
  createReport,
}) {
  const entitlement = store.get(accessToken);
  if (!entitlement) throw accessError("INVALID_ACCESS_TOKEN", "유효하지 않은 결제 접근 토큰입니다.", 401);
  if (entitlement.status !== "paid") throw accessError("PAYMENT_NOT_CONFIRMED", "결제가 확인되지 않았습니다.", 402);

  const currentHash = hashPaidInput(input);
  if (currentHash !== entitlement.inputHash) {
    throw accessError("PAID_INPUT_MISMATCH", "결제한 입력 조건과 다른 조건입니다. 새 분석은 새 결제가 필요합니다.", 409);
  }

  const lockedInput = {
    ...entitlement.lockedInput,
    excludedProductIds,
  };
  const report = await createReport(lockedInput);
  const updated = store.update(accessToken, (current) => ({
    ...current,
    consumedAt: current.consumedAt ?? new Date().toISOString(),
    reportId: current.reportId ?? report.reportId,
    lastExcludedProductIds: excludedProductIds,
  }));

  return {
    report,
    entitlement: publicEntitlement(updated),
  };
}

export async function recalculatePaidReport(store, {
  accessToken,
  excludedProductIds = [],
  createReport,
}) {
  const entitlement = store.get(accessToken);
  if (!entitlement) throw accessError("INVALID_ACCESS_TOKEN", "유효하지 않은 결제 접근 토큰입니다.", 401);
  if (entitlement.status !== "paid") throw accessError("PAYMENT_NOT_CONFIRMED", "결제가 확인되지 않았습니다.", 402);
  if (!entitlement.consumedAt) throw accessError("REPORT_NOT_CREATED", "먼저 결제 리포트를 생성해야 합니다.", 409);

  const lockedInput = {
    ...entitlement.lockedInput,
    excludedProductIds,
  };
  const report = await createReport(lockedInput);
  const updated = store.update(accessToken, (current) => ({
    ...current,
    reportId: report.reportId,
    lastExcludedProductIds: excludedProductIds,
  }));

  return {
    report,
    entitlement: publicEntitlement(updated),
  };
}

export function serializePaidAccessStore(store) {
  return store.all();
}
