import { db, table } from "../../../utils/supabase-db.js";
import {
    ensureAdvertiserRecord,
    findAuthUserByEmail,
    normalizeEmail,
    updatePendingAdAccountEmail,
    upsertAdvertiserProfile,
} from "../../../utils/advertiser-auth.js";

const EXISTING_ACCOUNT_ERROR_CODE = "existing_advertiser_account";

const existingAdvertiserAccountPayload = (email) => ({
    code: EXISTING_ACCOUNT_ERROR_CODE,
    title: "You already have an advertiser account",
    error:
        "This email is already connected to a CBN Ads advertiser account. Sign in to your dashboard to manage submissions, ads, and billing.",
    description:
        "This email is already connected to a CBN Ads advertiser account. Sign in to your dashboard to manage submissions, ads, and billing.",
    email,
    ctaLabel: "Log in to dashboard",
});

const withRetry = async (fn, { retries = 2, delay = 500 } = {}) => {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt >= retries) throw err;
            await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        }
    }
};

/**
 * POST /api/public/submit-ad/google-account
 *
 * After the user completes Google OAuth on the client side, the frontend
 * calls this endpoint to link the authenticated Google user to the
 * pending ad and create (or update) the advertiser account.
 *
 * Body: { pendingAdId, advertiserName, contactName, phoneNumber }
 * Auth: Supabase session token passed via Authorization header.
 */
export async function POST(request) {
    try {
        const authHeader = String(request.headers.get("authorization") || "").trim();
        const accessToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : "";

        if (!accessToken) {
            return Response.json(
                { error: "Missing authorization token." },
                { status: 401 },
            );
        }

        const body = await request.json();
        const pendingAdId = String(body.pendingAdId || "").trim();
        const advertiserName = String(body.advertiserName || "").trim();
        const contactName = String(body.contactName || "").trim();
        const phoneNumber = String(body.phoneNumber || "").trim();

        const supabase = db();

        // Verify the access token and get the authenticated user
        const {
            data: { user: googleUser },
            error: authError,
        } = await supabase.auth.getUser(accessToken);

        if (authError || !googleUser?.id || !googleUser?.email) {
            return Response.json(
                { error: "Invalid or expired Google session. Please try again." },
                { status: 401 },
            );
        }

        // Block non-advertiser users (admins, staff, etc.) from creating advertiser
        // accounts via this public flow — even if they use their own Google account.
        const currentUserRole = String(
            googleUser.user_metadata?.role ||
            googleUser.app_metadata?.role ||
            "",
        ).toLowerCase();

        if (currentUserRole && currentUserRole !== "advertiser") {
            return Response.json(
                {
                    error:
                        "This Google account is already associated with a non-advertiser account. Please use a different Google account.",
                },
                { status: 409 },
            );
        }

        const normalizedEmail = normalizeEmail(googleUser.email);
        const fullName =
            contactName ||
            advertiserName ||
            googleUser.user_metadata?.full_name ||
            googleUser.user_metadata?.name ||
            normalizedEmail;

        if (pendingAdId) {
            const { data: pendingAd, error: pendingAdError } = await supabase
                .from(table("pending_ads"))
                .select("id, email")
                .eq("id", pendingAdId)
                .maybeSingle();

            if (pendingAdError) {
                throw pendingAdError;
            }

            if (!pendingAd?.id) {
                return Response.json(
                    { error: "Pending ad submission not found." },
                    { status: 404 },
                );
            }

            if (normalizeEmail(pendingAd.email) !== normalizedEmail) {
                return Response.json(
                    { error: "Pending ad does not belong to this email." },
                    { status: 403 },
                );
            }
        }

        // Check if this email is already taken by a non-advertiser account
        const existingUser = await withRetry(() => findAuthUserByEmail(supabase, normalizedEmail));
        if (existingUser && existingUser.id !== googleUser.id) {
            const existingRole = String(
                existingUser?.user_metadata?.role ||
                existingUser?.app_metadata?.role ||
                "",
            ).toLowerCase();

            if (existingRole && existingRole !== "advertiser") {
                return Response.json(
                    {
                        error:
                            "This email is already in use by a non-advertiser account. Please use a different email.",
                    },
                    { status: 409 },
                );
            }

            if (existingUser?.user_metadata?.account_verified === true) {
                return Response.json(
                    existingAdvertiserAccountPayload(normalizedEmail),
                    { status: 409 },
                );
            }
        }

        // Create or find the advertiser record
        const advertiser = await withRetry(() => ensureAdvertiserRecord({
            advertiserName,
            contactName,
            email: normalizedEmail,
            phoneNumber,
        }));

        // Link the pending ad to this email / advertiser
        if (pendingAdId) {
            await updatePendingAdAccountEmail({
                pendingAdId,
                email: normalizedEmail,
                advertiserId: advertiser.id,
            });
        }

        // Update the Supabase auth user with advertiser metadata
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            googleUser.id,
            {
                user_metadata: {
                    ...(googleUser.user_metadata || {}),
                    role: "Advertiser",
                    advertiser_id: advertiser.id,
                    pending_ad_id: pendingAdId || null,
                    advertiser_name: advertiserName || null,
                    full_name: fullName,
                    account_verified: true,
                    signup_source: "submit_ad_google",
                },
                app_metadata: {
                    ...(googleUser.app_metadata || {}),
                    role: "Advertiser",
                    advertiser_id: advertiser.id,
                },
            },
        );

        if (updateError) {
            throw updateError;
        }

        // Create / update the advertiser profile
        await upsertAdvertiserProfile({
            userId: googleUser.id,
            advertiserId: advertiser.id,
            email: normalizedEmail,
            fullName,
            onboardingComplete: false,
        });

        return Response.json({
            success: true,
            email: normalizedEmail,
            advertiserId: advertiser.id,
            pendingAdId,
        });
    } catch (error) {
        console.error(
            "[submit-ad/google-account] Failed to link Google account:",
            error,
        );
        return Response.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
