import {
  ensureDb,
  getSessionUserId,
  readDb,
  resetDbCache,
  resolveSupabaseSessionUser,
  setSessionUserId,
  upsertLocalUser,
} from "@/lib/localDb";
import { getSupabaseClient, hasSupabaseConfig, tableName } from "@/lib/supabase";

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password, ...safeUser } = user;
  return safeUser;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

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
      resolvedUser.whatsapp_number || existing?.whatsapp_number || "",
    password: existing?.password || "",
  });

  return sanitizeUser(saved);
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

  const resolvedUser = await resolveSupabaseSessionUser(supabase);
  const role = String(resolvedUser?.role || "").toLowerCase();
  const isVerified =
    resolvedUser?.account_verified === true ||
    data?.user?.user_metadata?.account_verified === true;

  if (!resolvedUser?.id || !role) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "This account does not have access to the ads manager.",
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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: nextName || current.email,
      avatar_url: nextImage || null,
      whatsapp_number: nextWhatsapp || null,
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
