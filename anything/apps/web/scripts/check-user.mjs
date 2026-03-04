import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually
const envFile = readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
}

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
});

const USER_ID = "a6e9d383-2269-4336-9c91-23e8caac4229";

async function main() {
    console.log(`Checking user: ${USER_ID}\n`);

    // Check Supabase Auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(USER_ID);
    if (authError) {
        console.error("Auth lookup error:", authError.message);
    } else if (authUser.user) {
        console.log("Auth user found:");
        console.log("  Email:", authUser.user.email);
        console.log("  Role (auth metadata):", authUser.user.role);
        console.log("  App metadata:", JSON.stringify(authUser.user.app_metadata));
        console.log("  User metadata:", JSON.stringify(authUser.user.user_metadata));
        console.log("  Created at:", authUser.user.created_at);
    } else {
        console.log("No auth user found with that ID.");
    }

    // Check app-level users/profiles table (if any)
    for (const tableName of ["users", "profiles", "cbn_users", "user_roles"]) {
        const { data, error } = await supabase.from(tableName).select("*").eq("id", USER_ID).limit(1);
        if (!error && data && data.length > 0) {
            console.log(`\nEntry found in table "${tableName}":`);
            console.log(JSON.stringify(data[0], null, 2));
        }
    }
}

main().catch(console.error);
