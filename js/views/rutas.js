/**
 * rutas.js — Agrupación de clientes por zona y gestión de rutas diarias.
 * Preparado para futura geolocalización: cada parada puede guardar {lat,lng}
 * y el orden puede optimizarse sin cambiar el esquema.
 */
import { STORES, getAll, add, put, remove } from '../db.js';
import {
  el, $, $$, toast, abrirModal, cerrarModal, confirmar, esc,
  hoyISO, fechaLegible, folioCliente
} from '../utils.js';
import { clientesPorColonia } from '../services.js';

let _clientes = [];
let _rutas = [];
let _mapaCliente = new Map();

/* ---------- Clientes por zona (colonia / calle) ---------- */
async function pintarZonas(cont) {
  const grupos = await clientesPorColonia();
  cont.innerHTML = '';
  if (!grupos.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🗺️' }),
      el('p', { text: 'Aún no hay clientes para agrupar por zona.' })
    ]));
    return;
  }
  grupos.forEach(([zona, lista]) => {
    const body = el('div', { class: 'zona__body list', hidden: true });
    lista.forEach((c) => {
      body.appendChild(el('div', { class: 'item' }, [
        el('div', { class: 'cliente-num', title: `Número de cliente ${folioCliente(c)}` }, [
          el('small', { text: 'N.º' }),
          el('b', { text: folioCliente(c) })
        ]),
        el('div', { class: 'item__main' }, [
          el('div', { class: 'item__title', text: c.nombre }),
          el('div', { class: 'item__meta', html: `${esc([c.calle, c.referencia].filter(Boolean).join(' · ') || 'Sin calle')}${c.telefono ? ' · 📞 ' + esc(c.telefono) : ''}` })
        ])
      ]));
    });
    const head = el('div', { class: 'zona__head' }, [
      el('span', { text: '📍 ' + zona }),
      el('span', { class: 'zona__count', text: String(lista.length) })
    ]);
    head.addEventListener('click', () => { body.hidden = !body.hidden; });
    cont.appendChild(el('div', { class: 'zona' }, [head, body]));
  });
}

/* ---------- Crear / editar ruta diaria ---------- */
function formularioRuta(ruta = null) {
  const esEdit = !!ruta;
  const seleccion = new Set((ruta?.paradas || []).map((p) => p.clienteId));
  const f = el('form', { class: 'form' });

  const grupos = agruparClientes(_clientes);
  const checks = grupos.map(([zona, lista]) => `
    <div class="zona">
      <div class="zona__head" data-zona-toggle><span>📍 ${esc(zona)}</span><span class="zona__count">${lista.length}</span></div>
      <div class="zona__body">
        ${lista.map((c) => `
          <label class="item" style="cursor:pointer">
            <input type="checkbox" value="${c.id}" ${seleccion.has(c.id) ? 'checked' : ''} style="width:26px;height:26px" />
            <div class="item__main">
              <div class="item__title"><span class="num-inline">N.º ${folioCliente(c)}</span> ${esc(c.nombre)}</div>
              <div class="item__meta">${esc([c.calle].filter(Boolean).join(', ') || 'Sin calle')}</div>
            </div>
          </label>`).join('')}
      </div>
    </div>`).join('');

  f.innerHTML = `
    <div class="field--row">
      <div class="field">
        <label for="rFecha">Fecha de la ruta *</label>
        <input id="rFecha" name="fecha" type="date" required value="${esc(ruta?.fecha || hoyISO())}" />
      </div>
      <div class="field">
        <label for="rNombre">Nombre (opcional)</label>
        <input id="rNombre" name="nombre" placeholder="Ej. Ruta mañana" value="${esc(ruta?.nombre || '')}" />
      </div>
    </div>
    <p class="hint">Selecciona los clientes a visitar. Toca el título de una zona para plegarla.</p>
    <div id="rSeleccion">${checks || '<p class="muted">No hay clientes registrados.</p>'}</div>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelar">Cancelar</button>
      <button type="submit" class="btn btn--primary btn--lg grow">${esEdit ? 'Guardar ruta' : 'Crear ruta'}</button>
    </div>
  `;

  f.querySelectorAll('[data-zona-toggle]').forEach((h) =>
    h.addEventListener('click', () => { const b = h.nextElementSibling; b.hidden = !b.hidden; }));
  f.querySelector('#btnCancelar').addEventListener('click', cerrarModal);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const ids = $$('#rSeleccion input[type=checkbox]:checked', f).map((c) => Number(c.value));
    if (!ids.length) { toast('Selecciona al menos un cliente', 'error'); return; }

    const prev = new Map((ruta?.paradas || []).map((p) => [p.clienteId, p]));
    const paradas = ids.map((id) => prev.get(id) || { clienteId: id, entregado: false });

    const registro = { ...(ruta || {}), fecha: fd.fecha, nombre: (fd.nombre || '').trim(), paradas };
    if (esEdit) { await put(STORES.rutas, registro); toast('Ruta actualizada', 'success'); }
    else { registro.creadoEn = new Date().toISOString(); await add(STORES.rutas, registro); toast('Ruta creada', 'success'); }
    cerrarModal();
    await recargar();
  });

  abrirModal(esEdit ? 'Editar ruta' : 'Nueva ruta diaria', f);
}

function agruparClientes(clientes) {
  const grupos = new Map();
  clientes.forEach((c) => {
    const z = (c.colonia || 'Sin colonia').trim() || 'Sin colonia';
    if (!grupos.has(z)) grupos.set(z, []);
    grupos.get(z).push(c);
  });
  return Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

/* ---------- Tarjeta de ruta con paradas ---------- */
function tarjetaRuta(ruta) {
  const total = ruta.paradas.length;
  const hechas = ruta.paradas.filter((p) => p.entregado).length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;

  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'page-head', style: 'margin-bottom:8px' }, [
    el('div', {}, [
      el('h3', { text: ruta.nombre || `Ruta ${fechaLegible(ruta.fecha)}`, style: 'margin:0' }),
      el('div', { class: 'item__meta', text: `${fechaLegible(ruta.fecha)} · ${hechas}/${total} entregas (${pct}%)` })
    ]),
    el('div', { class: 'item__actions' }, [
      el('button', { class: 'icon-btn', title: 'Editar', text: '✏️', onclick: () => formularioRuta(ruta) }),
      el('button', { class: 'icon-btn icon-btn--danger', title: 'Eliminar', text: '🗑️', onclick: () => eliminarRuta(ruta) })
    ])
  ]));

  const lista = el('div', { class: 'list' });
  ruta.paradas.forEach((parada, idx) => {
    const c = _mapaCliente.get(parada.clienteId);
    const nombre = c ? c.nombre : '— Cliente eliminado —';
    const folio = c ? folioCliente(c) : null;
    const dir = c ? [c.calle, c.colonia].filter(Boolean).join(', ') : '';
    const item = el('div', { class: 'item' }, [
      el('div', { class: 'item__main', style: parada.entregado ? 'opacity:.6;text-decoration:line-through' : '' }, [
        el('div', { class: 'item__title', html: `${idx + 1}. ${folio ? `<span class="num-inline">N.º ${folio}</span> ` : ''}${esc(nombre)}` }),
        el('div', { class: 'item__meta', html: `${esc(dir || 'Sin dirección')}${c?.referencia ? ' · ' + esc(c.referencia) : ''}` })
      ]),
      el('button', {
        class: `icon-btn ${parada.entregado ? 'icon-btn--ok' : ''}`,
        title: parada.entregado ? 'Entregado' : 'Marcar entregado',
        text: parada.entregado ? '✓' : '○',
        onclick: () => toggleEntrega(ruta, parada)
      })
    ]);
    lista.appendChild(item);
  });
  card.appendChild(lista);
  return card;
}

async function toggleEntrega(ruta, parada) {
  parada.entregado = !parada.entregado;
  parada.entregadoEn = parada.entregado ? new Date().toISOString() : null;
  await put(STORES.rutas, ruta);
  await recargar();
}

async function eliminarRuta(ruta) {
  const ok = await confirmar('¿Eliminar esta ruta?', { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.rutas, ruta.id);
  toast('Ruta eliminada', 'success');
  await recargar();
}

async function recargar() {
  [_clientes, _rutas] = await Promise.all([getAll(STORES.clientes), getAll(STORES.rutas)]);
  _mapaCliente = new Map(_clientes.map((c) => [c.id, c]));
  pintarRutas();
  const zc = $('#zonasCont');
  if (zc) pintarZonas(zc);
}

function pintarRutas() {
  const cont = $('#rutasCont');
  if (!cont) return;
  const lista = _rutas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  cont.innerHTML = '';
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🚚' }),
      el('p', { text: 'No hay rutas creadas. Crea tu primera ruta diaria.' })
    ]));
    return;
  }
  lista.forEach((r) => cont.appendChild(tarjetaRuta(r)));
}

export async function render(root) {
  [_clientes, _rutas] = await Promise.all([getAll(STORES.clientes), getAll(STORES.rutas)]);
  _mapaCliente = new Map(_clientes.map((c) => [c.id, c]));

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h2', { text: 'Rutas' }),
    el('button', { class: 'btn btn--primary', text: '➕ Nueva ruta', onclick: () => formularioRuta() })
  ]));

  root.appendChild(el('h3', { text: '🚚 Rutas diarias' }));
  root.appendChild(el('div', { id: 'rutasCont' }));

  root.appendChild(el('hr', { class: 'divider' }));
  root.appendChild(el('h3', { text: '📍 Clientes por zona' }));
  root.appendChild(el('p', { class: 'page-sub', text: 'Toca una colonia para ver las calles y clientes.' }));
  const zonasCont = el('div', { id: 'zonasCont' });
  root.appendChild(zonasCont);

  root.appendChild(el('button', { class: 'fab', title: 'Nueva ruta', text: '＋', onclick: () => formularioRuta() }));

  pintarRutas();
  await pintarZonas(zonasCont);
}
