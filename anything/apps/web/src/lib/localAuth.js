import {
  ensureDb,
  getSessionUserId,
  readDb,
  resetDbCache,
  resolveSupabaseSessionUser,
  setSessionUserId,
  upsertLocalUser,
} from "@/lib/localDb";
import {
  getSupabaseClient,
  hasSupabaseConfig,
  publicAppUrl,
  tableName,
} from "@/lib/supabase";
import { normalizeUSPhoneNumber } from "@/lib/phone";
import { normalizeAppRole } from "@/lib/permissions";

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password, ...safeUser } = user;
  return safeUser;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const ALLOWED_APP_ROLES = new Set(["admin", "manager", "staff", "advertiser"]);

const sanitizeCallbackUrl = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const baseUrl =
      (typeof window !== "undefined" && window.location?.origin) ||
      String(publicAppUrl || "").trim();
    if (!baseUrl) {
      return "";
    }
    const url = new URL(rawValue, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) {
      return "";
    }
    if (!url.pathname.startsWith("/")) {
      return "";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
};

const isAllowedAppRole = (value) => ALLOWED_APP_ROLES.has(normalizeAppRole(value));

const normalizeOAuthErrorMessage = (value) => {
  const message = decodeURIComponent(String(value || "").trim());

  if (/Database error saving new user/i.test(message)) {
    return "We couldn't find an active account for this Google email. If you are a new advertiser, please submit an application to start running ads with us.";
  }

  return message || "Google sign-in failed.";
};

const buildGoogleRedirectUrl = (callbackUrl = "") => {
  if (typeof window === "undefined") {
    return "";
  }

  const baseUrl = String(publicAppUrl || "").trim() || window.location.origin;
  const redirectUrl = new URL("/account/signin", baseUrl);
  redirectUrl.searchParams.set("oauth", "google");
  const normalizedCallbackUrl = sanitizeCallbackUrl(callbackUrl);
  if (normalizedCallbackUrl) {
    redirectUrl.searchParams.set("callbackUrl", normalizedCallbackUrl);
  }
  return redirectUrl.toString();
};

const syncSupabaseUserToLocalDb = async (resolvedUser) => {
  const email = normalizeEmail(resolvedUser?.email);
  const existing = readDb().users.find(
    (item) => item.id === resolvedUser.id || normalizeEmail(item.email) === email,
  );
  const saved = await upsertLocalUser({
    ...(existing || {}),
    ...(resolvedUser || {}),
    id: resolvedUser.id,
    name: resolvedUser.name || email,
    email,
    role: resolvedUser.role || existing?.role || "user",
    advertiser_id: resolvedUser.advertiser_id || existing?.advertiser_id || "",
    advertiser_name: resolvedUser.advertiser_name || existing?.advertiser_name || "",
    image: resolvedUser.image || existing?.image || "",
    whatsapp_number:
      normalizeUSPhoneNumber(
        resolvedUser.whatsapp_number || existing?.whatsapp_number || "",
      ),
    password: existing?.password || "",
  });

  return sanitizeUser(saved);
};

const finalizeSupabaseSignIn = async ({ supabase, authUser }) => {
  const resolvedUser = await resolveSupabaseSessionUser(supabase);
  const role = normalizeAppRole(resolvedUser?.role);
  const isVerified =
    resolvedUser?.account_verified === true ||
    authUser?.user_metadata?.account_verified === true;

  if (!resolvedUser?.id || !isAllowedAppRole(role) || role === "user") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "We couldn't find an active account for this email. If you are a new advertiser, please submit an application to start running ads with us.",
    };
  }

  if (role === "advertiser" && !isVerified) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Verify your email before signing in.",
    };
  }

  const syncedUser = await syncSupabaseUserToLocalDb(resolvedUser);
  setSessionUserId(resolvedUser.id);

  return {
    ok: true,
    user: syncedUser,
  };
};

const signInWithSupabase = async ({ email, password }) => {
  if (!hasSupabaseConfig) {
    return {
      ok: false,
      error: "Supabase auth is not configured.",
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error) {
    return {
      ok: false,
      error: "Incorrect email or password.",
    };
  }

  return finalizeSupabaseSignIn({
    supabase,
    authUser: data?.user || data?.session?.user || null,
  });
};

export const getSignedInUser = () => {
  void ensureDb();
  const userId = getSessionUserId();
  const db = readDb();
  const user =
    (userId ? db.users.find((item) => item.id === userId) : null) || db.users[0];
  return sanitizeUser(user);
};

export const signIn = async ({ email, password }) => {
  return signInWithSupabase({ email, password });
};

export const signInWithGoogle = async ({ callbackUrl = "" } = {}) => {
  if (!hasSupabaseConfig) {
    return {
      ok: false,
      error: "Supabase auth is not configured.",
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildGoogleRedirectUrl(callbackUrl),
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message || "Unable to start Google sign-in.",
    };
  }

  return {
    ok: true,
    url: data?.url || null,
  };
};

export const completeOAuthSignIn = async () => {
  if (!hasSupabaseConfig || typeof window === "undefined") {
    return {
      ok: false,
      error: "Supabase auth is not configured.",
    };
  }

  const supabase = getSupabaseClient();
  const url = new URL(window.location.href);
  const search = url.searchParams;
  const code = search.get("code");
  const errorDescription = search.get("error_description");
  const providerError = search.get("error");

  if (errorDescription || providerError) {
    return {
      ok: false,
      error: normalizeOAuthErrorMessage(errorDescription || providerError),
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return {
        ok: false,
        error: normalizeOAuthErrorMessage(error.message),
      };
    }

    search.delete("code");
    search.delete("state");
    search.delete("error");
    search.delete("error_description");
    const nextUrl = `${url.pathname}${search.toString() ? `?${search.toString()}` : ""}${url.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      ok: false,
      error: sessionError.message || "Unable to restore Google session.",
    };
  }

  if (!session?.user) {
    return {
      ok: false,
      error: "Google sign-in did not return a valid session.",
    };
  }

  return finalizeSupabaseSignIn({
    supabase,
    authUser: session.user,
  });
};

export const signOut = async () => {
  setSessionUserId(null);
  resetDbCache({ emit: false });

  if (!hasSupabaseConfig) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Sign out error:", error);
  }
};

export const updateCurrentUser = async (updates) => {
  if (!hasSupabaseConfig) {
    throw new Error("Supabase auth is not configured.");
  }

  const supabase = getSupabaseClient();
  const current = await resolveSupabaseSessionUser(supabase);
  if (!current?.id) {
    return null;
  }

  const now = new Date().toISOString();
  const nextName = String(updates?.name ?? current.name ?? current.email ?? "").trim();
  const nextImage = String(updates?.image ?? current.image ?? "").trim();
  const nextWhatsapp = String(
    updates?.whatsapp_number ?? current.whatsapp_number ?? "",
  ).trim();
  const normalizedWhatsapp = normalizeUSPhoneNumber(nextWhatsapp);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: nextName || current.email,
      avatar_url: nextImage || null,
      whatsapp_number: normalizedWhatsapp || null,
      updated_at: now,
    })
    .eq("id", current.id);
  if (profileError) {
    throw new Error(profileError.message || "Failed to update profile.");
  }

  if (current.email) {
    const { error: teamError } = await supabase
      .from(tableName("team_members"))
      .update({
        name: nextName || current.email,
        updated_at: now,
      })
      .ilike("email", normalizeEmail(current.email));
    if (teamError && !/no rows/i.test(String(teamError.message || ""))) {
      throw new Error(teamError.message || "Failed to update team member profile.");
    }
  }

  const refreshed = await resolveSupabaseSessionUser(supabase);
  const updated = await upsertLocalUser({
    ...(current || {}),
    ...(refreshed || {}),
    id: current.id,
  });
  return sanitizeUser(updated);
};

/**
 * Trigger a Supabase password-reset email for the given address.
 * Always resolves successfully to prevent email enumeration.
 */
export const requestPasswordReset = async ({ email }) => {
  if (!hasSupabaseConfig) {
    return { ok: false, error: "Supabase auth is not configured." };
  }
  const supabase = getSupabaseClient();
  const redirectTo =
    (typeof window !== "undefined"
      ? `${window.location.origin}/account/reset-password`
      : null) ||
    `${publicAppUrl}/account/reset-password`;

  await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo });
  return { ok: true };
};

/**
 * Update the signed-in user's password (called from the reset-password page
 * after Supabase has already verified the recovery token via the URL fragment).
 */
export const updatePassword = async ({ newPassword }) => {
  if (!hasSupabaseConfig) {
    return { ok: false, error: "Supabase auth is not configured." };
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: error.message || "Failed to update password." };
  }
  return { ok: true };
};
