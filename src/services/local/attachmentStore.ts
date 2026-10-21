/*
 * Local binary storage for attachments (IndexedDB). Files stay in THIS
 * browser only: they are not shared, synced or backed up.
 */

const DB = 'sigr-attachments'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no permite guardar archivos localmente.'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir el almacenamiento local de archivos.'))
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = () => resolve(req.result)
        t.onerror = () => reject(t.error ?? new Error('Error de almacenamiento local.'))
        t.onabort = () => reject(t.error ?? new Error('No se pudo guardar el archivo (¿espacio insuficiente?).'))
      }),
  )
}

export const saveFile = (id: string, file: Blob) => tx('readwrite', (s) => s.put(file, id)).then(() => undefined)
export const loadFile = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
export const deleteFile = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined)
