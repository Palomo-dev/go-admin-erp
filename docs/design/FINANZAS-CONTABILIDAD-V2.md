# Finanzas · Contabilidad V2 — análisis del código, de la base y del flujo, y propuesta para Figma

Fecha: 2026-09-28. Grupo «Contabilidad» del pedido del dueño: «diseñar en Figma, mejorando la UI
para mejorar la experiencia, con el manual de marca y como venimos haciendo, las páginas de
Finanzas; antes, analizar el código actual: UI, BD, backend y el flujo completo de cada una».

**Fase de análisis.** Solo lectura del código (`src/`) y `SELECT` de conteos en la BD
`jgmgphmzusbluqhuqihj`. No se tocó código, BD ni Figma. Sin nombres de organizaciones: se citan
por id.

**Base de este documento:** `FINANZAS-CONTABILIDAD-FIGMA.md` (2026-09-23). No se repite: sus
componentes (§3, «Componentes nuevos»), sus especificaciones por Sección (§3.1–3.15) y sus
decisiones aprobadas siguen vigentes salvo donde aquí se dice lo contrario. Este V2 **actualiza el
estado real** (el 23 por la noche entró el commit `5389d830`, ADR-CC-012, que dejó obsoleta buena
parte de la tabla §1 de aquel documento), **añade el flujo completo con archivo:línea**, los datos
de uso de hoy, los hallazgos de datos medidos y cómo se muestran, y **baja la propuesta al kit que
ya existe** (`KIT-CODIGO.md`, `KIT-COMPARTIDO.md`), a las páginas ya rehechas (ventas, facturas,
CxC/CxP) y a una lista de frames priorizada en escritorio, tableta y móvil.

Índice: §0 qué cambió · §1 uso real · §2 hallazgos de datos y cómo los muestra la UI · §3 problemas
transversales · §4 página por página · §5 componentes del kit · §6 backend · §7 frames · §8
preguntas.

---

## 0. Qué cambió desde el 23-sep (y qué del documento anterior queda obsoleto)

| Tema | Doc. 09-23 decía | Hoy (verificado) | Fuente |
|---|---|---|---|
| Alta manual | dos `insert` desde el navegador, sin periodo | RPC `fn_asiento_manual_crear` (una transacción: partida doble, cuentas de detalle activas, sucursal, periodo abierto, permiso `finance.create`, `fact_key = manual:{uuid}`) | `ContabilidadService.ts:343-359`, ADR-CC-012 |
| Borrar asientos | borrado físico | `fn_asiento_manual_descartar` solo borradores; disparadores `trg_journal_entries_inmutable` y `trg_journal_lines_inmutable`; `authenticated` solo lee (`rxt`) | `ContabilidadService.ts:381-388` |
| Revertir | no existía | `fn_revertir_asiento_manual(id, motivo)` con permiso `accounting.reverse` (1 rol + 68 cargos lo tienen), motivo ≥ 5, solo manuales publicados | `ContabilidadService.ts:395-415`, `AsientoDetailPage.tsx:107-121, 189-245` |
| Chips de reversión | no existían | «Revertido» / «Reversión de #N» + filtro «Ocultar pares revertidos» apagado por defecto | `AsientosPage.tsx:54-56, 211-214, 335-338, 391-404` |
| Informes truncados a 1.000 líneas | sí | suman en la base con `fn_saldos_cuentas` (invoker, guarda de pertenencia); padre suma propio + hijas; «Resultado del ejercicio (sin cerrar)» en el balance general | `ReportesContablesService.ts:120-140, 312-318, 367-435` (F-71) |
| Saldo final del balance de prueba | mal calculado | corregido: neto inicial + neto del periodo | `ReportesContablesService.ts:239-252` |
| Mayor | sin `range` | pagina de a 1.000 y ordena por fecha e id **en el navegador** | `ReportesContablesService.ts:478-515` |
| Periodos | «Bloquear» y «Anual» fallaban por el CHECK; meses solapados | la pantalla usa `yearly`; meses del 1 al último día (F-70); `fn_is_period_open` también mira `quarterly`/`yearly` | `PeriodosFiscalesService.ts:92-139` |

**Lo que no cambió:** ninguna página de contabilidad usa el kit (`@/components/kit`: 0 archivos),
ninguna tiene textos en `next-intl` (0 archivos), hay ~350 clases `dark:` y colores `gray-*`/`blue-*`
cableados, el libro diario sigue trayendo todo al navegador, la bandeja de fallos no existe,
periodos se cierran con un `update` directo sin checklist, reglas/centros/activos/presupuestos
siguen como el 23.

---

## 1. Uso real (medido hoy, 2026-09-28)

| Medida | Valor | Consecuencia de diseño |
|---|---|---|
| Asientos | **24.210** en 22 organizaciones; máximo **9.580** en una sola | el libro diario **tiene** que paginar en el servidor |
| Organizaciones con > 1.000 asientos | **6** | hoy su libro diario muestra solo 1.000 (tope de PostgREST) sin avisar |
| Asientos de septiembre | 16.086 (reposteos del cierre contable incluidos) | |
| Contra-asientos (`source='reversal'`) | **5.901** (24 %); 5.864 enlazados en `journal_reversals`; **0 con motivo** | los chips y el filtro son imprescindibles; el memo técnico «REVERSION F-48 \| …» es lo único legible hoy |
| Orígenes (`source`) distintos | **23** (`invoice_sales` 6.072, `reversal` 5.901, `stock_movements` 4.889, `payments` 2.754, `sales` 2.514, `accounts_receivable` 1.462, `commissions` 231, `cash_movements` 109, `inventory_adjustment` 81, `invoice_purchase` 67, `accounts_payable` 52, `cash_sessions` 22, `folio_items` 22, `tips` 10, `purchase_orders` 7, `customer_credit` 4, `trip_tickets` 3, `reservation` 3, `credit_note` 2, `bank_transactions` 2, `folio_payment` 1, `parking_passes` 1, `sale` 1) | la UI los muestra crudos; `sales`/`sale`/`invoice_sales` son tres grafías del mismo mundo |
| Manuales · borradores | **0 · 0** | el alta manual existe y nadie la ha usado |
| Líneas | 49.301; máximo 3 por asiento; 0 con centro de costo | la «tabla contable» se diseña para N líneas aunque hoy haya 3 |
| Líneas por cuenta | máximo **5.178**; **16 cuentas** con > 1.000 líneas | el mayor debe paginar y calcular el saldo corrido en el servidor |
| Plan de cuentas | 4.256 cuentas en 89 planes, ~48 por plan (máx. 62); 957 padres; 0 inactivas; niveles de 1, 2, 4, 6 y 7 dígitos | árbol pequeño: cabe entero en el cliente; el selector de cuenta busca en memoria |
| Clase 6 (costos) | 283 cuentas, todas `type = expense` | el P&G separa costo de ventas **por el código** (prefijo 6), no por el tipo |
| Periodos | 1.068 mensuales + 87 anuales, **todos abiertos** | nadie ha cerrado nunca |
| Reglas | 3.754 activas, 32 orígenes × 25 eventos (CHECK), 530 con `conditions`, 0 con cuenta de descuento | la UI ofrece 13 orígenes y 8 eventos |
| Rechazos `journal_entry_failures` | 103; **1 abierto** (org 144, compra recibida con total 0, `amount_invalid`) | la bandeja nace casi vacía: su vacío feliz es el estado principal |
| `v_salud_contable` | 22 orgs: 0 descuadradas, **17 con diferencia de cartera** libro ≠ documentos (Σ $ 83,0 M), 4 facturas pagadas sin pago | solo `service_role` hoy |
| Centros de costo · activos · depreciaciones · presupuestos | **0 · 0 · 0 · 0** | prioridad baja de dibujo |
| Permisos del catálogo | `accounting.reverse`, `finance.view/create/approve/void`; **no existe** `accounting.view`, ni permiso para cerrar periodos o editar reglas | ver §6 BK-13 |

---

## 2. Hallazgos de datos (solo documentados, no reparados) y cómo los muestra la UI

Criterio común: «asiento vivo» = no es contra-asiento, y no tiene contra-asiento
(`fact_key = 'reversal:{id}'` ni fila en `journal_reversals.original_entry_id`).

| # | Hallazgo | Medida hoy | Causa verificada | Categoría en la UI |
|---|---|---|---|---|
| D-1 | **Asiento de venta ≠ factura (POS)** | **71 facturas del POS** en 6 orgs: 38 con un solo devengo que difiere (35 mayor, 2 menor) + las 33 de D-2; tolerancia $1 | `fn_auto_journal_sale` crea el asiento en el `INSERT` con el total de la cabecera, **antes de las líneas**; `fn_recalc_invoice_totals` rehace el total desde las líneas (sin `allowance_charges`, donde vive el flete) y el `UPDATE` ya no contabiliza (`FACTURAS-VENTA-CXC-PLAN.md` §5.2 H1) | «Descuadres documento ↔ asiento» |
| D-1b | **Asiento ≠ factura (manuales)** | **30 facturas** manuales en 3 orgs (todas con asiento mayor; Σ dif. $ 5,67 M; 2025-07 → 2026-08) | la misma raíz | idem |
| D-2 | **Dos devengos vivos por factura** | **33 facturas del POS** (orgs 2 y 113): un `accrual:invoice` del 2026-09-11 (1105 D / 4105 C) y un `accrual:sale` reposteado el 2026-09-23 (1305 D / 2405 C / 4105 C). Devengo sobrante Σ **$ 2,56 M** de ingreso | el reposteo de la reversión histórica no neutralizó el devengo de factura del 09-11 (F-57 contaba 1 caso; hoy son 33) | «Descuadres» (subtipo «Devengo duplicado»). **Nuevo hallazgo: conviene ficha F-79** |
| D-3 | **Borradores de compra con asiento** | **8** facturas en 3 orgs, sin `fact_key` | `fn_retro_journal_purchases` contabilizó borradores (`FACTURAS-COMPRA-CXP-PLAN.md:698`) | «Descuadres» (subtipo «Documento sin efecto contable») |
| D-4 | **Compra recibida con total 0 y asiento** | **13** facturas (9 recibidas + 4 parciales) cuyo asiento no coincide con su total (Σ $ 3,48 M); la factura quedó en 0 | la factura se inserta ya `received` y el asiento sale antes de las líneas (`FACTURAS-COMPRA-CXP-PLAN.md:190`) | «Descuadres» |
| D-5 | **Asientos huérfanos** (el documento ya no existe) | **110 vivos**: 36 `invoice_sales`, 36 `sales`, 33 `payments`, 4 `stock_movements`, 1 `invoice_purchase` (Σ ≈ $ 21 M); + **1 de propina** (`tips` borrada); + **1 asiento sin líneas** (org 113, `source='sale'`, 2026-07-15) | documentos borrados físicamente con su asiento vivo; la propina se puede borrar aun liquidada y su asiento no se revierte (`POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md` #7) | «Huérfanos» |
| D-6 | **Rechazos de contabilización** (`fn_log_journal_failure`) | 103: 99 `no_rule` de `sale_items` (resueltos, ADR-CC-010), 3 sondas (resueltas), **1 `amount_invalid` abierto** (compra, org 144). Motivos posibles en el código: `no_rule`, `no_branch`, `period_closed`, `amount_invalid`, `account_null`, `same_account`, `debit_account_missing`, `credit_account_missing`, `tax_account_missing`, `discount_account_missing` (31 funciones llaman a `fn_log_journal_failure`) | — | «Pendientes de contabilizar» |
| D-7 | **Movimiento en cuentas padre** | 8 cuentas padre con 144 líneas; **244 reglas en 32 orgs** apuntan a una cuenta padre | el motor automático no exige cuenta de detalle; el manual sí (`CUENTA_NO_ES_DE_DETALLE`) | aviso en Plan de cuentas y en Reglas («Cuenta con subcuentas») |
| D-8 | **Cartera: libro ≠ documentos** | 17 orgs, Σ $ 83,0 M | F-57/F-62 | tarjeta «Salud contable» (aviso, no bloquea el cierre salvo decisión, §8 P-6) |
| D-9 | **Anular venta no revierte costo ni stock** | 3 salidas de venta anulada vivas (F-73) | `VentasService.cancelSale` | «Descuadres» (subtipo «Anulado sin reversión») |

**Propuesta de UI (nueva página «Salud contable», ver §4.13):** una bandeja con cuatro pestañas y
contador, las mismas en el hub como banda de aviso:

1. **Pendientes de contabilizar** — `journal_entry_failures` abiertos (hoy 1). Cada fila: documento
   (`ChipDocumento`), motivo legible, importe, desde cuándo, acción según motivo («Crear regla»,
   «Crear cuenta», «Abrir periodo», «Revisar documento»).
2. **Descuadres** — D-1, D-1b, D-2, D-3, D-4, D-9: documento, total del documento, total del
   asiento, diferencia (roja), subtipo, «Ver asiento» / «Ver documento». Solo lectura: la
   corrección es contra-asiento + reemisión por la sesión del núcleo contable (nunca editar).
3. **Huérfanos** — D-5: asiento, origen crudo traducido, «documento eliminado», importe.
4. **Estructura** — D-7: cuentas padre con movimiento y reglas que apuntan a padres.

Más la tarjeta **«Salud contable»** (D-8 y `balance_cuadra`) arriba. Estado vacío feliz: «Todo
contabilizado: 0 pendientes, 0 descuadres». En los detalles ya rehechos (venta, factura de compra)
la tarjeta «Asientos» gana un aviso de solo lectura «El asiento no cuadra con la factura
($ 19.000 de más)» (lo prevé `FACTURAS-VENTA-CXC-PLAN.md` §5.2 H1).

---

## 3. Problemas transversales (aplican a las 13 páginas)

| # | Problema | Evidencia |
|---|---|---|
| T-1 | **Nada del kit**: cabeceras, tablas, filtros, estados, badges y diálogos hechos a mano; `confirm()` nativo en 7 sitios | 0 imports de `@/components/kit`; `confirm(` en `AsientosPage.tsx:201`, `AsientoDetailPage.tsx:94`, `PlanCuentasPage.tsx:197`, `PeriodosFiscalesPage.tsx:85`, `ReglasContablesPage.tsx:147`, `CentroCostosPage.tsx:59`, `ActivosFijosPage.tsx:70`, `PresupuestosPage.tsx:58` |
| T-2 | **Sin i18n** (la regla es es/en/fr/pt con `next-intl`); títulos con tildes perdidas («Balance de Comprobacion», «Debito», «Linea Recta») | 0 `useTranslations`; `BalanceComprobacionPage.tsx:118, 159-167`, `FixedAssetService.ts:43-58` |
| T-3 | **Colores fuera de la marca**: ~350 `dark:`, `gray-*`, `blue-600`, verde/rojo para débito/crédito (el débito no es «bueno» ni el crédito «malo») | `MayorContablePage.tsx:166, 172, 220-221` |
| T-4 | **Errores tragados**: los informes hacen `console.error` y pintan vacío o `return null` (página en blanco) | `BalanceComprobacionPage.tsx:66-68`, `EstadoResultadosPage.tsx:80-97`, `BalanceGeneralPage.tsx:73, 90`, `MayorContablePage.tsx:83-85` |
| T-5 | **`BranchBadge` decorativo**: los informes no filtran por sucursal (`fn_saldos_cuentas` no la recibe) | `ReportesContablesService.ts:120-129`; `BranchBadge` en las 7 páginas |
| T-6 | **Sin permiso de vista**: cualquier miembro con el módulo ve toda la contabilidad; cualquiera cierra/reabre periodos, edita reglas y el plan de cuentas (RLS `ALL authenticated` por pertenencia en `fiscal_periods`, `accounting_rules`, `chart_of_accounts`, `cost_centers`, `fixed_assets`, `budgets`) | `pg_policies` |
| T-7 | **Sucursal restrictiva silenciosa**: `journal_entries` tiene `branch_access_restrictive`; un usuario limitado a una sucursal ve balances parciales sin aviso, porque `fn_saldos_cuentas` es invoker | §8 P-3 |
| T-8 | **Moneda cableada**: `'COP'` por defecto al crear asiento y en la tasa | `ContabilidadService.ts:323-324`, `ReportesContablesService.ts:169` |
| T-9 | **Fechas**: `toLocaleString('es-CO')` para «Creado» | `AsientoDetailPage.tsx:285` (debe ser `formatDateInTz`) |
| T-10 | **Dos cálculos del P&G y del balance** (regla 7): `/contabilidad` usa `fn_saldos_cuentas`; `/app/reportes` usa `fn_reporte_estado_resultados` y `fn_reporte_balance_general`, que buscan `type = 'cost'` (no existe: el costo sale en 0 y va a gastos) y pasan el rango como `T00:00:00Z` UTC (día corrido) | `contabilidadReports.ts:33-37, 70-73`; fuente de la función |
| T-11 | **Selects planos** de 48-62 cuentas sin búsqueda en asientos, mayor, reglas, plan (padre) | `AsientosPage.tsx:491-505`, `MayorContablePage.tsx:120-131`, `PlanCuentasPage.tsx:434-451`, `ReglasContablesPage.tsx:396+` |
| T-12 | **Móvil**: tablas con scroll horizontal (balance de 9 columnas) y diálogos de 896 px | `BalanceComprobacionPage.tsx:155-196`, `AsientosPage.tsx:438` |

---

## 4. Página por página

Formato: **(1) Inventario y flujo** · **(2) Problemas** · **(3) Propuesta** · **(4) Backend**
(referencia a §6). Fechas: `entry_date` es `timestamptz` → `formatDateInTz`/`useFormatDate`;
`fiscal_periods.start_date/end_date` son `date` → `formatPlainDate`.

### 4.1 Hub «Contabilidad» — `/app/finanzas/contabilidad`

**(1)** `src/app/app/finanzas/contabilidad/page.tsx` → `ContabilidadHomePage.tsx` (409 líneas).
Carga `ContabilidadService.obtenerResumen(branchFilter)` (`:122`; servicio `:107-141`: cuenta de
`journal_entries` con `count: exact` + trae filas para contar publicados, cuentas activas, periodos
abiertos) y **folios del PMS** (`:135-181`: todos los folios de la organización + sus ítems).
Tarjetas: 11 accesos (`:22-92`), KPI «Total asientos» (`:249`), «Publicados», «Cuentas»,
«Periodos abiertos» (`:285`), tarjeta PMS con enlace a `/app/pms/folios` (`:329`), acciones
rápidas `?action=new` a asientos y plan (`:386-392`) y periodos (`:398`).

**(2)** «Publicados» se cuenta sobre las primeras 1.000 filas (en 6 orgs es falso); los 5.901
contra-asientos inflan «Total»; la tarjeta PMS no es contable y lee todos los folios; «Nueva
cuenta» con `?action=new` no hace nada (`PlanCuentasPage` no lee `searchParams`); no hay salud
contable, ni periodo actual, ni pendientes.

**(3)** `PageHeader` («Contabilidad», acciones «Nuevo asiento» primaria + «⋯» Exportar);
`KpiStrip` con `StatCard`: **Asientos del mes** (sin contra-asientos, `href` al libro filtrado) ·
**Periodo actual** (`EstadoPeriodo` «Septiembre 2026 · Abierto») · **Pendientes de contabilizar**
(tono peligro si > 0, `href` Salud) · **Descuadres** (idem). Banda `Aviso` (pendiente del kit, ver
§5) si hay pendientes/descuadres. Debajo, dos columnas: «Informes» (Balance de prueba, Estado de
resultados, Balance general, Mayor) y «Configuración» (Plan de cuentas, Reglas, Periodos, Centros,
Activos, Presupuestos) con `RelatedLinkCard`. Sin tarjeta PMS (va al hub de PMS). Estados:
cargando (esqueleto por KPI), error, sin permiso. Móvil: `KpiCompacto` 2×2 + lista de accesos.

**(4)** BK-9 (salud por organización), BK-1 (conteo del mes sin contra-asientos).

### 4.2 Plan de cuentas — `/app/finanzas/contabilidad/plan-cuentas`

**(1)** `PlanCuentasPage.tsx` (478). Lee `obtenerPlanCuentas()` (`ContabilidadService.ts:144-159`,
`select *` de `chart_of_accounts`). Árbol en cliente (`:71-113`), expandir/contraer todo
(`:125-132`), filtro por tipo (`:331-341`), 5 KPI por tipo (`:349-356`). Diálogo crear/editar
(`:161-194`): código (bloqueado al editar), nombre, **tipo editable**, padre con `Select` de todas
las cuentas salvo ella misma (`:434-451`), descripción con `RichTextEditor` (HTML). Eliminar
(`:196-205`) → `delete` físico (`ContabilidadService.ts:208-221`). Tabla: `PK (organization_id,
account_code)`, CHECK de 5 tipos, **sin FK de `parent_code`**; `journal_lines` tiene FK `ON DELETE
RESTRICT`. Disparadores de alta de organización siembran 48 cuentas (F-74).

**(2)** Borrar una cuenta con movimiento falla con «Error al guardar/eliminar» genérico (la FK lo
frena); una **sin movimiento pero usada por una regla sí se borra** y la regla empieza a rechazar
(no hay FK desde `accounting_rules`); borrar un padre deja a sus hijas como raíces; se puede
**cambiar el tipo** de una cuenta con movimiento (su saldo salta de informe); el padre puede ser de
otro tipo o un descendiente (ciclo); `is_active` no se puede cambiar desde la UI (0 inactivas);
al buscar, el hijo se promueve a raíz (`:98-102`); no hay saldo ni naturaleza visible; «Duplicar»
importado sin uso; D-7 (cuentas padre con movimiento) invisible.

**(3)** `PageHeader` («Plan de cuentas», subtítulo «48 cuentas · 5 clases», acciones «Nueva
cuenta» + «⋯» Exportar · Importar PUC). `ListToolbar` con `SearchInput` («Buscar por código o
nombre») + `FilterPanel` (clase, estado activa/inactiva, «con movimiento», «de detalle / agrupadora»).
Árbol con `TreeCell` del kit (Categorías ya lo usa) en `DataTable`: Código (mono) · Nombre · Clase
(`Badge` neutro) · **Naturaleza** (Débito/Crédito, derivada del tipo) · **Saldo a hoy** (con D/C) ·
Estado · «⋯» (Editar · Ver en el mayor · Agregar subcuenta · Desactivar/Activar). Búsqueda que
mantiene ancestros como contexto (`kit/arbol.ts` `filtrarArbol`). Cuenta padre con movimiento:
`Badge` advertencia «Movimiento en cuenta agrupadora». Diálogo «Nueva cuenta» (`Dialogo` 560):
código con prefijo del padre sugerido, nombre, clase heredada del padre (bloqueada si hay padre),
padre con **`SelectorCuenta`** (árbol, deshabilitando descendientes con motivo, igual que
`TreePicker`), descripción en texto plano. Diálogo **«No se puede eliminar»** → «Desactivar en su
lugar» (124 movimientos · 3 subcuentas · usada en 2 reglas). Estados: cargando, vacío («Cargar
PUC»), sin resultados, error, sin permiso. Móvil: `TreeCard` por clase, alta en hoja.

**(4)** BK-7 (guardar/desactivar por RPC con reglas), BK-4 (saldo por cuenta), BK-13 (permiso).

### 4.3 Libro diario — `/app/finanzas/contabilidad/asientos`

**(1)** `AsientosPage.tsx` (582). `loadData` (`:81-96`) trae `obtenerAsientos({branchId})`
(`ContabilidadService.ts:224-263`: `select *`, orden por fecha, **sin `range`**) y el plan.
Filtros en cliente (`:213-223`): estado (`:313-322`), origen armado con los orígenes de lo cargado
(`:225, 323-334`), búsqueda por id o memo (`:304-311`), switch «Ocultar pares revertidos»
(`:335-338`). KPIs total/publicados/borradores (`:269-298`). Fila: `CopyableId` (`:367-372`),
fecha, memo, origen crudo en `Badge` (`:381-383`), estado + chips de reversión (`:386-405`),
acciones ver/publicar/duplicar/descartar (`:408-427`). Diálogo «Nuevo asiento» (`:437-579`):
fecha (día de la sucursal → instante con `toInstant`, `:159`), memo, líneas con `Select` de cuenta,
débito, crédito, totales y diferencia; «Crear asiento» **siempre crea borrador**
(`crearAsiento(..., publicar = false)`, `ContabilidadService.ts:313`). Base: RPC
`fn_asiento_manual_crear` (definer, `authenticated`), disparadores de inmutabilidad.

**(2)** **Truncado a 1.000 asientos** en 6 orgs (hasta 9.580): KPIs, filtro de origen y mapa de
reversiones se calculan sobre una muestra; un par original/contra-asiento puede quedar partido.
**«Duplicar» está en todas las filas, incluidos automáticos** (`:419`): copia un devengo de venta
como asiento manual → ingreso duplicado si se publica. Origen crudo (`invoice_sales`, `reversal`…)
y memo técnico de los contra-asientos. Sin paginación, sin rango de fechas en la UI (el servicio lo
admite), sin sucursal ni importe en la fila, sin enlace al documento de origen, sin exportar.
Diálogo: `Select` sin búsqueda, `type=number` con «0.00» (no respeta decimales de la moneda), sin
sucursal visible (usa la del selector global y falla si es «Todas», `:153-156`), sin centro de
costo (la RPC ya lo acepta), sin aviso de periodo cerrado hasta el error, «Publicar» no existe en el
diálogo, `?action=new` abre el diálogo pero no limpia la URL.

**(3)** `PageHeader` («Libro diario», subtítulo «9.580 asientos · 2.311 contra-asientos», acción
«Nuevo asiento» + «⋯» Exportar Excel). `ListToolbar`: `SearchInput` («N.º, descripción o
documento») + `DateRangeButton` (patrón aprobado de Cajas) + `FilterPanel` (periodo, origen
agrupado por módulo, estado, cuenta con `SelectorCuenta`, sucursal, «Ocultar pares revertidos»
apagado). `DataTable` paginada en servidor (`useListadoServidor` + `Pagination`): N.º · Fecha ·
Descripción (legible; en contra-asientos «Reversión de #7.412 · Motivo…») · Origen (`OrigenAsiento`
= icono + etiqueta + `ChipDocumento` al documento) · Sucursal (oculta < xl) · Importe (Σ débitos) ·
Estado (`StatusBadge`: Publicado · Borrador) + `MarcaReversion` (Revertido → #N · Reversión de #N)
· «⋯» (Ver · Duplicar **solo manuales** · Publicar/Descartar solo borradores). Fila de contra-asiento
en texto secundario. Diálogo **«Nuevo asiento»** (`PanelAdaptable` 1024): cabecera con fecha
(aviso inline si el periodo está cerrado), sucursal (`BranchBadge` interactivo), descripción;
**`TablaContable` en edición** con `SelectorCuenta`, descripción, centro de costo opcional,
`CampoNumero` débito/crédito (escribir en uno limpia el otro), «Agregar línea» (Enter en la última
fila); **`BarraCuadre`** fija al pie («Débitos $ 1.190.000 · Créditos $ 1.190.000 · Cuadra» /
«Diferencia $ 19.000»); pie «Cancelar · Guardar borrador · Publicar» (publicar deshabilitado con
motivo si no cuadra). Estados: cargando, vacío («Aún no hay asientos: se crean solos con tus
ventas, compras y pagos»), sin resultados, error, sin permiso, periodo cerrado. Móvil: `ListCard`
(N.º, fecha, origen, importe, marca) y el alta a pantalla completa con líneas en tarjetas y
`BarraCuadre` fija. Tableta 1024: se ocultan Sucursal y Descripción pasa a 2 líneas.

**(4)** BK-1 (libro diario en el servidor), BK-2 (motivo legible), BK-14 (moneda).

### 4.4 Detalle de asiento y reversión — `/app/finanzas/contabilidad/asientos/[id]`

**(1)** `AsientoDetailPage.tsx` (367). `obtenerAsiento(id)` (`ContabilidadService.ts:265-298`:
cabecera + líneas con cuenta embebida por la FK compuesta) y `obtenerReversion` (`:418-429`: por
`source='reversal'`/`source_id` o `fact_key = reversal:{id}`); `puedeRevertir()` con
`fn_tiene_permiso(org,'accounting.reverse')` (`:409-415`). Cabecera con chips (`:162-179`),
acciones Publicar/Revertir/Duplicar/Descartar (`:182-207`), nota de automático (`:210-214`),
diálogo «Revertir» con motivo ≥ 5 (`:216-245`), 3 tarjetas fecha/origen/creado (`:248-291`), tabla
de líneas y totales (`:294-364`). Base: `fn_revertir_asiento_manual`; `journal_reversals` guarda
`motivo`, `created_by`, `categoria`, `lote`.

**(2)** «Asiento no encontrado» redirige con toast (no hay estado propio). «Duplicar» en
automáticos (`:195`). Origen «invoice_sales #uuid» sin enlace. **No se puede mostrar el motivo ni
quién revirtió**: `journal_reversals` no tiene `GRANT` ni política para `authenticated` (el
motivo se guarda y no se lee). «Creado» con `toLocaleString('es-CO')` y sin autor. No se ven
`fact_key`, moneda, sucursal ni el aviso D-1 (el asiento no cuadra con su documento). La nota de
automático no dice **qué documento anular** ni lleva el enlace. El diálogo no muestra la vista
previa ni la fecha que tomará el contra-asiento.

**(3)** `DocumentoCabecera` variante detalle: «Asiento #7.412», `StatusBadge` Publicado +
`MarcaReversion`, acciones según tipo:
- **Manual publicado**: «Revertir» (solo con `accounting.reverse`; sin permiso, `AccionRapida`
  deshabilitada con motivo «Necesitas el permiso Revertir asientos») · «⋯» Duplicar · Imprimir.
- **Automático**: sin «Revertir»; `Aviso` informativo «Este asiento se generó con la **Factura
  FV-1043**. Para revertirlo, anula la factura.» + botón «Ir a la factura».
- **Contra-asiento**: `MarcaReversion` «Neutraliza el #7.412 · 23 sep 2026 · Ana G. · Motivo: IVA
  al débito»; sin acciones.
- **Borrador**: «Publicar» primaria · «Editar» · «Descartar» (destructiva, `Dialogo`).
Cuerpo en dos columnas (≥ lg): izquierda `Tarjeta` «Líneas» con **`TablaContable` lectura**
(Cuenta código + nombre enlazado al mayor, descripción, centro, débito, crédito) y pie con Σ y
«Cuadra»; derecha `Tarjeta` «Datos» con `ListaDatos`/`FilaDato` (fecha contable, sucursal, creado
por «Automático · regla Venta de contado» o usuario, creado el, moneda, clave del hecho plegada) y
`CadenaDocumento` (Venta → Factura → Cobro → Asiento actual). Si D-1/D-2: `Aviso` advertencia «El
asiento suma $ 138.000 y la factura $ 119.000». Diálogo **«Revertir asiento #7.412»** =
`DialogoMotivo` del kit (motivo obligatorio, `motivosRapidos`: «Error de cuenta», «Importe
equivocado», «Duplicado»), `consecuencias` («Se crea el contra-asiento con fecha 28 sep 2026 porque
agosto está cerrado»), vista previa con `TablaContable` espejo; variantes bloqueadas («Ya tiene
contra-asiento #20.113», «El periodo actual está cerrado»). Tras revertir: `ResultadoOperacion`
«Contra-asiento #20.113 creado» + «Ver» · «Crear asiento corregido» (abre el alta con las líneas
originales). Estados: cargando, no encontrado (`EmptyState` «Este asiento no existe o es de otra
organización»), sin permiso. Móvil: cabecera, `CadenaDocumento` vertical, líneas en tarjetas,
acciones en `ActionSheet`.

**(4)** BK-2 (lectura de `journal_reversals`, autor), BK-9 (descuadre del asiento), BK-15
(documento de origen resuelto por el servidor: tipo, número, enlace).

### 4.5 Mayor contable — `/app/finanzas/contabilidad/mayor-contable`

**(1)** `MayorContablePage.tsx` (241). Carga el plan (`:59-75`) y **elige la primera cuenta**
(`:67-69`, la clase «1», agrupadora sin líneas propias); `getLedger(cuenta, desde, hasta)`
(`ReportesContablesService.ts:452-555`): saldo inicial con `fn_saldos_cuentas` hasta el instante
anterior, líneas en páginas de 1.000 con `journal_entries!inner`, orden y saldo corrido **en el
navegador**. KPIs saldo inicial/débito/crédito/final (`:156-181`), tabla con fila de saldo inicial
(`:210-213`) y movimientos (`:214-224`).

**(2)** Arranca en una cuenta agrupadora → «0 movimientos» (el mayor de un padre no incluye a sus
hijas). Una cuenta con 5.178 líneas pide 6 viajes y pinta 5.178 filas sin paginar. `#id` sin
enlace (`:217`); descripción = memo del asiento y no la de la línea; origen crudo; débito verde,
crédito rojo; sin naturaleza (saldo negativo sin explicación); sin sucursal, sin exportar, sin
rango de cuentas; `Select` plano.

**(3)** Barra de filtros: **`SelectorCuenta`** (con «de 1105 a 1120» opcional) + `SelectorPeriodo`
(periodo contable o rango, `DateRangeButton` con atajos de periodos) + «Filtros» (sucursal, origen,
«ocultar pares revertidos»). `KpiStrip`: Saldo inicial · Débitos · Créditos · Saldo final con su
naturaleza («$ 4.230.000 D»). `DataTable` paginada en servidor con **`FilaMayor`**: Fecha ·
Asiento (enlace) · Documento (`ChipDocumento`) · Descripción de la línea · Débito · Crédito · Saldo
(D/C); fila fija de **saldo inicial** arriba y de **saldo final** al pie; contra-asientos en texto
secundario con `MarcaReversion`. Cuenta agrupadora: vista «agrupado por subcuenta» con subtotal.
«⋯» Exportar Excel/PDF. Estados: sin cuenta elegida (`EmptyState` «Elige una cuenta»), cargando,
sin movimientos en el periodo (muestra igual saldo inicial = final), error, sin permiso. Móvil:
`KpiCompacto` 2×2 y `ListCard` por movimiento con saldo a la derecha. Tableta: Documento se oculta.

**(4)** BK-3 (mayor en el servidor con saldo corrido), BK-4 (sucursal).

### 4.6 Balance de comprobación — `/app/finanzas/contabilidad/balance-comprobacion`

**(1)** `BalanceComprobacionPage.tsx` (202). Rango por defecto: primer día del mes → hoy de la
organización (`:49-58`). `getTrialBalance` (`ReportesContablesService.ts:210-255`): cuentas
**activas** + dos llamadas a `fn_saldos_cuentas` (periodo e inicial). Tabla plana de 9 columnas
(`:156-196`), totales en cliente (`:73-83`), CSV sin BOM ni tildes (`:85-98`).

**(2)** Plano, sin niveles (clase/grupo/cuenta/subcuenta) ni subtotales; lista las ~48 cuentas
aunque estén en cero; no comprueba ni muestra «Σ débitos = Σ créditos»; excluye cuentas inactivas
aunque tengan saldo; error = tabla vacía; 9 columnas en móvil con scroll horizontal; CSV con
números crudos y comas sin escapar en el nombre.

**(3)** `PageHeader` («Balance de prueba», «⋯» Exportar Excel/PDF). Barra: `SelectorPeriodo` +
`SegmentedControl` **Nivel** (Clase · Grupo · Cuenta · Subcuenta) + «Filtros» (sucursal, «ocultar
cuentas sin movimiento» encendido). Tabla contable con cabecera de dos niveles: Código · Cuenta ·
**Saldo inicial** (Débito · Crédito) · **Movimientos** (Débito · Crédito) · **Saldo final** (Débito ·
Crédito); filas `FilaInforme` con sangría por nivel y subtotal por clase; pie con totales y
**`BarraCuadre`** («Débitos = Créditos · Cuadra»). Celda de cuenta enlaza al mayor del periodo.
Estados: listo, cargando, vacío («Sin movimientos en septiembre»), error, sin permiso, **no cuadra**
(`Aviso` peligro con la diferencia y enlace a Salud contable). Móvil: acordeón por clase y, por
cuenta, `ListCard` con tres pares D/C. Tableta: agrupa en «Inicial · Movimiento · Final» como pares
«D / C» apilados.

**(4)** BK-4 (sucursal, nivel e inactivas en el servidor).

### 4.7 Estado de resultados — `/app/finanzas/contabilidad/estado-resultados`

**(1)** `EstadoResultadosPage.tsx` (200). Rango 1-ene → hoy (`:63-72`). `getIncomeStatement`
(`ReportesContablesService.ts:257-337`): árbol de `income` y `expense` con saldo propio + hijas.
Dos tarjetas lado a lado Ingresos/Gastos (`:132-174`) y resultado (`:176-197`).

**(2)** No separa **costo de ventas** (clase 6, 283 cuentas `expense`) de gastos: no hay utilidad
bruta ni márgenes; sin comparativo; sin exportar; error = página en blanco (`:97`); segundo cálculo
distinto en `/app/reportes` (T-10). La utilidad aparece en valor absoluto con la palabra
«Perdida» sin tilde.

**(3)** `PageHeader` («Estado de resultados», «⋯» Exportar PDF · Excel). Barra: `SelectorPeriodo`
+ **Comparar con** (`Select`: nada · periodo anterior · mismo periodo del año anterior ·
presupuesto) + «Filtros» (sucursal, centro de costo, nivel). Informe en una sola columna de lectura
(como un estado financiero impreso): Ingresos operacionales − Devoluciones = **Ingresos netos** −
**Costo de ventas** (clase 6) = **Utilidad bruta** (margen %) − Gastos de administración (51) −
Gastos de ventas (52) = **Utilidad operacional** ± No operacionales (42/53) − Impuesto de renta
(54) = **Utilidad neta**. Columnas: Actual · Comparativo · Variación $ · Variación %; filas
`FilaInforme` plegables hasta la cuenta; totales con `ColumnaResultado` resaltada. Estados: listo,
cargando, vacío, error, sin permiso. Móvil: acordeón por bloque con los totales siempre visibles y
el comparativo como segunda línea.

**(4)** BK-5 (un solo motor de P&G, agrupación por PUC).

### 4.8 Balance general — `/app/finanzas/contabilidad/balance-general`

**(1)** `BalanceGeneralPage.tsx` (200). Corte «a fecha de» (`:52-67`); `getBalanceSheet`
(`ReportesContablesService.ts:339-450`): activo/pasivo/patrimonio + línea sintética `RESULTADO`
«Resultado del ejercicio (sin cerrar)» y bandera `balanced`. Franja cuadrado/descuadrado
(`:121-129`), tres tarjetas.

**(2)** Sin corriente/no corriente; sin comparativo; sin exportar; error = página en blanco
(`:90`); la línea de resultado usa un código ficticio «RESULTADO»; «Balance cuadrado: Activos =
…» en plural; `/app/reportes` calcula otro balance general.

**(3)** Igual que 4.7: corte con `SelectorPeriodo` (modo «a fecha de»), «Comparar con» (cierre
del mes anterior · mismo corte del año anterior). Dos columnas en escritorio: **Activo**
(Corriente: 11, 12, 13, 14 · No corriente: 15, 16, 17) | **Pasivo** (Corriente · No corriente) +
**Patrimonio** (31-37 + «Resultado del ejercicio» calculado, con icono de información «Se traslada
a 3605 al cerrar el año»). Franja **`BarraCuadre` variante ecuación**: «Activo $ 120 M = Pasivo $ 70
M + Patrimonio $ 50 M · Cuadra». Estados: listo, cargando, vacío, error, sin permiso, **no cuadra**
(peligro con enlace al balance de prueba). Pestañas comunes a 4.6-4.8 (`TabBar` bajo el
`PageHeader`): «Balance de prueba · Estado de resultados · Balance general», para que los tres
informes se sientan una sola sección. Móvil: acordeón Activo / Pasivo / Patrimonio con la ecuación
fija abajo.

**(4)** BK-5, BK-7 (asiento de cierre anual para que el resultado deje de ser sintético).

### 4.9 Reglas contables — `/app/finanzas/reglas-contables`

**(1)** `ReglasContablesPage.tsx` (487) + `ReglasContablesService.ts` (199). Lee reglas y cuentas
activas (`:51-52`); filtro de origen con 13 opciones cableadas (`SOURCE_TYPES`, servicio `:32-46`;
`EVENT_TYPES` 8, `:48-57`); KPIs activas/inactivas (`:232-242`); CRUD (`:98-157` del servicio),
activar (`:159-169`), duplicar (`:171-180`), eliminar con `confirm` (`:147`). Formulario: nombre,
origen, evento, cuenta débito, crédito, impuesto, «usar impuesto del documento», prioridad
(`:356-400+`). Base: CHECK de 32 orígenes × 25 eventos, `UNIQUE (org, source_type, event_type,
priority)`, 530 reglas con `conditions`, RLS `ALL authenticated`.

**(2)** Al editar una regla de PMS, nómina, transporte… el `Select` no tiene su valor (19 de 32
orígenes y 17 de 25 eventos fuera de la lista) y **se pierde al guardar**; **duplicar falla
siempre** (misma prioridad → UNIQUE); `conditions` (530 reglas: contado/crédito, OTA, folio…) y
cuenta de descuento no se ven ni se editan; **244 reglas en 32 orgs apuntan a cuentas padre**
(D-7); sin vista previa: una errata apaga un hecho (hoy queda en fallos); `update`/`delete` sin
filtro de organización en el servicio (la RLS lo frena, pero la regla del repo pide filtrarlo);
sin permiso propio; nombres en inglés en la BD («Venta de contado» vs `sale.created`).

**(3)** `PageHeader` («Reglas contables», subtítulo «42 reglas · 3 con cuenta agrupadora»).
`ListToolbar`: búsqueda + `FilterPanel` (módulo, estado, «con avisos»). Lista **agrupada por
módulo** (Ventas · Cobros · Compras · Tesorería · Inventario · POS · PMS · Nómina · Parqueadero ·
Transporte · Membresías · Comisiones), cada regla como frase: «Cuando **una venta a crédito** se
**crea** → Débito **1305 Clientes** · Crédito **4135 Comercio** · IVA **2408**», con chips de
condición, prioridad, «asientos este mes», rechazos, `Switch` activa y «⋯» (Editar · Duplicar con
prioridad siguiente · Desactivar). Cuenta agrupadora: `Badge` advertencia. Edición en
`PanelAdaptable` 800 con dos columnas: formulario (origen y evento con catálogo completo y
etiquetas en español, `SelectorCuenta` que solo permite cuentas de detalle, condiciones como
constructor de chips, cuenta de descuento, prioridad) y **`VistaPreviaRegla`** («Con la última
venta FV-1043 de $ 119.000 esta regla generaría:» + `TablaContable` lectura; variantes: cuadra ·
cuenta inexistente · cuenta agrupadora · sin documentos de muestra · regla solapada). Estados:
listo, cargando, vacío («Cargar reglas por defecto»), error, sin permiso. Móvil: `ListCard` por
regla con la frase; edición en hoja con la vista previa debajo.

**(4)** BK-8.

### 4.10 Periodos contables — `/app/finanzas/contabilidad/periodos-fiscales` (+ huérfana `/app/finanzas/periodos-contables`)

**(1)** `PeriodosFiscalesPage.tsx` (275) + `PeriodosFiscalesService.ts` (140): lista por
`start_date` desc (`:29-41`), generar 12 meses o anual (`:92-139`; página `:56-60`), cerrar =
`update status='closed', closed_at, notes` **desde el navegador, sin `closed_by`** (`:66-77`;
página `:73`), reabrir con `confirm` (`:79-90`; página `:85`). La huérfana
`periodos-contables/PeriodosContablesService.ts` (187) hace lo mismo pero sí guarda `closed_by`
(`:102-105`) y no está en el catálogo (`catalog.ts:399` apunta a `periodos-fiscales`). Base:
`fn_is_period_open` (mensual y además trimestral/anual) la consultan el motor automático y el alta
manual; RLS `ALL authenticated`.

**(2)** Cualquier miembro cierra y reabre (T-6); cerrar no valida nada (fallos abiertos,
descuadres, borradores, cajas abiertas, conciliaciones) ni deja rastro de quién; reabrir sin motivo;
no hay asiento de cierre anual; dos pantallas para lo mismo; lista larga de 13+ filas sin rejilla
por año.

**(3)** Una sola pantalla (retirar la huérfana, §8 P-8). `PageHeader` («Periodos contables»,
selector de año `SegmentedControl` 2025 · 2026, acción «Generar 2027»). **Rejilla de 12 meses**
(4×3 escritorio, 3×4 tableta, lista en móvil) con `TarjetaPeriodo`: mes, `EstadoPeriodo` (Abierto ·
En cierre · Cerrado), asientos del mes, pendientes (rojo si > 0), «Cerrado por Ana G. · 5 abr
2026», acción «Cerrar» / «Reabrir». Franja del año con su estado y «Cierre anual». Diálogo
**«Cerrar septiembre 2026»** con `ItemChecklist` (ok · aviso · bloquea): balance de prueba cuadra ·
0 pendientes de contabilizar · 0 borradores · 0 descuadres del mes (aviso) · cartera libro =
documentos (aviso) · cajas del mes cerradas (aviso) · conciliaciones del mes (aviso); notas;
«Cerrar periodo» deshabilitado con motivo si algo bloquea. Diálogo «Reabrir» = `DialogoMotivo`.
Asistente de **cierre anual** (`Stepper`: Revisar → Asiento de cierre (ingresos y gastos contra
3605, vista previa `TablaContable`) → Apertura → Confirmar). Estados: listo, vacío («Genera los
periodos de 2026»), cargando, error, sin permiso. Móvil: lista de meses en `ListCard`; checklist en
hoja.

**(4)** BK-6, BK-13.

### 4.11 Centros de costo — `/app/finanzas/centro-costos`

**(1)** `CentroCostosPage.tsx` (146) + `CostCenterService.ts` (65): lista plana, alta/edición con
código, nombre, `parent_id` (sin selector en la UI), activo; eliminar físico con `confirm`
(`:59`). 0 centros; 0 líneas con centro.

**(2)** Nada captura `cost_center_id` (ni asientos manuales —la RPC lo acepta— ni reglas, ni
documentos); sin árbol; `update`/`delete` sin filtro de organización; borrar no pregunta si tiene
movimiento.

**(3)** Árbol con `TreeCell` (código, nombre, gasto del mes, presupuesto, % ejecutado con barra,
estado) y «⋯» (Editar · Agregar subcentro · Ver informe · Desactivar). Alta en `Dialogo` 520 con
`TreeSelect` de padre. Frame «Informe por centro» = estado de resultados filtrado (reutiliza 4.7).
Estados completos; vacío con explicación «Los centros de costo reparten gastos por área o
proyecto». Móvil: `TreeCard`.

**(4)** BK-12.

### 4.12 Activos fijos y presupuestos — `/app/finanzas/activos-fijos`, `/app/finanzas/presupuestos`

**Activos. (1)** `ActivosFijosPage.tsx` (188) + `FixedAssetService.ts` (116): lista con KPIs de
costo y depreciación acumulada (`:105`), alta/edición (tipo, fecha, costo, residual, vida útil,
método), eliminar con `confirm` (`:70`); depreciación mensual calculada en cliente **solo en línea
recta** (`:110-115`). Columnas de cuentas (`account_*_code`) y centro existen en la tabla y no en el
formulario. 0 activos, 0 depreciaciones. **(2)** Nada contabiliza la compra del activo ni la
depreciación; «Saldo decreciente» y «Unidades de producción» dan 0; sin baja ni venta; sin detalle.
**(3)** Lista (`DataTable`: código, activo, tipo, costo, depreciación acumulada, valor en libros,
estado) + **detalle** (`DocumentoCabecera`, `FilaDato` con cuentas 1524/1592/5160 y centro,
**calendario de depreciación** con asiento enlazado) + diálogo **«Depreciar septiembre»** (activos
incluidos, total, vista previa `TablaContable` 5160 D / 1592 C, «Contabilizar») + «Dar de baja» /
«Vender» (`DialogoMotivo` con utilidad o pérdida). **(4)** BK-10.

**Presupuestos. (1)** `PresupuestosPage.tsx` (165) + `BudgetService.ts` (118): lista maestra,
líneas de solo lectura del elegido (`:114-147`), crear cabecera en borrador, eliminar con `confirm`
(`:58`). `upsertLine` existe (`:96-112`) y **no tiene UI**; `fn_reporte_presupuesto_vs_real`
existe y la pantalla no la usa (sí `/app/reportes`). Estado crudo en inglés (`:104`). 0
presupuestos. **(3)** Lista de presupuestos (`StatusBadge` Borrador · Aprobado · Vigente ·
Cerrado), **editor de líneas** tipo hoja (cuenta con `SelectorCuenta` × 12 meses + total anual
repartido, centro opcional, «Copiar del año anterior»), vista **«Presupuesto vs real»** (cuenta,
planeado, real, variación $ y % con barra y semáforo). **(4)** BK-11.

### 4.13 Salud contable (página nueva) — propuesta `/app/finanzas/contabilidad/salud`

**(1)** No existe. Hoy hay: `journal_entry_failures` (legible por miembros: política «Los miembros
ven los rechazos de su organización», `GRANT r`), `v_salud_contable` (solo `service_role`) y las
consultas de §2, que no existen como función.

**(3)** `PageHeader` («Salud contable», subtítulo «Revisado hace 2 min», «Actualizar»). Tarjeta
resumen con `FilaDato` (Balance cuadra ✓ · Cartera libro vs documentos · Facturas pagadas sin
pago). `TabBar` con contador: **Pendientes de contabilizar (1)** · **Descuadres (125** = 71 + 30 + 8 + 13 + 3, cifras de §2 en toda la base; por organización será mucho menos**)** ·
**Huérfanos (112)** · **Estructura (8)**. Cada pestaña es un `DataTable` con `ChipDocumento`,
motivo legible (tabla de §2 D-6 traducida: «No hay regla para *pago de folio*», «La cuenta 2408 no
existe en tu plan», «El periodo de agosto está cerrado», «El documento quedó en $ 0»), importe,
fecha, y una acción principal que **lleva a donde se corrige** (regla, cuenta, periodo, documento).
Ningún botón corrige datos contables desde aquí. Estado vacío feliz por pestaña. Móvil: `ListCard`
con la acción. Sin permiso: `EmptyState forbidden`.

**(4)** BK-9 (función que calcule las cuatro categorías por organización), BK-2.

---

## 5. Componentes: qué se reutiliza del kit y qué falta

**Se reutiliza (existe en `src/components/kit`):** `PageHeader`, `KpiStrip`/`StatCard`,
`KpiCompacto`, `ListToolbar`, `SearchInput`, `FilterPanel`, `FilterChips`, `DateRangeButton`
(+ `rangoFechas`), `DataTable`, `Pagination`, `useListadoServidor`, `RowActionsMenu`,
`ActionSheet`, `ListCard`, `EmptyState` (empty · search · error · forbidden), `StatusBadge`,
`Badge`, `BranchBadge`, `TabBar`, `SegmentedControl`, `TreeCell`, `TreeCard`, `TreePicker`
(`TreeList`, `TreeSelect`) + `arbol.ts`, `Dialogo`, `PanelAdaptable`, `DialogoMotivo`,
`ResultadoOperacion`, `AccionRapida`, `Tarjeta`, `FilaDato`/`ListaDatos`, `CampoNumero`,
`FormField`, `FormSection`, `Stepper`, `RelatedLinkCard`, y de `kit/documento`:
`DocumentoCabecera`, `ChipDocumento` (ya tiene el tipo `asiento`), `CadenaDocumento`.

**Falta crear (en `kit/contabilidad/`, sin lógica de negocio, textos en `kit.contabilidad.*` en 4
idiomas).** Nombres en español del kit; entre paréntesis el nombre del doc. 09-23:

| Pieza | Base | Contrato clave | Lo usan |
|---|---|---|---|
| `SelectorCuenta` (`AccountPicker`) | `SelectorEntidad` + `TreeList` | `cuentas` (árbol ya cargado), `valor`, `soloDetalle` (agrupadoras deshabilitadas con motivo), `tipos`, `rango` (desde–hasta), `layout` campo · fila; popover ≥ lg, hoja < lg | asiento manual, mayor, reglas, plan (padre), presupuestos, activos, filtros |
| `TablaContable` (`JournalLinesTable`) | `DataTable` / `DocumentoLineas` | `lineas`, `modo` lectura · edición, `columnas` (centro, descripción opcionales), `onCambiar`, `pie` con Σ; tarjetas < lg | detalle, alta, vista previa de regla, reversión, depreciación, cierre anual |
| `BarraCuadre` (`JournalBalanceBar`) | — | `debitos`, `creditos`, `variante` totales · ecuación (A = P + Pt), `formatear` | alta de asiento, balance de prueba, balance general |
| `CeldaDC` | — | importe + naturaleza «D»/«C» en texto secundario; cero como «—»; números tabulares | todos los informes, mayor, plan |
| `FilaInforme` (`ReportTreeRow`) | `TreeCell` | `nivel`, `tipo` grupo · cuenta · subtotal · total, `columnas` (actual, comparativo, variación), plegable; acordeón < lg | balance de prueba, P&G, balance general, presupuesto vs real |
| `SelectorPeriodo` | `DateRangeButton` | atajos por **periodo contable** (este mes, mes anterior, trimestre, año, año anterior) con su `EstadoPeriodo`; modo «a fecha de» | todos los informes, libro, mayor |
| `SelectorComparativo` | `Select` | nada · periodo anterior · año anterior · presupuesto | P&G, balance general |
| `OrigenAsiento` (`EntryOriginBadge`) | `ChipDocumento` + `ICONO_DOCUMENTO` | traduce los 23 `source` a 14 etiquetas (venta, factura, cobro, compra, pago, kardex, caja, banco, comisión, nómina, PMS, manual, contra-asiento, cierre); enlaza si hay documento | libro, mayor, detalle, salud |
| `MarcaReversion` (`ReversalMark`) | `Badge` + enlace | `rol` original revertido · contra-asiento · corregido, `numero`, `motivo?`, `fecha?`, `autor?`; compacta (chip) y extendida (franja) | libro, detalle, mayor |
| `EstadoPeriodo` (`PeriodStatusBadge`) | `StatusBadge` | abierto (éxito) · en cierre (advertencia) · cerrado (neutro); **se añade a `estadoTono.ts`** con «Publicado» (éxito), «Revertido» (neutro contorno) | periodos, selector, hub |
| `TarjetaPeriodo` | `Tarjeta` | mes, estado, cifras, acción | periodos |
| `ItemChecklist` (`CloseChecklistItem`) | `FilaDato` | `estado` ok · aviso · bloquea, `conteo`, `href` | cierre de periodo, cierre anual |
| `VistaPreviaRegla` (`RulePreview`) | `Tarjeta` + `TablaContable` | `estado` cuadra · cuenta inexistente · agrupadora · sin datos | reglas |
| `Aviso` (banda con acciones) | — | ya pedido por Cajas en `KIT-COMPARTIDO.md` «Pendientes»; **se construye una vez** | hub, detalle, salud, informes |

Coherencia con lo rehecho: mismas cabeceras y filas de buscador que Facturas y CxC
(`22-patrones-finanzas-facturas.png`), mismo `DialogoMotivo` que anular venta/factura, misma
`CadenaDocumento` que el detalle de venta y la factura de compra (que ya enlazan al asiento:
`tarjetasVenta.tsx:265-284`, `DetalleFacturaCompraV2.tsx:206, 422-427`), mismo `DateRangeButton`
que Cajas. Débito y crédito en `fg` normal (nunca verde/rojo); el rojo queda para diferencias.

---

## 6. Cambios de backend necesarios (no aplicados)

Coordinación: todo lo que toque `fn_create_journal_entry`, `journal_*`, `accounting_rules` o
`fiscal_periods` pasa por la sesión del núcleo contable (siguiente ADR libre: **ADR-CC-014**).
Migraciones aditivas con su reversión en `supabase/rollbacks/`. Ya hechos del doc. 09-23: B-1, B-2
(parcial), B-3, B-5 y parte de B-6 (ver §0).

| # | Cambio | Por qué (evidencia) | Prio. |
|---|---|---|---|
| BK-1 | **Libro diario en el servidor**: `fn_libro_diario(org, desde, hasta, branch, origen[], estado, cuenta, texto, ocultar_pares, limit, offset)` con total, importe del asiento, marca de reversión en los dos sentidos y documento de origen resuelto; conteos para KPIs sin contra-asientos | 6 orgs > 1.000 asientos; hoy `ContabilidadService.ts:224-263` sin `range` | 🔴 |
| BK-2 | **Leer la reversión**: `GRANT SELECT` + política por pertenencia en `journal_reversals` (o columnas `motivo`, `created_by`, `created_at` expuestas por BK-1/BK-15); autor legible | la tabla no es legible por `authenticated`: el motivo se guarda y no se ve | 🔴 |
| BK-3 | **Mayor en el servidor**: `fn_libro_mayor(org, cuentas[] o rango, desde, hasta, branch, limit, offset)` con saldo inicial, saldo corrido (`sum() over (order by entry_date, id)`) y final; incluye subcuentas si la cuenta es agrupadora | 16 cuentas > 1.000 líneas (máx. 5.178); hoy ordena y suma en el navegador | 🔴 |
| BK-4 | `fn_saldos_cuentas` con `p_branch_id` opcional y sin excluir cuentas inactivas con saldo; opción de agregación por nivel | T-5; `ReportesContablesService.ts:222, 269, 349` filtran `is_active` | 🟠 |
| BK-5 | **Un solo motor de estados financieros** (regla 7): `/app/reportes` y `/contabilidad` leen lo mismo; agrupación por PUC (clase 6 = costo de ventas; 51/52/53/54); corregir `type='cost'` inexistente y el rango UTC `T00:00:00Z` de `contabilidadReports.ts:35-36, 107-108` (día de la organización) | T-10 | 🟠 |
| BK-6 | **Cierre de periodo por RPC**: `fn_cerrar_periodo(id, notas)` con checklist en servidor (cuadre, fallos abiertos, borradores; avisos de descuadres, cartera, cajas y conciliaciones) y `closed_by`; `fn_reabrir_periodo(id, motivo)` con bitácora; quitar `UPDATE` directo de `authenticated` sobre `status` | cualquiera cierra/reabre hoy (RLS `ALL`), sin `closed_by` (`PeriodosFiscalesService.ts:66-90`) | 🟠 |
| BK-7 | **Plan de cuentas por RPC**: `fn_cuenta_guardar` (padre del mismo tipo, sin ciclos, sin cambio de tipo con movimiento), `fn_cuenta_desactivar` (en lugar de borrar si tiene movimiento, subcuentas o reglas); el motor rechaza cuentas inactivas (`account_inactive`); «Cargar PUC» | borrados y cambios de tipo libres; sin FK de `parent_code` ni de reglas a cuentas | 🟠 |
| BK-8 | **Reglas**: permiso propio; catálogo de orígenes/eventos desde el CHECK con etiquetas; validar cuentas de detalle al guardar (244 reglas a padres); duplicar con prioridad libre; `fn_simular_regla(regla, source_id)` sin escribir | §4.9 | 🟠 |
| BK-9 | **Salud contable por organización**: `fn_salud_contable(org)` (definer con guarda de pertenencia y permiso) que devuelva pendientes (D-6), descuadres (D-1…D-4, D-9), huérfanos (D-5), estructura (D-7) y lo de `v_salud_contable` (D-8); sin `anon` | §2 | 🟠 |
| BK-10 | Activos: `fn_depreciar_periodo(org, mes)` con `fact_key = depreciation:{asset}:{mes}`; asiento de alta, baja y venta; cuentas en el formulario | 0 depreciaciones posibles | 🟡 |
| BK-11 | Presupuestos: líneas por la UI; la pantalla usa `fn_reporte_presupuesto_vs_real` (tras BK-5); estados en español; filtro de organización en `update/delete` | §4.12 | 🟡 |
| BK-12 | Centros de costo en reglas (`accounting_rules.cost_center_id NULL`) y en documentos; el alta manual ya lo acepta | 0 líneas con centro | ⚪ |
| BK-13 | **Permisos**: `accounting.view` (ver contabilidad e informes de toda la organización), `accounting.manage` (plan, reglas, centros), `accounting.close_period`; por defecto admin y cargo `CONTADOR` (como `accounting.reverse`); resueltos en el servidor | T-6, T-7 | 🟠 |
| BK-14 | Moneda de la organización en `crearAsiento` y en la tasa (`ContabilidadService.ts:323-324`, `ReportesContablesService.ts:169`) — código, no BD | T-8 | 🟡 |
| BK-15 | Documento de origen resuelto por el servidor (tipo, número visible, enlace) para los 23 `source`, y memo legible del contra-asiento a partir de `journal_reversals` | origen crudo en libro, detalle y mayor | 🟡 |
| — | **Datos (no es de esta fase, lo decide el dueño con el núcleo contable):** contra-asiento + reemisión para D-1/D-1b/D-4, neutralizar el devengo sobrante de D-2 (33 facturas), revertir D-3 (8), revertir o documentar D-5 (112), F-73 para D-9 | nunca editar un asiento publicado | — |

Cambios de código que no son backend y conviene hacer al construir las pantallas: quitar
«Duplicar» de asientos automáticos y contra-asientos (`AsientosPage.tsx:419`,
`AsientoDetailPage.tsx:195`), `formatDateInTz` en «Creado» (`AsientoDetailPage.tsx:285`), no
arrancar el mayor en la primera cuenta (`MayorContablePage.tsx:67-69`), leer `?action=new` en el
plan o quitar el acceso del hub, retirar la tarjeta PMS del hub.

---

## 7. Frames a dibujar (priorizados)

Tamaños: **escritorio 1440 × auto** (sidebar expandido), **tableta 1024 × auto** (sidebar en
rail; es el corte `lg`, el más exigente para tablas contables de 7-9 columnas; por debajo de 1024
se usa el diseño móvil) y **móvil 390 × auto**. Shell nuevo, grupo «Contabilidad» activo, datos
ficticios en pesos, PUC colombiano. Capturas previstas `docs/design/figma/51-contabilidad-*.png`.

**P0 — lo que más se usa o está roto (primera tanda de dibujo):**

| # | Sección / frame | Escritorio | Tableta | Móvil |
|---|---|---|---|---|
| 1 | Componentes `kit/contabilidad` (§5, 14 piezas con sus variantes) en `02 Componentes › Finanzas` | ✔ | — | variantes < lg |
| 2 | Libro diario — listo (con contra-asientos y marcas), filtros abiertos, cargando, vacío, sin resultados, error, sin permiso | ✔ ×7 | listo | listo, cargando, vacío |
| 3 | Nuevo asiento — vacío, cuadra, no cuadra, periodo cerrado, `ResultadoOperacion` | ✔ ×5 | cuadra | cuadra, no cuadra |
| 4 | Detalle de asiento — automático, automático con descuadre (D-1), manual publicado, revertido, contra-asiento, borrador, no encontrado | ✔ ×7 | automático | automático, contra-asiento |
| 5 | Revertir asiento — normal, bloqueado (ya revertido / periodo cerrado), resultado | ✔ ×3 | — | normal |
| 6 | Salud contable — pendientes, descuadres, huérfanos, estructura, vacío feliz, sin permiso | ✔ ×6 | descuadres | pendientes, vacío feliz |
| 7 | Hub Contabilidad — con avisos, todo en orden, cargando | ✔ ×3 | con avisos | con avisos |

**P1 — informes y configuración que se consultan cada mes:**

| # | Sección / frame | Escritorio | Tableta | Móvil |
|---|---|---|---|---|
| 8 | Mayor — cuenta de detalle, cuenta agrupadora, sin cuenta, sin movimientos, cargando | ✔ ×5 | detalle | detalle |
| 9 | Balance de prueba — nivel cuenta, nivel clase, no cuadra, vacío | ✔ ×4 | nivel cuenta | acordeón |
| 10 | Estado de resultados — con comparativo, sin comparativo, vacío | ✔ ×3 | con comparativo | acordeón |
| 11 | Balance general — cuadra con comparativo, no cuadra | ✔ ×2 | cuadra | acordeón |
| 12 | Periodos — rejilla del año, cerrar (checklist ok / bloqueado), reabrir, vacío | ✔ ×5 | rejilla | lista, checklist en hoja |
| 13 | Plan de cuentas — árbol, búsqueda, nueva cuenta, no se puede eliminar, vacío | ✔ ×5 | árbol | `TreeCard`, alta en hoja |
| 14 | Reglas — lista por módulo, edición con vista previa (cuadra · cuenta agrupadora · inexistente), vacío | ✔ ×5 | lista | lista, edición en hoja |

**P2 — sin uso hoy (0 filas), dibujar lo esencial:**

| # | Sección / frame | Escritorio | Tableta | Móvil |
|---|---|---|---|---|
| 15 | Cierre anual (asistente 4 pasos) | ✔ ×4 | — | paso 2 |
| 16 | Centros de costo — árbol, alta, vacío | ✔ ×3 | — | árbol |
| 17 | Activos — lista, detalle con calendario, depreciar, dar de baja, vacío | ✔ ×5 | — | lista, detalle |
| 18 | Presupuestos — lista, editor de líneas, presupuesto vs real, vacío | ✔ ×4 | — | lista, vs real |
| 19 | Detalles ya rehechos: aviso «El asiento no cuadra con la factura» en la tarjeta «Asientos» de venta y factura de compra | ✔ ×2 | — | ✔ |
| 20 | Índice de `07 Finanzas`: tarjeta «Contabilidad» con las 14 Secciones | ✔ | — | — |

Total estimado: ~95 frames de escritorio, ~16 de tableta y ~35 de móvil. Chequeo por script al
terminar (reglas (a)–(i) de `AUDITORIA-COHERENCIA-FIGMA.md` §1, solapes, instancias rotas, textos
truncados, anotaciones fuera de los frames).

---

## 8. Preguntas para el dueño (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| P-1 | **Salud contable**: ¿página propia o pestaña del hub? | Página propia (4.13) + banda de aviso en el hub y en cada informe; es lo que convierte D-1…D-9 en trabajo con dueño. |
| P-2 | **D-2** (33 facturas del POS con dos devengos vivos, $ 2,56 M de ingreso de más en las orgs 2 y 113) no estaba medido así: ¿se abre ficha F-79 y la repara la sesión del núcleo contable? | Sí, con contra-asiento del devengo sobrante (nunca borrar), antes de que alguien cierre esos meses. |
| P-3 | **Usuarios limitados a una sucursal**: hoy ven balances parciales sin aviso (política restrictiva). ¿Los informes contables son siempre de toda la organización? | Sí: la contabilidad es de la organización. Quien tenga `accounting.view` ve todo, con filtro de sucursal opcional; quien no, no ve contabilidad. |
| P-4 | **Permisos nuevos** `accounting.view`, `accounting.manage`, `accounting.close_period` | Crearlos (BK-13), activos por defecto para admin y cargo `CONTADOR`, como `accounting.reverse`. |
| P-5 | **Reglas que apuntan a cuentas padre** (244 en 32 orgs) y 8 cuentas padre con movimiento: ¿se obliga a cuentas de detalle? | Sí para lo nuevo (bloquea guardar la regla); para lo existente, crear la subcuenta «General» y reapuntar la regla, sin tocar asientos. |
| P-6 | **Cerrar un periodo con descuadres o diferencia de cartera** (17 orgs) | Avisa, no bloquea; bloquean solo: balance no cuadra, pendientes de contabilizar y borradores. |
| P-7 | **Borradores manuales**: hoy «Crear asiento» siempre guarda borrador | Permitir los dos: «Publicar» como primaria y «Guardar borrador» secundaria. |
| P-8 | Pregunta abierta del 23: ¿se retira `/periodos-contables` (huérfana)? | Sí; queda `/contabilidad/periodos-fiscales` con el nombre visible «Periodos contables». |
| P-9 | Pregunta abierta del 23: ¿«Cargar PUC colombiano completo» o el plan corto de 48? | Plan corto al crear la organización (como hoy) + acción «Completar con el PUC» que agrega solo lo que falta. |
| P-10 | **Activos, presupuestos y centros** tienen 0 uso: ¿se dibujan completos ahora? | Solo lo esencial (P2); su backend (BK-10…BK-12) va después de P0/P1. |
| P-11 | **Tableta**: ¿1024 con sidebar en rail es el tamaño de referencia? | Sí; por debajo de 1024 manda el diseño móvil (mismo corte `lg` del shell). |
| P-12 | **Comparativos**: ¿periodo anterior, mismo periodo del año anterior y presupuesto? | Los tres, con el del año anterior por defecto en los estados financieros. |
| P-13 | **Un solo motor de estados financieros** (`/app/reportes` hoy calcula distinto y con día UTC) | Unificar (BK-5) antes de dibujar la versión de `/app/reportes`, para que los dos lugares den la misma cifra. |

---

Verificación de este documento: cifras de §1 y §2 medidas hoy con `SELECT` en
`jgmgphmzusbluqhuqihj`; archivo:línea leídos en el árbol de trabajo de hoy (`main`, tras
`def8dfb0`). Sin nombres de organizaciones.

---

## 9. Figma — lo dibujado (2026-09-28)

Archivo `EAvjINVRnlzFM70GVoWXgl`. Enlace base: `https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=<id-con-guion>`.
Decisiones aplicadas (coordinador, 2026-09-28): Salud contable como página propia · informes de toda la
organización con sucursal opcional en Filtros · permisos `accounting.view` / `accounting.manage` /
`accounting.close_period` / `accounting.reverse` · reglas solo con cuentas de detalle · cerrar periodo
avisa sin bloquear · tableta 1024.

**Componentes** — `02 Componentes › Finanzas — kit/contabilidad (Nuevo)` `978:605055`: `OrigenAsiento`
`978:605159` (12) · `MarcaReversion` `978:605193` (4) · `EstadoPeriodo` `978:605207` (3) · `BarraCuadre`
`978:605283` (5) · `TablaContable` `978:605473` (3) · `SelectorCuenta` `978:605575` (2) · `SelectorPeriodo`
`978:605644` (2) · `ItemChecklist` `978:605674` (3) · `Aviso` `978:605724` (3) · `FilaInforme` `978:605767` (4).
Faltan como componente (dibujados en pantalla): `CeldaDC`, `TarjetaPeriodo`, `VistaPreviaRegla`, `SelectorComparativo`.

**Pantallas** — `07 Finanzas › Finanzas — Contabilidad v2 (propuesta)` `981:62889` (66 frames):

| Grupo | Frames (id) |
|---|---|
| Libro diario (escritorio) | listo `981:62898` · filtros abiertos `981:63945` · cargando `981:65037` · vacío `981:65700` · sin resultados `981:66273` · error `981:66920` · sin permiso `981:67541` |
| Nuevo asiento (diálogo 1024) | cuadra `983:66317` · no cuadra `983:66555` · periodo cerrado `983:66763` · vacío `983:66972` · publicado `983:67167` |
| Revertir (diálogo) | normal `983:67211` · periodo cerrado `983:67354` · ya revertido `983:67493` · resultado `983:67562` |
| Detalle de asiento | automático `985:66805` · con descuadre `985:67647` · manual publicado `985:68446` · revertido `985:69165` · contra-asiento `985:69884` · borrador `985:70600` · no encontrado `985:71310` |
| Salud contable (nueva) | pendientes `987:618210` · descuadres `987:618932` · huérfanos `987:619696` · estructura `987:620398` · vacío feliz `987:621082` · sin permiso `987:621726` |
| Hub | con avisos `987:622311` · todo en orden `987:623198` · cargando `987:624072` |
| Tableta 1024 | libro `988:624505` · detalle `988:625268` · salud `988:625743` · hub `988:626299` |
| Móvil P0 | libro listo `989:74744` · cargando `989:75095` · vacío `989:75342` · nuevo asiento cuadra `989:75546` · no cuadra `989:75770` · detalle automático `989:75990` · contra-asiento `989:76241` · revertir `989:76474` · salud pendientes `989:76697` · vacío feliz `989:76959` · hub `989:77178` |
| P1 informes | mayor listo `990:75517` · mayor sin cuenta `990:76399` · balance de prueba cuadra `990:77032` · no cuadra `990:77894` · estado de resultados comparativo `990:78769` · balance general `990:79532` |
| P1 configuración | periodos año `991:77842` · cerrar con avisos `991:78604` · cerrar bloqueado `991:78713` · reabrir `991:78789` · plan de cuentas `991:78845` · nueva cuenta `991:79754` · no se puede eliminar `991:79839` · reglas `991:79885` · editar regla `991:80586` |
| P1 móvil | mayor `993:79250` · balance de prueba `993:79562` · periodos `993:79844` · plan de cuentas `993:80080` |

Chequeo por script: 0 solapes, 0 nodos fuera de sección, 0 nodos sueltos, 0 instancias rotas en las dos
secciones; único texto recortado, intencional: pestañas del móvil de Salud contable (desplazamiento horizontal).
Capturas: `docs/design/figma/71-contabilidad-00…14-*.png`.

Pendiente de dibujo: P1 en tableta; P2 (cierre anual, centros de costo, activos, presupuestos, aviso en los
detalles ya rehechos de venta y factura de compra, tarjeta del Índice de `07 Finanzas`).
