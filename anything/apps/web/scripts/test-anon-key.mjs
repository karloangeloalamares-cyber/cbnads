import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const text = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey);

async function test() {
    const { data, error } = await supabase.from("cbnads_web_advertisers").select("*");
    console.log("Advertisers count:", data?.length);
    console.log("Error:", error);
}

test();
