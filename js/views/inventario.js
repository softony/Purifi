/**
 * inventario.js — Inventario de garrafones (nuevos y usados/retornados).
 * Funciona por movimientos: cada registro suma o resta a cada categoría, y el
 * stock actual es la suma de todos los movimientos. Soporta compra de nuevos,
 * canje, retorno de usados, baja/reciclado y ajustes manuales.
 *
 * Los canjes hechos desde un pedido entregado se registran aquí automáticamente
 * (llevan pedidoId) para mantener el inventario sincronizado con las ventas.
 */
import { STORES, getAll, add, remove } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc,
  hoyISO, fechaLegible, numero, INVENTARIO_TIPOS
} from '../utils.js';
import { stockGarrafones } from '../services.js';

let _movs = [];

/** Calcula los deltas (nuevos/usados) de un movimiento según su tipo. */
function deltasPorTipo(tipo, cantidad, ajusteCategoria, ajusteSigno) {
  const c = Math.abs(Number(cantidad) || 0);
  switch (tipo) {
    case 'Compra de nuevos': return { nuevos: c, usados: 0 };
    case 'Canje': return { nuevos: -c, usados: c };
    case 'Retorno de usado': return { nuevos: 0, usados: c };
    case 'Baja / reciclado': return { nuevos: 0, usados: -c };
    case 'Ajuste': {
      const signo = ajusteSigno === '-' ? -1 : 1;
      return ajusteCategoria === 'usados' ? { nuevos: 0, usados: signo * c } : { nuevos: signo * c, usados: 0 };
    }
    default: return { nuevos: 0, usados: 0 };
  }
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
    <div class="field">
      <label for="iTipo">Tipo de movimiento *</label>
      <select id="iTipo" name="tipo" required>
        ${INVENTARIO_TIPOS.map((t) => `<option>${esc(t)}</option>`).join('')}
      </select>
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
      'Compra de nuevos': 'Aumenta el stock de garrafones nuevos.',
      'Canje': 'Sale 1 garrafón nuevo y entra 1 usado (el que devuelve el cliente), por cantidad.',
      'Retorno de usado': 'Aumenta el stock de garrafones usados/retornados.',
      'Baja / reciclado': 'Resta del stock de usados (reciclado, dañado, eliminado).',
      'Ajuste': 'Corrección manual de existencias.'
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
    const { nuevos, usados } = deltasPorTipo(fd.tipo, cantidad, fd.ajusteCategoria, fd.ajusteSigno);
    await add(STORES.inventario, {
      fecha: fd.fecha || hoyISO(),
      tipo: fd.tipo,
      cantidad,
      nuevos,
      usados,
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
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', html: `${esc(m.tipo)}${m.pedidoId ? ' <span class="badge badge--info">📦 auto pedido</span>' : ''}` }),
    el('div', { class: 'item__meta', html: `${esc(fechaLegible(m.fecha))}${m.concepto ? ' · ' + esc(m.concepto) : ''}` }),
    el('div', { class: 'tag-line mt' }, [
      m.nuevos ? el('span', { class: 'flex', style: 'gap:4px' }, [el('small', { text: 'Nuevos' }), signoTxt(m.nuevos)]) : null,
      m.usados ? el('span', { class: 'flex', style: 'gap:4px' }, [el('small', { text: 'Usados' }), signoTxt(m.usados)]) : null
    ])
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
      titulo: 'Existencias actuales',
      columns: [{ label: 'Categoría' }, { label: 'Existencias' }],
      rows: [['Nuevos', numero(stock.nuevos)], ['Usados / retornados', numero(stock.usados)], ['Total', numero(stock.total)]]
    },
    {
      titulo: 'Movimientos',
      columns: [{ label: 'Fecha' }, { label: 'Tipo' }, { label: 'Nuevos' }, { label: 'Usados' }, { label: 'Concepto' }],
      rows: lista.map((m) => [fechaLegible(m.fecha), m.tipo, m.nuevos || 0, m.usados || 0, m.concepto || (m.pedidoId ? 'Pedido #' + m.pedidoId : '—')])
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
    cont.appendChild(el('div', { class: 'kpi kpi--azul' }, [el('div', { class: 'kpi__valor', text: numero(stock.nuevos) }), el('div', { class: 'kpi__label', text: 'Garrafones nuevos' })]));
    cont.appendChild(el('div', { class: 'kpi kpi--naranja' }, [el('div', { class: 'kpi__valor', text: numero(stock.usados) }), el('div', { class: 'kpi__label', text: 'Usados / retornados' })]));
    cont.appendChild(el('div', { class: 'kpi kpi--verde' }, [el('div', { class: 'kpi__valor', text: numero(stock.total) }), el('div', { class: 'kpi__label', text: 'Total en inventario' })]));
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

  root.appendChild(el('div', { class: 'toolbar' }, [
    el('div', { class: 'grow' }),
    el('button', { class: 'btn btn--danger', text: '📄 PDF', onclick: expPDF })
  ]));

  root.appendChild(el('div', { id: 'listaInv', class: 'list' }));

  await recargar();
}
