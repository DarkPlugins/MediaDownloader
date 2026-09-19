const DATABASE = "media-downloader-folders";

async function directoryStore(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("directories");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("directories", mode);
      const request = operation(transaction.objectStore("directories"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Folder storage was interrupted."));
    });
  } finally {
    database.close();
  }
}

export async function rememberDirectory(handle) {
  // Immutable IDs let in-flight downloads keep their original destination.
  const id = crypto.randomUUID();
  await directoryStore("readwrite", store => store.put(handle, id));
  return id;
}

export async function getDirectory(id) {
  const handle = await directoryStore("readonly", store => store.get(id));
  if (!handle) throw new Error("The saved folder is unavailable. Choose it again with Browse in the popup.");
  return handle;
}

export async function writeFile(handle, blob) {
  const writer = await handle.createWritable();
  try {
    await writer.write(blob);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}
