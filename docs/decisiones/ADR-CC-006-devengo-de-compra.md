# ADR-CC-006 · El devengo de compra acredita la cuenta que salda el pago

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923082133`)

## Contexto

Espejo de ADR-CC-001 en compras. `fn_auto_journal_purchase` elegía la regla de
contado (`1405 D / 1110 C`) cuando la compra no era a crédito, y el pago a
proveedor, automatizado el 23-sep en `9dc89ebd`, genera además `2105 D / 1110 C`.
El banco baja dos veces por el mismo pago y 2105 queda negativo. Tampoco tenía
clave del hecho: la idempotencia era `memo LIKE 'Compra %'`, sin organización.

## Decisión

`fn_regla_devengo_compra(org)`: débito = inventario de la regla `purchase`;
crédito = `purchase_payment.debit_account_code` (la cuenta que el pago salda);
impuesto al **débito** (`p_tax_is_credit := false`). Clave
`accrual:purchase:{id}`. Se conserva la comprobación por memo para las compras
contabilizadas antes de tener clave.

Simulación previa sobre las 85 organizaciones con reglas: 73 → `1405/2105/2405`,
11 → `1103/2101/2102`, 1 → `1435/220505/135517`; todas las cuentas existen.

## Consecuencias

- Caso E2E (g) en la org 149: `1405 D 100.000 / 2405 D 19.000 / 2105 C 119.000`.
- Los 45 devengos de compra históricos no se tocan en la reversión: el mandato
  los declara correctos en cuanto al signo del IVA. Los de contado con pago
  registrado quedan con el doble descuento del banco; se inventarían en el
  reporte final como remanente.
