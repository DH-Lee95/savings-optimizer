import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile app script contains the monthly savings paid recommendation funnel", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /월 저축 최적화/);
  assert.match(source, /분석하기/);
  assert.match(source, /1490|1,490/);
  assert.match(source, /일주일|1주일/);
  assert.match(source, /반값 할인/);
  assert.match(source, /localStorage/);
});

test("paid app uses server-side checkout and report APIs instead of local paid report generation", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/checkout/);
  assert.match(source, /\/api\/reports/);
  assert.match(source, /accessToken/);
  assert.doesNotMatch(source, /SAMPLE_PRODUCTS/);
  assert.doesNotMatch(source, /optimizeSavings/);
  assert.doesNotMatch(source, /createPaidReport\(getInput\(\), SAMPLE_PRODUCTS\)/);
  assert.doesNotMatch(source, /실제 PG 대신 결제 완료 흐름을 모의 처리/);
});

test("monthly savings first screen captures amount, term, and contribution style without age or income", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /monthlySavings/);
  assert.match(source, /monthlySavingsManwon/);
  assert.match(source, /horizonMonths/);
  assert.match(source, /contributionStyle/);
  assert.match(source, /매월 저축 가능액/);
  assert.match(source, /만원 단위/);
  assert.match(source, /예\/적금 기간/);
  assert.match(source, /납입 방식/);
  assert.doesNotMatch(source, /나이/);
  assert.doesNotMatch(source, /연소득/);
  assert.doesNotMatch(source, /annualIncome/);
});

test("mobile app captures detailed Naver preferential conditions", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /payAccountRegistration/);
  assert.match(source, /appActivity/);
  assert.match(source, /eventCoupon/);
  assert.match(source, /간편결제|계좌/);
  assert.match(source, /앱 활동|출석/);
  assert.match(source, /이벤트|쿠폰/);
});

test("monthly savings app captures practical preferential condition toggles", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /salaryTransfer/);
  assert.match(source, /cardSpend/);
  assert.match(source, /autoDebit/);
  assert.match(source, /marketingConsent/);
  assert.match(source, /payAccountRegistration/);
  assert.match(source, /급여이체 가능/);
});

test("monthly savings app separates personal eligibility from actionable preferential conditions", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /personalEligibility/);
  assert.match(source, /specialEligibility/);
  assert.match(source, /개인 가입 조건/);
  assert.match(source, /실행 가능 우대조건/);
  assert.match(source, /군인\/장병/);
  assert.match(source, /청년/);
  assert.match(source, /신혼\/예비부부/);
  assert.match(source, /소득요건 충족/);
  assert.match(source, /userRegion/);
  assert.match(source, /거주\/근무\/지원사업 지역/);
});

test("monthly savings app does not ask for email or current bank before payment", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /리포트 받을 이메일/);
  assert.doesNotMatch(source, /현재 쓰는 은행/);
  assert.doesNotMatch(source, /emailError/);
  assert.doesNotMatch(source, /autocomplete="email"/);
  assert.match(source, /userBanks: \[\]/);
});

test("monthly savings app captures financial sector limit", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /financialSectorLimit/);
  assert.match(source, /금융권 범위/);
  assert.match(source, /1금융권까지/);
  assert.match(source, /2금융권까지/);
  assert.match(source, /저축은행까지/);
});

test("monthly savings app captures maximum distribution count", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /maxAllocationCount/);
  assert.match(source, /최대 분배 상품 수/);
  assert.match(source, /상관없음/);
  assert.match(source, /최대 2개/);
  assert.match(source, /최대 6개/);
});

test("monthly savings app avoids policy-only eligibility inputs in the first product", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /youthFutureContributionType/);
  assert.doesNotMatch(source, /정부기여금/);
});

test("monthly savings app does not expose lump sum product copy yet", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /목돈관리/);
  assert.doesNotMatch(source, /목돈 굴리기/);
  assert.doesNotMatch(source, /2790|2,790/);
  assert.doesNotMatch(source, /3000|3,000/);
});

test("paid report UI exposes calculation basis and base versus max rates", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /계산 기준/);
  assert.match(source, /데이터 업데이트/);
  assert.match(source, /세후 기준/);
  assert.match(source, /기본\/최고/);
  assert.match(source, /baseRate/);
  assert.match(source, /maxRate/);
});

test("paid report UI separates interest, extra benefits, and total benefit", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /총 예상 혜택/);
  assert.match(source, /세후\/비과세 이자/);
  assert.match(source, /정부기여금|추가 혜택/);
  assert.match(source, /bestTotalBenefit/);
});

test("paid report UI exposes detailed contribution and balance limits", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /formatLimitSummary/);
  assert.match(source, /1회/);
  assert.match(source, /1일/);
  assert.match(source, /월/);
  assert.match(source, /총/);
});

test("paid report UI exposes interest calculation policy", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /formatInterestPolicy/);
  assert.match(source, /복리/);
  assert.match(source, /단리/);
  assert.match(source, /절사/);
});

test("mobile app captures goal, liquidity reserve, withdrawal availability, and already-owned exclusions", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /excludedProductIds/);
  assert.match(source, /이미 사용 중/);
  assert.match(source, /중도인출 가능/);
});

test("monthly savings app excludes owned recommendations and recalculates", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /data-exclude-product-id/);
  assert.match(source, /\/api\/reports\/recalculate/);
  assert.match(source, /이미 사용 중 또는 해당 조건 충족 안됨/);
});

test("paid report UI shows projected maturity amount next to each recommendation", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /projectedMaturityAmount/);
  assert.match(source, /만기 예상/);
});

test("paid report UI highlights conditions and total projected balance clearly", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /총 예상 최종 금액/);
  assert.match(source, /condition-chip/);
  assert.match(source, /renderConditionChips/);
  assert.match(source, /중도인출 불가/);
  assert.doesNotMatch(source, /만기 전 해지 필요/);
  assert.match(source, /적금 회차별 단리/);
});

test("paid report UI deduplicates repeated condition labels defensively", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(source, /uniqueLabels/);
  assert.match(source, /renderConditionChips\(uniqueAppliedConditions/);
  assert.match(source, /uniquePendingConditions/);
});

test("paid report UI removes inactive new-savings purpose panel and shows unallocated amount only when needed", () => {
  const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /신규 배분 원금/);
  assert.doesNotMatch(source, /추천 구분/);
  assert.match(source, /unallocatedMonthlySavings/);
  assert.match(source, /분배되지 않은 월 저축액/);
});
