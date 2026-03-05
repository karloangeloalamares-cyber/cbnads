import crypto from "node:crypto";
import { db, table } from "../../utils/supabase-db.js";
import { getSessionUser, requireAdmin } from "../../utils/auth-check.js";
import {
  findAuthUserByEmail,
  getAdvertiserAuthBaseUrl,
  normalizeEmail,
} from "../../utils/advertiser-auth.js";
import { sendEmail } from "../../utils/send-email.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_INTERNAL_ROLES = new Set(["admin", "manager", "staff"]);

const createTemporaryPassword = () => `${crypto.randomBytes(24).toString("base64url")}Aa1!`;

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeInternalRole = (value, fallback = "staff") => {
  const role = String(value || "").trim().toLowerCase();
  if (ALLOWED_INTERNAL_ROLES.has(role)) {
    return role;
  }
  return fallback;
};

const formatRoleLabel = (role) => {
  const normalized = normalizeInternalRole(role, "staff");
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
};

const buildInternalUserMetadata = ({ existingMetadata, name, email, role }) => ({
  ...(existingMetadata || {}),
  role: normalizeInternalRole(role, "staff"),
  full_name: String(name || "").trim() || email,
  signup_source: "admin_dashboard",
});

const sendTeamMemberInviteEmail = async ({
  email,
  name,
  role,
  setupUrl,
  inviterName,
}) => {
  const roleLabel = escapeHtml(formatRoleLabel(role));
  const safeName = escapeHtml(String(name || "").trim() || "there");
  const safeInviterName = escapeHtml(
    String(inviterName || "").trim() || "a CBN Ads admin",
  );
  const safeSetupUrl = escapeHtml(setupUrl);

  await sendEmail({
    to: email,
    subject: "Your CBN Ads team account is ready",
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <img
            src="https://cbnads.com/icons/icon-512.png"
            alt="CBN"
            style="height: 48px; width: auto; margin-bottom: 24px;"
          />
          <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 16px;">
            Your team account has been created
          </h1>
          <p style="margin: 0 0 16px;">Hi ${safeName},</p>
          <p style="margin: 0 0 24px;">
            ${safeInviterName} created your CBN Ads team account with the ${roleLabel} role. Use the button below to verify your email and set your password.
          </p>
          <p style="margin: 0 0 24px;">
            <a
              href="${safeSetupUrl}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
            >
              Verify and set password
            </a>
          </p>
          <p style="margin: 0; font-size: 14px; color: #4b5563;">
            If the button does not work, open this link:
          </p>
          <p style="margin: 8px 0 0; font-size: 14px; word-break: break-all;">
            <a href="${safeSetupUrl}">${safeSetupUrl}</a>
          </p>
        </div>
      </div>
    `,
    text: `Hi ${String(name || "").trim() || "there"},

${String(inviterName || "").trim() || "A CBN Ads admin"} created your CBN Ads team account with the ${formatRoleLabel(role)} role.
Verify your email and set your password here:
${setupUrl}`,
  });
};

// Get all internal members
export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { data: rows, error } = await supabase
      .from(table("team_members"))
      .select("id, name, email, role")
      .in("role", ["admin", "manager", "staff"])
      .order("created_at", { ascending: true });
    if (error) throw error;

    const members = (rows || []).map((member) => ({
      ...member,
      image: null,
    }));

    const currentUser = await getSessionUser(request);
    if (currentUser?.email) {
      const exists = members.some(
        (member) =>
          String(member.email || "").trim().toLowerCase() ===
          String(currentUser.email || "").trim().toLowerCase(),
      );
      if (!exists && String(currentUser.role || "") === "admin") {
        members.unshift({
          id: currentUser.id || "session-admin",
          name: currentUser.name || currentUser.email,
          email: currentUser.email,
          image: currentUser.image || null,
          role: "admin",
        });
      }
    }

    return Response.json({ members });
  } catch (err) {
    console.error("GET /api/admin/members error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Add a new internal member
export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const rawEmail = body?.email;
    const rawName = body?.name;
    const requestedRole = String(body?.role || "").trim().toLowerCase();
    const normalizedEmail = normalizeEmail(rawEmail);
    const normalizedName = String(rawName || "").trim() || normalizedEmail;
    const normalizedRole = normalizeInternalRole(requestedRole, "staff");

    if (!normalizedEmail) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (requestedRole && !ALLOWED_INTERNAL_ROLES.has(requestedRole)) {
      return Response.json(
        { error: "Role must be admin, manager, or staff." },
        { status: 400 },
      );
    }

    const supabase = db();

    const { data: existing, error: existingError } = await supabase
      .from(table("team_members"))
      .select("id, role")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const existingRole = String(existing.role || "").trim().toLowerCase();
      if (ALLOWED_INTERNAL_ROLES.has(existingRole)) {
        return Response.json(
          { error: "A team member with this email already exists." },
          { status: 400 },
        );
      }

      const { error: promoteError } = await supabase
        .from(table("team_members"))
        .update({
          role: normalizedRole,
          name: normalizedName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (promoteError) throw promoteError;
    } else {
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase
        .from(table("team_members"))
        .insert({
          name: normalizedName,
          email: normalizedEmail,
          role: normalizedRole,
          created_at: nowIso,
          updated_at: nowIso,
        });
      if (insertError) throw insertError;
    }

    const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);
    let authUser = existingUser;

    if (existingUser?.id) {
      const existingRole = String(
        existingUser?.user_metadata?.role || existingUser?.app_metadata?.role || "",
      )
        .trim()
        .toLowerCase();

      if (existingRole === "advertiser") {
        return Response.json(
          {
            error:
              "This email is already used by an advertiser account. Use a different email.",
          },
          { status: 409 },
        );
      }

      const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
        user_metadata: buildInternalUserMetadata({
          existingMetadata: existingUser.user_metadata,
          name: normalizedName,
          email: normalizedEmail,
          role: normalizedRole,
        }),
        app_metadata: {
          ...(existingUser.app_metadata || {}),
          role: normalizedRole,
        },
      });
      if (error) throw error;
      authUser = data?.user || existingUser;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: createTemporaryPassword(),
        email_confirm: true,
        user_metadata: buildInternalUserMetadata({
          name: normalizedName,
          email: normalizedEmail,
          role: normalizedRole,
        }),
        app_metadata: { role: normalizedRole },
      });
      if (error) throw error;
      authUser = data?.user || null;
    }

    if (!authUser?.id) {
      throw new Error("Failed to create the team member auth account.");
    }

    const appBaseUrl = getAdvertiserAuthBaseUrl(request);
    const redirectTo = `${appBaseUrl}/account/reset-password`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });
    if (linkError) throw linkError;

    const setupUrl = String(linkData?.properties?.action_link || "").trim();
    if (!setupUrl) {
      throw new Error("Failed to generate the password setup link.");
    }

    await sendTeamMemberInviteEmail({
      email: normalizedEmail,
      name: normalizedName,
      role: normalizedRole,
      setupUrl,
      inviterName: admin?.user?.name || admin?.user?.email || "",
    });

    return Response.json({
      success: true,
      message: "Team member created and invite email sent.",
      email_sent: true,
      created_user: !existingUser?.id,
      role: normalizedRole,
    });
  } catch (err) {
    console.error("POST /api/admin/members error", err);
    return Response.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
