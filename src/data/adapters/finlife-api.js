const ENDPOINTS = {
  deposit: "depositProductsSearch",
  installment: "savingProductsSearch",
};

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanRate(value) {
  const text = cleanText(value);
  return text ? `연 ${text}%` : "";
}

function cleanMaxRate(value) {
  const text = cleanText(value);
  return text ? `최고 연 ${text}%` : "";
}

function optionKey(item) {
  return `${cleanText(item.fin_co_no)}|${cleanText(item.fin_prdt_cd)}`;
}

function optionProductName(base, option) {
  const name = cleanText(base.fin_prdt_nm);
  const term = cleanText(option.save_trm);
  return term ? `${name} ${term}개월` : name;
}

function moneyText(value) {
  const text = cleanText(value);
  return text ? `${text}원` : "";
}

export function buildFinlifeUrl({
  apiKey,
  productType,
  pageNo = 1,
  topFinGrpNo = "020000",
  baseUrl = "https://finlife.fss.or.kr/finlifeapi",
} = {}) {
  const endpoint = ENDPOINTS[productType];
  if (!endpoint) throw new Error(`Unsupported FinLife product type: ${productType}`);

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${endpoint}.json`);
  url.searchParams.set("auth", apiKey);
  url.searchParams.set("topFinGrpNo", topFinGrpNo);
  url.searchParams.set("pageNo", String(pageNo));
  return url;
}

function assertSuccessfulResponse(result) {
  if (!result) throw new Error("Invalid FinLife response");
  if (result.err_cd && result.err_cd !== "000") {
    throw new Error(result.err_msg || `FinLife API error: ${result.err_cd}`);
  }
}

export function getFinlifeMaxPage(payload) {
  const result = payload.result ?? payload;
  assertSuccessfulResponse(result);
  return Number(result.max_page_no ?? 1) || 1;
}

export function mapFinlifeResponseToRawProducts(payload, {
  productType,
  scrapedAt = new Date().toISOString().slice(0, 10),
  sourceUrl = "",
} = {}) {
  const result = payload.result ?? payload;
  assertSuccessfulResponse(result);

  const baseByKey = new Map(
    (result.baseList ?? []).map((item) => [optionKey(item), item]),
  );
  const options = result.optionList?.length ? result.optionList : [{}];
  const products = [];

  for (const option of options) {
    const base = baseByKey.get(optionKey(option));
    if (!base) continue;

    const isInstallment = productType === "installment";
    products.push({
      source: "finlife-api",
      sourceUrl,
      scrapedAt,
      reviewStatus: "pending",
      bankName: cleanText(base.kor_co_nm),
      productName: optionProductName(base, option),
      productType,
      baseRateText: cleanRate(option.intr_rate),
      maxRateText: cleanMaxRate(option.intr_rate2 || option.intr_rate),
      termText: option.save_trm ? `${cleanText(option.save_trm)}개월` : "",
      maxAmountText: isInstallment ? "" : moneyText(option.max_limit ?? base.max_limit),
      monthlyLimitText: isInstallment ? moneyText(option.max_limit ?? base.max_limit) : "",
      channelText: cleanText(base.join_way),
      protectionText: "예금자보호 확인 필요",
      conditionText: [base.spcl_cnd, option.rsrv_type_nm, base.join_member]
        .map(cleanText)
        .filter(Boolean)
        .join(", "),
      officialUrl: "",
      maturityInterestText: cleanText(base.mtrt_int),
      finlifeCompanyNo: cleanText(base.fin_co_no),
      finlifeProductCode: cleanText(base.fin_prdt_cd),
    });
  }

  return products;
}
