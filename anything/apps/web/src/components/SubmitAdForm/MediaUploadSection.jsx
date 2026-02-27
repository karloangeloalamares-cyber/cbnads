import { useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import useUpload from "@/utils/useUpload";

export function MediaUploadSection({ media, onAddMedia, onRemoveMedia, showAlert }) {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [upload, { loading: uploading }] = useUpload();

  const handleMediaUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const isVideo = file.type.startsWith("video/");
        const maxSize = 250 * 1024 * 1024;

        if (isVideo && file.size > maxSize) {
          await showAlert({
            title: "File Too Large",
            message: `${file.name} is too large. Videos must be under 250 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
            variant: "warning",
          });
          continue;
        }

        const result = await upload({ file });

        if (result.error) {
          console.error("Failed to upload media:", result.error);
          await showAlert({
            title: "Upload Failed",
            message: `Failed to upload ${file.name}: ${result.error}`,
            variant: "danger",
          });
          continue;
        }

        const mediaType = file.type.startsWith("video/") ? "video" : "image";
        onAddMedia({ url: result.url, type: mediaType, name: file.name });
      } catch (error) {
        console.error("Failed to upload media:", error);
        await showAlert({
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
          Media (Images & Videos)
        </label>

        {media.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {media.map((item, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  {item.type === "image" ? (
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="relative w-full h-full">
                      <video src={item.url} className="w-full h-full object-cover" preload="metadata" />
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
                  {item.type === "video" ? "Video" : "Image"}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="w-full">
          <input
            type="file"
            id="media-upload"
            onChange={handleMediaUpload}
            accept="image/*,video/*"
            multiple
            className="hidden"
            disabled={uploading}
          />

          <label
            htmlFor="media-upload"
            className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl bg-white hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <Plus size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {uploading ? "Uploading..." : "Add images or videos"}
            </span>
          </label>

          <p className="text-xs text-gray-400 mt-2">
            Supports: Images (PNG, JPG, GIF) and Videos (MP4, MOV). Videos must be under 250 MB.
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