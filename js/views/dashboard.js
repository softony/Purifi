/**
 * dashboard.js — Vista principal con indicadores clave (KPIs).
 */
import { el, dinero, numero, hoyISO, fechaLegible } from '../utils.js';
import { resumenDashboard, seguimientoClientes } from '../services.js';
import { getConfig } from '../db.js';

function kpi(icono, label, valor, clase) {
  return el('div', { class: `kpi kpi--${clase}` }, [
    el('div', { class: 'kpi__icon', text: icono }),
    el('div', { class: 'kpi__valor', text: valor }),
    el('div', { class: 'kpi__label', text: label })
  ]);
}

export async function render(root) {
  const [r, cfg, seg] = await Promise.all([resumenDashboard(), getConfig(), seguimientoClientes()]);
  const porVisitar = seg.filter((i) => i.estado === 'por_visitar').length;
  const inactivos = seg.filter((i) => i.estado === 'inactivo').length;

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h2', { text: `Hola, ${cfg.negocio}` }),
      el('p', { class: 'page-sub', text: `Resumen de hoy · ${fechaLegible(hoyISO())}` })
    ])
  ]));

  // KPIs principales
  const grid = el('div', { class: 'kpi-grid' }, [
    kpi('💰', 'Ventas del día', dinero(r.ventasDia), 'verde'),
    kpi('📅', 'Ventas de la semana', dinero(r.ventasSemana), 'azul'),
    kpi('👥', 'Clientes activos', numero(r.clientesActivos), 'azul'),
    kpi('⚠️', 'Adeudos pendientes', dinero(r.adeudoTotal), 'rojo')
  ]);
  root.appendChild(grid);

  const grid2 = el('div', { class: 'kpi-grid' }, [
    kpi('🛢️', 'Garrafones vendidos (total)', numero(r.garrafonesTotal), 'naranja'),
    kpi('🚚', 'Garrafones hoy', numero(r.garrafonesHoy), 'azul'),
    kpi('📦', 'Pedidos hoy', numero(r.pedidosHoy), 'verde'),
    kpi('⏳', 'Pedidos pendientes', numero(r.pendientes), 'naranja')
  ]);
  root.appendChild(grid2);

  // Alertas / avisos
  const avisos = el('div', { class: 'card' }, [ el('h3', { text: 'Resumen rápido' }) ]);
  const ul = el('div', { class: 'list' });

  if (r.clientesConAdeudo > 0) {
    ul.appendChild(el('div', { class: 'item' }, [
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${r.clientesConAdeudo} cliente(s) con adeudo` }),
        el('div', { class: 'item__meta', text: `Total por cobrar: ${dinero(r.adeudoTotal)}` })
      ]),
      el('button', { class: 'btn btn--warn btn--sm', text: 'Ver cobranza', onclick: () => window.navegar('cobranza') })
    ]));
  }
  if (r.pendientes > 0) {
    ul.appendChild(el('div', { class: 'item' }, [
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${r.pendientes} pedido(s) pendiente(s)` }),
        el('div', { class: 'item__meta', text: 'Marca las entregas realizadas en Rutas o Pedidos.' })
      ]),
      el('button', { class: 'btn btn--primary btn--sm', text: 'Ver rutas', onclick: () => window.navegar('rutas') })
    ]));
  }
  if (porVisitar > 0) {
    ul.appendChild(el('div', { class: 'item' }, [
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${porVisitar} cliente(s) por visitar` }),
        el('div', { class: 'item__meta', text: 'Según su frecuencia de compra, ya toca surtirles.' })
      ]),
      el('button', { class: 'btn btn--warn btn--sm', text: 'Ver seguimiento', onclick: () => window.navegar('seguimiento') })
    ]));
  }
  if (inactivos > 0) {
    ul.appendChild(el('div', { class: 'item' }, [
      el('div', { class: 'item__main' }, [
        el('div', { class: 'item__title', text: `${inactivos} cliente(s) inactivo(s)` }),
        el('div', { class: 'item__meta', text: 'Llevan mucho sin comprar — posible riesgo de fuga.' })
      ]),
      el('button', { class: 'btn btn--ghost btn--sm', text: 'Ver seguimiento', onclick: () => window.navegar('seguimiento') })
    ]));
  }
  if (!r.clientesConAdeudo && !r.pendientes && !porVisitar && !inactivos) {
    ul.appendChild(el('p', { class: 'muted', text: '¡Todo al día! No hay adeudos, pendientes ni clientes por visitar.' }));
  }
  avisos.appendChild(ul);
  root.appendChild(avisos);

  // Accesos rápidos
  const acc = el('div', { class: 'card' }, [
    el('h3', { text: 'Acciones rápidas' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--primary btn--lg', text: '➕ Nuevo pedido', onclick: () => window.navegar('pedidos/nuevo') }),
      el('button', { class: 'btn btn--ghost btn--lg', text: '👤 Nuevo cliente', onclick: () => window.navegar('clientes/nuevo') }),
      el('button', { class: 'btn btn--ghost btn--lg', text: '💵 Registrar pago', onclick: () => window.navegar('cobranza') })
    ])
  ]);
  root.appendChild(acc);
}
