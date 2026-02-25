"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, LogOut, ChevronDown, Settings } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import AdsList from "@/components/AdsList";
import NewAdForm from "@/components/NewAdForm";
import BillingForm from "@/components/BillingForm";
import AdvertisersList from "@/components/AdvertisersList";
import NewAdvertiserForm from "@/components/NewAdvertiserForm";
import ProductsList from "@/components/ProductsList";
import SettingsPage from "@/components/SettingsPage";
import PendingSubmissionsList from "@/components/PendingSubmissionsList";
import InvoicesList from "@/components/InvoicesList";
import NewInvoiceForm from "@/components/NewInvoiceForm";
import useUser from "@/utils/useUser";

export default function AdsPage() {
  const { data: user, loading: userLoading } = useUser();
  const [view, setView] = useState("list");
  const [activeSection, setActiveSection] = useState("Ads");
  const [adData, setAdData] = useState(null);
  const [editingAd, setEditingAd] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [showAdvertiserForm, setShowAdvertiserForm] = useState(false);
  const [advertiserRefreshKey, setAdvertiserRefreshKey] = useState(0);
  const [invoiceRefreshKey, setInvoiceRefreshKey] = useState(0);
  const [adsRefreshKey, setAdsRefreshKey] = useState(0);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showProfileDropdown]);

  // Fetch user role
  useEffect(() => {
    const fetchRole = async () => {
      try {
        const response = await fetch("/api/user/role");
        if (!response.ok) {
          throw new Error("Failed to fetch role");
        }
        const data = await response.json();
        setUserRole(data.user?.role);
      } catch (error) {
        console.error("Error fetching user role:", error);
      } finally {
        setRoleLoading(false);
      }
    };

    if (user) {
      fetchRole();
    } else if (!userLoading) {
      setRoleLoading(false);
    }
  }, [user, userLoading]);

  const handleNavigate = (section) => {
    setActiveSection(section);
    setView("list");
    setEditingAd(null);
    setShowAdvertiserForm(false);
  };

  const handleCreateNew = () => {
    setEditingAd(null);
    setView("create");
  };

  const handleEditAd = (ad) => {
    setEditingAd(ad);
    setView("create");
  };

  const handleContinueToBilling = (formData) => {
    setAdData(formData);
    setView("billing");
  };

  const handleBackToAdDetails = () => {
    // Keep the adData so the form can restore it
    setView("create");
  };

  const handleAdFormSuccess = () => {
    setEditingAd(null);
    setView("list");
    setAdsRefreshKey((prev) => prev + 1);
  };

  const handleBillingSuccess = () => {
    setView("list");
    setAdsRefreshKey((prev) => prev + 1);
    setInvoiceRefreshKey((prev) => prev + 1);
  };

  const handleCreateNewAdvertiser = () => {
    setShowAdvertiserForm(true);
  };

  const handleAdvertiserFormCancel = () => {
    setShowAdvertiserForm(false);
  };

  const handleAdvertiserFormSuccess = () => {
    setShowAdvertiserForm(false);
    setAdvertiserRefreshKey((prev) => prev + 1);
  };

  const handleCreateNewInvoice = () => {
    setView("newInvoice");
  };

  const handleInvoiceFormCancel = () => {
    setView("list");
  };

  const handleInvoiceFormSuccess = () => {
    setView("list");
    setInvoiceRefreshKey((prev) => prev + 1);
  };

  // Loading state
  if (userLoading || roleLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/account/signin";
    }
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-600">Redirecting to sign in...</p>
      </div>
    );
  }

  // Not admin
  if (userRole !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600 mb-6">
            You don't have admin access to this page. Please contact an
            administrator.
          </p>
          <a
            href="/account/logout"
            className="inline-block px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
          >
            Sign Out
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeItem={activeSection} onNavigate={handleNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - only show for list view */}
        {view === "list" && !showAdvertiserForm && (
          <header className="h-16 border-b border-gray-200 flex items-center justify-end px-8 gap-4 flex-shrink-0">
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <Bell size={20} className="text-gray-600" />
            </button>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">
                  {user.name || user.email}
                </span>
                <div className="w-10 h-10 rounded-full bg-[#F4E4D7] overflow-hidden flex items-center justify-center">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-700">
                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className="text-gray-600" />
              </button>

              {/* Dropdown Menu */}
              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      handleNavigate("Settings");
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full text-left"
                  >
                    <Settings size={16} />
                    Profile Settings
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <a
                    href="/account/logout"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </a>
                </div>
              )}
            </div>
          </header>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {view === "list" && activeSection === "Dashboard" && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Dashboard view coming soon...</p>
            </div>
          )}
          {view === "list" && activeSection === "Tasks" && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Tasks view coming soon...</p>
            </div>
          )}
          {view === "list" && activeSection === "Reports" && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Reports view coming soon...</p>
            </div>
          )}
          {view === "list" && activeSection === "Billing" && (
            <InvoicesList
              onCreateNew={handleCreateNewInvoice}
              key={invoiceRefreshKey}
            />
          )}
          {view === "list" && activeSection === "Ads" && (
            <AdsList
              onCreateNew={handleCreateNew}
              onEditAd={handleEditAd}
              key={adsRefreshKey}
            />
          )}
          {view === "list" && activeSection === "Submissions" && (
            <PendingSubmissionsList />
          )}
          {view === "list" &&
            activeSection === "Advertisers" &&
            !showAdvertiserForm && (
              <AdvertisersList
                onCreateNew={handleCreateNewAdvertiser}
                key={advertiserRefreshKey}
              />
            )}
          {view === "list" &&
            activeSection === "Advertisers" &&
            showAdvertiserForm && (
              <NewAdvertiserForm
                onCancel={handleAdvertiserFormCancel}
                onSuccess={handleAdvertiserFormSuccess}
              />
            )}
          {view === "list" && activeSection === "Products" && <ProductsList />}
          {view === "list" && activeSection === "Calendar" && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Calendar view coming soon...</p>
            </div>
          )}
          {view === "list" && activeSection === "Settings" && <SettingsPage />}

          {view === "create" && (
            <NewAdForm
              editingAd={editingAd}
              onCancel={() => {
                setEditingAd(null);
                setView("list");
              }}
              onSuccess={handleAdFormSuccess}
              onContinueToBilling={handleContinueToBilling}
            />
          )}

          {view === "billing" && (
            <BillingForm
              adData={adData}
              onBack={handleBackToAdDetails}
              onCancel={() => setView("list")}
              onSaveDraft={handleBillingSuccess}
              onPublish={handleBillingSuccess}
            />
          )}

          {view === "newInvoice" && (
            <NewInvoiceForm
              onCancel={handleInvoiceFormCancel}
              onSuccess={handleInvoiceFormSuccess}
            />
          )}
        </main>
      </div>
    </div>
  );
}
