/**
 * Presigned URL Upload
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 *
 * Direct upload using presigned URLs for smaller files.
 */

import * as fs from "fs";
import * as path from "path";
import { secureAuthManager } from "../../config/store";
import { buildApiUrl } from "../../config/api";
import { createSignedHeaders, refreshAccessToken } from "./auth-helpers";
import type { MultipartUploadResult } from "./multipart-upload";

/**
 * Perform direct upload using presigned URL
 */
export async function performDirectUpload(
  videoPath: string,
  fileSize: number,
  token: string,
  onProgress?: (progress: number) => void,
  multipartUpload?: {
    upload: (
      videoPath: string,
      fileSize: number,
      token: string,
      onProgress?: (progress: number) => void
    ) => Promise<MultipartUploadResult>;
  }
): Promise<{
  success: boolean;
  publicUrl?: string;
  key?: string;
  error?: string;
  localOnly?: boolean;
}> {
  const filename = path.basename(videoPath);

  // Request presigned URL
  const presignedBody = {
    filename,
    contentType: "video/mp4",
    contentLength: fileSize,
    type: "video",
  };

  const presignedBodyString = JSON.stringify(presignedBody);
  const signedHeaders = createSignedHeaders(presignedBodyString);

  const doPresignedRequest = async (authToken: string) =>
    fetch(buildApiUrl("UPLOAD"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...signedHeaders,
      },
      body: presignedBodyString,
    });

  let authToken = token;
  let presignedResponse = await doPresignedRequest(authToken);

  if (
    (presignedResponse.status === 401 || presignedResponse.status === 403) &&
    (await refreshAccessToken())
  ) {
    const refreshedToken = secureAuthManager.getAccessToken() || token;
    authToken = refreshedToken;
    presignedResponse = await doPresignedRequest(authToken);
  }

  if (!presignedResponse.ok) {
    await presignedResponse.text().catch(() => "");
    return {
      success: false,
      error: `Failed to get upload URL: ${presignedResponse.status}`,
      localOnly: true,
    };
  }

  const presignedData = (await presignedResponse.json()) as {
    strategy?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
    publicUrl?: string;
    key?: string;
    cdnUrl?: string | null;
    partSize?: number;
    expiresAt?: number;
  };

  // If server says multipart, we need to use that instead
  if (presignedData.strategy === "multipart" && multipartUpload) {
    return multipartUpload.upload(videoPath, fileSize, authToken, onProgress);
  }

  if (onProgress) onProgress(30);

  // Upload to S3
  const videoBuffer = await fs.promises.readFile(videoPath);

  if (onProgress) onProgress(50);

  if (!presignedData.uploadUrl || !presignedData.headers) {
    return {
      success: false,
      error: "Invalid presigned URL data",
      localOnly: true,
    };
  }

  const s3Response = await fetch(presignedData.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": fileSize.toString(),
      ...presignedData.headers,
    },
    body: videoBuffer,
  });

  if (!s3Response.ok) {
    return {
      success: false,
      error: `S3 upload failed: ${s3Response.status}`,
      localOnly: true,
    };
  }

  if (onProgress) onProgress(85);

  return {
    success: true,
    publicUrl: (presignedData as any).cdnUrl || presignedData.publicUrl || "",
    key: presignedData.key || "",
  };
}
