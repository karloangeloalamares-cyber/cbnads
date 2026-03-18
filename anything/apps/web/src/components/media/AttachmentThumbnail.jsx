import { useEffect, useState } from "react";
import { FileText, Play, Volume2 } from "lucide-react";
import {
  getMediaItemName,
  getMediaItemUrl,
  resolveMediaType,
} from "@/lib/media";

const pdfThumbnailCache = new Map();
const pdfThumbnailPromiseCache = new Map();

const usePdfThumbnailUrl = (itemType, itemUrl) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(
    itemType === "document" ? pdfThumbnailCache.get(itemUrl) || "" : "",
  );

  useEffect(() => {
    if (itemType !== "document" || !itemUrl) {
      setThumbnailUrl("");
      return;
    }

    const cached = pdfThumbnailCache.get(itemUrl);
    if (cached) {
      setThumbnailUrl(cached);
      return;
    }

    let cancelled = false;

    const existingPromise = pdfThumbnailPromiseCache.get(itemUrl);
    const thumbnailPromise =
      existingPromise ||
      import("@/client-integrations/pdfjs")
        .then(({ renderPDFPageToDataUri }) =>
          renderPDFPageToDataUri(itemUrl, { pageNumber: 1, scale: 1.25 }),
        )
        .finally(() => {
          pdfThumbnailPromiseCache.delete(itemUrl);
        });

    pdfThumbnailPromiseCache.set(itemUrl, thumbnailPromise);

    thumbnailPromise
      .then((nextThumbnailUrl) => {
        if (!nextThumbnailUrl) {
          return;
        }

        pdfThumbnailCache.set(itemUrl, nextThumbnailUrl);
        if (!cancelled) {
          setThumbnailUrl(nextThumbnailUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThumbnailUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemType, itemUrl]);

  return thumbnailUrl;
};

export function AttachmentThumbnail({
  item,
  className = "",
  compact = false,
  showVideoOverlay = true,
  videoOverlaySize = 18,
}) {
  const itemType = resolveMediaType(item);
  const itemUrl = getMediaItemUrl(item);
  const itemName = getMediaItemName(item);
  const pdfThumbnailUrl = usePdfThumbnailUrl(itemType, itemUrl);

  const placeholderPaddingClass = compact ? "p-2" : "p-3";
  const placeholderGapClass = compact ? "gap-1.5" : "gap-2";
  const placeholderNameClass = compact
    ? "hidden"
    : "text-[11px] font-medium line-clamp-2 break-words";

  if (itemType === "image" && itemUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-gray-100 ${className}`}>
        <img src={itemUrl} alt={itemName} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (itemType === "video" && itemUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-gray-950 ${className}`}>
        <video
          src={itemUrl}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          playsInline
          crossOrigin="anonymous"
        />
        {showVideoOverlay ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm">
              <Play
                size={videoOverlaySize}
                className="ml-0.5 text-gray-900"
                fill="currentColor"
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (itemType === "document" && pdfThumbnailUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-white ${className}`}>
        <img
          src={pdfThumbnailUrl}
          alt={itemName}
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 left-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
          PDF
        </div>
      </div>
    );
  }

  if (itemType === "audio") {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 text-center text-gray-700 ${placeholderPaddingClass} ${placeholderGapClass} ${className}`}
      >
        <Volume2 size={compact ? 22 : 32} className="text-gray-700" />
        <span className={placeholderNameClass}>{itemName}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 text-center text-gray-700 ${placeholderPaddingClass} ${placeholderGapClass} ${className}`}
    >
      <FileText size={compact ? 22 : 32} className="text-gray-700" />
      <span className={placeholderNameClass}>{itemName}</span>
    </div>
  );
}
