/**
 * export.js — Motor de exportación e importación.
 * Formatos: JSON (respaldo completo), CSV, Excel (.xlsx), PDF.
 * Usa librerías vendorizadas (SheetJS, jsPDF + AutoTable) cacheadas para offline.
 */
import { dumpAll, importAll, getConfig, setConfig, STORES, getAll } from './db.js';
import { descargarArchivo, hoyISO, toast, fechaHoraLegible } from './utils.js';

/* ---------- Respaldo completo JSON ---------- */
export async function exportarJSON() {
  const backup = await dumpAll();
  const json = JSON.stringify(backup, null, 2);
  descargarArchivo(`aquagestion-respaldo-${hoyISO()}.json`, json, 'application/json');
  await setConfig('ultimoRespaldo', new Date().toISOString());
  return backup;
}

export function leerArchivoTexto(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export async function importarJSON(file, opciones = {}) {
  const txt = await leerArchivoTexto(file);
  const backup = JSON.parse(txt);
  await importAll(backup, opciones);
  return backup;
}

/* ---------- Respaldo automático (a localStorage como red de seguridad) ---------- */
export async function respaldoAutomatico() {
  const cfg = await getConfig();
  if (!cfg.respaldoAuto) return;
  const backup = await dumpAll();
  try {
    localStorage.setItem('aquagestion_backup_auto', JSON.stringify(backup));
    localStorage.setItem('aquagestion_backup_auto_fecha', new Date().toISOString());
  } catch (e) {
    console.warn('No se pudo guardar respaldo automático local', e);
  }
}

export function obtenerRespaldoAutoInfo() {
  const fecha = localStorage.getItem('aquagestion_backup_auto_fecha');
  return fecha ? { fecha, legible: fechaHoraLegible(fecha) } : null;
}

export async function restaurarRespaldoAuto() {
  const raw = localStorage.getItem('aquagestion_backup_auto');
  if (!raw) throw new Error('No hay respaldo automático disponible');
  await importAll(JSON.parse(raw));
}

/* ---------- CSV ---------- */
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * rows: array de objetos. columns: [{key, label}] opcional.
 * Devuelve string CSV con separador ';' (amigable para Excel en es-MX) y BOM.
 */
export function generarCSV(rows, columns) {
  if (!columns) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    columns = keys.map((k) => ({ key: k, label: k }));
  }
  const head = columns.map((c) => csvCell(c.label)).join(';');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(';')).join('\n');
  return '\uFEFF' + head + '\n' + body;
}

export function exportarCSV(nombre, rows, columns) {
  const csv = generarCSV(rows, columns);
  descargarArchivo(nombre.endsWith('.csv') ? nombre : `${nombre}.csv`, csv, 'text/csv;charset=utf-8');
}

/* ---------- Excel (.xlsx) ---------- */
function asegurarXLSX() {
  if (!window.XLSX) throw new Error('La librería de Excel no está disponible. Revisa tu conexión la primera vez.');
  return window.XLSX;
}

/**
 * sheets: [{ nombre, rows, columns }]
 * Cada hoja se construye a partir de filas de objetos.
 */
export function exportarExcel(nombre, sheets) {
  const XLSX = asegurarXLSX();
  const wb = XLSX.utils.book_new();
  sheets.forEach((sh) => {
    let aoa;
    if (sh.columns) {
      const head = sh.columns.map((c) => c.label);
      const body = sh.rows.map((r) => sh.columns.map((c) => r[c.key]));
      aoa = [head, ...body];
    } else {
      const keys = sh.rows.length ? Object.keys(sh.rows[0]) : [];
      aoa = [keys, ...sh.rows.map((r) => keys.map((k) => r[k]))];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Ancho de columnas automático básico
    const colCount = aoa[0] ? aoa[0].length : 0;
    ws['!cols'] = Array.from({ length: colCount }, (_, i) => {
      const max = aoa.reduce((m, row) => Math.max(m, String(row[i] ?? '').length), 10);
      return { wch: Math.min(max + 2, 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, (sh.nombre || 'Hoja').slice(0, 31));
  });
  XLSX.writeFile(wb, nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`);
}

/** Exporta TODO el sistema como un libro Excel con varias hojas. */
export async function exportarExcelCompleto() {
  const [clientes, pedidos, pagos, gastos, mantenimiento, inventario] = await Promise.all([
    getAll(STORES.clientes), getAll(STORES.pedidos), getAll(STORES.pagos),
    getAll(STORES.gastos), getAll(STORES.mantenimiento), getAll(STORES.inventario)
  ]);
  const mapaCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  exportarExcel(`aquagestion-datos-${hoyISO()}`, [
    {
      nombre: 'Clientes',
      rows: clientes,
      columns: [
        { key: 'id', label: 'ID' }, { key: 'nombre', label: 'Nombre' },
        { key: 'telefono', label: 'Teléfono' }, { key: 'calle', label: 'Calle' },
        { key: 'colonia', label: 'Colonia' }, { key: 'referencia', label: 'Referencia' },
        { key: 'frecuencia', label: 'Frecuencia' }, { key: 'notas', label: 'Notas' }
      ]
    },
    {
      nombre: 'Pedidos',
      rows: pedidos.map((p) => ({ ...p, cliente: mapaCliente.get(p.clienteId) || '—' })),
      columns: [
        { key: 'id', label: 'ID' }, { key: 'fecha', label: 'Fecha' },
        { key: 'cliente', label: 'Cliente' }, { key: 'cantidad', label: 'Garrafones' },
        { key: 'precioUnit', label: 'Precio Unit.' }, { key: 'total', label: 'Total' },
        { key: 'estado', label: 'Estado' }, { key: 'metodoPago', label: 'Método de pago' },
        { key: 'observaciones', label: 'Observaciones' }
      ]
    },
    {
      nombre: 'Cobranza',
      rows: pagos.map((p) => ({ ...p, cliente: mapaCliente.get(p.clienteId) || '—' })),
      columns: [
        { key: 'id', label: 'ID' }, { key: 'fecha', label: 'Fecha' },
        { key: 'cliente', label: 'Cliente' }, { key: 'tipo', label: 'Tipo' },
        { key: 'monto', label: 'Monto' }, { key: 'concepto', label: 'Concepto' }
      ]
    },
    {
      nombre: 'Gastos',
      rows: gastos,
      columns: [
        { key: 'id', label: 'ID' }, { key: 'fecha', label: 'Fecha' },
        { key: 'categoria', label: 'Categoría' }, { key: 'monto', label: 'Monto' },
        { key: 'concepto', label: 'Concepto' }
      ]
    },
    {
      nombre: 'Mantenimiento',
      rows: mantenimiento,
      columns: [
        { key: 'id', label: 'ID' }, { key: 'fecha', label: 'Fecha' },
        { key: 'tipo', label: 'Tipo' }, { key: 'descripcion', label: 'Descripción' },
        { key: 'tecnico', label: 'Técnico' }, { key: 'costo', label: 'Costo' },
        { key: 'proximoCambio', label: 'Próximo cambio' }
      ]
    },
    {
      nombre: 'Inventario',
      rows: inventario,
      columns: [
        { key: 'id', label: 'ID' }, { key: 'fecha', label: 'Fecha' },
        { key: 'tipo', label: 'Tipo' }, { key: 'cantidad', label: 'Cantidad' },
        { key: 'nuevos', label: 'Δ Nuevos' }, { key: 'usados', label: 'Δ Usados' },
        { key: 'concepto', label: 'Concepto' }, { key: 'pedidoId', label: 'Pedido' }
      ]
    }
  ]);
}

/* ---------- PDF ---------- */
function obtenerJsPDF() {
  const ns = window.jspdf || window.jsPDF;
  const ctor = ns && (ns.jsPDF || ns);
  if (!ctor) throw new Error('La librería de PDF no está disponible. Revisa tu conexión la primera vez.');
  return ctor;
}

/**
 * Genera un PDF con encabezado + una o varias tablas.
 * secciones: [{ titulo, columns:[{label}], rows:[[...]], resumen?:string }]
 */
export async function exportarPDF(nombreArchivo, tituloDoc, secciones) {
  const JsPDF = obtenerJsPDF();
  const cfg = await getConfig();
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFillColor(2, 119, 189);
  doc.rect(0, 0, ancho, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(cfg.negocio || 'Purificadora', 40, 32);
  doc.setFontSize(12);
  doc.text(tituloDoc, 40, 52);
  doc.setFontSize(9);
  doc.text(`Generado: ${fechaHoraLegible(new Date().toISOString())}`, ancho - 40, 52, { align: 'right' });

  let y = 90;
  doc.setTextColor(38, 50, 56);

  secciones.forEach((sec) => {
    if (sec.titulo) {
      doc.setFontSize(13);
      doc.text(sec.titulo, 40, y);
      y += 8;
    }
    doc.autoTable({
      startY: y + 6,
      head: [sec.columns.map((c) => c.label)],
      body: sec.rows,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [2, 119, 189], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 250, 252] },
      margin: { left: 40, right: 40 }
    });
    y = doc.lastAutoTable.finalY + 16;
    if (sec.resumen) {
      doc.setFontSize(11);
      doc.text(sec.resumen, 40, y);
      y += 20;
    }
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 60;
    }
  });

  doc.save(nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`);
}

export default {
  exportarJSON, importarJSON, leerArchivoTexto,
  respaldoAutomatico, obtenerRespaldoAutoInfo, restaurarRespaldoAuto,
  generarCSV, exportarCSV, exportarExcel, exportarExcelCompleto, exportarPDF
};
