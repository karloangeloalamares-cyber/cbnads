import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
const glob = fg.glob || fg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appApiDir = path.resolve(root, "src/app/api");
const outputApiDir = path.resolve(root, "api");

async function run() {
  console.log("Consolidating Vercel API functions...");

  // 1. Find all route files
  const routeFiles = await glob("**/route.{ts,js}", { cwd: appApiDir });

  if (routeFiles.length === 0) {
    console.log("No API routes found.");
    return;
  }

  const imports = [];
  const routeMap = [];

  for (let i = 0; i < routeFiles.length; i++) {
    const file = routeFiles[i];
    const importPath = `../src/app/api/${file.replace(/\\/g, "/")}`; // posix paths
    const varName = `route_${i}`;

    // Compute the route path e.g. "invoices/create" or "invoices/[id]"
    let routePath = path.dirname(file).replace(/\\/g, "/");
    if (routePath === ".") routePath = "";

    // Convert React Router syntax to URL patterns (e.g. $[id] -> :id or just leave as is for matching)
    // Actually we can do an exact match or simple RegExp match

    // Convert path to regex or simple param extraction
    // "invoices/$id" -> /^\/api\/invoices\/([^\/]+)$/
    let regexStr = "^/api" + (routePath ? "/" + routePath : "");
    regexStr = regexStr.replace(/\$([a-zA-Z0-9_]+)/g, "(?<$1>[^/]+)");
    regexStr += "$";

    imports.push(`import * as ${varName} from "${importPath}";`);
    routeMap.push(`  { regex: new RegExp(${JSON.stringify(regexStr)}), module: ${varName} }`);
  }

  const code = `// AUTO-GENERATED: Consolidates all React Router APIs into a single Vercel Serverless Function
${imports.join("\n")}
import { handleRouteRequest } from "../vercel-api/adapter.js";

const routes = [
${routeMap.join(",\n")}
];

export default async function handler(req, res) {
  // Parse URL to get pathname
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", \`\${proto}://\${host}\`);
  let pathname = url.pathname;
  if (!pathname.startsWith("/api")) {
      pathname = "/api" + (pathname === "/" ? "" : pathname);
  }

  // Find matching route
  for (const route of routes) {
    const match = route.regex.exec(pathname);
    if (match) {
      const params = match.groups || {};
      return handleRouteRequest(req, res, route.module, params);
    }
  }

  // No match
  res.statusCode = 404;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "API Route Not Found" }));
}
`;

  // 2. Clear out existing apps/web/api directory (except adapter.js if it's there, but it's in vercel-api)
  const existingFiles = await fs.readdir(outputApiDir);
  for (const file of existingFiles) {
    const fullPath = path.join(outputApiDir, file);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  // 3. Write api/index.js
  await fs.writeFile(path.join(outputApiDir, "index.js"), code, "utf8");

  console.log("Successfully generated single api/index.js Vercel function.");
}

run().catch(console.error);
