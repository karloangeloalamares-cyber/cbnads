import { getSupabaseAdmin, adminBucketName } from "../../../lib/supabaseAdmin.js";
import crypto from "node:crypto";
import path from "node:path";
import { enforceUploadAccess } from "../utils/upload-access.js";
import {
    FILE_NAME_MAX_LENGTH,
    MEDIA_UPLOAD_MAX_BYTES,
    mediaUploadLimitLabel,
} from "../../../lib/inputLimits.js";
import {
    AUDIO_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    getFileExtension,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
} from "../../../lib/media.js";
import { buildMediaAssetUrl } from "../utils/media-asset-url.js";

const BUCKET = adminBucketName("uploads");
const PUBLIC_UPLOAD_MAX_ATTEMPTS = 20;
const PUBLIC_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

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
    const parsed = path.basename(normalized);
    return parsed.slice(0, FILE_NAME_MAX_LENGTH) || "upload";
};

const buildSizeError = (kind) =>
    Response.json(
        { error: `File too large. ${kind[0].toUpperCase()}${kind.slice(1)} uploads must be under ${mediaUploadLimitLabel(kind)}.` },
        { status: 413 },
    );

/**
 * POST /api/upload
 *
 * Local dev replacement for the platform's /_create/api/upload/ endpoint.
 * Uploads files to Supabase Storage and returns a public URL.
 *
 * Files are sent as application/octet-stream with:
 *   - X-File-Name: URI-encoded filename
 *   - X-Mime-Type: MIME type of the file
 *
 * Also supports:
 *   - application/json with { url } or { base64 }
 */
export async function POST(request) {
    try {
        const access = await enforceUploadAccess(request, {
            scope: "api-upload",
            maxAttempts: PUBLIC_UPLOAD_MAX_ATTEMPTS,
            windowMs: PUBLIC_UPLOAD_WINDOW_MS,
        });
        if (access.response) {
            return access.response;
        }

        const supabase = getSupabaseAdmin();
        const contentType = String(request.headers.get("content-type") || "");
        let fileBuffer;
        let fileName;
        let mimeType = "application/octet-stream";
        let mediaKind = "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");

            if (!file || typeof file === "string") {
                return Response.json({ error: "No file provided." }, { status: 400 });
            }

            fileBuffer = Buffer.from(await file.arrayBuffer());
            fileName = sanitizeFileName(file.name);
            mimeType = file.type || mimeType;
            mediaKind = classifyUpload({ fileName, mimeType });
            if (!mediaKind) {
                return Response.json({ error: "Unsupported file type." }, { status: 400 });
            }
            if (file.size > (MEDIA_UPLOAD_MAX_BYTES[mediaKind] || MEDIA_UPLOAD_MAX_BYTES.file)) {
                return buildSizeError(mediaKind);
            }
        } else if (contentType.includes("application/json")) {
            const body = await request.json();

            if (body.url) {
                return Response.json(
                    { error: "Remote URL uploads are not supported." },
                    { status: 400 },
                );
            } else if (body.base64) {
                fileBuffer = Buffer.from(body.base64, "base64");
                fileName = sanitizeFileName(body.fileName || "upload");
                mimeType = String(body.mimeType || mimeType).trim() || mimeType;
                mediaKind = classifyUpload({ fileName, mimeType });
                if (!mediaKind) {
                    return Response.json({ error: "Unsupported file type." }, { status: 400 });
                }
            } else {
                return Response.json({ error: "No file, url, or base64 provided." }, { status: 400 });
            }
        } else if (contentType.includes("application/octet-stream")) {
            fileBuffer = Buffer.from(await request.arrayBuffer());
            const rawFileName = request.headers.get("x-file-name");
            fileName = sanitizeFileName(rawFileName ? decodeURIComponent(rawFileName) : "upload");
            mimeType = request.headers.get("x-mime-type") || mimeType;
            mediaKind = classifyUpload({ fileName, mimeType });
            if (!mediaKind) {
                return Response.json({ error: "Unsupported file type." }, { status: 400 });
            }
        } else {
            return Response.json({ error: "Unsupported content type." }, { status: 400 });
        }

        if (!mediaKind) {
            mediaKind = classifyUpload({ fileName, mimeType });
        }
        if (!mediaKind) {
            return Response.json({ error: "Unsupported file type." }, { status: 400 });
        }
        if (fileBuffer.length > (MEDIA_UPLOAD_MAX_BYTES[mediaKind] || MEDIA_UPLOAD_MAX_BYTES.file)) {
            return buildSizeError(mediaKind);
        }

        // Generate a unique path
        const ext = path.extname(fileName) || guessExtension(mimeType);
        const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
        const storagePath = `ad-media/${uniqueName}`;

        // Ensure the bucket exists (create if not)
        const { data: buckets } = await supabase.storage.listBuckets();
        const existingBucket = buckets?.find((bucket) => bucket.name === BUCKET) || null;
        if (!existingBucket) {
            const { error: createError } = await supabase.storage.createBucket(BUCKET, {
                public: false,
            });
            if (createError) {
                console.error("[upload] Failed to create bucket:", createError);
                return Response.json(
                    { error: "Internal Server Error" },
                    { status: 500 },
                );
            }
        } else if (existingBucket.public !== false) {
            const { error: updateBucketError } = await supabase.storage.updateBucket(BUCKET, {
                public: false,
            });
            if (updateBucketError) {
                console.error("[upload] Failed to update bucket visibility:", updateBucketError);
                return Response.json(
                    { error: "Internal Server Error" },
                    { status: 500 },
                );
            }
        }

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (uploadError) {
            console.error("[upload] Supabase storage error:", uploadError);
            return Response.json(
                { error: "Internal Server Error" },
                { status: 500 },
            );
        }

        return Response.json({
            url: buildMediaAssetUrl({ bucket: BUCKET, path: storagePath }),
            bucket: BUCKET,
            path: storagePath,
            mimeType,
        });
    } catch (error) {
        console.error("[upload] Failed:", error);
        return Response.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

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
