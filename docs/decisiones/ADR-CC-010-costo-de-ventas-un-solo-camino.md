# ADR-CC-010 · El costo de ventas tiene un solo camino: el kardex

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923170107`) · **Hallazgo:** F-61

## Contexto

F-61 registró 99 rechazos `no_rule` de `fn_auto_journal_sale_item_cogs` (org 137:
2, org 144: 97) y el mandato pidió sembrar la regla `inventory/confirmed` «que usa
la mayoría de las organizaciones» y generar los asientos faltantes.

Lo medido contradice la premisa:

- **Ninguna** organización tiene regla `inventory/confirmed`; las 85 tienen
  `inventory/adjusted` (`6105/1405` en el plan por defecto).
- El costo de ventas **ya se contabiliza**: `fn_auto_journal_stock_movement`
  asienta cada salida de inventario por venta (`sale`, `web_sale`, `mesa_sale`,
  `invoice_sale`, `folio_item`, `room_consumption`) como `6105 D / 1405 C`, con
  la subcuenta de la sucursal. Hay 3.776 asientos así en 15 organizaciones. En
  los productos con receta, el costo sale por cada ingrediente.
- De los 99 rechazos, **96** tienen su salida en el kardex por el mismo importe
  exacto y **3** son productos sin inventario propio (recetas) cuyo costo salió
  por sus ingredientes.
- `fn_auto_journal_sale_item_cogs` **nunca** escribió un asiento (0 con
  `source='sale_items'`).

## Opciones

1. Sembrar `inventory/confirmed` y regenerar los 99 asientos (lo pedido):
   duplicaría el costo de ventas en toda organización con costos, desde el
   primer día.
2. Quitar el costo del kardex y dejarlo en `sale_items`: el kardex cubre todos
   los canales, las recetas por ingrediente y las subcuentas por sucursal;
   `sale_items` no.
3. **Un solo camino, el kardex**, y deshabilitar el disparador redundante.

## Decisión

Opción 3 (criterio 1: un asiento por hecho).

- `trg_auto_journal_sale_item_cogs` deshabilitado. La función se conserva para
  la reversión.
- `journal_entry_failures` gana `resolved_at`, `resolved_entry_id` y
  `resolution`. Los 99 rechazos quedan resueltos, apuntando al asiento del
  kardex que ya contabiliza su costo; `v_salud_contable` cuenta solo los
  abiertos.
- No se siembra `inventory/confirmed` en ninguna organización.

## Consecuencias

- Venta de prueba en la org 149 (2 × 11.900, costo promedio 5.000): un devengo
  `1305 D 23.800 / 2405 C 3.800 / 4105 C 20.000` y **un** costo
  `6105-01 D 10.000 / 1405-01 C 10.000`, del kardex.
- El costo del kardex no lleva `fact_key`: su idempotencia es la comprobación
  por `source_id` que hace la propia función. Queda como mejora.
- El hueco real de costo no es de reglas: 723 salidas por venta con costo 0
  (org 142: 612, 144: 93, 134: 17, 120: 1) no generan asiento porque el
  producto no tiene costo cargado (F-36).
