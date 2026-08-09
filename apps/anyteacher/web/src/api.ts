export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof Blob) && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? String((payload as { detail: unknown }).detail)
      : String(payload || `HTTP ${response.status}`);
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

export async function uploadVideo(file: File, uploadId?: string): Promise<{ upload_id: string }> {
  const query = new URLSearchParams({ filename: file.name });
  if (uploadId) query.set("upload_id", uploadId);
  return api<{ upload_id: string }>(`/api/uploads?${query}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}
