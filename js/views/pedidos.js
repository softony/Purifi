/**
 * pedidos.js — Registro y seguimiento de pedidos de garrafones.
 */
import { STORES, getAll, add, put, remove, getConfig } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc, debounce,
  dinero, numero, hoyISO, fechaLegible, METODOS_PAGO, ESTADOS_PEDIDO, folioCliente
} from '../utils.js';
import { mapaClientes } from '../services.js';

let _pedidos = [];
let _clientes = [];
let _mapa = new Map();
let _cfg = {};

function estadoCobroVal(p) {
  if (!p || p.estado !== 'Entregado') return 'pendiente';
  return p.pagado === false ? 'credito' : 'pagado';
}

/** Insignia que refleja los 3 estados: pendiente / entregado y pagado / entregado a crédito. */
function estadoCobroBadge(p) {
  if (p.estado !== 'Entregado') return el('span', { class: 'badge badge--pend', text: '🟠 Pendiente' });
  if (p.pagado === false) return el('span', { class: 'badge badge--adeudo', text: '🔴 Entregado · A crédito' });
  return el('span', { class: 'badge badge--entreg', text: '🟢 Entregado · Pagado' });
}

function tarjetaPedido(p) {
  const cli = _mapa.get(p.clienteId);
  const nombre = cli ? cli.nombre : '— Cliente eliminado —';
  const folio = cli ? folioCliente(cli) : null;
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', html: `${folio ? `<span class="num-inline">N.º ${folio}</span> ` : ''}${esc(nombre)} · ${numero(p.cantidad)} garrafón(es)` }),
    el('div', { class: 'item__meta', html: `${esc(fechaLegible(p.fecha))} · ${esc(p.metodoPago || '')} · <strong>${dinero(p.total)}</strong>` }),
    el('div', { class: 'tag-line mt' }, [
      estadoCobroBadge(p),
      p.observaciones ? el('span', { class: 'badge badge--info', text: '📝 ' + p.observaciones.slice(0, 20) }) : null
    ])
  ]);
  const actions = el('div', { class: 'item__actions' }, []);
  if (p.estado === 'Pendiente') {
    actions.appendChild(el('button', {
      class: 'icon-btn icon-btn--ok', title: 'Marcar entregado', text: '✓',
      onclick: () => marcarEntregado(p)
    }));
  }
  actions.appendChild(el('button', { class: 'icon-btn', title: 'Editar', text: '✏️', onclick: () => formularioPedido(p) }));
  actions.appendChild(el('button', { class: 'icon-btn icon-btn--danger', title: 'Eliminar', text: '🗑️', onclick: () => eliminarPedido(p) }));
  return el('div', { class: 'item' }, [main, actions]);
}

function marcarEntregado(p) {
  const cli = _mapa.get(p.clienteId);
  const cont = el('div', {}, [
    el('p', { class: 'confirm__msg', html: `Entrega para <strong>${esc(cli ? cli.nombre : 'cliente')}</strong> · ${numero(p.cantidad)} garrafón(es)<br>Total: <strong>${dinero(p.total)}</strong>` }),
    el('p', { class: 'muted', text: '¿Se cobró este pedido al momento de entregar?' }),
    el('div', { class: 'confirm__actions', style: 'flex-direction:column;gap:10px' }, [
      el('button', { class: 'btn btn--success btn--lg', html: `💵 Sí, pagó (${dinero(p.total)})`, onclick: () => confirmarEntrega(p, true) }),
      el('button', { class: 'btn btn--warn btn--lg', text: '🔴 No, quedó a crédito (debe)', onclick: () => confirmarEntrega(p, false) }),
      el('button', { class: 'btn btn--ghost btn--lg', text: 'Cancelar', onclick: cerrarModal })
    ])
  ]);
  abrirModal('Confirmar entrega', cont);
}

async function confirmarEntrega(p, pagado) {
  p.estado = 'Entregado';
  p.pagado = pagado;
  p.entregadoEn = new Date().toISOString();
  await put(STORES.pedidos, p);
  cerrarModal();
  toast(pagado ? 'Entregado y cobrado ✔' : 'Entregado — se registró el adeudo en Cobranza', pagado ? 'success' : 'warn');
  await recargar();
}

async function eliminarPedido(p) {
  const ok = await confirmar('¿Eliminar este pedido?', { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.pedidos, p.id);
  toast('Pedido eliminado', 'success');
  await recargar();
}

function calcularTotal(form) {
  const cant = Number(form.cantidad.value) || 0;
  const precio = Number(form.precioUnit.value) || 0;
  const total = cant * precio;
  form.querySelector('#pTotal').textContent = dinero(total);
  return total;
}

function formularioPedido(pedido = {}) {
  const esEdit = !!pedido.id;
  if (!_clientes.length) {
    toast('Primero registra al menos un cliente', 'warn');
    window.navegar('clientes/nuevo');
    return;
  }
  const f = el('form', { class: 'form' });
  const precioDef = pedido.precioUnit != null ? pedido.precioUnit : _cfg.precioDomicilio;
  const cobroActual = estadoCobroVal(pedido);
  f.innerHTML = `
    <div class="field">
      <label for="pCliente">Cliente *</label>
      <select id="pCliente" name="clienteId" required>
        <option value="">Selecciona…</option>
        ${_clientes.map((c) => `<option value="${c.id}" ${pedido.clienteId === c.id ? 'selected' : ''}>N.º ${folioCliente(c)} · ${esc(c.nombre)}${c.colonia ? ' — ' + esc(c.colonia) : ''}</option>`).join('')}
      </select>
    </div>
    <div class="field--row">
      <div class="field">
        <label for="pFecha">Fecha *</label>
        <input id="pFecha" name="fecha" type="date" required value="${esc(pedido.fecha || hoyISO())}" />
      </div>
      <div class="field">
        <label for="pCantidad">Garrafones *</label>
        <input id="pCantidad" name="cantidad" type="number" min="1" step="1" inputmode="numeric" required value="${esc(pedido.cantidad || 1)}" />
      </div>
    </div>
    <div class="field">
      <label>Precio por garrafón</label>
      <div class="btn-row">
        <button type="button" class="btn btn--ghost btn--sm" data-precio="${_cfg.precioDomicilio}">🚚 Domicilio (${dinero(_cfg.precioDomicilio)})</button>
        <button type="button" class="btn btn--ghost btn--sm" data-precio="${_cfg.precioVentanilla}">🏪 Ventanilla (${dinero(_cfg.precioVentanilla)})</button>
      </div>
      <input id="pPrecio" name="precioUnit" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(precioDef)}" />
    </div>
    <div class="field--row">
      <div class="field">
        <label for="pCobro">Estado del pedido</label>
        <select id="pCobro" name="cobro">
          <option value="pendiente" ${cobroActual === 'pendiente' ? 'selected' : ''}>🟠 Pendiente (en camino)</option>
          <option value="pagado" ${cobroActual === 'pagado' ? 'selected' : ''}>🟢 Entregado y pagado</option>
          <option value="credito" ${cobroActual === 'credito' ? 'selected' : ''}>🔴 Entregado a crédito (debe)</option>
        </select>
      </div>
      <div class="field">
        <label for="pMetodo">Método de pago</label>
        <select id="pMetodo" name="metodoPago">
          ${METODOS_PAGO.map((x) => `<option ${pedido.metodoPago === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label for="pObs">Observaciones</label>
      <textarea id="pObs" name="observaciones" placeholder="Notas del pedido">${esc(pedido.observaciones || '')}</textarea>
    </div>
    <div class="card" style="margin:0;background:var(--azul-claro)">
      <div class="flex"><span class="grow"><strong>Total</strong></span><span id="pTotal" style="font-size:1.4rem;font-weight:800">$0</span></div>
      <p class="hint" style="margin:6px 0 0">Si el pedido queda “a crédito”, el adeudo aparece automáticamente en Cobranza.</p>
    </div>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelar">Cancelar</button>
      <button type="submit" class="btn btn--primary btn--lg grow">${esEdit ? 'Guardar' : 'Registrar'}</button>
    </div>
  `;

  const inputPrecio = f.querySelector('#pPrecio');
  const inputCant = f.querySelector('#pCantidad');
  const fakeForm = { cantidad: inputCant, precioUnit: inputPrecio, querySelector: (s) => f.querySelector(s) };
  const recalc = () => calcularTotal(fakeForm);

  f.querySelectorAll('[data-precio]').forEach((b) =>
    b.addEventListener('click', () => { inputPrecio.value = b.dataset.precio; recalc(); }));
  inputPrecio.addEventListener('input', recalc);
  inputCant.addEventListener('input', recalc);
  f.querySelector('#btnCancelar').addEventListener('click', cerrarModal);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    if (!fd.clienteId) { toast('Selecciona un cliente', 'error'); return; }
    const cantidad = Number(fd.cantidad) || 0;
    const precioUnit = Number(fd.precioUnit) || 0;
    if (cantidad < 1) { toast('La cantidad debe ser al menos 1', 'error'); return; }

    // Estado de cobro (3 estados) -> estado + pagado
    const cobro = fd.cobro || 'pendiente';
    let estado = 'Pendiente';
    let pagado = false;
    if (cobro === 'pagado') { estado = 'Entregado'; pagado = true; }
    else if (cobro === 'credito') { estado = 'Entregado'; pagado = false; }

    const registro = {
      ...pedido,
      clienteId: Number(fd.clienteId),
      fecha: fd.fecha,
      cantidad,
      precioUnit,
      total: Math.round(cantidad * precioUnit * 100) / 100,
      estado,
      pagado,
      metodoPago: fd.metodoPago,
      observaciones: (fd.observaciones || '').trim()
    };
    if (estado === 'Entregado' && !registro.entregadoEn) registro.entregadoEn = new Date().toISOString();
    if (estado === 'Pendiente') delete registro.entregadoEn;
    if (esEdit) {
      await put(STORES.pedidos, registro);
      toast('Pedido actualizado', 'success');
    } else {
      registro.creadoEn = new Date().toISOString();
      await add(STORES.pedidos, registro);
      toast('Pedido registrado', 'success');
    }
    cerrarModal();
    await recargar();
  });

  abrirModal(esEdit ? 'Editar pedido' : 'Nuevo pedido', f);
  recalc();
}

function aplicarFiltros() {
  const estado = $('#filtroEstado')?.value || '';
  const q = ($('#buscarPedido')?.value || '').toLowerCase().trim();
  const cont = $('#listaPedidos');
  if (!cont) return;

  let lista = _pedidos.slice();
  if (estado) lista = lista.filter((p) => p.estado === estado);
  if (q) lista = lista.filter((p) => {
    const cli = _mapa.get(p.clienteId);
    return (cli?.nombre || '').toLowerCase().includes(q)
      || (cli ? folioCliente(cli) : '').includes(q)
      || (p.observaciones || '').toLowerCase().includes(q);
  });
  lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.id - a.id));

  cont.innerHTML = '';
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '📦' }),
      el('p', { text: 'No hay pedidos que coincidan.' })
    ]));
    return;
  }
  lista.forEach((p) => cont.appendChild(tarjetaPedido(p)));
}

async function recargar() {
  [_pedidos, _clientes] = await Promise.all([getAll(STORES.pedidos), getAll(STORES.clientes)]);
  _mapa = await mapaClientes();
  aplicarFiltros();
}

export async function render(root, params = []) {
  [_pedidos, _clientes, _cfg] = await Promise.all([getAll(STORES.pedidos), getAll(STORES.clientes), getConfig()]);
  _mapa = new Map(_clientes.map((c) => [c.id, c]));

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h2', { text: `Pedidos (${_pedidos.length})` }),
    el('button', { class: 'btn btn--primary', text: '➕ Nuevo', onclick: () => formularioPedido() })
  ]));

  const toolbar = el('div', { class: 'toolbar' }, [
    el('input', { id: 'buscarPedido', class: 'search', type: 'search', placeholder: '🔍 Buscar por cliente, N.º u observación', oninput: debounce(aplicarFiltros, 200) }),
    (() => {
      const s = el('select', { id: 'filtroEstado', onchange: aplicarFiltros });
      s.innerHTML = '<option value="">Todos</option>' + ESTADOS_PEDIDO.map((x) => `<option>${x}</option>`).join('');
      return s;
    })()
  ]);
  root.appendChild(toolbar);

  root.appendChild(el('div', { id: 'listaPedidos', class: 'list' }));
  root.appendChild(el('button', { class: 'fab', title: 'Nuevo pedido', text: '＋', onclick: () => formularioPedido() }));

  aplicarFiltros();
  if (params[0] === 'nuevo') formularioPedido();
}
