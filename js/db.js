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
 *
 * NOTA DE ROBUSTEZ (v2.2):
 *  Las operaciones de escritura (add/put/remove/clear) esperan al evento
 *  `transaction.oncomplete` antes de resolver la promesa. Esto garantiza que
 *  los datos realmente se persistieron a disco, incluso si el navegador
 *  cierra la pestaña justo después. Antes solo se esperaba `request.onsuccess`,
 *  lo cual podía reportar éxito en transacciones que el navegador abortaba al
 *  background (especialmente en iOS Safari y Android con poca RAM).
 *  Además, cada escritura exitosa emite un evento `db:changed` en `window`
 *  para que otros módulos (respaldo automático) puedan reaccionar.
 */

const DB_NAME = 'aquagestion';
const DB_VERSION = 4;

/* ---------- EventBus interno: emite 'db:changed' en cada escritura ---------- */
let _changeDebounce = null;
function notificarCambio() {
  // Debounce ligero: si hay varias escrituras seguidas en la misma tick,
  // emitimos un solo evento.
  if (_changeDebounce) clearTimeout(_changeDebounce);
  _changeDebounce = setTimeout(() => {
    try { window.dispatchEvent(new CustomEvent('db:changed')); } catch (e) { /* noop */ }
    _changeDebounce = null;
  }, 150);
}

export const STORES = {
  clientes: 'clientes',
  pedidos: 'pedidos',
  pagos: 'pagos',
  rutas: 'rutas',
  gastos: 'gastos',
  mantenimiento: 'mantenimiento',
  inventario: 'inventario',
  config: 'config'
};

let _dbPromise = null;
let _db = null;

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

      // v2: almacén de gastos para medir la utilidad real del negocio.
      if (!db.objectStoreNames.contains(STORES.gastos)) {
        const s = db.createObjectStore(STORES.gastos, { keyPath: 'id', autoIncrement: true });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('categoria', 'categoria', { unique: false });
      }

      // v3: bitácora de mantenimiento y calidad (trazabilidad técnica).
      if (!db.objectStoreNames.contains(STORES.mantenimiento)) {
        const s = db.createObjectStore(STORES.mantenimiento, { keyPath: 'id', autoIncrement: true });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('tipo', 'tipo', { unique: false });
      }

      // v4: inventario de garrafones (nuevos / usados) por movimientos.
      if (!db.objectStoreNames.contains(STORES.inventario)) {
        const s = db.createObjectStore(STORES.inventario, { keyPath: 'id', autoIncrement: true });
        s.createIndex('fecha', 'fecha', { unique: false });
        s.createIndex('tipo', 'tipo', { unique: false });
        s.createIndex('pedidoId', 'pedidoId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'clave' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/**
 * Devuelve { store, transaction } para operaciones que necesitan acceder a la
 * transacción completa (esperar oncomplete). En lecturas, transaction puede
 * ignorarse. El nombre de la función es openTx (no tx) para evitar colisión
 * con la variable local `transaction` en quien la invoca.
 */
function openTx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const t = db.transaction(storeName, mode);
    return { store: t.objectStore(storeName), transaction: t };
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Espera a que la transacción se complete (datos realmente en disco) y
 * resuelve con el valor que devolvió el request. Si la transacción aborta
 * (ej. navegador cerró la pestaña, quota excedida), rechaza con el error.
 */
function reqWithTx(request, transaction) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let result;
    request.onsuccess = () => { result = request.result; /* esperar al tx */ };
    request.onerror = () => { if (!resolved) { resolved = true; reject(request.error); } };
    transaction.oncomplete = () => {
      if (!resolved) { resolved = true; resolve(result); }
    };
    transaction.onabort = () => {
      if (!resolved) { resolved = true; reject(transaction.error || new Error('Transacción abortada')); }
    };
    transaction.onerror = () => {
      if (!resolved) { resolved = true; reject(transaction.error || request.error || new Error('Error en transacción')); }
    };
  });
}

/* ---------- API genérico CRUD ---------- */

export async function getAll(storeName) {
  const { store } = await openTx(storeName);
  return reqToPromise(store.getAll());
}

export async function get(storeName, id) {
  const { store } = await openTx(storeName);
  return reqToPromise(store.get(id));
}

export async function add(storeName, value) {
  const { store, transaction } = await openTx(storeName, 'readwrite');
  const id = await reqWithTx(store.add(value), transaction);
  notificarCambio();
  return id;
}

export async function put(storeName, value) {
  const { store, transaction } = await openTx(storeName, 'readwrite');
  const r = await reqWithTx(store.put(value), transaction);
  notificarCambio();
  return r;
}

export async function remove(storeName, id) {
  const { store, transaction } = await openTx(storeName, 'readwrite');
  const r = await reqWithTx(store.delete(id), transaction);
  notificarCambio();
  return r;
}

export async function clear(storeName) {
  const { store, transaction } = await openTx(storeName, 'readwrite');
  const r = await reqWithTx(store.clear(), transaction);
  notificarCambio();
  return r;
}

export async function getByIndex(storeName, indexName, value) {
  const { store } = await openTx(storeName);
  const idx = store.index(indexName);
  return reqToPromise(idx.getAll(value));
}

export async function count(storeName) {
  const { store } = await openTx(storeName);
  return reqToPromise(store.count());
}

/* ---------- Configuración (clave/valor) ---------- */

const DEFAULT_CONFIG = {
  negocio: 'Mi Purificadora',
  precioDomicilio: 20,
  precioVentanilla: 15,
  precioCanje: 50,
  moneda: 'MXN',
  respaldoAuto: true,
  ultimoRespaldo: null,
  configurado: false
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
  const [clientes, pedidos, pagos, rutas, gastos, mantenimiento, inventario, config] = await Promise.all([
    getAll(STORES.clientes),
    getAll(STORES.pedidos),
    getAll(STORES.pagos),
    getAll(STORES.rutas),
    getAll(STORES.gastos),
    getAll(STORES.mantenimiento),
    getAll(STORES.inventario),
    getAll(STORES.config)
  ]);
  return {
    app: 'AquaGestion',
    version: DB_VERSION,
    exportadoEn: new Date().toISOString(),
    datos: { clientes, pedidos, pagos, rutas, gastos, mantenimiento, inventario, config }
  };
}

export async function importAll(backup, { merge = false } = {}) {
  if (!backup || !backup.datos) throw new Error('Respaldo inválido');
  const d = backup.datos;
  const db = await openDB();

  const storesToWrite = [STORES.clientes, STORES.pedidos, STORES.pagos, STORES.rutas, STORES.gastos, STORES.mantenimiento, STORES.inventario, STORES.config];
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
    (d.gastos || []).forEach((r) => t.objectStore(STORES.gastos).put(r));
    (d.mantenimiento || []).forEach((r) => t.objectStore(STORES.mantenimiento).put(r));
    (d.inventario || []).forEach((r) => t.objectStore(STORES.inventario).put(r));
    (d.config || []).forEach((r) => t.objectStore(STORES.config).put(r));
  });
  notificarCambio();
}

/**
 * Reinicio total de fábrica: elimina toda la base de datos (datos + configuración)
 * y la recrea vacía. A diferencia de clear(), esto SÍ reinicia los contadores
 * autoincrement, por lo que el primer cliente vuelve a ser el N.º 001.
 * Tras llamarla, la app vuelve a su estado inicial (pedirá la configuración).
 */
export async function resetAll() {
  if (_db) { _db.close(); _db = null; }
  _dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // continúa aunque otra pestaña la tenga abierta
  });
  await openDB(); // recrea los almacenes vacíos con contadores en cero
  notificarCambio();
}

export default {
  STORES, getAll, get, add, put, remove, clear, getByIndex, count,
  getConfig, setConfig, setConfigBulk, dumpAll, importAll, resetAll
};
