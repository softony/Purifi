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
  modal.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('modalBody').innerHTML = '';
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

export const FRECUENCIAS = ['Diario', 'Cada 3 días', 'Semanal', 'Quincenal'];
export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Crédito (adeudo)'];
export const ESTADOS_PEDIDO = ['Pendiente', 'Entregado'];

/** Días estimados según frecuencia, para sugerencias de ruta. */
export const FRECUENCIA_DIAS = {
  'Diario': 1,
  'Cada 3 días': 3,
  'Semanal': 7,
  'Quincenal': 15
};
