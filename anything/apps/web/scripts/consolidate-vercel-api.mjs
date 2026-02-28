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
  const routeEntries = [];

  const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");

  const buildRouteRegex = (routePath) => {
    if (!routePath) return "^/api$";

    const segments = routePath.split("/").filter(Boolean);
    const pattern = segments
      .map((segment) => {
        const catchAllMatch = segment.match(/^\[\.\.\.([^\]]+)\]$/);
        if (catchAllMatch) {
          return `(?<${catchAllMatch[1]}>.+)`;
        }

        const dynamicMatch = segment.match(/^\[([^\]]+)\]$/);
        if (dynamicMatch) {
          return `(?<${dynamicMatch[1]}>[^/]+)`;
        }

        return escapeRegex(segment);
      })
      .join("/");

    return `^/api/${pattern}$`;
  };

  const routeSpecificity = (routePath) => {
    const segments = routePath ? routePath.split("/").filter(Boolean) : [];
    const dynamicSegments = segments.filter((segment) => /^\[.*\]$/.test(segment)).length;
    const catchAllSegments = segments.filter((segment) => /^\[\.\.\..+\]$/.test(segment)).length;
    const staticSegments = segments.length - dynamicSegments;
    const literalLength = segments.join("/").length;

    return {
      segmentCount: segments.length,
      staticSegments,
      dynamicSegments,
      catchAllSegments,
      literalLength,
    };
  };

  for (let i = 0; i < routeFiles.length; i++) {
    const file = routeFiles[i];
    const importPath = `../src/app/api/${file.replace(/\\/g, "/")}`; // posix paths
    const varName = `route_${i}`;

    // Compute the route path e.g. "invoices/create" or "invoices/[id]"
    let routePath = path.dirname(file).replace(/\\/g, "/");
    if (routePath === ".") routePath = "";

    imports.push(`import * as ${varName} from "${importPath}";`);
    routeEntries.push({
      routePath,
      routeMapLine: `  { regex: new RegExp(${JSON.stringify(buildRouteRegex(routePath))}), module: ${varName} }`,
      ...routeSpecificity(routePath),
    });
  }

  routeEntries.sort((left, right) => {
    if (left.segmentCount !== right.segmentCount) {
      return right.segmentCount - left.segmentCount;
    }

    if (left.staticSegments !== right.staticSegments) {
      return right.staticSegments - left.staticSegments;
    }

    if (left.dynamicSegments !== right.dynamicSegments) {
      return left.dynamicSegments - right.dynamicSegments;
    }

    if (left.catchAllSegments !== right.catchAllSegments) {
      return left.catchAllSegments - right.catchAllSegments;
    }

    return right.literalLength - left.literalLength;
  });

  const code = `// AUTO-GENERATED: Consolidates all React Router APIs into a single Vercel Serverless Function
${imports.join("\n")}
import { handleRouteRequest } from "../vercel-api/adapter.js";

const routes = [
${routeEntries.map((entry) => entry.routeMapLine).join(",\n")}
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

  // 2. Ensure the output directory exists.
  await fs.mkdir(outputApiDir, { recursive: true });

  // 3. Write api/index.js in place. Deleting first causes file-lock failures on
  // Windows when the dev server has the file open for reads.
  await fs.writeFile(path.join(outputApiDir, "index.js"), code, "utf8");

  console.log("Successfully generated single api/index.js Vercel function.");
}

run().catch(console.error);
