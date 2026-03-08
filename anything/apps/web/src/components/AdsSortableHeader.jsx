"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export default function AdsSortableHeader({ label, sortKey, sortConfig, onSort }) {
  const isActive = sortConfig.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="text-left px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          sortConfig.direction === "asc" ? (
            <ChevronUp size={12} className="text-gray-700" />
          ) : (
            <ChevronDown size={12} className="text-gray-700" />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-gray-400" />
        )}
      </div>
    </th>
  );
}
