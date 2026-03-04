import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
    try {
        const { data, error } = await supabase.from("cbn_advertisers").select("*").limit(1);
        console.log("cbn_advertisers", data, error);
        const { data: d2, error: e2 } = await supabase.from("advertisers").select("*").limit(1);
        console.log("advertisers", d2, e2);
    } catch (e) { console.error(e); }
}

run();
