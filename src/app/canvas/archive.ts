import type { Copies, El, Grad, Paper } from "./model";

/* Archivo de diseños con nombre, en IndexedDB (las imágenes no caben en localStorage). */

export type Doc = { paper: Paper; copies: Copies; pages: El[][]; tables: string[]; bg?: string; bgGrad?: Grad }; // bg: color de la hoja (#rrggbb) y bgGrad su degradado; los diseños antiguos no los traen
export type Design = { id: string; name: string; savedAt: number; doc: Doc };

const DB = "menudo-canvas";
const STORE = "designs";

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

export const designs = {
  // Más recientes primero
  async list(): Promise<Design[]> {
    return (await tx<Design[]>("readonly", (s) => s.getAll())).sort((a, b) => b.savedAt - a.savedAt);
  },
  save: (d: Design) => tx("readwrite", (s) => s.put(d)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};
