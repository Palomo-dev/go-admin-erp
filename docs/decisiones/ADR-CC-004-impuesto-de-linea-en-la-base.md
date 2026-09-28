# ADR-CC-004 · El impuesto de la línea se normaliza en la base

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923081427`)

## Contexto

Escriben `invoice_items` 4 funciones SQL (`pos_checkout_v1`,
`assistant_register_sales_invoice`, `assistant_register_purchase_invoice`,
`fn_sync_invoice_items_from_sale`) y 20 puntos de TypeScript. Ninguna función SQL
escribía `tax_code` y solo 3 rutas TS usaban `taxResolver.ts`. Al 23-sep: 5.642
líneas, 3 con `tax_code`; 283 con tarifa > 0 y `tax_code` NULL; 7 con tarifas que
no son ninguna tarifa (1,4179 · 0,8407 · 19,0002).

El «0 facturas con IVA desde el 21-sep» no era una regresión: las organizaciones
que facturaron esos días nunca tuvieron tarifa configurada.

## Decisión

1. **Un disparador `BEFORE INSERT/UPDATE` en `invoice_items`**
   (`fn_normalizar_impuesto_linea`) cubre las 24 rutas:
   - completa `tax_code` con `fn_codigo_impuesto_linea(org, producto, tarifa)`:
     relación del producto con un impuesto activo de esa tarifa; si no, plantilla
     del país de la organización con esa tarifa, excluidas las retenciones;
   - registra en `invoice_item_tax_audit` la tarifa sin plantilla y el
     `total_line` que no es el bruto (tolerancia 1 peso);
   - **nunca bloquea**: si algo falla, la línea entra y el error queda anotado.
2. **Tarifa 0 sin relación explícita → `tax_code` NULL**, no `IVA_0`. «Exento»
   es una afirmación fiscal ante la DIAN (y distinta de «excluido»); ponerla en
   una línea que simplemente no tiene impuesto configurado sería falsear el
   documento. Se aparta del mandato («0 → IVA_0») por el criterio 1 (corrección):
   NULL con tarifa 0 es el estado «sin impuesto configurado» que la UI advierte.
   Una línea de un producto relacionado explícitamente con «Exento de IVA» sí
   recibe `IVA_0`.
3. **F-51, un solo redondeo**: con impuesto incluido, la base de cada línea es
   `round(bruto / (1 + tasa/100), 2)` y el impuesto sale por resta. Lo aplican
   `fn_recalc_invoice_totals` y `splitGrossLine` de `taxResolver.ts`.
4. `trg_recalc_invoice_totals_upd` solo dispara si cambia un campo que mueve
   importes. Así el relleno de `tax_code` no reescribió cabeceras ya
   contabilizadas (48 habrían cambiado).
5. Las rutas TS de venta pasan por `taxResolver.ts`; las de compra persisten la
   tarifa del documento del proveedor y el disparador les completa el código.

## Consecuencias

- Relleno: 280 líneas → `IVA_19`; 7 anomalías `tarifa_sin_plantilla` y 61
  `total_line_incoherente` históricas quedan en la auditoría para revisión.
- `tax_code` deja de depender de la ruta (cierra F-50).
- La auditoría no tiene políticas RLS: solo `service_role` la lee.
