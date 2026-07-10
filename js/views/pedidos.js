/**
 * pedidos.js — Registro y seguimiento de pedidos de garrafones.
 *
 * v2.3: cada pedido lleva un `tamano` (20L, 19L, 12L, 10L). El precio
 * sugerido al crear/editar se toma de `cfg.preciosPorTamano[tamano]`, pero
 * el usuario puede editarlo libremente. El canje también funciona por tamaño:
 * al entregar, se descuenta 1 garrafón nuevo de ese tamaño en el inventario.
 */
import { STORES, getAll, add, put, remove, getByIndex, getConfig } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc, debounce,
  dinero, numero, hoyISO, fechaLegible, METODOS_PAGO, ESTADOS_PEDIDO, folioCliente,
  TAMANOS_GARRAFON, TAMANO_DEFAULT, tamanoPedido
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
  const tam = tamanoPedido(p);
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', html: `${folio ? `<span class="num-inline">N.º ${folio}</span> ` : ''}${esc(nombre)} · ${numero(p.cantidad)} × ${esc(tam)}` }),
    el('div', { class: 'item__meta', html: `${esc(fechaLegible(p.fecha))} · ${esc(p.metodoPago || '')} · <strong>${dinero(p.total)}</strong>` }),
    el('div', { class: 'tag-line mt' }, [
      estadoCobroBadge(p),
      el('span', { class: 'badge badge--info', text: '🛢️ ' + tam }),
      p.canjeCantidad ? el('span', { class: 'badge badge--info', text: `🔄 ${p.canjeCantidad} canje` }) : null,
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
  const tam = tamanoPedido(p);
  const cont = el('div', {}, [
    el('p', { class: 'confirm__msg', html: `Entrega para <strong>${esc(cli ? cli.nombre : 'cliente')}</strong> · ${numero(p.cantidad)} × ${esc(tam)}<br>Total: <strong>${dinero(p.total)}</strong>` }),
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
  await sincronizarCanje(p);
  cerrarModal();
  toast(pagado ? 'Entregado y cobrado ✔' : 'Entregado — se registró el adeudo en Cobranza', pagado ? 'success' : 'warn');
  await recargar();
}

async function eliminarPedido(p) {
  const ok = await confirmar('¿Eliminar este pedido?', { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.pedidos, p.id);
  const movs = await getByIndex(STORES.inventario, 'pedidoId', p.id);
  await Promise.all(movs.map((m) => remove(STORES.inventario, m.id)));
  toast('Pedido eliminado', 'success');
  await recargar();
}

function calcularTotal(f, precioCanje) {
  const cant = Number(f.querySelector('#pCantidad').value) || 0;
  const precio = Number(f.querySelector('#pPrecio').value) || 0;
  const canje = Number(f.querySelector('#pCanje') ? f.querySelector('#pCanje').value : 0) || 0;
  const total = cant * precio + canje * (Number(precioCanje) || 0);
  f.querySelector('#pTotal').textContent = dinero(total);
  return total;
}

/** Sincroniza el movimiento de inventario por canje ligado a un pedido.
 *  v2.3: ahora registra el tamaño del garrafón canjeado en el inventario
 *  (campos nuevosPorTamano/usadosPorTamano), además del campo tamano. */
async function sincronizarCanje(pedido) {
  if (!pedido || pedido.id == null) return;
  const previos = await getByIndex(STORES.inventario, 'pedidoId', pedido.id);
  await Promise.all(previos.map((m) => remove(STORES.inventario, m.id)));
  const qty = Math.max(0, Math.floor(Number(pedido.canjeCantidad) || 0));
  if (pedido.estado === 'Entregado' && qty > 0) {
    const tam = tamanoPedido(pedido);
    // Deltas por tamaño: solo el tamaño del pedido se ve afectado.
    const nuevosPorTamano = { '20L': 0, '19L': 0, '12L': 0, '10L': 0 };
    const usadosPorTamano = { '20L': 0, '19L': 0, '12L': 0, '10L': 0 };
    nuevosPorTamano[tam] = -qty;
    usadosPorTamano[tam] = qty;
    await add(STORES.inventario, {
      fecha: (pedido.entregadoEn || '').slice(0, 10) || pedido.fecha || hoyISO(),
      tipo: 'Canje',
      tamano: tam,
      cantidad: qty,
      // Mantenemos los campos legacy (suma total) para compatibilidad con
      // reportes/exports viejos que los leían directamente.
      nuevos: -qty,
      usados: qty,
      nuevosPorTamano,
      usadosPorTamano,
      concepto: `Canje de garrafón ${tam} (pedido entregado)`,
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      creadoEn: new Date().toISOString()
    });
  }
}

function formularioPedido(pedido = {}) {
  const esEdit = !!pedido.id;
  if (!_clientes.length) {
    toast('Primero registra al menos un cliente', 'warn');
    window.navegar('clientes/nuevo');
    return;
  }
  const f = el('form', { class: 'form' });
  // v2.3: tamaño del pedido (default 19L) y precio sugerido según tamaño.
  const tamanoInicial = tamanoPedido(pedido);
  const preciosPorTamano = _cfg.preciosPorTamano || {};
  const preciosCanjePorTamano = _cfg.preciosCanjePorTamano || {};
  const precioDef = pedido.precioUnit != null
    ? pedido.precioUnit
    : (preciosPorTamano[tamanoInicial] ?? _cfg.precioDomicilio ?? 0);
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
    <div class="field--row">
      <div class="field">
        <label for="pTamano">Tamaño de garrafón *</label>
        <select id="pTamano" name="tamano" required>
          ${TAMANOS_GARRAFON.map((t) => `<option value="${esc(t)}" ${tamanoInicial === t ? 'selected' : ''}>${esc(t)} (precio sugerido: ${dinero(preciosPorTamano[t] ?? 0)})</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="pPrecio">Precio por garrafón</label>
        <input id="pPrecio" name="precioUnit" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(precioDef)}" />
      </div>
    </div>
    <div class="field">
      <label for="pCanje">Garrafones en canje (cambio por uno nuevo)</label>
      <input id="pCanje" name="canjeCantidad" type="number" min="0" step="1" inputmode="numeric" value="${esc(pedido.canjeCantidad || 0)}" />
      <p class="hint" style="margin:4px 0 0">Cada canje suma <span id="pHintCanje">${dinero(preciosCanjePorTamano[tamanoInicial] ?? 0)}</span> al total y, al entregar, descuenta 1 garrafón nuevo del inventario.</p>
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

  const selTamano = f.querySelector('#pTamano');
  const inputPrecio = f.querySelector('#pPrecio');
  const inputCant = f.querySelector('#pCantidad');
  const inputCanje = f.querySelector('#pCanje');
  const hintCanje = f.querySelector('#pHintCanje');

  // Al cambiar el tamaño: si el precio actual coincide con el precio sugerido
  // del tamaño anterior, lo actualizamos al nuevo sugerido. Si el usuario lo
  // había editado manualmente, lo respetamos (no lo pisamos).
  let precioEditadoManualmente = false;
  selTamano.addEventListener('change', () => {
    const nuevoTam = selTamano.value;
    const sugerido = preciosPorTamano[nuevoTam] ?? 0;
    const canjeSugerido = preciosCanjePorTamano[nuevoTam] ?? 0;
    if (!precioEditadoManualmente) {
      inputPrecio.value = sugerido;
    }
    if (hintCanje) hintCanje.textContent = dinero(canjeSugerido);
    recalc();
  });
  inputPrecio.addEventListener('input', () => {
    // Detecta si el usuario escribe un precio distinto al sugerido del tamaño actual.
    const sugerido = preciosPorTamano[selTamano.value] ?? 0;
    precioEditadoManualmente = Number(inputPrecio.value) !== Number(sugerido);
    recalc();
  });

  const recalc = () => calcularTotal(f, preciosCanjePorTamano[selTamano.value] ?? 0);

  inputCant.addEventListener('input', recalc);
  inputCanje.addEventListener('input', recalc);
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

    const canjeCantidad = Math.max(0, Math.floor(Number(fd.canjeCantidad) || 0));
    const tamano = fd.tamano || TAMANO_DEFAULT;
    const precioCanje = Number(preciosCanjePorTamano[tamano]) || 0;

    const registro = {
      ...pedido,
      clienteId: Number(fd.clienteId),
      fecha: fd.fecha,
      tamano,
      cantidad,
      precioUnit,
      canjeCantidad,
      precioCanje,
      total: Math.round((cantidad * precioUnit + canjeCantidad * precioCanje) * 100) / 100,
      estado,
      pagado,
      metodoPago: fd.metodoPago,
      observaciones: (fd.observaciones || '').trim()
    };
    if (estado === 'Entregado' && !registro.entregadoEn) registro.entregadoEn = new Date().toISOString();
    if (estado === 'Pendiente') delete registro.entregadoEn;

    if (esEdit) {
      await put(STORES.pedidos, registro);
      await sincronizarCanje(registro);
      toast('Pedido actualizado', 'success');
    } else {
      registro.creadoEn = new Date().toISOString();
      const nuevoId = await add(STORES.pedidos, registro);
      registro.id = nuevoId;
      await sincronizarCanje(registro);
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
  const tam = $('#filtroTamano')?.value || '';
  const q = ($('#buscarPedido')?.value || '').toLowerCase().trim();
  const cont = $('#listaPedidos');
  if (!cont) return;

  let lista = _pedidos.slice();
  if (estado) lista = lista.filter((p) => p.estado === estado);
  if (tam) lista = lista.filter((p) => tamanoPedido(p) === tam);
  if (q) lista = lista.filter((p) => {
    const cli = _mapa.get(p.clienteId);
    return (cli?.nombre || '').toLowerCase().includes(q)
      || (cli ? folioCliente(cli) : '').includes(q)
      || (p.observaciones || '').toLowerCase().includes(q)
      || tamanoPedido(p).toLowerCase().includes(q);
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
    el('input', { id: 'buscarPedido', class: 'search', type: 'search', placeholder: '🔍 Buscar por cliente, N.º, tamaño u observación', oninput: debounce(aplicarFiltros, 200) }),
    (() => {
      const s = el('select', { id: 'filtroEstado', onchange: aplicarFiltros });
      s.innerHTML = '<option value="">Todos los estados</option>' + ESTADOS_PEDIDO.map((x) => `<option>${x}</option>`).join('');
      return s;
    })(),
    (() => {
      const s = el('select', { id: 'filtroTamano', onchange: aplicarFiltros });
      s.innerHTML = '<option value="">Todos los tamaños</option>' + TAMANOS_GARRAFON.map((t) => `<option value="${t}">${t}</option>`).join('');
      return s;
    })()
  ]);
  root.appendChild(toolbar);

  root.appendChild(el('div', { id: 'listaPedidos', class: 'list' }));
  root.appendChild(el('button', { class: 'fab', title: 'Nuevo pedido', text: '＋', onclick: () => formularioPedido() }));

  aplicarFiltros();
  if (params[0] === 'nuevo') formularioPedido(params[1] ? { clienteId: Number(params[1]) } : {});
}
