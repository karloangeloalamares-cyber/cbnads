import { getSupabaseAdmin, adminBucketName } from "../../../lib/supabaseAdmin.js";
import crypto from "node:crypto";
import path from "node:path";
import { enforceUploadAccess } from "../utils/upload-access.js";

const BUCKET = adminBucketName("uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const PUBLIC_UPLOAD_MAX_ATTEMPTS = 20;
const PUBLIC_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

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

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");

            if (!file || typeof file === "string") {
                return Response.json({ error: "No file provided." }, { status: 400 });
            }

            if (file.size > MAX_FILE_SIZE) {
                return Response.json({ error: "File too large." }, { status: 413 });
            }

            fileBuffer = Buffer.from(await file.arrayBuffer());
            fileName = file.name || "upload";
            mimeType = file.type || mimeType;
        } else if (contentType.includes("application/json")) {
            const body = await request.json();

            if (body.url) {
                const resp = await fetch(body.url);
                if (!resp.ok) {
                    return Response.json({ error: "Failed to fetch URL." }, { status: 400 });
                }
                fileBuffer = Buffer.from(await resp.arrayBuffer());
                mimeType = resp.headers.get("content-type") || mimeType;
                fileName = path.basename(new URL(body.url).pathname) || "download";
            } else if (body.base64) {
                fileBuffer = Buffer.from(body.base64, "base64");
                fileName = "upload";
            } else {
                return Response.json({ error: "No file, url, or base64 provided." }, { status: 400 });
            }
        } else if (contentType.includes("application/octet-stream")) {
            fileBuffer = Buffer.from(await request.arrayBuffer());
            const rawFileName = request.headers.get("x-file-name");
            fileName = rawFileName ? decodeURIComponent(rawFileName) : "upload";
            mimeType = request.headers.get("x-mime-type") || mimeType;
        } else {
            return Response.json({ error: "Unsupported content type." }, { status: 400 });
        }

        // Generate a unique path
        const ext = path.extname(fileName) || guessExtension(mimeType);
        const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
        const storagePath = `ad-media/${uniqueName}`;

        // Ensure the bucket exists (create if not)
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some((b) => b.name === BUCKET);
        if (!bucketExists) {
            const { error: createError } = await supabase.storage.createBucket(BUCKET, {
                public: true,
            });
            if (createError) {
                console.error("[upload] Failed to create bucket:", createError);
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

        // Get the public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(storagePath);

        return Response.json({
            url: urlData.publicUrl,
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
