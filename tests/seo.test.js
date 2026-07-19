import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("site exposes crawlable SEO basics for search engines", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");

  assert.match(index, /rel="canonical"/);
  assert.match(index, /og:title/);
  assert.match(index, /savings-optimizer\.onrender\.com/);
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/savings-optimizer\.onrender\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/savings-optimizer\.onrender\.com\/<\/loc>/);
});
