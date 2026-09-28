# Dashboard por módulo en el inicio (propuesta 2026-09-23)

Propuesta para aprobación del dueño. **No existe en el código.** Define qué muestra cada
módulo dentro de «Módulos» en `/app/inicio` (panel de dueño/administrador) cuando se
despliega. Se diseñó a partir del código actual y de los datos que la base tiene de verdad.

- Figma, archivo `EAvjINVRnlzFM70GVoWXgl`:
  - Componentes: página «02 Componentes» › sección **«Inicio — Módulos (Nuevo)»** (`638:37528`).
  - Pantallas: página «03 Navegación y shell» › sección **«Inicio — Dashboard por módulo (propuesta)»** (`642:25956`).
- Capturas: `docs/design/figma/38-modulos-*.png`.
- Todos los datos del diseño son ficticios. Los números de este documento son agregados de
  todas las organizaciones, sin identificar ninguna.

---

## 1. Lo que hay hoy (resumen transversal)

| Tema | Hallazgo | Dónde |
|---|---|---|
| Lista de módulos | `MODULOS_NEGOCIO` está cableada en el componente, en contra de la regla «nunca cablees una lista de módulos». Se filtra con `getActiveModules`. Si esa consulta falla (`undefined`), se montan las 15 secciones. | `src/components/inicio/DashboardModulos.tsx:93-214`, `src/app/app/inicio/page.tsx:133-145` |
| Consultas | Todas las secciones consultan desde el navegador (`@/lib/supabase/config`), sin RPC, y agregan en el cliente sin `.limit`. Pasan del tope de filas de PostgREST sin avisar. Número de consultas: Finanzas ~33, CRM ~24, Inventario ~18 + N por sucursal, HRM ~18 + N, PMS ~15, POS ~13. | secciones `src/components/inicio/sections/*` |
| Fila plegada | Muestra icono, nombre y exportar. **No hay línea de resumen.** Además, plegar no evita las consultas: los datos se cargan en la sección y no en los hijos. | `ModuloSection.tsx:163-217` |
| Modo compacto | Pone `minHeight` en 60, así que todas las `LazySection` entran en pantalla a la vez y lanzan todas sus consultas. | `DashboardModulos.tsx:352` |
| Periodo | Ninguna sección compara con el periodo anterior. Finanzas y CRM usan 30 días fijos y no hacen caso del selector de periodo. | — |
| Zona horaria | Aparecen `toISOString().split('T')[0]` y fechas `YYYY-MM-DD` comparadas contra `timestamptz`. En Colombia, desde las 7:00 p. m. PMS, Parking, HRM, Transporte e Inventario (lotes) usan el día UTC. | ver cada módulo |
| Errores | En la mayoría, un `catch` o un `{data}` sin mirar `error` pinta **0 como si fuera real**. Solo CRM y POS muestran el error. | — |
| Marca | 15 colores de acento de Tailwind (esmeralda, ámbar, fucsia…), y además no coinciden con los de cada sección. | `DashboardModulos.tsx` |

### Qué datos existen de verdad (consulta SELECT, 2026-09-23, todas las organizaciones)

- **Organizaciones y módulos:** 85 organizaciones, 90 sucursales (solo 3 organizaciones tienen más de una).
  - Módulos activos: pos 64 · inventory 64 · chat 54 · finance 51 · crm 49 · transport 49 · pm 47 · reports 47 · pms_hotel 45 · parking 44 · gym 43 · hrm 40 · integrations 38 · notifications 36 · calendar 22 · operations 21.
- **Productos:** 53.322 en 26 organizaciones. Mediana de 207 productos activos por organización y **máximo de 23.778**: agregar en el navegador no escala.
- **`stock_levels`:** 44.627 filas.
  - **`min_level` configurado solo en 10 filas (0,02 %).** Por eso «bajo mínimo» casi siempre da 0.
  - `avg_cost > 0` solo en 2.955 filas (6,6 %). Hay 5.811 costos vigentes en `product_costs`.
  - 660 filas con cantidad ≤ 0 (26 negativas). Ninguna fila tiene lote.
- **Ventas (`sales`):** 3.402 en 20 organizaciones; 2.229 en los últimos 30 días, en 12 organizaciones.
  - Estados: `paid` 2.476 · `pending` 923 (27 %) · `void` 3.
  - Origen: pos 2.105 · invoice 674 · web 623.
- **`web_orders`:** 6.089 en 6 organizaciones. **Expiradas 4.592 (75 %)**, canceladas 868, confirmadas 623, pendientes 6.
- **Cartera (`accounts_receivable`):** 3.350 filas.
  - 475 están vencidas por fecha, pero solo 215 tienen `status='overdue'`.
  - **`days_overdue` está desactualizado en 466 de esas 475.**
- **Por pagar (`accounts_payable`):** 55 filas en 7 organizaciones.
- **CRM:** 69 oportunidades en 6 organizaciones.
  - 66 abiertas.
  - **7 están en USD** y se suman como COP.
  - **65 de las 66 abiertas no tienen `next_contact_at`.**
- **Chat:** 21.367 conversaciones en 6 organizaciones, **todas con `status='open'`**. Por eso «abiertas» no dice nada.
- **Caja (`cash_sessions`):** 98 sesiones; 15 abiertas.
- **Verticales, casi sin datos:**
  - Hotel: 29 reservas en 3 organizaciones.
  - Gimnasio: 1 membresía.
  - Parqueadero: 8 sesiones.
  - Transporte: 17 viajes y 6 vehículos en 1 organización; 667 envíos, 625 pendientes.
  - RRHH: 117 contratos.

**Consecuencia de diseño:** en los verticales, el estado **vacío** es el caso más común (unas 45
organizaciones tienen el módulo activo y casi ninguna tiene datos). Por eso se trata como un
estado de primera clase, con un primer paso.

---

## 2. Análisis y propuesta por módulo

Cada panel desplegado tiene la misma anatomía:

1. **3–4 KPIs** con delta frente al periodo anterior y una línea de contexto accionable.
2. **«Requiere atención»:** máximo 3 filas, cada una con la acción que la resuelve.
3. **Un desglose.**
4. **Pie** con la frescura del dato (hace cuánto, sucursal, periodo) y «Ver módulo →».

### 2.1 Finanzas

- **Hoy:** 8 tarjetas, dos gráficos, flujo proyectado, top de clientes y proveedores, y alertas. Unas 33 consultas por carga (`FinanzasDashboardService.ts`).
- **Roto o engañoso:**
  - Ingresos mezcla tres fuentes. `sales` no filtra `status`, así que una venta anulada pero pagada suma.
  - Las facturas `partial` suman su total, no lo cobrado.
  - «Utilidad bruta» es ingresos − compras; no resta el costo de ventas.
  - El flujo proyectado **rellena los meses vacíos con el promedio histórico** (dato inventado; FDS:606-611).
  - Top de clientes y proveedores no filtra estado y excluye el último día (`lte` sobre `timestamptz`).
  - La alerta DIAN divide por cero si `range_end=0`.
  - Los cortes de fecha se hacen en UTC.
- **Propuesta:**
  - **KPIs:**
    - Ingresos cobrados del periodo: desde `payments`, que es la verdad de caja, sin contar dos veces una venta que también es factura.
    - Egresos pagados.
    - Cartera vencida: calculada con `due_date` en la zona de la organización. No usar `status` ni `days_overdue`, que están desactualizados.
    - Por pagar en 7 días.
  - **Atención:**
    - Facturas vencidas con importe → **Cobrar**.
    - Compras que vencen esta semana → **Programar pago**.
    - Resolución de facturación por encima del 90 % → **Renovar**.
  - **Desglose:** cartera por antigüedad (al día / 1–30 / 31–60 / >60), paleta semáforo.
- **Pantalla:** `643:26987` (escritorio) y `647:32595` (móvil).

### 2.2 Inventario

- **Hoy:** en pantalla aparecen **KPIs de producción** (recetas y órdenes). Los KPIs de inventario se calculan pero **solo van al export** (`InventarioSection.tsx:41-52, 161-168`).
- **Roto:**
  - «Stock bajo» y «Sin stock» cuentan filas producto × sucursal × lote, no productos.
  - El valor usa `qty × (avg_cost || costo vigente)`, y las cantidades negativas restan.
  - `getBranchSummaries` hace una consulta por sucursal (N+1).
  - Cada `catch` devuelve ceros.
  - Los lotes se fechan en UTC.
  - `min_level` casi no existe en los datos: 10 filas de 44.627.
- **Propuesta:**
  - **KPIs:**
    - Valor del inventario, con **% de productos con costo** para no esconder que el costo falta.
    - Productos **sin stock que sí se venden** (ventas de los últimos 30 días).
    - **Cobertura baja** (< 7 días al ritmo de venta; si hay `min_level`, se usa además).
    - Sin movimiento en 90 días (capital inmovilizado).
  - **Atención:**
    - Sin stock que se vende → **Reponer** (crea una orden de compra).
    - Lotes por vencer con stock → **Ver lotes**.
    - Traslados en tránsito hace más de 3 días → **Recibir**.
  - **Desglose:** valor por categoría (paleta marca).
- **Pantalla:** `643:26987` y `647:33581`.

### 2.3 Ventas / POS

- **Hoy:** Ventas hoy, Ventas del mes, Transacciones, Ticket promedio; top de productos, ventas por sucursal y sesiones de caja.
- **Roto:**
  - El mes **no filtra estado** (entran anuladas y pendientes).
  - «Hoy» filtra `completed`, un estado que no existe.
  - **Top de productos y ventas por sucursal no tienen fecha** (suman todo el histórico).
  - `getToday()` fija la zona a Bogotá y no usa la de la organización.
  - `totalVentasWeb` se calcula y no se muestra.
- **Propuesta:**
  - **KPIs:**
    - Ventas de hoy **frente al mismo día de la semana pasada a la misma hora**, que es la comparación útil en un POS.
    - Transacciones y ticket medio.
    - Efectivo esperado en caja.
    - Ventas sin pago registrado (hoy son el 27 % de `sales`).
  - **Atención:**
    - Caja abierta desde ayer → **Cerrar caja**.
    - Ventas sin pago → **Revisar**.
    - Devoluciones del día → **Ver**.
  - **Desglose:** métodos de pago de hoy.
- **Pantalla:** `643:28440` y `647:34377`.

### 2.4 CRM

- **Hoy:** conversaciones abiertas, SLA, oportunidades, pronóstico, campañas y clientes nuevos, más embudo, actividad, canales y tops. Unas 24 consultas; `messages` se descarga entera dos veces.
- **Roto:**
  - **El pronóstico sale 100× inflado** (`amount × probability` con probabilidad de 0 a 100; CDS:125).
  - **Suma USD como COP.**
  - El SLA da 100 % cuando no hay datos.
  - «Clientes nuevos» excluye el día de hoy.
  - Las conversaciones abiertas no dicen nada: el 100 % tiene `status='open'`.
- **Propuesta:**
  - **KPIs:**
    - Pipeline abierto **por moneda** (la moneda secundaria va aparte).
    - Pronóstico ponderado bien calculado.
    - Ganadas en el periodo con tasa de cierre.
    - Clientes nuevos.
  - **Atención:**
    - Oportunidades sin actividad hace más de 7 días → **Asignar seguimiento**.
    - Fecha de cierre vencida → **Actualizar**.
    - Sin próxima acción (65 de 66 hoy) → **Programar**.
  - **Desglose:** pipeline por etapa.
  - Las conversaciones salen del CRM y pasan al panel **Chat**.
- **Pantalla:** `643:28440` y `647:35170`.

### 2.5 Chat

- **Hoy:** sesiones activas (sin umbral de `last_seen_at`), mensajes de hoy, canales y pendientes. El nombre del canal sale siempre «Canal desconocido»: la relación llega como objeto y el código la trata como array.
- **Propuesta:**
  - **KPIs:**
    - **Sin responder**: el último mensaje es del cliente.
    - Mediana de primera respuesta frente al objetivo.
    - Conversaciones del periodo.
    - % resuelto por la IA.
  - **Atención:**
    - Esperan más de 30 min → **Atender**.
    - Canal desconectado → **Reconectar**.
    - Sin asignar → **Asignar**.
  - **Desglose:** conversaciones por canal.
- **Pantalla:** `644:28591`.

### 2.6 Hotel (PMS)

- **Roto:**
  - El día es UTC.
  - Nombres de cliente y habitación siempre vacíos: trata relaciones objeto como arrays.
  - La ocupación sale de `spaces.status` e incluye las habitaciones en mantenimiento.
  - «Salidas hoy» incluye las ya hechas (`checked_out`).
  - La alerta «sin habitación» mira `reservations.space_id` en vez de `reservation_spaces`.
- **Propuesta:**
  - **KPIs:**
    - Ocupación de hoy sobre habitaciones **vendibles**.
    - Llegadas, con cuántas ya hicieron check-in.
    - Salidas, con saldo pendiente.
    - Tarifa promedio con ingreso por habitación disponible.
  - **Atención:**
    - Reservas de hoy sin habitación → **Asignar**.
    - Salida con saldo → **Cobrar**.
    - Habitaciones en limpieza → **Ver limpieza**.
  - **Desglose:** estado de las habitaciones.
- **Pantalla:** `644:28591`.

### 2.7 Gimnasio

- **Roto:**
  - **Los ingresos siempre dan 0 y la consulta no filtra por organización.** Filtra `payments.source='membership'`, pero los pagos entran como `sale` a través de `memberships.sale_id`.
  - Los conteos descargan filas (`count` sin `head`) y se topan en 1000.
  - La lista «por vencer» y el KPI no cuadran.
- **Propuesta:**
  - **KPIs:**
    - Membresías activas con % de renovación.
    - Vencen en 7 días, con el importe por renovar.
    - Entradas de hoy.
    - Ingresos por membresías (desde `sales` vía `sale_id`).
  - **Atención:**
    - Por vencer → **Renovar**.
    - Entradas con membresía vencida → **Revisar**.
    - Congeladas que se reactivan → **Ver**.
  - **Desglose:** membresías por plan.
- **Pantalla:** `644:29999`. Con los datos reales (1 membresía en toda la base), lo normal es el estado **vacío**: ver `646:30871`.

### 2.8 Parqueadero

- **Roto:**
  - Sin filtro de organización cuando no hay sucursal.
  - «Sesiones activas» solo cuenta las **creadas hoy**, así que desaparecen los vehículos que llevan desde ayer, justo los que importan.
  - Los ingresos suman sesiones creadas hoy, no cerradas hoy.
  - Los días restantes de los pases salen con un día de desfase.
- **Propuesta:**
  - **KPIs:**
    - Ocupación ahora.
    - Ingresos de hoy (salidas cobradas hoy + pases vendidos).
    - Vehículos dentro, con cuántos llevan más de 12 h.
    - Pases activos.
  - **Atención:**
    - Más de 12 h dentro → **Revisar**.
    - Pases por vencer → **Renovar**.
    - Zona casi llena → **Ver mapa**.
  - **Desglose:** vehículos dentro por tipo.
- **Pantalla:** `644:29999`.

### 2.9 Transporte

- **Roto:**
  - «Viajes hoy» incluye **todos los futuros** (sin límite superior).
  - Los envíos no tienen rango de fechas.
  - Los boletos suman reservados, reembolsados y no-show.
  - La ocupación incluye viajes cancelados y futuros.
- **Propuesta:**
  - **KPIs:**
    - Viajes de hoy por estado.
    - Puntualidad.
    - Ocupación de los viajes.
    - Envíos pendientes con antigüedad (hoy hay 625 de 667 pendientes).
  - **Atención:**
    - Viajes retrasados → **Ver viaje**.
    - Documentos del vehículo por vencer (`soat_expiry`, `techno_expiry`…) → **Renovar**.
    - Envíos sin despachar hace más de 2 días → **Despachar**.
  - **Desglose:** envíos por estado.
- **Pantalla:** `644:31259`.

### 2.10 RRHH

- **Roto:** filtra **estados que no existen** en el esquema, así que esos valores dan siempre 0:
  - Timesheets `pending`.
  - Nómina `draft/processing/pending_approval`.
  - Ausencias `pending`.
  - Turnos `unassigned`.
  - Además, `getRecentPayrollRuns()` queda sin filtro de organización.
- **Propuesta:**
  - **KPIs:**
    - Personas activas.
    - Ausentes hoy.
    - Turnos de hoy, con los que están sin cubrir.
    - Nómina del periodo con su estado.
  - **Atención:**
    - Turnos sin cubrir → **Asignar**.
    - Ausencias por aprobar (`requested`) → **Revisar**.
    - Contratos por vencer → **Ver**.
  - **Desglose:** asistencia de hoy.
- **Pantalla:** `644:31259`.

### 2.11 Fuera de «Módulos»

- **Tienda web:** ya tiene su bloque propio en el inicio (con «Analítica web»). No se duplica.
- **PM, calendario, notificaciones, integraciones y operaciones:** no entran como paneles. Tareas y calendario ya están en «Hoy», y los demás no tienen métricas de negocio. Queda como pregunta para el dueño.

---

## 3. Decisiones de diseño

- **Un solo color de módulo:** el icono de todos los módulos va en el tinte de marca (`brand/tint` + `brand/primary`) y se sustituyen los 15 colores de Tailwind. El color se reserva para el estado.
- **Badges:** suaves por defecto. **Un solo badge sólido en toda la lista**, el del estado más grave (en el ejemplo, Finanzas · «7 vencidas»).
- **Acción principal:** en «Requiere atención» las acciones van en `Button` outline. El **Azul acción** (Button primary) se reserva para «Listo» al reordenar y para el primer paso en el estado vacío.
- **Deltas:** el tono dice si el cambio es bueno, no si sube. Egresos −3,1 % es éxito y cartera vencida +12 % es peligro. Si no hay base de comparación, el tono es neutro.
- **Pie de cada panel:** dice de cuándo es el dato y qué periodo usa. Cada módulo usa su **periodo natural**:
  - POS y verticales: hoy.
  - Finanzas, CRM y Chat: el periodo seleccionado frente al anterior.
  - Inventario: estado actual.
- **Estados:**
  - **Plegado:** una línea con el resumen y el badge dominante. Plegar no lanza la consulta de detalle.
  - **Cargando:** KpiModulo con esqueleto.
  - **Vacío:** módulo activo sin datos; tiene un primer paso con Button primario.
  - **Error:** Reintentar. El fallo de un módulo no tumba el inicio.
  - **Sin permiso:** el módulo **no aparece** y el contador dice «8 módulos», sin delatar que faltan.
- **Móvil:** acordeón con **un solo módulo abierto a la vez**. KPIs en 2×2 (se descartó el carrusel porque esconde la mitad de los KPIs). En los «Requiere atención», la acción baja a una segunda línea.
- **Reordenar y ocultar:** modo en la misma lista, con asa, interruptor «En el inicio», «Restablecer», «Cancelar» y «Listo». Ocultar deja de consultar ese módulo y no cambia permisos.

---

## 4. Componentes creados en «02 Componentes» › «Inicio — Módulos (Nuevo)» (`638:37528`)

| Componente | Id | Propiedades |
|---|---|---|
| `MiniTendencia` | `638:37567` | Forma = sube/baja/plana × Tono = marca/éxito/advertencia/peligro (12 variantes) |
| `KpiModulo` | `638:37593` | Estado = listo/cargando · Etiqueta, Valor, Contexto (TEXT) · Mostrar delta, Mostrar tendencia (BOOL) · Delta (Badge) y Tendencia (MiniTendencia) como instancias expuestas |
| `AtencionItem` | `638:37652` | Severidad = peligro/advertencia/info × Layout = escritorio/móvil · Título, Detalle, Monto (TEXT) · Mostrar monto (BOOL) · Icono (INSTANCE_SWAP) · Acción (Button outline, expuesto) |
| `BarraDesglose` | `638:37709` | Paleta = semáforo/marca · Título, Total, Etiqueta 1–4, Valor 1–4 (TEXT) · Mostrar 4.º tramo (BOOL) |
| `ModuloResumenFila` | `638:388816` | Estado = plegado/desplegado/reordenar/arrastrando × Layout = escritorio/móvil · Nombre, Resumen (TEXT) · Icono (INSTANCE_SWAP) · Mostrar estado (BOOL) · Estado (Badge) e Interruptor (Switch) expuestos. Sustituye a `FilaModulo` (`445:195568`), que no tiene propiedades |
| `ModuloPanel` | `638:389383` | Layout = escritorio/móvil · **slots** Indicadores, Lista de atención y Desglose · Meta, Título atención (TEXT) · Mostrar atención, Mostrar desglose (BOOL) · Cabecera, Contador y «Ver módulo» expuestos |
| `ModuloEstado` | `638:389758` | Estado = cargando/vacío/error × Layout · Título (vacío), Descripción (vacío), Título (error), Descripción (error) · Acción principal y Acción secundaria expuestas |

Solo usan variables del archivo: `bg/*`, `text/*`, `border/*`, `brand/*`, `state/*`, los primitivos `blue/*` y `orange/500` para las paletas, `radius/*`, los estilos de texto del kit y `shadow/md`.

## 5. Pantallas en «03 Navegación y shell» › «Inicio — Dashboard por módulo (propuesta)» (`642:25956`)

| Frame | Id | Captura |
|---|---|---|
| Escritorio / Inicio — Módulos plegados (10 activos) | `642:25959` | `38-modulos-escritorio-plegados.png` |
| Escritorio / Módulos — Finanzas e Inventario desplegados | `643:26987` | `38-modulos-escritorio-finanzas-inventario.png` |
| Escritorio / Módulos — Ventas y CRM desplegados | `643:28440` | pendiente |
| Escritorio / Módulos — Chat y Hotel desplegados | `644:28591` | pendiente |
| Escritorio / Módulos — Gimnasio y Parqueadero desplegados | `644:29999` | pendiente |
| Escritorio / Módulos — Transporte y RRHH desplegados | `644:31259` | `38-modulos-escritorio-transporte-rrhh.png` |
| Escritorio / Módulos — estados: cargando, error y vacío | `646:30871` | `38-modulos-escritorio-estados.png` |
| Escritorio / Módulos — cargo sin permiso de Finanzas ni RRHH | `646:31926` | pendiente |
| Escritorio / Módulos — Reordenar y ocultar | `646:32649` | `38-modulos-escritorio-reordenar.png` |
| Móvil / Inicio — Módulos plegados (acordeón) | `642:26772` | pendiente |
| Móvil / Módulos — Finanzas desplegado | `647:32595` | pendiente |
| Móvil / Módulos — Inventario desplegado | `647:33581` | pendiente |
| Móvil / Módulos — Ventas desplegado | `647:34377` | pendiente |
| Móvil / Módulos — CRM desplegado | `647:35170` | pendiente |

Además hay una captura del componente: `38-modulos-componente-fila.png` (ModuloResumenFila).

### Pendiente en Figma (se agotó el cupo del MCP el 2026-09-23)

1. **Reposicionar los frames.** «Móvil / Inicio — Módulos plegados» (`642:26772`, en x=1680, y=200) **se solapa** con `643:26987`. La idea es poner los móviles en una fila propia (y ≈ 4400). Después hay que ajustar el tamaño de la sección `642:25956` (hoy mide 4000×3000 y los frames se salen).
2. **Anotaciones.** La anotación `642:27348` se solapa con el frame móvil. Faltan las anotaciones de los demás frames, que van fuera de los frames, encima de cada uno.
3. **Móvil, «Requiere atención».** Las variantes móviles de `AtencionItem` habían perdido las referencias a las propiedades al clonarlas. Ya están re-enlazadas, pero falta comprobar, y si hace falta volver a aplicar, los textos de las 3 filas en `647:32595`, `647:33581`, `647:34377` y `647:35170`.
4. **Frames que faltan:** móvil de estados (cargando, error y vacío) y móvil en modo reordenar.
5. **Chequeo por script de las dos secciones:** solapes, nodos fuera de la sección, instancias rotas, textos truncados y anotaciones dentro de frames. En la sección de componentes ya se comprobó que no hay solapes.
6. **Capturas pendientes** de la tabla.

---

## 6. Lo que tiene que añadir el backend

Objetivo: **una consulta por módulo, en el servidor, en la zona de la organización**. Nada de N consultas desde el navegador.

1. **`get_inicio_modulos_resumen(p_branch_id int, p_desde timestamptz, p_hasta timestamptz)`**
   - Devuelve una fila por módulo **visible para el usuario**: `code`, las cifras de la línea de resumen, `estado_tono`, `estado_texto` y `severidad`.
   - La organización y los permisos salen de la sesión (`auth.uid()` + pertenencia + `organization_modules` + permisos del cargo). **Nunca del cliente.**
   - Alimenta las filas plegadas y el badge dominante.
   - Sustituye el `MODULOS_NEGOCIO` cableado: el catálogo sale de `moduleManagementService` o de la RPC.
2. **`get_inicio_modulo(p_code text, p_branch_id int, p_desde, p_hasta)`**
   - Una sola RPC con despacho por código, o una por módulo (`get_inicio_modulo_finanzas`, …). Se llama **solo al desplegar**.
   - Devuelve `jsonb`:
     - `kpis[]`: clave, valor, valor_anterior, serie diaria para la MiniTendencia, moneda.
     - `atencion[]`: severidad, tipo, parámetros del texto, monto, acción, `href`.
     - `desglose`: tramos con valor y %.
     - `actualizado_en`.
3. **Reglas por módulo que la RPC debe cumplir** (corrigen lo roto de la §2):
   - **Fechas:**
     - Días y rangos con `AT TIME ZONE` de `getOrganizationTimezone`.
     - Series con `generate_series` en esa zona.
     - La comparación contra el periodo anterior usa un rango de la misma longitud.
   - **Finanzas:**
     - Ingresos desde `payments`.
     - Antigüedad de cartera desde `due_date`. No usar `days_overdue` ni `status`: hay 466 filas desactualizadas.
   - **Inventario:**
     - Agregar `stock_levels` por producto (sumando sucursales y lotes).
     - Costo: `avg_cost`, y si falta, `product_costs` vigente. Devolver el % con costo.
     - Cobertura: con `sale_items` de los últimos 30 días.
   - **POS:**
     - `status IN ('paid','partial')`, sin `void`.
     - Comparar contra el mismo día de la semana anterior hasta la misma hora.
   - **CRM:**
     - Pronóstico = `amount × probability / 100`.
     - Agrupar por `currency`.
     - Oportunidades estancadas por la última actividad o por `last_contact_at`.
   - **Chat:** «sin responder» según la dirección del último mensaje, no por `conversations.status`.
   - **PMS:** ocupación con `reservation_spaces` sobre espacios vendibles.
   - **Gym:** ingresos vía `memberships.sale_id → sales`.
   - **Parking:** sesiones abiertas sin importar el día de entrada; ingresos por `exit_at` de hoy.
   - **Transporte:** `trip_date` = hoy.
   - **HRM:** solo estados válidos del esquema.
4. **Seguridad**
   - `SECURITY INVOKER` con RLS. Si hace falta `DEFINER`: guarda de pertenencia **y** `REVOKE EXECUTE … FROM anon`; la guarda sola no basta.
   - Si el body trae una organización distinta de la de la sesión: 403.
5. **Rendimiento**
   - Antes de crear índices, verificarlos con `get_advisors`. Candidatos:
     - `sales(organization_id, sale_date)`.
     - `accounts_receivable(organization_id, due_date) WHERE balance > 0`.
     - `stock_levels(product_id, branch_id)`.
     - `conversations(organization_id, last_message_at)`.
   - Caché de 60 s por organización + sucursal para el resumen, invalidada por `useDashboardRealtime`.
6. **Preferencias:** orden y visibilidad de los módulos **por usuario y organización** (hoy van en `localStorage`). Necesita una tabla o columna nueva: migración aditiva, con su `.sql` y su rollback.
7. **Frontend (cuando se implemente):**
   - `ModuloSection` no debe cargar datos si está plegado.
   - `LazySection` no debe montar todo a la vez en modo compacto.
   - El fallo de una RPC muestra `ModuloEstado` error, nunca 0.

---

## 7. Preguntas para el dueño

1. **Periodo:** ¿cada módulo usa su periodo natural (POS y verticales = hoy; Finanzas, CRM y Chat = periodo seleccionado; Inventario = estado actual), o todos siguen el selector global?
2. **Inventario:** ¿aceptas cambiar «bajo mínimo» por **cobertura en días** calculada con ventas? `min_level` está configurado en 10 de 44.627 filas.
3. **Chat y CRM:** ¿dos paneles separados (propuesta) o uno?
4. **Moneda:** ¿las oportunidades en USD se muestran aparte (propuesta) o se convierten con una tasa?
5. **Escritorio:** ¿varios módulos desplegados a la vez (propuesta) o uno solo, como en móvil?
6. **Badge sólido:** ¿uno solo en toda la lista, el más grave (propuesta)?
7. **Preferencias:** ¿guardamos orden y visibilidad en la base (por usuario y organización), para que se mantengan entre dispositivos?
8. **Otros módulos:** ¿PM, calendario, notificaciones, integraciones y operaciones quedan fuera de «Módulos» (propuesta)?
9. **Verticales sin datos:** ¿mostramos el panel vacío con el primer paso (propuesta) o se ocultan hasta que haya un primer movimiento?
