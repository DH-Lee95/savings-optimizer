import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAID_PRODUCT,
  consumePaidReportAccess,
  createPaidAccessStore,
  createPaidCheckout,
  recalculatePaidReport,
  serializePaidAccessStore,
} from "../src/server/paid-access.js";
import {
  createFeedbackStore,
  serializeFeedbackStore,
  submitReportFeedback,
} from "../src/server/feedback.js";

const rootDir = join(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDir = join(rootDir, "data", "runtime");
const accessStorePath = join(runtimeDir, "paid-access.json");
const feedbackStorePath = join(runtimeDir, "report-feedback.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function loadAccessSeed() {
  if (!existsSync(accessStorePath)) return [];
  try {
    return JSON.parse(readFileSync(accessStorePath, "utf8"));
  } catch {
    return [];
  }
}

function loadFeedbackSeed() {
  if (!existsSync(feedbackStorePath)) return [];
  try {
    return JSON.parse(readFileSync(feedbackStorePath, "utf8"));
  } catch {
    return [];
  }
}

const accessStore = createPaidAccessStore(loadAccessSeed());
const feedbackStore = createFeedbackStore(loadFeedbackSeed());

function persistAccessStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(accessStorePath, `${JSON.stringify(serializePaidAccessStore(accessStore), null, 2)}\n`);
}

function persistFeedbackStore() {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(feedbackStorePath, `${JSON.stringify(serializeFeedbackStore(feedbackStore), null, 2)}\n`);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function paymentMode() {
  if (process.env.PAYMENT_MODE) return process.env.PAYMENT_MODE;
  return process.env.NODE_ENV === "production" ? "pending" : "mock";
}

async function createServerPaidReport(input) {
  const [{ createPaidReport }, { SAMPLE_PRODUCTS }] = await Promise.all([
    import("../src/lib/optimizer.js"),
    import("../src/lib/products.js"),
  ]);
  return createPaidReport(input, SAMPLE_PRODUCTS);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/product") {
    sendJson(response, 200, { product: PAID_PRODUCT, paymentMode: paymentMode() });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/checkout") {
    const body = await readJsonBody(request);
    const result = createPaidCheckout(accessStore, {
      email: body.email,
      input: body.input,
      mode: paymentMode(),
    });
    persistAccessStore();
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/reports") {
    const body = await readJsonBody(request);
    const result = await consumePaidReportAccess(accessStore, {
      accessToken: body.accessToken,
      input: body.input,
      excludedProductIds: body.excludedProductIds ?? [],
      createReport: createServerPaidReport,
    });
    persistAccessStore();
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/reports/recalculate") {
    const body = await readJsonBody(request);
    const result = await recalculatePaidReport(accessStore, {
      accessToken: body.accessToken,
      excludedProductIds: body.excludedProductIds ?? [],
      createReport: createServerPaidReport,
    });
    persistAccessStore();
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readJsonBody(request);
    const result = submitReportFeedback(feedbackStore, accessStore, {
      accessToken: body.accessToken,
      reportId: body.reportId,
      couponEmail: body.couponEmail,
      message: body.message,
    });
    persistFeedbackStore();
    sendJson(response, 200, result);
    return true;
  }

  return false;
}

function serveStatic(response, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(rootDir, normalizedPath);
  const relativePath = relative(rootDir, absolutePath);

  if (relativePath.startsWith("..") || relativePath.includes("node_modules")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  if (!existsSync(absolutePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const extension = extname(absolutePath);
  response.writeHead(200, {
    "content-type": contentTypes[extension] ?? "application/octet-stream",
  });
  response.end(readFileSync(absolutePath));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) return;
    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.status ?? 500, {
      error: error.code ?? "SERVER_ERROR",
      message: error.detail ?? "요청을 처리하지 못했습니다.",
    });
  }
});

const port = Number(process.env.PORT ?? 3002);
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

server.listen(port, host, () => {
  console.log(`Savings optimizer server listening at http://${host}:${port}`);
});
