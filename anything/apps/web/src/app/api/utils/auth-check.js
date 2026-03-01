import { getCurrentRequest } from "./request-context.js";
import { getSessionFromRequestContext } from "./session-auth.js";
import { db, table } from "./supabase-db.js";
import { can, isAdvertiserRole, isInternalRole, normalizeAppRole } from "../../../lib/permissions.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getBearerTokenFromRequest = (request) => {
  const header = String(request?.headers?.get("authorization") || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
};

const getRequestStatusForError = (error) =>
  /please sign in/i.test(String(error || "")) ? 401 : 403;

const loadProfile = async (supabase, { userId }) => {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, advertiser_id, full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const loadTeamMemberRole = async (supabase, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return "";
  }

  const { data, error } = await supabase
    .from(table("team_members"))
    .select("role")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeText(data?.role);
};

const loadAdvertiserById = async (supabase, advertiserId) => {
  const normalizedId = String(advertiserId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("advertisers"))
    .select("id, advertiser_name, email")
    .eq("id", normalizedId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const loadAdvertiserByEmail = async (supabase, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("advertisers"))
    .select("id, advertiser_name, email")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const loadAdvertiserByName = async (supabase, advertiserName) => {
  const normalizedName = String(advertiserName || "").trim();
  if (!normalizedName) {
    return null;
  }

  const { data, error } = await supabase
    .from(table("advertisers"))
    .select("id, advertiser_name, email")
    .eq("advertiser_name", normalizedName)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const resolveUserRole = async ({
  supabase,
  explicitRole,
  profileRole,
  email,
}) => {
  const directRole = normalizeText(explicitRole);
  if (directRole) {
    return directRole;
  }

  const profileResolvedRole = normalizeText(profileRole);
  if (profileResolvedRole) {
    return profileResolvedRole;
  }

  try {
    const teamRole = await loadTeamMemberRole(supabase, email);
    if (teamRole) {
      return teamRole;
    }
  } catch {
    // Fall through to the default role.
  }

  return "user";
};

const attachAdvertiserIdentity = async (supabase, user, fallbackName = "") => {
  const advertiserId = String(user?.advertiser_id || "").trim();
  let advertiserRow = null;

  if (advertiserId) {
    advertiserRow = await loadAdvertiserById(supabase, advertiserId);
  }

  if (!advertiserRow && user?.email) {
    advertiserRow = await loadAdvertiserByEmail(supabase, user.email);
  }

  if (!advertiserRow && fallbackName) {
    advertiserRow = await loadAdvertiserByName(supabase, fallbackName);
  }

  return {
    ...user,
    advertiser_id: advertiserRow?.id || advertiserId || null,
    advertiser_name:
      advertiserRow?.advertiser_name || String(fallbackName || "").trim() || null,
  };
};

const mapSessionUser = async (supabase, sessionUser) => {
  const profile = await loadProfile(supabase, { userId: sessionUser?.id });
  const role = await resolveUserRole({
    supabase,
    explicitRole: sessionUser?.role,
    profileRole: profile?.role,
    email: sessionUser?.email || profile?.email,
  });

  const baseUser = {
    id: sessionUser?.id || null,
    email: sessionUser?.email || profile?.email || null,
    name: sessionUser?.name || profile?.full_name || sessionUser?.email || null,
    image: sessionUser?.image || null,
    role,
    advertiser_id: profile?.advertiser_id || null,
  };

  return attachAdvertiserIdentity(supabase, baseUser);
};

const mapSupabaseUser = async (supabase, authUser) => {
  const profile = await loadProfile(supabase, { userId: authUser?.id });
  const role = await resolveUserRole({
    supabase,
    explicitRole: authUser?.user_metadata?.role || authUser?.app_metadata?.role,
    profileRole: profile?.role,
    email: authUser?.email || profile?.email,
  });

  const fallbackAdvertiserName =
    authUser?.user_metadata?.advertiser_name || profile?.full_name || "";

  const baseUser = {
    id: authUser?.id || null,
    email: authUser?.email || profile?.email || null,
    name:
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.advertiser_name ||
      profile?.full_name ||
      authUser?.email ||
      null,
    image:
      authUser?.user_metadata?.avatar_url ||
      authUser?.user_metadata?.image ||
      null,
    role,
    advertiser_id:
      authUser?.user_metadata?.advertiser_id ||
      authUser?.app_metadata?.advertiser_id ||
      profile?.advertiser_id ||
      null,
    account_verified: authUser?.user_metadata?.account_verified === true,
  };

  return attachAdvertiserIdentity(supabase, baseUser, fallbackAdvertiserName);
};

const getSupabaseBearerUser = async (request) => {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const supabase = db();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    return null;
  }

  const authUser = data?.user;
  if (!authUser?.id) {
    return null;
  }

  return mapSupabaseUser(supabase, authUser);
};

export const isAdvertiserUser = (user) => isAdvertiserRole(user?.role);

export const isAdminUser = (user) => normalizeAppRole(user?.role) === "admin";

export const isManagerUser = (user) => normalizeAppRole(user?.role) === "manager";

export const isStaffUser = (user) => normalizeAppRole(user?.role) === "staff";

export const isInternalUser = (user) => isInternalRole(user?.role);

export async function requireAdmin(request = null) {
  const user = await getSessionUser(request);

  if (!user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
    };
  }

  if (!isAdminUser(user)) {
    return {
      authorized: false,
      error: "Unauthorized - Admin access required",
    };
  }

  return {
    authorized: true,
    user,
  };
}

export async function requirePermission(permission, request = null) {
  const user = await getSessionUser(request);

  if (!user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
      status: 401,
    };
  }

  if (!can(user.role, permission)) {
    return {
      authorized: false,
      error: "Unauthorized - Permission denied",
      status: 403,
    };
  }

  return {
    authorized: true,
    user,
    status: 200,
  };
}

export async function requireInternalUser(request = null) {
  const user = await getSessionUser(request);

  if (!user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
      status: 401,
    };
  }

  if (!isInternalUser(user)) {
    return {
      authorized: false,
      error: "Unauthorized - Internal access required",
      status: 403,
    };
  }

  return {
    authorized: true,
    user,
    status: 200,
  };
}

export async function requireAuth(request = null) {
  const user = await getSessionUser(request);

  if (!user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
    };
  }

  return {
    authorized: true,
    user,
  };
}

export async function requireAdminOrAdvertiser(request = null) {
  const user = await getSessionUser(request);

  if (!user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
      status: 401,
    };
  }

  if (!isAdminUser(user) && !isAdvertiserUser(user)) {
    return {
      authorized: false,
      error: "Unauthorized - Admin or advertiser access required",
      status: 403,
    };
  }

  return {
    authorized: true,
    user,
    status: 200,
  };
}

export async function getSessionUser(request = null) {
  const effectiveRequest = request || getCurrentRequest();
  const session = await getSessionFromRequestContext(effectiveRequest);
  const supabase = db();

  if (session?.user?.id) {
    return mapSessionUser(supabase, session.user);
  }

  return getSupabaseBearerUser(effectiveRequest);
}

export async function resolveAdvertiserScope(user) {
  if (!user) {
    return null;
  }

  const supabase = db();
  const advertiserId = String(user.advertiser_id || "").trim();
  const advertiserName = String(user.advertiser_name || "").trim();
  const email = normalizeEmail(user.email);

  let advertiserRow = null;

  if (advertiserId) {
    advertiserRow = await loadAdvertiserById(supabase, advertiserId);
  }

  if (!advertiserRow && email) {
    advertiserRow = await loadAdvertiserByEmail(supabase, email);
  }

  if (!advertiserRow && advertiserName) {
    advertiserRow = await loadAdvertiserByName(supabase, advertiserName);
  }

  return {
    id: advertiserRow?.id || advertiserId || null,
    name: advertiserRow?.advertiser_name || advertiserName || null,
    email: normalizeEmail(advertiserRow?.email || email) || null,
  };
}

export const matchesAdvertiserScope = (
  row,
  scope,
  {
    advertiserIdFields = ["advertiser_id"],
    advertiserNameFields = ["advertiser_name", "advertiser"],
    emailFields = ["email", "contact_email"],
  } = {},
) => {
  if (!row || !scope) {
    return false;
  }

  const scopeId = String(scope.id || "").trim();
  if (scopeId) {
    for (const field of advertiserIdFields) {
      if (String(row?.[field] || "").trim() === scopeId) {
        return true;
      }
    }
  }

  const scopeName = normalizeText(scope.name);
  if (scopeName) {
    for (const field of advertiserNameFields) {
      if (normalizeText(row?.[field]) === scopeName) {
        return true;
      }
    }
  }

  const scopeEmail = normalizeEmail(scope.email);
  if (scopeEmail) {
    for (const field of emailFields) {
      if (normalizeEmail(row?.[field]) === scopeEmail) {
        return true;
      }
    }
  }

  return false;
};

export { getRequestStatusForError };
