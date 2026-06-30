/**
 * configuracion.js — Ajustes del negocio, precios, respaldo y export/import.
 */
import { getConfig, setConfigBulk, resetAll, count, STORES } from '../db.js';
import { el, $, toast, confirmar, setMoneda, dinero, esc, fechaHoraLegible, abrirModal, cerrarModal } from '../utils.js';
import {
  exportarJSON, compartirRespaldo, importarJSON, exportarExcelCompleto,
  obtenerRespaldoAutoInfo, restaurarRespaldoAuto, respaldoAutomatico
} from '../export.js';

/**
 * Confirmación reforzada para el borrado total: obliga a escribir la palabra
 * "BORRAR" para habilitar el botón (evita borrados accidentales por toque),
 * y ofrece respaldar antes.
 */
function confirmarBorradoTotal() {
  const PALABRA = 'BORRAR';
  const f = el('form', { class: 'form' });
  f.innerHTML = `
    <p class="confirm__msg">⚠️ Esto borra <strong>TODO</strong>: clientes, pedidos, cobranza, rutas, gastos, mantenimiento, inventario y la configuración (nombre y precios). <strong>No se puede deshacer.</strong></p>
    <p class="hint">Si aún no has respaldado, hazlo antes. Para continuar, escribe <strong>${PALABRA}</strong> en el campo:</p>
    <div class="field">
      <input id="palabraBorrar" name="palabra" autocomplete="off" autocapitalize="characters" placeholder="Escribe ${PALABRA}" />
    </div>
    <div class="btn-row" style="margin-bottom:12px">
      <button type="button" class="btn btn--ghost grow" id="btnRespaldarAntes">📤 Respaldar primero</button>
    </div>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--lg grow" id="btnCancelarBorrar">Cancelar</button>
      <button type="submit" class="btn btn--danger btn--lg grow" id="btnConfirmarBorrar" disabled>Borrar todo</button>
    </div>
  `;
  const input = f.querySelector('#palabraBorrar');
  const btnOk = f.querySelector('#btnConfirmarBorrar');
  input.addEventListener('input', () => {
    btnOk.disabled = input.value.trim().toUpperCase() !== PALABRA;
  });
  f.querySelector('#btnCancelarBorrar').addEventListener('click', cerrarModal);
  f.querySelector('#btnRespaldarAntes').addEventListener('click', async () => {
    try {
      const r = await compartirRespaldo();
      if (r.cancelado) return;
      toast(r.compartido ? 'Respaldo compartido' : 'Respaldo descargado', 'success');
    } catch (e) { toast('No se pudo respaldar: ' + e.message, 'error'); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (input.value.trim().toUpperCase() !== PALABRA) return;
    await resetAll();
    toast('Todo reiniciado', 'success');
    cerrarModal();
    setTimeout(() => location.reload(), 800);
  });
  abrirModal('Confirmar borrado total', f);
}

async function guardarConfig(form) {
  const fd = Object.fromEntries(new FormData(form).entries());
  const cfg = {
    negocio: (fd.negocio || '').trim() || 'Mi Purificadora',
    precioDomicilio: Number(fd.precioDomicilio) || 0,
    precioVentanilla: Number(fd.precioVentanilla) || 0,
    precioCanje: Number(fd.precioCanje) || 0,
    moneda: fd.moneda || 'MXN',
    respaldoAuto: !!form.querySelector('#respaldoAuto').checked
  };
  await setConfigBulk(cfg);
  setMoneda(cfg.moneda);
  toast('Configuración guardada', 'success');
  return cfg;
}

async function importarArchivo(merge) {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      await importarJSON(file, { merge });
      toast('Datos importados correctamente', 'success');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast('Archivo inválido: ' + e.message, 'error');
    }
  });
  input.click();
}

export async function render(root) {
  const [cfg, nClientes, nPedidos, nPagos] = await Promise.all([
    getConfig(), count(STORES.clientes), count(STORES.pedidos), count(STORES.pagos)
  ]);
  const respaldoAuto = obtenerRespaldoAutoInfo();

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' }, [ el('h2', { text: 'Configuración' }) ]));

  /* --- Datos del negocio y precios --- */
  const form = el('form', { class: 'form card' });
  form.innerHTML = `
    <h3>🏪 Negocio y precios</h3>
    <div class="field">
      <label for="negocio">Nombre del negocio</label>
      <input id="negocio" name="negocio" value="${esc(cfg.negocio)}" placeholder="Mi Purificadora" />
    </div>
    <div class="field--row">
      <div class="field">
        <label for="precioDomicilio">Precio a domicilio</label>
        <input id="precioDomicilio" name="precioDomicilio" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(cfg.precioDomicilio)}" />
      </div>
      <div class="field">
        <label for="precioVentanilla">Precio en ventanilla</label>
        <input id="precioVentanilla" name="precioVentanilla" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(cfg.precioVentanilla)}" />
      </div>
    </div>
    <div class="field">
      <label for="precioCanje">Precio de canje (por garrafón)</label>
      <input id="precioCanje" name="precioCanje" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(cfg.precioCanje)}" />
      <p class="hint" style="margin:4px 0 0">Cargo por cambiar un garrafón usado por uno nuevo. Se usa al registrar canjes en Pedidos.</p>
    </div>
    <div class="field">
      <label for="moneda">Moneda</label>
      <select id="moneda" name="moneda">
        ${['MXN', 'USD', 'GTQ', 'COP', 'ARS', 'PEN', 'CLP'].map((m) => `<option ${cfg.moneda === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <label class="flex" style="gap:10px">
      <input id="respaldoAuto" type="checkbox" ${cfg.respaldoAuto ? 'checked' : ''} style="width:26px;height:26px" />
      <span>Respaldo automático local al abrir la app</span>
    </label>
    <div class="form__actions">
      <button type="submit" class="btn btn--primary btn--lg btn--block">💾 Guardar configuración</button>
    </div>
  `;
  form.addEventListener('submit', async (e) => { e.preventDefault(); await guardarConfig(form); });
  root.appendChild(form);

  /* --- Resumen de datos --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: '📦 Datos almacenados' }),
    el('p', { html: `<strong>${nClientes}</strong> clientes · <strong>${nPedidos}</strong> pedidos · <strong>${nPagos}</strong> movimientos de cobranza.` }),
    el('p', { class: 'hint', text: 'Todo se guarda en tu dispositivo (IndexedDB). Funciona sin internet.' })
  ]));

  /* --- Exportar --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: '⬆️ Exportar y respaldar' }),
    el('p', { class: 'hint', html: cfg.ultimoRespaldo ? `Último respaldo manual: <strong>${esc(fechaHoraLegible(cfg.ultimoRespaldo))}</strong>` : '⚠️ Aún no has hecho un respaldo. Tus datos viven solo en este dispositivo: respáldalos seguido y guárdalos fuera del teléfono.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--primary btn--lg', text: '📤 Enviar respaldo (WhatsApp/Drive/correo)', onclick: async () => {
        try {
          const r = await compartirRespaldo();
          if (r.cancelado) return;
          toast(r.compartido ? 'Respaldo compartido' : 'Respaldo descargado', 'success');
          window.navegar('configuracion'); setTimeout(() => location.reload(), 400);
        } catch (e) { toast('No se pudo compartir: ' + e.message, 'error'); }
      } }),
      el('button', { class: 'btn btn--ghost btn--lg', text: '🗄️ Descargar respaldo (JSON)', onclick: async () => { await exportarJSON(); toast('Respaldo descargado', 'success'); window.navegar('configuracion'); setTimeout(() => location.reload(), 400); } }),
      el('button', { class: 'btn btn--success btn--lg', text: '📊 Todo a Excel', onclick: async () => { try { await exportarExcelCompleto(); toast('Excel generado', 'success'); } catch (e) { toast(e.message, 'error'); } } })
    ]),
    el('p', { class: 'hint', style: 'margin-top:8px', text: '💡 Recomendado: una vez por semana, envía el respaldo a tu WhatsApp o Google Drive. Así, si cambias o pierdes el celular, no pierdes la información.' })
  ]));

  /* --- Importar --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: '⬇️ Importar datos' }),
    el('p', { class: 'hint', text: 'Restaura desde un archivo de respaldo JSON. "Reemplazar" borra los datos actuales.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--ghost btn--lg', text: '➕ Combinar', onclick: () => importarArchivo(true) }),
      el('button', { class: 'btn btn--warn btn--lg', text: '♻️ Reemplazar', onclick: async () => {
        const ok = await confirmar('Esto reemplazará TODOS los datos actuales por los del archivo. ¿Continuar?', { ok: 'Reemplazar', peligro: true });
        if (ok) importarArchivo(false);
      } })
    ])
  ]));

  /* --- Respaldo automático local --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: '🛟 Respaldo automático local' }),
    el('p', { class: 'hint', html: respaldoAuto ? `Último respaldo: <strong>${esc(respaldoAuto.legible)}</strong>` : 'Aún no se ha generado un respaldo automático.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--ghost', text: '💾 Respaldar ahora', onclick: async () => { await respaldoAutomatico(); toast('Respaldo local actualizado', 'success'); window.navegar('configuracion'); setTimeout(() => location.reload(), 300); } }),
      el('button', { class: 'btn btn--ghost', text: '↩️ Restaurar respaldo local', onclick: async () => {
        const ok = await confirmar('¿Restaurar desde el último respaldo automático local? Se reemplazarán los datos actuales.', { ok: 'Restaurar', peligro: true });
        if (!ok) return;
        try { await restaurarRespaldoAuto(); toast('Respaldo restaurado', 'success'); setTimeout(() => location.reload(), 800); }
        catch (e) { toast(e.message, 'error'); }
      } })
    ])
  ]));

  /* --- Zona peligrosa --- */
  root.appendChild(el('div', { class: 'card', style: 'border:2px solid var(--rojo-claro)' }, [
    el('h3', { text: '⚠️ Reiniciar de fábrica' }),
    el('p', { class: 'hint', text: 'Borra TODO: clientes, pedidos, cobranza, rutas, gastos, mantenimiento, inventario Y la configuración (nombre y precios). Los contadores vuelven a cero (el primer cliente será el N.º 001) y la app volverá a pedir la configuración inicial. Esta acción no se puede deshacer.' }),
    el('button', { class: 'btn btn--danger btn--lg btn--block', text: '🗑️ Borrar todo y reiniciar', onclick: confirmarBorradoTotal })
  ]));

  /* --- Acerca de --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'ℹ️ Acerca de' }),
    el('p', { class: 'muted', text: 'AquaGestión v1.0 — PWA para purificadoras. Funciona sin conexión e instalable en el celular.' }),
    el('p', { class: 'hint', text: 'Arquitectura preparada para futuras funciones de geolocalización y optimización de rutas.' })
  ]));
}
