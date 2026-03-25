import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const cwd = process.cwd();

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const trimmed = token.slice(2);
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex >= 0) {
      const key = trimmed.slice(0, equalsIndex);
      const value = trimmed.slice(equalsIndex + 1);
      result[key] = value;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[trimmed] = "true";
      continue;
    }

    result[trimmed] = next;
    index += 1;
  }

  return result;
}

function stripWrappingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1));
    process.env[key] = value;
  }
}

function envBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function envInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPositiveInteger(value, fallback) {
  const parsed = envInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function ensureDateOnly(value, label) {
  const text = String(value || "").trim().slice(0, 10);
  if (!text) {
    throw new Error(`${label} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return text;
}

function addDays(dateOnly, offset) {
  const base = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(base.valueOf())) {
    throw new Error(`Invalid date: ${dateOnly}`);
  }
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function percentile(values, target) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(target * sorted.length) - 1));
  return sorted[index];
}

function sampleItems(items, limit = 5) {
  return items.slice(0, limit);
}

function printUsage() {
  console.log(`
Usage:
  node ./scripts/stress-create-ads.mjs [options]

Core options:
  --base-url <url>             Base URL, default http://localhost:3000
  --endpoint <path>            API path, default /api/ads/create
  --token <jwt>                Bearer token for an internal user
  --cookie <header>            Session cookie header instead of bearer token
  --requests <n>               Total requests, default 50
  --concurrency <n>            Parallel workers, default 10
  --mode <unique|collide>      unique spreads dates, collide reuses the same payload
  --timeout-ms <n>             Per-request timeout, default 30000

Payload options:
  --body-file <path>           JSON file used as the base request body
  --advertiser <name>          Required if body-file omitted
  --advertiser-id <uuid>       Optional advertiser id
  --product-id <uuid>          Optional product id
  --ad-name <name>             Base ad name
  --placement <name>           Default Standard
  --payment <name>             Default Pending
  --status <name>              Default Draft
  --post-type <type>           one_time, daily_run, or custom_schedule
  --schedule-date <date>       Base date for one_time
  --post-date-from <date>      Base start date for daily_run
  --post-date-to <date>        Base end date for daily_run
  --post-time <time>           Optional time like 09:30 or 09:30:00
  --skip-duplicate-check       Sends skip_duplicate_check: true

Examples:
  node ./scripts/stress-create-ads.mjs --token "$TOKEN" --advertiser "Acme" --ad-name "Load Test" --placement Standard --post-type one_time --schedule-date 2026-04-01 --requests 100 --concurrency 20 --mode unique

  node ./scripts/stress-create-ads.mjs --cookie "sb=..." --body-file ./tmp/ad.json --requests 25 --concurrency 25 --mode collide --skip-duplicate-check
`.trim());
}

loadEnvFile(path.join(cwd, ".env.local"));
loadEnvFile(path.join(cwd, ".env"));

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printUsage();
  process.exit(0);
}

const baseUrl = String(
  args["base-url"] ||
    process.env.STRESS_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000",
).trim();
const endpoint = String(args.endpoint || process.env.STRESS_ENDPOINT || "/api/ads/create").trim();
const token = String(
  args.token || process.env.STRESS_BEARER_TOKEN || process.env.STRESS_TOKEN || "",
).trim();
const cookie = String(args.cookie || process.env.STRESS_COOKIE || "").trim();
const requests = asPositiveInteger(
  args.requests || process.env.STRESS_REQUESTS,
  50,
);
const concurrency = asPositiveInteger(
  args.concurrency || process.env.STRESS_CONCURRENCY,
  10,
);
const timeoutMs = asPositiveInteger(
  args["timeout-ms"] || process.env.STRESS_TIMEOUT_MS,
  30_000,
);
const mode = String(args.mode || process.env.STRESS_MODE || "unique")
  .trim()
  .toLowerCase();
const runId = randomUUID().slice(0, 8);
const skipDuplicateCheck = envBoolean(
  args["skip-duplicate-check"] ?? process.env.STRESS_SKIP_DUPLICATE_CHECK,
  false,
);

if (!["unique", "collide"].includes(mode)) {
  throw new Error(`Unsupported mode "${mode}". Use "unique" or "collide".`);
}

if (!token && !cookie) {
  throw new Error("Provide --token or --cookie so the request is authorized.");
}

const bodyFile = String(args["body-file"] || process.env.STRESS_BODY_FILE || "").trim();

function buildBasePayload() {
  if (bodyFile) {
    const fullPath = path.resolve(cwd, bodyFile);
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  }

  const postType = String(args["post-type"] || process.env.STRESS_POST_TYPE || "one_time")
    .trim()
    .toLowerCase();
  const advertiser = String(args.advertiser || process.env.STRESS_ADVERTISER || "").trim();
  if (!advertiser) {
    throw new Error("--advertiser is required when --body-file is omitted.");
  }

  const payload = {
    ad_name: String(args["ad-name"] || process.env.STRESS_AD_NAME || "Stress Test Ad").trim(),
    advertiser,
    advertiser_id: String(
      args["advertiser-id"] || process.env.STRESS_ADVERTISER_ID || "",
    ).trim() || undefined,
    product_id: String(args["product-id"] || process.env.STRESS_PRODUCT_ID || "").trim() || undefined,
    placement: String(args.placement || process.env.STRESS_PLACEMENT || "Standard").trim(),
    payment: String(args.payment || process.env.STRESS_PAYMENT || "Pending").trim(),
    status: String(args.status || process.env.STRESS_STATUS || "Draft").trim(),
    post_type: postType,
    post_time: String(args["post-time"] || process.env.STRESS_POST_TIME || "").trim() || undefined,
    media: [],
    ad_text: String(
      args["ad-text"] || process.env.STRESS_AD_TEXT || `Stress run ${runId}`,
    ).trim(),
  };

  if (postType === "one_time") {
    const date = ensureDateOnly(
      args["schedule-date"] || process.env.STRESS_SCHEDULE_DATE,
      "schedule-date",
    );
    payload.schedule = date;
  } else if (postType === "daily_run") {
    payload.post_date_from = ensureDateOnly(
      args["post-date-from"] || process.env.STRESS_POST_DATE_FROM,
      "post-date-from",
    );
    payload.post_date_to = ensureDateOnly(
      args["post-date-to"] || process.env.STRESS_POST_DATE_TO,
      "post-date-to",
    );
  } else if (postType === "custom_schedule") {
    const customDatesArg = String(
      args["custom-dates"] || process.env.STRESS_CUSTOM_DATES || "",
    ).trim();
    if (customDatesArg) {
      payload.custom_dates = customDatesArg
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((date) => ({
          date: ensureDateOnly(date, "custom-dates"),
          ...(payload.post_time ? { time: payload.post_time } : {}),
          reminder: "15-min",
        }));
    } else {
      const date = ensureDateOnly(
        args["schedule-date"] || process.env.STRESS_SCHEDULE_DATE,
        "schedule-date",
      );
      payload.custom_dates = [
        {
          date,
          ...(payload.post_time ? { time: payload.post_time } : {}),
          reminder: "15-min",
        },
      ];
    }
  } else {
    throw new Error(`Unsupported post type "${postType}".`);
  }

  return payload;
}

const basePayload = buildBasePayload();

function mutatePayloadForRequest(index) {
  const payload = structuredClone(basePayload);
  const sequence = index + 1;

  payload.ad_name = String(payload.ad_name || "Stress Test Ad").trim();
  payload.ad_text = String(payload.ad_text || "").trim() || `Stress run ${runId}`;

  if (skipDuplicateCheck) {
    payload.skip_duplicate_check = true;
  }

  if (mode === "unique") {
    payload.ad_name = `${payload.ad_name} #${sequence} [${runId}]`;

    const postType = String(payload.post_type || "").trim().toLowerCase();
    if (postType === "one_time") {
      const seedDate = ensureDateOnly(
        payload.schedule || payload.post_date_from || payload.post_date,
        "schedule",
      );
      const shiftedDate = addDays(seedDate, index);
      payload.schedule = shiftedDate;
      payload.post_date_from = shiftedDate;
      payload.post_date = shiftedDate;
    } else if (postType === "daily_run") {
      const startDate = ensureDateOnly(payload.post_date_from, "post_date_from");
      const endDate = ensureDateOnly(payload.post_date_to, "post_date_to");
      payload.post_date_from = addDays(startDate, index);
      payload.post_date_to = addDays(endDate, index);
    } else if (postType === "custom_schedule") {
      payload.custom_dates = (Array.isArray(payload.custom_dates) ? payload.custom_dates : []).map(
        (entry) => {
          if (entry && typeof entry === "object") {
            return {
              ...entry,
              date: addDays(ensureDateOnly(entry.date, "custom date"), index),
            };
          }
          return addDays(ensureDateOnly(entry, "custom date"), index);
        },
      );
    }
  }

  return payload;
}

const url = new URL(endpoint, baseUrl).toString();
const headers = {
  "content-type": "application/json",
};
if (token) {
  headers.authorization = `Bearer ${token}`;
}
if (cookie) {
  headers.cookie = cookie;
}

async function executeRequest(index) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  const payload = mutatePayloadForRequest(index);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let body = null;
    try {
      body = responseText ? JSON.parse(responseText) : null;
    } catch {
      body = { raw: responseText };
    }

    const latencyMs = performance.now() - startedAt;
    return {
      index,
      ok: response.ok,
      status: response.status,
      latencyMs,
      adId: body?.ad?.id || null,
      warning: body?.warning === true,
      deduplicated: body?.deduplicated === true || body?.created === false,
      created: body?.created === true || (response.ok && body?.ad?.id && body?.warning !== true),
      message:
        body?.error ||
        body?.message ||
        body?.warning ||
        body?.raw ||
        null,
      body,
      payload,
    };
  } catch (error) {
    const latencyMs = performance.now() - startedAt;
    return {
      index,
      ok: false,
      status: 0,
      latencyMs,
      adId: null,
      warning: false,
      deduplicated: false,
      created: false,
      message: error?.name === "AbortError" ? "Request timed out" : String(error?.message || error),
      body: null,
      payload,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runPool() {
  const results = new Array(requests);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= requests) {
        return;
      }

      results[current] = await executeRequest(current);
      completed += 1;

      if (completed % Math.max(1, Math.floor(requests / 10)) === 0 || completed === requests) {
        console.log(`Progress ${completed}/${requests}`);
      }
    }
  }

  const workerCount = Math.min(concurrency, requests);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

console.log("Starting ad creation stress test");
console.log(
  JSON.stringify(
    {
      url,
      mode,
      requests,
      concurrency: Math.min(concurrency, requests),
      timeoutMs,
      skipDuplicateCheck,
      bodyFile: bodyFile || null,
      basePayloadPreview: {
        ...basePayload,
        media: Array.isArray(basePayload.media) ? `[${basePayload.media.length} items]` : basePayload.media,
      },
    },
    null,
    2,
  ),
);

const suiteStartedAt = performance.now();
const results = await runPool();
const suiteDurationMs = performance.now() - suiteStartedAt;

const latencies = results.map((item) => item.latencyMs);
const created = results.filter((item) => item.created === true && item.adId);
const warnings = results.filter((item) => item.warning);
const deduplicated = results.filter((item) => item.deduplicated === true);
const failed = results.filter((item) => !item.ok && !item.warning);
const uniqueCreatedAdIds = [...new Set(created.map((item) => item.adId))];
const uniqueReferencedAdIds = [...new Set(results.map((item) => item.adId).filter(Boolean))];
const statusCounts = results.reduce((accumulator, item) => {
  const key = String(item.status);
  accumulator[key] = (accumulator[key] || 0) + 1;
  return accumulator;
}, {});
const failureSamples = sampleItems(
  failed.map((item) => ({
    index: item.index + 1,
    status: item.status,
    message: item.message,
  })),
);
const warningSamples = sampleItems(
  warnings.map((item) => ({
    index: item.index + 1,
    status: item.status,
    message: item.message,
  })),
);
const dedupSamples = sampleItems(
  deduplicated.map((item) => ({
    index: item.index + 1,
    status: item.status,
    adId: item.adId,
    message: item.message,
  })),
);

console.log("\nSummary");
console.log(
  JSON.stringify(
    {
      runId,
      createdResponses: created.length,
      warnings: warnings.length,
      deduplicatedResponses: deduplicated.length,
      failed: failed.length,
      uniqueCreatedAdIds: uniqueCreatedAdIds.length,
      uniqueReferencedAdIds: uniqueReferencedAdIds.length,
      statusCounts,
      durationMs: Math.round(suiteDurationMs),
      requestsPerSecond:
        suiteDurationMs > 0 ? Number(((results.length * 1000) / suiteDurationMs).toFixed(2)) : 0,
      latencyMs: {
        min: latencies.length > 0 ? Math.round(Math.min(...latencies)) : 0,
        p50: Math.round(percentile(latencies, 0.5)),
        p95: Math.round(percentile(latencies, 0.95)),
        max: latencies.length > 0 ? Math.round(Math.max(...latencies)) : 0,
      },
      failureSamples,
      warningSamples,
      dedupSamples,
      createdAdIdsSample: sampleItems(uniqueCreatedAdIds, 10),
      referencedAdIdsSample: sampleItems(uniqueReferencedAdIds, 10),
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  process.exitCode = 1;
}
