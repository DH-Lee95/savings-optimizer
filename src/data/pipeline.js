const CONDITION_PATTERNS = [
  { key: "firstCustomer", label: "첫거래", pattern: /첫\s*거래|신규|최초/, friction: 2 },
  { key: "salaryTransfer", label: "급여이체", pattern: /급여\s*이체|월급/, friction: 4 },
  { key: "cardSpend", label: "카드실적", pattern: /카드|실적/, friction: 5 },
  { key: "autoDebit", label: "자동이체", pattern: /자동\s*이체|이체\s*등록/, friction: 2 },
  { key: "marketingConsent", label: "마케팅 동의", pattern: /마케팅|광고|동의/, friction: 1 },
  { key: "appSignup", label: "앱 가입", pattern: /앱|모바일|비대면/, friction: 1 },
  { key: "primaryBankChange", label: "주거래 변경", pattern: /주거래|입출금통장/, friction: 5 },
];

const TYPE_MAP = {
  deposit: "deposit",
  installment: "installment",
  saving: "installment",
  parking: "parking",
  예금: "deposit",
  적금: "installment",
  파킹: "parking",
  파킹통장: "parking",
};

export function parsePercent(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export function parseMonths(value) {
  const text = String(value ?? "");
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*개월/);
  if (monthMatch) return Number(monthMatch[1]);
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*년/);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

export function parseWon(value) {
  const text = String(value ?? "").replaceAll(",", "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return 0;

  const amountMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)/g)];
  if (!amountMatches.length) {
    return /^\d+(?:\.\d+)?$/.test(text) ? Math.round(Number(text)) : 0;
  }

  const amounts = amountMatches.map((match) => {
    const number = Number(match[1]);
    const unit = match[2];
    let amount = number;
    if (unit === "억원" || unit === "억") amount *= 100000000;
    if (unit === "천만원") amount *= 10000000;
    if (unit === "백만원") amount *= 1000000;
    if (unit === "만원") amount *= 10000;
    if (unit === "천원") amount *= 1000;

    const before = text.slice(Math.max(0, match.index - 14), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 14);
    const isUpperBound = /한도|최대|최고|적립한도|불입금/.test(before) || /이하|이내|까지|한도/.test(after);
    return { amount: Math.round(amount), isUpperBound };
  });

  if (/제한\s*없음/.test(text) && !amounts.some((item) => item.isUpperBound)) return 0;

  const upperBounds = amounts.filter((item) => item.isUpperBound);
  if (upperBounds.length) return Math.max(...upperBounds.map((item) => item.amount));
  if (text.includes("~")) return Math.max(...amounts.map((item) => item.amount));

  return amounts[0].amount;
}

export function parseAmountLimits(value) {
  const text = String(value ?? "").replaceAll(",", "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const limits = { min: 0, max: 0 };
  if (!text || /제한\s*없음/.test(text)) {
    const minimumOnly = text.match(/(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*이상/);
    if (minimumOnly) limits.min = parseWon(minimumOnly[0]);
    return limits;
  }

  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*(?:이상|부터)?\s*(?:~|[-–]|이상)\s*(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*(?:이하|이내|까지|미만)?/,
  );
  if (range) {
    limits.min = parseWon(`${range[1]}${range[2]}`);
    limits.max = parseWon(`${range[3]}${range[4]}`);
    return limits;
  }

  const minimums = [
    ...text.matchAll(/(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*(?:이상|부터)/g),
  ].map((match) => parseWon(match[0]));
  if (minimums.length) limits.min = Math.min(...minimums);

  const maximums = [
    ...text.matchAll(/(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*(?:이하|이내|까지|한도|최대|최고)/g),
  ].map((match) => parseWon(match[0]));
  if (maximums.length) limits.max = Math.max(...maximums);

  const explicitLimit = text.match(/(?:가입한도|한도|최대|최고)[^\d]*(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)/);
  if (explicitLimit) limits.max = Math.max(limits.max, parseWon(`${explicitLimit[1]}${explicitLimit[2]}`));

  if (!limits.max && !limits.min) limits.max = parseWon(text);

  return limits;
}

function parseLimitSegmentMax(segment) {
  const limits = parseAmountLimits(segment);
  return limits.max || parseWon(segment);
}

function parseDetailedAmountLimits(value) {
  const text = String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const limits = {
    perContributionMinAmount: 0,
    perContributionMaxAmount: 0,
    dailyContributionLimit: 0,
    weeklyContributionLimit: 0,
    monthlyContributionLimit: 0,
    annualContributionLimit: 0,
    totalContributionLimit: 0,
  };
  if (!text) return limits;

  const segments = text
    .split(/[,/\n]|(?:\s{2,})/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (/1회|매회|회당|건당|1번/.test(segment)) {
      const parsed = parseAmountLimits(segment);
      limits.perContributionMinAmount = limits.perContributionMinAmount || parsed.min;
      limits.perContributionMaxAmount = Math.max(limits.perContributionMaxAmount, parsed.max || parseWon(segment));
    }
    if (/매일|일일|1일|하루/.test(segment)) {
      const dailyLimit = parseLimitSegmentMax(segment);
      limits.dailyContributionLimit = Math.max(limits.dailyContributionLimit, dailyLimit);
      limits.perContributionMaxAmount = limits.perContributionMaxAmount || dailyLimit;
    }
    if (/매주|1주|주간|주\s*마다/.test(segment)) {
      limits.weeklyContributionLimit = Math.max(limits.weeklyContributionLimit, parseLimitSegmentMax(segment));
    }
    if (/(?:^|\s)(?:월|매월|월간)/.test(segment)) {
      limits.monthlyContributionLimit = Math.max(limits.monthlyContributionLimit, parseLimitSegmentMax(segment));
    }
    if (/연간|연\s*납입|연\s*최대|연\s*한도/.test(segment)) {
      limits.annualContributionLimit = Math.max(limits.annualContributionLimit, parseLimitSegmentMax(segment));
    }
    if (/(?:총|가입한도|최고한도)/.test(segment) && !/제한\s*없음/.test(segment)) {
      limits.totalContributionLimit = Math.max(limits.totalContributionLimit, parseLimitSegmentMax(segment));
    }
  }

  return limits;
}

export function parseMonthlyLimitText(value) {
  const text = String(value ?? "");
  if (/50만원/.test(text) && /(?:월|매월|월간)/.test(text) && /연(?:간)?.*600만원/.test(text)) return 500000;

  const monthlySegment = text.match(/(?:월|매월)[^※\n,]*/)?.[0] ?? "";
  const monthlyRange = monthlySegment.match(
    /(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*~\s*(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)/,
  );
  if (monthlyRange) return parseWon(`${monthlyRange[3]}${monthlyRange[4]}`);

  const monthlyUpperBounds = [
    ...monthlySegment.matchAll(/(\d+(?:\.\d+)?)\s*(억원|억|천만원|백만원|만원|천원|원)\s*(?:이하|이내|까지|(?:의\s*)?범위)/g),
  ].map((match) => parseWon(match[0]));
  if (monthlyUpperBounds.length) return Math.max(...monthlyUpperBounds);

  const parsed = parseWon(text);
  if (!parsed) return 0;
  if (/매일|일일|1일\s*1회|1일\s*최대/.test(text)) return parsed * 30;
  return parsed;
}

function parseMonthlyAmountLimits(value) {
  const text = String(value ?? "");
  const monthlySegment = text.match(/(?:월|매월|월간)[^※\n,]*/)?.[0] ?? "";
  const limits = parseAmountLimits(monthlySegment || text);
  const monthlyLimit = monthlySegment ? limits.max : parseMonthlyLimitText(value);

  return {
    min: limits.min,
    max: monthlyLimit || limits.max,
  };
}

function normalizeTieredRateRules(value) {
  if (!Array.isArray(value)) return [];

  return value.map((rule) => ({
    sourceText: String(rule.sourceText ?? "").trim(),
    rate: Number(rule.rate ?? 0),
    minExclusiveAmount: Number(rule.minExclusiveAmount ?? 0),
    maxInclusiveAmount: rule.maxInclusiveAmount == null ? null : Number(rule.maxInclusiveAmount),
  })).filter((rule) => rule.rate > 0);
}

function normalizeStructuredConditions(value) {
  if (!Array.isArray(value)) return [];

  return value.map((condition) => ({
    key: String(condition.key ?? "manualReview"),
    label: String(condition.label ?? "수동 검수"),
    rateBoost: Number(condition.rateBoost ?? 0),
    sourceText: String(condition.sourceText ?? "").trim(),
    appliesToAmountMax: condition.appliesToAmountMax == null ? null : Number(condition.appliesToAmountMax),
    eligibility: condition.eligibility ?? { flags: [], sourceText: "" },
    tieredRateRule: condition.tieredRateRule ?? null,
    requiresManualReview: Boolean(condition.requiresManualReview),
  })).filter((condition) => condition.sourceText);
}

function normalizeAdditionalBenefitRules(value) {
  if (!Array.isArray(value)) return [];

  return value.map((rule) => ({
    key: String(rule.key ?? "additionalBenefit"),
    label: String(rule.label ?? "추가 혜택"),
    contributionType: String(rule.contributionType ?? ""),
    matchRate: Number(rule.matchRate ?? 0),
    monthlyCap: Number(rule.monthlyCap ?? 0),
    monthlyContributionBaseLimit: Number(rule.monthlyContributionBaseLimit ?? 0),
    sourceText: String(rule.sourceText ?? "").trim(),
  })).filter((rule) => rule.key && rule.matchRate > 0);
}

function inferContributionFrequency(raw, type) {
  if (type !== "installment") return null;

  const provided = raw.contributionFrequency ?? raw.savingsSchedule?.frequency;
  if (["daily", "weekly", "monthly"].includes(provided)) return provided;

  const text = [
    raw.productName,
    raw.maxAmountText,
    raw.monthlyLimitText,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].map((value) => String(value ?? "").replace(/\s+/g, " ").trim()).join(" ");

  if (/매일|일일|매\s*일|1일|하루/.test(text)) return "daily";
  if (/26주|매주|주\s*단위|주\s*마다/.test(text)) return "weekly";

  return "monthly";
}

function inferAdditionalBenefitRules(raw) {
  const text = [
    raw.productName,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].map((value) => String(value ?? "").replace(/\s+/g, " ").trim()).join(" ");

  if (!/청년미래적금/.test(text) || !/정부기여금/.test(text)) return [];

  return [
    {
      key: "youthFutureGovernmentContribution",
      label: "정부기여금 일반형",
      contributionType: "general",
      matchRate: 0.06,
      monthlyCap: 30000,
      monthlyContributionBaseLimit: 500000,
      sourceText: "청년미래적금 일반형 정부기여금: 월 납입액의 6%, 월 3만원 한도",
    },
    {
      key: "youthFutureGovernmentContribution",
      label: "정부기여금 우대형",
      contributionType: "preferential",
      matchRate: 0.12,
      monthlyCap: 60000,
      monthlyContributionBaseLimit: 500000,
      sourceText: "청년미래적금 우대형 정부기여금: 월 납입액의 12%, 월 6만원 한도",
    },
  ];
}

function inferInterestTaxExempt(raw) {
  const text = [
    raw.productName,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].map((value) => String(value ?? "").replace(/\s+/g, " ").trim()).join(" ");

  return /비과세/.test(text) || (/청년미래적금/.test(text) && /정부기여금/.test(text));
}

function inferInterestPolicy(raw) {
  const text = [
    raw.productName,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].map((value) => String(value ?? "").replace(/\s+/g, " ").trim()).join(" ");
  const providedMethod = raw.interestCalculationMethod;
  const providedPayout = raw.interestPayoutType;
  const hasCompound = /복리|연평균\s*수익률|연수익률/.test(text);
  const hasMonthlyPayout = /매월\s*이자|월이자|매월\s*약정일|매월이자지급/.test(text);
  const hasMaturityPayout = /만기\s*일시|만기일시|만기\s*\(후\)|만기\s*후/.test(text);
  const floorRounding = /절사/.test(text);
  const tenWonRounding = /10원|십원/.test(text);
  const dayCountBasis = raw.dayCountBasis ?? (/일\s*단위|일,\s*월단위|일\/월|일\s*또는\s*월/.test(text) ? "actual365" : "monthFraction");

  return {
    interestCalculationMethod: ["simple", "compound"].includes(providedMethod)
      ? providedMethod
      : (hasCompound ? "compound" : "simple"),
    compoundingFrequency: raw.compoundingFrequency ?? (hasCompound ? "monthly" : "none"),
    interestPayoutType: ["maturity", "monthly", "daily"].includes(providedPayout)
      ? providedPayout
      : (hasMonthlyPayout && !hasMaturityPayout ? "monthly" : "maturity"),
    interestRoundingMode: raw.interestRoundingMode ?? (floorRounding ? "floor" : "round"),
    interestRoundingUnit: Number(raw.interestRoundingUnit ?? (tenWonRounding ? 10 : 1)),
    dayCountBasis,
  };
}

function inferWithdrawalPolicy(raw, type) {
  const text = [
    raw.productName,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].map((value) => String(value ?? "").replace(/\s+/g, " ").trim()).join(" ");
  const partialWithdrawalAllowed = raw.partialWithdrawalAllowed ?? (
    type === "parking"
    || /부분\s*인출|부분인출|중도\s*인출|중도인출|긴급\s*출금|일부\s*해지|입출금\s*자유|자유롭게\s*출금/.test(text)
  );
  const earlyTerminationPenaltyApplies = raw.earlyTerminationPenaltyApplies ?? (
    /중도\s*해지\s*(?:금리|이율)|중도해지(?:금리|이율)|만기\s*전\s*해지|약정.*낮은.*금리/.test(text)
  );
  const policyMatch = text.match(/(?:부분\s*인출|부분인출|중도\s*인출|중도인출|긴급\s*출금|일부\s*해지|중도\s*해지|중도해지|만기\s*전\s*해지)[^.。•\n]{0,120}/);

  return {
    partialWithdrawalAllowed: Boolean(partialWithdrawalAllowed),
    earlyTerminationPenaltyApplies: Boolean(earlyTerminationPenaltyApplies),
    withdrawalPolicyText: String(raw.withdrawalPolicyText ?? policyMatch?.[0] ?? "").trim(),
  };
}

export function parseEligibilityText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const regions = parseEligibleRegions(text);
  const eligibility = {
    flags: [],
    sourceText: text,
  };

  const rangeAge = text.match(/만\s*(\d+)\s*세\s*(?:이상|부터)?\s*~\s*(?:만\s*)?(\d+)\s*세/);
  const minAge = text.match(/만\s*(\d+)\s*세\s*이상/);
  const maxAge = text.match(/만\s*(\d+)\s*세\s*이하/);

  if (rangeAge) {
    eligibility.minAge = Number(rangeAge[1]);
    eligibility.maxAge = Number(rangeAge[2]);
  } else {
    if (minAge) eligibility.minAge = Number(minAge[1]);
    if (maxAge) eligibility.maxAge = Number(maxAge[1]);
  }

  const incomeMatch = text.match(/(?:연\s*)?소득\s*(?:금액\s*)?([\d,]+)\s*만원\s*이하/);
  if (incomeMatch) eligibility.maxAnnualIncome = Number(incomeMatch[1].replaceAll(",", "")) * 10000;

  if (eligibility.minAge || eligibility.maxAge) eligibility.flags.push("age");
  if (eligibility.maxAnnualIncome) eligibility.flags.push("income");
  const isYouthFutureSavings = /청년미래적금/.test(text);
  if (/청년|청년도약|청년미래|청년희망/.test(text)) eligibility.flags.push("youth");
  if (/신혼|예비\s*부부|결혼|혼인/.test(text)) eligibility.flags.push("newlywed");
  if (eligibility.maxAnnualIncome || /소득\s*요건|소득\s*조건/.test(text)) eligibility.flags.push("incomeEligible");
  if (/첫\s*거래|첫가입|신규|최초/.test(text)) eligibility.flags.push("firstCustomer");
  if (/급여\s*이체|월급/.test(text)) eligibility.flags.push("salaryTransfer");
  if (/카드|실적/.test(text)) eligibility.flags.push("cardSpend");
  if (/주거래|입출금통장/.test(text)) eligibility.flags.push("primaryBankChange");
  if (!isYouthFutureSavings && isMilitaryEligibilityText(text)) eligibility.flags.push("military");
  if (!isYouthFutureSavings && isVulnerableGroupEligibilityText(text)) eligibility.flags.push("vulnerableGroup");
  if (/장애인|장애\s*정도|장애\s*등록/.test(text)) eligibility.flags.push("disability");
  if (/유공자|국가유공|독립유공/.test(text)) eligibility.flags.push("merit");
  if (/실버|백세|고령/.test(text)) eligibility.flags.push("senior");
  if (!isYouthFutureSavings && isChildEligibilityText(text)) eligibility.flags.push("child");
  if (/임신|출산/.test(text)) eligibility.flags.push("pregnancyOrBirth");
  if (!isYouthFutureSavings && isBusinessOwnerEligibilityText(text)) eligibility.flags.push("businessOwner");
  if (!isYouthFutureSavings && isSmallBusinessEmployeeEligibilityText(text)) eligibility.flags.push("smallBusinessEmployee");
  if (/장학|학생/.test(text)) eligibility.flags.push("student");
  if (regions.length) {
    eligibility.flags.push("regional");
    eligibility.regions = regions;
  }

  return eligibility;
}

const REGION_PATTERNS = [
  ["seoul", /서울특별시|서울시|서울\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["busan", /부산광역시|부산시|부산\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["daegu", /대구광역시|대구시|대구\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["incheon", /인천광역시|인천시|인천\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["gwangju", /광주광역시|광주시|광주\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["daejeon", /대전광역시|대전시|대전\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["ulsan", /울산광역시|울산시|울산\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["sejong", /세종특별자치시|세종시|세종\s*(?:거주|소재|주소|주민|시민|청년)/],
  ["gyeonggi", /경기도|경기\s*(?:거주|소재|주소|주민|도민|청년)/],
  ["gangwon", /강원특별자치도|강원도|강원\s*(?:거주|소재|주소|주민|도민|청년)/],
  ["chungbuk", /충청북도|충북\s*(?:거주|소재|주소|주민|도민|청년)/],
  ["chungnam", /충청남도|충남\s*(?:거주|소재|주소|주민|도민|청년)/],
  ["jeonbuk", /전북특별자치도|전라북도|전북(?!은행|저축은행)/],
  ["jeonnam", /전라남도|전남(?!은행|저축은행)|전남청년문화복지카드/],
  ["gyeongbuk", /경상북도|경북\s*(?:거주|소재|주소|주민|도민|청년)/],
  ["gyeongnam", /경상남도|경남(?!은행|저축은행)/],
  ["jeju", /제주특별자치도|제주도|제주\s*(?:거주|소재|주소|주민|도민|청년)/],
];

function parseEligibleRegions(text) {
  return REGION_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([region]) => region);
}

function isMilitaryEligibilityText(text) {
  return /군\s*장병(?!\s*(?:이\s*받는\s*)?급여)|장병내일준비\s*적금|군인\s*(?:우대)?\s*(?:적금|예금)|(?:장병|군\s*장병)[^.。•\n]{0,40}(?:적금|예금)/.test(text)
    || /의무복무이행자\s*중\s*병급여체계\s*적용\s*대상\s*병사/.test(text)
    || /(?:가입\s*시점|충족하는|한함)[^.]{0,80}(?:현역병|상근예비역|사회복무요원|대체복무요원|직업군인|부사관|장교)/.test(text)
    || /(?:현역병|상근예비역|사회복무요원|대체복무요원|직업군인|부사관|장교)[^.。•\n]{0,80}에\s*한함/.test(text);
}

function isVulnerableGroupEligibilityText(text) {
  return /기초생활\s*수급|차상위|희망나눔|취약\s*계층|한부모/.test(text);
}

function isChildEligibilityText(text) {
  return /아이사랑|우리아이|아이\s*꿈|아이키움|아이든든|아이통장/.test(text)
    || /만\s*\d+\s*세\s*(?:미만|이하)\s*(?:자녀|미성년자)[^.。•\n]{0,50}(?:둔|있는|부모|법정대리인|가입\s*가능|가입가능|가입대상)/.test(text)
    || /(?:자녀|손자녀)[^.。•\n]{0,30}(?:둔|있는)\s*(?:부모|조부모|법정대리인)/.test(text)
    || /법정대리인[^.。•\n]{0,50}(?:가입\s*가능|가입가능|자녀|미성년자)/.test(text);
}

function isBusinessOwnerEligibilityText(text) {
  return /사업자등록증|개인사업자\s*(?:전용|대상|고객|가입)|법인\s*(?:고객|사업자|전용|가입)/.test(text);
}

function isSmallBusinessEmployeeEligibilityText(text) {
  return /(?:중소기업|소상공인)[^.。•\n]{0,40}(?:재직|근로자|직원|임직원)|(?:재직자|근로자|직원|임직원)[^.。•\n]{0,40}(?:중소기업|소상공인)/.test(text);
}

function mergeEligibility(existing, inferred) {
  const base = existing ?? { flags: [], sourceText: "" };
  const flags = [...new Set([...(base.flags ?? []), ...(inferred.flags ?? [])])];
  const regions = [...new Set([...(base.regions ?? []), ...(inferred.regions ?? [])])];
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(inferred).filter(([key, value]) => !["flags", "regions", "sourceText"].includes(key) && value != null),
    ),
    flags,
    ...(regions.length ? { regions } : {}),
    sourceText: [base.sourceText, inferred.sourceText]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join(", "),
  };
}

function normalizeType(value) {
  return TYPE_MAP[String(value ?? "").trim()] ?? "deposit";
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseConditionText(conditionText) {
  const text = String(conditionText ?? "");
  const pieces = text
    .split(/[,/\n]|(?:\s{2,})/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const conditions = [];
  const seen = new Set();

  for (const piece of pieces) {
    const matched = CONDITION_PATTERNS.find((condition) => condition.pattern.test(piece));
    if (!matched || seen.has(matched.key)) continue;

    conditions.push({
      key: matched.key,
      label: matched.label,
      rateBoost: parsePercent(piece),
      friction: matched.friction,
      sourceText: piece,
    });
    seen.add(matched.key);
  }

  return conditions;
}

export function normalizeRawProduct(raw) {
  const type = normalizeType(raw.productType);
  const conditions = parseConditionText(raw.conditionText);
  const structuredConditions = normalizeStructuredConditions(raw.structuredConditions);
  const bank = String(raw.bankName ?? raw.bank ?? "").trim();
  const name = String(raw.productName ?? raw.name ?? "").trim();
  const sourceUpdatedAt = raw.updatedAt;
  const updatedAt = raw.detailFetchedAt ?? raw.scrapedAt ?? raw.updatedAt;
  const id = raw.id ?? `${type}-${slugify(bank)}-${slugify(name)}`;
  const baseRate = parsePercent(raw.baseRateText ?? raw.baseRate);
  const maxRate = parsePercent(raw.maxRateText ?? raw.maxRate);
  const inferredEligibility = parseEligibilityText([
    name,
    raw.eligibilityText,
    raw.conditionText,
    raw.detailConditionText,
    raw.rateGuideText,
  ].filter(Boolean).join(", "));
  const eligibility = mergeEligibility(raw.eligibility, inferredEligibility);
  const amountText = raw.maxAmountText ?? raw.maxAmount;
  const monthlyLimitText = raw.monthlyLimitText || (type === "installment" ? amountText : "");
  const additionalBenefitRules = normalizeAdditionalBenefitRules(raw.additionalBenefitRules);
  const contributionFrequency = inferContributionFrequency(raw, type);
  const amountLimits = parseAmountLimits(amountText);
  const monthlyAmountLimits = parseMonthlyAmountLimits(monthlyLimitText ?? raw.monthlyLimit);
  const detailedSource = [amountText, monthlyLimitText]
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .join(" ");
  const detailedAmountLimits = parseDetailedAmountLimits(detailedSource);
  const monthlyLimit = type === "installment"
    ? (monthlyAmountLimits.max || detailedAmountLimits.monthlyContributionLimit)
    : 0;
  const interestPolicy = inferInterestPolicy(raw);
  const withdrawalPolicy = inferWithdrawalPolicy(raw, type);

  return {
    id,
    bank,
    name,
    type,
    baseRate,
    maxRate,
    termMonths: parseMonths(raw.termText ?? raw.termMonths),
    minAmount: type === "installment" ? 0 : amountLimits.min,
    maxAmount: type === "installment" ? 0 : amountLimits.max,
    minMonthlyAmount: type === "installment" ? monthlyAmountLimits.min : 0,
    monthlyLimit,
    perContributionMinAmount: detailedAmountLimits.perContributionMinAmount,
    perContributionMaxAmount: detailedAmountLimits.perContributionMaxAmount,
    dailyContributionLimit: detailedAmountLimits.dailyContributionLimit,
    weeklyContributionLimit: detailedAmountLimits.weeklyContributionLimit,
    annualContributionLimit: detailedAmountLimits.annualContributionLimit,
    totalContributionLimit: detailedAmountLimits.totalContributionLimit,
    officialUrl: String(raw.officialUrl ?? raw.sourceUrl ?? "").trim(),
    sourceUrl: String(raw.sourceUrl ?? raw.officialUrl ?? "").trim(),
    updatedAt,
    sourceUpdatedAt,
    easeScore: inferEaseScore(raw.channelText, conditions),
    firstCustomerOnly: [...conditions, ...structuredConditions].some((condition) => condition.key === "firstCustomer"),
    depositProtection: /예금자보호|보호\s*대상/.test(String(raw.protectionText ?? "")),
    eligibility,
    interestTaxExempt: Boolean(raw.interestTaxExempt) || inferInterestTaxExempt(raw),
    ...interestPolicy,
    ...withdrawalPolicy,
    contributionFrequency,
    additionalBenefitRules: additionalBenefitRules.length ? additionalBenefitRules : inferAdditionalBenefitRules(raw),
    availabilityStatus: raw.availabilityStatus ?? "listed",
    rateGuideText: String(raw.rateGuideText ?? "").trim(),
    detailConditionText: String(raw.detailConditionText ?? "").trim(),
    detailSections: raw.detailSections ?? {},
    tieredRateRules: normalizeTieredRateRules(raw.tieredRateRules),
    structuredConditions,
    status: raw.reviewStatus === "approved" ? "active" : "needs_review",
    reviewStatus: raw.reviewStatus ?? "pending",
    conditions,
    raw,
  };
}

function inferEaseScore(channelText, conditions) {
  const channel = String(channelText ?? "");
  let score = /앱|모바일|비대면/.test(channel) ? 88 : 72;
  const friction = conditions.reduce((sum, condition) => sum + condition.friction, 0);
  score -= Math.min(22, friction * 2);
  return Math.max(45, score);
}

function isBranchOnlyProduct(product) {
  const channel = String(product.raw?.channelText ?? product.channelText ?? "").replace(/\s+/g, "");
  if (!channel) return false;
  const hasBranchChannel = /영업점|창구|대면/.test(channel);
  const hasRemoteChannel = /앱|모바일|스마트폰|스마트뱅킹|인터넷|온라인|비대면|웹|i-?bank|뱅킹/.test(channel);
  return hasBranchChannel && !hasRemoteChannel;
}

function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(`${to}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Infinity;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

export function validateProduct(product, options = {}) {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const staleAfterDays = options.staleAfterDays ?? 14;
  const errors = [];

  if (product.reviewStatus !== "approved") errors.push("not_approved");
  if (product.availabilityStatus === "removed") errors.push("removed_from_source");
  if (!product.bank) errors.push("missing_bank");
  if (!product.name) errors.push("missing_name");
  if (!["deposit", "installment", "parking"].includes(product.type)) errors.push("invalid_type");
  if (!product.baseRate || !product.maxRate) errors.push("missing_rate");
  if (product.maxRate < product.baseRate) errors.push("invalid_rate_range");
  if (product.type !== "parking" && !product.termMonths) errors.push("missing_term");
  if (!product.officialUrl) errors.push("missing_official_url");
  if (!product.updatedAt) errors.push("missing_updated_at");
  if (isBranchOnlyProduct(product)) errors.push("branch_only");

  if (product.updatedAt && daysBetween(product.updatedAt, today) > staleAfterDays) {
    errors.push("stale_data");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      status: errors.includes("stale_data") ? "stale" : "disabled",
      errors,
    };
  }

  return { ok: true, status: "active", errors: [] };
}

export function buildActiveCatalog(rawProducts, options = {}) {
  const normalized = rawProducts.map(normalizeRawProduct);
  const activeProducts = [];
  const rejectedProducts = [];

  for (const product of normalized) {
    const validation = validateProduct(product, options);
    if (validation.ok) {
      activeProducts.push({
        ...product,
        status: "active",
        validationErrors: [],
      });
    } else {
      rejectedProducts.push({
        ...product,
        status: validation.status,
        validationErrors: validation.errors,
      });
    }
  }

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      activeCount: activeProducts.length,
      rejectedCount: rejectedProducts.length,
      sourceCount: rawProducts.length,
    },
    activeProducts,
    rejectedProducts,
  };
}
