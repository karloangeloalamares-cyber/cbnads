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

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
});

async function simulate() {
    // Try to query the table directly using the REST API, overriding the auth role using the service key
    const { data, error } = await supabase.rpc('cbnads_web_is_internal_user');
    console.log("Current user role internal?", data, error);
}

simulate();
