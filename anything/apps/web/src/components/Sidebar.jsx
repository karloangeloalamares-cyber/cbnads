"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Calendar,
  FileText,
  MessageCircle,
  Users,
  Megaphone,
  Package,
  CreditCard,
  Settings,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSubmissionNotifications } from "@/hooks/useSubmissionNotifications";
import { can, getVisibleSectionsForRole, normalizeAppRole } from "@/lib/permissions";

const menuItemsCatalog = [
  { icon: LayoutDashboard, label: "Dashboard", id: "Dashboard" },
  { icon: Calendar, label: "Calendar", id: "Calendar" },
  { icon: FileText, label: "Submissions", id: "Submissions", showBadge: true },
  { icon: MessageCircle, label: "WhatsApp", id: "WhatsApp" },
  { icon: Users, label: "Advertisers", id: "Advertisers" },
  { icon: Megaphone, label: "Ads", id: "Ads" },
  { icon: Package, label: "Products", id: "Products" },
  { icon: CreditCard, label: "Billing", id: "Billing" },
  { icon: AlertTriangle, label: "Reconciliation", id: "Reconciliation" },
];

export default function Sidebar({
  activeItem = "Ads",
  onNavigate,
  userRole = "admin",
  mobileOpen = false,
  onClose,
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const normalizedRole = normalizeAppRole(userRole);
  const isInternal = normalizedRole !== "advertiser";
  const canViewSettings = can(normalizedRole, "settings:view");
  const markAllAsReadRef = useRef(async () => {});
  const handleViewPendingFromToast = useCallback(async () => {
    await markAllAsReadRef.current();
    if (onNavigate) {
      onNavigate("Submissions");
    }
  }, [onNavigate]);
  const { unreadCount, markAllAsRead } = useSubmissionNotifications(
    can(normalizedRole, "notifications:view"),
    {
    onViewPending: handleViewPendingFromToast,
    },
  );
  markAllAsReadRef.current = markAllAsRead;
  const visibleSections = new Set(getVisibleSectionsForRole(normalizedRole));
  const menuItems = menuItemsCatalog.filter((item) => visibleSections.has(item.id));

  useEffect(() => {
    const syncViewport = () => {
      const width = window.innerWidth;
      setIsMobileViewport(width < 768);
      setIsMinimized(width >= 768 && width < 1280);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const handleNavigate = (item) => {
    if (isInternal && item.id === "Submissions" && unreadCount > 0) {
      markAllAsRead();
    }

    if (onNavigate) {
      onNavigate(item.id);
    }

    if (isMobileViewport && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-[#F7F8FA] border-r border-gray-200 h-screen flex flex-col transition-all duration-300 md:static md:z-auto ${isMinimized ? "md:w-[72px]" : "md:w-[220px]"} w-[220px] ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
      <div className="p-6 flex items-center justify-between">
        {!isMinimized && (
          <>
            <img
              src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
              alt="Logo"
              className="w-10 h-10 rounded-lg"
            />
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="Minimize sidebar"
              type="button"
              disabled={isMobileViewport}
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
          </>
        )}

        {isMinimized && (
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-gray-200 rounded transition-colors mx-auto"
            title="Expand sidebar"
            type="button"
            disabled={isMobileViewport}
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeItem;
          const badge = item.showBadge && unreadCount > 0 ? unreadCount : null;
          const hasBadge = badge != null;

          return (
            <div key={item.label} className="relative group">
              <button
                onClick={() => handleNavigate(item)}
                type="button"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${isActive ? "bg-white text-black shadow-sm" : "text-gray-600 hover:bg-white hover:text-black"} ${isMinimized ? "justify-center" : ""}`}
              >
                <div className="relative">
                  <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                  {hasBadge && isMinimized && (
                    <div className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-[#ED1D26] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 animate-[pulse_2s_ease-in-out_infinite]">
                      {badge > 99 ? "99+" : badge}
                    </div>
                  )}
                </div>

                {!isMinimized && (
                  <div className="flex items-center justify-between flex-1">
                    <span className="text-sm font-medium">{item.label}</span>
                    {hasBadge && (
                      <span className="min-w-[20px] h-[20px] bg-[#ED1D26] text-white text-[11px] font-semibold rounded-full flex items-center justify-center px-1.5 animate-[pulse_2s_ease-in-out_infinite]">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {isMinimized && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap pointer-events-none z-50">
                  {item.label}
                  {hasBadge ? ` (${badge})` : ""}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {canViewSettings ? (
        <div className="p-3 border-t border-gray-200">
          <div className="relative group">
            <button
              onClick={() => {
                if (onNavigate) onNavigate("Settings");
                if (isMobileViewport && onClose) {
                  onClose();
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeItem === "Settings" ? "bg-white text-black shadow-sm" : "text-gray-600 hover:bg-white hover:text-black"} ${isMinimized ? "justify-center" : ""}`}
              type="button"
            >
              <Settings
                size={20}
                strokeWidth={activeItem === "Settings" ? 2 : 1.5}
              />
              {!isMinimized && <span className="text-sm font-medium">Settings</span>}
            </button>

            {isMinimized && (
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap pointer-events-none z-50">
                Settings
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
              </div>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}
