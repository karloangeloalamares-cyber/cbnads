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

async function checkProfiles() {
    const { data: profiles, error } = await supabase.from("profiles").select("*");
    if (error) {
        console.error("Error reading profiles:", error);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log("No profiles found in the database. Are you logged in?");
        return;
    }

    console.log("Found profiles:", profiles.map(p => ({ id: p.id, email: p.email, role: p.role })));

    // Try to update all profiles to admin to make sure the user can see the seed data
    for (const p of profiles) {
        if (p.role !== "admin") {
            const { error: updateError } = await supabase
                .from("profiles")
                .update({ role: "admin" })
                .eq("id", p.id);
            if (updateError) {
                console.error("Failed to upgrade user", p.email, ":", updateError);
            } else {
                console.log("Upgraded user", p.email, "to admin");
            }
        }
    }
}

checkProfiles();
