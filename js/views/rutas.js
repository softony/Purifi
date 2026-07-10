/**
 * rutas.js — Agrupación de clientes por zona y gestión de rutas diarias.
 *
 * v2.4: nueva sección "🤖 Ruta sugerida para hoy" que calcula automáticamente
 * a qué clientes toca visitar en una fecha dada, según su frecuencia de
 * compra y su última entrega. El usuario puede convertir esa sugerencia en
 * una ruta manual editable con un solo botón.
 *
 * Preparado para futura geolocalización: cada parada puede guardar {lat,lng}
 * y el orden puede optimizarse sin cambiar el esquema.
 */
import { STORES, getAll, add, put, remove } from '../db.js';
import {
  el, $, $$, toast, abrirModal, cerrarModal, confirmar, esc,
  hoyISO, fechaLegible, folioCliente, sumarDiasISO, FRECUENCIAS
} from '../utils.js';
import { clientesPorColonia, rutaSugerida } from '../services.js';

let _clientes = [];
let _rutas = [];
let _mapaCliente = new Map();
let _sugerencia = null;       // resultado de rutaSugerida() para la fecha seleccionada
let _fechaSugerida = hoyISO(); // fecha activa en el panel de sugerencia

/* ===========================================================
   RUTA SUGERIDA (AUTOMÁTICA)
   =========================================================== */

/** Carga la sugerencia para la fecha activa y la pinta. */
async function cargarSugerencia() {
  const cont = $('#sugerenciaCont');
  if (!cont) return;
  cont.innerHTML = '<div class="loading"><span class="spinner"></span> Calculando…</div>';
  try {
    _sugerencia = await rutaSugerida(_fechaSugerida);
    pintarSugerencia(cont);
  } catch (e) {
    cont.innerHTML = `<div class="empty-state"><p>Error al calcular: ${esc(e.message)}</p></div>`;
  }
}

function badgeVencimiento(p) {
  if (p.vencidoPor === 0) {
    return el('span', { class: 'badge badge--info', text: '🔔 Toca hoy' });
  }
  // Vencido por N días → tono rojo según severidad
  const v = p.vencidoPor;
  let clase = 'badge--adeudo';
  if (v >= 14) clase = 'badge--adeudo';
  else if (v >= 7) clase = 'badge--adeudo';
  return el('span', { class: `badge ${clase}`, text: `⚠️ Vencido ${v}d` });
}

function tarjetaSugerencia(p) {
  const c = p.cliente;
  const folio = folioCliente(c);
  const dir = [c.calle, c.colonia].filter(Boolean).join(', ');
  const arr = [
    el('button', { class: 'btn btn--primary btn--sm', text: '➕ Pedido', onclick: () => window.navegar(`pedidos/nuevo/${c.id}`) })
  ];
  if (c.telefono) {
    const tel = String(c.telefono).replace(/[^0-9+]/g, '');
    arr.push(el('a', { class: 'btn btn--ghost btn--sm', href: `tel:${tel}`, text: '📞' }));
  }
  return el('div', { class: 'item', style: 'flex-wrap:wrap' }, [
    el('div', { class: 'cliente-num', title: `Número de cliente ${folio}` }, [
      el('small', { text: 'N.º' }),
      el('b', { text: folio })
    ]),
    el('div', { class: 'item__main' }, [
      el('div', { class: 'item__title', text: c.nombre }),
      el('div', { class: 'item__meta', html: `${esc(dir || 'Sin dirección')}${c.referencia ? ' · ' + esc(c.referencia) : ''}` }),
      el('div', { class: 'tag-line mt', style: 'flex-wrap:wrap' }, [
        el('span', { class: 'badge badge--info', text: '🔄 ' + (p.frecuencia || 'Semanal') }),
        badgeVencimiento(p),
        el('span', { class: 'badge badge--info', text: `Última: ${fechaLegible(p.ultima)}` })
      ]),
      el('div', { class: 'btn-row', style: 'margin-top:6px' }, arr)
    ])
  ]);
}

function pintarSugerencia(cont) {
  cont.innerHTML = '';
  const s = _sugerencia;
  if (!s || !s.total) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🎉' }),
      el('p', { text: '¡Nadie por visitar en esta fecha! Todos los clientes están al día.' })
    ]));
    return;
  }

  // Resumen + acciones
  const resumen = el('div', { class: 'card', style: 'background:var(--naranja-claro)' }, [
    el('div', { class: 'flex', style: 'justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px' }, [
      el('div', {}, [
        el('strong', { html: `${s.total} cliente(s) por visitar` }),
        el('p', { class: 'muted', style: 'margin:2px 0 0', text: s.vencidos > 0 ? `${s.vencidos} vencido(s) · ${s.total - s.vencidos} justo(s) hoy` : 'Todos tocan justo hoy' })
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn--ghost btn--sm', text: '🔄 Actualizar', onclick: cargarSugerencia }),
        el('button', { class: 'btn btn--primary btn--lg', text: '➕ Crear ruta con estos clientes', onclick: crearRutaDesdeSugerencia })
      ])
    ])
  ]);
  cont.appendChild(resumen);

  // Paradas agrupadas por zona
  s.porZona.forEach(([zona, lista]) => {
    const card = el('div', { class: 'card' });
    const head = el('div', { class: 'zona__head' }, [
      el('span', { text: '📍 ' + zona }),
      el('span', { class: 'zona__count', text: String(lista.length) })
    ]);
    const body = el('div', { class: 'list' });
    lista.forEach((p) => body.appendChild(tarjetaSugerencia(p)));
    head.addEventListener('click', () => { body.hidden = !body.hidden; });
    card.appendChild(head);
    card.appendChild(body);
    cont.appendChild(card);
  });
}

/** Crea una ruta manual editable con los clientes de la sugerencia actual. */
function crearRutaDesdeSugerencia() {
  if (!_sugerencia || !_sugerencia.total) {
    toast('No hay clientes para crear la ruta', 'warn');
    return;
  }
  // Construye un objeto ruta "fantasma" con las paradas preseleccionadas.
  const preseleccion = _sugerencia.paradas.map((p) => ({
    clienteId: p.cliente.id,
    entregado: false
  }));
  // Pasa los IDs al formulario para que los marque por defecto.
  formularioRuta(null, { fecha: _sugerencia.fecha, paradas: preseleccion, nombre: `Ruta sugerida ${fechaLegible(_sugerencia.fecha)}` });
}

/* ===========================================================
   RUTAS MANUALES (igual que antes + soporte preselección)
   =========================================================== */

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

/* ---------- Crear / editar ruta diaria ----------
 * v2.4: si se pasa `preseleccion`, se usa como objeto base (fecha, nombre y
 * paradas) y los checkboxes se marcan según las paradas. Sirve para crear
 * una ruta a partir de la sugerencia automática.
 */
function formularioRuta(ruta = null, preseleccion = null) {
  const esEdit = !!ruta;
  const base = ruta || preseleccion || {};
  const seleccion = new Set((base.paradas || []).map((p) => p.clienteId));
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
        <input id="rFecha" name="fecha" type="date" required value="${esc(base.fecha || hoyISO())}" />
      </div>
      <div class="field">
        <label for="rNombre">Nombre (opcional)</label>
        <input id="rNombre" name="nombre" placeholder="Ej. Ruta mañana" value="${esc(base.nombre || '')}" />
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

    const prev = new Map((base.paradas || []).map((p) => [p.clienteId, p]));
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
  // Recarga también la sugerencia (porque pudo cambiar al marcar entregas)
  await cargarSugerencia();
}

function pintarRutas() {
  const cont = $('#rutasCont');
  if (!cont) return;
  const lista = _rutas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  cont.innerHTML = '';
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🚚' }),
      el('p', { text: 'No hay rutas creadas. Usa la sugerencia de arriba o crea una manualmente.' })
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
    el('div', {}, [
      el('h2', { text: 'Rutas' }),
      el('p', { class: 'page-sub', text: 'La ruta de cada día se calcula sola según la frecuencia de cada cliente y su última entrega.' })
    ]),
    el('button', { class: 'btn btn--ghost', text: '➕ Ruta manual', onclick: () => formularioRuta() })
  ]));

  /* --- Ruta sugerida (automática) --- */
  const sugCard = el('div', { class: 'card' }, [
    el('h3', { html: '🤖 Ruta sugerida' }),
    el('p', { class: 'hint', style: 'margin:0 0 10px', text: 'Calculada automáticamente: muestra a quién toca visitar (y quién ya se venció). Puedes convertirla en una ruta editable para ajustarla antes de salir.' })
  ]);
  const toolbar = el('div', { class: 'toolbar' }, [
    el('label', { class: 'flex', style: 'gap:6px;align-items:center' }, [
      el('span', { text: '📅 Fecha:' }),
      (() => {
        const i = el('input', { type: 'date', value: _fechaSugerida, onchange: (e) => { _fechaSugerida = e.target.value; cargarSugerencia(); } });
        return i;
      })()
    ]),
    el('div', { class: 'grow' }),
    el('button', { class: 'btn btn--ghost btn--sm', text: '⏪ Hoy', onclick: () => { _fechaSugerida = hoyISO(); const i = toolbar.querySelector('input[type=date]'); if (i) i.value = _fechaSugerida; cargarSugerencia(); } }),
    el('button', { class: 'btn btn--ghost btn--sm', text: '➡️ Mañana', onclick: () => { _fechaSugerida = sumarDiasISO(hoyISO(), 1); const i = toolbar.querySelector('input[type=date]'); if (i) i.value = _fechaSugerida; cargarSugerencia(); } })
  ]);
  sugCard.appendChild(toolbar);
  sugCard.appendChild(el('div', { id: 'sugerenciaCont' }));
  root.appendChild(sugCard);

  root.appendChild(el('hr', { class: 'divider' }));

  /* --- Rutas manuales --- */
  root.appendChild(el('h3', { text: '🚚 Rutas guardadas' }));
  root.appendChild(el('div', { id: 'rutasCont' }));

  root.appendChild(el('hr', { class: 'divider' }));
  root.appendChild(el('h3', { text: '📍 Clientes por zona' }));
  root.appendChild(el('p', { class: 'page-sub', text: 'Toca una colonia para ver las calles y clientes.' }));
  const zonasCont = el('div', { id: 'zonasCont' });
  root.appendChild(zonasCont);

  root.appendChild(el('button', { class: 'fab', title: 'Nueva ruta manual', text: '＋', onclick: () => formularioRuta() }));

  pintarRutas();
  await pintarZonas(zonasCont);
  await cargarSugerencia();
}
