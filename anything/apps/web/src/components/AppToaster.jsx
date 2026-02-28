"use client";

import { Toaster } from "sonner";

export default function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      expand={false}
      closeButton={false}
      richColors={false}
      visibleToasts={4}
      offset={24}
      mobileOffset={16}
      toastOptions={{
        unstyled: true,
        duration: 3600,
      }}
    />
  );
}
