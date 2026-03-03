import * as React from 'react';
import { bucketName, getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

async function uploadFileDirectly(file) {
  const signResponse = await fetch("/api/upload/signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    }),
  });

  if (!signResponse.ok) {
    throw new Error("Upload failed");
  }

  const signedUpload = await signResponse.json();
  const supabase = getSupabaseClient();
  const targetBucket = String(signedUpload.bucket || "").trim() || bucketName("uploads");
  const targetPath = String(signedUpload.path || "").trim();
  const uploadToken = String(signedUpload.token || "").trim();

  if (!targetPath || !uploadToken) {
    throw new Error("Upload failed");
  }

  const { error } = await supabase.storage.from(targetBucket).uploadToSignedUrl(
    targetPath,
    uploadToken,
    file,
    {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    },
  );

  if (error) {
    throw new Error(error.message || "Upload failed");
  }

  const publicUrl =
    String(signedUpload.publicUrl || "").trim() ||
    supabase.storage.from(targetBucket).getPublicUrl(targetPath).data.publicUrl;

  return {
    url: publicUrl,
    mimeType: file.type || null,
  };
}

function useUpload() {
  const [loading, setLoading] = React.useState(false);
  const upload = React.useCallback(async (input) => {
    try {
      setLoading(true);
      let response;
      if ("file" in input && input.file) {
        const file = input.file;
        if (hasSupabaseConfig) {
          return await uploadFileDirectly(file);
        }

        const arrayBuffer = await file.arrayBuffer();
        response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Mime-Type": file.type
          },
          body: arrayBuffer
        });
      } else if ("url" in input) {
        response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url: input.url })
        });
      } else if ("base64" in input) {
        response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ base64: input.base64 })
        });
      } else {
        response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream"
          },
          body: input.buffer
        });
      }
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("Upload failed: File too large.");
        }
        throw new Error("Upload failed");
      }
      const data = await response.json();
      return { url: data.url, mimeType: data.mimeType || null };
    } catch (uploadError) {
      if (uploadError instanceof Error) {
        return { error: uploadError.message };
      }
      if (typeof uploadError === "string") {
        return { error: uploadError };
      }
      return { error: "Upload failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  return [upload, { loading }];
}

export { useUpload };
export default useUpload;
