"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export default function CalendarUpcomingSidebar({
  ads,
  onAdClick,
  isMinimized,
  setIsMinimized,
  getStatusClass,
}) {
  if (isMinimized) {
    return (
      <div className="bg-white border-l border-gray-200 flex items-start justify-center pt-4">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Show upcoming ads"
          type="button"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Upcoming (Next 7 Days)</h3>
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Minimize sidebar"
          type="button"
        >
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {ads.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming ads</p>
      ) : (
        <div className="space-y-3">
          {ads.map((item, index) => (
            <div
              key={`${item.ad.id || item.ad.ad_name}-${index}`}
              onClick={() => onAdClick(item.ad)}
              className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${getStatusClass(
                item.ad.status,
              )}`}
            >
              <div className="text-xs font-medium text-gray-600 mb-1">
                {item.date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="font-medium text-sm truncate">{item.ad.ad_name}</div>
              <div className="text-xs opacity-75 truncate mt-0.5">{item.ad.advertiser}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
