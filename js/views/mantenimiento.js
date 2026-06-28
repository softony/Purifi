/**
 * mantenimiento.js — Bitácora de mantenimiento y calidad.
 * Documenta cambios de filtro, mantenimiento preventivo, reparaciones y pruebas
 * de calidad, dando trazabilidad técnica (Hallazgos #5, #7, #8 del diagnóstico).
 * Incluye un recordatorio del próximo cambio de filtros (cada 30 días).
 */
import { STORES, getAll, add, put, remove } from '../db.js';
import {
  el, $, toast, abrirModal, cerrarModal, confirmar, esc,
  dinero, hoyISO, fechaLegible, diasEntre, sumarDiasISO,
  MANTENIMIENTO_TIPOS, DIAS_CAMBIO_FILTROS
} from '../utils.js';

let _registros = [];

/* ---------- Recordatorio de cambio de filtros ---------- */
function infoFiltros() {
  const filtros = _registros.filter((r) => r.tipo === 'Cambio de filtros' && r.fecha);
  if (!filtros.length) return null;
  const ultimo = filtros.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
  const prox = ultimo.proximoCambio || sumarDiasISO(ultimo.fecha, DIAS_CAMBIO_FILTROS);
  return { ultimo, prox, dias: diasEntre(hoyISO(), prox) };
}

function tarjetaRecordatorio() {
  const info = infoFiltros();
  if (!info) {
    return el('div', { class: 'card', style: 'background:var(--azul-claro)' }, [
      el('h3', { text: '🔧 Cambio de filtros' }),
      el('p', { class: 'muted', text: 'Aún no hay cambios de filtro registrados. Registra el primero para activar el recordatorio (cada 30 días).' })
    ]);
  }
  const { prox, dias } = info;
  let bg = 'var(--verde-claro)';
  let msg = `Próximo cambio sugerido: ${fechaLegible(prox)} (en ${dias} día(s)).`;
  if (dias < 0) { bg = 'var(--rojo-claro, #ffebee)'; msg = `⚠️ Cambio de filtros VENCIDO desde ${fechaLegible(prox)} (hace ${Math.abs(dias)} día(s)).`; }
  else if (dias <= 7) { bg = 'var(--naranja-claro)'; msg = `Próximo cambio MUY PRONTO: ${fechaLegible(prox)} (en ${dias} día(s)).`; }
  return el('div', { class: 'card', style: `background:${bg}` }, [
    el('h3', { text: '🔧 Cambio de filtros' }),
    el('p', { html: `<strong>${esc(msg)}</strong>` }),
    el('p', { class: 'muted', style: 'margin:4px 0 0', text: `Último cambio: ${fechaLegible(info.ultimo.fecha)}.` })
  ]);
}

/* ---------- Formulario ---------- */
function esTipoConCosto(tipo) {
  return tipo !== 'Prueba de calidad';
}

function formularioRegistro(reg = {}) {
  const esEdit = !!reg.id;
  const f = el('form', { class: 'form' });
  f.innerHTML = `
    <div class="field--row">
      <div class="field">
        <label for="mFecha">Fecha *</label>
        <input id="mFecha" name="fecha" type="date" required value="${esc(reg.fecha || hoyISO())}" />
      </div>
      <div class="field">
        <label for="mTipo">Tipo *</label>
        <select id="mTipo" name="tipo" required>
          ${MANTENIMIENTO_TIPOS.map((t) => `<option ${reg.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field" id="campoProximo">
      <label for="mProximo">Próximo cambio de filtros (recordatorio)</label>
      <input id="mProximo" name="proximoCambio" type="date" value="${esc(reg.proximoCambio || '')}" />
      <p class="hint" style="margin:4px 0 0">Si lo dejas vacío en un cambio de filtros, se calcula automático a 30 días.</p>
    </div>
    <div class="field">
      <label for="mDesc">Descripción / observaciones</label>
      <textarea id="mDesc" name="descripcion" placeholder="Ej. cambio de carbón y sedimentos; o prueba de sabor y cloro OK">${esc(reg.descripcion || '')}</textarea>
    </div>
    <div class="field--row">
      <div class="field">
        <label for="mTecnico">Técnico / responsable</label>
        <input id="mTecnico" name="tecnico" placeholder="Nombre" value="${esc(reg.tecnico || '')}" />
      </div>
      <div class="field" id="campoCosto">
        <label for="mCosto">Costo (opcional)</label>
        <input id="mCosto" name="costo" type="number" min="0" step="0.5" inputmode="decimal" value="${reg.costo != null ? reg.costo : ''}" placeholder="0.00" />
      </div>
    </div>
    ${esEdit ? '' : `
    <label class="flex" style="gap:8px" id="campoGasto">
      <input type="checkbox" name="registrarGasto" checked style="width:24px;height:24px" />
      <span>Registrar también el costo en Gastos (categoría Filtros / Mantenimiento)</span>
    </label>`}
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelar">Cancelar</button>
      <button type="submit" class="btn btn--primary btn--lg grow">${esEdit ? 'Guardar cambios' : 'Registrar'}</button>
    </div>
  `;

  const selTipo = f.querySelector('#mTipo');
  const campoProximo = f.querySelector('#campoProximo');
  const campoCosto = f.querySelector('#campoCosto');
  const ajustarCampos = () => {
    campoProximo.style.display = selTipo.value === 'Cambio de filtros' ? '' : 'none';
    campoCosto.style.display = esTipoConCosto(selTipo.value) ? '' : 'none';
  };
  selTipo.addEventListener('change', ajustarCampos);
  ajustarCampos();

  f.querySelector('#btnCancelar').addEventListener('click', cerrarModal);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const tipo = fd.tipo || 'Otro';
    const costo = esTipoConCosto(tipo) ? (Math.round((Number(fd.costo) || 0) * 100) / 100) : 0;
    let proximoCambio = (fd.proximoCambio || '').trim();
    if (tipo === 'Cambio de filtros' && !proximoCambio) {
      proximoCambio = sumarDiasISO(fd.fecha || hoyISO(), DIAS_CAMBIO_FILTROS);
    }
    if (tipo !== 'Cambio de filtros') proximoCambio = '';

    const registro = {
      ...reg,
      fecha: fd.fecha || hoyISO(),
      tipo,
      descripcion: (fd.descripcion || '').trim(),
      tecnico: (fd.tecnico || '').trim(),
      costo,
      proximoCambio
    };

    if (esEdit) {
      await put(STORES.mantenimiento, registro);
      toast('Registro actualizado', 'success');
    } else {
      registro.creadoEn = new Date().toISOString();
      await add(STORES.mantenimiento, registro);
      // Registrar el costo como gasto si así se indicó.
      if (fd.registrarGasto && costo > 0) {
        await add(STORES.gastos, {
          categoria: 'Filtros / Mantenimiento',
          monto: costo,
          fecha: registro.fecha,
          concepto: `${tipo}${registro.descripcion ? ' — ' + registro.descripcion : ''}`,
          creadoEn: new Date().toISOString()
        });
        toast('Registro y gasto guardados', 'success');
      } else {
        toast('Registro guardado', 'success');
      }
    }
    cerrarModal();
    await recargar();
  });

  abrirModal(esEdit ? 'Editar registro' : 'Nuevo registro de mantenimiento', f);
}

async function eliminarRegistro(r) {
  const ok = await confirmar(`¿Eliminar el registro “${r.tipo}” del ${fechaLegible(r.fecha)}?`, { ok: 'Eliminar', peligro: true });
  if (!ok) return;
  await remove(STORES.mantenimiento, r.id);
  toast('Registro eliminado', 'success');
  await recargar();
}

/* ---------- Tarjeta ---------- */
function iconoTipo(tipo) {
  if (tipo === 'Cambio de filtros') return '🔧';
  if (tipo === 'Prueba de calidad') return '💧';
  if (tipo === 'Reparación') return '🛠️';
  if (tipo === 'Mantenimiento preventivo') return '🧰';
  return '📋';
}

function tarjetaRegistro(r) {
  const meta = [fechaLegible(r.fecha), r.tecnico ? '👤 ' + r.tecnico : '', r.costo ? dinero(r.costo) : '']
    .filter(Boolean).join(' · ');
  const main = el('div', { class: 'item__main' }, [
    el('div', { class: 'item__title', text: `${iconoTipo(r.tipo)} ${r.tipo}` }),
    el('div', { class: 'item__meta', html: esc(meta) }),
    r.descripcion ? el('div', { class: 'item__meta', html: esc(r.descripcion) }) : null
  ]);
  const actions = el('div', { class: 'item__actions' }, [
    el('button', { class: 'icon-btn', title: 'Editar', text: '✏️', onclick: () => formularioRegistro(r) }),
    el('button', { class: 'icon-btn icon-btn--danger', title: 'Eliminar', text: '🗑️', onclick: () => eliminarRegistro(r) })
  ]);
  return el('div', { class: 'item' }, [main, actions]);
}

/* ---------- Exportación ---------- */
async function expPDF() {
  if (!_registros.length) { toast('No hay registros para exportar', 'info'); return; }
  const { exportarPDF } = await import('../export.js');
  const lista = _registros.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  await exportarPDF(`bitacora-mantenimiento-${hoyISO()}`, 'Bitácora de mantenimiento y calidad', [
    {
      titulo: 'Registros',
      columns: [{ label: 'Fecha' }, { label: 'Tipo' }, { label: 'Descripción' }, { label: 'Técnico' }, { label: 'Costo' }],
      rows: lista.map((r) => [fechaLegible(r.fecha), r.tipo, r.descripcion || '—', r.tecnico || '—', r.costo ? dinero(r.costo) : '—'])
    }
  ]);
  toast('PDF generado', 'success');
}

/* ---------- Render ---------- */
function pintarLista() {
  const cont = $('#listaMant');
  if (!cont) return;
  cont.innerHTML = '';
  const lista = _registros.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.id || 0) - (a.id || 0));
  if (!lista.length) {
    cont.appendChild(el('div', { class: 'empty-state' }, [
      el('span', { class: 'emoji', text: '🧰' }),
      el('p', { text: 'Sin registros aún. Documenta el primer cambio de filtros o prueba de calidad.' })
    ]));
    return;
  }
  lista.forEach((r) => cont.appendChild(tarjetaRegistro(r)));
}

async function recargar() {
  _registros = await getAll(STORES.mantenimiento);
  const rec = $('#recordatorioFiltros');
  if (rec) rec.replaceWith(Object.assign(tarjetaRecordatorio(), { id: 'recordatorioFiltros' }));
  pintarLista();
}

export async function render(root) {
  _registros = await getAll(STORES.mantenimiento);

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h2', { text: 'Mantenimiento' }),
    el('button', { class: 'btn btn--primary', text: '＋ Nuevo registro', onclick: () => formularioRegistro() })
  ]));

  const rec = tarjetaRecordatorio();
  rec.id = 'recordatorioFiltros';
  root.appendChild(rec);

  root.appendChild(el('div', { class: 'toolbar' }, [
    el('div', { class: 'grow' }),
    el('button', { class: 'btn btn--danger', text: '📄 PDF', onclick: expPDF })
  ]));

  root.appendChild(el('div', { id: 'listaMant', class: 'list' }));
  pintarLista();
}
