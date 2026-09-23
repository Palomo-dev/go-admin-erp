# ADR-CC-009 · Una compra se contabiliza una sola vez: con la factura

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923190000`)

## Contexto

Una recepción completa de orden de compra podía producir hasta cuatro
asientos del mismo hecho:

| # | Disparador | Qué hacía |
|---|---|---|
| 1 | `fn_auto_journal_stock_movement` | No excluía los orígenes `purchase_order`, `purchase_invoice`, `transfer_out` ni `transfer_in` (admitidos por el CHECK desde `20260923100000`): cada renglón recibido era un «ajuste» 1405/6105 |
| 2 | `fn_auto_journal_purchase_order` | 1405 D / 2105 C por el total al pasar la orden a `received` |
| 3 | `fn_auto_journal_purchase` | Devengo de la factura (ADR-CC-006): inventario + IVA contra la cuenta que salda el pago, clave `accrual:purchase:{id}` |
| 4 | `fn_auto_journal_ap` | 1405 D / 2105 C otra vez al insertar la cuenta por pagar |

Había 0 recepciones, así que (1) y (2) no habían hecho daño. (4) sí: 52
asientos en 7 organizaciones (F-59).

## Decisión (del dueño)

**La compra se contabiliza solo con la factura del proveedor.** La recepción
mueve el kardex, no el libro. Se descartó el esquema de dos asientos
(recepción contra «mercancía recibida por facturar» + factura que salda la
cuenta puente): exige crear y conciliar una cuenta puente en las 85
organizaciones.

- `trg_auto_journal_ap` deshabilitado (espejo de `trg_auto_journal_ar`,
  deshabilitado en ventas por ADR-CC-001).
- `trg_auto_journal_purchase_order` deshabilitado.
- `fn_auto_journal_stock_movement` excluye compras y traslados.
- Las funciones se conservan (comentadas) para poder revertir.
- Histórico: 52 contra-asientos con `fn_revertir_asiento`, lote
  `compras-un-hecho-2026-09-23`, categoría `CC-009` en `journal_reversals` y un
  `journal_reversal_runs` por organización con saldos antes y después.

## Consecuencias

- Una recepción sin factura al cierre del mes deja el inventario del libro
  por debajo del kardex hasta que la factura llegue. Es el costo asumido de un
  solo asiento; el reporte de cuadre kardex ↔ libro debe mostrarlo.
- Una orden de compra que se reciba sin crear factura no genera asiento. El
  flujo de recepción (docs/design/AUDITORIA-CARTERA-ORDENES-COMPRA.md) propone
  crear la factura al completar la orden con el número del proveedor.
- Guardarraíl 26 en `src/__tests__/guardrails.test.ts`.
