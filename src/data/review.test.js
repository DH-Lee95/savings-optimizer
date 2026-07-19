import test from "node:test";
import assert from "node:assert/strict";

import {
  approveProduct,
  autoApproveProducts,
  findProductIndex,
  getAutoApprovalCandidates,
  listReviewItems,
  rejectProduct,
} from "./review.js";

const rawProducts = [
  {
    reviewStatus: "approved",
    bankName: "새봄은행",
    productName: "첫거래 정기예금",
    productType: "예금",
    maxRateText: "4.3%",
  },
  {
    reviewStatus: "pending",
    previousReviewStatus: "approved",
    source: "fss-csv",
    bankName: "하나은행",
    productName: "급여 우대 적금",
    productType: "적금",
    maxRateText: "5.2%",
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "OK저축은행",
    productName: "OK파킹통장",
    productType: "parking",
    maxRateText: "7.0%",
    baseRateText: "0.1%",
    officialUrl: "https://example.com/parking",
    structuredConditions: [{ key: "payAccountRegistration" }],
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "전북은행",
    productName: "JB 적금",
    productType: "installment",
    maxRateText: "13.3%",
    baseRateText: "3.3%",
    termText: "12개월",
    officialUrl: "https://example.com/installment",
    structuredConditions: [{ key: "eventCoupon" }],
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "애큐온저축은행",
    productName: "나날이적금",
    productType: "installment",
    baseRateText: "2.0%",
    maxRateText: "12.0%",
    termText: "100일",
    officialUrl: "https://example.com/acuon",
    structuredConditions: [{ key: "autoDebit" }],
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "더블저축은행",
    productName: "복리정기예금",
    productType: "deposit",
    baseRateText: "4.45%",
    maxRateText: "4.45%",
    termText: "12개월",
    officialUrl: "https://example.com/double",
    structuredConditions: [
      { key: "manualReview", sourceText: "실명의 개인", requiresManualReview: true },
      { key: "manualReview", sourceText: "입금최소금액 10000원", requiresManualReview: true },
      { key: "manualReview", sourceText: "제한없음", requiresManualReview: true },
    ],
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "NH농협은행",
    productName: "NH장병내일준비적금",
    productType: "installment",
    baseRateText: "4.5%",
    maxRateText: "7.5%",
    termText: "12개월",
    officialUrl: "https://example.com/soldier",
    eligibilityText: "의무복무이행자 중 병급여체계 적용 대상 병사 개인",
    structuredConditions: [{ key: "firstCustomer" }],
  },
  {
    reviewStatus: "pending",
    source: "naver-pay-savings",
    bankName: "IBK기업은행",
    productName: "IBK청년미래적금",
    productType: "installment",
    baseRateText: "5.0%",
    maxRateText: "8.0%",
    termText: "36개월",
    officialUrl: "https://example.com/youth-future",
    structuredConditions: [
      { key: "manualReview", sourceText: "정부기여금", requiresManualReview: true },
      { key: "manualReview", sourceText: "정부기여금은 가입대상의 요건을 갖춘 사람으로서 가입자에게 서민금융진흥원이 지급", requiresManualReview: true },
    ],
  },
];

const changeLog = {
  entries: [
    {
      key: "하나은행|급여 우대 적금|installment",
      changedAt: "2026-07-18",
      changes: [{ field: "maxRateText", before: "5.0%", after: "5.2%" }],
    },
  ],
};

test("listReviewItems returns pending products with matching change history", () => {
  const items = listReviewItems(rawProducts, changeLog);

  assert.equal(items.length, 7);
  assert.equal(items[0].bankName, "하나은행");
  assert.equal(items[0].statusLabel, "변경 검수 필요");
  assert.equal(items[0].changes[0].field, "maxRateText");
});

test("getAutoApprovalCandidates picks non-manual Naver products by type and max rate", () => {
  const candidates = getAutoApprovalCandidates(rawProducts, {
    source: "naver-pay-savings",
    limitsByType: { parking: 1, installment: 4 },
  });

  assert.deepEqual(candidates.map((product) => product.productName), ["OK파킹통장", "JB 적금", "나날이적금", "IBK청년미래적금", "NH장병내일준비적금"]);
});

test("getAutoApprovalCandidates accepts generic manual text already stored in raw data", () => {
  const candidates = getAutoApprovalCandidates(rawProducts, {
    source: "naver-pay-savings",
    limitsByType: { deposit: 1 },
  });

  assert.deepEqual(candidates.map((product) => product.productName), ["복리정기예금"]);
});

test("getAutoApprovalCandidates defaults to all calculable Naver candidates", () => {
  const candidates = getAutoApprovalCandidates(rawProducts, {
    source: "naver-pay-savings",
  });

  assert.ok(candidates.some((product) => product.productName === "OK파킹통장"));
  assert.ok(candidates.some((product) => product.productName === "나날이적금"));
  assert.ok(candidates.some((product) => product.productName === "복리정기예금"));
  assert.ok(candidates.some((product) => product.productName === "NH장병내일준비적금"));
  assert.ok(candidates.some((product) => product.productName === "JB 적금"));
  assert.ok(candidates.some((product) => product.productName === "IBK청년미래적금"));
});

test("autoApproveProducts marks selected low-risk products as approved", () => {
  const result = autoApproveProducts(rawProducts, {
    source: "naver-pay-savings",
    limitsByType: { parking: 1, installment: 1 },
    reviewedAt: "2026-07-18T09:00:00.000Z",
  });

  const approved = result.products.filter((product) => product.reviewStatus === "approved");
  assert.equal(result.summary.approvedCount, 2);
  assert.ok(approved.some((product) => product.productName === "OK파킹통장"));
  assert.ok(approved.some((product) => product.productName === "JB 적금"));
  assert.equal(result.products.find((product) => product.productName === "나날이적금").reviewStatus, "pending");
});

test("autoApproveProducts rechecks previously auto-approved products", () => {
  const previouslyApproved = rawProducts.map((product) =>
    product.productName === "NH장병내일준비적금"
      ? { ...product, reviewStatus: "approved", reviewedBy: "auto-review" }
      : product,
  );

  const result = autoApproveProducts(previouslyApproved, {
    source: "naver-pay-savings",
    limitsByType: { installment: 4 },
    reviewedAt: "2026-07-18T09:00:00.000Z",
  });

  assert.equal(result.products.find((product) => product.productName === "NH장병내일준비적금").reviewStatus, "approved");
});

test("listReviewItems filters and sorts pending review candidates", () => {
  const items = listReviewItems(rawProducts, changeLog, {
    source: "naver-pay-savings",
    type: "parking",
    condition: "payAccountRegistration",
    sort: "max-rate",
    limit: 1,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].bankName, "OK저축은행");
  assert.equal(items[0].productName, "OK파킹통장");
});

test("findProductIndex matches product by normalized bank, name, and type", () => {
  const index = findProductIndex(rawProducts, {
    bankName: "하나은행",
    productName: "급여 우대 적금",
    productType: "installment",
  });

  assert.equal(index, 1);
});

test("approveProduct marks one pending product as approved with review metadata", () => {
  const products = approveProduct(rawProducts, {
    selector: {
      bankName: "하나은행",
      productName: "급여 우대 적금",
      productType: "적금",
    },
    reviewedAt: "2026-07-18T09:00:00.000Z",
    note: "공식 페이지 확인",
  });

  assert.equal(products[1].reviewStatus, "approved");
  assert.equal(products[1].reviewedAt, "2026-07-18T09:00:00.000Z");
  assert.equal(products[1].reviewNote, "공식 페이지 확인");
});

test("approveProduct can attach verified official url during review", () => {
  const products = approveProduct(rawProducts, {
    selector: {
      bankName: "하나은행",
      productName: "급여 우대 적금",
      productType: "적금",
    },
    updates: {
      officialUrl: "https://bank.example.com/product",
    },
  });

  assert.equal(products[1].reviewStatus, "approved");
  assert.equal(products[1].officialUrl, "https://bank.example.com/product");
});

test("rejectProduct excludes a product from active catalog with reason", () => {
  const products = rejectProduct(rawProducts, {
    selector: {
      bankName: "하나은행",
      productName: "급여 우대 적금",
      productType: "적금",
    },
    reviewedAt: "2026-07-18T09:00:00.000Z",
    reason: "공식 링크 확인 실패",
  });

  assert.equal(products[1].reviewStatus, "rejected");
  assert.equal(products[1].reviewReason, "공식 링크 확인 실패");
});
