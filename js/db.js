/**
 * db.js — Capa de acceso a datos con IndexedDB.
 * Provee un API sencillo tipo "repositorio" para cada almacén (store).
 *
 * Almacenes:
 *  - clientes   : datos del cliente
 *  - pedidos    : pedidos de garrafones
 *  - pagos      : registros de cobranza (pago / adeudo)
 *  - rutas      : rutas diarias agrupando clientes
 *  - config     : pares clave/valor de configuración
 *
 * Diseño preparado para futuras funciones de geolocalización:
 *  cada cliente puede almacenar { lat, lng } sin cambios de esquema.
 */

const DB_NAME = 'aquagestion';
const DB_VERSION = 1;

export const STORES = {
  clientes: 'clientes',
  pedidos: 'pedidos',
  pagos: 'pagos',
  rutas: 'rutas',
  config: 'config'
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.clientes)) {
        const s = db.createObjectStore(STORES.clientes, { keyPath: 'id', autoIncrement: true });
        s.createIndex('nombre', 'nombre', { unique: false });
        s.createIndex('colonia', 'colonia', { unique: false });
        s.createIndex('frecuencia', 'frecuencia', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.pedidos)) {
        const s = db.createObjectStore(STORES.pedidos, { keyPath: 'id', autoIncrement: true });
        s.createIndex('clienteId', 'clienteId', { unique: false });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('estado', 'estado', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.pagos)) {
        const s = db.createObjectStore(STORES.pagos, { keyPath: 'id', autoIncrement: true });
        s.createIndex('clienteId', 'clienteId', { unique: false });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('tipo', 'tipo', { unique: false }); // 'pago' | 'adeudo'
      }

      if (!db.objectStoreNames.contains(STORES.rutas)) {
        const s = db.createObjectStore(STORES.rutas, { keyPath: 'id', autoIncrement: true });
        s.createIndex('fecha', 'fecha', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'clave' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- API genérico CRUD ---------- */

export async function getAll(storeName) {
  const store = await tx(storeName);
  return reqToPromise(store.getAll());
}

export async function get(storeName, id) {
  const store = await tx(storeName);
  return reqToPromise(store.get(id));
}

export async function add(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  const id = await reqToPromise(store.add(value));
  return id;
}

export async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.put(value));
}

export async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.delete(id));
}

export async function clear(storeName) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.clear());
}

export async function getByIndex(storeName, indexName, value) {
  const store = await tx(storeName);
  const idx = store.index(indexName);
  return reqToPromise(idx.getAll(value));
}

export async function count(storeName) {
  const store = await tx(storeName);
  return reqToPromise(store.count());
}

/* ---------- Configuración (clave/valor) ---------- */

const DEFAULT_CONFIG = {
  negocio: 'Mi Purificadora',
  precioDomicilio: 25,
  precioVentanilla: 15,
  moneda: 'MXN',
  respaldoAuto: true,
  ultimoRespaldo: null
};

export async function getConfig() {
  const rows = await getAll(STORES.config);
  const cfg = { ...DEFAULT_CONFIG };
  rows.forEach((r) => { cfg[r.clave] = r.valor; });
  return cfg;
}

export async function setConfig(clave, valor) {
  return put(STORES.config, { clave, valor });
}

export async function setConfigBulk(obj) {
  await Promise.all(Object.entries(obj).map(([clave, valor]) => setConfig(clave, valor)));
}

/* ---------- Respaldo total (export/import completo) ---------- */

export async function dumpAll() {
  const [clientes, pedidos, pagos, rutas, config] = await Promise.all([
    getAll(STORES.clientes),
    getAll(STORES.pedidos),
    getAll(STORES.pagos),
    getAll(STORES.rutas),
    getAll(STORES.config)
  ]);
  return {
    app: 'AquaGestion',
    version: DB_VERSION,
    exportadoEn: new Date().toISOString(),
    datos: { clientes, pedidos, pagos, rutas, config }
  };
}

export async function importAll(backup, { merge = false } = {}) {
  if (!backup || !backup.datos) throw new Error('Respaldo inválido');
  const d = backup.datos;
  const db = await openDB();

  const storesToWrite = [STORES.clientes, STORES.pedidos, STORES.pagos, STORES.rutas, STORES.config];
  await new Promise((resolve, reject) => {
    const t = db.transaction(storesToWrite, 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);

    if (!merge) {
      storesToWrite.forEach((s) => t.objectStore(s).clear());
    }
    (d.clientes || []).forEach((r) => t.objectStore(STORES.clientes).put(r));
    (d.pedidos || []).forEach((r) => t.objectStore(STORES.pedidos).put(r));
    (d.pagos || []).forEach((r) => t.objectStore(STORES.pagos).put(r));
    (d.rutas || []).forEach((r) => t.objectStore(STORES.rutas).put(r));
    (d.config || []).forEach((r) => t.objectStore(STORES.config).put(r));
  });
}

export async function resetAll() {
  await Promise.all([
    clear(STORES.clientes),
    clear(STORES.pedidos),
    clear(STORES.pagos),
    clear(STORES.rutas)
  ]);
}

export default {
  STORES, getAll, get, add, put, remove, clear, getByIndex, count,
  getConfig, setConfig, setConfigBulk, dumpAll, importAll, resetAll
};
