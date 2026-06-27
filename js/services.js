/**
 * services.js — Lógica de negocio y consultas derivadas.
 * Centraliza cálculos de ventas, saldos y agrupaciones para evitar duplicación.
 *
 * Modelo de saldos (cobranza):
 *   CARGOS  = pedidos a crédito (total) + adeudos manuales (pagos.tipo='adeudo')
 *   ABONOS  = pagos (pagos.tipo='pago')
 *   SALDO   = CARGOS - ABONOS   (positivo = el cliente debe)
 */
import { STORES, getAll, getByIndex } from './db.js';
import { hoyISO, inicioSemanaISO, inicioMesISO } from './utils.js';

export const CREDITO = 'Crédito (adeudo)';

export async function mapaClientes() {
  const clientes = await getAll(STORES.clientes);
  return new Map(clientes.map((c) => [c.id, c]));
}

export async function nombreCliente(clienteId, mapa) {
  const m = mapa || (await mapaClientes());
  const c = m.get(clienteId);
  return c ? c.nombre : '— Cliente eliminado —';
}

/** Saldo (adeudo) de un cliente. >0 significa que debe. */
export async function saldoCliente(clienteId) {
  const [pedidos, pagos] = await Promise.all([
    getByIndex(STORES.pedidos, 'clienteId', clienteId),
    getByIndex(STORES.pagos, 'clienteId', clienteId)
  ]);
  let cargos = 0;
  pedidos.forEach((p) => { if (p.metodoPago === CREDITO) cargos += Number(p.total) || 0; });
  let abonos = 0;
  pagos.forEach((p) => {
    if (p.tipo === 'adeudo') cargos += Number(p.monto) || 0;
    else abonos += Number(p.monto) || 0;
  });
  return Math.round((cargos - abonos) * 100) / 100;
}

/** Saldos de todos los clientes: Map<clienteId, saldo>. */
export async function saldosTodos() {
  const [pedidos, pagos] = await Promise.all([
    getAll(STORES.pedidos), getAll(STORES.pagos)
  ]);
  const saldo = new Map();
  const add = (id, v) => saldo.set(id, (saldo.get(id) || 0) + v);
  pedidos.forEach((p) => { if (p.metodoPago === CREDITO) add(p.clienteId, Number(p.total) || 0); });
  pagos.forEach((p) => {
    if (p.tipo === 'adeudo') add(p.clienteId, Number(p.monto) || 0);
    else add(p.clienteId, -(Number(p.monto) || 0));
  });
  for (const [k, v] of saldo) saldo.set(k, Math.round(v * 100) / 100);
  return saldo;
}

/** Ventas (suma de totales de pedidos) dentro de un rango de fechas ISO inclusivo. */
export function filtrarPorFecha(items, desdeISO, hastaISO) {
  return items.filter((it) => {
    const f = (it.fecha || '').slice(0, 10);
    if (desdeISO && f < desdeISO) return false;
    if (hastaISO && f > hastaISO) return false;
    return true;
  });
}

export async function resumenDashboard() {
  const [clientes, pedidos] = await Promise.all([
    getAll(STORES.clientes), getAll(STORES.pedidos)
  ]);
  const hoy = hoyISO();
  const lunes = inicioSemanaISO();
  const saldos = await saldosTodos();

  const pedidosHoy = filtrarPorFecha(pedidos, hoy, hoy);
  const pedidosSemana = filtrarPorFecha(pedidos, lunes, hoy);

  const ventasDia = pedidosHoy.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const ventasSemana = pedidosSemana.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const garrafonesTotal = pedidos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const garrafonesHoy = pedidosHoy.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);

  let adeudoTotal = 0; let clientesConAdeudo = 0;
  for (const v of saldos.values()) { if (v > 0.001) { adeudoTotal += v; clientesConAdeudo++; } }

  const pendientes = pedidos.filter((p) => p.estado === 'Pendiente').length;

  return {
    ventasDia, ventasSemana,
    clientesActivos: clientes.length,
    adeudoTotal, clientesConAdeudo,
    garrafonesTotal, garrafonesHoy,
    pedidosHoy: pedidosHoy.length,
    pendientes
  };
}

/** Clientes ordenados por número de pedidos (más frecuentes primero). */
export async function clientesMasFrecuentes(limite = 10) {
  const [clientes, pedidos] = await Promise.all([
    getAll(STORES.clientes), getAll(STORES.pedidos)
  ]);
  const conteo = new Map();
  const garraf = new Map();
  pedidos.forEach((p) => {
    conteo.set(p.clienteId, (conteo.get(p.clienteId) || 0) + 1);
    garraf.set(p.clienteId, (garraf.get(p.clienteId) || 0) + (Number(p.cantidad) || 0));
  });
  return clientes
    .map((c) => ({ cliente: c, pedidos: conteo.get(c.id) || 0, garrafones: garraf.get(c.id) || 0 }))
    .sort((a, b) => b.pedidos - a.pedidos || b.garrafones - a.garrafones)
    .slice(0, limite);
}

/** Agrupa clientes por colonia (zona) para rutas. */
export async function clientesPorColonia() {
  const clientes = await getAll(STORES.clientes);
  const grupos = new Map();
  clientes.forEach((c) => {
    const zona = (c.colonia || 'Sin colonia').trim() || 'Sin colonia';
    if (!grupos.has(zona)) grupos.set(zona, []);
    grupos.get(zona).push(c);
  });
  // Ordenar zonas alfabéticamente y clientes por calle
  return Array.from(grupos.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([zona, lista]) => [zona, lista.sort((a, b) => (a.calle || '').localeCompare(b.calle || '', 'es'))]);
}

/** Ventas agregadas por día dentro de un rango. */
export function ventasPorDia(pedidos, desdeISO, hastaISO) {
  const map = new Map();
  filtrarPorFecha(pedidos, desdeISO, hastaISO).forEach((p) => {
    const f = (p.fecha || '').slice(0, 10);
    const cur = map.get(f) || { fecha: f, total: 0, garrafones: 0, pedidos: 0 };
    cur.total += Number(p.total) || 0;
    cur.garrafones += Number(p.cantidad) || 0;
    cur.pedidos += 1;
    map.set(f, cur);
  });
  return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Suma total de gastos dentro de un rango de fechas ISO inclusivo. */
export function totalGastos(gastos, desdeISO, hastaISO) {
  return filtrarPorFecha(gastos, desdeISO, hastaISO)
    .reduce((s, g) => s + (Number(g.monto) || 0), 0);
}

/** Gastos agrupados por categoría dentro de un rango. Devuelve [ {categoria, total} ] desc. */
export function gastosPorCategoria(gastos, desdeISO, hastaISO) {
  const map = new Map();
  filtrarPorFecha(gastos, desdeISO, hastaISO).forEach((g) => {
    const cat = g.categoria || 'Otros';
    map.set(cat, (map.get(cat) || 0) + (Number(g.monto) || 0));
  });
  return Array.from(map.entries())
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}
