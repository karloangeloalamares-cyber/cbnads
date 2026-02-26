"use client";

import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  Megaphone,
  Package,
  CreditCard,
  Settings,
  AlertTriangle,
} from "lucide-react";

export default function Sidebar({ activeItem = "Ads", onNavigate }) {
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", id: "Dashboard" },
    { icon: Calendar, label: "Calendar", id: "Calendar" },
    { icon: FileText, label: "Submissions", id: "Submissions" },
    { icon: Users, label: "Advertisers", id: "Advertisers" },
    { icon: Megaphone, label: "Ads", id: "Ads" },
    { icon: Package, label: "Products", id: "Products" },
    { icon: CreditCard, label: "Billing", id: "Billing" },
    { icon: AlertTriangle, label: "Reconciliation", id: "Reconciliation" },
  ];

  const handleNavigate = (item) => {
    if (onNavigate) {
      onNavigate(item.id);
    }
  };

  return (
    <div className="w-[220px] bg-[#F7F8FA] border-r border-gray-200 h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6">
        <img
          src="https://ucarecdn.com/2663d8ad-a4fc-433a-b93d-bdf7da14732e/-/format/auto/"
          alt="Logo"
          className="w-10 h-10 rounded-lg"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeItem;

          return (
            <button
              key={item.label}
              onClick={() => handleNavigate(item)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                isActive
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-600 hover:bg-white hover:text-black"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={() => {
            if (onNavigate) onNavigate("Settings");
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            activeItem === "Settings"
              ? "bg-white text-black shadow-sm"
              : "text-gray-600 hover:bg-white hover:text-black"
          }`}
        >
          <Settings
            size={20}
            strokeWidth={activeItem === "Settings" ? 2 : 1.5}
          />
          <span className="text-sm font-medium">Settings</span>
        </button>
      </div>
    </div>
  );
}
