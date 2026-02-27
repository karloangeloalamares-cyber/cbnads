import { runWithRequestContext } from "../src/app/api/utils/request-context.js";

const readRequestBody = async (req) => {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
};

const toWebRequest = async (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, String(entry));
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const method = String(req.method || "GET").toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);

  return new Request(url.toString(), {
    method,
    headers,
    body,
  });
};

const writeJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const toPlainParams = (params = {}) => {
  const output = {};
  for (const [key, value] of Object.entries(params)) {
    output[key] = Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return output;
};

export const handleRouteRequest = async (
  req,
  res,
  routeModule,
  params = {},
) => {
  const method = String(req.method || "GET").toUpperCase();
  const handler = routeModule?.[method];

  if (!handler) {
    writeJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  try {
    const request = await toWebRequest(req);
    const response = await runWithRequestContext(request, () =>
      handler(request, { params: toPlainParams(params) }),
    );

    if (!(response instanceof Response)) {
      writeJson(res, 500, { error: "Route handler must return a Response" });
      return;
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  } catch (error) {
    console.error("[api-adapter] route execution error", error);
    writeJson(res, 500, { error: "Internal Server Error" });
  }
};

