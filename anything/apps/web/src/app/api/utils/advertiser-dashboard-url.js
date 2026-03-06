const readServerEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
};

export const getAppBaseUrl = (request) => {
  const configured = readServerEnv(
    "APP_URL",
    "AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "VITE_APP_URL",
  );
  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/$/, "");
    } catch {
      // Fall back to the request origin below.
    }
  }

  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:4000";
  }
};

export const buildAdvertiserDashboardSignInUrl = ({
  request,
  email = "",
  section = "Ads",
} = {}) => {
  const signInUrl = new URL("/account/signin", `${getAppBaseUrl(request)}/`);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (normalizedEmail) {
    signInUrl.searchParams.set("email", normalizedEmail);
  }

  signInUrl.searchParams.set("forceLogin", "1");
  signInUrl.searchParams.set("audience", "advertiser");
  signInUrl.searchParams.set("callbackUrl", `/ads?section=${String(section || "Ads").trim() || "Ads"}`);

  return signInUrl.toString();
};
