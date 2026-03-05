import { table } from "./supabase-db.js";

const INTERNAL_ROLES = new Set(["admin", "manager", "staff", "owner"]);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const uniq = (values) => Array.from(new Set(values));

const collectRoleEmails = (rows, { emailField = "email", roleField = "role" } = {}) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => INTERNAL_ROLES.has(normalizeRole(row?.[roleField])))
    .map((row) => normalizeEmail(row?.[emailField]))
    .filter((email) => email && isValidEmail(email));

const collectPreferenceEmails = ({ adminPrefs, globalPrefs }) =>
  uniq(
    [
      ...(Array.isArray(adminPrefs) ? adminPrefs : [])
        .filter((item) => item?.email_enabled)
        .map((item) => normalizeEmail(item?.email_address)),
      ...((globalPrefs?.[0]?.email_enabled && globalPrefs?.[0]?.reminder_email)
        ? [normalizeEmail(globalPrefs[0].reminder_email)]
        : []),
    ].filter((email) => email && isValidEmail(email)),
  );

export async function resolveInternalNotificationEmails(supabase) {
  const queries = await Promise.allSettled([
    supabase.from(table("team_members")).select("email, role"),
    supabase.from("profiles").select("email, role"),
    supabase
      .from(table("admin_notification_preferences"))
      .select("email_address, email_enabled"),
    supabase
      .from(table("notification_preferences"))
      .select("reminder_email, email_enabled")
      .order("id", { ascending: true })
      .limit(1),
  ]);

  const [teamMembersResult, profilesResult, adminPrefsResult, globalPrefsResult] = queries;

  const queryErrors = queries
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason)
    .filter(Boolean);
  if (queryErrors.length > 0) {
    throw queryErrors[0];
  }

  const teamMembersResponse = teamMembersResult.value;
  const profilesResponse = profilesResult.value;
  const adminPrefsResponse = adminPrefsResult.value;
  const globalPrefsResponse = globalPrefsResult.value;

  if (teamMembersResponse?.error) throw teamMembersResponse.error;
  if (profilesResponse?.error) throw profilesResponse.error;
  if (adminPrefsResponse?.error) throw adminPrefsResponse.error;
  if (globalPrefsResponse?.error) throw globalPrefsResponse.error;

  const teamMemberEmails = collectRoleEmails(teamMembersResponse?.data, {
    emailField: "email",
    roleField: "role",
  });
  const profileEmails = collectRoleEmails(profilesResponse?.data, {
    emailField: "email",
    roleField: "role",
  });
  const preferenceEmails = collectPreferenceEmails({
    adminPrefs: adminPrefsResponse?.data,
    globalPrefs: globalPrefsResponse?.data,
  });

  return uniq([...teamMemberEmails, ...profileEmails, ...preferenceEmails]);
}
