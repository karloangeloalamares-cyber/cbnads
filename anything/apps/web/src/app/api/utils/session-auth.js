import { getToken } from "@auth/core/jwt";
import { getCurrentRequest } from "./request-context.js";

export const getSessionFromRequestContext = async () => {
  const request = getCurrentRequest();
  if (!request) return null;

  const authUrl = String(process.env.AUTH_URL || "").trim();
  const secureCookie = authUrl.startsWith("https");

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

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

