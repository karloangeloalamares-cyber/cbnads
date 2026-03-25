import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin.js";
import { verifyMediaAssetToken } from "../../utils/media-asset-url.js";

const SIGNED_READ_TTL_SECONDS = 60 * 10;

const isObjectNotFoundError = (error) => {
  const code = String(error?.statusCode || error?.status || error?.code || "").trim();
  const message = String(error?.message || "").trim();
  return code === "404" || /not found/i.test(message);
};

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    if (!token) {
      return Response.json({ error: "Media token is required." }, { status: 400 });
    }

    const { bucket, path } = verifyMediaAssetToken(token);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_READ_TTL_SECONDS);

    if (error) {
      if (isObjectNotFoundError(error)) {
        return Response.json({ error: "Media not found." }, { status: 404 });
      }
      throw error;
    }

    const signedUrl = String(data?.signedUrl || "").trim();
    if (!signedUrl) {
      return Response.json({ error: "Media not found." }, { status: 404 });
    }

    return Response.redirect(signedUrl, 302);
  } catch (error) {
    const message = String(error?.message || "");
    if (/Invalid media asset token/i.test(message)) {
      return Response.json({ error: "Invalid media token." }, { status: 400 });
    }

    console.error("[upload/object] Failed:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
