import { getToken } from "@auth/core/jwt";
import { getCurrentRequest } from "./request-context.js";

const readAuthSecret = () =>
  String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();

export const getSessionFromRequestContext = async (requestOverride = null) => {
  const request = requestOverride || getCurrentRequest();
  if (!request) return null;

  const authUrl = String(process.env.AUTH_URL || process.env.APP_URL || "").trim();
  const secureCookie = authUrl.startsWith("https");
  const authSecret = readAuthSecret();

  if (!authSecret) {
    return null;
  }

  let token = null;
  try {
    token = await getToken({
      req: request,
      secret: authSecret,
      secureCookie,
    });
  } catch (error) {
    if (/missingsecret/i.test(String(error?.message || ""))) {
      return null;
    }
    throw error;
  }

  if (!token?.sub) {
    return null;
  }

  return {
    user: {
      id: token.sub,
      email: token.email || null,
      name: token.name || null,
      image: token.picture || null,
      role: token.role || null,
    },
    expires: token.exp ? new Date(token.exp * 1000).toISOString() : null,
  };
};
