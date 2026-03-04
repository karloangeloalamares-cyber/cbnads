import { readFileSync } from "fs";
import { readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load .env.local
const envFile = readFileSync(path.join(root, ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
}

async function* findRoutes(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* findRoutes(full);
        } else if (entry.name === "route.js") {
            yield full;
        }
    }
}

const apiDir = path.join(root, "src/app/api");
const failed = [];

for await (const routeFile of findRoutes(apiDir)) {
    const rel = path.relative(root, routeFile).replace(/\\/g, "/");
    try {
        await import(routeFile);
    } catch (e) {
        failed.push({ file: rel, error: e.message });
        process.stdout.write(`❌ ${rel}\n   ${e.message}\n`);
    }
}

if (failed.length === 0) {
    console.log("✅ All route modules loaded without errors.");
} else {
    console.log(`\n${failed.length} route(s) failed to import.`);
}
