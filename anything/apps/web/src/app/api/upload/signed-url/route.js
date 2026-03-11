import { getSupabaseAdmin, adminBucketName } from "../../../../lib/supabaseAdmin.js";
import crypto from "node:crypto";
import path from "node:path";
import { requireAuth } from "../../utils/auth-check.js";

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
    "application/pdf": ".pdf",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "audio/webm": ".webm",
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
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

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
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
