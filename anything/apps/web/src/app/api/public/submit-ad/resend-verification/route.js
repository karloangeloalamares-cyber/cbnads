import { db } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserEmailConfig,
  createAdvertiserVerificationToken,
  findAuthUserByEmail,
  normalizeEmail,
  sendAdvertiserVerificationEmail,
} from "../../../utils/advertiser-auth.js";
import { EMAIL_MAX_LENGTH } from "../../../../../lib/inputLimits.js";

export async function POST(request) {
  try {
    assertAdvertiserEmailConfig();

    const body = await request.json();
    const normalizedEmail = normalizeEmail(body.email);

    if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
      return Response.json(
        { error: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    if (!normalizedEmail) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = db();
    const user = await findAuthUserByEmail(supabase, normalizedEmail);

    const role = String(user?.user_metadata?.role || user?.app_metadata?.role || "").toLowerCase();
    const canResendVerification =
      Boolean(user?.id) &&
      (!role || role === "advertiser") &&
      user?.user_metadata?.account_verified !== true;

    if (canResendVerification) {
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
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[submit-ad/resend-verification] Failed:", error);
    return Response.json({ success: true });
  }
}
