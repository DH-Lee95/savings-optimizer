export const TAX_RATE = 0.154;
export const BASELINE_RATE = 0.1;
export const PROTECTION_LIMIT = 50000000;

const CONDITION_KEY_MAP = {
  salaryTransfer: "salaryTransfer",
  cardSpend: "cardSpend",
  autoDebit: "autoDebit",
  marketingConsent: "marketingConsent",
  appSignup: "appSignup",
  primaryBankChange: "primaryBankChange",
  payAccountRegistration: "payAccountRegistration",
  appActivity: "appActivity",
  eventCoupon: "eventCoupon",
};

const CONDITION_FRICTION = {
  firstCustomer: 2,
  salaryTransfer: 4,
  cardSpend: 5,
  autoDebit: 2,
  marketingConsent: 1,
  appSignup: 1,
  primaryBankChange: 5,
  payAccountRegistration: 2,
  appActivity: 6,
  eventCoupon: 7,
  manualReview: 8,
};

const DEFAULT_CONDITION_CAPACITY = {
  salaryTransfer: 1,
  primaryBankChange: 1,
  cardSpend: 1,
};

const SPECIAL_ELIGIBILITY_FLAGS = new Set([
  "youth",
  "newlywed",
  "military",
  "incomeEligible",
  "vulnerableGroup",
  "disability",
  "merit",
  "senior",
  "child",
  "pregnancyOrBirth",
  "businessOwner",
  "smallBusinessEmployee",
  "student",
]);

const PLAN_LABELS = {
  realistic: "현실형",
  maxYield: "최대이자형",
  safeSplit: "안전분산형",
};

const FIRST_FINANCIAL_BANKS = new Set([
  "국민은행",
  "kb국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "nh농협은행",
  "기업은행",
  "ibk기업은행",
  "sc제일은행",
  "한국씨티은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "부산은행",
  "대구은행",
  "im뱅크",
  "광주은행",
  "전북은행",
  "경남은행",
  "제주은행",
  "수협은행",
  "산업은행",
]);

const FINANCIAL_SECTOR_RANK = {
  first: 1,
  firstBank: 1,
  second: 2,
  secondBank: 2,
  mutualFinance: 2,
  savingsBank: 3,
};

const FINANCIAL_SECTOR_LIMIT_RANK = {
  firstOnly: 1,
  secondIncluded: 2,
  savingsBankIncluded: 3,
};

function clampNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maxAllocationCount(input) {
  const parsed = Number(input.maxAllocationCount);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : Infinity;
}

function roundWon(value) {
  return Math.max(0, Math.round(value));
}

function roundSignedWon(value) {
  return Math.round(value);
}

function termYearFraction(months, options = {}) {
  if (options.dayCountBasis === "actual365") {
    return Math.max(0, Math.round(months * 365 / 12)) / 365;
  }
  return months / 12;
}

function applyInterestRounding(value, options = {}) {
  const unit = Number(options.interestRoundingUnit ?? 1);
  if (!Number.isFinite(unit) || unit <= 1) return roundWon(value);
  if (options.interestRoundingMode === "floor") {
    return Math.max(0, Math.floor(value / unit) * unit);
  }
  return Math.max(0, Math.round(value / unit) * unit);
}

function taxableInterest(gross, options = {}) {
  return applyInterestRounding(gross * (options.taxExempt ? 1 : (1 - TAX_RATE)), options);
}

function grossInterest(principal, annualRate, months, options = {}) {
  const yearFraction = termYearFraction(months, options);
  if (options.interestCalculationMethod === "compound") {
    const compoundsPerYear = options.compoundingFrequency === "daily" ? 365 : 12;
    return principal * ((1 + (annualRate / 100) / compoundsPerYear) ** (compoundsPerYear * yearFraction) - 1);
  }
  return principal * (annualRate / 100) * yearFraction;
}

function productInterestOptions(product, options = {}) {
  return {
    taxExempt: options.taxExempt ?? Boolean(product?.interestTaxExempt),
    interestCalculationMethod: product?.interestCalculationMethod ?? options.interestCalculationMethod ?? "simple",
    compoundingFrequency: product?.compoundingFrequency ?? options.compoundingFrequency ?? "none",
    interestRoundingMode: product?.interestRoundingMode ?? options.interestRoundingMode ?? "round",
    interestRoundingUnit: product?.interestRoundingUnit ?? options.interestRoundingUnit ?? 1,
    dayCountBasis: product?.dayCountBasis ?? options.dayCountBasis ?? "monthFraction",
  };
}

function afterTaxInterest(principal, annualRate, months, options = {}) {
  return taxableInterest(grossInterest(principal, annualRate, months, options), options);
}

function tieredInterest(principal, fallbackAnnualRate, months, tieredRateRules = [], options = {}) {
  if (!tieredRateRules.length) {
    return {
      afterTaxInterest: afterTaxInterest(principal, fallbackAnnualRate, months, options),
      effectiveRate: fallbackAnnualRate,
    };
  }

  let gross = 0;
  let coveredAmount = 0;
  const sortedRules = [...tieredRateRules].sort((a, b) => (a.minExclusiveAmount ?? 0) - (b.minExclusiveAmount ?? 0));
  const preferentialBoost = options.preferentialBoost ?? 0;
  const maxAnnualRate = options.maxAnnualRate ?? Infinity;

  for (const rule of sortedRules) {
    const lower = rule.minExclusiveAmount ?? 0;
    const upper = rule.maxInclusiveAmount ?? principal;
    const tierAmount = Math.max(0, Math.min(principal, upper) - lower);
    if (tierAmount <= 0) continue;
    const annualRate = Math.min((rule.rate ?? fallbackAnnualRate) + preferentialBoost, maxAnnualRate);
    gross += grossInterest(tierAmount, annualRate, months, { ...options, interestCalculationMethod: "simple" });
    coveredAmount += tierAmount;
  }

  const uncoveredAmount = Math.max(0, principal - coveredAmount);
  if (uncoveredAmount > 0) {
    gross += grossInterest(uncoveredAmount, fallbackAnnualRate, months, { ...options, interestCalculationMethod: "simple" });
  }

  const effectiveRate = principal > 0 && months > 0
    ? (gross / principal) / (months / 12) * 100
    : fallbackAnnualRate;

  return {
    afterTaxInterest: taxableInterest(gross, options),
    effectiveRate: Number(effectiveRate.toFixed(2)),
  };
}

function getContributionFrequency(product) {
  const frequency = product.contributionFrequency ?? product.savingsSchedule?.frequency;
  return ["daily", "weekly", "monthly"].includes(frequency) ? frequency : "monthly";
}

function averageMonthlyContributionCount(frequency) {
  if (frequency === "daily") return 30;
  if (frequency === "weekly") return 52 / 12;
  return 1;
}

function finiteCapacity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProductName(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function uniqueLabels(labels) {
  return [...new Set(labels.map((label) => String(label ?? "").trim()).filter(Boolean))];
}

function normalizeBankName(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function financialSectorRank(product) {
  const explicit = FINANCIAL_SECTOR_RANK[product.financialSector];
  if (explicit) return explicit;

  const bank = normalizeBankName(product.bank);
  if (bank.includes("저축은행")) return 3;
  if ([...FIRST_FINANCIAL_BANKS].some((name) => bank === normalizeBankName(name))) return 1;
  if (/신협|새마을금고|산림조합|지역농협|단위농협|지역수협/.test(bank)) return 2;
  return 2;
}

function financialSectorLabel(product) {
  const rank = financialSectorRank(product);
  if (rank === 1) return "1금융권";
  if (rank === 2) return "2금융권";
  return "저축은행";
}

function matchesFinancialSector(product, input) {
  const limit = input.financialSectorLimit ?? "savingsBankIncluded";
  const maxRank = FINANCIAL_SECTOR_LIMIT_RANK[limit] ?? FINANCIAL_SECTOR_LIMIT_RANK.savingsBankIncluded;
  return financialSectorRank(product) <= maxRank;
}

function matchesActiveProduct(product, activeProduct) {
  if (!activeProduct) return false;
  if (activeProduct.productId && activeProduct.productId === product.id) return true;
  if (activeProduct.id && activeProduct.id === product.id) return true;

  const activeName = normalizeProductName(activeProduct.productName ?? activeProduct.name);
  if (!activeName) return false;

  const productName = normalizeProductName(product.name);
  const sameBank = !activeProduct.bank || activeProduct.bank === product.bank;
  return sameBank && (activeName === productName || activeName.includes(productName) || productName.includes(activeName));
}

function isProductExcluded(product, input) {
  const excludedIds = new Set(input.excludedProductIds ?? []);
  if (excludedIds.has(product.id)) return true;
  return (input.activeProducts ?? []).some((activeProduct) => matchesActiveProduct(product, activeProduct));
}

function isWithdrawalCompatible(product) {
  return product.type === "parking" || product.partialWithdrawalAllowed === true;
}

function explicitLiquidityReserve(input) {
  return Math.min(
    clampNumber(input.lumpSum),
    clampNumber(input.requiredLiquidityAmount),
  );
}

function getInstallmentMonthlyCapacity(product, months) {
  const frequency = getContributionFrequency(product);
  const contributionCount = averageMonthlyContributionCount(frequency);
  const caps = [
    finiteCapacity(product.monthlyLimit),
    finiteCapacity(product.dailyContributionLimit) ? product.dailyContributionLimit * 30 : null,
    finiteCapacity(product.weeklyContributionLimit) ? product.weeklyContributionLimit * (52 / 12) : null,
    finiteCapacity(product.annualContributionLimit) ? product.annualContributionLimit / 12 : null,
    finiteCapacity(product.totalContributionLimit) ? product.totalContributionLimit / Math.max(1, months) : null,
    finiteCapacity(product.perContributionMaxAmount) ? product.perContributionMaxAmount * contributionCount : null,
  ].filter((value) => value != null);

  return caps.length ? roundWon(Math.min(...caps)) : Infinity;
}

function installmentScheduleInterest(monthlyAmount, annualRate, months, options = {}) {
  const frequency = options.frequency ?? "monthly";
  const annualRateRatio = annualRate / 100;
  const totalPrincipal = monthlyAmount * months;

  if (frequency === "daily" || frequency === "weekly") {
    const totalDays = Math.max(1, Math.round(months * 365 / 12));
    const intervalDays = frequency === "daily" ? 1 : 7;
    const contributionCount = Math.max(1, frequency === "daily"
      ? totalDays
      : Math.round(months * 52 / 12));
    const contributionAmount = totalPrincipal / contributionCount;
    let gross = 0;

    for (let index = 0; index < contributionCount; index += 1) {
      const remainingDays = Math.max(1, totalDays - (index * intervalDays));
      gross += contributionAmount * annualRateRatio * (remainingDays / 365);
    }

    return {
      afterTaxInterest: taxableInterest(gross, options),
      contributionFrequency: frequency,
      contributionCount,
      contributionAmount: roundWon(contributionAmount),
    };
  }

  const monthlyRate = annualRate / 100 / 12;
  const gross = monthlyAmount * monthlyRate * ((months * (months + 1)) / 2);
  return {
    afterTaxInterest: taxableInterest(gross, options),
    contributionFrequency: "monthly",
    contributionCount: Math.max(1, Math.round(months)),
    contributionAmount: roundWon(monthlyAmount),
  };
}

function isFirstCustomer(product, input) {
  return !(input.userBanks ?? []).includes(product.bank);
}

function conditionCapacity(key, input) {
  const override = Number(input.conditionCapacities?.[key]);
  if (Number.isFinite(override) && override > 0) return override;
  return DEFAULT_CONDITION_CAPACITY[key] ?? Infinity;
}

function hasConditionCapacity(condition, input, conditionUsage) {
  const capacity = conditionCapacity(condition.key, input);
  if (capacity === Infinity) return true;
  return (conditionUsage?.get(condition.key) ?? 0) < capacity;
}

function consumeRateConditions(input, conditionUsage, rateInfo) {
  if (!conditionUsage) return;

  const consumedKeys = new Set();
  for (const condition of rateInfo.appliedConditions) {
    if (consumedKeys.has(condition.key)) continue;
    const capacity = conditionCapacity(condition.key, input);
    if (capacity === Infinity) continue;
    conditionUsage.set(condition.key, (conditionUsage.get(condition.key) ?? 0) + 1);
    consumedKeys.add(condition.key);
  }
}

function canApplyCondition(condition, product, input, mode, conditionUsage) {
  const conditions = input.conditions ?? {};

  if (condition.key === "firstCustomer") {
    return isFirstCustomer(product, input);
  }

  if (condition.key === "primaryBankChange") {
    return (mode === "maxYield" || conditions.primaryBankChange === true)
      && hasConditionCapacity(condition, input, conditionUsage);
  }

  const inputKey = CONDITION_KEY_MAP[condition.key] ?? condition.key;
  return conditions[inputKey] === true && hasConditionCapacity(condition, input, conditionUsage);
}

function normalizeRateCondition(condition) {
  return {
    ...condition,
    key: condition.key ?? "manualReview",
    label: condition.label ?? "수동 확인",
    rateBoost: clampNumber(condition.rateBoost),
    friction: clampNumber(condition.friction, CONDITION_FRICTION[condition.key] ?? 2),
    sourceText: String(condition.sourceText ?? condition.label ?? "").trim(),
    requiresManualReview: Boolean(condition.requiresManualReview),
  };
}

function getProductRateConditions(product) {
  const merged = [];
  const seen = new Set();

  for (const condition of [
    ...(product.conditions ?? []),
    ...(product.structuredConditions ?? []),
  ]) {
    const normalized = normalizeRateCondition(condition);
    if (!normalized.sourceText && !normalized.label) continue;
    if (normalized.rateBoost <= 0 && !normalized.requiresManualReview) continue;

    const signature = [
      normalized.key,
      normalized.rateBoost,
      normalized.sourceText || normalized.label,
    ].join("|");
    if (seen.has(signature)) continue;

    merged.push(normalized);
    seen.add(signature);
  }

  return merged;
}

function shouldHoldForManualReview(condition) {
  return (condition.requiresManualReview || condition.key === "manualReview") && condition.rateBoost > 0;
}

function preferenceScore(product, rateInfo, input, mode) {
  const preference = input.preference ?? "balanced";
  const contributionStyle = input.contributionStyle ?? "balanced";
  const liquidityBonus = product.type === "parking" ? 5 : 0;
  const safetyBonus = product.maxAmount <= PROTECTION_LIMIT ? 3 : 0;
  const easeBonus = (product.easeScore ?? 70) / 20;
  const frictionPenalty = mode === "realistic" ? rateInfo.friction * 0.7 : rateInfo.friction * 0.2;
  const contributionFrequency = getContributionFrequency(product);

  let preferenceBonus = 0;
  if (preference === "easy") preferenceBonus = easeBonus * 2;
  if (preference === "safe") preferenceBonus = safetyBonus * 2;
  if (preference === "yield") preferenceBonus = rateInfo.appliedRate;
  if (preference === "balanced") preferenceBonus = easeBonus + safetyBonus;

  let contributionStyleBonus = 0;
  if (contributionStyle === "daily" && contributionFrequency === "daily") contributionStyleBonus = 8;
  if (contributionStyle === "monthly" && contributionFrequency === "monthly") contributionStyleBonus = 5;
  if (contributionStyle === "lumpSum" && ["deposit", "parking"].includes(product.type)) contributionStyleBonus = 5;

  const additionalBenefitBonus = estimateAdditionalBenefits(product, input.monthlySavings, input.horizonMonths, input)
    .reduce((sum, benefit) => sum + benefit.amount, 0) / 100000;
  return rateInfo.appliedRate * 10 + additionalBenefitBonus + preferenceBonus + contributionStyleBonus + liquidityBonus - frictionPenalty;
}

export function calculateRealizableRate(product, input, mode = "realistic", conditionUsage = null) {
  const appliedConditions = [];
  const missedConditions = [];
  const pendingConditions = [];
  let appliedRate = product.baseRate;
  let friction = 0;

  for (const condition of getProductRateConditions(product)) {
    if (shouldHoldForManualReview(condition)) {
      pendingConditions.push(condition);
      continue;
    }

    if (canApplyCondition(condition, product, input, mode, conditionUsage)) {
      appliedRate += condition.rateBoost;
      friction += condition.friction ?? 1;
      appliedConditions.push(condition);
    } else {
      missedConditions.push(condition);
    }
  }

  appliedRate = Math.min(appliedRate, product.maxRate ?? appliedRate);

  return {
    productId: product.id,
    appliedRate: Number(appliedRate.toFixed(2)),
    appliedConditions,
    missedConditions,
    pendingConditions,
    friction,
  };
}

function getLiquidityReserve(input) {
  const lumpSum = clampNumber(input.lumpSum);
  const monthlySavings = clampNumber(input.monthlySavings);

  if (input.horizonMonths <= 3) return lumpSum;
  if (input.liquidityNeed === "high") return Math.min(lumpSum, Math.max(lumpSum * 0.4, monthlySavings * 3));
  if (input.liquidityNeed === "medium") return Math.min(lumpSum, Math.max(lumpSum * 0.2, monthlySavings * 2));
  return Math.min(lumpSum, Math.max(lumpSum * 0.08, monthlySavings));
}

function eligibleProducts(products, input, type, mode, conditionUsage = null) {
  const lumpSum = clampNumber(input.lumpSum);
  const monthlySavings = clampNumber(input.monthlySavings);

  return products
    .filter((product) => product.type === type)
    .filter((product) => !isProductExcluded(product, input))
    .filter((product) => matchesFinancialSector(product, input))
    .filter((product) => type === "parking" || product.termMonths <= input.horizonMonths)
    .filter((product) => type === "installment" || !product.minAmount || lumpSum >= product.minAmount)
    .filter((product) => type !== "installment" || !product.minMonthlyAmount || monthlySavings >= product.minMonthlyAmount)
    .filter((product) => !product.firstCustomerOnly || isFirstCustomer(product, input))
    .filter((product) => matchesEligibility(product, input))
    .map((product) => {
      const rateInfo = calculateRealizableRate(product, input, mode, conditionUsage);
      return {
        product,
        rateInfo,
        score: preferenceScore(product, rateInfo, input, mode),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function matchesEligibility(product, input) {
  const eligibility = product.eligibility;
  if ((product.additionalBenefitRules ?? []).some((rule) => rule.key === "youthFutureGovernmentContribution")
    && !["general", "preferential"].includes(input.youthFutureContributionType)) {
    return false;
  }

  if (!eligibility) return true;

  if (eligibility.minAge || eligibility.maxAge) {
    if (input.specialEligibility?.youth !== true) {
      if (!input.age) return false;
      if (eligibility.minAge && input.age < eligibility.minAge) return false;
      if (eligibility.maxAge && input.age > eligibility.maxAge) return false;
    }
  }

  if (eligibility.maxAnnualIncome) {
    if (input.specialEligibility?.incomeEligible !== true) {
      if (!input.annualIncome) return false;
      if (input.annualIncome > eligibility.maxAnnualIncome) return false;
    }
  }

  const specialEligibility = input.specialEligibility ?? {};
  for (const flag of eligibility.flags ?? []) {
    if (SPECIAL_ELIGIBILITY_FLAGS.has(flag) && specialEligibility[flag] !== true) return false;
  }

  return true;
}

function canApplyAdditionalBenefitRule(rule, input) {
  if (rule.key === "youthFutureGovernmentContribution") {
    return input.youthFutureContributionType === rule.contributionType;
  }

  return true;
}

function estimateAdditionalBenefits(product, monthlyAmount, months, input) {
  const benefits = [];

  for (const rule of product.additionalBenefitRules ?? []) {
    if (!canApplyAdditionalBenefitRule(rule, input)) continue;

    const monthlyBaseLimit = rule.monthlyContributionBaseLimit || monthlyAmount;
    const monthlyMatchedBase = Math.min(monthlyAmount, monthlyBaseLimit);
    const monthlyBenefit = Math.min(monthlyMatchedBase * (rule.matchRate ?? 0), rule.monthlyCap || Infinity);
    const amount = roundWon(monthlyBenefit * months);
    if (amount <= 0) continue;

    benefits.push({
      key: rule.key,
      label: rule.label,
      amount,
      sourceText: rule.sourceText,
    });
  }

  return benefits;
}

function pushAllocation(allocations, product, amount, monthlyAmount, rateInfo, months, input, metadata = {}) {
  if (amount <= 0 && monthlyAmount <= 0) return null;

  const interestTaxExempt = Boolean(product.interestTaxExempt);
  const preferentialBoost = Math.max(0, rateInfo.appliedRate - product.baseRate);
  const tieredRateInfo = product.type === "parking"
    ? tieredInterest(amount, rateInfo.appliedRate, months, product.tieredRateRules, {
      ...productInterestOptions(product, { taxExempt: interestTaxExempt }),
      preferentialBoost,
      maxAnnualRate: product.maxRate ?? rateInfo.appliedRate,
    })
    : null;
  const installmentRateInfo = product.type === "installment"
    ? installmentScheduleInterest(monthlyAmount, rateInfo.appliedRate, months, {
      ...productInterestOptions(product, { taxExempt: interestTaxExempt }),
      frequency: getContributionFrequency(product),
    })
    : null;
  const expectedAfterTaxInterest = product.type === "installment"
    ? installmentRateInfo.afterTaxInterest
    : (tieredRateInfo?.afterTaxInterest ?? afterTaxInterest(
      amount,
      rateInfo.appliedRate,
      months,
      productInterestOptions(product, { taxExempt: interestTaxExempt }),
    ));
  const additionalBenefits = estimateAdditionalBenefits(product, monthlyAmount, months, input);
  const totalExpectedBenefit = expectedAfterTaxInterest + additionalBenefits.reduce((sum, benefit) => sum + benefit.amount, 0);
  const principalAtMaturity = product.type === "installment" ? monthlyAmount * months : amount;
  const projectedMaturityAmount = roundWon(principalAtMaturity + totalExpectedBenefit);

  const allocation = {
    productId: product.id,
    bank: product.bank,
    financialSector: financialSectorLabel(product),
    productName: product.name,
    type: product.type,
    amount: roundWon(amount),
    monthlyAmount: roundWon(monthlyAmount),
    minAmount: product.minAmount ?? 0,
    maxAmountLimit: product.maxAmount ?? 0,
    minMonthlyAmount: product.minMonthlyAmount ?? 0,
    monthlyLimit: product.monthlyLimit ?? 0,
    perContributionMinAmount: product.perContributionMinAmount ?? 0,
    perContributionMaxAmount: product.perContributionMaxAmount ?? 0,
    dailyContributionLimit: product.dailyContributionLimit ?? 0,
    weeklyContributionLimit: product.weeklyContributionLimit ?? 0,
    annualContributionLimit: product.annualContributionLimit ?? 0,
    totalContributionLimit: product.totalContributionLimit ?? 0,
    baseRate: product.baseRate,
    maxRate: product.maxRate,
    interestCalculationMethod: product.interestCalculationMethod ?? "simple",
    compoundingFrequency: product.compoundingFrequency ?? "none",
    interestPayoutType: product.interestPayoutType ?? "maturity",
    interestRoundingMode: product.interestRoundingMode ?? "round",
    interestRoundingUnit: product.interestRoundingUnit ?? 1,
    dayCountBasis: product.dayCountBasis ?? "monthFraction",
    partialWithdrawalAllowed: Boolean(product.partialWithdrawalAllowed || product.type === "parking"),
    earlyTerminationPenaltyApplies: Boolean(product.earlyTerminationPenaltyApplies),
    withdrawalPolicyText: product.withdrawalPolicyText ?? "",
    liquidityRole: metadata.liquidityRole ?? "growth",
    withdrawalCompatible: metadata.withdrawalCompatible ?? isWithdrawalCompatible(product),
    appliedRate: tieredRateInfo?.effectiveRate ?? rateInfo.appliedRate,
    interestTaxExempt,
    contributionFrequency: installmentRateInfo?.contributionFrequency,
    contributionCount: installmentRateInfo?.contributionCount,
    contributionAmount: installmentRateInfo?.contributionAmount,
    appliedConditions: uniqueLabels(rateInfo.appliedConditions.map((condition) => condition.label)),
    missedConditions: uniqueLabels(rateInfo.missedConditions.map((condition) => condition.label)),
    pendingConditions: uniqueLabels(rateInfo.pendingConditions.map((condition) => condition.label)),
    appliedConditionKeys: uniqueLabels(rateInfo.appliedConditions.map((condition) => condition.key)),
    tieredRateRules: product.type === "parking" ? product.tieredRateRules ?? [] : [],
    principalAtMaturity: roundWon(principalAtMaturity),
    projectedMaturityAmount,
    expectedAfterTaxInterest,
    additionalBenefits,
    totalExpectedBenefit,
    officialUrl: product.officialUrl,
    updatedAt: product.updatedAt,
  };

  allocations.push(allocation);
  consumeRateConditions(input, metadata.conditionUsage, rateInfo);
  return allocation;
}

function estimateAllocationBenefit(product, amount, monthlyAmount, rateInfo, months, input) {
  const allocations = [];
  pushAllocation(allocations, product, amount, monthlyAmount, rateInfo, months, input);
  return allocations[0]?.totalExpectedBenefit ?? 0;
}

function lumpSumBenefitPerWon(rate, months, product) {
  return afterTaxInterest(1000000, rate, months, productInterestOptions(product)) / 1000000;
}

function buildParkingYieldSlots(candidate, input) {
  const { product, rateInfo } = candidate;
  const months = clampNumber(input.horizonMonths, 12);
  const preferentialBoost = Math.max(0, rateInfo.appliedRate - product.baseRate);
  const maxAnnualRate = product.maxRate ?? rateInfo.appliedRate;
  const tieredRules = product.tieredRateRules ?? [];

  if (!tieredRules.length) {
    return [{
      product,
      rateInfo,
      months,
      slotKey: `${product.id}:all`,
      capacity: product.maxAmount || Infinity,
      minAmount: product.minAmount ?? 0,
      benefitPerWon: lumpSumBenefitPerWon(rateInfo.appliedRate, months, product),
      withdrawalCompatible: isWithdrawalCompatible(product),
    }];
  }

  const sortedRules = [...tieredRules].sort((a, b) => (a.minExclusiveAmount ?? 0) - (b.minExclusiveAmount ?? 0));
  const slots = [];
  for (const rule of sortedRules) {
    const lower = rule.minExclusiveAmount ?? 0;
    const upper = rule.maxInclusiveAmount ?? Infinity;
    const capacity = upper === Infinity ? Infinity : Math.max(0, upper - lower);
    if (capacity <= 0) continue;
    const tierRate = Math.min((rule.rate ?? rateInfo.appliedRate) + preferentialBoost, maxAnnualRate);
    const slotProduct = {
      ...product,
      baseRate: tierRate,
      maxRate: tierRate,
      tieredRateRules: [],
    };
    const slotRateInfo = {
      ...rateInfo,
      appliedRate: tierRate,
    };
    slots.push({
      product: slotProduct,
      rateInfo: slotRateInfo,
      months,
      slotKey: `${product.id}:tier:${lower}:${upper}`,
      capacity,
      minAmount: lower === 0 ? product.minAmount ?? 0 : 0,
      benefitPerWon: lumpSumBenefitPerWon(tierRate, months, slotProduct),
      withdrawalCompatible: isWithdrawalCompatible(product),
    });
  }

  return slots;
}

function buildLumpSumYieldSlots(input, products, mode, conditionUsage = null) {
  const depositSlots = eligibleProducts(products, input, "deposit", mode, conditionUsage).map((candidate) => {
    const { product, rateInfo } = candidate;
    return {
      product,
      rateInfo,
      months: product.termMonths,
      slotKey: `${product.id}:deposit`,
      capacity: product.maxAmount || Infinity,
      minAmount: product.minAmount ?? 0,
      benefitPerWon: lumpSumBenefitPerWon(rateInfo.appliedRate, product.termMonths, product),
      withdrawalCompatible: isWithdrawalCompatible(product),
    };
  });
  const parkingSlots = eligibleProducts(products, input, "parking", mode, conditionUsage)
    .flatMap((candidate) => buildParkingYieldSlots(candidate, input));

  return [...depositSlots, ...parkingSlots]
    .filter((slot) => slot.benefitPerWon > 0)
    .sort((a, b) => b.benefitPerWon - a.benefitPerWon);
}

function buildWithdrawalYieldSlots(input, slots) {
  const months = clampNumber(input.horizonMonths, 12);
  return slots
    .filter((slot) => slot.withdrawalCompatible)
    .map((slot) => {
      const rate = slot.product.earlyWithdrawalRate ?? slot.rateInfo.appliedRate;
      return {
        ...slot,
        months,
        rateInfo: { ...slot.rateInfo, appliedRate: rate },
        benefitPerWon: lumpSumBenefitPerWon(rate, months, slot.product),
      };
    })
    .sort((a, b) => b.benefitPerWon - a.benefitPerWon);
}

function allocateFromYieldSlots(input, slots, targetAmount, allocations, usedCapacities, metadata = {}) {
  let remaining = clampNumber(targetAmount);

  for (const slot of slots) {
    if (remaining <= 0) break;
    const used = usedCapacities.get(slot.slotKey) ?? 0;
    const availableCapacity = slot.capacity === Infinity ? remaining : Math.max(0, slot.capacity - used);
    const amount = Math.min(remaining, availableCapacity);
    if (slot.minAmount && amount < slot.minAmount) continue;
    if (amount <= 0) continue;

    pushAllocation(allocations, slot.product, amount, 0, slot.rateInfo, slot.months, input, {
      ...metadata,
      withdrawalCompatible: slot.withdrawalCompatible,
    });
    usedCapacities.set(slot.slotKey, used + amount);
    remaining -= amount;
  }

  return remaining;
}

function allocateLumpSumByYield(input, products, mode, context = {}) {
  const allocations = [];
  const slots = buildLumpSumYieldSlots(input, products, mode, context.conditionUsage);
  const usedCapacities = new Map();
  const reserveAmount = explicitLiquidityReserve(input);

  let reserveRemaining = 0;
  if (reserveAmount > 0) {
    reserveRemaining = allocateFromYieldSlots(
      input,
      buildWithdrawalYieldSlots(input, slots),
      reserveAmount,
      allocations,
      usedCapacities,
      {
        liquidityRole: "withdrawalReserve",
        conditionUsage: context.conditionUsage,
      },
    );
  }

  const growthAmount = Math.max(0, clampNumber(input.lumpSum) - reserveAmount + reserveRemaining);
  allocateFromYieldSlots(input, slots, growthAmount, allocations, usedCapacities, {
    conditionUsage: context.conditionUsage,
  });

  return allocations;
}

function allocateLumpSum(input, products, mode, context = {}) {
  if (mode === "maxYield") return allocateLumpSumByYield(input, products, mode, context);

  const lumpSum = clampNumber(input.lumpSum);
  const months = clampNumber(input.horizonMonths, 12);
  const allocations = [];

  let parkingAmount = Math.max(getLiquidityReserve(input), explicitLiquidityReserve(input));
  let depositAmount = Math.max(0, lumpSum - parkingAmount);

  const parkingCandidates = eligibleProducts(products, input, "parking", mode, context.conditionUsage);
  const depositCandidates = eligibleProducts(products, input, "deposit", mode, context.conditionUsage);

  if (parkingCandidates.length > 0 && parkingAmount > 0) {
    const { product, rateInfo } = parkingCandidates[0];
    const capped = Math.min(parkingAmount, product.maxAmount || parkingAmount);
    pushAllocation(allocations, product, capped, 0, rateInfo, months, input, {
      conditionUsage: context.conditionUsage,
    });
    depositAmount += Math.max(0, parkingAmount - capped);
  }

  const bankTotals = new Map();

  for (const candidate of depositCandidates) {
    if (depositAmount <= 0) break;
    const { product, rateInfo } = candidate;
    const existing = bankTotals.get(product.bank) ?? 0;
    const protectionRoom = mode === "safeSplit" ? Math.max(0, PROTECTION_LIMIT - existing) : Infinity;
    const productRoom = product.maxAmount || depositAmount;
    const amount = Math.min(depositAmount, productRoom, protectionRoom);
    if (product.minAmount && amount < product.minAmount) continue;
    if (amount <= 0) continue;

    bankTotals.set(product.bank, existing + amount);
    depositAmount -= amount;
    pushAllocation(allocations, product, amount, 0, rateInfo, product.termMonths, input, {
      conditionUsage: context.conditionUsage,
    });
  }

  if (depositAmount > 0 && parkingCandidates.length > 0) {
    const { product, rateInfo } = parkingCandidates[0];
    pushAllocation(allocations, product, depositAmount, 0, rateInfo, months, input, {
      conditionUsage: context.conditionUsage,
    });
  }

  return allocations;
}

function allocateMonthlySavings(input, products, mode, context = {}) {
  if (mode === "maxYield") return allocateMonthlySavingsByYield(input, products, mode, context);

  let remaining = clampNumber(input.monthlySavings);
  const months = clampNumber(input.horizonMonths, 12);
  const allocations = [];
  const selectedProductIds = new Set();
  const maxCount = maxAllocationCount(input);

  while (remaining > 0 && allocations.length < maxCount) {
    const candidate = eligibleProducts(products, input, "installment", mode, context.conditionUsage)
      .filter((item) => !selectedProductIds.has(item.product.id))[0];
    if (!candidate) break;
    if (remaining <= 0) break;
    const { product, rateInfo } = candidate;
    const monthlyCapacity = getInstallmentMonthlyCapacity(product, months);
    const monthlyAmount = Math.min(remaining, monthlyCapacity === Infinity ? remaining : monthlyCapacity);
    selectedProductIds.add(product.id);
    if (product.minMonthlyAmount && monthlyAmount < product.minMonthlyAmount) continue;
    remaining -= monthlyAmount;
    pushAllocation(allocations, product, 0, monthlyAmount, rateInfo, Math.min(product.termMonths, months), input, {
      conditionUsage: context.conditionUsage,
    });
  }

  if (remaining > 0) {
    const parking = eligibleProducts(products, input, "parking", mode, context.conditionUsage)[0];
    if (parking && allocations.length < maxCount) {
      pushAllocation(allocations, parking.product, remaining * months, 0, parking.rateInfo, months, input, {
        conditionUsage: context.conditionUsage,
        liquidityRole: "monthlyOverflow",
      });
    }
  }

  return allocations;
}

function monthlyYieldRatio(candidate, input, months) {
  const { product, rateInfo } = candidate;
  const capacity = getInstallmentMonthlyCapacity(product, months);
  if (capacity <= 0) return 0;
  const testAmount = Math.min(capacity === Infinity ? clampNumber(input.monthlySavings) : capacity, clampNumber(input.monthlySavings), 100000);
  if (product.minMonthlyAmount && testAmount < product.minMonthlyAmount) return 0;
  const benefit = estimateAllocationBenefit(product, 0, testAmount, rateInfo, Math.min(product.termMonths, months), input);
  return testAmount > 0 ? benefit / testAmount : 0;
}

function allocateMonthlySavingsByYield(input, products, mode, context = {}) {
  let remaining = clampNumber(input.monthlySavings);
  const months = clampNumber(input.horizonMonths, 12);
  const allocations = [];
  const selectedProductIds = new Set();
  const maxCount = maxAllocationCount(input);

  while (remaining > 0 && allocations.length < maxCount) {
    const candidate = eligibleProducts(products, input, "installment", mode, context.conditionUsage)
      .filter((item) => !selectedProductIds.has(item.product.id))
      .map((item) => ({
        ...item,
        monthlyCapacity: getInstallmentMonthlyCapacity(item.product, months),
        yieldRatio: monthlyYieldRatio(item, input, months),
      }))
      .filter((item) => item.yieldRatio > 0)
      .sort((a, b) => b.yieldRatio - a.yieldRatio)[0];
    if (!candidate) break;
    if (remaining <= 0) break;
    const { product, rateInfo, monthlyCapacity } = candidate;
    const monthlyAmount = Math.min(remaining, monthlyCapacity === Infinity ? remaining : monthlyCapacity);
    selectedProductIds.add(product.id);
    if (product.minMonthlyAmount && monthlyAmount < product.minMonthlyAmount) continue;
    remaining -= monthlyAmount;
    pushAllocation(allocations, product, 0, monthlyAmount, rateInfo, Math.min(product.termMonths, months), input, {
      conditionUsage: context.conditionUsage,
    });
  }

  if (remaining > 0) {
    const parking = buildLumpSumYieldSlots({ ...input, lumpSum: remaining * months }, products, mode, context.conditionUsage)[0];
    if (parking && allocations.length < maxCount) {
      pushAllocation(allocations, parking.product, remaining * months, 0, parking.rateInfo, months, input, {
        conditionUsage: context.conditionUsage,
        liquidityRole: "monthlyOverflow",
      });
    }
  }

  return allocations;
}

function buildPlan(input, products, mode) {
  const context = {
    conditionUsage: new Map(),
  };
  const allocations = [
    ...allocateLumpSum(input, products, mode, context),
    ...allocateMonthlySavings(input, products, mode, context),
  ];

  const expectedAfterTaxInterest = allocations.reduce((sum, item) => sum + item.expectedAfterTaxInterest, 0);
  const additionalBenefitsTotal = allocations.reduce((sum, item) => {
    return sum + (item.additionalBenefits ?? []).reduce((benefitSum, benefit) => benefitSum + benefit.amount, 0);
  }, 0);
  const expectedTotalBenefit = expectedAfterTaxInterest + additionalBenefitsTotal;
  const allocatedMonthlySavings = allocations
    .reduce((sum, allocation) => {
      if (allocation.type === "installment") return sum + allocation.monthlyAmount;
      if (allocation.liquidityRole === "monthlyOverflow") return sum + (allocation.amount / clampNumber(input.horizonMonths, 12));
      return sum;
    }, 0);
  const unallocatedMonthlySavings = Math.max(0, clampNumber(input.monthlySavings) - allocatedMonthlySavings);
  const totalPrincipal = allocations.reduce((sum, allocation) => sum + allocation.principalAtMaturity, 0);
  const baselineAfterTaxInterest = afterTaxInterest(totalPrincipal, BASELINE_RATE, clampNumber(input.horizonMonths, 12));
  const projectedEndingBalance = totalPrincipal + expectedTotalBenefit;
  const targetAmount = clampNumber(input.targetAmount);

  return {
    key: mode,
    label: PLAN_LABELS[mode],
    allocations,
    totalPrincipal,
    allocatedMonthlySavings,
    unallocatedMonthlySavings,
    expectedAfterTaxInterest,
    additionalBenefitsTotal,
    expectedTotalBenefit,
    projectedEndingBalance,
    targetAmount,
    targetMet: targetAmount > 0 ? projectedEndingBalance >= targetAmount : null,
    targetGap: targetAmount > 0 ? Math.max(0, targetAmount - projectedEndingBalance) : 0,
    baselineAfterTaxInterest,
    additionalBenefit: Math.max(0, expectedTotalBenefit - baselineAfterTaxInterest),
    actionCount: allocations.reduce((sum, item) => sum + item.appliedConditions.length, 0) + allocations.length,
  };
}

function getBestPlan(plans) {
  const list = Object.values(plans);
  return [...list].sort((a, b) => b.expectedTotalBenefit - a.expectedTotalBenefit)[0];
}

function buildTargetAnalysis(input, products, bestPlan) {
  const targetAmount = clampNumber(input.targetAmount);
  if (!targetAmount) return null;

  const projectedEndingBalance = roundWon(bestPlan.projectedEndingBalance);
  const gap = Math.max(0, targetAmount - projectedEndingBalance);
  let requiredMonthlySavings = clampNumber(input.monthlySavings);

  if (gap > 0) {
    const mode = bestPlan.key;
    const baseInput = mode === "safeSplit" ? { ...input, preference: "safe" } : input;
    const estimate = (monthlySavings) => buildPlan({ ...baseInput, monthlySavings, targetAmount: 0 }, products, mode).projectedEndingBalance;
    let low = requiredMonthlySavings;
    let high = Math.max(low + 10000, Math.ceil(targetAmount / Math.max(1, clampNumber(input.horizonMonths, 12))));
    let guard = 0;

    while (estimate(high) < targetAmount && guard < 20) {
      high *= 2;
      guard += 1;
    }

    for (let index = 0; index < 24; index += 1) {
      const mid = (low + high) / 2;
      if (estimate(mid) >= targetAmount) high = mid;
      else low = mid;
    }
    requiredMonthlySavings = roundWon(high);
  }

  return {
    targetAmount,
    projectedEndingBalance,
    gap: roundWon(gap),
    targetMet: gap === 0,
    requiredMonthlySavings,
    additionalMonthlySavingsNeeded: Math.max(0, requiredMonthlySavings - clampNumber(input.monthlySavings)),
    bestPlanKey: bestPlan.key,
    bestPlanLabel: bestPlan.label,
  };
}

export function optimizeSavings(input, products) {
  const planPurpose = input.planPurpose === "switching" ? "switching" : "newSavings";
  const activePrincipal = planPurpose === "switching"
    ? (input.activeProducts ?? []).reduce((sum, product) => sum + clampNumber(product.balance), 0)
    : 0;
  const normalized = {
    ...input,
    planPurpose,
    lumpSum: clampNumber(input.lumpSum) + activePrincipal,
    monthlySavings: clampNumber(input.monthlySavings),
    maxAllocationCount: maxAllocationCount(input) === Infinity ? null : maxAllocationCount(input),
    horizonMonths: clampNumber(input.horizonMonths, 12),
    targetAmount: clampNumber(input.targetAmount),
    requiredLiquidityAmount: clampNumber(input.requiredLiquidityAmount),
    financialSectorLimit: input.financialSectorLimit ?? "savingsBankIncluded",
  };

  const plans = {
    realistic: buildPlan(normalized, products, "realistic"),
    maxYield: buildPlan(normalized, products, "maxYield"),
    safeSplit: buildPlan({ ...normalized, preference: "safe" }, products, "safeSplit"),
  };

  const best = getBestPlan(plans);
  const targetAnalysis = buildTargetAnalysis(normalized, products, best);

  return {
    generatedAt: new Date().toISOString(),
    input: normalized,
    preview: {
      lowEstimate: Math.round(plans.realistic.additionalBenefit * 0.75),
      highEstimate: Math.round(plans.maxYield.additionalBenefit * 1.08),
      suggestedMix: summarizeMix(plans.realistic.allocations),
    },
    plans,
    targetAnalysis,
    summary: {
      bestPlan: best.label,
      bestAfterTaxInterest: best.expectedAfterTaxInterest,
      bestAdditionalBenefits: best.additionalBenefitsTotal,
      bestTotalBenefit: best.expectedTotalBenefit,
      bestAdditionalBenefit: best.additionalBenefit,
    },
  };
}

function summarizeMix(allocations) {
  const byType = new Map();
  for (const allocation of allocations) {
    const amount = allocation.type === "installment" ? allocation.monthlyAmount : allocation.amount;
    byType.set(allocation.type, (byType.get(allocation.type) ?? 0) + amount);
  }
  return [...byType.entries()].map(([type, amount]) => ({ type, amount: roundWon(amount) }));
}

function buildActionItems(report) {
  const plan = report.plans.realistic;
  const items = [];

  for (const allocation of plan.allocations) {
    const amountText =
      allocation.type === "installment"
        ? `월 ${formatWon(allocation.monthlyAmount)}`
        : formatWon(allocation.amount);
    items.push({
      title: `${allocation.bank} ${allocation.productName}`,
      detail: `${amountText} 배분, 예상 적용금리 ${allocation.appliedRate.toFixed(2)}%`,
      url: allocation.officialUrl,
    });
  }

  const maxYieldGain = report.plans.maxYield.additionalBenefit - report.plans.realistic.additionalBenefit;
  if (maxYieldGain > 0) {
    items.push({
      title: "우대조건 추가 검토",
      detail: `최대이자형은 현실형보다 총 예상 혜택을 ${formatWon(maxYieldGain)} 정도 더 받을 수 있습니다.`,
      url: "",
    });
  }

  const pendingLabels = new Set(
    plan.allocations.flatMap((allocation) => allocation.pendingConditions ?? []),
  );
  if (pendingLabels.size > 0) {
    items.push({
      title: "수동 확인 조건",
      detail: `${[...pendingLabels].join(", ")} 조건은 쿠폰, 이벤트, 앱 미션처럼 자동 확정하기 어려워 가입 직전에 확인해야 합니다.`,
      url: "",
    });
  }

  items.push({
    title: "만기 알림 등록",
    detail: `${report.input.horizonMonths}개월 뒤 재배분 점검이 필요합니다.`,
    url: "",
  });

  return items;
}

function normalizeActiveProduct(product, index) {
  return {
    productId: product.productId ?? product.id ?? `active-${index + 1}`,
    bank: String(product.bank ?? "").trim(),
    productName: String(product.productName ?? product.name ?? `현재 상품 ${index + 1}`).trim(),
    type: product.type ?? "deposit",
    balance: clampNumber(product.balance),
    rate: clampNumber(product.rate, BASELINE_RATE),
    remainingMonths: clampNumber(product.remainingMonths),
  };
}

function activeProductInterest(product, months) {
  const activeMonths = Math.min(clampNumber(months), clampNumber(product.remainingMonths, months));
  if (activeMonths <= 0 || product.balance <= 0) return 0;
  return afterTaxInterest(product.balance, product.rate, activeMonths);
}

function analyzeSwitching(input, report, products) {
  const recommendationMode = input.planPurpose === "switching" ? "switching" : "newSavings";
  const activeProducts = (input.activeProducts ?? [])
    .map((product, index) => normalizeActiveProduct(product, index))
    .filter((product) => product.balance > 0);
  const horizonMonths = clampNumber(report.input.horizonMonths, 12);
  const currentPrincipal = activeProducts.reduce((sum, product) => sum + product.balance, 0);
  const currentAfterTaxInterest = activeProducts.reduce((sum, product) => {
    return sum + activeProductInterest(product, horizonMonths);
  }, 0);
  const activeProductIds = activeProducts.map((product) => product.productId).filter(Boolean);
  const alternativePrincipal = recommendationMode === "switching"
    ? currentPrincipal
    : clampNumber(input.lumpSum);
  const alternativePlan = alternativePrincipal > 0
    ? buildPlan({
      ...input,
      lumpSum: alternativePrincipal,
      monthlySavings: recommendationMode === "switching" ? 0 : clampNumber(input.monthlySavings),
      horizonMonths,
      activeProducts,
      excludedProductIds: [...new Set([...(input.excludedProductIds ?? []), ...activeProductIds])],
      targetAmount: 0,
      planPurpose: "newSavings",
    }, products, "maxYield")
    : null;
  const alternativeAfterTaxInterest = alternativePlan?.expectedAfterTaxInterest ?? 0;
  const alternativeTotalBenefit = alternativePlan?.expectedTotalBenefit ?? 0;
  const estimatedGain = roundSignedWon(alternativeTotalBenefit - currentAfterTaxInterest);
  const recommendedAction = recommendationMode === "newSavings"
    ? "newSavings"
    : (estimatedGain > 0 ? "switch" : "stay");

  return {
    recommendationMode,
    currentPrincipal,
    currentAfterTaxInterest: roundWon(currentAfterTaxInterest),
    alternativePrincipal,
    alternativeAfterTaxInterest: roundWon(alternativeAfterTaxInterest),
    alternativeTotalBenefit: roundWon(alternativeTotalBenefit),
    bestAlternativeAfterTaxInterest: roundWon(alternativeAfterTaxInterest),
    bestAlternativeTotalBenefit: roundWon(alternativeTotalBenefit),
    estimatedGain,
    recommendedAction,
    activeProductCount: input.activeProductCount ?? activeProducts.length,
    activeProducts,
  };
}

export function createPaidReport(input, products) {
  const report = optimizeSavings(input, products);
  return {
    ...report,
    paid: true,
    reportId: `R-${Date.now().toString(36).toUpperCase()}`,
    actionItems: buildActionItems(report),
    switchingAnalysis: analyzeSwitching(input, report, products),
    disclosure: {
      taxRate: TAX_RATE,
      dataNotice: "금리와 조건은 샘플 데이터 기준입니다. 실제 가입 전 금융사 공식 페이지에서 조건을 확인하세요.",
      advisoryNotice: "이 결과는 투자 자문이 아니라 입력 조건과 저장성 상품 데이터 기반 예상 계산입니다.",
    },
  };
}

export function formatWon(value) {
  return `${roundWon(value).toLocaleString("ko-KR")}원`;
}
