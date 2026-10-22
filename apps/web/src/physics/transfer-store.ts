import {
  importPhysicsBundleSchema,
  type ImportPhysicsBundle,
} from "@island/contracts";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("island-physics-transfer", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("requests");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function transferRequest(
  key: string,
  value?: ImportPhysicsBundle | null,
): Promise<ImportPhysicsBundle | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
          "requests",
          value === undefined ? "readonly" : "readwrite",
        ),
        store = transaction.objectStore("requests");
      const request =
        value === undefined
          ? store.get(key)
          : value === null
            ? store.delete(key)
            : store.put(value, key);
      let result: ImportPhysicsBundle | null = null;
      request.onsuccess = () => {
        if (value === undefined && request.result) {
          try {
            result = importPhysicsBundleSchema.parse(request.result);
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("本机导入记录保存失败"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
