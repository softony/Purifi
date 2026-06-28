/**
 * app.js — Punto de entrada: registro del Service Worker, enrutador por hash,
 * navegación (sidenav + bottomnav), estado de conexión y respaldo automático.
 */
import { getConfig } from './db.js';
import { setMoneda, $, $$, toast } from './utils.js';
import { respaldoAutomatico } from './export.js';

import * as dashboard from './views/dashboard.js';
import * as clientes from './views/clientes.js';
import * as pedidos from './views/pedidos.js';
import * as cobranza from './views/cobranza.js';
import * as rutas from './views/rutas.js';
import * as gastos from './views/gastos.js';
import * as mantenimiento from './views/mantenimiento.js';
import * as reportes from './views/reportes.js';
import * as configuracion from './views/configuracion.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', mod: dashboard },
  clientes: { title: 'Clientes', mod: clientes },
  pedidos: { title: 'Pedidos', mod: pedidos },
  cobranza: { title: 'Cobranza', mod: cobranza },
  rutas: { title: 'Rutas', mod: rutas },
  gastos: { title: 'Gastos', mod: gastos },
  mantenimiento: { title: 'Mantenimiento', mod: mantenimiento },
  reportes: { title: 'Reportes', mod: reportes },
  configuracion: { title: 'Configuración', mod: configuracion }
};

const view = document.getElementById('view');
const viewTitle = document.getElementById('viewTitle');

/* ---------- Service Worker ---------- */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;

  // ¿Ya había un Service Worker controlando la página al cargar?
  // Si lo había, un cambio de controlador significa que se instaló una
  // versión NUEVA de la app: recargamos una sola vez para servir los
  // archivos actualizados (evita quedarse con una versión vieja en caché).
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando || !habiaControlador) return;
    recargando = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Busca actualizaciones del SW en cada arranque.
      reg.update().catch(() => {});
    }).catch((err) => {
      console.warn('No se pudo registrar el Service Worker:', err);
    });
  });
}

/* ---------- Estado de conexión ---------- */
function actualizarEstadoRed() {
  const dot = document.getElementById('netStatus');
  if (!dot) return;
  const online = navigator.onLine;
  dot.style.color = online ? '#2e7d32' : '#9e9e9e';
  dot.title = online ? 'En línea' : 'Sin conexión (modo offline)';
}

/* ---------- Navegación ---------- */
function rutaActual() {
  const hash = location.hash.replace(/^#\//, '').trim();
  const name = hash.split('/')[0] || 'dashboard';
  return ROUTES[name] ? name : 'dashboard';
}

function marcarActivo(name) {
  $$('.navlink').forEach((a) => {
    a.classList.toggle('navlink--active', a.getAttribute('href') === `#/${name}`);
  });
  $$('.bottomnav__item').forEach((a) => {
    a.classList.toggle('bottomnav__item--active', a.dataset.route === name);
  });
}

async function render() {
  const name = rutaActual();
  const route = ROUTES[name];
  viewTitle.textContent = route.title;
  marcarActivo(name);
  cerrarNav();
  view.innerHTML = '<div class="loading"><span class="spinner"></span> Cargando…</div>';
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    const params = location.hash.replace(/^#\//, '').split('/').slice(1);
    await route.mod.render(view, params);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty-state"><h2>Ocurrió un error</h2><p>${err.message}</p></div>`;
  }
}

function abrirNav() {
  document.getElementById('sidenav').classList.add('sidenav--open');
  document.getElementById('navBackdrop').hidden = false;
}
function cerrarNav() {
  document.getElementById('sidenav').classList.remove('sidenav--open');
  document.getElementById('navBackdrop').hidden = true;
}

/* ---------- Inicio ---------- */
async function init() {
  registrarSW();

  // Cargar moneda configurada para formato
  try {
    const cfg = await getConfig();
    setMoneda(cfg.moneda);
  } catch (e) { /* primera vez, usa defaults */ }

  // Eventos de navegación
  window.addEventListener('hashchange', render);
  document.getElementById('menuToggle').addEventListener('click', abrirNav);
  document.getElementById('navBackdrop').addEventListener('click', cerrarNav);
  $$('.navlink').forEach((a) => a.addEventListener('click', cerrarNav));

  // Modal
  document.getElementById('modalClose').addEventListener('click', () =>
    import('./utils.js').then((u) => u.cerrarModal()));
  document.getElementById('modalBackdrop').addEventListener('click', () =>
    import('./utils.js').then((u) => u.cerrarModal()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') import('./utils.js').then((u) => u.cerrarModal());
  });

  // Conexión
  window.addEventListener('online', actualizarEstadoRed);
  window.addEventListener('offline', actualizarEstadoRed);
  actualizarEstadoRed();

  // Mostrar interfaz
  document.getElementById('app-loader').remove();
  document.getElementById('topbar').hidden = false;
  document.getElementById('bottomnav').hidden = false;

  if (!location.hash) location.hash = '#/dashboard';
  await render();

  // Respaldo automático (silencioso) al iniciar si está activado
  respaldoAutomatico().catch(() => {});
}

// API global para que las vistas puedan navegar fácilmente
window.navegar = (ruta) => { location.hash = ruta.startsWith('#') ? ruta : `#/${ruta}`; };

init();
