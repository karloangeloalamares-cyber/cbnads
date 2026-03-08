"use client";

import { ChevronsUpDown } from "lucide-react";

export default function InvoiceSortableHeader({ label, sortKey, onSort }) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="text-left px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <ChevronsUpDown size={12} className="text-gray-400" />
      </div>
    </th>
  );
}
