export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".heic",
  ".heif",
]);

export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".avi",
  ".mkv",
]);

export const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".flac",
]);

export const DOCUMENT_EXTENSIONS = new Set([".pdf"]);

export const getFileExtension = (value = "") => {
  const dotIndex = String(value || "").lastIndexOf(".");
  if (dotIndex < 0) {
    return "";
  }
  return String(value || "").slice(dotIndex).toLowerCase();
};

export const getMediaItemUrl = (item) =>
  String(item?.url || item?.cdnUrl || "").trim();

export const getMediaItemName = (item, fallback = "Attachment") =>
  String(item?.name || fallback).trim() || fallback;

export const resolveMediaType = (item) => {
  const declaredType = String(item?.type || "").trim().toLowerCase();
  if (["image", "video", "audio", "document"].includes(declaredType)) {
    return declaredType;
  }

  const mimeType = String(item?.mimeType || item?.mime_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";

  const extension = getFileExtension(
    item?.name || item?.url || item?.cdnUrl || "",
  );
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";

  return "file";
};
