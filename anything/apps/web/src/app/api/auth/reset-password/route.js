import { getSupabaseAdmin, hasSupabaseAdminConfig } from "../../../../lib/supabaseAdmin.js";

const APP_URL = process.env.APP_URL || process.env.VITE_PUBLIC_APP_URL || "";

export async function POST(request) {
    try {
        const body = await request.json();
        const email = String(body?.email || "").trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            // Return success even for invalid emails to prevent enumeration
            return Response.json({ success: true });
        }

        if (hasSupabaseAdminConfig) {
            const supabase = getSupabaseAdmin();
            const origin = request.headers?.get("origin") || APP_URL;
            const redirectTo = `${origin}/account/reset-password`;
            await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        } else {
            console.warn("[reset-password] Supabase admin not configured — email not sent.");
        }

        // Always return success — never reveal whether an email is registered
        return Response.json({ success: true });
    } catch (err) {
        console.error("[reset-password] error:", err);
        // Still return success to the client — log the error server-side
        return Response.json({ success: true });
    }
}
