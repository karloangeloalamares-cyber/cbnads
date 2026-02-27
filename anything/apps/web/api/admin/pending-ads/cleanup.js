import * as routeModule from "../../../src/app/api/admin/pending-ads/cleanup/route.js";
import { handleRouteRequest } from "../../../vercel-api/adapter.js";

export default async function handler(req, res) {
  const params = {};
  return handleRouteRequest(req, res, routeModule, params);
}
