import crypto from "node:crypto";
import { requireAdmin } from "../../../utils/auth-check.js";
import { db } from "../../../utils/supabase-db.js";
import {
  assertAdvertiserEmailConfig,
  createAdvertiserVerificationToken,
  ensureAdvertiserRecord,
  findAuthUserByEmail,
  normalizeEmail,
  sendAdvertiserVerificationEmail,
  upsertAdvertiserProfile,
} from "../../../utils/advertiser-auth.js";
import {
  ADVERTISER_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
} from "../../../../../lib/inputLimits.js";

const buildMetadata = ({
  existingMetadata,
  advertiserId,
  advertiserName,
  contactName,
}) => ({
  ...(existingMetadata || {}),
  role: "Advertiser",
  advertiser_id: advertiserId,
  advertiser_name: advertiserName || null,
  full_name: contactName || advertiserName || null,
  account_verified: false,
  signup_source: "admin_dashboard",
});

const createTemporaryPassword = () => `${crypto.randomBytes(24).toString("base64url")}Aa1!`;

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
    }

    assertAdvertiserEmailConfig();

    const body = await request.json();
    const advertiserName = String(body?.advertiser_name || "").trim();
    const contactName = String(body?.contact_name || "").trim();
    const phoneNumber = String(body?.phone_number || body?.phone || "").trim();
    const email = normalizeEmail(body?.email);

    if (email.length > EMAIL_MAX_LENGTH) {
      return Response.json({ error: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.` }, { status: 400 });
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

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const advertiser = await ensureAdvertiserRecord({
      advertiserName: advertiserName || email,
      contactName,
      email,
      phoneNumber,
    });

    const supabase = db();
    const existingUser = await findAuthUserByEmail(supabase, email);
    const fullName = contactName || advertiserName || email;
    let authUser = existingUser;

    if (existingUser?.id) {
      const existingRole = String(
        existingUser?.user_metadata?.role ||
          existingUser?.app_metadata?.role ||
          "",
      )
        .trim()
        .toLowerCase();

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
        return Response.json({
          success: true,
          advertiserId: advertiser.id,
          email,
          email_sent: false,
          already_verified: true,
        });
      }

      const { data, error } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          user_metadata: buildMetadata({
            existingMetadata: existingUser.user_metadata,
            advertiserId: advertiser.id,
            advertiserName: advertiser.advertiser_name || advertiserName,
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
        throw error;
      }
      authUser = data?.user || existingUser;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: createTemporaryPassword(),
        email_confirm: true,
        user_metadata: buildMetadata({
          advertiserId: advertiser.id,
          advertiserName: advertiser.advertiser_name || advertiserName,
          contactName: fullName,
        }),
        app_metadata: {
          role: "Advertiser",
          advertiser_id: advertiser.id,
        },
      });
      if (error) {
        throw error;
      }
      authUser = data?.user || null;
    }

    if (!authUser?.id) {
      throw new Error("Failed to create advertiser account.");
    }

    await upsertAdvertiserProfile({
      userId: authUser.id,
      advertiserId: advertiser.id,
      email,
      fullName,
      onboardingComplete: false,
    });

    const verificationToken = createAdvertiserVerificationToken({
      userId: authUser.id,
      email,
      advertiserId: advertiser.id,
      pendingAdId: null,
    });

    await sendAdvertiserVerificationEmail({
      request,
      email,
      contactName: fullName,
      verificationToken,
    });

    return Response.json({
      success: true,
      advertiserId: advertiser.id,
      email,
      email_sent: true,
      created_user: !existingUser?.id,
    });
  } catch (error) {
    console.error("[admin/advertisers/ensure-account] Failed:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
