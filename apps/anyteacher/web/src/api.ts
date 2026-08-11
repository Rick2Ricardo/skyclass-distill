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

export async function streamNdjson<T>(
  path: string,
  init: RequestInit,
  onEvent: (event: T) => void | Promise<void>,
): Promise<void> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/x-ndjson");
  const response = await fetch(path, { ...init, headers });
  if (!response.ok || !response.body) {
    const payload = await response.text().catch(() => "");
    throw new ApiError(payload || `HTTP ${response.status}`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = async (final = false): Promise<void> => {
    const lines = buffer.split("\n");
    buffer = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      await onEvent(JSON.parse(line) as T);
    }
    if (final && buffer.trim()) await onEvent(JSON.parse(buffer) as T);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    await consume();
  }
  buffer += decoder.decode();
  await consume(true);
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
