import { useState } from "react";
import { FileText, Play, Plus, Trash2, Volume2 } from "lucide-react";
import useUpload from "@/utils/useUpload";
import { appToast } from "@/lib/toast";

const IMAGE_EXTENSIONS = new Set([
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
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".avi",
  ".mkv",
]);
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".flac",
]);
const DOCUMENT_EXTENSIONS = new Set([".pdf"]);

const MEDIA_SIZE_LIMITS = {
  image: 20 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};

const MEDIA_SIZE_LABELS = {
  image: "20 MB",
  video: "250 MB",
  audio: "100 MB",
  document: "50 MB",
};

const MEDIA_TYPE_LABELS = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "PDF",
  file: "File",
};

const getFileExtension = (name = "") => {
  const dotIndex = String(name || "").lastIndexOf(".");
  if (dotIndex < 0) return "";
  return String(name).slice(dotIndex).toLowerCase();
};

const classifyMediaFile = (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  const extension = getFileExtension(file?.name);

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (mimeType === "application/pdf" || DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }

  return "";
};

const resolveMediaType = (item) => {
  const declaredType = String(item?.type || "").trim().toLowerCase();
  if (["image", "video", "audio", "document"].includes(declaredType)) {
    return declaredType;
  }

  const mimeType = String(item?.mimeType || item?.mime_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";

  const extension = getFileExtension(item?.name || item?.url || item?.cdnUrl || "");
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";

  return "file";
};

export function MediaUploadSection({
  media,
  onAddMedia,
  onRemoveMedia,
  showAlert,
  inputId = "media-upload",
}) {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [upload, { loading: uploading }] = useUpload();

  const handleMediaUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const mediaType = classifyMediaFile(file);
        if (!mediaType) {
          await notifyUploadResult({
            title: "Unsupported File Type",
            message: `${file.name} is not supported. Upload images, videos, PDF files, or audio files.`,
            variant: "warning",
          });
          continue;
        }

        const maxSize = MEDIA_SIZE_LIMITS[mediaType] || 20 * 1024 * 1024;
        const maxLabel = MEDIA_SIZE_LABELS[mediaType] || "20 MB";
        const mediaLabel = MEDIA_TYPE_LABELS[mediaType] || "File";

        if (file.size > maxSize) {
          await notifyUploadResult({
            title: "File Too Large",
            message: `${file.name} is too large. ${mediaLabel} files must be under ${maxLabel}. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
            variant: "warning",
          });
          continue;
        }

        const result = await upload({ file });

        if (result.error) {
          console.error("Failed to upload media:", result.error);
          await notifyUploadResult({
            title: "Upload Failed",
            message: `Failed to upload ${file.name}: ${result.error}`,
            variant: "danger",
          });
          continue;
        }

        onAddMedia({
          url: result.url,
          type: mediaType,
          name: file.name,
          mimeType: file.type || "",
        });
      } catch (error) {
        console.error("Failed to upload media:", error);
        await notifyUploadResult({
          title: "Upload Failed",
          message: `Failed to upload ${file.name}`,
          variant: "danger",
        });
      }
    }

    event.target.value = "";
  };

  return (
    <>
      <div>
        <label className="text-xs font-semibold text-gray-700 mb-3 block">
          Media & Attachments
        </label>

        {media.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {media.map((item, index) => (
              <div key={index} className="relative group">
                {(() => {
                  const itemType = resolveMediaType(item);
                  const itemLabel = MEDIA_TYPE_LABELS[itemType] || MEDIA_TYPE_LABELS.file;
                  const itemUrl = item?.url || item?.cdnUrl || "";
                  const itemName = item?.name || `Attachment ${index + 1}`;

                  return (
                    <>
                      <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        {itemType === "image" ? (
                          <img src={itemUrl} alt={itemName} className="w-full h-full object-cover" />
                        ) : itemType === "video" ? (
                          <div className="relative w-full h-full">
                            <video src={itemUrl} className="w-full h-full object-cover" preload="metadata" />
                            <button
                              type="button"
                              onClick={() => setPlayingVideo(item)}
                              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                            >
                              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                <Play size={20} className="text-gray-900 ml-0.5" fill="currentColor" />
                              </div>
                            </button>
                          </div>
                        ) : itemType === "audio" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-gray-100 to-gray-200 px-3 text-center">
                            <Volume2 size={32} className="text-gray-700" />
                            <span className="text-[11px] text-gray-700 line-clamp-2 break-words">
                              {itemName}
                            </span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-gray-100 to-gray-200 px-3 text-center">
                            <FileText size={32} className="text-gray-700" />
                            <span className="text-[11px] text-gray-700 line-clamp-2 break-words">
                              {itemName}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveMedia(index)}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                        {itemLabel}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        <div className="w-full">
          <input
            type="file"
            id={inputId}
            onChange={handleMediaUpload}
            accept="image/*,video/*,audio/*,.pdf"
            multiple
            className="hidden"
            disabled={uploading}
          />

          <label
            htmlFor={inputId}
            className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl bg-white hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <Plus size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {uploading ? "Uploading..." : "Add attachments"}
            </span>
          </label>

          <p className="text-xs text-gray-400 mt-2">
            Supports images (20 MB), videos (250 MB), audio files (100 MB), and PDF (50 MB).
          </p>
        </div>
      </div>

      {playingVideo && (
        <div
          onClick={() => setPlayingVideo(null)}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        >
          <div
            className="relative max-w-4xl w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <video src={playingVideo.url} controls autoPlay className="w-full rounded-lg" />
            <button
              onClick={() => setPlayingVideo(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

async function notifyUploadResult({ title, message, variant = "info" }) {
  const payload = {
    title: title || "Notice",
    description: message || "",
  };

  if (variant === "danger") {
    appToast.error(payload);
    return true;
  }

  if (variant === "warning") {
    appToast.warning(payload);
    return true;
  }

  if (variant === "success") {
    appToast.success(payload);
    return true;
  }

  appToast.info(payload);
  return true;
}
