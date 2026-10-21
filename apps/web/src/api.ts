import type { AssetManifest } from "@island/contracts";
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? "服务暂时不可用，请稍后重试。",
      response.status,
    );
  return data as T;
}
let manifestPromise: Promise<AssetManifest> | null = null;
export async function assetBytes(id: string) {
  if (!manifestPromise)
    manifestPromise = api<AssetManifest>("/content/core").catch((e) => {
      manifestPromise = null;
      throw e;
    });
  const manifest = await manifestPromise;
  const asset = manifest.assets.find((a) => a.id === id);
  if (!asset) throw new Error("资源清单缺少指定资源");
  const response = await fetch(asset.url, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("资源下载失败");
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== asset.sha256 || bytes.byteLength !== asset.bytes)
    throw new Error("资源完整性校验失败");
  return bytes;
}
/** Admin-uploaded content asset (immutable, ETag-cached by the server). */
export async function contentAssetBytes(id: string) {
  const response = await fetch(`/api/content/asset/${id}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("资源下载失败");
  return await response.arrayBuffer();
}
