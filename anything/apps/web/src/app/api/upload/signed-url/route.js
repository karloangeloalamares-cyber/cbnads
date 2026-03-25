import { getSupabaseAdmin, adminBucketName } from "../../../../lib/supabaseAdmin.js";
import crypto from "node:crypto";
import path from "node:path";
import { enforceUploadAccess } from "../../utils/upload-access.js";
import {
  FILE_NAME_MAX_LENGTH,
  MEDIA_UPLOAD_MAX_BYTES,
  mediaUploadLimitLabel,
} from "../../../../lib/inputLimits.js";
import {
  AUDIO_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  getFileExtension,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "../../../../lib/media.js";
import { buildMediaAssetUrl } from "../../utils/media-asset-url.js";

const BUCKET = adminBucketName("uploads");
const PUBLIC_SIGNED_UPLOAD_MAX_ATTEMPTS = 40;
const PUBLIC_SIGNED_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

const ensureBucketExists = async (supabase) => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  const existingBucket = buckets?.find((bucket) => bucket.name === BUCKET) || null;
  if (existingBucket?.public === false) {
    return;
  }

  if (!existingBucket) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: false,
    });
    if (createError) {
      throw createError;
    }
    return;
  }

  const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
    public: false,
  });
  if (updateError) {
    throw updateError;
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

const classifyUpload = ({ fileName, mimeType }) => {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (normalizedMimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (normalizedMimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (normalizedMimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (normalizedMimeType === "application/pdf" || DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return "";
};

const sanitizeFileName = (value) => {
  const normalized = String(value || "").trim().replace(/[\r\n]+/g, " ");
  if (!normalized) {
    return "upload";
  }
  return (path.basename(normalized).slice(0, FILE_NAME_MAX_LENGTH) || "upload");
};

const buildStoragePath = (fileName, mimeType) => {
  const safeName = sanitizeFileName(fileName);
  const ext = path.extname(safeName) || guessExtension(mimeType);
  return `ad-media/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
};

export async function POST(request) {
  try {
    const access = await enforceUploadAccess(request, {
      scope: "api-upload-signed-url",
      maxAttempts: PUBLIC_SIGNED_UPLOAD_MAX_ATTEMPTS,
      windowMs: PUBLIC_SIGNED_UPLOAD_WINDOW_MS,
    });
    if (access.response) {
      return access.response;
    }

    const body = await request.json();
    const fileName = sanitizeFileName(body?.fileName || "upload");
    const mimeType = String(body?.mimeType || "application/octet-stream").trim();
    const fileSize = Number(body?.fileSize || body?.sizeBytes || 0);
    const mediaKind = classifyUpload({ fileName, mimeType });

    if (!mediaKind) {
      return Response.json({ error: "Unsupported file type." }, { status: 400 });
    }

    if (Number.isFinite(fileSize) && fileSize > 0) {
      const maxBytes = MEDIA_UPLOAD_MAX_BYTES[mediaKind] || MEDIA_UPLOAD_MAX_BYTES.file;
      if (fileSize > maxBytes) {
        return Response.json(
          { error: `File too large. ${mediaKind[0].toUpperCase()}${mediaKind.slice(1)} uploads must be under ${mediaUploadLimitLabel(mediaKind)}.` },
          { status: 413 },
        );
      }
    }

    const supabase = getSupabaseAdmin();
    await ensureBucketExists(supabase);

    const storagePath = buildStoragePath(fileName, mimeType);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      throw error;
    }

    return Response.json({
      bucket: BUCKET,
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      url: buildMediaAssetUrl({ bucket: BUCKET, path: storagePath }),
    });
  } catch (error) {
    console.error("[upload/signed-url] Failed:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
