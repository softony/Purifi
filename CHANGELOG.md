# Changelog — AquaGestión

Historial de versiones de la PWA para purificadoras de agua.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [v2.4] — 2026-07-10

### Rutas sugeridas automáticas

Nueva sección **🤖 Ruta sugerida** en la vista de Rutas que calcula
automáticamente a qué clientes toca visitar cada día, según su frecuencia
de compra y la fecha de su última entrega. Ya no hace falta armar la ruta
del día a mano con checkboxes.

#### Decisiones de diseño (validadas con el usuario)
- Incluye clientes con `dias >= interval` (vencidos + los que tocan hoy).
- Excluye clientes sin compras registradas (ya están en Seguimiento).
- Botón **"Crear ruta con estos clientes"** que genera una ruta manual
  editable con las paradas preseleccionadas, para que David pueda ajustar
  (agregar/quitar) antes de salir a repartir.

#### Cambios técnicos
- **`services.js`**: nuevo helper `rutaSugerida(fechaISO)` que:
  - Recorre clientes y pedidos entregados.
  - Para cada cliente con al menos una entrega, calcula `interval` (días
    esperados según frecuencia), `dias` (transcurridos desde última
    entrega hasta la fecha pedida) y `vencidoPor` (`dias - interval`).
  - Filtra `dias >= interval`, ordena por `vencidoPor` descendente (más
    vencidos primero), agrupa por colonia.
  - Devuelve `{ fecha, paradas, porZona, total, vencidos }`.
- **`rutas.js`**: reescrito el `render()` para mostrar arriba del todo la
  nueva sección **🤖 Ruta sugerida** con:
  - Selector de fecha (default hoy) + botones rápidos **"Hoy"** y **"Mañana"**.
  - Card de resumen con total de clientes y cuántos vencidos.
  - Paradas agrupadas por zona, cada una con badges: `🔔 Toca hoy` o
    `⚠️ Vencido Nd`, `🔄 frecuencia`, `Última: fecha`.
  - Botones **➕ Pedido** y **📞 Llamar** por cada parada.
  - Botón **➕ Crear ruta con estos clientes** que abre `formularioRuta`
    con las paradas preseleccionadas (editable).
  - Las rutas manuales siguen existiendo debajo, igual que antes.
  - **"Clientes por zona"** sigue al final.
  - `formularioRuta(ruta, preseleccion)` ahora acepta `preseleccion` como
    objeto base `{ fecha, nombre, paradas }` para precargar el formulario.
- **`sw.js` + `index.html` + `configuracion.js`**: bump v2.3 → v2.4,
  `CACHE_VERSION` v23 → v24.

#### Pruebas
- `test_ruta_sugerida.mjs` valida 4 escenarios (cálculo para hoy, para
  mañana, después de una entrega nueva, agrupación por zona). Todos pasan.

---

## [v2.3] — 2026-07-10

### Tamaños de garrafón (20L, 19L, 12L, 10L)

Nueva feature: cada pedido ahora lleva un tamaño de garrafón. La app
maneja 4 tamaños: **20L, 19L, 12L y 10L** (configurables). Esto afecta
a pedidos, inventario, dashboard, reportes, cobranza y exports.

#### Decisiones de diseño (validadas con el usuario)
- **Precios**: 4 precios de venta + 4 de canje editables en Configuración,
  con sugerencia automática al crear pedido (precio editable por pedido).
- **Inventario**: separado por tamaño (4 columnas nuevos + 4 usados).
- **Canje**: aplica a todos los tamaños, cada uno con su precio.
- **Visualización**: total + mini-desglose por tamaño en Dashboard,
  tabla detallada por tamaño en Reportes.
- **Histórico**: pedidos existentes migrados automáticamente a 19L.

#### Cambios por archivo

- **`utils.js`**: constantes `TAMANOS_GARRAFON`, `TAMANO_DEFAULT`,
  `PRECIOS_DEFAULT_POR_TAMANO`, `PRECIOS_CANJE_DEFAULT_POR_TAMANO`,
  helpers `esTamanoValido()` y `tamanoPedido()`.
- **`db.js`**: bump `DB_VERSION` 4 → 5. Migración en `onupgradeneeded`:
  - Agrega índice `tamano` al store de pedidos.
  - Para pedidos existentes sin `tamano`, asigna `19L` en disco.
  - Para inventario viejo (campos `nuevos`/`usados` escalares), los
    convierte a `nuevosPorTamano`/`usadosPorTamano` (objetos por tamaño)
    manteniendo los campos legacy por compatibilidad.
  - `DEFAULT_CONFIG` ampliado con `preciosPorTamano` y `preciosCanjePorTamano`.
  - `getConfig()` aplica migración suave si un backup viejo no trae los mapas.
- **`configuracion.js` + `app.js`** (`configuracionInicial`): formulario de
  precios reemplazado por grilla 4×2 (4 tamaños × venta+canje).
- **`pedidos.js`**: select de tamaño, precio sugerido por tamaño (editable),
  canje por tamaño, tarjeta muestra `Nx TAMAÑO`, filtro por tamaño en
  toolbar. `sincronizarCanje` ahora registra el tamaño correcto en
  inventario (`nuevosPorTamano`/`usadosPorTamano`).
- **`inventario.js`**: reescrito. Formulario con select de tamaño,
  `deltasPorTipo` devuelve objetos por tamaño, `tarjetaMov` muestra chips
  por tamaño, vista principal muestra KPIs agregados + tabla detallada
  por tamaño (4 filas). PDF actualizado.
- **`services.js`**: `stockGarrafones()` ahora devuelve
  `{ nuevos, usados, total, porTamano: { '20L': {nuevos,usados}, ... } }`.
  Nuevo helper `garrafonesPorTamano(pedidos)`. `resumenDashboard()`
  ampliado con `garrafonesPorTamanoTotal`/`Hoy`/`Semana`.
- **`dashboard.js`**: mini-desglose por tamaño debajo de los KPIs de
  garrafones (solo si hay garrafones hoy).
- **`reportes.js`**: nueva tabla **"Garrafones por tamaño"** en el reporte
  (con % del periodo). `expExcel` incluye hoja `Garrafones por tamano` y
  `Pedidos detallados` con columna Tamaño. `expPDF` incluye sección
  `Garrafones por tamaño`.
- **`export.js`**: `exportarExcelCompleto` actualizado:
  - Pedidos: agrega columna `Tamaño`.
  - Inventario: agrega columna `Tamaño` y 8 columnas de deltas por tamaño
    (nuevos/usados × 4 tamaños).
- **`cobranza.js`**: historial de movimientos muestra `Nx TAMAÑO` en lugar
  de `N garrafón/es`.
- **`sw.js` + `index.html` + `configuracion.js`** (acerca de): bump versión
  visible a v2.3, `CACHE_VERSION` v22 → v23.

#### Pruebas
- `test_db_v23.mjs` valida 8 escenarios (config, pedidos con y sin tamaño,
  `garrafonesPorTamano`, `stockGarrafones` por tamaño, compatibilidad con
  movimientos viejos). Todos pasan.

---

## [v2.2.1] — 2026-07-09 (hotfix)

### Bug crítico en `db.js`

**BUG CRÍTICO**: el refactor de v2.2 introdujo un error de scope en `db.js`.
La función interna se llamaba `tx` y devolvía `{ store, tx }`, pero el
destructuring `const { store, tx } = await tx(...)` hacía que la variable
local `tx` entrara en conflicto con la función `tx` (TDZ — *Temporal Dead
Zone*), lanzando `ReferenceError: Cannot access tx before initialization`.
**Resultado**: NINGUNA escritura (`add`/`put`/`remove`/`clear`) funcionaba
en producción, lo que explicaba el reporte del usuario de que "no guarda
nada".

#### Fix
- Renombrar la función `tx()` → `openTx()` y la clave del objeto devuelto
  `tx` → `transaction`. Verificado con test de persistencia
  (`fake-indexeddb`) que simula el flujo real: `setConfigBulk`, `add`,
  `put`, `getAll` pasan todos.

#### Adicional
- Bump de la versión visible a v2.2 en `index.html` (sidebar) y
  `configuracion.js` (acerca de) para que el usuario pueda confirmar
  visualmente que el nuevo código está desplegado.
- `CACHE_VERSION` ya estaba en v22 desde el commit anterior.

---

## [v2.2] — 2026-07-09

### Robustez de persistencia y respaldo automático

Cuatro correcciones críticas para evitar pérdida de datos en uso offline.
**Contexto**: el cliente (Purificadora Las Peques) reportó que perdió los
datos capturados el lunes y martes. El análisis del código reveló que la
arquitectura PWA estaba bien diseñada (IndexedDB + Service Worker + cache
offline), pero el ciclo de vida del respaldo automático tenía fallas que
permitían pérdida silenciosa de datos.

#### Análisis de causas raíz
1. El respaldo automático solo se ejecutaba al **abrir** la app, no tras
   cada captura → los datos del día nunca se respaldaban hasta el siguiente
   arranque.
2. El respaldo en `localStorage` se **sobrescribía** sin rotación → un
   solo arranque corrupto pisaba el único respaldo bueno.
3. La actualización del Service Worker (`skipWaiting` + `controllerchange`
   → `location.reload()`) podía interrumpir un formulario a mitad de
   captura y perder los datos no guardados.
4. Las funciones `add`/`put`/`remove` de `db.js` solo esperaban
   `request.onsuccess`, no `transaction.oncomplete` → transacciones
   abortadas por el navegador (iOS Safari, Android con poca RAM) podían
   reportar éxito sin persistir.

#### Correcciones implementadas

1. **`db.js`** — `add`/`put`/`remove`/`clear` ahora esperan
   `transaction.oncomplete` antes de resolver. Cada escritura exitosa
   emite un evento `db:changed` para que otros módulos reaccionen.
   `importAll` y `resetAll` también notifican.

2. **`export.js`** — Respaldo automático ahora rota **3 snapshots** en
   `localStorage` (`_0`, `_1`, `_2`) en vez de sobrescribir uno solo.
   Migración automática del formato viejo. API nueva:
   `listarRespaldosAuto()`, `restaurarRespaldoAutoEn(idx)`.

3. **`app.js`** — Listener de `db:changed` → dispara `respaldoAutomatico()`
   con debounce 2 s. Respaldo al abrir respeta flag `respaldoAuto`.

4. **`app.js`** — `visibilitychange` (hidden), `pagehide` y
   `beforeunload` → flush inmediato best-effort. Protege los datos en
   móviles (iOS Safari mata la pestaña en background; Android puede
   cerrarla por presión de RAM).

5. **`app.js` + `utils.js`** — `controllerchange` → `intentarRecargar()`
   pospone `location.reload()` si hay modal abierto. Reintenta cada 1.5 s.
   `cerrarModal` emite `modal-cerrado` para coordinar.

6. **`sw.js`** — `CACHE_VERSION` subido de `v21` → `v22` para forzar la
   propagación de estos cambios a todos los clientes instalados.

#### Pruebas
- `test_db_persist.mjs` valida el flujo de persistencia básico
  (`setConfigBulk`, `add`, `put`, `getAll`). Todos pasan.

---

## [v2.1] — Junio 2026

(Versiones previas — ver `docs/INFORME-LAS-PEQUES.md` para el detalle
completo de características.)
