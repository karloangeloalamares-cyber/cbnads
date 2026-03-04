// Test: try importing api/index.js to find any import-time crash
import { readFileSync } from "fs";

// Load .env.local
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
}

try {
    await import("./api/index.js");
    console.log("✅ api/index.js loaded successfully (no import-time errors)");
} catch (e) {
    console.error("💥 CRASH loading api/index.js:");
    console.error(e.message);
    if (e.stack) {
        const lines = e.stack.split("\n").slice(0, 15);
        console.error(lines.join("\n"));
    }
}
