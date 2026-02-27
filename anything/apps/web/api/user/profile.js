import * as routeModule from "../../src/app/api/user/profile/route.js";
import { handleRouteRequest } from "../../vercel-api/adapter.js";

export default async function handler(req, res) {
  const params = {};
  return handleRouteRequest(req, res, routeModule, params);
}
