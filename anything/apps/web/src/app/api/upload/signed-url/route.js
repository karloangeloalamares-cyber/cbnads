import { getSupabaseAdmin, adminBucketName } from "../../../../lib/supabaseAdmin.js";
import crypto from "node:crypto";
import path from "node:path";

const BUCKET = adminBucketName("uploads");

const ensureBucketExists = async (supabase) => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  const bucketExists = buckets?.some((bucket) => bucket.name === BUCKET);
  if (bucketExists) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  });
  if (createError) {
    throw createError;
  }
};

function guessExtension(mimeType) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  };
  return map[mimeType] || "";
}

const buildStoragePath = (fileName, mimeType) => {
  const safeName = String(fileName || "").trim() || "upload";
  const ext = path.extname(safeName) || guessExtension(mimeType);
  return `ad-media/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const fileName = String(body?.fileName || "").trim() || "upload";
    const mimeType = String(body?.mimeType || "application/octet-stream").trim();

    const supabase = getSupabaseAdmin();
    await ensureBucketExists(supabase);

    const storagePath = buildStoragePath(fileName, mimeType);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      throw error;
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    return Response.json({
      bucket: BUCKET,
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (error) {
    console.error("[upload/signed-url] Failed:", error);
    return Response.json(
      { error: error?.message || "Failed to create signed upload URL." },
      { status: 500 },
    );
  }
}
