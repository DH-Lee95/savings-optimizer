import { createHash, randomUUID } from "node:crypto";

function feedbackError(code, message, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.detail = message;
  return error;
}

function tokenHash(accessToken) {
  return createHash("sha256")
    .update(String(accessToken ?? ""))
    .digest("hex");
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw feedbackError("INVALID_COUPON_EMAIL", "무료 이용권 추첨 안내를 받을 이메일을 정확히 입력해 주세요.");
  }
  return email;
}

function normalizeMessage(value) {
  const message = String(value ?? "").trim().replace(/\s+/g, " ");
  if (message.length < 5) {
    throw feedbackError("INVALID_FEEDBACK_MESSAGE", "개선 의견을 5자 이상 입력해 주세요.");
  }
  return message.slice(0, 1000);
}

function publicFeedback(feedback) {
  return {
    id: feedback.id,
    reportId: feedback.reportId,
    couponEmail: feedback.couponEmail,
    message: feedback.message,
    accessTokenHash: feedback.accessTokenHash,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}

export function createFeedbackStore(seed = []) {
  const feedbackByReport = new Map(seed.map((item) => [item.reportId, { ...item }]));

  return {
    upsert(feedback) {
      const current = feedbackByReport.get(feedback.reportId);
      const next = current
        ? { ...current, ...feedback, id: current.id, createdAt: current.createdAt }
        : { ...feedback };
      feedbackByReport.set(next.reportId, next);
      return { ...next };
    },
    all() {
      return [...feedbackByReport.values()].map((item) => ({ ...item }));
    },
  };
}

export function submitReportFeedback(feedbackStore, accessStore, {
  accessToken,
  reportId,
  couponEmail,
  message,
}) {
  const entitlement = accessStore.get(accessToken);
  if (!entitlement) throw feedbackError("INVALID_ACCESS_TOKEN", "유효하지 않은 결제 접근 토큰입니다.", 401);
  if (entitlement.status !== "paid") throw feedbackError("PAYMENT_NOT_CONFIRMED", "결제가 확인되지 않았습니다.", 402);
  if (!entitlement.consumedAt || !entitlement.reportId) {
    throw feedbackError("REPORT_NOT_CREATED", "먼저 결제 리포트를 생성해야 피드백을 남길 수 있습니다.", 409);
  }
  if (String(reportId ?? "") !== entitlement.reportId) {
    throw feedbackError("REPORT_MISMATCH", "결제 리포트와 피드백 대상이 일치하지 않습니다.", 409);
  }

  const now = new Date().toISOString();
  const feedback = feedbackStore.upsert({
    id: randomUUID(),
    reportId: entitlement.reportId,
    entitlementId: entitlement.id,
    orderId: entitlement.orderId,
    productCode: entitlement.productCode,
    accessTokenHash: tokenHash(accessToken),
    couponEmail: normalizeEmail(couponEmail),
    message: normalizeMessage(message),
    createdAt: now,
    updatedAt: now,
  });

  return {
    feedback: publicFeedback(feedback),
  };
}

export function serializeFeedbackStore(store) {
  return store.all();
}
