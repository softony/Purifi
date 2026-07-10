/**
 * inventario.js — Inventario de garrafones (nuevos y usados/retornados) por tamaño.
 *
 * v2.3: ahora el inventario se lleva por tamaño (20L, 19L, 12L, 10L). Cada
 * movimiento tiene un `tamano` y los deltas se guardan en `nuevosPorTamano`
 * y `usadosPorTamano` (objetos { '20L': x, '19L': y, ... }). El stock actual
 * se calcula sumando todos los movimientos.
 *
 * Los canjes hechos desde un pedido entregado se registran aquí automáticamente
 * (llevan pedidoId) para mantener el inventario sincronizado con las ventas.
 *
 * Compatibilidad: los campos viejos `nuevos` y `usados` (escalares) se siguen
 * escribiendo por si algún reporte o export viejo los lee, pero la fuente de
 * verdad ahora son los mapas por tamaño.
 */
import { STORES, getAll, add, remove } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc,
  hoyISO, fechaLegible, numero, INVENTARIO_TIPOS,
  TAMANOS_GARRAFON, TAMANO_DEFAULT, tamanoPedido
} from '../utils.js';
import { stockGarrafones } from '../services.js';

let _movs = [];

/** Inicializa un mapa de deltas por tamaño en ceros. */
function cerosPorTamano() {
  const o = {};
  TAMANOS_GARRAFON.forEach((t) => { o[t] = 0; });
  return o;
}

/** Normaliza un movimiento viejo (sin nuevosPorTamano) al formato v2.3. */
function normalizarMov(m) {
  if (!m) return m;
  const tam = m.tamano || TAMANO_DEFAULT;
  if (!m.nuevosPorTamano) {
    const o = cerosPorTamano();
    o[tam] = Number(m.nuevos) || 0;
    m.nuevosPorTamano = o;
  }
  if (!m.usadosPorTamano) {
    const o = cerosPorTamano();
    o[tam] = Number(m.usados) || 0;
    m.usadosPorTamano = o;
  }
  if (!m.tamano) m.tamano = tam;
  return m;
}

/** Calcula los deltas (nuevos/usados, ambos por tamaño) de un movimiento según su tipo. */
function deltasPorTipo(tipo, cantidad, tamano, ajusteCategoria, ajusteSigno) {
  const c = Math.abs(Number(cantidad) || 0);
  const nuevos = cerosPorTamano();
  const usados = cerosPorTamano();
  switch (tipo) {
    case 'Compra de nuevos':
      nuevos[tamano] = c;
      break;
    case 'Canje':
      nuevos[tamano] = -c;
      usados[tamano] = c;
      break;
    case 'Retorno de usado':
      usados[tamano] = c;
      break;
    case 'Baja / reciclado':
      usados[tamano] = -c;
      break;
    case 'Ajuste': {
      const signo = ajusteSigno === '-' ? -1 : 1;
      if (ajusteCategoria === 'usados') usados[tamano] = signo * c;
      else nuevos[tamano] = signo * c;
      break;
    }
    default:
      break;
  }
  return { nuevos, usados };
}

function formularioMovimiento() {
  const f = el('form', { class: 'form' });
  f.innerHTML = `
    <div class="field--row">
      <div class="field">
        <label for="iFecha">Fecha *</label>
        <input id="iFecha" name="fecha" type="date" required value="${hoyISO()}" />
      </div>
      <div class="field">
        <label for="iCantidad">Cantidad (garrafones) *</label>
        <input id="iCantidad" name="cantidad" type="number" min="1" step="1" inputmode="numeric" required value="1" />
      </div>
    </div>
    <div class="field--row">
      <div class="field">
        <label for="iTamano">Tamaño de garrafón *</label>
        <select id="iTamano" name="tamano" required>
          ${TAMANOS_GARRAFON.map((t) => `<option value="${esc(t)}" ${t === TAMANO_DEFAULT ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="iTipo">Tipo de movimiento *</label>
        <select id="iTipo" name="tipo" required>
          ${INVENTARIO_TIPOS.map((t) => `<option>${esc(t)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field--row" id="campoAjuste" style="display:none">
      <div class="field">
        <label for="iCategoria">Categoría a ajustar</label>
        <select id="iCategoria" name="ajusteCategoria">
          <option value="nuevos">Garrafones nuevos</option>
          <option value="usados">Garrafones usados</option>
        </select>
      </div>
      <div class="field">
        <label for="iSigno">Dirección</label>
        <select id="iSigno" name="ajusteSigno">
          <option value="+">Sumar (+)</option>
          <option value="-">Restar (−)</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="iConcepto">Concepto / nota</label>
      <input id="iConcepto" name="concepto" placeholder="Ej. compra a proveedor, garrafones dañados, etc." />
    </div>
    <p class="hint" id="iExplica"></p>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelar">Cancelar</button>
      <button type="submit" class="btn btn--primary btn--lg grow">Registrar</button>
    </div>
  `;

  const selTipo = f.querySelector('#iTipo');
  const campoAjuste = f.querySelector('#campoAjuste');
  const explica = f.querySelector('#iExplica');
  const actualizar = () => {
    campoAjuste.style.display = selTipo.value === 'Ajuste' ? '' : 'none';
    const textos = {
      'Compra de nuevos': 'Aumenta el stock de garrafones nuevos del tamaño seleccionado.',
      'Canje': 'Sale 1 garrafón nuevo y entra 1 usado del tamaño seleccionado (por cantidad).',
      'Retorno de usado': 'Aumenta el stock de garrafones usados/retornados del tamaño seleccionado.',
      'Baja / reciclado': 'Resta del stock de usados del tamaño seleccionado (reciclado, dañado, eliminado).',
      'Ajuste': 'Corrección manual de existencias del tamaño seleccionado.'
    };
    explica.textContent = textos[selTipo.value] || '';
  };
  selTipo.addEventListener('change', actualizar);
  actualizar();

  f.querySelector('#btnCancelar').addEventListener('click', cerrarModal);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const cantidad = Math.abs(Number(fd.cantidad) || 0);
    if (cantidad < 1) { toast('La cantidad debe ser al menos 1', 'error'); return; }
    const tamano = fd.tamano || TAMANO_DEFAULT;
    const { nuevos, usados } = deltasPorTipo(fd.tipo, cantidad, tamano, fd.ajusteCategoria, fd.ajusteSigno);
    // Calcula los escalares legacy (suma total) por si algún reporte viejo los lee.
    const nuevosEscalar = TAMANOS_GARRAFON.reduce((s, t) => s + nuevos[t], 0);
    const usadosEscalar = TAMANOS_GARRAFON.reduce((s, t) => s + usados[t], 0);
    await add(STORES.inventario, {
      fecha: fd.fecha || hoyISO(),
      tipo: fd.tipo,
      tamano,
      cantidad,
      nuevos: nuevosEscalar,
      usados: usadosEscalar,
      nuevosPorTamano: nuevos,
      usadosPorTamano: usados,
      concepto: (fd.concepto || '').trim(),
      creadoEn: new Date().toISOString()
    });
    toast('Movimiento registrado', 'success');
    cerrarModal();
    await recargar();
  });

  abrirModal('Nuevo movimiento de inventario', f);
}

async function eliminarMovimiento(m) {
  const linkado = m.pedidoId ? ' (está ligado a un pedido)' : '';
  const ok = await confirmar(`¿Eliminar este movimiento de inventario${linkado}?`, { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.inventario, m.id);
  toast('Movimiento eliminado', 'success');
  await recargar();
}

function signoTxt(n) {
  if (!n) return null;
  const clase = n > 0 ? 'badge--pago' : 'badge--adeudo';
  return el('span', { class: `badge ${clase}`, text: `${n > 0 ? '+' : ''}${numero(n)}` });
}

function tarjetaMov(m) {
  normalizarMov(m);
  const tam = m.tamano || TAMANO_DEFAULT;
  // Genera chips solo para los tamaños con deltas no cero en este movimiento.
  const chips = [];
  TAMANOS_GARRAFON.forEach((t) => {
    const n = m.nuevosPorTamano?.[t] || 0;
    const u = m.usadosPorTamano?.[t] || 0;
    if (n || u) {
      chips.push(el('span', { class: 'flex', style: 'gap:4px;align-items:center' }, [
        el('small', { text: t, style: 'font-weight:700' }),
        n ? el('span', { class: 'flex', style: 'gap:2px;align-items:center' }, [el('small', { text: 'N' }), signoTxt(n)]) : null,
        u ? el('span', { class: 'flex', style: 'gap:2px;align-items:center' }, [el('small', { text: 'U' }), signoTxt(u)]) : null
      ]));
    }
  });
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', html: `${esc(m.tipo)} <span class="badge badge--info">🛢️ ${esc(tam)}</span>${m.pedidoId ? ' <span class="badge badge--info">📦 auto pedido</span>' : ''}` }),
    el('div', { class: 'item__meta', html: `${esc(fechaLegible(m.fecha))}${m.concepto ? ' · ' + esc(m.concepto) : ''}` }),
    chips.length ? el('div', { class: 'tag-line mt' }, chips) : null
  ]);
  const actions = el('div', { class: 'item__actions' }, [
    el('button', { class: 'icon-btn icon-btn--danger', title: 'Eliminar', text: '🗑️', onclick: () => eliminarMovimiento(m) })
  ]);
  return el('div', { class: 'item' }, [main, actions]);
}

async function expPDF() {
  if (!_movs.length) { toast('No hay movimientos para exportar', 'info'); return; }
  const { exportarPDF } = await import('../export.js');
  const stock = await stockGarrafones();
  const lista = _movs.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  await exportarPDF(`inventario-garrafones-${hoyISO()}`, 'Inventario de garrafones', [
    {
      titulo: 'Existencias actuales por tamaño',
      columns: [{ label: 'Tamaño' }, { label: 'Nuevos' }, { label: 'Usados' }, { label: 'Total' }],
      rows: TAMANOS_GARRAFON.map((t) => [
        t,
        numero(stock.porTamano[t]?.nuevos || 0),
        numero(stock.porTamano[t]?.usados || 0),
        numero((stock.porTamano[t]?.nuevos || 0) + (stock.porTamano[t]?.usados || 0))
      ]).concat([[
        'TOTAL',
        numero(stock.nuevos),
        numero(stock.usados),
        numero(stock.total)
      ]])
    },
    {
      titulo: 'Movimientos',
      columns: [{ label: 'Fecha' }, { label: 'Tipo' }, { label: 'Tamaño' }, { label: 'Nuevos' }, { label: 'Usados' }, { label: 'Concepto' }],
      rows: lista.map((m) => [
        fechaLegible(m.fecha),
        m.tipo,
        m.tamano || '19L',
        m.nuevos || 0,
        m.usados || 0,
        m.concepto || (m.pedidoId ? 'Pedido #' + m.pedidoId : '—')
      ])
    }
  ]);
  toast('PDF generado', 'success');
}

async function recargar() {
  _movs = await getAll(STORES.inventario);
  const stock = await stockGarrafones();
  const cont = $('#stockGarrafones');
  if (cont) {
    cont.innerHTML = '';
    // KPIs agregados (totales sin distinguir tamaño, para visión rápida).
    cont.appendChild(el('div', { class: 'kpi kpi--azul' }, [el('div', { class: 'kpi__valor', text: numero(stock.nuevos) }), el('div', { class: 'kpi__label', text: 'Nuevos (total)' })]));
    cont.appendChild(el('div', { class: 'kpi kpi--naranja' }, [el('div', { class: 'kpi__valor', text: numero(stock.usados) }), el('div', { class: 'kpi__label', text: 'Usados (total)' })]));
    cont.appendChild(el('div', { class: 'kpi kpi--verde' }, [el('div', { class: 'kpi__valor', text: numero(stock.total) }), el('div', { class: 'kpi__label', text: 'Total en inventario' })]));
  }

  // Tabla de existencias por tamaño (4 columnas).
  const tablaCont = $('#tablaPorTamano');
  if (tablaCont) {
    tablaCont.innerHTML = '';
    const t = el('table', { class: 'data' });
    t.innerHTML = `
      <thead><tr><th>Tamaño</th><th>Nuevos</th><th>Usados</th><th>Total</th></tr></thead>
      <tbody>
        ${TAMANOS_GARRAFON.map((tam) => {
          const n = stock.porTamano[tam]?.nuevos || 0;
          const u = stock.porTamano[tam]?.usados || 0;
          return `<tr><td><strong>${esc(tam)}</strong></td><td>${numero(n)}</td><td>${numero(u)}</td><td>${numero(n + u)}</td></tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr><th>TOTAL</th><th>${numero(stock.nuevos)}</th><th>${numero(stock.usados)}</th><th>${numero(stock.total)}</th></tr></tfoot>
    `;
    tablaCont.appendChild(el('div', { class: 'table-wrap' }, [t]));
  }

  pintarLista();
}

function pintarLista() {
  const cont = $('#listaInv');
  if (!cont) return;
  cont.innerHTML = '';
  const lista = _movs.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.id || 0) - (a.id || 0));
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🛢️' }),
      el('p', { text: 'Sin movimientos. Registra la compra de garrafones nuevos para iniciar el inventario.' })
    ]));
    return;
  }
  lista.forEach((m) => cont.appendChild(tarjetaMov(m)));
}

export async function render(root) {
  _movs = await getAll(STORES.inventario);
  const stock = await stockGarrafones();

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h2', { text: 'Inventario de garrafones' }),
    el('button', { class: 'btn btn--primary', text: '＋ Movimiento', onclick: formularioMovimiento })
  ]));

  const grid = el('div', { class: 'kpi-grid', id: 'stockGarrafones' });
  root.appendChild(grid);

  // Tabla detallada por tamaño.
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'Existencias por tamaño' }),
    el('div', { id: 'tablaPorTamano' })
  ]));

  root.appendChild(el('div', { class: 'toolbar' }, [
    el('div', { class: 'grow' }),
    el('button', { class: 'btn btn--danger', text: '📄 PDF', onclick: expPDF })
  ]));

  root.appendChild(el('div', { id: 'listaInv', class: 'list' }));

  await recargar();
}
