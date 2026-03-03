import { db } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserVerificationConfig,
  normalizeEmail,
  upsertAdvertiserProfile,
  verifyAdvertiserVerificationToken,
} from "../../../utils/advertiser-auth.js";

export async function POST(request) {
  try {
    assertAdvertiserVerificationConfig();

    const body = await request.json();
    const token = String(body.token || "").trim();

    if (!token) {
      return Response.json({ error: "Verification token is required." }, { status: 400 });
    }

    const payload = verifyAdvertiserVerificationToken(token);
    const supabase = db();
    const { data, error } = await supabase.auth.admin.getUserById(payload.sub);

    if (error) {
      throw error;
    }

    const user = data?.user;
    if (!user?.id) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }

    if (normalizeEmail(user.email) !== normalizeEmail(payload.email)) {
      return Response.json({ error: "Verification token is invalid." }, { status: 400 });
    }

    const advertiserId =
      payload.advertiserId ||
      user?.user_metadata?.advertiser_id ||
      user?.app_metadata?.advertiser_id ||
      null;
    const mergedUserMetadata = {
      ...(user.user_metadata || {}),
      role: "Advertiser",
      advertiser_id: advertiserId,
      account_verified: true,
    };
    const mergedAppMetadata = {
      ...(user.app_metadata || {}),
      role: "Advertiser",
      advertiser_id: advertiserId,
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: mergedUserMetadata,
      app_metadata: mergedAppMetadata,
    });

    if (updateError) {
      throw updateError;
    }

    await upsertAdvertiserProfile({
      userId: user.id,
      advertiserId,
      email: user.email,
      fullName:
        mergedUserMetadata.full_name ||
        mergedUserMetadata.advertiser_name ||
        user.email,
      onboardingComplete: true,
    });

    return Response.json({
      success: true,
      email: normalizeEmail(user.email),
    });
  } catch (error) {
    console.error("[submit-ad/verify-account] Failed:", error);
    const message = error?.message || "Failed to verify advertiser account.";
    const status =
      /invalid verification token|expired|verification token/i.test(message) ? 400 : 500;
    return Response.json(
      { error: message },
      { status },
    );
  }
}
