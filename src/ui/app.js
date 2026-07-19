import { formatWon } from "../lib/optimizer.js";

const REPORT_PRICE = 1490;
const ORIGINAL_REPORT_PRICE = 2980;
const PROMO_TEXT = "출시 첫 일주일 반값 할인";
const STORAGE_KEY = "savingsOptimizerReports";

const state = {
  view: "quick",
  quick: {
    monthlySavingsManwon: 150,
    horizonMonths: 12,
    preference: "balanced",
    contributionStyle: "balanced",
    financialSectorLimit: "savingsBankIncluded",
    maxAllocationCount: "any",
  },
  detail: {
    userRegion: "",
    salaryTransfer: true,
    cardSpend: false,
    autoDebit: true,
    marketingConsent: false,
    appSignup: true,
    primaryBankChange: false,
    payAccountRegistration: true,
    appActivity: false,
    eventCoupon: false,
    personalEligibility: {
      youth: false,
      military: false,
      newlywed: false,
      incomeEligible: false,
      vulnerableGroup: false,
      disability: false,
      merit: false,
      child: false,
      pregnancyOrBirth: false,
      businessOwner: false,
      smallBusinessEmployee: false,
      student: false,
    },
  },
  excludedProductIds: [],
  paidReport: null,
  accessToken: null,
  paymentError: "",
  isPaying: false,
};

const app = document.querySelector("#app");

function toNumber(value) {
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInput() {
  return {
    monthlySavings: state.quick.monthlySavingsManwon * 10000,
    horizonMonths: state.quick.horizonMonths,
    preference: state.quick.preference,
    contributionStyle: state.quick.contributionStyle,
    financialSectorLimit: state.quick.financialSectorLimit,
    maxAllocationCount: state.quick.maxAllocationCount === "any" ? null : Number(state.quick.maxAllocationCount),
    planPurpose: "newSavings",
    lumpSum: 0,
    liquidityNeed: "medium",
    excludedProductIds: state.excludedProductIds,
    userBanks: [],
    activeProductCount: 0,
    activeProducts: [],
    conditions: {
      salaryTransfer: state.detail.salaryTransfer,
      cardSpend: state.detail.cardSpend,
      autoDebit: state.detail.autoDebit,
      marketingConsent: state.detail.marketingConsent,
      appSignup: state.detail.appSignup,
      primaryBankChange: state.detail.primaryBankChange,
      payAccountRegistration: state.detail.payAccountRegistration,
      appActivity: state.detail.appActivity,
      eventCoupon: state.detail.eventCoupon,
    },
    specialEligibility: { ...state.detail.personalEligibility },
    userRegions: state.detail.userRegion ? [state.detail.userRegion] : [],
  };
}

function saveReport(report, accessToken) {
  const reports = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  reports.unshift({
    id: report.reportId,
    createdAt: report.generatedAt,
    accessToken,
    report,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, 10)));
}

function getReports() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function setQuickField(key, value) {
  state.quick[key] = [
    "monthlySavingsManwon",
    "horizonMonths",
  ].includes(key) ? toNumber(value) : value;
}

function setDetailField(key, value) {
  if (key.startsWith("personalEligibility.")) {
    const profileKey = key.split(".")[1];
    state.detail.personalEligibility[profileKey] = value;
    return;
  }
  state.detail[key] = value;
}

function handleSubmitQuick(event) {
  event.preventDefault();
  state.view = "detail";
  render();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  }
  return body;
}

async function handlePay(event) {
  event.preventDefault();
  state.isPaying = true;
  state.paymentError = "";
  render();

  try {
    const input = getInput();
    const checkout = await postJson("/api/checkout", {
      input,
      productCode: "monthly-savings-report",
    });
    state.accessToken = checkout.accessToken;

    if (checkout.checkout.status !== "paid") {
      state.paymentError = "결제 대기 상태입니다. 실제 PG 승인 콜백 연결 후 리포트를 생성할 수 있습니다.";
      state.isPaying = false;
      render();
      return;
    }

    const result = await postJson("/api/reports", {
      accessToken: state.accessToken,
      input,
      excludedProductIds: state.excludedProductIds,
    });
    state.paidReport = result.report;
    saveReport(state.paidReport, state.accessToken);
    state.view = "report";
  } catch (error) {
    state.paymentError = error.message;
  } finally {
    state.isPaying = false;
    render();
  }
}

function renderShell(content) {
  const reports = getReports();
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">월 저축 최적화</p>
        <h1>월 저축 상품 추천</h1>
      </div>
      <button class="plain-button" data-view="reports">내 리포트 ${reports.length}</button>
    </header>
    ${content}
    <nav class="bottom-cta" aria-label="주요 액션">
      ${state.view === "quick" ? `<button class="primary-button" form="quickForm">조건 입력하기</button>` : ""}
      ${state.view === "detail" ? `<button class="primary-button" form="payForm" ${state.isPaying ? "disabled" : ""}>${state.isPaying ? "처리 중" : `${REPORT_PRICE.toLocaleString("ko-KR")}원으로 분석하기`}</button>` : ""}
      ${state.view === "report" ? `<button class="secondary-button" data-view="quick">새 계산 시작</button>` : ""}
    </nav>
  `;
}

function renderQuick() {
  return renderShell(`
    <main class="screen">
      <section class="intro">
        <div>
          <p class="eyebrow">월 저축 최적화</p>
          <h2>매달 넣을 돈을 가장 유리한 적금 조합으로 나눕니다.</h2>
          <p>월 저축 가능액, 예/적금 기간, 납입 방식을 먼저 입력하세요.</p>
        </div>
        <img src="assets/report-preview.svg" alt="저축 리포트 모바일 화면 미리보기" />
      </section>

      <form id="quickForm" class="panel form-stack">
        ${moneyInput("monthlySavingsManwon", "매월 저축 가능액 (만원 단위)", state.quick.monthlySavingsManwon, "150")}
        ${selectInput("horizonMonths", "예/적금 기간", state.quick.horizonMonths, [
          [3, "3개월 이내"],
          [6, "6개월"],
          [12, "12개월"],
          [24, "24개월"],
        ])}
        ${segmented("contributionStyle", "납입 방식", state.quick.contributionStyle, [
          ["balanced", "상관없음"],
          ["daily", "매일"],
          ["monthly", "매월"],
        ])}
        ${segmented("financialSectorLimit", "금융권 범위", state.quick.financialSectorLimit, [
          ["firstOnly", "1금융권까지"],
          ["secondIncluded", "2금융권까지"],
          ["savingsBankIncluded", "저축은행까지"],
        ])}
        ${selectInput("maxAllocationCount", "최대 분배 상품 수", state.quick.maxAllocationCount, [
          ["any", "상관없음"],
          [2, "최대 2개"],
          [3, "최대 3개"],
          [4, "최대 4개"],
          [5, "최대 5개"],
          [6, "최대 6개"],
        ])}
      </form>
    </main>
  `);
}

function renderDetail() {
  return renderShell(`
    <main class="screen">
      <section class="result-hero compact">
        <p class="eyebrow">1회 유료 리포트</p>
        <h2>${REPORT_PRICE.toLocaleString("ko-KR")}원으로 월 저축 최적 상품을 분석합니다.</h2>
        <p><span class="promo-badge">${PROMO_TEXT}</span><s>${ORIGINAL_REPORT_PRICE.toLocaleString("ko-KR")}원</s>에서 ${REPORT_PRICE.toLocaleString("ko-KR")}원으로 제공됩니다.</p>
      </section>

      <form id="payForm" class="panel form-stack">
        ${state.paymentError ? `<div class="notice-inline error-box"><strong>결제 확인 필요</strong><span>${state.paymentError}</span></div>` : ""}
        ${selectInput("userRegion", "거주/근무/지원사업 지역", state.detail.userRegion, regionOptions(), "detail")}
        <section class="subsection">
          <h3>개인 가입 조건</h3>
          <div class="toggle-grid">
            ${profileToggle("youth", "청년")}
            ${profileToggle("military", "군인/장병")}
            ${profileToggle("newlywed", "신혼/예비부부")}
            ${profileToggle("incomeEligible", "소득요건 충족")}
            ${profileToggle("vulnerableGroup", "취약계층/기초생활")}
            ${profileToggle("disability", "장애인")}
            ${profileToggle("merit", "유공자")}
            ${profileToggle("child", "자녀 있음")}
            ${profileToggle("pregnancyOrBirth", "임신/출산")}
            ${profileToggle("businessOwner", "사업자")}
            ${profileToggle("smallBusinessEmployee", "중소기업 재직")}
            ${profileToggle("student", "학생")}
          </div>
        </section>
        <section class="subsection">
          <h3>실행 가능 우대조건</h3>
        <div class="toggle-grid">
          ${toggle("salaryTransfer", "급여이체 가능", state.detail.salaryTransfer)}
          ${toggle("cardSpend", "카드실적 가능", state.detail.cardSpend)}
          ${toggle("autoDebit", "자동이체 가능", state.detail.autoDebit)}
          ${toggle("marketingConsent", "마케팅 동의 가능", state.detail.marketingConsent)}
          ${toggle("appSignup", "앱 가입 가능", state.detail.appSignup)}
          ${toggle("primaryBankChange", "주거래 변경 가능", state.detail.primaryBankChange)}
          ${toggle("payAccountRegistration", "간편결제 계좌연결 가능", state.detail.payAccountRegistration)}
          ${toggle("appActivity", "앱 활동/출석 가능", state.detail.appActivity)}
          ${toggle("eventCoupon", "이벤트/쿠폰 확인 가능", state.detail.eventCoupon)}
        </div>
        </section>
        <section class="subsection policy-box">
          <h3>유료 이용 기준</h3>
          <ul class="policy-list">
            <li>1회 결제는 입력한 월 저축액, 기간, 조건 1세트의 상세 리포트에만 적용됩니다.</li>
            <li>뒤로가기로 조건을 바꾸거나 새 계산을 시작하면 새 결제가 필요합니다.</li>
            <li>추천 상품의 “이미 사용 중 또는 조건 미충족” 체크는 같은 리포트 안에서만 다시 계산됩니다.</li>
          </ul>
        </section>
      </form>
    </main>
  `);
}

function renderReport() {
  const report = state.paidReport;
  const recommendationPlan = report.plans.maxYield;
  return renderShell(`
    <main class="screen">
      <section class="result-hero paid">
        <p class="eyebrow">상세 리포트 ${report.reportId}</p>
        <h2>${report.summary.bestPlan} 기준 총 예상 혜택 ${formatWon(report.summary.bestTotalBenefit)}</h2>
        <p>${formatRecommendationMode(report.switchingAnalysis.recommendationMode)} · 세후/비과세 이자 ${formatWon(report.summary.bestAfterTaxInterest)}와 추가 혜택 ${formatWon(report.summary.bestAdditionalBenefits)}을 합산했습니다.</p>
        <div class="hero-metric">
          <span>총 예상 최종 금액</span>
          <strong>${formatWon(recommendationPlan.projectedEndingBalance)}</strong>
        </div>
      </section>

      <section class="plan-tabs">
        ${Object.values(report.plans).map(renderPlanCard).join("")}
      </section>

      ${report.targetAnalysis ? `
        <section class="panel">
          <h3>목표 금액 분석</h3>
          <div class="metric-row">
            <span>목표 금액</span>
            <strong>${formatWon(report.targetAnalysis.targetAmount)}</strong>
          </div>
          <div class="metric-row">
            <span>예상 최종 금액</span>
            <strong>${formatWon(report.targetAnalysis.projectedEndingBalance)}</strong>
          </div>
          <div class="metric-row ${report.targetAnalysis.targetMet ? "positive" : ""}">
            <span>${report.targetAnalysis.targetMet ? "목표 초과" : "부족액"}</span>
            <strong>${formatWon(report.targetAnalysis.gap)}</strong>
          </div>
          <div class="metric-row">
            <span>필요 월 저축액</span>
            <strong>${formatWon(report.targetAnalysis.requiredMonthlySavings)}</strong>
          </div>
        </section>
      ` : ""}

      <section class="panel">
        <h3>계산 기준</h3>
        <div class="metric-row">
          <span>계산일</span>
          <strong>${formatDate(report.generatedAt)}</strong>
        </div>
        <div class="metric-row">
          <span>데이터 업데이트</span>
          <strong>${latestDataDate(report)}</strong>
        </div>
        <div class="metric-row">
          <span>세금</span>
          <strong>세후 기준 ${(report.disclosure.taxRate * 100).toFixed(1)}%</strong>
        </div>
      </section>

      <section class="panel">
        <h3>추천 상품별 조건</h3>
        ${state.paymentError ? `<div class="notice-inline error-box"><strong>재계산 제한</strong><span>${state.paymentError}</span></div>` : ""}
        ${recommendationPlan.unallocatedMonthlySavings > 0 ? `
          <div class="notice-inline">
            <strong>분배되지 않은 월 저축액 ${formatWon(recommendationPlan.unallocatedMonthlySavings)}</strong>
            <span>선택한 최대 분배 상품 수 안에서 상품별 한도를 채운 뒤 남은 금액입니다. 최대 개수를 늘리면 추가 배분할 수 있습니다.</span>
          </div>
        ` : ""}
        <div class="allocation-list">
          ${recommendationPlan.allocations.map(renderAllocationItem).join("")}
        </div>
      </section>

      ${renderSwitchingAnalysis(report.switchingAnalysis)}

      <section class="panel">
        <h3>해야 할 일</h3>
        <ol class="action-list">
          ${report.actionItems.map((item) => `<li><strong>${item.title}</strong><span>${item.detail}</span>${item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">공식 링크</a>` : ""}</li>`).join("")}
        </ol>
      </section>

      <section class="notice">
        <p>${report.disclosure.dataNotice}</p>
        <p>${report.disclosure.advisoryNotice}</p>
      </section>
    </main>
  `);
}

function renderSwitchingAnalysis(analysis) {
  if (analysis.recommendationMode !== "switching") {
    return "";
  }

  return `
    <section class="panel">
      <h3>갈아타기 검토</h3>
      <div class="metric-row">
        <span>현재 상품 원금</span>
        <strong>${formatWon(analysis.currentPrincipal)}</strong>
      </div>
      <div class="metric-row">
        <span>그대로 유지 예상 세후 이자</span>
        <strong>${formatWon(analysis.currentAfterTaxInterest)}</strong>
      </div>
      <div class="metric-row">
        <span>대안 최적 배분 예상 혜택</span>
        <strong>${formatWon(analysis.alternativeTotalBenefit)}</strong>
      </div>
      <div class="metric-row ${analysis.estimatedGain >= 0 ? "positive" : "negative"}">
        <span>${analysis.recommendedAction === "switch" ? "갈아타기 예상 이득" : "유지 권장 차이"}</span>
        <strong>${formatSignedWon(analysis.estimatedGain)}</strong>
      </div>
    </section>
  `;
}

function renderReports() {
  const reports = getReports();
  return renderShell(`
    <main class="screen">
      <section class="result-hero compact">
        <p class="eyebrow">저장된 리포트</p>
        <h2>결제한 리포트는 여기서 다시 볼 수 있습니다.</h2>
      </section>
      <section class="report-list">
        ${reports.length === 0 ? `<p class="empty">저장된 리포트가 없습니다.</p>` : reports.map((item) => `
          <button class="report-row" data-report-id="${item.id}">
            <span>${item.id}</span>
            <strong>${item.report.summary.bestPlan} · ${formatWon(item.report.summary.bestTotalBenefit)}</strong>
            <small>${new Date(item.createdAt).toLocaleString("ko-KR")}</small>
          </button>
        `).join("")}
      </section>
    </main>
  `);
}

function renderPlanCard(plan) {
  return `
    <article class="plan-card">
      <div>
        <p>${plan.label}</p>
        <strong>${formatWon(plan.expectedTotalBenefit)}</strong>
      </div>
      <span>세후/비과세 이자 ${formatWon(plan.expectedAfterTaxInterest)} · 추가 혜택 ${formatWon(plan.additionalBenefitsTotal)}</span>
      <small>예상 최종 ${formatWon(plan.projectedEndingBalance)}</small>
    </article>
  `;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("ko-KR");
}

function formatRecommendationMode(value) {
  return value === "switching" ? "갈아타기 검토" : "새 저축 플랜";
}

function formatSignedWon(value) {
  const rounded = Math.round(Number(value) || 0);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("ko-KR")}원`;
}

function latestDataDate(report) {
  const dates = report.plans.realistic.allocations
    .map((allocation) => allocation.updatedAt)
    .filter(Boolean)
    .sort();
  return dates.at(-1) ?? "확인 필요";
}

function renderAllocationItem(allocation) {
  const amountText = allocation.type === "installment"
    ? `월 ${formatWon(allocation.monthlyAmount)}`
    : formatWon(allocation.amount);
  const uniqueAppliedConditions = uniqueLabels(allocation.appliedConditions);
  const uniquePendingConditions = uniqueLabels(
    allocation.pendingConditions.filter((condition) => !/수동\s*(검수|확인)/.test(condition)),
  );
  const applied = uniqueAppliedConditions.length
    ? uniqueAppliedConditions.join(", ")
    : "기본금리 중심";
  const pending = uniquePendingConditions.length
    ? `<small class="pending">가입 전 확인: ${uniquePendingConditions.join(", ")}</small>`
    : "";
  const additionalBenefits = allocation.additionalBenefits?.length
    ? `<small>추가 혜택: ${allocation.additionalBenefits.map((benefit) => `${benefit.label} ${formatWon(benefit.amount)}`).join(", ")}</small>`
    : "";
  const contributionSchedule = allocation.contributionFrequency
    ? `<small>납입 주기: ${formatContributionFrequency(allocation.contributionFrequency)} ${allocation.contributionCount}회 기준</small>`
    : "";
  const limitSummary = formatLimitSummary(allocation);
  const interestPolicy = formatInterestPolicy(allocation);
  const withdrawalLabel = allocation.partialWithdrawalAllowed ? "중도인출 가능" : "중도인출 불가";

  return `
    <div class="allocation-row">
      <div>
        <div class="allocation-title">
          <strong>${allocation.bank} ${allocation.productName}</strong>
          <b>만기 예상 ${formatWon(allocation.projectedMaturityAmount)}</b>
        </div>
        <span>${amountText} · 적용금리 ${allocation.appliedRate.toFixed(2)}%</span>
        <small>기본/최고 ${allocation.baseRate.toFixed(2)}% / ${allocation.maxRate.toFixed(2)}%</small>
        <small>금융권: ${allocation.financialSector ?? "확인 필요"}</small>
        <small>세후/비과세 이자: ${formatWon(allocation.expectedAfterTaxInterest)}</small>
        <small>총 예상 혜택: ${formatWon(allocation.totalExpectedBenefit)}</small>
        ${allocation.interestTaxExempt ? "<small>세금: 이자소득 비과세 반영</small>" : ""}
        ${contributionSchedule}
        ${limitSummary ? `<small>한도: ${limitSummary}</small>` : ""}
        ${interestPolicy ? `<small>계산: ${interestPolicy}</small>` : ""}
        <small>유동성: ${withdrawalLabel}</small>
        <div class="condition-chips" aria-label="반영 조건">
          ${renderConditionChips(uniqueAppliedConditions)}
          ${uniqueAppliedConditions.length ? "" : `<span class="condition-chip neutral">${applied}</span>`}
        </div>
        ${additionalBenefits}
        ${pending}
        <label class="inline-check">
          <input type="checkbox" data-exclude-product-id="${allocation.productId}" ${state.excludedProductIds.includes(allocation.productId) ? "checked" : ""} />
          <span>이미 사용 중 또는 해당 조건 충족 안됨</span>
        </label>
      </div>
    </div>
  `;
}

function formatContributionFrequency(value) {
  const labels = { daily: "매일", weekly: "매주", monthly: "매월" };
  return labels[value] ?? value;
}

function renderConditionChips(conditions) {
  return uniqueLabels(conditions).map((condition) => `<span class="condition-chip">${condition}</span>`).join("");
}

function uniqueLabels(labels) {
  return [...new Set(labels.map((label) => String(label ?? "").trim()).filter(Boolean))];
}

function formatLimitSummary(allocation) {
  const limits = [];
  if (allocation.minAmount) limits.push(`최소 ${formatWon(allocation.minAmount)}`);
  if (allocation.maxAmountLimit) limits.push(`최대 ${formatWon(allocation.maxAmountLimit)}`);
  if (allocation.minMonthlyAmount) limits.push(`월 최소 ${formatWon(allocation.minMonthlyAmount)}`);
  if (allocation.monthlyLimit) limits.push(`월 최대 ${formatWon(allocation.monthlyLimit)}`);
  if (allocation.perContributionMinAmount) limits.push(`1회 최소 ${formatWon(allocation.perContributionMinAmount)}`);
  if (allocation.perContributionMaxAmount) limits.push(`1회 최대 ${formatWon(allocation.perContributionMaxAmount)}`);
  if (allocation.dailyContributionLimit) limits.push(`1일 ${formatWon(allocation.dailyContributionLimit)}`);
  if (allocation.weeklyContributionLimit) limits.push(`1주 ${formatWon(allocation.weeklyContributionLimit)}`);
  if (allocation.annualContributionLimit) limits.push(`연 ${formatWon(allocation.annualContributionLimit)}`);
  if (allocation.totalContributionLimit) limits.push(`총 ${formatWon(allocation.totalContributionLimit)}`);
  return limits.join(" · ");
}

function formatInterestPolicy(allocation) {
  const method = allocation.type === "installment" && allocation.interestCalculationMethod !== "compound"
    ? "적금 회차별 단리"
    : (allocation.interestCalculationMethod === "compound" ? "복리" : "단리");
  const payoutLabels = { maturity: "만기 지급", monthly: "매월 지급", daily: "매일 지급" };
  const payout = payoutLabels[allocation.interestPayoutType] ?? "만기 지급";
  const rounding = allocation.interestRoundingMode === "floor" && allocation.interestRoundingUnit > 1
    ? `${allocation.interestRoundingUnit}원 단위 절사`
    : "";
  return [method, payout, rounding].filter(Boolean).join(" · ");
}

function moneyInput(name, label, value, placeholder = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" inputmode="numeric" value="${value}" placeholder="${placeholder}" /></label>`;
}

function numberInput(name, label, value, step = "1") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="number" step="${step}" value="${value}" /></label>`;
}

function selectInput(name, label, value, options, scope = "quick") {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${name}" data-scope="${scope}">
        ${options.map(([optionValue, text]) => `<option value="${optionValue}" ${String(value) === String(optionValue) ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

function segmented(name, label, value, options) {
  return `
    <fieldset class="segmented">
      <legend>${label}</legend>
      ${options.map(([optionValue, text]) => `
        <label>
          <input type="radio" name="${name}" value="${optionValue}" ${value === optionValue ? "checked" : ""} />
          <span>${text}</span>
        </label>
      `).join("")}
    </fieldset>
  `;
}

function toggle(name, label, checked) {
  return `<label class="toggle"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
}

function profileToggle(name, label) {
  return toggle(`personalEligibility.${name}`, label, state.detail.personalEligibility[name]);
}

function regionOptions() {
  return [
    ["", "지역 제한 상품 제외"],
    ["seoul", "서울"],
    ["busan", "부산"],
    ["daegu", "대구"],
    ["incheon", "인천"],
    ["gwangju", "광주"],
    ["daejeon", "대전"],
    ["ulsan", "울산"],
    ["sejong", "세종"],
    ["gyeonggi", "경기"],
    ["gangwon", "강원"],
    ["chungbuk", "충북"],
    ["chungnam", "충남"],
    ["jeonbuk", "전북"],
    ["jeonnam", "전남"],
    ["gyeongbuk", "경북"],
    ["gyeongnam", "경남"],
    ["jeju", "제주"],
  ];
}

function bindEvents() {
  document.querySelector("#quickForm")?.addEventListener("submit", handleSubmitQuick);
  document.querySelector("#payForm")?.addEventListener("submit", handlePay);

  document.querySelectorAll("input, select").forEach((input) => {
    const updateField = (event) => {
      const target = event.target;
      if (target.dataset.excludeProductId || !target.name) return;
      const isDetail = target.closest("#payForm") || target.dataset.scope === "detail";
      const value = target.type === "checkbox" ? target.checked : target.value;
      if (isDetail) setDetailField(target.name, value);
      else setQuickField(target.name, value);
    };
    input.addEventListener("input", updateField);
    input.addEventListener("change", updateField);
  });

  document.querySelectorAll("[data-exclude-product-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const productId = checkbox.dataset.excludeProductId;
      const ids = new Set(state.excludedProductIds);
      if (checkbox.checked) ids.add(productId);
      else ids.delete(productId);
      state.excludedProductIds = [...ids];

      if (!state.accessToken) {
        state.paymentError = "저장된 결제 접근 토큰이 없어 재계산할 수 없습니다. 새 분석을 결제해 주세요.";
        render();
        return;
      }

      try {
        const result = await postJson("/api/reports/recalculate", {
          accessToken: state.accessToken,
          excludedProductIds: state.excludedProductIds,
        });
        state.paidReport = result.report;
        state.paymentError = "";
      } catch (error) {
        state.paymentError = error.message;
      }
      state.view = "report";
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (state.view === "quick") {
        state.paidReport = null;
        state.accessToken = null;
        state.excludedProductIds = [];
        state.paymentError = "";
      }
      render();
    });
  });

  document.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const saved = getReports().find((item) => item.id === button.dataset.reportId);
      if (saved) {
        state.paidReport = saved.report;
        state.accessToken = saved.accessToken ?? null;
        state.view = "report";
        render();
      }
    });
  });
}

function render() {
  const views = {
    quick: renderQuick,
    detail: renderDetail,
    report: renderReport,
    reports: renderReports,
  };
  app.innerHTML = views[state.view]();
  bindEvents();
}

render();
