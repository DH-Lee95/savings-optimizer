import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTECTION_LIMIT,
  calculateRealizableRate,
  createPaidReport,
  optimizeSavings,
} from "../src/lib/optimizer.js";

const products = [
  {
    id: "park-a",
    bank: "토스뱅크",
    name: "모바일 파킹통장",
    type: "parking",
    baseRate: 2.2,
    maxRate: 3.1,
    termMonths: 1,
    maxAmount: 20000000,
    monthlyLimit: 0,
    officialUrl: "https://example.com/park-a",
    updatedAt: "2026-07-18",
    easeScore: 95,
    conditions: [{ key: "appSignup", label: "앱 가입", rateBoost: 0.3, friction: 1 }],
  },
  {
    id: "deposit-a",
    bank: "새봄은행",
    name: "첫거래 정기예금",
    type: "deposit",
    baseRate: 3.0,
    maxRate: 4.3,
    termMonths: 12,
    maxAmount: 40000000,
    monthlyLimit: 0,
    officialUrl: "https://example.com/deposit-a",
    updatedAt: "2026-07-18",
    easeScore: 70,
    firstCustomerOnly: true,
    conditions: [
      { key: "firstCustomer", label: "첫거래", rateBoost: 0.6, friction: 2 },
      { key: "salaryTransfer", label: "급여이체", rateBoost: 0.4, friction: 4 },
    ],
  },
  {
    id: "deposit-b",
    bank: "국민은행",
    name: "주거래 정기예금",
    type: "deposit",
    baseRate: 3.2,
    maxRate: 3.8,
    termMonths: 12,
    maxAmount: 90000000,
    monthlyLimit: 0,
    officialUrl: "https://example.com/deposit-b",
    updatedAt: "2026-07-18",
    easeScore: 84,
    conditions: [{ key: "primaryBankChange", label: "주거래 변경", rateBoost: 0.5, friction: 5 }],
  },
  {
    id: "installment-a",
    bank: "카카오뱅크",
    name: "26주 자유적금",
    type: "installment",
    baseRate: 3.4,
    maxRate: 4.1,
    termMonths: 12,
    maxAmount: 0,
    monthlyLimit: 500000,
    interestTaxExempt: true,
    officialUrl: "https://example.com/installment-a",
    updatedAt: "2026-07-18",
    easeScore: 90,
    conditions: [{ key: "autoDebit", label: "자동이체", rateBoost: 0.4, friction: 2 }],
  },
];

const baseInput = {
  lumpSum: 12000000,
  monthlySavings: 600000,
  horizonMonths: 12,
  liquidityNeed: "medium",
  preference: "balanced",
  userBanks: ["국민은행"],
  activeProductCount: 2,
  activeProducts: [{ bank: "국민은행", type: "deposit", balance: 5000000, rate: 2.5, remainingMonths: 8 }],
  conditions: {
    salaryTransfer: true,
    cardSpend: false,
    autoDebit: true,
    marketingConsent: false,
    appSignup: true,
    primaryBankChange: false,
  },
};

test("calculates only user-realizable preferential rate", () => {
  const rate = calculateRealizableRate(products[1], baseInput, "realistic");
  assert.equal(rate.appliedRate, 4);
  assert.deepEqual(rate.appliedConditions.map((c) => c.key), ["firstCustomer", "salaryTransfer"]);
});

test("does not grant first-customer benefit for an already used bank", () => {
  const rate = calculateRealizableRate(products[2], baseInput, "realistic");
  assert.equal(rate.appliedRate, 3.2);
  assert.equal(rate.missedConditions[0].key, "primaryBankChange");
});

test("high-liquidity plan keeps more money in parking than low-liquidity plan", () => {
  const high = optimizeSavings({ ...baseInput, liquidityNeed: "high" }, products).plans.realistic;
  const low = optimizeSavings({ ...baseInput, liquidityNeed: "low" }, products).plans.realistic;
  const highParking = high.allocations.filter((a) => a.type === "parking").reduce((sum, a) => sum + a.amount, 0);
  const lowParking = low.allocations.filter((a) => a.type === "parking").reduce((sum, a) => sum + a.amount, 0);
  assert.ok(highParking > lowParking);
});

test("financial sector limit filters recommendations before ranking by yield", () => {
  const firstBankSaving = {
    ...products[3],
    id: "first-bank-saving",
    bank: "국민은행",
    name: "1금융 적금",
    baseRate: 3,
    maxRate: 3,
    monthlyLimit: 300000,
    conditions: [],
  };
  const secondBankSaving = {
    ...products[3],
    id: "second-bank-saving",
    bank: "서울신협",
    name: "2금융 적금",
    baseRate: 5,
    maxRate: 5,
    monthlyLimit: 300000,
    conditions: [],
  };
  const savingsBankSaving = {
    ...products[3],
    id: "savings-bank-saving",
    bank: "OK저축은행",
    name: "저축은행 적금",
    baseRate: 9,
    maxRate: 9,
    monthlyLimit: 300000,
    conditions: [],
  };
  const input = {
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
    horizonMonths: 12,
  };

  assert.equal(
    optimizeSavings({ ...input, financialSectorLimit: "firstOnly" }, [savingsBankSaving, secondBankSaving, firstBankSaving])
      .plans.maxYield.allocations[0].productId,
    "first-bank-saving",
  );
  assert.equal(
    optimizeSavings({ ...input, financialSectorLimit: "secondIncluded" }, [savingsBankSaving, secondBankSaving, firstBankSaving])
      .plans.maxYield.allocations[0].productId,
    "second-bank-saving",
  );
  assert.equal(
    optimizeSavings({ ...input, financialSectorLimit: "savingsBankIncluded" }, [savingsBankSaving, secondBankSaving, firstBankSaving])
      .plans.maxYield.allocations[0].productId,
    "savings-bank-saving",
  );
});

test("generic manual review conditions do not appear as pending recommendation conditions", () => {
  const product = {
    ...products[3],
    id: "manual-generic-saving",
    bank: "일반은행",
    name: "일반 설명 적금",
    baseRate: 4,
    maxRate: 4,
    monthlyLimit: 300000,
    conditions: [
      { key: "manualReview", label: "수동 검수", sourceText: "상품설명서 확인 필요", requiresManualReview: true },
    ],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
  }, [product]);

  assert.deepEqual(report.plans.maxYield.allocations[0].pendingConditions, []);
});

test("allocation condition labels are deduplicated before display", () => {
  const product = {
    ...products[3],
    id: "duplicate-condition-saving",
    bank: "중복은행",
    name: "중복 조건 적금",
    baseRate: 3,
    maxRate: 6,
    monthlyLimit: 300000,
    conditions: [
      { key: "autoDebit", label: "자동이체", rateBoost: 1, sourceText: "자동이체 등록 시 연 1.0%p" },
      { key: "manualReview", label: "이벤트/쿠폰", rateBoost: 1, sourceText: "이벤트 쿠폰 확인", requiresManualReview: true },
    ],
    structuredConditions: [
      { key: "autoDebit", label: "자동이체", rateBoost: 1, sourceText: "자동이체 등록 시 연 1.0%p" },
      { key: "manualReview", label: "이벤트/쿠폰", rateBoost: 1, sourceText: "이벤트 쿠폰 확인", requiresManualReview: true },
    ],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
  }, [product]);
  const allocation = report.plans.maxYield.allocations[0];

  assert.deepEqual(allocation.appliedConditions, ["자동이체"]);
  assert.deepEqual(allocation.pendingConditions, ["이벤트/쿠폰"]);
});

test("parking allocations use amount-based tiered rates when available", () => {
  const tieredProducts = [
    {
      ...products[0],
      baseRate: 0.1,
      maxRate: 5,
      conditions: [],
      tieredRateRules: [
        { sourceText: "50만원 이하 분 연 5.0%", minExclusiveAmount: 0, maxInclusiveAmount: 500000, rate: 5 },
        { sourceText: "500만원 이하 분 연 0.8%", minExclusiveAmount: 500000, maxInclusiveAmount: 5000000, rate: 0.8 },
        { sourceText: "5천만원 이하 분 연 0.1%", minExclusiveAmount: 5000000, maxInclusiveAmount: 50000000, rate: 0.1 },
      ],
    },
  ];

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 3,
    liquidityNeed: "high",
  }, tieredProducts);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.amount, 1000000);
  assert.equal(allocation.appliedRate, 2.9);
  assert.equal(allocation.expectedAfterTaxInterest, 6134);
  assert.equal(allocation.tieredRateRules.length, 3);
});

test("parking tiered rates include applied preferential boosts", () => {
  const boostedParking = [
    {
      ...products[0],
      baseRate: 0.1,
      maxRate: 7,
      conditions: [{ key: "marketingConsent", label: "마케팅 동의", rateBoost: 2, friction: 1 }],
      tieredRateRules: [
        { sourceText: "50만원 이하 분 연 5.0%", minExclusiveAmount: 0, maxInclusiveAmount: 500000, rate: 5 },
        { sourceText: "500만원 이하 분 연 0.8%", minExclusiveAmount: 500000, maxInclusiveAmount: 5000000, rate: 0.8 },
      ],
    },
  ];

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 3,
    liquidityNeed: "high",
    conditions: { ...baseInput.conditions, marketingConsent: true },
  }, boostedParking);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.appliedRate, 4.9);
  assert.equal(allocation.expectedAfterTaxInterest, 10364);
});

test("parking tiered rates apply fallback rate to uncovered balances", () => {
  const partialTierParking = [
    {
      ...products[0],
      baseRate: 1,
      maxRate: 3,
      conditions: [],
      tieredRateRules: [
        { sourceText: "50만원 이하 분 연 3.0%", minExclusiveAmount: 0, maxInclusiveAmount: 500000, rate: 3 },
      ],
    },
  ];

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 3,
    liquidityNeed: "high",
  }, partialTierParking);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.appliedRate, 2);
  assert.equal(allocation.expectedAfterTaxInterest, 4230);
});

test("deposit interest uses compound calculation and product rounding policy when provided", () => {
  const compoundDeposit = {
    ...products[1],
    id: "compound-deposit",
    bank: "복리은행",
    name: "월복리 정기예금",
    baseRate: 12,
    maxRate: 12,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 10000000,
    interestCalculationMethod: "compound",
    compoundingFrequency: "monthly",
    interestPayoutType: "maturity",
    conditions: [],
  };
  const roundedDeposit = {
    ...products[1],
    id: "rounded-deposit",
    bank: "절사은행",
    name: "10원 절사 정기예금",
    baseRate: 3.21,
    maxRate: 3.21,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 10000000,
    interestRoundingMode: "floor",
    interestRoundingUnit: 10,
    conditions: [],
  };

  const compoundReport = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 12,
    liquidityNeed: "low",
  }, [compoundDeposit]);
  const roundedReport = optimizeSavings({
    ...baseInput,
    lumpSum: 1234567,
    monthlySavings: 0,
    horizonMonths: 12,
    liquidityNeed: "low",
  }, [roundedDeposit]);

  assert.equal(compoundReport.plans.maxYield.allocations[0].expectedAfterTaxInterest, 107294);
  assert.equal(compoundReport.plans.maxYield.allocations[0].interestCalculationMethod, "compound");
  assert.equal(roundedReport.plans.maxYield.allocations[0].expectedAfterTaxInterest, 33520);
  assert.equal(roundedReport.plans.maxYield.allocations[0].interestRoundingUnit, 10);
});

test("deposit interest can use actual 365 day count for day-unit products", () => {
  const actualDaysDeposit = {
    ...products[1],
    id: "actual-days-deposit",
    bank: "일수은행",
    name: "일단위 정기예금",
    baseRate: 12,
    maxRate: 12,
    termMonths: 1,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 10000000,
    dayCountBasis: "actual365",
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 1,
    liquidityNeed: "low",
  }, [actualDaysDeposit]);

  assert.equal(report.plans.maxYield.allocations[0].expectedAfterTaxInterest, 8344);
  assert.equal(report.plans.maxYield.allocations[0].dayCountBasis, "actual365");
});

test("excluded or already active recommendations are skipped so the next best product is shown", () => {
  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 12,
    liquidityNeed: "low",
    excludedProductIds: ["deposit-a"],
    activeProducts: [
      { productId: "park-a", bank: "토스뱅크", productName: "모바일 파킹통장", balance: 1000000, rate: 2.2 },
    ],
  }, products);

  const productIds = report.plans.maxYield.allocations.map((allocation) => allocation.productId);
  assert.equal(productIds.includes("deposit-a"), false);
  assert.equal(productIds.includes("park-a"), false);
  assert.equal(productIds[0], "deposit-b");
});

test("target analysis reports projected balance and gap against the user's goal", () => {
  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 100000,
    horizonMonths: 12,
    liquidityNeed: "medium",
    targetAmount: 3000000,
  }, products);

  assert.equal(report.targetAnalysis.targetAmount, 3000000);
  assert.ok(report.targetAnalysis.projectedEndingBalance > 2200000);
  assert.ok(report.targetAnalysis.gap > 0);
  assert.equal(report.targetAnalysis.targetMet, false);
  assert.ok(report.targetAnalysis.requiredMonthlySavings > 100000);
});

test("allocations expose whether each recommended product supports withdrawal", () => {
  const flexibleDeposit = {
    ...products[1],
    id: "flexible-deposit",
    bank: "유동은행",
    name: "부분인출 정기예금",
    baseRate: 9,
    maxRate: 9,
    minAmount: 100000,
    maxAmount: 10000000,
    firstCustomerOnly: false,
    partialWithdrawalAllowed: true,
    conditions: [],
  };
  const lockedDeposit = {
    ...products[1],
    id: "locked-deposit",
    bank: "고정은행",
    name: "고금리 만기예금",
    baseRate: 8,
    maxRate: 8,
    minAmount: 100000,
    maxAmount: 10000000,
    firstCustomerOnly: false,
    partialWithdrawalAllowed: false,
    conditions: [],
  };
  const parking = {
    ...products[0],
    id: "parking-low",
    baseRate: 2,
    maxRate: 2,
    maxAmount: 10000000,
    partialWithdrawalAllowed: true,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 12,
    liquidityNeed: "low",
  }, [flexibleDeposit, lockedDeposit, parking]);

  const flexible = report.plans.maxYield.allocations.find((allocation) => allocation.productId === "flexible-deposit");
  assert.equal(flexible.partialWithdrawalAllowed, true);
  assert.equal(flexible.withdrawalCompatible, true);
});

test("applies calculable structured Naver conditions and holds manual conditions for review", () => {
  const structuredProduct = {
    id: "saving-structured",
    bank: "OK저축은행",
    name: "조건형 적금",
    type: "installment",
    baseRate: 2,
    maxRate: 14,
    termMonths: 12,
    maxAmount: 0,
    monthlyLimit: 300000,
    officialUrl: "https://example.com/saving-structured",
    updatedAt: "2026-07-18",
    easeScore: 68,
    conditions: [],
    structuredConditions: [
      {
        key: "firstCustomer",
        label: "신규 고객",
        rateBoost: 3,
        friction: 2,
        sourceText: "신규 고객 우대 연 3.0%p",
      },
      {
        key: "payAccountRegistration",
        label: "간편결제 계좌 등록",
        rateBoost: 1.5,
        friction: 2,
        sourceText: "간편결제 계좌 등록 연 1.5%p",
      },
      {
        key: "appActivity",
        label: "앱 활동",
        rateBoost: 4,
        friction: 6,
        sourceText: "앱 출석 미션 연 4.0%p",
      },
      {
        key: "eventCoupon",
        label: "이벤트/쿠폰",
        rateBoost: 5,
        sourceText: "이벤트 쿠폰 발급 시 연 5.0%p",
        requiresManualReview: true,
      },
    ],
  };

  const report = optimizeSavings({
    ...baseInput,
    monthlySavings: 300000,
    userBanks: [],
    conditions: {
      ...baseInput.conditions,
      payAccountRegistration: true,
      appActivity: true,
      eventCoupon: true,
    },
  }, [structuredProduct]);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.appliedRate, 10.5);
  assert.deepEqual(allocation.appliedConditions, ["신규 고객", "간편결제 계좌 등록", "앱 활동"]);
  assert.deepEqual(allocation.pendingConditions, ["이벤트/쿠폰"]);
});

test("safe split plan respects deposit protection limit per bank", () => {
  const report = optimizeSavings({ ...baseInput, lumpSum: 120000000, liquidityNeed: "low" }, products);
  const byBank = new Map();
  for (const allocation of report.plans.safeSplit.allocations) {
    byBank.set(allocation.bank, (byBank.get(allocation.bank) ?? 0) + allocation.amount);
  }
  for (const amount of byBank.values()) {
    assert.ok(amount <= PROTECTION_LIMIT);
  }
});

test("does not allocate to products when available amount is below the product minimum", () => {
  const minimumProducts = [
    {
      ...products[1],
      id: "deposit-minimum",
      bank: "최소은행",
      name: "최소 100만원 예금",
      firstCustomerOnly: false,
      minAmount: 1000000,
      maxAmount: 10000000,
      conditions: [],
    },
    {
      ...products[3],
      id: "saving-minimum",
      bank: "최소은행",
      name: "최소 월 10만원 적금",
      minMonthlyAmount: 100000,
      monthlyLimit: 500000,
      conditions: [],
    },
  ];

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 500000,
    monthlySavings: 50000,
    liquidityNeed: "low",
  }, minimumProducts);

  assert.equal(report.plans.realistic.allocations.length, 0);
});

test("max-yield plan allocates lump sum by actual after-tax return, not convenience score", () => {
  const lowRateEasyDeposit = {
    ...products[1],
    id: "low-rate-easy",
    bank: "간편은행",
    name: "간편 저금리 예금",
    baseRate: 2,
    maxRate: 2,
    firstCustomerOnly: false,
    easeScore: 100,
    maxAmount: 10000000,
    conditions: [],
  };
  const highRateHardDeposit = {
    ...lowRateEasyDeposit,
    id: "high-rate-hard",
    bank: "고금리은행",
    name: "불편 고금리 예금",
    baseRate: 5,
    maxRate: 5,
    easeScore: 40,
  };
  const lowRateParking = {
    ...products[0],
    baseRate: 1,
    maxRate: 1,
    maxAmount: 10000000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 5000000,
    monthlySavings: 0,
    liquidityNeed: "medium",
  }, [lowRateEasyDeposit, highRateHardDeposit, lowRateParking]);

  const maxYield = report.plans.maxYield.allocations;
  assert.equal(maxYield.length, 1);
  assert.equal(maxYield[0].productName, "불편 고금리 예금");
  assert.equal(maxYield[0].amount, 5000000);
});

test("max-yield plan splits lump sum across the best rate tiers before lower tiers", () => {
  const highTierParking = {
    ...products[0],
    id: "tiered-parking-best",
    bank: "구간은행",
    name: "구간 파킹",
    baseRate: 0.1,
    maxRate: 8,
    conditions: [],
    tieredRateRules: [
      { sourceText: "50만원 이하 연 8%", minExclusiveAmount: 0, maxInclusiveAmount: 500000, rate: 8 },
      { sourceText: "50만원 초과 연 0.1%", minExclusiveAmount: 500000, maxInclusiveAmount: null, rate: 0.1 },
    ],
  };
  const deposit = {
    ...products[1],
    id: "four-percent-deposit",
    bank: "예금은행",
    name: "4퍼센트 예금",
    baseRate: 4,
    maxRate: 4,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 1000000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 1000000,
    monthlySavings: 0,
    horizonMonths: 12,
    liquidityNeed: "low",
  }, [highTierParking, deposit]);

  const allocations = report.plans.maxYield.allocations;
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].productName, "구간 파킹");
  assert.equal(allocations[0].amount, 500000);
  assert.equal(allocations[1].productName, "4퍼센트 예금");
  assert.equal(allocations[1].amount, 500000);
});

test("installment allocation honors per-day limits converted into monthly capacity", () => {
  const dailySaving = {
    ...products[3],
    id: "daily-limit-saving",
    bank: "일한도은행",
    name: "매일 만원 적금",
    baseRate: 12,
    maxRate: 12,
    termMonths: 1,
    monthlyLimit: 0,
    dailyContributionLimit: 10000,
    contributionFrequency: "daily",
    conditions: [],
  };
  const fallbackSaving = {
    ...products[3],
    id: "fallback-saving",
    bank: "남은돈은행",
    name: "남은돈 적금",
    baseRate: 3,
    maxRate: 3,
    termMonths: 1,
    monthlyLimit: 500000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 500000,
    horizonMonths: 1,
  }, [dailySaving, fallbackSaving]);

  const dailyAllocation = report.plans.maxYield.allocations.find((allocation) => allocation.productName === "매일 만원 적금");
  const fallbackAllocation = report.plans.maxYield.allocations.find((allocation) => allocation.productName === "남은돈 적금");
  assert.equal(dailyAllocation.monthlyAmount, 300000);
  assert.equal(dailyAllocation.contributionAmount, 10000);
  assert.equal(fallbackAllocation.monthlyAmount, 200000);
});

test("monthly savings can be split across multiple optimal installment products by each product limit", () => {
  const savingA = {
    ...products[3],
    id: "split-saving-a",
    bank: "분할은행A",
    name: "월 50만원 고금리",
    baseRate: 8,
    maxRate: 8,
    monthlyLimit: 500000,
    conditions: [],
  };
  const savingB = {
    ...products[3],
    id: "split-saving-b",
    bank: "분할은행B",
    name: "월 60만원 중금리",
    baseRate: 6,
    maxRate: 6,
    monthlyLimit: 600000,
    conditions: [],
  };
  const savingC = {
    ...products[3],
    id: "split-saving-c",
    bank: "분할은행C",
    name: "남은 월 40만원",
    baseRate: 4,
    maxRate: 4,
    monthlyLimit: 1000000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 1500000,
    horizonMonths: 12,
  }, [savingC, savingB, savingA]);

  const allocations = report.plans.maxYield.allocations.filter((allocation) => allocation.type === "installment");
  assert.deepEqual(allocations.map((allocation) => allocation.productId), [
    "split-saving-a",
    "split-saving-b",
    "split-saving-c",
  ]);
  assert.deepEqual(allocations.map((allocation) => allocation.monthlyAmount), [500000, 600000, 400000]);
});

test("monthly savings distribution respects the user-selected maximum product count without leaving coverable savings unallocated", () => {
  const savingA = {
    ...products[3],
    id: "max-count-saving-a",
    bank: "분배은행A",
    name: "월 50만원 고금리",
    baseRate: 8,
    maxRate: 8,
    monthlyLimit: 500000,
    conditions: [],
  };
  const savingB = {
    ...products[3],
    id: "max-count-saving-b",
    bank: "분배은행B",
    name: "월 60만원 중금리",
    baseRate: 6,
    maxRate: 6,
    monthlyLimit: 600000,
    conditions: [],
  };
  const savingC = {
    ...products[3],
    id: "max-count-saving-c",
    bank: "분배은행C",
    name: "월 40만원 저금리",
    baseRate: 4,
    maxRate: 4,
    monthlyLimit: 1000000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 1500000,
    horizonMonths: 12,
    maxAllocationCount: 2,
  }, [savingC, savingB, savingA]);

  const allocations = report.plans.maxYield.allocations.filter((allocation) => allocation.type === "installment");
  assert.equal(allocations.length, 2);
  assert.deepEqual(allocations.map((allocation) => allocation.productId), [
    "max-count-saving-a",
    "max-count-saving-c",
  ]);
  assert.deepEqual(allocations.map((allocation) => allocation.monthlyAmount), [500000, 1000000]);
  assert.equal(report.plans.maxYield.unallocatedMonthlySavings, 0);
  assert.equal(report.plans.maxYield.totalPrincipal, 1500000 * 12);
});

test("single-use preferential conditions are consumed by only one recommended monthly product", () => {
  const salarySavingA = {
    ...products[3],
    id: "salary-saving-a",
    bank: "급여은행A",
    name: "급여 우대 적금 A",
    baseRate: 3,
    maxRate: 8,
    monthlyLimit: 300000,
    conditions: [{ key: "salaryTransfer", label: "급여이체", rateBoost: 5, friction: 4 }],
  };
  const salarySavingB = {
    ...products[3],
    id: "salary-saving-b",
    bank: "급여은행B",
    name: "급여 우대 적금 B",
    baseRate: 3,
    maxRate: 8,
    monthlyLimit: 300000,
    conditions: [{ key: "salaryTransfer", label: "급여이체", rateBoost: 5, friction: 4 }],
  };
  const openSaving = {
    ...products[3],
    id: "open-saving-low",
    bank: "일반은행",
    name: "일반 적금",
    baseRate: 4,
    maxRate: 4,
    monthlyLimit: 300000,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 600000,
    horizonMonths: 12,
    conditions: { ...baseInput.conditions, salaryTransfer: true },
  }, [salarySavingA, salarySavingB, openSaving]);

  const allocations = report.plans.maxYield.allocations.filter((allocation) => allocation.type === "installment");
  const salaryAppliedCount = allocations.filter((allocation) => allocation.appliedConditions.includes("급여이체")).length;

  assert.equal(salaryAppliedCount, 1);
  assert.deepEqual(allocations.map((allocation) => allocation.productId), ["salary-saving-a", "open-saving-low"]);
});

test("allocation exposes projected maturity amount per recommended product", () => {
  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 500000,
    horizonMonths: 12,
  }, [products[3]]);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.principalAtMaturity, 6000000);
  assert.equal(allocation.projectedMaturityAmount, allocation.principalAtMaturity + allocation.totalExpectedBenefit);
});

test("switching analysis compares multiple active products against an immediate optimal alternative", () => {
  const betterDeposit = {
    ...products[1],
    id: "better-deposit",
    bank: "대안은행",
    name: "대안 정기예금",
    baseRate: 5,
    maxRate: 5,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 100000000,
    conditions: [],
  };
  const report = createPaidReport({
    ...baseInput,
    planPurpose: "switching",
    lumpSum: 0,
    monthlySavings: 0,
    horizonMonths: 12,
    activeProducts: [
      {
        productId: "old-low",
        bank: "기존은행",
        productName: "낮은금리 예금",
        balance: 10000000,
        rate: 2,
        remainingMonths: 12,
      },
      {
        productId: "old-high",
        bank: "유지은행",
        productName: "만기임박 예금",
        balance: 5000000,
        rate: 6,
        remainingMonths: 3,
      },
    ],
  }, [betterDeposit]);

  assert.equal(report.switchingAnalysis.recommendationMode, "switching");
  assert.equal(report.switchingAnalysis.activeProductCount, 2);
  assert.equal(report.switchingAnalysis.activeProducts.length, 2);
  assert.equal(report.switchingAnalysis.currentPrincipal, 15000000);
  assert.equal(report.switchingAnalysis.alternativePrincipal, 15000000);
  assert.ok(report.switchingAnalysis.currentAfterTaxInterest > 0);
  assert.ok(report.switchingAnalysis.alternativeTotalBenefit > report.switchingAnalysis.currentAfterTaxInterest);
  assert.ok(report.switchingAnalysis.estimatedGain > 0);
  assert.equal(report.switchingAnalysis.recommendedAction, "switch");
});

test("switching analysis keeps negative gains when switching is worse than staying", () => {
  const worseDeposit = {
    ...products[1],
    id: "worse-deposit",
    bank: "낮은대안은행",
    name: "낮은 대안 예금",
    baseRate: 1,
    maxRate: 1,
    firstCustomerOnly: false,
    minAmount: 100000,
    maxAmount: 100000000,
    conditions: [],
  };
  const report = createPaidReport({
    ...baseInput,
    planPurpose: "switching",
    lumpSum: 0,
    monthlySavings: 0,
    horizonMonths: 12,
    activeProducts: [
      {
        productId: "good-current",
        bank: "기존은행",
        productName: "고금리 기존 예금",
        balance: 10000000,
        rate: 8,
        remainingMonths: 12,
      },
    ],
  }, [worseDeposit]);

  assert.ok(report.switchingAnalysis.estimatedGain < 0);
  assert.equal(report.switchingAnalysis.recommendedAction, "stay");
});

test("excludes products when age or income eligibility does not match user", () => {
  const restrictedProducts = [
    {
      ...products[1],
      id: "youth-deposit",
      bank: "청년은행",
      name: "청년 고금리 예금",
      baseRate: 6,
      maxRate: 7,
      firstCustomerOnly: false,
      eligibility: {
        minAge: 19,
        maxAge: 34,
        maxAnnualIncome: 50000000,
        flags: ["age", "income"],
      },
      conditions: [],
    },
    products[2],
  ];

  const report = optimizeSavings(
    {
      ...baseInput,
      age: 42,
      annualIncome: 80000000,
      liquidityNeed: "low",
      userBanks: [],
    },
    restrictedProducts,
  );
  const productNames = report.plans.realistic.allocations.map((allocation) => allocation.productName);

  assert.ok(!productNames.includes("청년 고금리 예금"));
  assert.ok(productNames.includes("주거래 정기예금"));
});

test("excludes age or income restricted products when the monthly flow does not collect those fields", () => {
  const restrictedProduct = {
    ...products[3],
    id: "age-income-saving",
    bank: "제한은행",
    name: "청년 소득제한 적금",
    baseRate: 9,
    maxRate: 9,
    monthlyLimit: 500000,
    eligibility: {
      minAge: 19,
      maxAge: 34,
      maxAnnualIncome: 50000000,
      flags: ["age", "income"],
    },
    conditions: [],
  };
  const fallback = {
    ...products[3],
    id: "open-saving",
    bank: "일반은행",
    name: "일반 적금",
    baseRate: 3,
    maxRate: 3,
    monthlyLimit: 500000,
    eligibility: { flags: [] },
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    age: undefined,
    annualIncome: undefined,
    lumpSum: 0,
    monthlySavings: 500000,
  }, [restrictedProduct, fallback]);

  assert.equal(report.plans.maxYield.allocations[0].productId, "open-saving");
});

test("matches special profile eligibility before recommending restricted products", () => {
  const militaryProduct = {
    ...products[3],
    id: "military-saving",
    bank: "특화은행",
    name: "장병 우대 적금",
    baseRate: 6,
    maxRate: 7,
    monthlyLimit: 400000,
    eligibility: {
      flags: ["military"],
      sourceText: "의무복무이행자 중 병급여체계 적용 대상 병사",
    },
    conditions: [],
  };

  const defaultReport = optimizeSavings({
    ...baseInput,
    monthlySavings: 400000,
  }, [militaryProduct, products[3]]);
  assert.equal(defaultReport.plans.realistic.allocations[0].productName, "26주 자유적금");

  const matchedReport = optimizeSavings({
    ...baseInput,
    monthlySavings: 400000,
    specialEligibility: { military: true },
  }, [militaryProduct, products[3]]);
  assert.equal(matchedReport.plans.realistic.allocations[0].productName, "장병 우대 적금");
});

test("regional products require matching user region before recommendation", () => {
  const regionalProduct = {
    ...products[3],
    id: "jeonnam-youth-saving",
    bank: "광주은행",
    name: "전남청년미래적금",
    baseRate: 8,
    maxRate: 8,
    monthlyLimit: 300000,
    eligibility: {
      flags: ["regional"],
      regions: ["jeonnam"],
      sourceText: "전라남도 전남청년문화복지카드 지원사업 선정자",
    },
    conditions: [],
  };
  const fallback = {
    ...products[3],
    id: "open-saving-regional-fallback",
    name: "일반 적금",
    baseRate: 4,
    maxRate: 4,
    monthlyLimit: 300000,
    conditions: [],
  };

  const defaultReport = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
    specialEligibility: {},
    userRegions: [],
  }, [regionalProduct, fallback]);
  const matchedReport = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
    specialEligibility: {},
    userRegions: ["jeonnam"],
  }, [regionalProduct, fallback]);

  assert.equal(defaultReport.plans.realistic.allocations[0].productName, "일반 적금");
  assert.equal(matchedReport.plans.realistic.allocations[0].productName, "전남청년미래적금");
});

test("matches youth newlywed and income profile eligibility before recommending restricted products", () => {
  const youthProduct = {
    ...products[3],
    id: "youth-profile-saving",
    bank: "청년은행",
    name: "청년 우대 적금",
    baseRate: 7,
    maxRate: 7,
    monthlyLimit: 300000,
    eligibility: {
      minAge: 19,
      maxAge: 34,
      flags: ["youth", "age"],
    },
    conditions: [],
  };
  const newlywedProduct = {
    ...products[3],
    id: "newlywed-profile-saving",
    bank: "신혼은행",
    name: "신혼 우대 적금",
    baseRate: 8,
    maxRate: 8,
    monthlyLimit: 300000,
    eligibility: {
      flags: ["newlywed"],
    },
    conditions: [],
  };
  const incomeProduct = {
    ...products[3],
    id: "income-profile-saving",
    bank: "소득은행",
    name: "소득요건 우대 적금",
    baseRate: 9,
    maxRate: 9,
    monthlyLimit: 300000,
    eligibility: {
      maxAnnualIncome: 50000000,
      flags: ["income", "incomeEligible"],
    },
    conditions: [],
  };
  const fallback = {
    ...products[3],
    id: "general-profile-saving",
    bank: "일반은행",
    name: "일반 적금",
    baseRate: 3,
    maxRate: 3,
    monthlyLimit: 900000,
    eligibility: { flags: [] },
    conditions: [],
  };

  const defaultReport = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 900000,
    specialEligibility: {},
  }, [incomeProduct, newlywedProduct, youthProduct, fallback]);
  assert.deepEqual(
    defaultReport.plans.maxYield.allocations.map((allocation) => allocation.productId),
    ["general-profile-saving"],
  );

  const matchedReport = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 900000,
    specialEligibility: { youth: true, newlywed: true, incomeEligible: true },
  }, [incomeProduct, newlywedProduct, youthProduct, fallback]);

  assert.deepEqual(
    matchedReport.plans.maxYield.allocations.map((allocation) => allocation.productId),
    ["income-profile-saving", "newlywed-profile-saving", "youth-profile-saving"],
  );
});

test("applies event coupon boost when user says coupon is available", () => {
  const couponProduct = {
    ...products[1],
    id: "coupon-deposit",
    bank: "쿠폰은행",
    name: "쿠폰 정기예금",
    baseRate: 3,
    maxRate: 3.5,
    firstCustomerOnly: false,
    conditions: [],
    structuredConditions: [
      {
        key: "eventCoupon",
        label: "이벤트/쿠폰",
        rateBoost: 0.5,
        sourceText: "금리쿠폰 사용 시 연 0.5%p",
      },
    ],
  };

  const rate = calculateRealizableRate(couponProduct, {
    ...baseInput,
    conditions: { ...baseInput.conditions, eventCoupon: true },
  });

  assert.equal(rate.appliedRate, 3.5);
  assert.deepEqual(rate.appliedConditions.map((condition) => condition.key), ["eventCoupon"]);
});

test("adds youth future savings government contribution to installment benefit", () => {
  const youthFutureProduct = {
    id: "youth-future",
    bank: "정책은행",
    name: "청년미래적금",
    type: "installment",
    baseRate: 5,
    maxRate: 5,
    termMonths: 36,
    maxAmount: 0,
    monthlyLimit: 500000,
    officialUrl: "https://example.com/youth-future",
    updatedAt: "2026-07-18",
    easeScore: 70,
    interestTaxExempt: true,
    conditions: [],
    additionalBenefitRules: [
      {
        key: "youthFutureGovernmentContribution",
        label: "정부기여금 일반형",
        contributionType: "general",
        matchRate: 0.06,
        monthlyCap: 30000,
        monthlyContributionBaseLimit: 500000,
      },
      {
        key: "youthFutureGovernmentContribution",
        label: "정부기여금 우대형",
        contributionType: "preferential",
        matchRate: 0.12,
        monthlyCap: 60000,
        monthlyContributionBaseLimit: 500000,
      },
    ],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 500000,
    horizonMonths: 36,
    youthFutureContributionType: "preferential",
  }, [youthFutureProduct]);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.expectedAfterTaxInterest, 1387500);
  assert.equal(allocation.additionalBenefits[0].amount, 2160000);
  assert.equal(allocation.totalExpectedBenefit, 3547500);
  assert.equal(report.plans.realistic.expectedAfterTaxInterest, 1387500);
  assert.equal(report.plans.realistic.additionalBenefitsTotal, 2160000);
  assert.equal(report.plans.realistic.expectedTotalBenefit, 3547500);
  assert.equal(report.summary.bestAfterTaxInterest, 1387500);
  assert.equal(report.summary.bestAdditionalBenefits, 2160000);
  assert.equal(report.summary.bestTotalBenefit, 3547500);
  assert.equal(allocation.interestTaxExempt, true);
});

test("daily installment products use a daily contribution schedule instead of monthly front-loading", () => {
  const dailyProduct = {
    id: "daily-saving",
    bank: "일일은행",
    name: "매일 적금",
    type: "installment",
    baseRate: 12,
    maxRate: 12,
    termMonths: 1,
    maxAmount: 0,
    monthlyLimit: 300000,
    contributionFrequency: "daily",
    officialUrl: "https://example.com/daily-saving",
    updatedAt: "2026-07-18",
    easeScore: 90,
    conditions: [],
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
    horizonMonths: 1,
  }, [dailyProduct]);

  const allocation = report.plans.realistic.allocations[0];
  assert.equal(allocation.contributionFrequency, "daily");
  assert.equal(allocation.contributionCount, 30);
  assert.equal(allocation.expectedAfterTaxInterest, 1293);
});

test("daily contribution preference ranks daily installment products ahead of similar monthly products", () => {
  const monthlyProduct = {
    id: "monthly-saving",
    bank: "월납은행",
    name: "매월 적금",
    type: "installment",
    baseRate: 4,
    maxRate: 4,
    termMonths: 12,
    maxAmount: 0,
    monthlyLimit: 300000,
    contributionFrequency: "monthly",
    officialUrl: "https://example.com/monthly-saving",
    updatedAt: "2026-07-18",
    easeScore: 80,
    conditions: [],
  };
  const dailyProduct = {
    ...monthlyProduct,
    id: "daily-saving-preferred",
    bank: "매일은행",
    name: "매일 적금",
    contributionFrequency: "daily",
    officialUrl: "https://example.com/daily-saving-preferred",
  };

  const report = optimizeSavings({
    ...baseInput,
    lumpSum: 0,
    monthlySavings: 300000,
    horizonMonths: 12,
    contributionStyle: "daily",
  }, [monthlyProduct, dailyProduct]);

  assert.equal(report.plans.realistic.allocations[0].productName, "매일 적금");
});

test("requires youth future savings eligibility selection before recommending policy products", () => {
  const youthFutureProduct = {
    ...products[3],
    id: "youth-future-required",
    bank: "정책은행",
    name: "청년미래적금",
    baseRate: 8,
    maxRate: 8,
    termMonths: 36,
    monthlyLimit: 500000,
    additionalBenefitRules: [
      {
        key: "youthFutureGovernmentContribution",
        label: "정부기여금 일반형",
        contributionType: "general",
        matchRate: 0.06,
        monthlyCap: 30000,
        monthlyContributionBaseLimit: 500000,
      },
    ],
  };

  const defaultReport = optimizeSavings({
    ...baseInput,
    monthlySavings: 500000,
    horizonMonths: 36,
  }, [youthFutureProduct, products[3]]);
  assert.equal(defaultReport.plans.realistic.allocations[0].productName, "26주 자유적금");

  const eligibleReport = optimizeSavings({
    ...baseInput,
    monthlySavings: 500000,
    horizonMonths: 36,
    youthFutureContributionType: "general",
  }, [youthFutureProduct, products[3]]);
  assert.equal(eligibleReport.plans.realistic.allocations[0].productName, "청년미래적금");
});

test("paid report includes action items and switching gain", () => {
  const paid = createPaidReport({ ...baseInput, planPurpose: "switching" }, products);
  assert.ok(paid.summary.bestPlan);
  assert.ok(paid.actionItems.length > 0);
  assert.ok(paid.switchingAnalysis.currentAfterTaxInterest > 0);
  assert.equal(typeof paid.switchingAnalysis.estimatedGain, "number");
});
