import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveCatalog,
  normalizeRawProduct,
  parseEligibilityText,
  parseConditionText,
  parseMonthlyLimitText,
  validateProduct,
} from "./pipeline.js";

const rawProduct = {
  source: "manual",
  sourceUrl: "https://example.com/product",
  scrapedAt: "2026-07-18",
  bankName: "새봄은행",
  productName: "첫거래 급여 정기예금",
  productType: "deposit",
  baseRateText: "연 3.0%",
  maxRateText: "최고 연 4.3%",
  termText: "12개월",
  maxAmountText: "4,000만원",
  monthlyLimitText: "",
  channelText: "모바일 앱",
  protectionText: "예금자보호 대상",
  conditionText: "첫거래 우대 연 0.6%p, 급여이체 연 0.4%p, 마케팅 동의 연 0.2%p",
  officialUrl: "https://example.com/product",
};

test("parses Korean preferential condition text into calculator keys", () => {
  const conditions = parseConditionText(rawProduct.conditionText);
  assert.deepEqual(
    conditions.map((condition) => condition.key),
    ["firstCustomer", "salaryTransfer", "marketingConsent"],
  );
  assert.equal(conditions[0].rateBoost, 0.6);
});

test("normalizes raw product data into calculator product shape", () => {
  const product = normalizeRawProduct(rawProduct);
  assert.equal(product.bank, "새봄은행");
  assert.equal(product.name, "첫거래 급여 정기예금");
  assert.equal(product.type, "deposit");
  assert.equal(product.baseRate, 3);
  assert.equal(product.maxRate, 4.3);
  assert.equal(product.termMonths, 12);
  assert.equal(product.maxAmount, 40000000);
  assert.equal(product.minAmount, 0);
  assert.equal(product.firstCustomerOnly, true);
  assert.equal(product.status, "needs_review");
  assert.equal(product.raw.sourceUrl, rawProduct.sourceUrl);
});

test("parses minimum and maximum deposit and monthly limits from Korean amount ranges", () => {
  const deposit = normalizeRawProduct({
    ...rawProduct,
    maxAmountText: "10만원 이상 (가입한도 3억)",
  });
  const minimumOnlyDeposit = normalizeRawProduct({
    ...rawProduct,
    maxAmountText: "10만원 이상",
  });
  const rangedDeposit = normalizeRawProduct({
    ...rawProduct,
    maxAmountText: "1백만원 이상 1억원 이내",
  });
  const saving = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    maxAmountText: "월 1만원 이상 (월 최대 불입금 200만원 까지 제한)",
  });
  const rangedSaving = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    maxAmountText: "5만원 이상 20만원 이하 (원단위)",
  });

  assert.equal(deposit.maxAmount, 300000000);
  assert.equal(deposit.minAmount, 100000);
  assert.equal(minimumOnlyDeposit.maxAmount, 0);
  assert.equal(minimumOnlyDeposit.minAmount, 100000);
  assert.equal(rangedDeposit.minAmount, 1000000);
  assert.equal(rangedDeposit.maxAmount, 100000000);
  assert.equal(saving.monthlyLimit, 2000000);
  assert.equal(saving.minMonthlyAmount, 10000);
  assert.equal(rangedSaving.monthlyLimit, 200000);
  assert.equal(rangedSaving.minMonthlyAmount, 50000);
  assert.equal(parseMonthlyLimitText("매일 10,000원"), 300000);
  assert.equal(parseMonthlyLimitText("월(매월 1일부터 말일까지)적립한도 100만원 이내"), 1000000);
  assert.equal(parseMonthlyLimitText("월 0원 이상 50만원 이내(천원 단위) ※ 연간 납입한도 : 600만원"), 500000);
  assert.equal(parseMonthlyLimitText("매월(월 초일부터 말일까지) 1천원 이상 1천원 단위로 50만원의 범위에서 자유롭게 저축 ※ 연간 납입한도 600만원"), 500000);
  assert.equal(parseMonthlyLimitText("최소 1천원 이상 월 50만원 이하(연 납입한도 600만원 이하)"), 500000);
  assert.equal(parseMonthlyLimitText("월 1천원~50만원 (※ 연간 최대 입금한도 600만원)"), 500000);
  assert.equal(parseMonthlyLimitText("50만원 이하(천원 단위) ※ 월간 납입한도 최대 50만원 ※ 연간 납입한도 최대 600만원 초과 불가"), 500000);
  assert.equal(parseMonthlyLimitText("1천원 이상 50만원 이하(1천원 단위) 연간 최대 600만원 이하 ※ 월 납입한도 내 금액으로 입금"), 500000);
});

test("parses detailed per-contribution, daily, weekly, monthly, annual, and total limits", () => {
  const dailySaving = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    maxAmountText: "매일 1만원까지 납입 가능, 월 최대 30만원, 연간 납입한도 360만원",
  });
  const detailedSaving = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    maxAmountText: "1회 1천원 이상 10만원 이하, 1일 최대 20만원, 매주 50만원 이하, 월 100만원 이내, 총 1,000만원까지",
  });
  const deposit = normalizeRawProduct({
    ...rawProduct,
    maxAmountText: "1백만원 이상 1억원 이내, 1회 5천만원까지",
  });
  const unlimitedDeposit = normalizeRawProduct({
    ...rawProduct,
    maxAmountText: "가입금액 : 10만원 이상 가입한도 : 제한없음",
  });

  assert.equal(dailySaving.perContributionMaxAmount, 10000);
  assert.equal(dailySaving.dailyContributionLimit, 10000);
  assert.equal(dailySaving.monthlyLimit, 300000);
  assert.equal(dailySaving.annualContributionLimit, 3600000);
  assert.equal(detailedSaving.perContributionMinAmount, 1000);
  assert.equal(detailedSaving.perContributionMaxAmount, 100000);
  assert.equal(detailedSaving.dailyContributionLimit, 200000);
  assert.equal(detailedSaving.weeklyContributionLimit, 500000);
  assert.equal(detailedSaving.monthlyLimit, 1000000);
  assert.equal(detailedSaving.totalContributionLimit, 10000000);
  assert.equal(deposit.minAmount, 1000000);
  assert.equal(deposit.maxAmount, 100000000);
  assert.equal(deposit.perContributionMaxAmount, 50000000);
  assert.equal(unlimitedDeposit.minAmount, 100000);
  assert.equal(unlimitedDeposit.maxAmount, 0);
  assert.equal(unlimitedDeposit.totalContributionLimit, 0);
});

test("infers interest calculation policy from product detail text", () => {
  const compound = normalizeRawProduct({
    ...rawProduct,
    productName: "복리정기예금",
    rateGuideText: "만기일시지급식(복리식) : 만기 후 이자 지급, 10원단위 미만 절사",
  });
  const monthlyPayout = normalizeRawProduct({
    ...rawProduct,
    productName: "월이자 정기예금",
    rateGuideText: "매월이자지급식(단리식) : 매월 이자 지급, 원단위까지 계산",
  });

  assert.equal(compound.interestCalculationMethod, "compound");
  assert.equal(compound.compoundingFrequency, "monthly");
  assert.equal(compound.interestPayoutType, "maturity");
  assert.equal(compound.interestRoundingMode, "floor");
  assert.equal(compound.interestRoundingUnit, 10);
  assert.equal(monthlyPayout.interestCalculationMethod, "simple");
  assert.equal(monthlyPayout.interestPayoutType, "monthly");
  assert.equal(monthlyPayout.interestRoundingUnit, 1);

  const dayUnit = normalizeRawProduct({
    ...rawProduct,
    termText: "1개월",
    rateGuideText: "6개월 ~ 36개월(일, 월단위) 가입 가능",
  });
  assert.equal(dayUnit.dayCountBasis, "actual365");
});

test("infers withdrawal and early termination policy from product detail text", () => {
  const partialWithdrawal = normalizeRawProduct({
    ...rawProduct,
    productName: "부분인출 정기예금",
    detailConditionText: "가입기간 중 부분인출 2회 가능. 중도해지 시 중도해지이율을 적용합니다.",
  });
  const lockedMaturity = normalizeRawProduct({
    ...rawProduct,
    productName: "만기 유지 정기예금",
    detailConditionText: "만기 전 해지 시 약정금리보다 낮은 중도해지금리가 적용됩니다.",
  });

  assert.equal(partialWithdrawal.partialWithdrawalAllowed, true);
  assert.equal(partialWithdrawal.earlyTerminationPenaltyApplies, true);
  assert.match(partialWithdrawal.withdrawalPolicyText, /부분인출/);
  assert.equal(lockedMaturity.partialWithdrawalAllowed, false);
  assert.equal(lockedMaturity.earlyTerminationPenaltyApplies, true);
});

test("infers installment contribution frequency from Naver detail text", () => {
  const daily = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    productName: "매일 넣는 적금",
    maxAmountText: "매일 1만원까지 납입",
    detailConditionText: "매일 납입하는 자유적립식 상품",
  });
  const weekly = normalizeRawProduct({
    ...rawProduct,
    productType: "installment",
    productName: "26주 자유적금",
    termText: "6개월",
    maxAmountText: "매주 납입",
    detailConditionText: "26주 동안 매주 자동이체",
  });

  assert.equal(daily.contributionFrequency, "daily");
  assert.equal(weekly.contributionFrequency, "weekly");
});

test("normalizes tiered rate rules for amount-based parking rates", () => {
  const product = normalizeRawProduct({
    ...rawProduct,
    productType: "parking",
    termText: "",
    tieredRateRules: [
      { sourceText: "50만원 이하 분 연 5.0%", rate: "5", minExclusiveAmount: 0, maxInclusiveAmount: 500000 },
      { sourceText: "50만원 초과 분 연 1.0%", rate: 1, minExclusiveAmount: 500000, maxInclusiveAmount: null },
    ],
  });

  assert.equal(product.tieredRateRules.length, 2);
  assert.equal(product.tieredRateRules[0].maxInclusiveAmount, 500000);
  assert.equal(product.tieredRateRules[1].minExclusiveAmount, 500000);
});

test("normalizes structured conditions for review and future calculation", () => {
  const product = normalizeRawProduct({
    ...rawProduct,
    structuredConditions: [
      {
        key: "appActivity",
        label: "앱 활동",
        rateBoost: "7",
        sourceText: "얼리버드 로그인 연속 10일 당 +7%p",
        requiresManualReview: false,
      },
      {
        key: "eventCoupon",
        label: "이벤트/쿠폰",
        sourceText: "쿠폰 발급 시행 시 홈페이지 게시",
        requiresManualReview: true,
      },
    ],
  });

  assert.equal(product.structuredConditions.length, 2);
  assert.equal(product.structuredConditions[0].rateBoost, 7);
  assert.equal(product.structuredConditions[1].requiresManualReview, true);
});

test("normalizes youth future savings government contribution rules", () => {
  const product = normalizeRawProduct({
    ...rawProduct,
    productName: "IBK청년미래적금",
    productType: "installment",
    termText: "36개월",
    maxAmountText: "월 50만원",
    detailConditionText: "정부기여금은 가입대상의 요건을 갖춘 사람으로서 가입자에게 서민금융진흥원이 지급",
  });

  assert.deepEqual(product.additionalBenefitRules.map((rule) => ({
    key: rule.key,
    contributionType: rule.contributionType,
    matchRate: rule.matchRate,
    monthlyCap: rule.monthlyCap,
    monthlyContributionBaseLimit: rule.monthlyContributionBaseLimit,
  })), [
    {
      key: "youthFutureGovernmentContribution",
      contributionType: "general",
      matchRate: 0.06,
      monthlyCap: 30000,
      monthlyContributionBaseLimit: 500000,
    },
    {
      key: "youthFutureGovernmentContribution",
      contributionType: "preferential",
      matchRate: 0.12,
      monthlyCap: 60000,
      monthlyContributionBaseLimit: 500000,
    },
  ]);
});

test("uses structured first-customer condition for first-customer eligibility", () => {
  const product = normalizeRawProduct({
    ...rawProduct,
    conditionText: "",
    structuredConditions: [
      {
        key: "firstCustomer",
        label: "신규 고객",
        rateBoost: 1,
        sourceText: "최근 1년 이내 예적금 신규 이력이 없는 고객",
      },
    ],
  });

  assert.equal(product.firstCustomerOnly, true);
});

test("parses and preserves age and income eligibility rules", () => {
  const eligibility = parseEligibilityText("만 19세 이상 만 34세 이하, 연소득 5,000만원 이하");
  assert.equal(eligibility.minAge, 19);
  assert.equal(eligibility.maxAge, 34);
  assert.equal(eligibility.maxAnnualIncome, 50000000);

  const product = normalizeRawProduct({
    ...rawProduct,
    eligibilityText: "만 19세 이상 만 34세 이하, 연소득 5,000만원 이하",
  });
  assert.equal(product.eligibility.maxAge, 34);
  assert.ok(product.eligibility.flags.includes("income"));
});

test("parses personal profile eligibility flags separately from action conditions", () => {
  const eligibility = parseEligibilityText("청년, 신혼부부, 군 장병, 연소득 5,000만원 이하");

  assert.ok(eligibility.flags.includes("youth"));
  assert.ok(eligibility.flags.includes("newlywed"));
  assert.ok(eligibility.flags.includes("military"));
  assert.ok(eligibility.flags.includes("incomeEligible"));
});

test("normalization merges stale raw eligibility with product name and detail eligibility signals", () => {
  const military = normalizeRawProduct({
    ...rawProduct,
    productName: "NH장병내일준비적금",
    productType: "installment",
    eligibility: { flags: ["firstCustomer"], sourceText: "첫거래 우대" },
    detailConditionText: "의무복무이행자 중 병급여체계 적용 대상 병사 개인",
  });
  const child = normalizeRawProduct({
    ...rawProduct,
    productName: "아이사랑 정기적금",
    productType: "installment",
    eligibility: { flags: [], sourceText: "" },
    detailConditionText: "만 19세 미만 자녀 2명 이상을 둔 부모 및 자녀",
  });

  assert.ok(military.eligibility.flags.includes("military"));
  assert.ok(military.eligibility.flags.includes("firstCustomer"));
  assert.ok(child.eligibility.flags.includes("child"));
});

test("eligibility parsing does not mark parent proxy wording in military products as child eligibility", () => {
  const eligibility = parseEligibilityText("장병내일준비적금 가입자격 확인서 제출, 부모에 의한 대리 가입 가능");

  assert.ok(eligibility.flags.includes("military"));
  assert.equal(eligibility.flags.includes("child"), false);
});

test("validates required fields and stale data", () => {
  const active = { ...normalizeRawProduct(rawProduct), reviewStatus: "approved" };
  assert.equal(validateProduct(active, { today: "2026-07-18" }).ok, true);

  const stale = { ...active, updatedAt: "2026-05-01" };
  const result = validateProduct(stale, { today: "2026-07-18", staleAfterDays: 30 });
  assert.equal(result.ok, false);
  assert.equal(result.status, "stale");
});

test("normalization uses the latest collection date for catalog freshness", () => {
  const product = normalizeRawProduct({
    ...rawProduct,
    updatedAt: "2026-06-01",
    scrapedAt: "2026-07-18",
    detailFetchedAt: "2026-07-18",
  });

  assert.equal(product.updatedAt, "2026-07-18");
  assert.equal(product.sourceUpdatedAt, "2026-06-01");
  assert.equal(validateProduct({ ...product, reviewStatus: "approved" }, { today: "2026-07-19" }).ok, true);
});

test("builds active catalog only from approved valid products", () => {
  const rawProducts = [
    { ...rawProduct, reviewStatus: "approved" },
    { ...rawProduct, productName: "검수전 상품", reviewStatus: "pending" },
    { ...rawProduct, productName: "깨진 상품", maxRateText: "", reviewStatus: "approved" },
  ];

  const catalog = buildActiveCatalog(rawProducts, { today: "2026-07-18" });

  assert.equal(catalog.activeProducts.length, 1);
  assert.equal(catalog.rejectedProducts.length, 2);
  assert.equal(catalog.activeProducts[0].status, "active");
  assert.equal(catalog.metadata.activeCount, 1);
  assert.equal(catalog.metadata.rejectedCount, 2);
});
