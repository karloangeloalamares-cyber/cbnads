import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanTestData() {
    const targetNames = [
        "Taste Test", "Test", "test2", "Test 5", "test 6", "test 7"
    ];

    console.log("Cleaning specific test advertisers by name...");
    for (const name of targetNames) {
        const { error } = await supabase.from("advertisers").delete().ilike("business_name", name);
        if (error) console.error(`Error deleting ${name}:`, error.message);
        else console.log(`Deleted ${name}`);
    }

    // The email the QA listed
    console.log("Cleaning Test email Jon@xyxztest.com...");
    await supabase.from("cbn_advertisers").delete().ilike("email", "Jon@xyxztest.com");
    await supabase.from("advertisers").delete().ilike("email", "Jon@xyxztest.com");

    console.log("Cleaning duplicate 'Summit Group'...");
    let duplicates = [];
    const { data: d2 } = await supabase.from("advertisers").select("id, business_name").eq("business_name", "Summit Group").order("created_at", { ascending: true });
    if (d2) duplicates = d2;

    if (duplicates.length > 1) {
        const idsToDelete = duplicates.slice(1).map(d => d.id);
        await supabase.from("advertisers").delete().in("id", idsToDelete);
        console.log(`Deleted ${idsToDelete.length} Summit Group duplicates.`);
    }

    console.log("Done");
}

cleanTestData();
