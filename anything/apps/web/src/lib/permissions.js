const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const normalizeAppRole = (value) => {
  const role = normalizeText(value);
  if (role === "owner") {
    return "admin";
  }
  if (role === "assistant") {
    return "staff";
  }
  if (["admin", "manager", "staff", "advertiser"].includes(role)) {
    return role;
  }
  return role || "user";
};

const permissionMatrix = {
  admin: new Set([
    "dashboard:view",
    "calendar:view",
    "submissions:view",
    "submissions:convert",
    "submissions:reject",
    "ads:view",
    "ads:edit",
    "ads:delete",
    "advertisers:view",
    "advertisers:edit",
    "products:view",
    "products:edit",
    "billing:view",
    "billing:edit",
    "billing:mark_paid",
    "billing:delete",
    "reconciliation:view",
    "settings:view",
    "team:manage",
    "system:manage",
    "whatsapp:view",
    "whatsapp:manage",
    "notifications:view",
  ]),
  manager: new Set([
    "dashboard:view",
    "calendar:view",
    "submissions:view",
    "submissions:convert",
    "submissions:reject",
    "ads:view",
    "ads:edit",
    "advertisers:view",
    "advertisers:edit",
    "billing:view",
    "billing:edit",
    "billing:mark_paid",
    "whatsapp:view",
    "notifications:view",
  ]),
  staff: new Set([
    "dashboard:view",
    "calendar:view",
    "submissions:view",
    "ads:view",
    "ads:edit",
    "whatsapp:view",
    "notifications:view",
  ]),
  advertiser: new Set([
    "dashboard:view",
    "calendar:view",
    "submissions:view",
    "ads:view",
    "ads:edit",
    "billing:view",
  ]),
};

export const can = (role, permission) => {
  const normalizedRole = normalizeAppRole(role);
  return permissionMatrix[normalizedRole]?.has(permission) === true;
};

export const isInternalRole = (role) =>
  ["admin", "manager", "staff"].includes(normalizeAppRole(role));

export const isAdvertiserRole = (role) => normalizeAppRole(role) === "advertiser";

export const getVisibleSectionsForRole = (role) => {
  const normalizedRole = normalizeAppRole(role);
  if (normalizedRole === "advertiser") {
    return ["Dashboard", "Calendar", "Submissions", "Ads", "Billing"];
  }
  if (normalizedRole === "staff") {
    return ["Dashboard", "Calendar", "Submissions", "Ads"];
  }
  if (normalizedRole === "manager") {
    return ["Dashboard", "Calendar", "Submissions", "Advertisers", "Ads", "Billing"];
  }
  if (normalizedRole === "admin") {
    return [
      "Dashboard",
      "Calendar",
      "Submissions",
      "WhatsApp",
      "Advertisers",
      "Ads",
      "Products",
      "Billing",
      "Reconciliation",
      "Settings",
    ];
  }
  return [];
};
