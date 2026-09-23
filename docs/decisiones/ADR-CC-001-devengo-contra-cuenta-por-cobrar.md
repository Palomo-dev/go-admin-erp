# ADR-CC-001 · El devengo de venta debita la cuenta que salda el cobro

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923080135`)

## Contexto

Desde `d8090114` (22-sep) la contabilidad de una venta tiene dos hechos:

- **devengo** (`accrual:sale:{id}`): lo emite `fn_auto_journal_sale` (factura) o
  `fn_auto_journal_sale_pos` (venta), el primero que llegue;
- **cobro** (`settlement:payment:{id}`): lo emite `fn_auto_journal_payment` por
  cada pago completado: `D` Caja/Bancos según el medio de pago, `C` 1305.

Pero el devengo seguía eligiendo la regla de contado (`1105 D`) cuando la venta
no tenía saldo. Una venta de contado quedaba con el dinero dos veces:

```
accrual:sale        1105 D 71.980 / 4105 C 71.980
settlement:payment  1110 D 71.980 / 1305 C 71.980     ← el mismo dinero
```

Caja y Bancos suben por el mismo cobro y 1305 queda negativo. Histórico medido:
2.566 devengos contra 1105 (`invoice_sales` 2.260, `sales` 315) y 2.166 cobros
`1110 D / 1305 C`. En la org 137 se reprodujo el 23-sep a las 03:56 UTC, ya con el
diseño nuevo aplicado.

## Opciones

1. **El cobro se abstiene cuando el devengo fue de contado.** Depende del orden:
   el pedido web inserta el pago *antes* que la venta, y cuando el cobro corre no
   hay devengo que mirar.
2. **El devengo de contado toma la cuenta de dinero del pago.** Una venta puede
   pagarse con varios medios (efectivo + tarjeta): un solo débito no los
   representa.
3. **El devengo siempre debita la cuenta por cobrar; el cobro la salda.**
   No depende del orden ni de qué disparador gane, y el dinero cae en la cuenta
   del medio de pago real.

## Decisión

Opción 3. `fn_regla_devengo_venta(org)` devuelve, para toda organización:

- débito = `credit_account_code` de la regla `sale_payment` activa de menor
  prioridad: **la misma consulta** que usa `fn_auto_journal_payment` para la
  contrapartida del cobro. Lo que el cobro acredita es lo que el devengo debita;
- crédito = cuenta de ingreso (clase 4) de la regla `sale`/`created`;
- impuesto = `tax_account_code` de esa regla, al crédito (`p_tax_is_credit := true`).

Simulado antes de aplicar sobre las 84 organizaciones con reglas: 72 → `1305/4105/2405`,
11 → `1102/4101/2102`, 1 → `130505/413505/240805`; todas las cuentas de débito
existen en su plan contable.

## Consecuencias

- Una venta de contado produce **dos asientos, uno por hecho**: devengo contra
  1305 y cobro de 1305 a Caja/Bancos. El neto es el esperado:
  `D 1105|1110 / C 4105 / C 2405`, y 1305 en cero.
- Los criterios «contado → 1105/1110, crédito → 1305» se cumplen **en saldo**,
  no en el asiento de devengo. Los casos E2E (d), (e) y (j) se verifican así.
- Una venta pagada sin fila en `payments` deja su importe en 1305. Es visible
  como cartera, que es lo correcto: no hay registro de que el dinero entrara
  (19 facturas `paid` sin pagos desde el 1-sep).
- Las reglas `sale` condicionadas por `is_credit` dejan de decidir el débito del
  devengo; siguen aportando la cuenta de ingreso y la de impuesto.
- Reversión: `supabase/rollbacks/20260923080135_…_rollback.sql`.
