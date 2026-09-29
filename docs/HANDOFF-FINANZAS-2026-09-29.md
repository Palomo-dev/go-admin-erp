# HANDOFF — Núcleo contable y finanzas (2026-09-29, sesión «Finanzas»)

Documento de relevo para que otro agente (la sesión «Desarrollo» u otra) continúe
el núcleo contable sin repetir trabajo ni deshacer decisiones. Complementa
`CLAUDE.md`, `docs/HANDOFF-2026-09-29.md` (relevo general de la sesión «Figma e
interfaz») y `docs/progreso-cierre-contable.md` (bitácora de esta zona, solo se
**anexa**). El reporte largo está en `docs/reportes/cierre-contable-2026-09-23.md`
(§1 a §11).

---

## 0. Reglas de esta zona (además de CLAUDE.md)

1. **Un asiento por hecho económico.** Cada hecho lleva `fact_key`
   (`accrual:sale:{id}`, `accrual:invoice:{id}`, `accrual:purchase:{id}`,
   `settlement:payment:{id}`, `reversal:{id}`, `manual:{uuid}`,
   `accrual:ota_commission:{id}`, `settlement:ota_payout:{id}`…) con índice único
   por `(organization_id, fact_key)`.
2. **Nunca `DELETE` de asientos.** Se corrige con contra-asientos
   (`fn_revertir_asiento` / `fn_revertir_asiento_en_fecha`) y bitácora en
   `journal_reversals`. Desde el 2026-09-23 la base además lo **impide** (§2).
3. **Releer la función de la base antes de reemplazarla.** Varias sesiones tocan
   funciones contables; ya hubo pisadas (ADR-CC-009 vs silencio contable). Firma
   distinta = `DROP` + `CREATE`, nunca `CREATE OR REPLACE` a ciegas.
4. **Dry-run** de todo cambio de datos: `DO $$ … RAISE EXCEPTION 'DRY: %' $$` con
   la verificación dentro, y solo después `apply_migration`.
5. **Pruebas en la org 149** (desechable). No tiene miembros: para probar como
   usuario se inserta una membresía temporal dentro de un bloque que termina en
   `RAISE` (se revierte sola).
6. Cada migración con su `.sql` en `supabase/migrations/` (con la versión real que
   devuelve `schema_migrations`) y su rollback en `supabase/rollbacks/`.
7. `master` (producción) no se toca sin orden explícita del dueño. Push a `main`:
   según `docs/HANDOFF-2026-09-29.md` §0.3, con escaneo de secretos y de nombres de
   organizaciones cliente antes.

---

## 1. Modelo contable vigente (ADR-CC-001 a ADR-CC-013)

- **Devengo + cobro.** El devengo de una venta siempre debita la cuenta por cobrar
  (1305) — `fn_regla_devengo_venta`; el cobro va de 1305 a Caja (1105) o Bancos
  (1110) según el medio — `fn_money_account_code_pago`. Compras en espejo
  (`fn_regla_devengo_compra`). Borrador no genera asiento.
- **Costo de ventas: un solo camino, el kardex** (`fn_auto_journal_stock_movement`,
  `6105 D / 1405 C` con subcuenta de sucursal). `trg_auto_journal_sale_item_cogs`
  está deshabilitado (ADR-CC-010).
- **Impuestos** normalizados en la base (`trg_normalizar_impuesto_linea`,
  auditoría en `invoice_item_tax_audit`).
- **Nota crédito sobre factura pagada**: el excedente (solo dinero pagado) se
  liquida como saldo a favor (1305 D / 2805 C) o devolución (pago negativo +
  1305 D / Caja|Bancos C) — `fn_liquidar_excedente_nota_credito` (ADR-CC-008).
- **Silencio contable prohibido**: todo rechazo queda en `journal_entry_failures`
  (`fn_log_journal_failure`); `v_salud_contable` resume por organización.
- Vistas de control (solo `service_role`): `v_cartera_vs_documentos`,
  `v_salud_contable`.

---

## 2. Última fase aprobada (2026-09-23/24): asientos inmutables — ADR-CC-012

Commit `5389d830` (ya en `origin/main`). Migraciones `20260923223116`,
`20260923223400`, `20260923223946`, `20260923224359`, `20260924030912`.

| Qué | Cómo quedó |
|---|---|
| Inmutabilidad | `authenticated` solo tiene `SELECT` sobre `journal_entries`/`journal_lines` (sin políticas de escritura; `anon` sin nada). Disparadores `trg_journal_entries_inmutable` / `trg_journal_lines_inmutable` impiden a **cualquier rol** editar o borrar un asiento publicado. Escape de mantenimiento: `set local app.contabilidad_mantenimiento = 'on'`. |
| Asiento manual | `fn_asiento_manual_crear(org, sucursal, fecha, memo, lineas jsonb, publicar, moneda, tasa, moneda_base)` → una transacción; valida cuentas de detalle activas, partida doble, sucursal de la org, periodo abierto; `source='manual'`, `fact_key='manual:{uuid}'`. `fn_asiento_manual_publicar(id)`, `fn_asiento_manual_descartar(id)` (solo borradores). |
| Reversión | `fn_revertir_asiento_manual(id, motivo)`: permiso `accounting.reverse` («Revertir asientos»), motivo ≥ 5 caracteres (queda en `journal_reversals.motivo` + `created_by`), solo manuales publicados; si el periodo del original está cerrado, el contra-asiento va con fecha de hoy. Los automáticos se revierten **anulando su documento**. |
| Permisos | `fn_tiene_permiso(org, código)` resuelve en la base desde la sesión (`get_user_permission_codes`). `accounting.reverse` para el rol «Admin de organización» (id 2) y el cargo `CONTADOR` (más `finance.create`); un disparador en `job_positions` lo concede a cada cargo `CONTADOR` nuevo. |
| Libro diario (UI) | `ContabilidadService` ya no escribe tablas: todo por RPC y `mensajeErrorAsiento` traduce los códigos. `AsientosPage`: chips «Revertido» / «Reversión de #N» y filtro «Ocultar pares revertidos» (apagado). `AsientoDetailPage`: botón «Revertir» con motivo, aviso en automáticos. |
| Informes | `fn_saldos_cuentas(org, desde, hasta)` (invoker + guarda de pertenencia) suma en la base; antes PostgREST truncaba a 1.000 líneas (F-71). Padre = saldo propio + hijas; balance general con «Resultado del ejercicio (sin cerrar)»; mayor paginado y ordenado por fecha/id. |
| Periodos | Meses del 1 al último día (antes terminaban el 27 del mes siguiente: F-70, 996 corregidos). `fn_is_period_open` también cierra por periodo trimestral/anual. La pantalla usa `yearly` y no `annual`/`locked` (el CHECK los rechazaba). Reabrir pide confirmación. |
| GO Assistant | `assistant_void_purchase_invoice` pasó a `definer` con guarda de pertenencia y usuario de la sesión, sin `anon` (escribe asientos). |

**Verificado:** como usuario autenticado, 8/8 `permission denied` en UPDATE/DELETE/
INSERT sobre contra-asientos (de hoy y de la reversión F-01), automáticos y líneas;
como dueño de la base, `ASIENTO_PUBLICADO_INMUTABLE`; 17/17 casos de la RPC manual
en la org 149; los automáticos siguen asentando (factura y pago de un empleado).

### Estado medido hoy (2026-09-29)
- Disparadores de inmutabilidad: 2 activos. Políticas de escritura: 0.
- Asientos manuales: 0 (nadie ha usado la función aún). Reversiones manuales: 0.
- Organizaciones descuadradas: 0. Pedidos web con dos ventas vivas: 0.
- `journal_entry_failures` abiertos: 1 — factura de compra con importe 0 en la
  org 144 (`amount_invalid`, 2026-09-24). Es un dato, no un defecto: revisar la
  factura con el cliente.

---

## 3. Otros hechos de esta sesión (ya en main)

- **F-67 / ADR-CC-011 — pedido web confirmado dos veces** (`3aed21f2`). El webhook
  de Wompi y el botón «Confirmar pedido» corrían en carrera. Hoy:
  `fn_confirmar_pedido_web` (FOR UPDATE) es el único punto que crea la venta de un
  pedido; `sales.web_order_id` con índice único parcial `uq_sales_web_order_viva`;
  disparador `trg_sales_ligar_pedido_web` que liga ventas desde la nota
  `Pedido web: <número>` (protege también código viejo). «Facturas Hoy» del inicio
  ya no cuenta anuladas ni notas crédito. Caso de la org 145 neutralizado con
  contra-asientos (etiqueta `F-63` en migración y `journal_reversals`: el número
  F-63 ya era de otra sesión).
- **F-68 — recetas autorreferidas (org 144).** `decrement_stock_with_recipe` y
  `stockMovementService.getRecipeItemsForStock` ignoran el ingrediente que es el
  propio producto; `trg_receta_sin_autorreferencia` lo bloquea; 67 salidas
  compensadas por kardex (80 u., 186.500), filas marcadas `[F-68: …]`, nada borrado.
- **F-65 / ADR-CC-013 — comisión OTA.** Regla única `ota_commission/confirmed`
  5235 → 2335 en todas las organizaciones (2335 y 5235 sembradas en los 85 planes y
  en las nuevas). `fn_liquidar_pago_ota(canal, detalle, bruto, cuenta bancaria,
  fecha, referencia)`: Dr Bancos (neto) · Dr 2335 / Cr 1305. 0 reservas OTA hoy.
  La sesión de CRM arregló la firma de la llamada (`20260923223149`); la función
  viva es la de ADR-CC-013.
- **F-61 / ADR-CC-010**, **F-58 / ADR-CC-008**, cuenta 2805, silencio contable
  (F-60) y reversión histórica (5.810 contra-asientos): ver el reporte §1–§9.

---

## 4. Pendientes y decisiones del dueño (en orden sugerido)

1. **F-73 — anular una venta no devuelve costo ni stock.** `VentasService.cancelSale`
   (y liberar mesa con saldo, `34a45d6d`, que lo reutiliza) pone `void` pero deja
   vivas las salidas de kardex y su costo. Hoy: 1 venta anulada con 3 salidas sin
   devolución. Propuesta: una RPC de anulación de venta que devuelva el stock por
   kardex (su asiento neutraliza el costo) y revierta el devengo con
   `fn_revertir_asiento_en_fecha`, igual que se hizo a mano en F-67. **Espera
   aprobación**: encaja con la regla «los automáticos se revierten anulando su
   documento».
2. **F-72 — anular una factura de compra recibida falla siempre**
   (`fn_void_purchase_invoice` usa `source='purchase_void'`, fuera de
   `stock_movements_source_check`). Zona de compras/inventario.
3. **Pantalla PMS** que llame a `fn_liquidar_pago_ota` cuando el canal pague neto.
4. **Cierre de periodo real** (B-6/B-7 de `docs/design/FINANZAS-CONTABILIDAD-FIGMA.md`
   §4): checklist en servidor, asiento de cierre anual contra 3605, reabrir con
   motivo y bitácora. Hoy cerrar un periodo solo cambia su estado.
5. **Datos para el contador** (del relevo general §6.7): 33 facturas POS con doble
   devengo, 81 ajustes con doble asiento, ventas de mesa cerradas sin cobro. Se
   corrigen con contra-asientos por lote, como la reversión histórica
   (`docs/procedimientos/reversion-asientos-duplicados.md`).
6. **Separar ReteFuente/ICA de los impuestos de producto** — fuera de la fase
   aprobada; hay retenciones como clase propia desde `cbf671d6` (sesión Figma).
7. **F-62** — 4 notas crédito históricas con excedente, decisión con cada cliente.
8. **Riesgo sin ficha**: la Edge Function `ai-accounting-agent` crea asientos
   `sale`/`purchase` con `service_role` y **sin `fact_key`**; si se usa, duplicaría
   devengos. Confirmar si se usa y alinearla con `fn_create_journal_entry`.

---

## 5. Trampas verificadas

- `journal_lines` en informes: nunca traer líneas sin paginar (tope 1.000 de
  PostgREST). Usar `fn_saldos_cuentas` o paginar con `.range`.
- Ordenar por una columna de tabla relacionada (`.order('journal_entries.entry_date')`)
  **no** ordena las filas padre.
- `fn_create_journal_entry(14 args)` con `p_tax_is_credit=false` produce
  `Dr debit (monto − tax) · Dr tax / Cr credit (monto)`; la línea de «impuesto»
  lleva el prefijo «IVA - » en la descripción aunque no sea IVA.
- `fn_auto_journal_stock_movement` usa `avg_cost` si `unit_cost` es 0: una entrada
  de compensación a costo 0 puede generar asiento si el promedio ya no es 0.
- `payments.status`: solo `completed` cuenta en saldos; `fn_auto_journal_payment`
  asienta en `INSERT` y en `UPDATE OF status`.
- `accounts_receivable` la mantienen disparadores: nunca escribirla a mano.
- Borrar una organización con asientos exige la vía de mantenimiento (§2).

---

## 6. Dónde está cada cosa

- Decisiones: `docs/decisiones/ADR-CC-001` … `ADR-CC-013`.
- Hallazgos: `docs/hallazgos/F-01` … `F-78` (README con estado); de esta zona:
  F-58, F-60, F-61, F-62, F-65, F-67, F-68, F-70, F-71, F-72, F-73.
- Reporte: `docs/reportes/cierre-contable-2026-09-23.md` §1–§11.
- Bitácora: `docs/progreso-cierre-contable.md` (anexar al final de cada ronda).
- Diseño y decisiones del dueño sobre contabilidad en Figma:
  `docs/design/FINANZAS-CONTABILIDAD-FIGMA.md` (§«Decisiones del dueño»).
- Código: `src/components/finanzas/contabilidad/` (`ContabilidadService.ts`,
  `ReportesContablesService.ts`, `asientos/`, `periodos-fiscales/`),
  `src/lib/services/webOrderServerConfirmation.ts`,
  `src/lib/services/webOrderConfirmationService.ts`,
  `src/lib/services/stockMovementService.ts`.
- Tests: `src/components/finanzas/contabilidad/__tests__/asientosInmutables.test.ts`,
  `src/lib/services/__tests__/webOrderConfirmacionUnica.test.ts`.
