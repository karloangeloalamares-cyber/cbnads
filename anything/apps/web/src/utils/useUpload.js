import * as React from 'react';
import { hasSupabaseConfig, supabaseAnonKey } from "@/lib/supabase";

const FILE_UPLOAD_ENDPOINTS = ["/api/upload", "/_create/api/upload", "/_create/api/upload/"];
const SIGNED_UPLOAD_ENDPOINT = "/api/upload/signed-url";

let preferredFileUploadEndpoint = null;
let signedUploadEndpointAvailable = null;

function getOrderedFileUploadEndpoints() {
  if (!preferredFileUploadEndpoint) {
    return FILE_UPLOAD_ENDPOINTS;
  }

  return [
    preferredFileUploadEndpoint,
    ...FILE_UPLOAD_ENDPOINTS.filter((endpoint) => endpoint !== preferredFileUploadEndpoint),
  ];
}

async function readUploadErrorMessage(response, fallbackMessage) {
  if (response.status === 413) {
    return "Upload failed: File too large.";
  }

  try {
    const contentType = String(response.headers.get("content-type") || "");

    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
            ? payload.message
            : "";

      if (message.trim()) {
        return message.trim();
      }
    } else {
      const text = String(await response.text()).trim();
      if (text) {
        if (/^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text)) {
          return "Upload failed: upload endpoint returned HTML instead of JSON.";
        }
        return text.length > 240 ? `${text.slice(0, 237)}...` : text;
      }
    }
  } catch {
    // Ignore response parsing issues and fall back to a generic message.
  }

  return fallbackMessage;
}

async function fetchUploadResponse(init, fallbackMessage = "Upload failed") {
  const failures = [];

  for (const endpoint of getOrderedFileUploadEndpoints()) {
    let response;

    try {
      response = await fetch(endpoint, init);
    } catch (error) {
      failures.push({
        endpoint,
        status: 0,
        message:
          error instanceof Error && error.message
            ? error.message
            : fallbackMessage,
      });

      continue;
    }

    if (response.ok) {
      preferredFileUploadEndpoint = endpoint;
      return response;
    }

    const message = await readUploadErrorMessage(response, fallbackMessage);
    failures.push({
      endpoint,
      status: response.status,
      message,
    });

    if (response.status === 413) {
      throw new Error(message);
    }
  }

  const bestFailure =
    failures.find((failure) => failure.status && failure.status !== 404) ||
    failures.find((failure) => failure.message) ||
    null;

  throw new Error(bestFailure?.message || fallbackMessage);
}

async function uploadFileViaApi(file) {
  const arrayBuffer = await file.arrayBuffer();
  const response = await fetchUploadResponse({
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Mime-Type": file.type,
    },
    body: arrayBuffer,
  });

  const data = await response.json();
  return { url: data.url, mimeType: data.mimeType || null };
}

async function getSignedUploadPayload(file) {
  if (signedUploadEndpointAvailable === false) {
    return null;
  }

  let signResponse;

  try {
    signResponse = await fetch(SIGNED_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: Number(file.size || 0),
      }),
    });
  } catch {
    return null;
  }

  if (!signResponse.ok) {
    if (signResponse.status === 429) {
      throw new Error(await readUploadErrorMessage(signResponse, "Upload failed"));
    }
    if (signResponse.status === 404 || signResponse.status === 405) {
      signedUploadEndpointAvailable = false;
    }
    return null;
  }

  signedUploadEndpointAvailable = true;
  return signResponse.json();
}

async function uploadFileToSignedUrl(file, signedUpload) {
  const signedUrl = String(signedUpload?.signedUrl || "").trim();
  if (!signedUrl) {
    throw new Error("Upload failed");
  }

  const headers = new Headers({
    "x-upsert": "false",
  });

  const publicKey = String(supabaseAnonKey || "").trim();
  if (publicKey) {
    headers.set("apikey", publicKey);
    headers.set("Authorization", `Bearer ${publicKey}`);
  }

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(await readUploadErrorMessage(response, "Upload failed"));
  }
}

async function uploadFileDirectly(file) {
  const signedUpload = await getSignedUploadPayload(file);
  if (!signedUpload) {
    return uploadFileViaApi(file);
  }

  const publicUrl = String(signedUpload.publicUrl || "").trim();
  if (!publicUrl) {
    return uploadFileViaApi(file);
  }

  await uploadFileToSignedUrl(file, signedUpload);

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
        return await uploadFileViaApi(file);
      } else if ("url" in input) {
        response = await fetchUploadResponse({
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url: input.url })
        });
      } else if ("base64" in input) {
        response = await fetchUploadResponse({
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ base64: input.base64 })
        });
      } else {
        response = await fetchUploadResponse({
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream"
          },
          body: input.buffer
        });
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
