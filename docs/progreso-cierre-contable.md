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
