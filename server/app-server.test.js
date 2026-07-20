import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app-server.js", import.meta.url), "utf8");

test("server starts without eagerly importing the large product catalog", () => {
  assert.doesNotMatch(source, /import \{ SAMPLE_PRODUCTS \}/);
  assert.doesNotMatch(source, /from "\.\.\/src\/lib\/products\.js"/);
  assert.match(source, /async function createServerPaidReport/);
  assert.match(source, /await import\("\.\.\/src\/lib\/products\.js"\)/);
});

test("production server defaults to binding all interfaces for deployment platforms", () => {
  assert.match(source, /process\.env\.NODE_ENV === "production" \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
});

test("server exposes paid report feedback API and persists it outside source control", () => {
  assert.match(source, /feedbackStorePath/);
  assert.match(source, /report-feedback\.json/);
  assert.match(source, /\/api\/feedback/);
  assert.match(source, /submitReportFeedback/);
  assert.match(source, /persistFeedbackStore/);
});
