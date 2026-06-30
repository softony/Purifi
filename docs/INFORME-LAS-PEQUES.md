# Informe de la aplicación — Purificadora "Las Peques"

**Aplicación:** AquaGestión (PWA para purificadoras de agua)
**Cliente:** David — Purificadora "Las Peques"
**Acceso actual:** https://laspeques.pages.dev
**Fecha del informe:** Junio 2026

---

## 1. ¿Qué es la aplicación?

Es una aplicación web instalable (PWA) para administrar por completo una purificadora de agua: clientes, pedidos, cobranza, rutas, gastos, mantenimiento e inventario de garrafones. **Funciona sin internet**, se instala en celular o computadora como si fuera una app normal, y todos los datos se guardan en el propio dispositivo.

Su objetivo de fondo es exactamente el que recomienda el diagnóstico empresarial de David: dejar de operar "de memoria y en el teléfono personal" y pasar a un **Sistema Básico de Control Operativo** que ordene clientes, ventas, adeudos, gastos, mantenimiento y calidad.

---

## 2. Qué resuelve, según el diagnóstico de David

El diagnóstico marcó varias áreas en rojo/amarillo. Así las atiende la aplicación:

| Área crítica del diagnóstico | Calificación | Cómo lo resuelve la app |
|---|---|---|
| **Control de clientes** | 2/10 🔴 | Base de datos estructurada con búsqueda, zona, frecuencia, número de cliente, última compra y seguimiento. |
| **Administración** | 3/10 🔴 | Registro ordenado de pedidos, cobranza, gastos, mantenimiento e inventario, con reportes exportables. |
| **Finanzas** | 5/10 🟡 | Módulo de Gastos + cálculo de **Utilidad real (Ingresos − Gastos)** y reportes. |
| **Control de calidad** | 6/10 🟡 | Bitácora de mantenimiento y pruebas de calidad, con recordatorio de cambio de filtros. |
| **Escalabilidad / cartera** | 🟡 | Segmentación por zona, clientes por visitar e inactivos, KPIs y reporte ejecutivo. |

### Hallazgos del diagnóstico atendidos

- **#1 y #4 — No existe base de datos de clientes:** la app es esa base de datos (con número de cliente y trazabilidad).
- **#2 y #6 — Capacidad ociosa (180 máx. histórico):** el Dashboard muestra garrafones del día **vs. capacidad de 180** y la capacidad ociosa.
- **#3 — No se puede medir la rentabilidad:** módulo de Gastos y Balance Ingresos − Gastos = Utilidad.
- **#5, #7, #8 — Calidad sin registros propios:** bitácora de mantenimiento + pruebas de calidad + recordatorio de filtros (cada 30 días).
- **#9 — Potencial de asociación:** reporte ejecutivo con cartera, ventas, utilidad y cobertura por zona.

### Plan de 90 días del diagnóstico

- **Fase 1 — Base de clientes:** ✅ Módulo de Clientes.
- **Fase 2 — Monitoreo financiero:** ✅ Pedidos + Gastos + Reportes.
- **Fase 3 — Saneamiento de cartera:** ✅ Cobranza + modelo de cobro de 3 estados.
- **Fase 4 — Inteligencia de mercado:** ✅ Zonas (colonias) + frecuencia.
- **Fase 5 — Eficiencia logística:** ✅ Rutas + Seguimiento (a quién toca surtir).
- **Fase 6 — Bitácora de mantenimiento:** ✅ Módulo de Mantenimiento.
- **Fase 7 — Capacidad de expansión:** ✅ KPIs de capacidad y ociosidad.
- **Fase 8 — Preparación para asociación:** ✅ Reporte ejecutivo.

---

## 3. Características por módulo

### 📊 Dashboard
- Indicadores del día y la semana: ventas, clientes activos, adeudos, garrafones, pedidos.
- **Indicadores de gestión:** ticket promedio, garrafones de la semana, % de cartera con adeudo, pedidos entregados.
- **Centro de Inteligencia Operativa:** costo directo de producción, precio promedio, margen bruto (y %) y utilidad neta estimada por garrafón.
- **Barra de capacidad usada hoy** vs. el máximo de 180 garrafones (muestra capacidad ociosa).
- Avisos automáticos: clientes con adeudo, pedidos pendientes, clientes por visitar, clientes inactivos y recordatorio de respaldo.
- Accesos rápidos (nuevo pedido, nuevo cliente, registrar pago).

### 👥 Clientes
- Alta, edición, borrado y búsqueda (por nombre, número, teléfono o dirección).
- **Número de cliente automático** (#001, #002…) para rotular y rastrear los garrafones.
- **Alerta de clientes duplicados:** al crear o editar, avisa si ya existe un cliente con el mismo **teléfono** o **nombre**, con opción de *guardar de todas formas* o *editar el existente* (evita fichas repetidas sin bloquear).
- Frecuencia de compra: Diario, Cada 3 días, Semanal, Quincenal y **Mensual**.
- **Última compra** visible en cada ficha y **sugerencia automática de frecuencia** según el historial real.
- Filtro por colonia/zona.

### 📦 Pedidos
- Registro de pedidos con cantidad de garrafones, precio (domicilio/ventanilla) y total automático.
- **Modelo de cobro de 3 estados:**
  - 🟠 Pendiente (en camino) — no cuenta como venta ni deuda.
  - 🟢 Entregado y pagado — venta cobrada.
  - 🔴 Entregado a crédito — venta + adeudo en Cobranza.
- Al marcar "Entregado", la app **pregunta si se cobró** (pagó / quedó a crédito).
- **Canje de garrafón (+$50 c/u):** suma al total y, al entregar, ajusta el inventario automáticamente.
- Número de cliente visible en la tarjeta, selector y búsqueda.

### 💵 Cobranza
- Saldo por cliente (al corriente / debe).
- Registro de pagos y adeudos manuales; historial de movimientos por cliente.
- Los pedidos entregados a crédito aparecen automáticamente como adeudo.

### 🗺️ Rutas
- Organización de clientes por colonia/zona.
- Armado de rutas con paradas, número de cliente y marca de entregado.

### 🔔 Seguimiento de clientes
- **Por visitar hoy:** según su frecuencia y última entrega, a quién toca surtir.
- **Inactivos (riesgo de fuga):** clientes que llevan mucho sin comprar.
- **Sin compras registradas.**
- Acciones rápidas: crear pedido (con cliente preseleccionado) y llamar.

### 🧾 Gastos
- Registro de gastos por categoría (agua de pipa, insumos, nómina, gasolina, renta, filtros, servicios, otros).
- Total y desglose por categoría, con filtro por periodo.
- Exportación a Excel y PDF.

### 🔧 Mantenimiento y calidad
- Bitácora de cambios de filtro, mantenimiento preventivo, reparaciones y pruebas de calidad.
- **Recordatorio del próximo cambio de filtros** (cada 30 días) con semáforo (verde/amarillo/rojo).
- Opción de registrar el costo también como gasto.
- Exportación a PDF.

### 🛢️ Inventario de garrafones
- Existencias de **garrafones nuevos** y **usados/retornados**.
- Movimientos: compra de nuevos, canje, retorno de usados, **baja/reciclado** y ajuste manual.
- Sincronización automática con los canjes hechos desde Pedidos.
- Exportación a PDF.

### 📈 Reportes
- Ventas por día, clientes frecuentes y deudores (con número de cliente).
- **Balance del periodo: Ingresos − Gastos = Utilidad.**
- Gastos por categoría.
- **Inteligencia por garrafón (últimos 30 días):** costo directo de producción, precio promedio, margen bruto (y %) y utilidad neta estimada por garrafón. Usa promedio móvil de 30 días (suaviza las compras de pipa) y excluye el canje del costo del agua.
- **Reporte ejecutivo (PDF)** del mes: indicadores, utilidad, cobertura por zona e inventario.
- Exportación a Excel, PDF y CSV.

### ⚙️ Configuración
- Datos del negocio, precios (domicilio, ventanilla y **canje**) y moneda.
- Respaldo: **enviar respaldo** (WhatsApp/Drive/correo), descargar JSON, exportar todo a Excel, importar y respaldo automático local.
- Borrado total de datos (zona de precaución).

---

## 4. Características técnicas

- **Funciona sin internet (offline-first):** instalada en el celular, opera aunque no haya señal.
- **Instalable** como app en celular o computadora.
- **Datos en el dispositivo** (IndexedDB): privados y sin costo de servidor.
- **Respaldo y portabilidad:** exportar/compartir respaldo (JSON), exportar a Excel/PDF, importar.
- **Auto-actualización:** cuando se publica una versión nueva, la app se actualiza sola.
- **Sin exposición de datos en la nube:** alojada como sitio estático (Cloudflare Pages).
- **Multi-purificadora:** la app es genérica y reutilizable. Cada negocio que la instala es **independiente** (sus propios clientes, precios y datos), y configura su **nombre, precios y moneda** en una **pantalla de configuración inicial** la primera vez (o luego en Configuración). No requiere servidor central.

---

## 5. Mejoras recientes (resumen de cambios)

1. **Corrección del error 404 offline** al instalar la app (causa: redirección de `/index.html`).
2. **Auto-actualización** del Service Worker (evita ver versiones viejas en caché).
3. **Número de cliente** automático para rotular y rastrear garrafones.
4. Frecuencia de compra **"Mensual"**.
5. **Modelo de cobro de 3 estados** (pendiente / entregado y pagado / entregado a crédito) con confirmación de cobro al entregar; las ventas se cuentan al entregar.
6. **Módulo de Gastos** y cálculo de **Utilidad real**.
7. **Bitácora de mantenimiento y calidad** con recordatorio de filtros.
8. **Seguimiento de clientes** (por visitar e inactivos).
9. **Dashboard ampliado** con KPIs de gestión y barra de capacidad.
10. **Canje de garrafón ($50)** e **inventario completo** (nuevos/usados, baja/reciclado).
11. **Última compra** y **sugerencia automática de frecuencia**.
12. **Respaldo fuera del dispositivo** (compartir) y **reporte ejecutivo (PDF)**.
13. **Alerta de clientes duplicados** (por teléfono o nombre) al crear/editar, para mantener la cartera limpia desde el inicio.
14. **Inteligencia por garrafón:** costo de producción, margen bruto y utilidad neta por garrafón (promedio móvil de 30 días), en Dashboard y reporte ejecutivo.
15. **Multi-purificadora:** valores y marca genéricos ("AquaGestión"), nombre de negocio dinámico en el menú y **configuración inicial** al primer uso, para reutilizar la app en varias purificadoras.

---

## 6. Pendientes y futuro

- **Sincronización entre varios dispositivos** (para socio/empleados): requeriría un pequeño servidor/nube; a evaluar cuando se necesite.
- **Refinamientos del uso real:** ajustes menores conforme David empiece a usar la app en el día a día.
- **Soporte a una eventual asociación:** el reporte ejecutivo ya entrega los números base (cartera, ventas, utilidad, cobertura) que el diagnóstico pide para evaluarla.

---

*Documento generado como apoyo al proyecto de digitalización de Purificadora "Las Peques".*
