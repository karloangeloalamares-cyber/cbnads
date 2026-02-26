import { useState } from "react";
import { ImagePlus, Link2, Trash2 } from "lucide-react";

const MAX_FILE_BYTES = 6 * 1024 * 1024;

const isLikelyVideo = (value) => {
  const text = String(value || "").toLowerCase();
  return [".mp4", ".mov", ".webm", ".m4v", "video/"]
    .some((token) => text.includes(token));
};

const getMediaType = (value) => (isLikelyVideo(value) ? "video" : "image");

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export function MediaUploadSection({ media, onAddMedia, onRemoveMedia, showAlert }) {
  const [urlInput, setUrlInput] = useState("");

  const addByUrl = async () => {
    const value = urlInput.trim();
    if (!value) {
      return;
    }

    const isDataUrl = value.startsWith("data:");
    if (!isDataUrl) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("Unsupported URL protocol");
        }
      } catch {
        if (showAlert) {
          await showAlert({
            title: "Invalid URL",
            message: "Please enter a valid http(s) URL.",
            variant: "warning",
          });
        }
        return;
      }
    }

    onAddMedia({
      url: value,
      type: getMediaType(value),
      name: "Media URL",
    });
    setUrlInput("");
  };

  const addFromFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        if (showAlert) {
          await showAlert({
            title: "File Too Large",
            message: `${file.name} exceeds the 6 MB local limit.`,
            variant: "warning",
          });
        }
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        onAddMedia({
          url: dataUrl,
          type: file.type.startsWith("video/") ? "video" : "image",
          name: file.name,
        });
      } catch {
        if (showAlert) {
          await showAlert({
            title: "Upload Failed",
            message: `Could not read ${file.name}.`,
            variant: "danger",
          });
        }
      }
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-2">
        Media (optional)
      </label>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-3">
        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Add media URL
          </label>
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-gray-400" />
            <input
              type="url"
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addByUrl}
          className="self-end px-5 py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Add URL
        </button>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer mb-4">
        <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 transition-colors">
          <ImagePlus size={16} />
          Upload file
        </span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={addFromFiles}
        />
      </label>

      {Array.isArray(media) && media.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {media.map((item, index) => {
            const mediaType = item?.type || getMediaType(item?.url);
            const source = item?.url || "";
            return (
              <div
                key={`${source}-${index}`}
                className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50"
              >
                <button
                  type="button"
                  onClick={() => onRemoveMedia(index)}
                  className="absolute top-2 right-2 z-10 rounded-md bg-white/90 p-1 text-gray-700 hover:text-red-600"
                  aria-label="Remove media"
                >
                  <Trash2 size={14} />
                </button>
                <div className="h-40 w-full bg-black/5 flex items-center justify-center">
                  {mediaType === "video" ? (
                    <video src={source} controls className="h-full w-full object-cover" />
                  ) : (
                    <img src={source} alt={item?.name || `Media ${index + 1}`} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="px-3 py-2 text-xs text-gray-600 truncate">
                  {item?.name || `Media ${index + 1}`}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}