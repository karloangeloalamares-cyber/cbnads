import * as routeModule from "../../../src/app/api/admin/members/[id]/route.js";
import { handleRouteRequest } from "../../../vercel-api/adapter.js";

export default async function handler(req, res) {
  const params = {
    "id": req.query?.id
  };
  return handleRouteRequest(req, res, routeModule, params);
}
