import test from "node:test";
import assert from "node:assert/strict";

import {
  enrichNaverProductWithDetail,
  buildNaverProductDetailsApiUrl,
  buildNaverProductInterestApiUrl,
  buildNaverProductListUrl,
  extractNaverRateGuideFromHtml,
  extractNaverRateGuideFromPayload,
  extractStructuredNaverConditions,
  extractTieredRateRules,
  extractNaverNextData,
  getNaverListFilter,
  mapNaverSavingsResponseToRawProducts,
  parseNaverEligibility,
} from "./naver-savings.js";

const nextDataHtml = `
  <html><body>
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"listPage":{"filter":{"productCategory":"saving","productTypeCode":"1003"}}}}}
    </script>
  </body></html>
`;

const naverListResponse = {
  isSuccess: true,
  result: {
    products: [
      {
        productCode: "P001",
        companyName: "테스트은행",
        companyCode: "0810000",
        productName: "청년 우대 적금",
        productTypeCode: "1003",
        topRates: "5.50",
        defaultRates: "3.20",
        primeRates: "2.30",
        period: "12개월",
        maxAmount: "월 50만원",
        joinWay: "네이버페이 간편가입, 모바일",
        tagList: ["첫가입", "급여이체", "만 19~34세", "연소득 5,000만원 이하"],
        preferentialConditions: [
          "첫가입 우대 연 0.5%p",
          "급여이체 연 0.4%p",
          "마케팅 동의 연 0.1%p",
        ],
        eligibilityDescription: "만 19세 이상 만 34세 이하, 연소득 5,000만원 이하",
        productUrl: "https://pay.naver.com/savings/detail/P001",
      },
    ],
  },
};

test("extractNaverNextData parses Next.js page data from Naver savings html", () => {
  const data = extractNaverNextData(nextDataHtml);
  assert.equal(data.props.pageProps.listPage.filter.productCategory, "saving");
});

test("getNaverListFilter extracts category and product type code", () => {
  const filter = getNaverListFilter(nextDataHtml);
  assert.deepEqual(filter, { productCategory: "saving", productTypeCode: "1003" });
});

test("buildNaverProductListUrl creates Naver Pay savings API url", () => {
  const url = buildNaverProductListUrl({
    origin: "https://pay.naver.com",
    productTypeCode: "1001",
    offset: 20,
  });

  assert.equal(url.toString(), "https://pay.naver.com/savings/api/v1/productList?productTypeCode=1001&regionCode=00&offset=20&sortType=PRIME_INTEREST_RATE");
});

test("buildNaverProduct detail API urls use the Naver product code", () => {
  const product = { naverProductCode: "P001" };

  assert.equal(
    buildNaverProductDetailsApiUrl(product).toString(),
    "https://pay.naver.com/savings/api/v1/productDetails?productCode=P001",
  );
  assert.equal(
    buildNaverProductInterestApiUrl(product).toString(),
    "https://pay.naver.com/savings/api/v1/productInterest?productCode=P001",
  );
});

test("parseNaverEligibility extracts age and income constraints", () => {
  const eligibility = parseNaverEligibility("만 19세 이상 만 34세 이하, 연소득 5,000만원 이하");

  assert.equal(eligibility.minAge, 19);
  assert.equal(eligibility.maxAge, 34);
  assert.equal(eligibility.maxAnnualIncome, 50000000);
  assert.ok(eligibility.flags.includes("age"));
  assert.ok(eligibility.flags.includes("income"));
});

test("parseNaverEligibility extracts special profile eligibility flags", () => {
  const eligibility = parseNaverEligibility("청년, 신혼부부 또는 예비부부, 의무복무이행자 중 병급여체계 적용 대상 병사, 장애인 등록고객, 사업자등록증을 소지한 개인사업자");

  assert.ok(eligibility.flags.includes("youth"));
  assert.ok(eligibility.flags.includes("newlywed"));
  assert.ok(eligibility.flags.includes("military"));
  assert.ok(eligibility.flags.includes("disability"));
  assert.ok(eligibility.flags.includes("businessOwner"));
});

test("parseNaverEligibility marks child and military products from strict eligibility wording", () => {
  const military = parseNaverEligibility("현역병, 상근예비역, 사회복무요원, 대체복무요원에 한함");
  const child = parseNaverEligibility("만 19세 미만 자녀를 둔 부모 또는 법정대리인 가입 가능");

  assert.ok(military.flags.includes("military"));
  assert.ok(child.flags.includes("child"));
});

test("parseNaverEligibility does not mark military parent proxy wording as child eligibility", () => {
  const eligibility = parseNaverEligibility("장병내일준비적금 가입자격 확인서 제출, 부모에 의한 대리 가입 가능");

  assert.ok(eligibility.flags.includes("military"));
  assert.equal(eligibility.flags.includes("child"), false);
});

test("mapNaverSavingsResponseToRawProducts maps detailed Naver conditions to raw products", () => {
  const products = mapNaverSavingsResponseToRawProducts(naverListResponse, {
    productType: "installment",
    scrapedAt: "2026-07-18",
    sourceUrl: "https://pay.naver.com/savings/list/saving",
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].source, "naver-pay-savings");
  assert.equal(products[0].bankName, "테스트은행");
  assert.equal(products[0].productName, "청년 우대 적금");
  assert.equal(products[0].productType, "installment");
  assert.equal(products[0].baseRateText, "연 3.20%");
  assert.equal(products[0].maxRateText, "최고 연 5.50%");
  assert.equal(products[0].monthlyLimitText, "월 50만원");
  assert.match(products[0].conditionText, /첫가입/);
  assert.equal(products[0].eligibility.minAge, 19);
  assert.equal(products[0].eligibility.maxAnnualIncome, 50000000);
  assert.equal(products[0].officialUrl, "https://pay.naver.com/savings/detail/P001");
  assert.equal(products[0].reviewStatus, "pending");
});

test("extractNaverRateGuideFromHtml reads the rate guide section from product detail html", () => {
  const html = `
    <main>
      <h2>상품 안내</h2>
      <section>
        <h3>금리 안내</h3>
        <p>기본금리 연 3.0%</p>
        <p>첫가입 우대 연 0.5%p</p>
        <p>급여이체 우대 연 0.3%p</p>
      </section>
      <section><h3>유의사항</h3><p>세전 기준입니다.</p></section>
    </main>
  `;

  const detail = extractNaverRateGuideFromHtml(html);

  assert.match(detail.rateGuideText, /기본금리 연 3.0%/);
  assert.match(detail.detailConditionText, /첫가입 우대/);
  assert.doesNotMatch(detail.rateGuideText, /세전 기준/);
});

test("enrichNaverProductWithDetail merges detail rate guide into eligibility and condition text", () => {
  const [product] = mapNaverSavingsResponseToRawProducts(naverListResponse, {
    productType: "installment",
    scrapedAt: "2026-07-18",
    sourceUrl: "https://pay.naver.com/savings/list/saving",
  });

  const enriched = enrichNaverProductWithDetail(product, {
    rateGuideText: "금리 안내 첫가입 우대 연 0.5%p 만 19세 이상 만 29세 이하",
    detailConditionText: "첫가입 우대 연 0.5%p, 만 19세 이상 만 29세 이하",
  }, {
    fetchedAt: "2026-07-18",
    detailSourceUrl: "https://pay.naver.com/savings/detail/P001",
  });

  assert.match(enriched.conditionText, /첫가입 우대/);
  assert.equal(enriched.eligibility.maxAge, 29);
  assert.equal(enriched.rateGuideText.includes("금리 안내"), true);
  assert.equal(enriched.detailFetchedAt, "2026-07-18");
});

test("extractNaverRateGuideFromPayload maps productDetails and productInterest into detail fields", () => {
  const detail = extractNaverRateGuideFromPayload({
    isSuccess: true,
    result: {
      interestRate: "3.35",
      primeInterestRate: "3.85",
      savingTerm: 12,
      joinAmountText: "1백만원 이상 1억원 이내",
      joinTarget: "실명의 개인",
      channel: "스마트뱅킹",
      specialOfferSummary: "(금리) 기본금리 연 3.35%에 우대금리 연 0.5% 적용시 최고 연 3.85%",
      depositorProtectionText: "예금자보호 대상",
      mobileLinkUrl: "https://m.bank.example/product",
      updatedAt: "2026-07-16",
    },
  }, {
    isSuccess: true,
    result: {
      interestCalculation: { interestRate: "3.35", primeInterestRate: "3.85" },
      interestDetail: { rows: [["12개월", "3.350%"]] },
      specialConditions: [
        { description: "첫가입 조건 충족 시 : 0.4%" },
        { description: "마케팅 동의 유지 시 : 0.1%" },
      ],
    },
  });

  assert.match(detail.rateGuideText, /첫가입 조건/);
  assert.match(detail.detailConditionText, /마케팅 동의/);
  assert.equal(detail.productFields.maxAmountText, "1백만원 이상 1억원 이내");
  assert.equal(detail.productFields.officialUrl, "https://m.bank.example/product");
});

test("extractTieredRateRules structures parking balance ranges", () => {
  const rules = extractTieredRateRules({
    rows: [
      ["50만원 이하 분", "연 5.0%(세전)"],
      ["500만원 이하 분", "연 0.8%(세전)"],
      ["5천만원 이하 분", "연 0.1%(세전)"],
      ["5천만원 초과 분", "연 1.0%(세전)"],
    ],
  });

  assert.deepEqual(rules.map((rule) => ({
    minExclusiveAmount: rule.minExclusiveAmount,
    maxInclusiveAmount: rule.maxInclusiveAmount,
    rate: rule.rate,
  })), [
    { minExclusiveAmount: 0, maxInclusiveAmount: 500000, rate: 5 },
    { minExclusiveAmount: 500000, maxInclusiveAmount: 5000000, rate: 0.8 },
    { minExclusiveAmount: 5000000, maxInclusiveAmount: 50000000, rate: 0.1 },
    { minExclusiveAmount: 50000000, maxInclusiveAmount: null, rate: 1 },
  ]);
});

test("extractStructuredNaverConditions classifies unusual Naver preferential rules", () => {
  const conditions = extractStructuredNaverConditions({
    detailConditionParts: [
      "본 상품 개설일 직전 1년간 입출금이 자유로운 예금을 보유하지 않은 고객",
      "마케팅 동의 시 우대금리 +0.2%p",
      "4대페이 또는 카드 결제계좌 등록 시 : 2%",
      "얼리버드 로그인 연속 10일 당 +7%p",
      "만 19세 이상 실명의 개인",
    ],
    specialConditions: [
      "이벤트 또는 쿠폰 발급 시행 시 해당 내용을 인터넷 홈페이지 등에 게시합니다.",
    ],
    tieredRateRules: [
      { sourceText: "50만원 이하 분 연 5.0%(세전)", rate: 5, minExclusiveAmount: 0, maxInclusiveAmount: 500000 },
    ],
  });

  const keys = conditions.map((condition) => condition.key);
  assert.ok(keys.includes("firstCustomer"));
  assert.ok(keys.includes("marketingConsent"));
  assert.ok(keys.includes("payAccountRegistration"));
  assert.ok(keys.includes("appActivity"));
  assert.ok(keys.includes("age"));
  assert.ok(keys.includes("eventCoupon"));
  assert.ok(keys.includes("amountTier"));
  assert.equal(conditions.find((condition) => condition.key === "appActivity").rateBoost, 7);
  assert.equal(conditions.find((condition) => condition.key === "eventCoupon").requiresManualReview, false);
});

test("extractStructuredNaverConditions treats generic target and amount text as calculable", () => {
  const conditions = extractStructuredNaverConditions({
    detailConditionParts: [
      "실명의 개인",
      "제한 없음",
      "입금최소금액 10000원",
      "계약금액 10만원 이상 ~ 제한없음",
      "1천원 부터 30만원 까지",
    ],
  });

  assert.deepEqual(conditions.map((condition) => condition.key), [
    "generalEligibility",
    "unlimitedAmount",
    "minimumAmount",
    "amountRange",
    "amountRange",
  ]);
  assert.equal(conditions.some((condition) => condition.requiresManualReview), false);
});

test("extractStructuredNaverConditions treats event coupons as user-checkable conditions", () => {
  const conditions = extractStructuredNaverConditions({
    specialConditions: [
      "금리쿠폰을 사용하고 만기 해지하는 경우 연 0.2%p 우대금리를 제공",
      "추가 우대금리 이벤트 또는 쿠폰 발급",
    ],
  });

  assert.deepEqual(conditions.map((condition) => condition.key), ["eventCoupon", "eventCoupon"]);
  assert.equal(conditions.some((condition) => condition.requiresManualReview), false);
  assert.equal(conditions[0].rateBoost, 0.2);
});
