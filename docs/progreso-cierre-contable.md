# Progreso — cierre del núcleo contable

Archivo vivo. Se **añade** al final de cada paso; no se reescribe.
Si el contexto se reinicia, se retoma desde la última entrada.

- Org de prueba: **149** «TEST cierre contable E2E» (sucursal 129). No borrar.
- Decisiones: `docs/decisiones/ADR-CC-*.md`.

---

## 2026-09-23 · Bloque 0 — reconciliación

- Última migración conocida al empezar: `20260923040431 el_costo_de_lo_que_sale_es_costo_no_precio`.
- 10 migraciones ajenas del 23-sep (commits `d8090114`, `9dc89ebd`, `250aeec7`)
  ya habían cerrado la mayor parte de F-48: `fact_key` compartido
  `accrual:sale:{id}`, `fn_create_journal_entry` de 14 argumentos, disparador POS
  diferido. Se conservan.
- Discrepancias con el prompt, medidas:
  - las orgs 137 y 145 no usan el respaldo del POS: son pedidos web;
  - el «0 facturas con IVA desde el 21-sep» no es regresión: 137, 144 y 145
    nunca facturaron con IVA (0 de 36, 0 de 741, 0 de 51) y no tienen
    `product_tax_relations` ni `is_default`;
  - F-49 necesita `partial` en la lista y disparo en `UPDATE OF status`;
  - F-47 solo quitó `anon`; `authenticated` sigue ejecutando;
  - la org 148 no existe (se creó y se borró).

## 2026-09-23 · Bloque 1 — F-48, un asiento por venta

Hallazgo nuevo: el devengo de contado (`1105 D`) más el cobro (`1110|1105 D / 1305 C`)
duplica el activo en toda venta de contado con pago → ADR-CC-001.

- Migración `20260923080135 devengo_de_venta_contra_la_cuenta_que_salda_el_cobro`
  (+ rollback). Nueva `fn_regla_devengo_venta(integer)`; `fn_auto_journal_sale`
  y `fn_auto_journal_sale_pos` la usan. Sin cambio de firma en funciones
  existentes.
- `posService.checkout`: sin respaldo de N inserts para ventas nuevas
  (ADR-CC-002); el tramo restante es solo el cobro de deudas. Tests de
  `src/lib/offline` en verde: 20 suites, 204 tests.
- `journal_entry_failures`: vacía (0 filas) al 23-sep 08:00 UTC. La sonda con
  `p_amount := 0` ahora deja una fila `amount_invalid`; la de la org 113 se
  borró (id 2) y las sondas siguientes van a la org 149.
- Verificación en la org 149 (ADR-CC-003):
  - camino A (una transacción, como la RPC): un devengo `source=invoice_sales`,
    `accrual:sale:b1a00000-…-0001`, `1305 D 119.000 / 4105 C 100.000 / 2405 C 19.000`;
    cobro en efectivo `1105 D / 1305 C 119.000`;
  - camino B (pago, venta y factura en tres transacciones, como el pedido web):
    un devengo `source=sales`, `accrual:sale:b1b00000-…-0001`,
    `1305 D 59.500 / 4105 C 50.000 / 2405 C 9.500`; cobro con tarjeta `1110 D / 1305 C`;
  - balance de prueba de la 149: D = C = 357.000; 1305 = 0.
- Última migración reconciliada: `20260923080135`.
- Falta: Bloques 2–6.

## 2026-09-23 · Bloque 2 — impuestos: normalizar en la base, advertir en la UI

- Migración `20260923081427 impuesto_de_linea_normalizado_en_la_base` (+ rollback):
  disparador `trg_normalizar_impuesto_linea` (completa `tax_code`, audita
  `total_line`, nunca bloquea), `fn_codigo_impuesto_linea`,
  `invoice_item_tax_audit`, recálculo solo al cambiar importes, redondeo F-51.
  Relleno: 280 líneas → `IVA_19`; auditoría: 7 `tarifa_sin_plantilla`,
  61 `total_line_incoherente`; 0 cabeceras reescritas. ADR-CC-004.
- TS: rutas de venta migradas a `taxResolver` (`taxResolverCore.ts` para
  servidor); aviso `has_no_tax` en factura, cotización y POS; tarifa por
  defecto en `/app/finanzas/impuestos` y en el alta de organización; la
  cotización pasa al resolver los impuestos del documento.
- `parkingFinanceService`: sin cambios (su insert nunca funcionó; arreglarlo
  crearía cartera fantasma).
- Migración ajena reconciliada: `20260923081833 reportes_de_problema_desde_el_header`
  (solo `problem_reports`).

## 2026-09-23 · Bloque 3 — higiene contable

- Migración `20260923081953 higiene_contable_f44_f47_f49` (+ rollback). F-49
  allow-list issued/paid/partial y `UPDATE OF status`; anular un borrador ya no
  revierte; F-44 (inalcanzable por `chk_invoice_items_type_sales`); F-47 solo
  `service_role`; `fn_sync_invoice_items_from_sale` con guarda; F-43 OBSOLETA.
  ADR-CC-005. Commit `56f76ffe`.

## 2026-09-23 · Bloque 4 — E2E en la org 149

- 10 casos por SQL, todos correctos (reporte §4). Hallazgos del E2E:
  - compras con el mismo doble activo que ventas → `20260923082133` (ADR-CC-006);
  - la nota crédito perdía su IVA en la cabecera → `20260923082445` (F-56).
- La UI no se recorrió: no se crean cuentas de acceso (ADR-CC-003).

## 2026-09-23 · Bloque 5 — reversión histórica

- Procedimiento reescrito antes de ejecutar; infraestructura `20260923083206`.
- Simulación de 19 orgs → ejecución org por org, lote `cierre-contable-2026-09-23`:
  F-48 2.310 · F-49 31 · F-45 249 · CC-001 1.564.
- 37 devengos sin documento válido quedaron sin reemplazo → restaurados
  (`20260923083545`) y pasados a F-57.
- La diferencia de ingreso restante venía de F-01 (asientos de cartera):
  `20260923083714`, lote `cierre-contable-f01-2026-09-23`, 1.278 neutralizados.
- Al quitar F-01 apareció la cartera faltante de la org 115 (377 facturas
  pendientes devengadas contra Caja) → `20260923083859`, 378 corregidos.
- Resultado: 5.810 contra-asientos, 2.154 devengos corregidos, 0 orgs
  descuadradas; Σ|dif| cxc 254,9 M → 81,9 M, IVA 17,3 M → 6,8 M, ingreso
  416,3 M → 119,6 M. ADR-CC-007.

## 2026-09-23 · Bloque 6 — cierre

- `docs/hallazgos/` sincronizado (F-01, F-29, F-42…F-51; F-53 al índice;
  F-54…F-57 nuevos).
- Reporte final: `docs/reportes/cierre-contable-2026-09-23.md`.
- Última migración reconciliada: `20260923083859`.
- Pendiente humano: usuario de prueba de la 149 y recorrido por la UI;
  auditoría F-57; despliegue (sin push: requiere autorización).

## 2026-09-23 · Ajustes previos al push

- `20260923131009 disparadores_contables_invoker_a_definer`:
  `fn_auto_journal_commission` y `fn_auto_journal_folio_payment` a SECURITY
  DEFINER (`prosecdef = true` en ambas; 0 funciones INVOKER llaman ya a
  `fn_create_journal_entry`). Insertan en `commissions` desde el navegador:
  `posService` (cobro de deuda), `pedidosService`, `FacturasCompraService`.
  0 comisiones y 0 pagos de folio afectados entre el revoke y el ajuste.
  `temp_audit_amount_validation` marcada como código muerto.
- F-58 + ADR-CC-008 (propuesta, sin implementar): nota crédito sobre factura
  pagada. Org 149: 1305 −1.154.500 contra 154.500 abiertas; −1.309.000 = las dos
  notas. La cuenta 2805 existe en 1 de 85 planes contables.
- `20260923131133 vista_cartera_vs_documentos` (security_invoker, solo
  service_role).
- Última migración reconciliada: `20260923131133`.

## 2026-09-23 · Última ronda (13:30–13:50 UTC)

- 2805 en los 85 planes (`20260923133036`); 0 saldos a favor preexistentes.
- F-58 implementado (`20260923133707`, `20260923133809`, `NotaCreditoDialog`):
  4 notas liquidadas como saldo a favor (org 2: 2; org 149: 2); 2 devoluciones
  de prueba en la 149; cartera de la 149 con diferencia 0. F-62 abierto.
- F-60: silencio contable registrado (`20260923133338`, `20260923133424`);
  `v_salud_contable`. F-61 abierto (CMV sin regla, orgs 137 y 144).
- Colisión con la sesión de compras (ADR-CC-009) resuelta y coordinada:
  releer de la base antes de reemplazar; ADR propios desde el 010.
- Despliegue: `main` → preview READY; producción es `master` (PR #247). El
  código de este cierre necesita el PR `main → master`.
- Última migración reconciliada: `20260923133809`.

## 2026-09-23 · F-61, costo de ventas (16:50–17:10 UTC)

- Reconciliadas 24 migraciones ajenas (gosec, fase_d, f5–f9); ninguna toca el
  costo de ventas.
- La premisa del mandato no se sostiene: ninguna org tiene inventory/confirmed
  y el kardex ya contabiliza el costo. Sembrar la regla lo duplicaba.
- `20260923170107 costo_de_ventas_un_solo_camino` (+ rollback): disparador de
  sale_items deshabilitado; 99/99 rechazos resueltos con su asiento del kardex;
  v_salud_contable solo abiertos. ADR-CC-010.
- Venta de prueba en la 149: un devengo y un solo costo. 0 rechazos abiertos.
- Última migración reconciliada: `20260923170107`.
