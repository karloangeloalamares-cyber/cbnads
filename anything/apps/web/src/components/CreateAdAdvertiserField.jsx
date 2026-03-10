"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

export default function CreateAdAdvertiserField({
  advertisers,
  value,
  onChange,
  onCreateNew,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuCoordinates, setMenuCoordinates] = useState({
    top: 0,
    left: 0,
    width: 320,
  });
  const fieldRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedAdvertiser = useMemo(
    () =>
      advertisers.find((item) => String(item?.id || "") === String(value || "")) || null,
    [advertisers, value],
  );

  const uniqueAdvertisers = useMemo(() => {
    const selectedId = String(value || "").trim();
    const seen = new Map();

    const getDedupKey = (item) => {
      const name = String(item?.advertiser_name || "")
        .trim()
        .toLowerCase();
      if (name) {
        return `name:${name}`;
      }
      const email = String(item?.email || "")
        .trim()
        .toLowerCase();
      if (email) {
        return `email:${email}`;
      }
      return `id:${String(item?.id || "").trim()}`;
    };

    for (const item of Array.isArray(advertisers) ? advertisers : []) {
      const key = getDedupKey(item);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, item);
        continue;
      }

      const currentId = String(item?.id || "").trim();
      const existingId = String(existing?.id || "").trim();
      if (currentId && currentId === selectedId && existingId !== selectedId) {
        seen.set(key, item);
      }
    }

    return Array.from(seen.values());
  }, [advertisers, value]);

  const filteredAdvertisers = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    const source = [...uniqueAdvertisers].sort((left, right) =>
      String(left?.advertiser_name || "").localeCompare(String(right?.advertiser_name || "")),
    );

    if (!query) {
      return source;
    }

    return source.filter((item) =>
      [item?.advertiser_name, item?.contact_name, item?.email].some((field) =>
        String(field || "").toLowerCase().includes(query),
      ),
    );
  }, [search, uniqueAdvertisers]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return undefined;
    }

    const updateMenuPosition = () => {
      if (!fieldRef.current) {
        return;
      }

      const rect = fieldRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const estimatedHeight = 320;
      const width = Math.min(
        Math.max(rect.width, 280),
        window.innerWidth - viewportPadding * 2,
      );

      let left = rect.left;
      left = Math.max(
        viewportPadding,
        Math.min(left, window.innerWidth - width - viewportPadding),
      );

      let top = rect.bottom + gap;
      if (top + estimatedHeight > window.innerHeight - viewportPadding) {
        top = rect.top - estimatedHeight - gap;
      }
      top = Math.max(
        viewportPadding,
        Math.min(top, window.innerHeight - estimatedHeight - viewportPadding),
      );

      setMenuCoordinates({ top, left, width });
    };

    updateMenuPosition();
    const animationFrameId = window.requestAnimationFrame(() => {
      updateMenuPosition();
      searchInputRef.current?.focus();
    });

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (fieldRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (advertiserId) => {
    onChange(advertiserId);
    setIsOpen(false);
    setSearch("");
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    setSearch("");
    onCreateNew();
  };

  return (
    <div
      ref={fieldRef}
      className={`border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 transition-all ${
        isOpen
          ? "border-gray-900 ring-2 ring-gray-900 ring-offset-0"
          : "hover:border-gray-300 focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        Advertiser <span className="text-red-500">*</span>
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-3 text-left text-sm"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={selectedAdvertiser ? "text-gray-900" : "text-gray-400"}>
          {selectedAdvertiser?.advertiser_name || "Select advertiser"}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[220] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
              style={{
                top: `${menuCoordinates.top}px`,
                left: `${menuCoordinates.left}px`,
                width: `${menuCoordinates.width}px`,
              }}
            >
              <div className="border-b border-gray-200 p-2">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search advertisers..."
                    className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-4 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateNew}
                className="flex w-full items-center gap-2 border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-gray-50 hover:text-blue-700"
              >
                <Plus size={16} />
                Create New Advertiser
              </button>

              <div className="max-h-[200px] overflow-y-auto">
                {filteredAdvertisers.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No advertisers match your search.
                  </div>
                ) : (
                  filteredAdvertisers.map((item) => {
                    const isSelected = String(item?.id || "") === String(value || "");
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-gray-50 text-gray-900"
                            : "text-gray-900 hover:bg-gray-50"
                        }`}
                      >
                        <span className="truncate">{item.advertiser_name}</span>
                        {isSelected ? <Check size={16} className="text-gray-500" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
