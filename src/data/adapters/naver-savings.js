const NAVER_CATEGORY_TO_TYPE = {
  deposit: "deposit",
  saving: "installment",
  parking: "parking",
};

const DEFAULT_LIST_PAGE = {
  deposit: "https://pay.naver.com/savings/list/deposit",
  saving: "https://pay.naver.com/savings/list/saving",
  parking: "https://pay.naver.com/savings/list/parking",
};

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstText(...values) {
  return cleanText(values.find((value) => cleanText(value)));
}

function rateText(value, prefix) {
  const text = cleanText(value);
  if (!text) return "";
  return text.includes("%") ? text : `${prefix} ${text}%`;
}

function parseKoreanWon(value) {
  const text = cleanText(value).replaceAll(",", "").replace(/\s+/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  const number = Number(match[1]);
  if (text.includes("억원") || text.includes("억")) return Math.round(number * 100000000);
  if (text.includes("천만원") || text.includes("천만")) return Math.round(number * 10000000);
  if (text.includes("백만원") || text.includes("백만")) return Math.round(number * 1000000);
  if (text.includes("만원") || text.includes("만")) return Math.round(number * 10000);
  return Math.round(number);
}

function parseRateBoost(value) {
  const text = cleanText(value);
  const explicitBoost = text.match(/(?:우대금리|우대|추가).*?(?:\+|:)?\s*(\d+(?:\.\d+)?)\s*%p?/);
  if (explicitBoost) return Number(explicitBoost[1]);

  const plusBoost = text.match(/\+\s*(\d+(?:\.\d+)?)\s*%p?/);
  if (plusBoost) return Number(plusBoost[1]);

  const leadingBoost = text.match(/(\d+(?:\.\d+)?)\s*%p?.*?(?:우대금리|우대|추가)/);
  if (leadingBoost) return Number(leadingBoost[1]);

  const suffixBoost = text.match(/:\s*(\d+(?:\.\d+)?)\s*%p?$/);
  return suffixBoost ? Number(suffixBoost[1]) : 0;
}

function isGeneralEligibilityText(text) {
  return /^(?:실명의\s*)?개인(?:고객)?$/.test(text)
    || /^개인(?:,|\s*및|\s*또는)?\s*(?:개인사업자)?(?:,|\s*및|\s*또는)?\s*(?:법인|단체)?(?:\s*등)?$/.test(text)
    || /^실명의 개인(?:\s*및|\s*또는)?\s*개인사업자$/.test(text)
    || /^비거주 외국인 외 제한없음$/.test(text);
}

function isUnlimitedAmountText(text) {
  return /^제한\s*없음(?:\s*\(.*\))?$/.test(text);
}

function isMinimumAmountText(text) {
  return /^입금최소금액\s*\d+\s*원$/.test(text)
    || /^(?:월\s*)?(?:최소\s*)?(?:계약금액\s*)?[\d,\s.]+(?:원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*이상$/.test(text);
}

function isAmountRangeText(text) {
  return /[\d,\s.]+(?:원|천원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*(?:이상|부터).*(?:제한\s*없음|[\d,\s.]+(?:원|천원|만원|백만원|천만원|억(?:원)?|만\s*원)\s*(?:이하|까지))/.test(text);
}

function classifyGenericCalculableCondition(text) {
  const sourceText = cleanText(text);
  if (isGeneralEligibilityText(sourceText)) return { key: "generalEligibility", label: "일반 가입대상" };
  if (isUnlimitedAmountText(sourceText)) return { key: "unlimitedAmount", label: "한도 제한 없음" };
  if (isMinimumAmountText(sourceText)) return { key: "minimumAmount", label: "최소 가입금액" };
  if (isAmountRangeText(sourceText)) return { key: "amountRange", label: "가입금액 범위" };
  return null;
}

function classifyCondition(text) {
  const generic = classifyGenericCalculableCondition(text);
  if (generic) return generic;

  if (/마케팅|상품서비스 안내|광고|수집.?이용.*동의/.test(text)) return { key: "marketingConsent", label: "마케팅 동의" };
  if (/네이버페이|카카오페이|페이코|토스|다모음캐시|4대페이|결제계좌.*등록|등록.*결제계좌/.test(text)) {
    return { key: "payAccountRegistration", label: "페이/간편결제 계좌등록" };
  }
  if (/쿠폰|이벤트|특판|한도\s*소진/.test(text)) return { key: "eventCoupon", label: "이벤트/쿠폰" };
  if (/로그인|출석|방문|얼리버드/.test(text)) return { key: "appActivity", label: "앱 활동" };
  if (/첫\s*거래|첫가입|신규|최초|보유하지 않은|이력이 없는/.test(text)) {
    return { key: "firstCustomer", label: "신규/첫거래" };
  }
  if (/급여\s*이체|월급/.test(text)) return { key: "salaryTransfer", label: "급여이체" };
  if (/자동\s*이체|자동납부/.test(text)) return { key: "autoDebit", label: "자동이체" };
  if (/주거래|입출금.*보통예금|입출금.*자유/.test(text)) return { key: "primaryBankChange", label: "주거래/입출금통장" };
  if (/카드|실적/.test(text)) return { key: "cardSpend", label: "카드/결제실적" };
  if (/만\s*\d+\s*세|나이|청년/.test(text)) return { key: "age", label: "나이 조건" };
  if (/소득|연소득/.test(text)) return { key: "income", label: "소득 조건" };
  if (/1인\s*1계좌|인당\s*1계좌/.test(text)) return { key: "oneAccountPerPerson", label: "1인 1계좌" };
  if (/한도|이하 분|초과 분|금액별|예치 금액/.test(text)) return { key: "amountTier", label: "금액/한도 조건" };
  if (/모바일|앱|비대면|인터넷/.test(text)) return { key: "channel", label: "가입채널" };
  if (/만기|중도해지/.test(text)) return { key: "maturityOnly", label: "만기 유지" };
  return { key: "manualReview", label: "수동 검수" };
}

function extractAmountScope(text) {
  const match = text.match(/(?:예치\s*)?금액\s*([\d,\s.]+(?:천만|백만|만|억)?\s*원?)\s*이하|([\d,\s.]+(?:천만|백만|만|억)?\s*원?)\s*이하\s*분/);
  if (!match) return {};
  const maxAmount = parseKoreanWon(match[1] ?? match[2]);
  return maxAmount ? { appliesToAmountMax: maxAmount } : {};
}

function collectProductItems(payload) {
  const result = payload.result ?? payload;
  return (
    result.products ??
    result.productList ??
    result.list ??
    result.items ??
    result.content ??
    []
  );
}

function resultOf(payload) {
  return payload?.result ?? payload ?? {};
}

function inferProductType(categoryOrType) {
  return NAVER_CATEGORY_TO_TYPE[categoryOrType] ?? categoryOrType ?? "deposit";
}

function walkStrings(value, callback) {
  if (typeof value === "string") {
    callback(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, callback);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) walkStrings(item, callback);
  }
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function extractNaverNextData(html) {
  const match = String(html).match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Naver __NEXT_DATA__ script not found");
  return JSON.parse(match[1].trim());
}

export function getNaverListFilter(html) {
  const data = extractNaverNextData(html);
  const filter = data.props?.pageProps?.listPage?.filter;
  if (!filter?.productCategory || !filter?.productTypeCode) {
    throw new Error("Naver savings list filter not found");
  }
  return {
    productCategory: filter.productCategory,
    productTypeCode: filter.productTypeCode,
  };
}

export function buildNaverProductListUrl({
  origin = "https://pay.naver.com",
  productTypeCode,
  companyGroupCode,
  regionCode = "00",
  offset = 0,
  sortType = "PRIME_INTEREST_RATE",
} = {}) {
  const url = new URL("/savings/api/v1/productList", origin);
  url.searchParams.set("productTypeCode", productTypeCode);
  if (companyGroupCode) url.searchParams.set("companyGroupCode", companyGroupCode);
  url.searchParams.set("regionCode", regionCode);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sortType", sortType);
  return url;
}

export function buildNaverProductDetailUrl(product) {
  const officialUrl = firstText(product.officialUrl, product.detailUrl, product.productUrl);
  if (officialUrl) return officialUrl;

  const productCode = firstText(product.naverProductCode, product.productCode, product.code);
  return productCode ? `https://pay.naver.com/savings/detail/${productCode}` : "";
}

export function buildNaverProductDetailsApiUrl(product, origin = "https://pay.naver.com") {
  const productCode = firstText(product.naverProductCode, product.productCode, product.code);
  if (!productCode) return "";

  const url = new URL("/savings/api/v1/productDetails", origin);
  url.searchParams.set("productCode", productCode);
  return url;
}

export function buildNaverProductInterestApiUrl(product, origin = "https://pay.naver.com") {
  const productCode = firstText(product.naverProductCode, product.productCode, product.code);
  if (!productCode) return "";

  const url = new URL("/savings/api/v1/productInterest", origin);
  url.searchParams.set("productCode", productCode);
  return url;
}

export function getNaverListPageUrl(category) {
  return DEFAULT_LIST_PAGE[category];
}

export function parseNaverEligibility(text) {
  const sourceText = cleanText(text);
  const eligibility = {
    flags: [],
    sourceText,
  };

  const rangeAge = sourceText.match(/만\s*(\d+)\s*세\s*(?:이상|부터)?\s*~\s*(?:만\s*)?(\d+)\s*세/);
  const minAge = sourceText.match(/만\s*(\d+)\s*세\s*이상/);
  const maxAge = sourceText.match(/만\s*(\d+)\s*세\s*이하/);
  if (rangeAge) {
    eligibility.minAge = Number(rangeAge[1]);
    eligibility.maxAge = Number(rangeAge[2]);
  } else {
    if (minAge) eligibility.minAge = Number(minAge[1]);
    if (maxAge) eligibility.maxAge = Number(maxAge[1]);
  }

  const incomeMatch = sourceText.match(/(?:연\s*)?소득\s*(?:금액\s*)?([\d,]+)\s*만원\s*이하/);
  if (incomeMatch) eligibility.maxAnnualIncome = Number(incomeMatch[1].replaceAll(",", "")) * 10000;

  if (eligibility.minAge || eligibility.maxAge) eligibility.flags.push("age");
  if (eligibility.maxAnnualIncome) eligibility.flags.push("income");
  if (/청년|청년도약|청년미래|청년희망/.test(sourceText)) eligibility.flags.push("youth");
  if (/신혼|예비\s*부부|결혼|혼인/.test(sourceText)) eligibility.flags.push("newlywed");
  if (eligibility.maxAnnualIncome || /소득\s*요건|소득\s*조건/.test(sourceText)) eligibility.flags.push("incomeEligible");
  if (/첫\s*거래|첫가입|신규|최초/.test(sourceText)) eligibility.flags.push("firstCustomer");
  if (/급여\s*이체|월급/.test(sourceText)) eligibility.flags.push("salaryTransfer");
  if (/카드|실적/.test(sourceText)) eligibility.flags.push("cardSpend");
  if (/주거래|입출금통장/.test(sourceText)) eligibility.flags.push("primaryBankChange");
  if (/장병|군인|군\s*장병|전역|복무|병사|현역병|상근예비역|사회복무요원|대체복무요원|의무복무이행자|직업군인|부사관|장교/.test(sourceText)) eligibility.flags.push("military");
  if (/기초생활|차상위|희망나눔|취약/.test(sourceText)) eligibility.flags.push("vulnerableGroup");
  if (/장애/.test(sourceText)) eligibility.flags.push("disability");
  if (/유공/.test(sourceText)) eligibility.flags.push("merit");
  if (/실버|백세|고령/.test(sourceText)) eligibility.flags.push("senior");
  if (/(?:아이사랑|우리아이|아이\s*꿈|아이키움|아이든든|아이통장|자녀|미성년자|법정대리인|조부모|손자녀|부모\s*및\s*자녀|자녀를\s*둔\s*(?:조)?부모)/.test(sourceText)) eligibility.flags.push("child");
  if (/임신|출산/.test(sourceText)) eligibility.flags.push("pregnancyOrBirth");
  if (/사업자등록증|개인사업자|법인/.test(sourceText)) eligibility.flags.push("businessOwner");
  if (/중소기업|재직자/.test(sourceText)) eligibility.flags.push("smallBusinessEmployee");
  if (/장학|학생/.test(sourceText)) eligibility.flags.push("student");

  return eligibility;
}

export function extractNaverRateGuideFromHtml(html) {
  const withoutScripts = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const visibleText = cleanText(decodeHtmlEntities(withoutScripts.replace(/<[^>]+>/g, " ")));
  const sectionMatch = visibleText.match(
    /금리\s*안내\s*(.+?)(?:가입\s*안내|상품\s*안내|우대\s*조건|유의\s*사항|예금자\s*보호|상품설명서|약관|$)/,
  );
  const htmlSection = sectionMatch ? sectionMatch[1] : "";

  const structuredTexts = [];
  try {
    const data = extractNaverNextData(html);
    walkStrings(data, (value) => {
      const text = cleanText(value);
      if (/금리|우대|조건|가입|소득|나이|한도|급여|카드|첫/.test(text)) structuredTexts.push(text);
    });
  } catch {
    // Some detail responses are plain rendered HTML, not Next.js data.
  }

  const texts = uniqueTexts([htmlSection, ...structuredTexts]);
  const rateGuideText = texts.join(" ");
  const detailConditionText = uniqueTexts(
    texts.filter((text) => /우대|조건|가입|소득|나이|한도|급여|카드|첫|주거래|마케팅|자동/.test(text)),
  ).join(", ");

  return {
    rateGuideText,
    detailConditionText,
    detailSections: {
      rateGuide: rateGuideText,
    },
  };
}

function htmlToText(value) {
  return cleanText(decodeHtmlEntities(String(value ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")));
}

function interestTableText(interestDetail) {
  const rows = interestDetail?.rows ?? [];
  return rows.map((row) => row.join(" ")).join(", ");
}

export function extractTieredRateRules(interestDetail) {
  const rows = interestDetail?.rows ?? [];
  let previousMaxAmount = 0;

  return rows.map((row) => {
    const sourceText = row.join(" ");
    const amountText = cleanText(row[0]);
    const rate = Number(cleanText(row[1]).match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    const amount = parseKoreanWon(amountText);
    const isExcess = /초과/.test(amountText);
    const isUpTo = /이하|까지/.test(amountText);
    const rule = {
      sourceText,
      rate,
      minExclusiveAmount: isExcess ? amount : previousMaxAmount,
      maxInclusiveAmount: isUpTo ? amount : null,
    };

    if (rule.maxInclusiveAmount) previousMaxAmount = rule.maxInclusiveAmount;
    return rule;
  }).filter((rule) => rule.rate > 0 && (rule.maxInclusiveAmount || rule.minExclusiveAmount > 0));
}

export function extractStructuredNaverConditions({
  detailConditionText = "",
  detailConditionParts = [],
  specialConditions = [],
  tieredRateRules = [],
} = {}) {
  const conditionTexts = uniqueTexts([
    ...(detailConditionParts.length ? detailConditionParts : [detailConditionText]),
    ...specialConditions,
  ]);

  const structured = conditionTexts.map((sourceText) => {
    const classification = classifyCondition(sourceText);
    const eligibility = parseNaverEligibility(sourceText);
    return {
      ...classification,
      rateBoost: parseRateBoost(sourceText),
      sourceText,
      eligibility,
      ...extractAmountScope(sourceText),
      requiresManualReview: classification.key === "manualReview",
    };
  });

  for (const rule of tieredRateRules) {
    structured.push({
      key: "amountTier",
      label: "금액/한도 조건",
      rateBoost: 0,
      sourceText: rule.sourceText,
      tieredRateRule: rule,
      requiresManualReview: false,
    });
  }

  return structured.filter((condition) => cleanText(condition.sourceText));
}

export function extractNaverRateGuideFromPayload(detailsPayload, interestPayload) {
  const details = resultOf(detailsPayload);
  const interest = resultOf(interestPayload);
  const specialConditions = interest.specialConditions?.map((condition) => htmlToText(condition.description)) ?? [];
  const tieredRateRules = extractTieredRateRules(interest.interestDetail);
  const detailTexts = [
    details.specialOfferSummary,
    details.specialOfferPeriodText,
    details.joinPeriodText,
    details.joinAmountText,
    details.joinTarget,
    details.channel,
    details.interestPaymentCycle,
    details.note,
    details.depositorProtectionText,
    interest.interestCalculation?.interestRate && `기본금리 ${interest.interestCalculation.interestRate}%`,
    interest.interestCalculation?.primeInterestRate && `최고금리 ${interest.interestCalculation.primeInterestRate}%`,
    interestTableText(interest.interestDetail),
    ...specialConditions,
  ].map(htmlToText);

  const rateGuideText = uniqueTexts(detailTexts).join(" ");
  const detailConditionText = uniqueTexts([
    details.specialOfferSummary,
    details.specialOfferPeriodText,
    details.joinTarget,
    details.joinAmountText,
    ...specialConditions,
  ].map(htmlToText)).join(", ");
  const detailConditionParts = uniqueTexts([
    details.specialOfferSummary,
    details.specialOfferPeriodText,
    details.joinTarget,
    details.joinAmountText,
  ].map(htmlToText));
  const structuredConditions = extractStructuredNaverConditions({
    detailConditionText,
    detailConditionParts,
    specialConditions,
    tieredRateRules,
  });

  return {
    rateGuideText,
    detailConditionText,
    detailSections: {
      productDetails: {
        specialOfferSummary: htmlToText(details.specialOfferSummary),
        specialOfferPeriodText: htmlToText(details.specialOfferPeriodText),
        joinTarget: htmlToText(details.joinTarget),
        joinAmountText: htmlToText(details.joinAmountText),
        joinPeriodText: htmlToText(details.joinPeriodText),
        depositorProtectionText: htmlToText(details.depositorProtectionText),
        updatedAt: details.updatedAt,
      },
      interest: {
        calculation: interest.interestCalculation ?? {},
        interestDetail: interest.interestDetail ?? {},
        specialConditions,
        tieredRateRules,
      },
    },
    tieredRateRules,
    structuredConditions,
    productFields: {
      baseRateText: rateText(details.interestRate ?? interest.interestCalculation?.interestRate, "연"),
      maxRateText: rateText(details.primeInterestRate ?? interest.interestCalculation?.primeInterestRate, "최고 연"),
      termText: details.joinPeriodText || (details.savingTerm ? `${details.savingTerm}개월` : ""),
      maxAmountText: details.joinAmountText,
      channelText: details.channel,
      protectionText: details.depositorProtectionText,
      officialUrl: firstText(details.mobileLinkUrl, details.pcLinkUrl),
      updatedAt: details.updatedAt,
    },
  };
}

export function enrichNaverProductWithDetail(product, detail, {
  fetchedAt = new Date().toISOString().slice(0, 10),
  detailSourceUrl = "",
} = {}) {
  const rateGuideText = cleanText(detail?.rateGuideText);
  const detailConditionText = cleanText(detail?.detailConditionText ?? rateGuideText);
  const mergedConditionText = uniqueTexts([
    product.conditionText,
    detailConditionText,
  ]).join(", ");
  const eligibility = parseNaverEligibility(
    uniqueTexts([detailConditionText, rateGuideText, product.eligibilityText, mergedConditionText]).join(", "),
  );

  return {
    ...product,
    baseRateText: firstText(detail?.productFields?.baseRateText, product.baseRateText),
    maxRateText: firstText(detail?.productFields?.maxRateText, product.maxRateText),
    termText: firstText(detail?.productFields?.termText, product.termText),
    maxAmountText: firstText(detail?.productFields?.maxAmountText, product.maxAmountText),
    channelText: firstText(detail?.productFields?.channelText, product.channelText),
    protectionText: firstText(detail?.productFields?.protectionText, product.protectionText),
    officialUrl: firstText(detail?.productFields?.officialUrl, product.officialUrl),
    updatedAt: firstText(detail?.productFields?.updatedAt, product.updatedAt),
    conditionText: mergedConditionText || product.conditionText,
    eligibilityText: eligibility.sourceText,
    eligibility,
    rateGuideText,
    detailConditionText,
    detailSections: detail?.detailSections ?? { rateGuide: rateGuideText },
    tieredRateRules: detail?.tieredRateRules ?? product.tieredRateRules ?? [],
    structuredConditions: detail?.structuredConditions ?? product.structuredConditions ?? [],
    detailSourceUrl: detailSourceUrl || product.officialUrl,
    detailFetchedAt: fetchedAt,
  };
}

function conditionText(item) {
  const parts = [
    item.preferentialConditions,
    item.preferentialCondition,
    item.primeCondition,
    item.specialCondition,
    item.eligibilityDescription,
    item.joinCondition,
    item.joinMember,
    item.tagList,
  ].flat().map(cleanText).filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function termText(item, productType) {
  if (productType === "parking") return "";
  return firstText(item.period, item.term, item.saveTerm, item.productPeriod, item.savingTerm && `${item.savingTerm}개월`);
}

function maxAmountText(item, productType) {
  const amount = firstText(item.maxAmount, item.joinLimit, item.limitAmount, item.depositLimit);
  return productType === "installment" && /^월/.test(amount) ? "" : amount;
}

function monthlyLimitText(item, productType) {
  const amount = firstText(item.monthlyLimit, item.monthlyAmount, item.maxAmount, item.joinLimit);
  return productType === "installment" ? amount : "";
}

export function mapNaverSavingsResponseToRawProducts(payload, {
  productType,
  productCategory,
  scrapedAt = new Date().toISOString().slice(0, 10),
  sourceUrl = "",
} = {}) {
  const result = payload.result ?? payload;
  if (payload.isSuccess === false || result.isSuccess === false) {
    throw new Error(payload.message || result.message || "Naver savings response failed");
  }

  const type = inferProductType(productType ?? productCategory);
  return collectProductItems(payload)
    .map((item) => {
      const conditions = conditionText(item);
      const eligibility = parseNaverEligibility(
        firstText(conditions, item.eligibilityText, item.eligibilityDescription),
      );

      return {
        source: "naver-pay-savings",
        sourceUrl,
        scrapedAt,
        reviewStatus: "pending",
        bankName: firstText(item.companyName, item.bankName, item.bank, item.company?.name),
        productName: firstText(item.productName, item.name, item.title),
        productType: type,
        baseRateText: rateText(firstText(item.defaultRates, item.baseRate, item.defaultRate, item.interestRate), "연"),
        maxRateText: rateText(firstText(item.topRates, item.maxRate, item.topRate, item.primeInterestRate, item.cmaInterestRate), "최고 연"),
        termText: termText(item, type),
        maxAmountText: firstText(item.joinAmountText, maxAmountText(item, type)),
        monthlyLimitText: monthlyLimitText(item, type),
        channelText: firstText(item.joinWay, item.channel, item.joinChannel),
        protectionText: firstText(item.protectionText, item.depositProtection, item.depositorProtectionText) || "예금자보호 확인 필요",
        conditionText: conditions,
        eligibilityText: eligibility.sourceText,
        eligibility,
        officialUrl: firstText(item.productUrl, item.detailUrl, item.url)
          || (firstText(item.productCode, item.code) ? `https://pay.naver.com/savings/detail/${firstText(item.productCode, item.code)}` : sourceUrl),
        naverProductCode: firstText(item.productCode, item.code),
        naverCompanyCode: firstText(item.companyCode, item.financialCompanyCode),
        naverTags: item.tagList ?? [],
      };
    })
    .filter((product) => product.bankName && product.productName);
}
