# POS — Páginas que faltaban en Figma: análisis y diseño v2

Fecha: 2026-09-28 · Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página
`05 POS y ventas` · BD `jgmgphmzusbluqhuqihj` (solo `SELECT` y conteos agregados; las organizaciones
van por id, nunca por nombre).

Pedido del dueño: «Analiza en el código qué páginas del módulo POS faltan en Figma, analízalas y
hazlas en Figma con el manual de marca, y mejora las funcionalidades y el flujo».

Alcance: solo análisis y diseño. **No se tocó código de la app.** El dueño aprueba en Figma y
después se construye.

Documentos que este **no repite** y da por leídos:

- `POS-PARIDAD-PAGINAS-SECUNDARIAS.md`, con los pendientes P-C, P-K, P-K1/P-K2, P-P, P-U y P-R.
- `POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md` (errores 1-22).
- `POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md`, `POS-MESAS-COMANDAS-RESERVAS.md`,
  `POS-MESAS-VISTAS.md`, `POS-MESAS-FLUJO-COMPLETO.md` y `POS-ESTACIONES-Y-COMANDAS.md`.
- `POS-CARGOS-SERVICIO-EN-VENTAS.md`, `POS-AUTORIZACION-SUPERVISOR.md`, `POS-COBRO-SERVIDOR.md`
  y `POS-UX-V2.md`.
- `docs/implementacion/POS-PLAN.md` y `CAJAS-VENTAS-PLAN.md`.

Aquí va lo que cambió desde esos documentos y las páginas que seguían sin diseño.

**Cómo leer este documento**

- «Existe» = está en el código hoy.
- «Propuesta» = no existe; en Figma lleva una nota amarilla fuera del frame.
- Las referencias de código son relativas a `src/`, salvo que se indique otra cosa.

---

## 0. Resumen para el dueño

1. **El POS tiene 30 rutas en código (`page.tsx`).**
   - **Sin nada en Figma había 5 páginas:** Propinas, Reportes, Satisfacción en caja, Carritos y
     Pagos pendientes. Las dos últimas devuelven `null`.
   - **Con diseño viejo o incompleto había 2:** Cargos de servicio (solo «listo» y «vacío», del
     2026-09-22) y Cupones (faltaban 4 estados, la tableta y la creación por lote).
   - Todo lo demás ya tiene Figma. Mesas, Comandas v2 y Estaciones los llevan otros agentes y no
     se tocaron.
2. **Dibujado hoy: 48 frames** en la sección nueva «POS — Páginas secundarias v2 (propuesta)»
   (`1086:702792`), en 5 subsecciones:
   - Propinas: 15 frames.
   - Reportes: 7.
   - Satisfacción: 8.
   - Cargos de servicio v2: 10.
   - Cupones: 8.

   Todo se montó con instancias del kit: `PageHeader`, `TabItem`, `StatCard`, `SearchBar`,
   `FilterButton`, `Chip`, `TableCell`, `Pagination`, `BulkActionBar`, `EmptyState`, `Skeleton`,
   `ListCard`, `KpiCompacto`, `MobileHeader`, `MobileTabBar`, `FormField`, `SegmentedControl`,
   `DateRange`, `Progress`, `PasoAsistente`, `RepartoFila`, `MeseroPropinasFila`, `CodigoCupon`,
   `LineaRecibo`, `FilaDato` y `ChipDocumento`.

   El chequeo por script dio 0 solapes, 0 instancias rotas, 0 textos desbordados y ningún nombre
   real de organización (§4).
3. **Reportes del POS no está en el menú.** `lib/navigation/catalog.ts:184-205` no lo incluye; solo
   se llega por URL o por la pestaña de Inicio. Además, sus cifras están mal:
   - Días en UTC.
   - Estado `'completed'`, que no existe en `sales`.
   - Ventas web contadas como POS.
   - Pagos de Finanzas contados como POS.

   Es la página secundaria que más organizaciones usarían: 19 organizaciones vendieron por el POS
   en los últimos 90 días.
4. **Propinas ya no pierde datos, pero no se puede «liquidar».**
   - La corrección del 2026-09-24 (`ced6080a`) llevó las propinas de mesa a `pos_checkout_v1`, y la
     anulación hace contra-asiento.
   - Pero «Distribuir» solo marca `is_distributed`. No hay reparto, egreso de caja, comprobante ni
     historial de liquidaciones.
   - La mesa manda al cajero como mesero: `mesas/[id]/page.tsx:1795-1825` no pasa
     `session.server_id` y `CheckoutDialog.tsx:504` lo reinicia.
   - El diseño propone el asistente «Liquidar propinas» en 3 pasos.
5. **Carritos y Pagos pendientes son páginas en blanco con URL viva.** Solo las enlaza
   `config/moduleConfig.ts`, que es código muerto. Recomendación: retirarlas (pregunta 3).

---

## 1. Evidencia de uso (BD, 2026-09-28, conteos por id de organización)

| Dato | Filas | Organizaciones | Detalle por id (filas) |
|---|---:|---:|---|
| Ventas (`sales`) últimos 90 días | 3.910 | 19 | 144:1710 · 142:522 · 115:512 · 135:278 · 113:219 · 132:165 · 120:150 · … |
| Origen de esas ventas | pos 2.632 · web 699 · invoice 579 | — | Reportes mezcla `web` con POS |
| Estado de esas ventas | paid 3.005 · pending 903 · void 2 | — | `pending` (crédito): 115:512 · 144:271 · 132:59 · 120:39 |
| Cartera abierta con venta (`accounts_receivable`, saldo > 0) | 864 | 9 | 115:502 · 144:240 · 132:73 · 2:33 |
| Pedidos web (`web_orders`) | 6.844 | 7 | 113:2847 · 135:2146 · 137:1126 · 145:702 |
| Pedidos web últimos 30 días | expirados 2.551 · cancelados 561 · confirmados 441 · pendientes 2 | — | — |
| Sesiones de caja | 114 | 16 | 144:29 · 142:23 · 134:15 · 132:12 |
| Comandas (`kitchen_tickets`) | 205 (3 en 30 días) | 6 | 120:169 · 2:24 |
| Mesas (`restaurant_tables`) | 70 | 9 | 130:30 · 120:24 |
| Promociones | 19 | 5 | 142:8 · 135:5 · 134:3 |
| Cargos de servicio | 45 (30 inactivos) | 13 | 2:9; las demás son semilla de 3 filas |
| Propinas (`tips`) | 9, todas en efectivo y sin distribuir | 3 | 2:6 · 134:2 · 133:1 |
| Ventas con `tip_amount` > 0 sin fila en `tips` | **0** | — | el hallazgo #3 de promociones quedó corregido |
| Devoluciones | 7 (última 2025-07-24) | 1 | 2:7 |
| Cupones | 1 · 0 canjes | 1 | 2:1 |
| Reservas de mesas | 0 | 0 | — |
| Calificaciones en caja · terminales (`pos_display_feedback` · `pos_terminals`) | 0 · 0 | 0 | — |
| Cobros QR (`payment_qr_sessions`) · carritos en servidor (`carts`) | 0 · 0 | 0 | — |
| Reportes guardados o programados | 0 · 0 | 0 | — |
| Organizaciones con el módulo `pos` activo | 68 | — | — |

**Esquema verificado que cambia los documentos anteriores.**

- `tips` ya tiene `voided_at`, `voided_by`, `void_reason` y `distribution_batch_id`.
- Existe `payment_qr_sessions`, con `status`, `source`, `source_id`, `expires_at`, `paid_at` y
  `payment_id`.
- `pos_terminals` tiene `display_last_seen_at`.
- `pos_display_feedback` tiene `sale_id` NULL-able.
- `service_charges.charge_type` ya se lee bien (`fixed_amount`).
- `coupons.discount_type` sigue en choque con el código: `'fixed'` contra `'fixed_amount'`.

**Prioridad por uso real**

1. Ventas, Cajas y POS (ya rediseñados).
2. **Reportes** (19 organizaciones, sin Figma y fuera del menú).
3. Pedidos online (7).
4. Cuentas por cobrar (9).
5. Mesas y Comandas.
6. Promociones.
7. **Cargos de servicio** y **Propinas**, con poco uso real hoy porque ni el cargo se cobra ni la
   propina se liquida.
8. Devoluciones, Cupones, Reservas y Satisfacción, con uso casi nulo.

Se dibujó primero lo que no tenía nada. Dentro de eso, primero lo que usan más organizaciones.

---

## 2. Todas las rutas del POS

Fuentes:

- `app/app/pos/**/page.tsx`: 30 archivos.
- El menú del módulo en `lib/navigation/catalog.ts:184-205`: 13 enlaces.
- `config/moduleConfig.ts:115-123`: 9 enlaces. Nadie lo importa (código muerto) y apunta a
  `/app/pos/configuracion`, que no existe.

| # | Ruta | ¿En el menú? | Componentes | Datos / servicios / RPC | Figma | Código | Problemas (archivo:línea) | Mejoras propuestas |
|---|---|---|---|---|---|---|---|---|
| 1 | `/app/pos` | Sí | `app/app/pos/page.tsx` (689 líneas), `CartView`, `ProductSearch`, `CheckoutDialog`, kit | `posService` (carritos en `localStorage` `pos_carts_<org>`), `pos_checkout_v1` | Secciones 1-9 (`185:48643`, `198:13697`, `188:7831`, `179:1233`, `250:81060`, `166:38190`, `250:81061`) | **Rediseñado** (pasos 4-15, 2026-09-28) | `hold_with_debt` desaparece al recargar (POS-PLAN L11) · el cobro no tiene campo de cupón · el cargo de servicio no se cobra (`service_charges` solo lo lee el CRUD) | Cupón y cargo en `pos_checkout_v1` (ya especificados en su documento) |
| 2 | `/ventas`, `/ventas/[id]`, `/ventas/nuevo` | Sí | `pos/ventas/VentasPage`, `detalle/VentaDetallePage`, `NuevaVenta`, `AnularVentaDialog` | `GET /api/pos/ventas`, `pos_anular_venta_v1` | `329:36069`, `332:40217`, `334:123004` | **Rediseñado** | El código ya lleva el «Anular con qué se revierte» que en Figma seguía pendiente (P-V1/P-V2) | Actualizar Figma P-V1/P-V2 desde el código aprobado (baja prioridad) |
| 3 | `/cajas`, `/cajas/[id]`, `arqueos/nuevo`, `movimientos/nuevo` | Sí | `pos/cajas/**` (kit en 17 archivos) | `CajasService`, `/api/pos/cajas/**`, `pos_caja_esperado` | `351:48911`, `355:53496`, `359:57133`, `680:404392` | **Rediseñado** | P-K pendiente: el arqueo compara por método | P-K (fuera de este encargo) |
| 4 | `/devoluciones`, `/devoluciones/motivos` | Sí | `app/app/pos/devoluciones/page.tsx` (279 líneas, `Tabs`), `ReturnForm`, `TicketSearch`, `ReturnsHistory` | `devolucionesService`, `returns`, `return_reasons` | `873:573997` (rediseño completo, 16 frames) | **Viejo** (Figma por delante) | D1-D17 de POS-VENTAS…; `reason_id` 0 de 7 | Construir el diseño `873:573997` |
| 5 | `/cuentas-por-cobrar`, `/[id]`, `/cliente/[customerId]` | Sí | `finanzas/cuentas-por-cobrar/listado/ListadoCartera` `origen="pos"`, `DetalleCuentaCartera`, `CarteraCliente` | `GET /api/cartera` → `fn_cxc_listado`, `fn_registrar_pago` | `07 Finanzas`: `448:201605`, `740:49675`, `740:51004` (misma pieza) | **Rediseñado** (`e9e85ec7`) | P-C quedó resuelto en código por la decisión D3: misma pieza, filtrada al POS, con detalle y cobro dentro del POS | No se dibuja aparte: el Figma de 07 es la fuente |
| 6 | `/pedidos-online`, `/[id]` | Sí | `app/app/pos/pedidos-online/page.tsx` (1.459 líneas, sin i18n), `WebOrderFilters`, `WebOrderStats`, `WebOrderCard` | `web_orders`, `/api/web-orders/**` | `447:195913`, `450:212747`, `464:241316` | **Viejo** | Arranca con filtros `{}`, o sea todos los estados incluidos los expirados (`page.tsx:128`); los expirados son el 72 % de los últimos 30 días | P-P: vista «Activos» por defecto y pestaña «Expirados y abandonados» (pendiente, §6) |
| 7 | `/comandas` | Sí | `comandas/page.tsx` (424), `TicketCard`, `FilterBar` | `kitchenService`, `kitchen_tickets` | `445:194864` + **Comandas v2 `959:583911`** + Estaciones `957:105987` | **Viejo** | Lo lleva otro agente | — (no se toca) |
| 8 | `/mesas`, `/mesas/[id]` | Sí | `mesas/page.tsx` (1.187), `mesas/[id]/page.tsx` (2.005) | `MesasService`, `PedidosService`, `pos_checkout_v1` modo `settle` | `445:194858`, `870:98618`, **`1073:666953`** (otro agente dibujando) | **Viejo** | La mesa no pasa `session.server_id` como mesero de la propina (`mesas/[id]/page.tsx:1795-1825`, `CheckoutDialog.tsx:504`) | Avisado; lo lleva el flujo de mesas |
| 9 | `/reservas-mesas` | Sí | `reservas-mesas/page.tsx`, `ReservasHeader`, `ReservasList`, `ReservaFormDialog` | `reservasMesasService`, `restaurant_reservations` + `restaurant_tables` | Sección 21 `445:194862` (15 frames) | **Viejo** | «Hoy» en UTC: `toISOString().split('T')[0]` en `page.tsx:37` y `reservasMesasService.ts:176` · crear marca la mesa `reserved` al instante aunque la reserva sea otro día (`:243-247`) · sin control de cruce en servidor (`:385-420`) · borrado físico (`:359-362`) · sin i18n · 0 filas | `todayInTz`; mesa reservada solo en su franja; RPC con restricción de cruce; «Sentar» abre la mesa (flujo de mesas del otro agente) |
| 10 | **`/propinas`** | Sí | `propinas/PropinasContent`, `TipsHeader`, `TipsList`, `ServerSummary`, `TipForm` (también embebido en `ConfigModals.tsx:69`) | `tips` + `sales`, `fn_propina_anular`, `fn_propinas_liquidar`, `fn_propinas_meseros`, `fn_tiene_permiso` (`propinasService.ts:28-213`) | **No había** → **dibujado** (§3.A) | **Viejo** (i18n sí) | Carga todas las propinas sin rango ni paginación (`propinasService.ts:28-82`) · «Anular» sin motivo (`TipsList.tsx:92`) · «Distribuir» irreversible, sin caja ni comprobante · preselecciona al primer mesero (`TipForm.tsx:75`) · `$` a mano (`TipForm.tsx:190`) · fila «Transferencia» siempre visible (`ServerSummary.tsx:129-133`) · meseros = todos los miembros | Pestañas, liquidación con reparto y pago, detalle de liquidación, motivo al anular, documento y mesa enlazados, rango «hoy» |
| 11 | **`/cargos-servicio`** | Sí | `cargos-servicio/CargosServicioContent`, `ChargesHeader`, `ChargesList`, `ChargeForm` (también en `ConfigModals.tsx:77`) | `service_charges` + `branches`, `fn_tiene_permiso('billing_management')` | Sección 24 `445:194868` (**viejo**: listo y vacío) + `879:110764` (el cargo en la venta) → **v2 dibujado** (§3.D) | **Viejo** | Nunca se cobra (#10) · KPIs con un segundo `getAll()` sin filtros (`CargosServicioContent.tsx:63-68`) · «Aplica a» oculta los globales (`ChargesHeader.tsx:87-91,260`) · borrado físico (`cargosServicioService.ts:125-138`) · CSV con `split(',')` (`cargosLogica.ts:123`) · «Gravado» booleano · subtítulo «propina sugerida» (`messages/es.json:10406`) | Impuesto explícito, KPIs de cobro, «Obligatorio / Opcional» explicado, vista previa del recibo, archivar |
| 12 | **`/cupones`**, `/cupones/[id]` | Sí | `cupones/page.tsx`, `CouponsHeader`, `CouponsList`, `CouponForm`, `[id]/page.tsx` (466) | `coupons`, `coupon_redemptions`, `promotions` (`couponsService.ts:60-404`) | Sección 23 `458:*` (listo, vacío, detalle, nuevo, móvil) → **estados, tableta y lote dibujados** (§3.E) | **Viejo, sin i18n** | `'fixed'` contra `'fixed_amount'` (`types.ts:3,89-92`) · `toISOString().split('T')[0]` (`[id]/page.tsx:149`) · búsqueda sin escapar en `.or()` (`couponsService.ts:82`) · filtros de fecha en UTC (`:93-99`) · `loading` arranca en `false` y el vacío destella (`page.tsx:15`) · no se pueden vaciar campos al editar (`CouponForm.tsx:211-259`) · unicidad no atómica y `_COPIA` fijo (`:191-200,328`) · borrado físico (`:300-304`) · el POS no aplica cupones | Lote, KPIs de canje, estados, permiso, cupón en el cobro (RPC) |
| 13 | `/promociones`, `/nuevo`, `/[id]` | Sí | `promociones/**` (`PromotionsHeader`, `PromotionsList`, `PromotionWizard`) | `promotions`, `promotionEngine` | Sección 23 `454:*`, `455:*` (listo, cargando, vacío, error, detalle, asistente) | **Viejo** | Faltan en Figma «sin resultados», «sin permiso» y la tableta (P-U) · el motor no aplica `usage_limit` | Estados pendientes (§6) |
| 14 | **`/reportes`** | **No** | `pos/reportes/ReportesPage` (también en `inicio/sections/PosSection.tsx:157-162`) | `reportesService.ts`: `sales`, `web_orders`, `sale_items`, `payments`, `cash_sessions`, `cash_movements`, sin RPC | **No había** → **dibujado** (§3.B) | **Viejo, sin i18n** | Fechas `gte/lte` en UTC (`reportesService.ts:92-100,166-174,281-289,340-349,408-409,441-442,460-473`) · `.split('T')[0]` sobre `timestamptz` (`:369`) · estado `'completed'` inexistente en `sales` (`:101,175,350,474`) · ventas web como POS · `payments` sin `source` (`:284-290`) · `cash_movements` sin sucursal (`:456-461`) · el balance suma tarjeta con efectivo (`:508`) · ventas por día cargadas y no mostradas (`:114,122`) · los errores devuelven ceros (`:138-148,260-263`) · `.in()` con miles de ids (`:122-125`) · select de sucursal propio (`ReportesPage.tsx:273`) · fuera del menú | RPC `pos_reporte_periodo`, gráfico diario, comparación, origen segmentado, estados, permiso, entrada en el menú |
| 15 | **`/reportes/satisfaccion`** | **No** | `SatisfaccionPage`, `satisfaccionService` | `pos_display_feedback` con `getDateRange(tz)` (correcto), `pos_terminals`; escribe `POST /api/pos/display/feedback` | **No había** → **dibujado** (§3.C) | **Viejo, sin i18n** | Aviso «sin caja vinculada» en texto plano (`SatisfaccionPage.tsx:214-215`) · `hasRegisteredTerminals` mira toda la organización (`satisfaccionService.ts:143`) · tope de 5.000 filas: el promedio sale de una muestra (`:194`) · select de sucursal propio (`:162`) | Agregado en BD, botón «Vincular pantalla del cliente», pantallas activas, tendencia |
| 16 | `/carritos` | No (solo `moduleConfig`) | `return null` desde `08b0a06c`; el contenido se borró en `368dd103` (2025-07-21) | Antes: tabla `carts` (0 filas). Hoy los carritos viven en `localStorage` | No | **Vacía** | URL viva en blanco | Retirar (pregunta 3) |
| 17 | `/pagos-pendientes` | No (solo `moduleConfig`) | `return null`; antes leía `accounts_receivable` y enlazaba a `/app/pos/cobro`, que ya no existe | Hoy: `payment_qr_sessions` (0 filas); vista existente en `/app/finanzas/metodos-pago/qr-sessions` | No | **Vacía** | URL viva en blanco | Retirar o reorientar a «Cobros QR por confirmar» (pregunta 3) |
| — | `/app/pos/configuracion` | Solo `moduleConfig` | No existe | La configuración del POS vive en `/app/configuracion?modulo=pos` | «Configuración › POS» `199:73150` | — | Enlace muerto | Borrar `moduleConfig.ts` |

---

## 3. Lo dibujado en Figma

Sección padre **«POS — Páginas secundarias v2 (propuesta)»**, `1086:702792`, en (16.000, 140.240),
8.160 × 18.419.

- Está a la derecha de todo lo existente, así que no toca Mesas, Comandas v2, Estaciones ni lo del
  agente de báscula.
- Enlazada en el Índice (`460:241391`) como «26. POS — Páginas secundarias v2 (propuesta)».
- Enlace: https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1086-702792

**Cómo está construida**

- Cada página usa el mismo cascarón que Ventas y Devoluciones: `Sidebar` (rail en tableta),
  `AppHeader`, `PageHeader` con migas «POS › …» y la estructura KPIs → buscador único + Filtros +
  chips → tabla → paginación.
- Detalle con `PageHeader variant=detail` y tarjetas. Diálogos con cabecera, cuerpo y pie. Móvil
  con `MobileHeader`, `KpiCompacto`, `ListCard` y `MobileTabBar`.
- Colores ligados a variables (`brand/action`, `bg/*`, `text/*`, `state/*`, `amber/*` en las
  notas). Textos con los estilos del archivo.
- Datos ficticios: «Mi empresa S.A.S.», «Sucursal Principal», personas inventadas.
- Encima de cada frame va una anotación gris. Debajo, las notas amarillas «Propuesta».

### 3.A Propinas — `/app/pos/propinas` (subsección `1087:712124`, 15 frames)

| Frame | Id |
|---|---|
| Escritorio · pestaña «Por liquidar» (2 seleccionadas, `BulkActionBar`) | `1087:712125` |
| Escritorio · pestaña «Liquidaciones» | `1087:712998` |
| Cargando · vacío · sin resultados · error · sin permiso | `1087:713594` · `1087:714014` · `1087:714348` · `1087:714743` · `1087:715068` |
| Diálogo «Liquidar propinas», paso 2 «Cómo se reparte» (`PasoAsistente`, `RepartoFila`, ajuste con motivo) | `1087:715501` |
| Diálogo «Liquidar propinas», paso 3 «Cómo se paga» (efectivo de la caja abierta, transferencia o nómina) | `1087:715611` |
| Detalle de liquidación LIQ-000004 (reparto, propinas incluidas, pago con egreso y asiento, historial) | `1087:715627` |
| Menú ⋯ de una propina (clon del menú aprobado `873:578358`) | `1087:716181` |
| Diálogo «Anular propina» con motivo | `1087:716307` |
| Tableta 1024 | `1087:716319` |
| Móvil 390 · listado | `1087:717068` |
| Móvil 390 · hoja «Liquidar» | `1087:717572` |

**Existe:** KPIs, filtros (persona, estado, tipo, fechas), tabla con ⋯ (editar, marcar
distribuida, anular), selección con «Distribuir (n)», «Nueva propina», el resumen por mesero, la
anulación con contra-asiento y los permisos por RLS.

**Propuesta:**

- Pestañas Por liquidar · Liquidaciones · Anuladas · Todas.
- Rango «hoy» por defecto, en el día de la organización.
- Columnas Documento (venta o pedido web) y Mesa; «Atendió» con el cargo de la persona.
- «Liquidar» en lugar de «Distribuir», en un asistente de 3 pasos.
  - Tablas `tip_settlements` y `tip_settlement_lines`.
  - Egreso de caja, asiento y comprobante en la misma RPC.
- Detalle de liquidación: ruta nueva `/app/pos/propinas/liquidaciones/[id]`.
- Motivo obligatorio al anular. La columna `void_reason` ya existe.
- Menú con Ver venta, Ver mesa y Reasignar persona.
- Vista móvil y tableta.

### 3.B Reportes del POS — `/app/pos/reportes` (subsección `1086:702793`, 7 frames)

| Frame | Id |
|---|---|
| Escritorio · listo | `1086:702795` |
| Cargando · sin datos · error · sin permiso | `1086:703524` · `1086:703959` · `1086:704327` · `1086:704684` |
| Tableta 1024 | `1086:705006` |
| Móvil 390 | `1086:705671` |

**Contenido del listo:**

- `PageHeader` con «Satisfacción en caja» y «Exportar».
- `DateRange`, `SegmentedControl` de origen (Todo · Punto de venta · Tienda web) y Filtros (cajero
  y método).
- 6 KPIs: ventas netas, transacciones, ticket, ítems, impuestos y descuentos.
- Gráfico «Ventas por día» con barras ligadas a `brand/action`.
- Métodos de pago con `Progress`: el crédito por cobrar va aparte y en advertencia.
- Productos más vendidos y Cajas del periodo.

**Existe:** origen, fechas, sucursal, los 6 KPIs, top 5 más CSV top 10, métodos de pago, resumen
de caja con sesiones y CSV de ventas diarias.

**Propuesta:**

- El gráfico diario (hoy se carga y no se pinta).
- Comparación contra el periodo anterior.
- KPIs netos, que restan devoluciones y excluyen anuladas.
- Origen segmentado.
- La sucursal del header, no un select propio.
- Estados con salida (el vacío «Cambiar fechas · Ir al POS» cierra el callejón L9).
- Una sola RPC `pos_reporte_periodo(desde, hasta, sucursal)` en la zona de la organización.
- Permiso `pos.reportes.ver`.
- **La entrada «Reportes» en el menú del POS.**

### 3.C Satisfacción en caja — `/app/pos/reportes/satisfaccion` (subsección `1086:702794`, 8 frames)

| Frame | Id |
|---|---|
| Escritorio · listo | `1086:706139` |
| Vacío (con pantallas, sin calificaciones) | `1086:706770` |
| Sin pantalla vinculada | `1086:707125` |
| Cargando · error · sin permiso | `1086:707456` · `1086:707867` · `1086:708211` |
| Tableta 1024 · móvil 390 | `1086:708522` · `1086:709105` |

**Existe:** fechas y sucursal, promedio sobre 5, conteo, distribución en 5 barras, agrupado por
sucursal y por terminal, el aviso de caja sin vincular (en texto) y el aviso del tope de 5.000.

**Propuesta:**

- KPI «Pantallas activas» con `display_last_seen_at`.
- Tasa de respuesta (calificaciones sobre ventas).
- Tendencia por sucursal.
- Botón «Vincular pantalla del cliente» (cierra el callejón L10).
- Enlace de «Mala o muy mala» a las ventas calificadas, que requiere guardar siempre `sale_id`.
- Agregado en la BD en lugar de la muestra de 5.000.

### 3.D Cargos de servicio v2 — `/app/pos/cargos-servicio` (subsección `1088:714506`, 10 frames)

| Frame | Id |
|---|---|
| Escritorio · listo | `1088:714508` |
| Cargando · vacío · sin resultados · error · sin permiso | `1088:715187` · `1088:715558` · `1088:715879` · `1088:716247` · `1088:716562` |
| Diálogo «Configurar cargo de servicio» v2 | `1088:716994` |
| Menú ⋯ | `1088:717011` |
| Tableta 1024 · móvil 390 | `1088:717098` · `1088:717720` |

Reemplaza a la sección 24 `445:194868` del 2026-09-22 (listo, vacío y formulario viejo), que no
seguía la estructura nueva. Se integra con `879:110764` (el cargo dentro de la venta).

**Existe:** KPIs total, activos e inactivos; filtros estado, sucursal y aplica a; interruptor de
activo; ⋯ editar, duplicar y eliminar; importar CSV; el formulario.

**Propuesta:**

- Columna y campo «Impuesto del cargo» (`service_charges.tax_id`).
- KPIs de cobro: cobrado, ventas con cargo y quitados por el cajero. Dependen de
  `sale_service_charges`.
- «Obligatorio / Opcional» explicado en caja.
- Vista previa del recibo con `LineaRecibo`.
- «Activar / Desactivar» en el ⋯ en lugar del interruptor en la fila.
- «Archivar» en lugar del borrado físico.
- «Ver ventas con este cargo».
- Filtro «Aplica a» que incluye los globales.
- Subtítulo sin «propina sugerida».

### 3.E Cupones — estados que faltaban y creación por lote — `/app/pos/cupones` (subsección `1088:714507`, 8 frames)

| Frame | Id |
|---|---|
| Escritorio · listo v2 (con `CodigoCupon`, usos restantes, vigencia con cuenta regresiva) | `1088:718200` |
| Cargando · sin resultados · error · sin permiso | `1088:718884` · `1088:719259` · `1088:719621` · `1088:719940` |
| Diálogo «Crear lote de cupones» | `1088:720388` |
| Diálogo «Lote creado» (códigos, exportar CSV, imprimir tarjetas) | `1088:720506` |
| Tableta 1024 | `1088:720521` |

El vacío, el detalle, el nuevo cupón y el móvil ya estaban aprobados en la sección 23 (`458:83055`,
`458:83350`, `458:83786`, `458:83965`) y no se duplicaron.

**Propuesta:**

- Crear lote. `importFromData` existe y no tiene llamadores.
- KPIs de canje.
- Estado «Agotado» calculado en el servidor.
- Permiso `pos.cupones.gestionar`.
- El cupón en el cobro (RPC `pos_validar_cupon` y redención en `pos_checkout_v1`).

### Capturas (`docs/design/figma/`)

| Archivo | Frame |
|---|---|
| `80-pos-seccion-completa.png` | sección `1086:702792` completa |
| `80-pos-propinas-por-liquidar.png` | `1087:712125` |
| `80-pos-propinas-liquidar-paso2.png` | `1087:715501` |
| `80-pos-propinas-liquidacion-detalle.png` | `1087:715627` |
| `80-pos-propinas-movil.png` | `1087:717068` |
| `80-pos-reportes-listo.png` | `1086:702795` |
| `80-pos-satisfaccion-listo.png` | `1086:706139` |
| `80-pos-cargos-listo.png` | `1088:714508` |
| `80-pos-cargos-configurar.png` | `1088:716994` |
| `80-pos-cupones-listo.png` | `1088:718200` |
| `80-pos-cupones-crear-lote.png` | `1088:720388` |

---

## 4. Chequeo por script (use_figma, 2026-09-28)

| Comprobación | Resultado |
|---|---|
| Solapes entre nodos de primer nivel dentro de cada subsección, y entre subsecciones | **0** |
| La sección contra el resto de la página | **0** |
| Nodos fuera de su subsección | **0** |
| Instancias rotas (3.709 instancias) | **0** |
| Textos desbordados o recortados por su marco (2.685 textos) | **0** |
| Nombres reales de organización | **0**: los nombres propios de la sección se cruzaron con `organizations` (89 filas) por SQL, sin coincidencias exactas ni contenidas |

Cómo se midió un texto desbordado: cada texto de una línea se mide a su ancho natural y se compara
con su caja. Además, cada texto se compara contra el primer marco con recorte que lo contiene.

En la primera pasada salieron 94 desbordes:

- Notas amarillas con alto fijo.
- Fechas, sucursales e impuestos más anchos que su columna.
- Subtítulos de `ListCard`.

Se corrigieron así: notas con alto automático, anchos de columna por página, textos más cortos
(«28 sep», «8+ comensales») y columnas ocultas en tableta. La última pasada dio 0.

Hallazgo del kit, **no corregido** para no tocar componentes compartidos:

- `Progress` (`7:91`) no tiene una propiedad de porcentaje. El relleno es fijo, así que se ajustó a
  mano en cada instancia (`Relleno` = `Pista` × %).
- `RepartoFila` (`690:17104`) no trae cabecera de columnas. Se añadió un marco «Cabecera reparto»
  encima de cada grupo.

---

## 5. Mejoras de funcionalidad y flujo (resumen)

**Transversales**

1. **Menú del POS completo.**
   - Añadir «Reportes» (grupo Venta) al `catalog.ts`; «Satisfacción» queda dentro de Reportes.
   - Borrar `config/moduleConfig.ts`, que es código muerto con 3 rutas vacías o inexistentes.
2. **Cada estado con su salida.** Todas las páginas nuevas tienen cargando, vacío con acciones, sin
   resultados con «Limpiar filtros», error con «Reintentar» y sin permiso.
3. **La sucursal sale del header.** Reportes, Satisfacción y Cargos dejan su select propio. En
   Reportes y Satisfacción ese select hoy cambia la sucursal global.
4. **Fechas en el día de la organización.** Sobran estos cálculos:
   - Reportes, Cupones y Reservas calculan días en UTC.
   - Cupones y Reservas usan `toISOString().split('T')[0]`.
5. **Permisos en el servidor.** `pos.reportes.ver`, `pos.propinas.liquidar` y
   `pos.cupones.gestionar`. Hoy Reportes, Satisfacción y Cupones no comprueban nada.
6. **Archivar en lugar de borrar** en Cargos y Cupones. Los dos hacen hoy borrado físico.

**Por página**

- **Propinas:**
  - Liquidación con reparto (a quien atendió, pozo por horas o por porcentaje), ajustes que suman
    cero con motivo, pago (efectivo de la caja abierta, transferencia o nómina), egreso, asiento y
    comprobante.
  - La mesa debe mandar su mesero, no el cajero.
  - La propina web debe nacer en el servidor, sin tragar el error
    (`webOrderConfirmationService.ts:693-736`).
- **Reportes:** una RPC, cifras netas, origen separado, gráfico diario, comparación y enlaces a
  Ventas y Cajas con el filtro aplicado.
- **Satisfacción:** agregado en BD, pantallas activas, tasa de respuesta y vincular pantalla en un
  clic.
- **Cargos:** que el cargo se cobre (lo especifica `POS-CARGOS-SERVICIO-EN-VENTAS.md`), con impuesto
  explícito, vista previa y KPIs de lo cobrado.
- **Cupones:**
  - Arreglar `'fixed'` → `'fixed_amount'`.
  - Crear por lote, con UNIQUE `(organization_id, lower(code))`.
  - Aplicar el cupón en el cobro.
  - Poder vaciar campos al editar.
  - Enlazar la venta en el historial de canjes.

---

## 6. Pendiente (no dibujado en esta tanda)

| Id | Qué | Por qué no |
|---|---|---|
| P-P | Pedidos online: vista «Activos» por defecto y pestaña «Expirados y abandonados» | Mejora sobre un diseño ya aprobado. Se prefirió dibujar las páginas que no tenían nada |
| P-U (parte) | Promociones: «sin resultados», «sin permiso» y tableta | Misma receta que Cupones (`EmptyState search/forbidden`); se puede construir sin frame propio, como indica `CAJAS-VENTAS-PLAN.md` (línea 629) |
| P-V1/P-V2 | Anular venta y detalle v2 | El código ya va por delante (`AnularVentaDialog`). Conviene calcar el código aprobado a Figma |
| P-K, P-K1/P-K2 | Arqueo por método; KDS de tableta | Cajas es de otra zona; el KDS lo lleva Comandas v2 (`959:583911`) |
| Reservas | Rediseño de la sección 21 | La pantalla tiene 0 filas en toda la base, y el flujo reserva → mesa lo está dibujando el agente de Mesas |
| Carritos / Pagos pendientes | — | Depende de la pregunta 3 |

---

## 7. Preguntas para el dueño (con recomendación)

1. **Reportes en el menú.** ¿Se agrega «Reportes» al menú del POS, o se mueve al módulo transversal
   «Reportes»?

   **Recomendación:** en el POS, grupo «Venta», con «Satisfacción» dentro. Es donde el cajero y el
   administrador del punto la buscan.
2. **Propinas: reparto y pago por defecto.**

   **Recomendación:**
   - Reparto «a quien atendió» por defecto, con el pozo por horas como opción cuando haya turnos
     de HRM.
   - Pago en efectivo desde la caja abierta. Sin caja abierta, el efectivo se bloquea con «Abrir
     caja», igual que en devoluciones y cobros.
   - Nómina solo si la organización tiene HRM.
   - ¿Se descuenta la comisión del datáfono a las propinas con tarjeta? Recomiendo que no, salvo
     que la organización lo active.
3. **Carritos y Pagos pendientes.**

   **Recomendación:** retirarlas.
   - Los carritos en espera ya son pestañas del POS.
   - Los cobros QR por confirmar ya tienen vista en Finanzas (`/app/finanzas/metodos-pago/qr-sessions`).
   - Las ventas `pending` (903 en 90 días) son cartera, que ya vive en `/app/pos/cuentas-por-cobrar`.

   Si quieres «cobros QR pendientes» dentro del POS, que sea una pestaña de Cajas y no una ruta
   suelta.
4. **«Distribuir» pasa a «Liquidar».** ¿Estás de acuerdo con el nombre y con que cada liquidación
   sea un documento con número (LIQ-000001) y comprobante firmado?

   **Recomendación:** sí.
5. **Impuesto del cargo de servicio.** ¿El cargo toma el mismo impuesto de los platos (Impoconsumo
   8 % en restaurante) o se elige por cargo?

   **Recomendación:** que se elija por cargo, con el de los platos como valor por defecto. Además,
   quitar la semilla «Propina sugerida 10 %» de los cargos.
6. **Cupones por lote.** ¿Se exportan (CSV o tarjetas impresas) o se envían al cliente por la cola
   de avisos?

   **Recomendación:** exportar e imprimir ahora; el envío, cuando exista la cola de avisos.
7. **Satisfacción.** ¿Se guarda siempre la venta calificada (`sale_id`) para poder abrir las ventas
   mal calificadas?

   **Recomendación:** sí, cuando la venta ya exista. Sin conexión se guarda sin venta, como hoy.
8. **Pedidos online.** ¿Dibujo la vista «Activos» por defecto (P-P) en la próxima tanda?

   **Recomendación:** sí. El 72 % de los pedidos de los últimos 30 días son expirados y hoy salen
   mezclados con los activos.
