// Pysyvä tallennus IndexedDB:hen. Kaikki laitteessa, ei verkkoa.

const DB_NAME = 'sprint30';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('athletes')) {
        db.createObjectStore('athletes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('runs')) {
        const runs = db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
        runs.createIndex('athleteId', 'athleteId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = work(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => {
      resolve(result && typeof result.result !== 'undefined' ? result.result : result);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

export function listAthletes() {
  return tx('athletes', 'readonly', (store) => store.getAll())
    .then((rows) => (rows || []).sort((a, b) => a.name.localeCompare(b.name, 'fi')));
}

export function addAthlete(name) {
  return tx('athletes', 'readwrite', (store) => store.add({
    name: name.trim(),
    createdAt: new Date().toISOString()
  }));
}

export function deleteAthlete(id) {
  return tx('athletes', 'readwrite', (store) => store.delete(id))
    .then(() => tx('runs', 'readwrite', (store) => {
      const index = store.index('athleteId');
      const request = index.openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      return null;
    }));
}

export function addRun(run) {
  return tx('runs', 'readwrite', (store) => store.add(run));
}

export function deleteRun(id) {
  return tx('runs', 'readwrite', (store) => store.delete(id));
}

export function listRuns(athleteId) {
  return tx('runs', 'readonly', (store) => store.index('athleteId').getAll(IDBKeyRange.only(athleteId)))
    .then((rows) => (rows || []).sort((a, b) => a.at.localeCompare(b.at)));
}

export function listAllRuns() {
  return tx('runs', 'readonly', (store) => store.getAll())
    .then((rows) => (rows || []).sort((a, b) => a.at.localeCompare(b.at)));
}
