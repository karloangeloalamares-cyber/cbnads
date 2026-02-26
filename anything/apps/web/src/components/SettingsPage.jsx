"use client";

import { useState } from "react";
import ProfileSettings from "./ProfileSettings";
import TeamSettings from "./TeamSettings";
import NotificationSettings from "./NotificationSettings";
import AdSchedulingSettings from "./AdSchedulingSettings";
import SystemSettings from "./SystemSettings";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "team", label: "Team" },
    { id: "general", label: "General" },
    { id: "scheduling", label: "Ad Scheduling" },
    { id: "billing", label: "Billing" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-[1200px] mx-auto py-10 px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Settings
          </h1>
          <p className="text-sm text-gray-500">
            Manage your account settings and team members
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "profile" && <ProfileSettings />}
          {activeTab === "team" && <TeamSettings />}
          {activeTab === "general" && <NotificationSettings />}
          {activeTab === "scheduling" && <AdSchedulingSettings />}
          {activeTab === "billing" && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-gray-600">Billing settings coming soon...</p>
            </div>
          )}
          {activeTab === "system" && <SystemSettings />}
        </div>
      </div>
    </div>
  );
}
