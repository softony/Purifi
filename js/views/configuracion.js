/**
 * configuracion.js — Ajustes del negocio, precios, respaldo y export/import.
 */
import { getConfig, setConfigBulk, resetAll, count, STORES } from '../db.js';
import { el, $, toast, confirmar, setMoneda, dinero, esc, fechaHoraLegible } from '../utils.js';
import {
  exportarJSON, importarJSON, exportarExcelCompleto,
  obtenerRespaldoAutoInfo, restaurarRespaldoAuto, respaldoAutomatico
} from '../export.js';

async function guardarConfig(form) {
  const fd = Object.fromEntries(new FormData(form).entries());
  const cfg = {
    negocio: (fd.negocio || '').trim() || 'Mi Purificadora',
    precioDomicilio: Number(fd.precioDomicilio) || 0,
    precioVentanilla: Number(fd.precioVentanilla) || 0,
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
    el('h3', { text: '⬆️ Exportar datos' }),
    el('p', { class: 'hint', text: 'Genera un respaldo completo o una hoja de cálculo con toda la información.' }),
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn--primary btn--lg', text: '🗄️ Respaldo (JSON)', onclick: async () => { await exportarJSON(); toast('Respaldo descargado', 'success'); } }),
      el('button', { class: 'btn btn--success btn--lg', text: '📊 Todo a Excel', onclick: async () => { try { await exportarExcelCompleto(); toast('Excel generado', 'success'); } catch (e) { toast(e.message, 'error'); } } })
    ])
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
    el('h3', { text: '⚠️ Borrar todos los datos' }),
    el('p', { class: 'hint', text: 'Elimina clientes, pedidos, cobranza y rutas. La configuración se conserva. Esta acción no se puede deshacer.' }),
    el('button', { class: 'btn btn--danger btn--lg btn--block', text: '🗑️ Borrar todo', onclick: async () => {
      const ok = await confirmar('¿Seguro que deseas borrar TODOS los datos? Considera exportar un respaldo antes.', { ok: 'Borrar todo', peligro: true });
      if (!ok) return;
      await resetAll();
      toast('Datos borrados', 'success');
      setTimeout(() => location.reload(), 800);
    } })
  ]));

  /* --- Acerca de --- */
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'ℹ️ Acerca de' }),
    el('p', { class: 'muted', text: 'AquaGestión v1.0 — PWA para purificadoras. Funciona sin conexión e instalable en el celular.' }),
    el('p', { class: 'hint', text: 'Arquitectura preparada para futuras funciones de geolocalización y optimización de rutas.' })
  ]));
}
