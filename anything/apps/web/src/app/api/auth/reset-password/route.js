import { getSupabaseAdmin, hasSupabaseAdminConfig } from "../../../../lib/supabaseAdmin.js";

const readTrustedAppOrigin = () => {
    const candidates = [
        process.env.APP_URL,
        process.env.AUTH_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.VITE_APP_URL,
        process.env.VITE_PUBLIC_APP_URL,
    ];

    for (const candidate of candidates) {
        const value = String(candidate || "").trim();
        if (!value) {
            continue;
        }

        try {
            return new URL(value).origin;
        } catch {
            // Ignore invalid URL values and continue.
        }
    }

    return "";
};

const TRUSTED_APP_ORIGIN = readTrustedAppOrigin();

export async function POST(request) {
    try {
        const body = await request.json();
        const email = String(body?.email || "").trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            // Return success even for invalid emails to prevent enumeration.
            return Response.json({ success: true });
        }

        if (hasSupabaseAdminConfig) {
            const supabase = getSupabaseAdmin();
            const redirectTo = TRUSTED_APP_ORIGIN
                ? `${TRUSTED_APP_ORIGIN}/account/reset-password`
                : undefined;
            await supabase.auth.resetPasswordForEmail(
                email,
                redirectTo ? { redirectTo } : undefined,
            );
        } else {
            console.warn("[reset-password] Supabase admin not configured; email not sent.");
        }

        // Always return success; never reveal whether an email is registered.
        return Response.json({ success: true });
    } catch (err) {
        console.error("[reset-password] error:", err);
        // Still return success to the client; log the error server-side.
        return Response.json({ success: true });
    }
}
