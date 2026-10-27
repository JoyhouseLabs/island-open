let database: Promise<IDBDatabase> | undefined;
function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mind-island", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => {
      const conn = request.result;
      // Another tab may upgrade the database (future versions): let go of
      // this connection instead of blocking the upgrade, and drop the
      // cached handle so the next operation reopens cleanly. `close` also
      // fires `onclose`, which does the same for abnormal shutdowns.
      conn.onversionchange = () => conn.close();
      conn.onclose = () => {
        database = undefined;
      };
      resolve(conn);
    };
    request.onerror = () => {
      // One failed open (private mode, transient quota, busy store) must
      // not poison every later draft read: clear the cache so the next
      // call tries again instead of reusing the rejected promise forever.
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
export async function readDraft<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("drafts");
    const r = tx.objectStore("drafts").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    // Aborts (quota, connection loss mid-read) need a definite outcome
    // too, or callers hang on a promise that already "succeeded" nothing.
    tx.onabort = () => reject(tx.error ?? new Error("draft read aborted"));
  });
}
export async function writeDraft(key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("draft write aborted"));
  });
}
