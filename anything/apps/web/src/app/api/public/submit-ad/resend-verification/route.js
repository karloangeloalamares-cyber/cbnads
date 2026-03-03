import { db } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserEmailConfig,
  createAdvertiserVerificationToken,
  findAuthUserByEmail,
  normalizeEmail,
  sendAdvertiserVerificationEmail,
} from "../../../utils/advertiser-auth.js";

export async function POST(request) {
  try {
    assertAdvertiserEmailConfig();

    const body = await request.json();
    const normalizedEmail = normalizeEmail(body.email);

    if (!normalizedEmail) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = db();
    const user = await findAuthUserByEmail(supabase, normalizedEmail);

    if (!user?.id) {
      return Response.json(
        { error: "No advertiser account was found for this email." },
        { status: 404 },
      );
    }

    const role = String(user?.user_metadata?.role || user?.app_metadata?.role || "").toLowerCase();
    if (role && role !== "advertiser") {
      return Response.json(
        { error: "This account is not an advertiser account." },
        { status: 400 },
      );
    }

    if (user?.user_metadata?.account_verified === true) {
      return Response.json(
        { error: "This advertiser account is already verified." },
        { status: 400 },
      );
    }

    const verificationToken = createAdvertiserVerificationToken({
      userId: user.id,
      email: normalizedEmail,
      advertiserId:
        user?.user_metadata?.advertiser_id || user?.app_metadata?.advertiser_id || null,
      pendingAdId: user?.user_metadata?.pending_ad_id || null,
    });

    await sendAdvertiserVerificationEmail({
      request,
      email: normalizedEmail,
      contactName: user?.user_metadata?.full_name || normalizedEmail,
      verificationToken,
    });

    return Response.json({ success: true, email: normalizedEmail });
  } catch (error) {
    console.error("[submit-ad/resend-verification] Failed:", error);
    return Response.json(
      { error: error?.message || "Failed to resend verification email." },
      { status: 500 },
    );
  }
}
