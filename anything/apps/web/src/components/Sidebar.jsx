"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
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
  X,
} from "lucide-react";
import { useResponsiveViewport } from "@/hooks/useResponsiveViewport";
import { useSubmissionNotifications } from "@/hooks/useSubmissionNotifications";
import { can, getVisibleSectionsForRole, normalizeAppRole } from "@/lib/permissions";

const menuItemsCatalog = [
  { icon: LayoutDashboard, label: "Dashboard", id: "Dashboard" },
  { icon: PlusCircle, label: "Create Ad", id: "Create Ad" },
  { icon: Calendar, label: "Calendar", id: "Calendar" },
  { icon: FileText, label: "Submissions", id: "Submissions", badgeType: "submissions" },
  { icon: MessageCircle, label: "WhatsApp", id: "WhatsApp" },
  { icon: Users, label: "Advertisers", id: "Advertisers" },
  { icon: Megaphone, label: "Ads", id: "Ads", badgeType: "ads" },
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
  unreadCount: externalUnreadCount,
  onMarkAllAsRead,
  adsUnreadCount = 0,
  onClearAdsUnread,
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const { isPhone, isTablet } = useResponsiveViewport();
  const normalizedRole = normalizeAppRole(userRole);
  const isInternal = normalizedRole !== "advertiser";
  const canViewSettings = can(normalizedRole, "settings:view");
  const markAllAsReadRef = useRef(async () => {});
  const useInternalNotifications =
    typeof externalUnreadCount !== "number" || typeof onMarkAllAsRead !== "function";
  const handleViewPendingFromToast = useCallback(async () => {
    await markAllAsReadRef.current();
    if (onNavigate) {
      onNavigate("Submissions");
    }
  }, [onNavigate]);
  const internalNotifications = useSubmissionNotifications(
    useInternalNotifications && can(normalizedRole, "notifications:view"),
    {
      onViewPending: handleViewPendingFromToast,
    },
  );
  const unreadCount = useInternalNotifications
    ? internalNotifications.unreadCount
    : externalUnreadCount;
  const markAllAsRead = useInternalNotifications
    ? internalNotifications.markAllAsRead
    : onMarkAllAsRead;
  markAllAsReadRef.current = async () => {
    await markAllAsRead?.();
  };
  const visibleSections = new Set(getVisibleSectionsForRole(normalizedRole));
  const menuItems = menuItemsCatalog.filter((item) => visibleSections.has(item.id));

  useEffect(() => {
    setIsMinimized(isTablet);
  }, [isTablet]);

  const handleNavigate = (item) => {
    if (isInternal && item.id === "Submissions" && unreadCount > 0) {
      void markAllAsRead?.();
    }
    if (item.id === "Ads" && adsUnreadCount > 0) {
      onClearAdsUnread?.();
    }

    if (onNavigate) {
      onNavigate(item.id);
    }

    if (isPhone && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`safe-pb fixed inset-y-0 left-0 z-50 flex h-app-screen w-[min(19.5rem,calc(100vw-0.75rem))] flex-col border-r border-gray-200 bg-[#F7F8FA] shadow-xl transition-all duration-300 md:static md:z-auto md:shadow-none ${isMinimized ? "md:w-[88px]" : "md:w-[240px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
      <div className="safe-top-pad flex items-center justify-between border-b border-gray-200 px-4 pb-4">
        {!isMinimized && (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                alt="Logo"
                className="h-10 w-10 rounded-xl"
              />
              <div className="min-w-0 md:hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Navigation
                </p>
                <p className="truncate text-sm font-semibold text-gray-900">CBN Ads</p>
              </div>
            </div>
            {isPhone ? (
              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
                type="button"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            ) : (
              <button
                onClick={() => setIsMinimized(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-200"
                title="Minimize sidebar"
                type="button"
              >
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
            )}
          </>
        )}

        {isMinimized && (
          <button
            onClick={() => setIsMinimized(false)}
            className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-200"
            title="Expand sidebar"
            type="button"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeItem;
          let badge = null;
          if (item.badgeType === "submissions" && unreadCount > 0) {
            badge = unreadCount;
          }
          if (item.badgeType === "ads" && adsUnreadCount > 0) {
            badge = adsUnreadCount;
          }
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
        <div className="border-t border-gray-200 p-3">
          <div className="relative group">
            <button
              onClick={() => {
                if (onNavigate) onNavigate("Settings");
                if (isPhone && onClose) {
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
      </aside>
    </>
  );
}
