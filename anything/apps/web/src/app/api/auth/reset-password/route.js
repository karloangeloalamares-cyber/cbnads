import { getSupabaseClient, hasSupabaseConfig, publicAppUrl } from "@/lib/supabase";

export async function POST(request) {
    try {
        const body = await request.json();
        const email = String(body?.email || "").trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            // Return success even for invalid emails to prevent enumeration
            return Response.json({ success: true });
        }

        if (hasSupabaseConfig) {
            const supabase = getSupabaseClient();
            const redirectTo = `${process.env.APP_URL || publicAppUrl}/account/reset-password`;
            await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        }

        // Always return success — never reveal whether an email is registered
        return Response.json({ success: true });
    } catch (err) {
        console.error("[reset-password] error:", err);
        // Still return success to the client — log the error server-side
        return Response.json({ success: true });
    }
}
