/**
 * reportes.js — Reportes de ventas y cobranza con exportación a Excel y PDF.
 */
import { STORES, getAll } from '../db.js';
import {
  el, $, dinero, numero, hoyISO, fechaLegible, inicioSemanaISO, inicioMesISO,
  nombreMes, toast, folioCliente
} from '../utils.js';
import {
  ventasPorDia, filtrarPorFecha, clientesMasFrecuentes, saldosTodos, mapaClientes,
  totalGastos, gastosPorCategoria
} from '../services.js';
import { exportarExcel, exportarPDF, exportarCSV } from '../export.js';

let _pedidos = [];
let _gastos = [];
let _periodo = 'semana';
let _datos = null; // resultado calculado actual

function rango(periodo) {
  const hoy = hoyISO();
  if (periodo === 'dia') return { desde: hoy, hasta: hoy, titulo: `Ventas del día · ${fechaLegible(hoy)}` };
  if (periodo === 'semana') return { desde: inicioSemanaISO(), hasta: hoy, titulo: 'Ventas de la semana' };
  return { desde: inicioMesISO(), hasta: hoy, titulo: `Ventas del mes · ${nombreMes()}` };
}

async function calcular() {
  const { desde, hasta, titulo } = rango(_periodo);
  const porDia = ventasPorDia(_pedidos, desde, hasta);
  const enRango = filtrarPorFecha(_pedidos, desde, hasta);
  const totalVentas = enRango.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const totalGarrafones = enRango.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);

  const [frecuentes, saldos, mapa] = await Promise.all([
    clientesMasFrecuentes(10), saldosTodos(), mapaClientes()
  ]);
  const deudores = [];
  for (const [id, saldo] of saldos) {
    if (saldo > 0.001) {
      const c = mapa.get(id);
      deudores.push({ folio: c ? folioCliente(c) : '—', nombre: c ? c.nombre : '— eliminado —', telefono: c?.telefono || '', saldo });
    }
  }
  deudores.sort((a, b) => b.saldo - a.saldo);

  const gastosPeriodo = totalGastos(_gastos, desde, hasta);
  const gastosCat = gastosPorCategoria(_gastos, desde, hasta);
  const utilidad = Math.round((totalVentas - gastosPeriodo) * 100) / 100;

  _datos = {
    desde, hasta, titulo, porDia, totalVentas, totalGarrafones, pedidos: enRango.length,
    frecuentes, deudores, gastosPeriodo, gastosCat, utilidad
  };
  return _datos;
}

function tablaVentas(d) {
  const wrap = el('div', { class: 'table-wrap' });
  const t = el('table', { class: 'data' });
  t.innerHTML = `
    <thead><tr><th>Fecha</th><th>Pedidos</th><th>Garrafones</th><th>Total</th></tr></thead>
    <tbody>
      ${d.porDia.map((r) => `<tr><td>${fechaLegible(r.fecha)}</td><td>${numero(r.pedidos)}</td><td>${numero(r.garrafones)}</td><td>${dinero(r.total)}</td></tr>`).join('')}
      ${d.porDia.length ? '' : '<tr><td colspan="4" class="muted">Sin ventas en el periodo.</td></tr>'}
    </tbody>
    <tfoot><tr><th>Total</th><th>${numero(d.pedidos)}</th><th>${numero(d.totalGarrafones)}</th><th>${dinero(d.totalVentas)}</th></tr></tfoot>
  `;
  wrap.appendChild(t);
  return wrap;
}

function tablaFrecuentes(d) {
  const wrap = el('div', { class: 'table-wrap' });
  const t = el('table', { class: 'data' });
  t.innerHTML = `
    <thead><tr><th>N.º</th><th>Cliente</th><th>Pedidos</th><th>Garrafones</th></tr></thead>
    <tbody>
      ${d.frecuentes.filter((x) => x.pedidos > 0).map((x) => `<tr><td>${folioCliente(x.cliente) || '—'}</td><td>${x.cliente.nombre}</td><td>${numero(x.pedidos)}</td><td>${numero(x.garrafones)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin datos.</td></tr>'}
    </tbody>
  `;
  wrap.appendChild(t);
  return wrap;
}

function tablaDeudores(d) {
  const wrap = el('div', { class: 'table-wrap' });
  const total = d.deudores.reduce((s, x) => s + x.saldo, 0);
  const t = el('table', { class: 'data' });
  t.innerHTML = `
    <thead><tr><th>N.º</th><th>Cliente</th><th>Teléfono</th><th>Adeudo</th></tr></thead>
    <tbody>
      ${d.deudores.map((x) => `<tr><td>${x.folio || '—'}</td><td>${x.nombre}</td><td>${x.telefono || '—'}</td><td>${dinero(x.saldo)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin adeudos. 🎉</td></tr>'}
    </tbody>
    <tfoot><tr><th colspan="3">Total por cobrar</th><th>${dinero(total)}</th></tr></tfoot>
  `;
  wrap.appendChild(t);
  return wrap;
}

/* ---------- Exportaciones ---------- */
function tablaGastos(d) {
  const wrap = el('div', { class: 'table-wrap' });
  const t = el('table', { class: 'data' });
  t.innerHTML = `
    <thead><tr><th>Categoría</th><th>Total</th></tr></thead>
    <tbody>
      ${d.gastosCat.map((g) => `<tr><td>${g.categoria}</td><td>${dinero(g.total)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sin gastos en el periodo.</td></tr>'}
    </tbody>
    <tfoot><tr><th>Total gastos</th><th>${dinero(d.gastosPeriodo)}</th></tr></tfoot>
  `;
  wrap.appendChild(t);
  return wrap;
}

function tarjetaBalance(d) {
  const positivo = d.utilidad >= 0;
  return el('div', { class: 'card', style: `background:${positivo ? 'var(--verde-claro)' : 'var(--rojo-claro, #ffebee)'}` }, [
    el('h3', { text: '⚖️ Balance del periodo' }),
    el('div', { class: 'balance' }, [
      el('div', { class: 'balance__row' }, [el('span', { text: 'Ingresos (ventas)' }), el('strong', { text: dinero(d.totalVentas) })]),
      el('div', { class: 'balance__row' }, [el('span', { text: 'Gastos' }), el('strong', { text: '− ' + dinero(d.gastosPeriodo) })]),
      el('div', { class: 'balance__row balance__row--total' }, [
        el('span', { text: positivo ? 'Utilidad' : 'Pérdida' }),
        el('strong', { text: dinero(d.utilidad) })
      ])
    ]),
    el('p', { class: 'muted', style: 'margin:8px 0 0', text: d.gastosPeriodo === 0 ? 'Aún no hay gastos registrados en el periodo. Registra los gastos para conocer la utilidad real.' : (positivo ? 'El negocio es rentable en este periodo. 🎉' : 'Los gastos superan a las ventas en este periodo.') })
  ]);
}


function expExcel() {
  const d = _datos;
  if (!d) return;
  exportarExcel(`reporte-${_periodo}-${hoyISO()}`, [
    {
      nombre: 'Ventas',
      rows: d.porDia.map((r) => ({ Fecha: r.fecha, Pedidos: r.pedidos, Garrafones: r.garrafones, Total: r.total })),
    },
    {
      nombre: 'Clientes frecuentes',
      rows: d.frecuentes.filter((x) => x.pedidos > 0).map((x) => ({ 'N.º': folioCliente(x.cliente) || '', Cliente: x.cliente.nombre, Pedidos: x.pedidos, Garrafones: x.garrafones })),
    },
    {
      nombre: 'Adeudos',
      rows: d.deudores.map((x) => ({ 'N.º': x.folio || '', Cliente: x.nombre, Telefono: x.telefono, Adeudo: x.saldo })),
    },
    {
      nombre: 'Gastos por categoria',
      rows: d.gastosCat.map((g) => ({ Categoria: g.categoria, Total: g.total })),
    },
    {
      nombre: 'Balance',
      rows: [
        { Concepto: 'Ingresos (ventas)', Monto: d.totalVentas },
        { Concepto: 'Gastos', Monto: d.gastosPeriodo },
        { Concepto: d.utilidad >= 0 ? 'Utilidad' : 'Perdida', Monto: d.utilidad }
      ],
    }
  ]);
  toast('Excel generado', 'success');
}

async function expPDF() {
  const d = _datos;
  if (!d) return;
  await exportarPDF(`reporte-${_periodo}-${hoyISO()}`, d.titulo, [
    {
      titulo: 'Ventas por día',
      columns: [{ label: 'Fecha' }, { label: 'Pedidos' }, { label: 'Garrafones' }, { label: 'Total' }],
      rows: d.porDia.map((r) => [fechaLegible(r.fecha), r.pedidos, r.garrafones, dinero(r.total)]),
      resumen: `Total del periodo: ${dinero(d.totalVentas)} · ${numero(d.totalGarrafones)} garrafones · ${numero(d.pedidos)} pedidos.`
    },
    {
      titulo: 'Gastos por categoría',
      columns: [{ label: 'Categoría' }, { label: 'Total' }],
      rows: d.gastosCat.map((g) => [g.categoria, dinero(g.total)]),
      resumen: `Ingresos: ${dinero(d.totalVentas)}  −  Gastos: ${dinero(d.gastosPeriodo)}  =  ${d.utilidad >= 0 ? 'Utilidad' : 'Pérdida'}: ${dinero(d.utilidad)}.`
    },
    {
      titulo: 'Clientes más frecuentes',
      columns: [{ label: 'N.º' }, { label: 'Cliente' }, { label: 'Pedidos' }, { label: 'Garrafones' }],
      rows: d.frecuentes.filter((x) => x.pedidos > 0).map((x) => [folioCliente(x.cliente) || '—', x.cliente.nombre, x.pedidos, x.garrafones])
    },
    {
      titulo: 'Clientes con adeudos',
      columns: [{ label: 'N.º' }, { label: 'Cliente' }, { label: 'Teléfono' }, { label: 'Adeudo' }],
      rows: d.deudores.map((x) => [x.folio || '—', x.nombre, x.telefono || '—', dinero(x.saldo)]),
      resumen: `Total por cobrar: ${dinero(d.deudores.reduce((s, x) => s + x.saldo, 0))}.`
    }
  ]);
  toast('PDF generado', 'success');
}

function expCSV() {
  const d = _datos;
  if (!d) return;
  exportarCSV(`ventas-${_periodo}-${hoyISO()}`,
    d.porDia.map((r) => ({ fecha: r.fecha, pedidos: r.pedidos, garrafones: r.garrafones, total: r.total })),
    [{ key: 'fecha', label: 'Fecha' }, { key: 'pedidos', label: 'Pedidos' }, { key: 'garrafones', label: 'Garrafones' }, { key: 'total', label: 'Total' }]
  );
  toast('CSV generado', 'success');
}

async function pintar(root) {
  const d = await calcular();
  const cont = $('#reporteCont', root) || root;

  const body = el('div', {});
  // KPIs del periodo
  body.appendChild(el('div', { class: 'kpi-grid' }, [
    el('div', { class: 'kpi kpi--verde' }, [el('div', { class: 'kpi__valor', text: dinero(d.totalVentas) }), el('div', { class: 'kpi__label', text: 'Ventas del periodo' })]),
    el('div', { class: 'kpi kpi--naranja' }, [el('div', { class: 'kpi__valor', text: numero(d.totalGarrafones) }), el('div', { class: 'kpi__label', text: 'Garrafones' })]),
    el('div', { class: 'kpi kpi--azul' }, [el('div', { class: 'kpi__valor', text: numero(d.pedidos) }), el('div', { class: 'kpi__label', text: 'Pedidos' })]),
    el('div', { class: 'kpi kpi--rojo' }, [el('div', { class: 'kpi__valor', text: dinero(d.deudores.reduce((s, x) => s + x.saldo, 0)) }), el('div', { class: 'kpi__label', text: 'Por cobrar' })])
  ]));

  body.appendChild(el('div', { class: 'card' }, [el('h3', { text: '📈 ' + d.titulo }), tablaVentas(d)]));
  body.appendChild(tarjetaBalance(d));
  body.appendChild(el('div', { class: 'card' }, [el('h3', { text: '🧾 Gastos por categoría' }), tablaGastos(d)]));
  body.appendChild(el('div', { class: 'card' }, [el('h3', { text: '⭐ Clientes más frecuentes' }), tablaFrecuentes(d)]));
  body.appendChild(el('div', { class: 'card' }, [el('h3', { text: '⚠️ Clientes con adeudos' }), tablaDeudores(d)]));

  cont.innerHTML = '';
  cont.appendChild(body);
}

export async function render(root) {
  [_pedidos, _gastos] = await Promise.all([getAll(STORES.pedidos), getAll(STORES.gastos)]);

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [ el('h2', { text: 'Reportes' }) ]));

  // Selector de periodo
  const selPeriodo = el('select', { id: 'selPeriodo', onchange: async (e) => { _periodo = e.target.value; await pintar(root); } });
  selPeriodo.innerHTML = `
    <option value="dia">Hoy</option>
    <option value="semana" selected>Esta semana</option>
    <option value="mes">Este mes</option>`;

  root.appendChild(el('div', { class: 'toolbar' }, [
    el('label', { class: 'flex grow', style: 'gap:8px' }, [el('span', { text: 'Periodo:' }), selPeriodo])
  ]));

  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: '⬇️ Exportar reporte' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--success', text: '📊 Excel', onclick: expExcel }),
      el('button', { class: 'btn btn--danger', text: '📄 PDF', onclick: expPDF }),
      el('button', { class: 'btn btn--ghost', text: '📋 CSV', onclick: expCSV })
    ])
  ]));

  root.appendChild(el('div', { id: 'reporteCont' }, [el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), 'Calculando…'])]));
  await pintar(root);
}
