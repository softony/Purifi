/**
 * seguimiento.js — Clientes por visitar e inactivos (riesgo de fuga).
 * Ayuda a no perder clientes (Hallazgo #1) y a planear rutas (Fase 5):
 * según la frecuencia de cada cliente y su última entrega, sugiere a quién
 * surtir hoy y avisa de quién lleva mucho sin comprar.
 */
import { STORES, getAll } from '../db.js';
import {
  el, $, esc, fechaLegible, folioCliente
} from '../utils.js';
import { seguimientoClientes } from '../services.js';

let _items = [];

function textoDias(it) {
  if (it.dias == null) return 'Sin compras registradas';
  if (it.dias === 0) return 'Compró hoy';
  const venc = it.dias - it.interval;
  const base = `Última compra: ${fechaLegible(it.ultima)} · hace ${it.dias} día(s)`;
  if (venc > 0) return `${base} · vencido por ${venc} día(s)`;
  return base;
}

function acciones(c) {
  const arr = [
    el('button', { class: 'btn btn--primary btn--sm', text: '➕ Pedido', onclick: () => window.navegar(`pedidos/nuevo/${c.id}`) })
  ];
  if (c.telefono) {
    const tel = String(c.telefono).replace(/[^0-9+]/g, '');
    arr.push(el('a', { class: 'btn btn--ghost btn--sm', href: `tel:${tel}`, text: '📞 Llamar' }));
  }
  return el('div', { class: 'btn-row', style: 'margin-top:6px' }, arr);
}

function tarjeta(it) {
  const c = it.cliente;
  const folio = folioCliente(c);
  const meta = [c.colonia, c.frecuencia].filter(Boolean).join(' · ');
  return el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
    el('div', { class: 'cliente-num', title: `Número de cliente ${folio}` }, [
      el('small', { text: 'N.º' }),
      el('b', { text: folio })
    ]),
    el('div', { class: 'item__main' }, [
      el('div', { class: 'item__title', text: c.nombre }),
      el('div', { class: 'item__meta', html: esc(meta || 'Sin zona') }),
      el('div', { class: 'item__meta', html: esc(textoDias(it)) }),
      acciones(c)
    ])
  ]);
}

function seccion(titulo, emoji, lista, vacioMsg, bg) {
  const card = el('div', { class: 'card' }, [
    el('h3', { html: `${emoji} ${esc(titulo)} <span class="badge badge--info">${lista.length}</span>` })
  ]);
  if (bg) card.style.background = bg;
  if (!lista.length) {
    card.appendChild(el('p', { class: 'muted', text: vacioMsg }));
  } else {
    const cont = el('div', { class: 'list' });
    lista.forEach((it) => cont.appendChild(tarjeta(it)));
    card.appendChild(cont);
  }
  return card;
}

export async function render(root) {
  _items = await seguimientoClientes();

  const porVisitar = _items.filter((i) => i.estado === 'por_visitar').sort((a, b) => (b.dias - b.interval) - (a.dias - a.interval));
  const inactivos = _items.filter((i) => i.estado === 'inactivo').sort((a, b) => b.dias - a.dias);
  const sinCompras = _items.filter((i) => i.estado === 'sin_compras').sort((a, b) => (a.cliente.nombre || '').localeCompare(b.cliente.nombre || '', 'es'));
  const alDia = _items.filter((i) => i.estado === 'al_dia').length;

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h2', { text: 'Seguimiento de clientes' }),
      el('p', { class: 'page-sub', text: 'Según la frecuencia de compra de cada cliente y su última entrega.' })
    ])
  ]));

  if (!_items.length) {
    root.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🔔' }),
      el('p', { text: 'Aún no hay clientes registrados.' })
    ]));
    return;
  }

  root.appendChild(seccion('Por visitar hoy', '🔔', porVisitar,
    '¡Nadie pendiente por visitar hoy! 🎉', 'var(--naranja-claro)'));
  root.appendChild(seccion('Inactivos · riesgo de fuga', '⚠️', inactivos,
    'Sin clientes en riesgo. 👍', 'var(--rojo-claro, #ffebee)'));
  root.appendChild(seccion('Sin compras registradas', '🆕', sinCompras,
    'Todos los clientes ya tienen al menos una entrega.'));

  root.appendChild(el('p', { class: 'muted', style: 'text-align:center;margin-top:8px', text: `${alDia} cliente(s) al día.` }));
}
