/**
 * utils.js — Utilidades compartidas: formato, fechas, DOM, toast, modal.
 */

/* ---------- DOM helpers ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Crea un elemento con atributos e hijos. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}

/** Escapa HTML para evitar inyección al renderizar texto del usuario. */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Formato ---------- */
let _moneda = 'MXN';
export function setMoneda(m) { _moneda = m || 'MXN'; }

export function dinero(n) {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: _moneda }).format(v);
  } catch {
    return '$' + v.toFixed(2);
  }
}

export function numero(n) {
  return new Intl.NumberFormat('es-MX').format(Number(n) || 0);
}

/**
 * Número de cliente legible para rotular (marcador/plumón) la parte baja del
 * garrafón y poder rastrear de qué cliente provino la última vez. Se basa en el
 * id único que la base de datos asigna automáticamente, por lo que es estable
 * y no se repite. Devuelve null si el cliente aún no tiene id (sin guardar).
 */
export function folioCliente(c) {
  if (!c || c.id == null) return null;
  return String(c.id).padStart(3, '0');
}

/* ---------- Fechas ---------- */
/** Devuelve 'YYYY-MM-DD' en hora local. */
export function hoyISO(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function fechaLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fechaHoraLegible(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Inicio de semana (lunes) como YYYY-MM-DD. */
export function inicioSemanaISO(ref = new Date()) {
  const d = new Date(ref);
  const day = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - day);
  return hoyISO(d);
}

export function inicioMesISO(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  return hoyISO(d);
}

/** Diferencia en días entre dos fechas YYYY-MM-DD. */
export function diasEntre(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/** Suma (o resta) días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
export function sumarDiasISO(iso, n) {
  const d = new Date((iso || hoyISO()) + 'T00:00:00');
  d.setDate(d.getDate() + (Number(n) || 0));
  return hoyISO(d);
}

export function nombreMes(ref = new Date()) {
  return ref.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

/* ---------- Toast ---------- */
export function toast(msg, tipo = 'info', ms = 3000) {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;
  const t = el('div', { class: `toast toast--${tipo}`, role: 'status' }, msg);
  cont.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--show'));
  setTimeout(() => {
    t.classList.remove('toast--show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------- Modal ---------- */
export function abrirModal(titulo, contenido) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  document.getElementById('modalTitle').textContent = titulo;
  body.innerHTML = '';
  if (typeof contenido === 'string') body.innerHTML = contenido;
  else body.appendChild(contenido);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function cerrarModal() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const estabaAbierto = !modal.hidden;
  modal.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('modalBody').innerHTML = '';
  // ROBUSTEZ v2.2: notifica a app.js que el modal se cerró, para que pueda
  // ejecutar una recarga pendiente del Service Worker (que se pospuso para
  // no perder datos del formulario a mitad de captura).
  if (estabaAbierto) {
    try { document.dispatchEvent(new CustomEvent('modal-cerrado')); } catch (e) { /* noop */ }
  }
}

/** Confirmación accesible con botones grandes. Devuelve Promise<boolean>. */
export function confirmar(mensaje, { ok = 'Aceptar', cancel = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const cont = el('div', { class: 'confirm' }, [
      el('p', { class: 'confirm__msg', text: mensaje }),
      el('div', { class: 'confirm__actions' }, [
        el('button', {
          class: 'btn btn--ghost btn--lg', text: cancel,
          onclick: () => { cerrarModal(); resolve(false); }
        }),
        el('button', {
          class: `btn btn--lg ${peligro ? 'btn--danger' : 'btn--primary'}`, text: ok,
          onclick: () => { cerrarModal(); resolve(true); }
        })
      ])
    ]);
    abrirModal('Confirmar', cont);
  });
}

/* ---------- Misc ---------- */
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function descargarArchivo(nombre, contenido, mime) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const FRECUENCIAS = ['Diario', 'Cada 3 días', 'Semanal', 'Quincenal', 'Mensual'];
export const METODOS_PAGO = ['Efectivo', 'Transferencia'];
export const ESTADOS_PEDIDO = ['Pendiente', 'Entregado'];

/** Categorías de gasto, basadas en los costos operativos reales del negocio. */
export const GASTO_CATEGORIAS = [
  'Agua de pipa (suministro)',
  'Insumos (tapas, sellos)',
  'Nómina',
  'Gasolina / Logística',
  'Renta',
  'Filtros / Mantenimiento',
  'Servicios (luz, etc.)',
  'Otros'
];

/**
 * Clasificación de cada categoría de gasto para el cálculo de costo y utilidad
 * por garrafón:
 *  - 'directo'      : costo variable de producción (escala con cada garrafón)
 *  - 'distribucion' : costo de reparto (escala con la entrega, no con producción)
 *  - 'fijo'         : costo de operación que no cambia con el volumen
 */
export const GASTO_TIPO = {
  'Agua de pipa (suministro)': 'directo',
  'Insumos (tapas, sellos)': 'directo',
  'Gasolina / Logística': 'distribucion',
  'Nómina': 'fijo',
  'Renta': 'fijo',
  'Filtros / Mantenimiento': 'fijo',
  'Servicios (luz, etc.)': 'fijo',
  'Otros': 'fijo'
};

export function tipoGasto(categoria) {
  return GASTO_TIPO[categoria] || 'fijo';
}

/** Tipos de registro en la bitácora de mantenimiento y calidad. */
export const MANTENIMIENTO_TIPOS = [
  'Cambio de filtros',
  'Mantenimiento preventivo',
  'Reparación',
  'Prueba de calidad',
  'Otro'
];

/** Días recomendados entre cambios de filtro (mantenimiento preventivo). */
export const DIAS_CAMBIO_FILTROS = 30;

/** Capacidad/máximo histórico de garrafones en un día (diagnóstico). */
export const CAPACIDAD_DIARIA = 180;

/** Tipos de movimiento del inventario de garrafones. */
export const INVENTARIO_TIPOS = [
  'Compra de nuevos',
  'Canje',
  'Retorno de usado',
  'Baja / reciclado',
  'Ajuste'
];

/** Días estimados según frecuencia, para sugerencias de ruta. */
export const FRECUENCIA_DIAS = {
  'Diario': 1,
  'Cada 3 días': 3,
  'Semanal': 7,
  'Quincenal': 15,
  'Mensual': 30
};

/* ---------- Tamaños de garrafón (v2.3) ----------
 * La purificadora vende garrafones de distintos tamaños. El de 19L es el
 * más común y era el único que la app manejaba originalmente. El orden es
 * de mayor a menor para que el selector los muestre así.
 */
export const TAMANOS_GARRAFON = ['20L', '19L', '12L', '10L'];

/** Tamaño por defecto (también se asigna a los pedidos históricos sin tamaño).
 *  v2.5: cambiado a '20L' a petición de David (es el más común en su purificadora). */
export const TAMANO_DEFAULT = '20L';

/** Precios sugeridos por tamaño (editable en Configuración y por pedido). */
export const PRECIOS_DEFAULT_POR_TAMANO = {
  '20L': 25,
  '19L': 20,
  '12L': 12,
  '10L': 10
};

/** Precios de canje sugeridos por tamaño. */
export const PRECIOS_CANJE_DEFAULT_POR_TAMANO = {
  '20L': 60,
  '19L': 50,
  '12L': 30,
  '10L': 25
};

/** ¿Es un tamaño válido? */
export function esTamanoValido(t) {
  return TAMANOS_GARRAFON.includes(t);
}

/** Normaliza el tamaño de un pedido: si falta o es inválido, devuelve el default. */
export function tamanoPedido(p) {
  if (!p) return TAMANO_DEFAULT;
  return esTamanoValido(p.tamano) ? p.tamano : TAMANO_DEFAULT;
}

/**
 * Devuelve las líneas de un pedido como array.
 *
 * v2.6: un pedido puede tener múltiples líneas (una por tamaño). Esta función
 * normaliza ambos formatos:
 *  - Pedidos nuevos: tienen `lineas: [{ tamano, cantidad, precioUnit, canjeCantidad }]`.
 *  - Pedidos legacy (anteriores a v2.6): tienen campos escalares `tamano`,
 *    `cantidad`, `precioUnit`, `canjeCantidad`. Se construye una línea implícita.
 *
 * Siempre devuelve un array (vacío si el pedido no tiene datos).
 */
export function lineasDePedido(p) {
  if (!p) return [];
  if (Array.isArray(p.lineas) && p.lineas.length) return p.lineas;
  // Legacy: construir una línea implícita desde los campos escalares
  if (p.tamano || p.cantidad || p.precioUnit != null) {
    return [{
      tamano: tamanoPedido(p),
      cantidad: Number(p.cantidad) || 0,
      precioUnit: Number(p.precioUnit) || 0,
      canjeCantidad: Number(p.canjeCantidad) || 0
    }];
  }
  return [];
}

/** Cantidad total de garrafones de un pedido (suma de todas sus líneas). */
export function cantidadTotalPedido(p) {
  return lineasDePedido(p).reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
}

/** Canje total de un pedido (suma del canje de todas sus líneas). */
export function canjeTotalPedido(p) {
  return lineasDePedido(p).reduce((s, l) => s + (Number(l.canjeCantidad) || 0), 0);
}

/** Devuelve un resumen compacto de las líneas: "3×20L + 2×10L". */
export function resumenLineas(p) {
  const lineas = lineasDePedido(p);
  if (!lineas.length) return '—';
  return lineas.map((l) => `${Number(l.cantidad) || 0}×${l.tamano || TAMANO_DEFAULT}`).join(' + ');
}
