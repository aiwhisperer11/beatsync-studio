// Imágenes por frase, guardadas en IndexedDB (localStorage no admite archivos grandes).
const BeatSyncImages = (() => {
  const DB_NAME = 'beatsync-media';
  const STORE = 'images';
  let dbPromise = null;

  const openDb = () =>
    (dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  async function run(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    put: (cueId, blob) => run('readwrite', s => s.put(blob, cueId)),
    get: cueId => run('readonly', s => s.get(cueId)),
    remove: cueId => run('readwrite', s => s.delete(cueId)),
  };
})();

if (typeof module !== 'undefined') module.exports = BeatSyncImages;
