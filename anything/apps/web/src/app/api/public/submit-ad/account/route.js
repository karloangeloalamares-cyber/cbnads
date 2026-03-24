import { db, table } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserVerificationConfig,
  createAdvertiserVerificationToken,
  ensureAdvertiserRecord,
  findAuthUserByEmail,
  normalizeEmail,
  sendAdvertiserVerificationEmail,
  updatePendingAdAccountEmail,
  upsertAdvertiserProfile,
} from "../../../utils/advertiser-auth.js";
import {
  clientIpFromHeaders,
  consumePublicRateLimit,
} from "../../../utils/public-rate-limit.js";
import { getTodayInAppTimeZone } from "../../../../../lib/timezone.js";
import {
  ADVERTISER_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
} from "../../../../../lib/inputLimits.js";
import {
  getPasswordStrengthValidationError,
  normalizePasswordStrengthErrorMessage,
} from "../../../../../lib/passwordValidation.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const EXISTING_ACCOUNT_ERROR_CODE = "existing_advertiser_account";

const normalizeAccountCreationError = (error) => {
  const message = String(error?.message || "").trim();
  const normalizedPasswordError = normalizePasswordStrengthErrorMessage(message);
  if (normalizedPasswordError) {
    return { error: normalizedPasswordError, status: 400 };
  }

  if (/Database error saving new user/i.test(message)) {
    return {
      error:
        "We couldn't finish creating your account right now. Please try again, or use Log in instead if this email already has an account.",
      status: 500,
    };
  }

  return null;
};

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

const buildMetadata = ({
  existingMetadata,
  advertiserId,
  pendingAdId,
  advertiserName,
  contactName,
}) => ({
  ...(existingMetadata || {}),
  role: "Advertiser",
  advertiser_id: advertiserId,
  pending_ad_id: pendingAdId || null,
  advertiser_name: advertiserName || null,
  full_name: contactName || advertiserName || null,
  account_verified: false,
  signup_source: "submit_ad",
});

export async function POST(request) {
  try {
    assertAdvertiserVerificationConfig();

    const requesterIp = clientIpFromHeaders(request.headers) || "unknown";
    const body = await request.json();
    const pendingAdId = String(body.pendingAdId || "").trim();
    const advertiserName = String(body.advertiserName || "").trim();
    const contactName = String(body.contactName || "").trim();
    const phoneNumber = String(body.phoneNumber || "").trim();
    const normalizedEmail = normalizeEmail(body.email);
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
      return Response.json(
        { error: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    if (advertiserName.length > ADVERTISER_NAME_MAX_LENGTH) {
      return Response.json(
        { error: `Advertiser name must be ${ADVERTISER_NAME_MAX_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    if (contactName.length > PERSON_NAME_MAX_LENGTH) {
      return Response.json(
        { error: `Contact name must be ${PERSON_NAME_MAX_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    const rateLimitKey = `${requesterIp}:${normalizedEmail}:${getTodayInAppTimeZone()}`;
    const rateLimitState = await consumePublicRateLimit({
      key: rateLimitKey,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (rateLimitState.limited) {
      return Response.json(
        { error: "Too many account setup attempts. Please try again later." },
        { status: 429 },
      );
    }

    if (!normalizedEmail || !password || !confirmPassword) {
      return Response.json(
        { error: "Email, password, and verify password are required." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const passwordValidationError = getPasswordStrengthValidationError(password);
    if (passwordValidationError) {
      return Response.json({ error: passwordValidationError }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return Response.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const supabase = db();
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
        return Response.json({ error: "Pending ad submission not found." }, { status: 404 });
      }

      if (normalizeEmail(pendingAd.email) !== normalizedEmail) {
        return Response.json(
          { error: "Pending ad does not belong to this email." },
          { status: 403 },
        );
      }
    }

    const advertiser = await ensureAdvertiserRecord({
      advertiserName,
      contactName,
      email: normalizedEmail,
      phoneNumber,
    });

    if (pendingAdId) {
      await updatePendingAdAccountEmail({
        pendingAdId,
        email: normalizedEmail,
        advertiserId: advertiser.id,
      });
    }

    const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);
    const fullName = contactName || advertiserName || normalizedEmail;
    let authUser = existingUser;

    if (existingUser) {
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

      const { data, error } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          user_metadata: buildMetadata({
            existingMetadata: existingUser.user_metadata,
            advertiserId: advertiser.id,
            pendingAdId,
            advertiserName,
            contactName: fullName,
          }),
          app_metadata: {
            ...(existingUser.app_metadata || {}),
            role: "Advertiser",
            advertiser_id: advertiser.id,
          },
        },
      );

      if (error) {
        const normalizedPasswordError = normalizePasswordStrengthErrorMessage(
          error?.message,
        );
        if (normalizedPasswordError) {
          return Response.json({ error: normalizedPasswordError }, { status: 400 });
        }
        throw error;
      }

      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: buildMetadata({
          advertiserId: advertiser.id,
          pendingAdId,
          advertiserName,
          contactName: fullName,
        }),
        app_metadata: {
          role: "Advertiser",
          advertiser_id: advertiser.id,
        },
      });

      if (error) {
        const normalizedPasswordError = normalizePasswordStrengthErrorMessage(
          error?.message,
        );
        if (normalizedPasswordError) {
          return Response.json({ error: normalizedPasswordError }, { status: 400 });
        }
        throw error;
      }

      authUser = data.user;
    }

    if (!authUser?.id) {
      throw new Error("Failed to create advertiser account");
    }

    await upsertAdvertiserProfile({
      userId: authUser.id,
      advertiserId: advertiser.id,
      email: normalizedEmail,
      fullName,
      onboardingComplete: false,
    });

    try {
      const {
        sendPendingSubmissionAdminWhatsAppNotification,
        sendPendingSubmissionAdvertiserReceipt,
        sendPendingSubmissionInternalEmailNotification,
        sendPendingSubmissionInternalTelegramNotification,
      } = await import("../../../utils/pending-ad-submission.js");

      try {
        await sendPendingSubmissionAdvertiserReceipt({
          request,
          pendingAdId,
          supabase,
        });
      } catch (receiptError) {
        console.error(
          "[submit-ad/account] Account created but submission receipt email failed:",
          receiptError,
        );
      }

      try {
        await sendPendingSubmissionInternalTelegramNotification({
          request,
          pendingAdId,
          supabase,
        });
      } catch (telegramError) {
        console.error(
          "[submit-ad/account] Account created but internal Telegram notification failed:",
          telegramError,
        );
      }

      try {
        await sendPendingSubmissionInternalEmailNotification({
          request,
          pendingAdId,
          supabase,
        });
      } catch (internalEmailError) {
        console.error(
          "[submit-ad/account] Account created but internal email notification failed:",
          internalEmailError,
        );
      }

      try {
        await sendPendingSubmissionAdminWhatsAppNotification({
          pendingAdId,
          supabase,
        });
      } catch (whatsAppError) {
        console.error(
          "[submit-ad/account] Account created but admin WhatsApp notification failed:",
          whatsAppError,
        );
      }
    } catch (notificationImportError) {
      console.error(
        "[submit-ad/account] Account created but delayed notification helpers failed to load:",
        notificationImportError,
      );
    }

    const verificationToken = createAdvertiserVerificationToken({
      userId: authUser.id,
      email: normalizedEmail,
      advertiserId: advertiser.id,
      pendingAdId,
    });

    let verificationEmailSent = true;
    try {
      await sendAdvertiserVerificationEmail({
        request,
        email: normalizedEmail,
        contactName: fullName,
        verificationToken,
      });
    } catch (emailError) {
      verificationEmailSent = false;
      console.error(
        "[submit-ad/account] Account created but verification email failed:",
        emailError,
      );
    }

    return Response.json({
      success: true,
      email: normalizedEmail,
      advertiserId: advertiser.id,
      pendingAdId,
      verificationRequired: true,
      verificationEmailSent,
    });
  } catch (error) {
    console.error("[submit-ad/account] Failed to create advertiser account:", error);
    const normalizedError = normalizeAccountCreationError(error);
    if (normalizedError) {
      return Response.json({ error: normalizedError.error }, { status: normalizedError.status });
    }
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
