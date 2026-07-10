/**
 * clientes.js — Gestión de clientes (alta, edición, borrado, búsqueda).
 */
import { STORES, getAll, add, put, remove, get } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc, debounce,
  FRECUENCIAS, dinero, folioCliente, fechaLegible
} from '../utils.js';
import { saldosTodos, analisisComprasClientes } from '../services.js';

let _cache = [];
let _saldos = new Map();
let _compras = new Map();

function frecBadge(f) {
  return el('span', { class: 'badge badge--info', text: f || 'Sin definir' });
}

function ultimaCompraTexto(c) {
  const info = _compras.get(c.id);
  if (!info) return '🛒 Sin compras registradas';
  if (info.dias === 0) return '🛒 Última compra: hoy';
  return `🛒 Última compra: ${fechaLegible(info.ultima)} (hace ${info.dias} día(s))`;
}

/** Solo dígitos del teléfono, para comparar sin importar espacios o guiones. */
function telDigitos(t) { return (t || '').replace(/\D/g, ''); }

/** Busca un posible cliente duplicado por teléfono (prioritario) o por nombre. */
function buscarDuplicadoCliente(datos, excluirId) {
  const tel = telDigitos(datos.telefono);
  const nombre = (datos.nombre || '').trim().toLowerCase();
  if (tel.length >= 7) {
    const m = _cache.find((c) => c.id !== excluirId && telDigitos(c.telefono) === tel);
    if (m) return { cliente: m, motivo: 'el mismo teléfono' };
  }
  if (nombre) {
    const m = _cache.find((c) => c.id !== excluirId && (c.nombre || '').trim().toLowerCase() === nombre);
    if (m) return { cliente: m, motivo: 'el mismo nombre' };
  }
  return null;
}

/** Muestra dentro del formulario un aviso de posible duplicado con opciones. */
function mostrarAvisoDuplicado(f, dup, onForzar) {
  const viejo = f.querySelector('#avisoDup');
  if (viejo) viejo.remove();
  const c = dup.cliente;
  const aviso = el('div', { id: 'avisoDup', class: 'card', style: 'background:var(--naranja-claro);margin:0 0 12px' }, [
    el('p', { html: `⚠️ Ya existe un cliente con ${esc(dup.motivo)}: <strong>${esc(c.nombre)}</strong> (N.º ${folioCliente(c)}).` }),
    el('div', { class: 'btn-row' }, [
      el('button', { type: 'button', class: 'btn btn--warn btn--sm', text: 'Guardar de todas formas', onclick: () => onForzar() }),
      el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Editar el existente', onclick: () => { cerrarModal(); formularioCliente(c); } })
    ])
  ]);
  f.prepend(aviso);
  aviso.scrollIntoView({ block: 'nearest' });
}

function tarjetaCliente(c) {
  const saldo = _saldos.get(c.id) || 0;
  const meta = [c.calle, c.colonia].filter(Boolean).join(', ');
  const folio = folioCliente(c);
  const num = el('div', {
    class: 'cliente-num',
    title: `Número de cliente ${folio} — escríbelo en la parte baja del garrafón para rastrearlo`
  }, [
    el('small', { text: 'N.º' }),
    el('b', { text: folio })
  ]);
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', text: c.nombre }),
    el('div', { class: 'item__meta', html: `${esc(meta || 'Sin dirección')}${c.telefono ? ' · 📞 ' + esc(c.telefono) : ''}` }),
    el('div', { class: 'item__meta', text: ultimaCompraTexto(c) }),
    el('div', { class: 'tag-line mt' }, [
      frecBadge(c.frecuencia),
      saldo > 0.001 ? el('span', { class: 'badge badge--adeudo', text: `Debe ${dinero(saldo)}` }) : null
    ])
  ]);
  const actions = el('div', { class: 'item__actions' }, [
    el('button', { class: 'icon-btn', title: 'Editar', text: '✏️', onclick: () => formularioCliente(c) }),
    el('button', { class: 'icon-btn icon-btn--danger', title: 'Eliminar', text: '🗑️', onclick: () => eliminarCliente(c) })
  ]);
  return el('div', { class: 'item' }, [num, main, actions]);
}

async function eliminarCliente(c) {
  const ok = await confirmar(`¿Eliminar a "${c.nombre}"? Sus pedidos y pagos quedarán sin cliente asignado.`, { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.clientes, c.id);
  toast('Cliente eliminado', 'success');
  await recargar();
}

function formularioCliente(cliente = {}) {
  const esEdit = !!cliente.id;
  const info = esEdit ? _compras.get(cliente.id) : null;
  let sugerenciaHTML = '';
  if (info) {
    if (info.frecuenciaSugerida && info.intervaloProm) {
      sugerenciaHTML = `<p class="hint" id="frecSug" style="margin:6px 0 0">🛒 ${info.numCompras} compra(s), última ${fechaLegible(info.ultima)}. Compra cada ~${info.intervaloProm} día(s) → sugerencia: <strong>${esc(info.frecuenciaSugerida)}</strong>${cliente.frecuencia !== info.frecuenciaSugerida ? ' <button type="button" class="btn btn--ghost btn--sm" id="btnUsarSug">Usar sugerencia</button>' : ' ✔'}</p>`;
    } else {
      sugerenciaHTML = `<p class="hint" style="margin:6px 0 0">🛒 ${info.numCompras} compra(s), última ${fechaLegible(info.ultima)}. Con más compras se podrá sugerir la frecuencia.</p>`;
    }
  }
  const f = el('form', { class: 'form' });
  f.innerHTML = `
    ${esEdit ? `
    <div class="field">
      <label>Número de cliente</label>
      <div class="readonly-num">#${folioCliente(cliente)} <small>Escríbelo en la parte baja del garrafón para rastrearlo</small></div>
    </div>` : `
    <p class="hint">📌 Al guardar se asignará automáticamente un número de cliente. Sirve para rotular (con marcador) la parte baja del garrafón y saber de qué cliente provino la última vez.</p>`}
    <div class="field">
      <label for="cNombre">Nombre *</label>
      <input id="cNombre" name="nombre" required placeholder="Nombre del cliente" value="${esc(cliente.nombre || '')}" />
    </div>
    <div class="field">
      <label for="cTel">Teléfono</label>
      <input id="cTel" name="telefono" type="tel" inputmode="tel" placeholder="Ej. 6181234567" value="${esc(cliente.telefono || '')}" />
    </div>
    <div class="field--row">
      <div class="field">
        <label for="cCalle">Calle y número</label>
        <input id="cCalle" name="calle" placeholder="Calle y número" value="${esc(cliente.calle || '')}" />
      </div>
      <div class="field">
        <label for="cCol">Colonia</label>
        <input id="cCol" name="colonia" placeholder="Colonia / zona" value="${esc(cliente.colonia || '')}" />
      </div>
    </div>
    <div class="field">
      <label for="cRef">Referencia</label>
      <input id="cRef" name="referencia" placeholder="Ej. portón azul, frente a la tienda" value="${esc(cliente.referencia || '')}" />
    </div>
    <div class="field">
      <label for="cFrec">Frecuencia de compra</label>
      <select id="cFrec" name="frecuencia">
        ${FRECUENCIAS.map((x) => `<option ${cliente.frecuencia === x ? 'selected' : ''}>${x}</option>`).join('')}
      </select>
      ${sugerenciaHTML}
    </div>
    <div class="field">
      <label for="cNotas">Notas</label>
      <textarea id="cNotas" name="notas" placeholder="Notas adicionales">${esc(cliente.notas || '')}</textarea>
    </div>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelar">Cancelar</button>
      <button type="submit" class="btn btn--primary btn--lg grow">${esEdit ? 'Guardar' : 'Agregar'}</button>
    </div>
  `;
  f.querySelector('#btnCancelar').addEventListener('click', cerrarModal);
  const btnSug = f.querySelector('#btnUsarSug');
  if (btnSug && info && info.frecuenciaSugerida) {
    btnSug.addEventListener('click', () => {
      f.querySelector('#cFrec').value = info.frecuenciaSugerida;
      btnSug.textContent = 'Aplicada ✔';
      btnSug.disabled = true;
    });
  }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = (f.querySelector('#cNombre').value || '').trim();
    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
    const dup = buscarDuplicadoCliente({ nombre, telefono: f.querySelector('#cTel').value }, cliente.id);
    if (dup) { mostrarAvisoDuplicado(f, dup, guardarCliente); return; }
    await guardarCliente();
  });

  async function guardarCliente() {
    const fd = new FormData(f);
    const datos = Object.fromEntries(fd.entries());
    datos.nombre = (datos.nombre || '').trim();
    if (!datos.nombre) { toast('El nombre es obligatorio', 'error'); return; }

    // Conserva campos de geolocalización futuros si existían
    const registro = { ...cliente, ...datos };
    if (esEdit) {
      await put(STORES.clientes, registro);
      toast('Cliente actualizado', 'success');
    } else {
      registro.creadoEn = new Date().toISOString();
      await add(STORES.clientes, registro);
      toast('Cliente agregado', 'success');
    }
    cerrarModal();
    await recargar();
  }

  abrirModal(esEdit ? 'Editar cliente' : 'Nuevo cliente', f);
}

function aplicarFiltros() {
  const q = ($('#buscarCliente')?.value || '').toLowerCase().trim();
  const col = $('#filtroColonia')?.value || '';
  const cont = $('#listaClientes');
  if (!cont) return;

  let lista = _cache.slice();
  if (q) lista = lista.filter((c) =>
    [c.nombre, c.telefono, c.calle, c.colonia, c.referencia, folioCliente(c), String(c.id)].some((v) => (v || '').toLowerCase().includes(q)));
  if (col) lista = lista.filter((c) => (c.colonia || 'Sin colonia') === col);

  lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  cont.innerHTML = '';
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🔍' }),
      el('p', { text: 'No se encontraron clientes.' })
    ]));
    return;
  }
  lista.forEach((c) => cont.appendChild(tarjetaCliente(c)));
}

async function recargar() {
  [_cache, _saldos, _compras] = await Promise.all([getAll(STORES.clientes), saldosTodos(), analisisComprasClientes()]);
  pintarFiltroColonia();
  aplicarFiltros();
}

function pintarFiltroColonia() {
  const sel = $('#filtroColonia');
  if (!sel) return;
  const actual = sel.value;
  const colonias = Array.from(new Set(_cache.map((c) => c.colonia || 'Sin colonia'))).sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '<option value="">Todas las colonias</option>' + colonias.map((c) => `<option ${actual === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

export async function render(root, params = []) {
  [_cache, _saldos, _compras] = await Promise.all([getAll(STORES.clientes), saldosTodos(), analisisComprasClientes()]);

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h2', { text: `Clientes (${_cache.length})` }),
    el('button', { class: 'btn btn--primary', text: '➕ Nuevo', onclick: () => formularioCliente() })
  ]));

  const toolbar = el('div', { class: 'toolbar' }, [
    el('input', { id: 'buscarCliente', class: 'search', type: 'search', placeholder: '🔍 Buscar por nombre, N.º, teléfono o dirección', oninput: debounce(aplicarFiltros, 200) }),
    el('select', { id: 'filtroColonia', onchange: aplicarFiltros })
  ]);
  root.appendChild(toolbar);

  root.appendChild(el('div', { id: 'listaClientes', class: 'list' }));
  root.appendChild(el('button', { class: 'fab', title: 'Nuevo cliente', text: '＋', onclick: () => formularioCliente() }));

  pintarFiltroColonia();
  aplicarFiltros();

  if (params[0] === 'nuevo') formularioCliente();
  else if (params[0] === 'editar' && params[1]) {
    const c = await get(STORES.clientes, Number(params[1]));
    if (c) formularioCliente(c);
  }
}
