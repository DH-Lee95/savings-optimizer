const HEADER_MAP = {
  금융회사: "bankName",
  금융사: "bankName",
  은행: "bankName",
  상품명: "productName",
  상품유형: "productType",
  상품종류: "productType",
  기본금리: "baseRateText",
  최고금리: "maxRateText",
  기간: "termText",
  가입기간: "termText",
  최고한도: "maxAmountText",
  가입한도: "maxAmountText",
  월납입한도: "monthlyLimitText",
  가입채널: "channelText",
  예금자보호: "protectionText",
  우대조건: "conditionText",
  공식URL: "officialUrl",
  공식링크: "officialUrl",
  상세URL: "sourceUrl",
};

export function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const [headers = [], ...records] = rows;
  return records.map((record) => {
    const parsed = {};
    headers.forEach((header, index) => {
      parsed[header.trim()] = (record[index] ?? "").trim();
    });
    return parsed;
  });
}

function mapRow(row, scrapedAt) {
  const raw = {
    source: "fss-csv",
    scrapedAt,
    reviewStatus: "pending",
  };

  for (const [header, value] of Object.entries(row)) {
    const key = HEADER_MAP[header.trim()];
    if (!key) continue;
    raw[key] = value;
  }

  raw.sourceUrl = raw.sourceUrl || raw.officialUrl;
  return raw;
}

export function parseFssCsv(csvText, options = {}) {
  const scrapedAt = options.scrapedAt ?? new Date().toISOString().slice(0, 10);
  return parseCsv(csvText)
    .map((row) => mapRow(row, scrapedAt))
    .filter((product) => product.bankName && product.productName);
}
