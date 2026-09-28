# ADR-CC-005 · Permisos de las funciones que escriben contabilidad y facturas

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923081953`)

## Contexto

El mandato pedía revocar `EXECUTE` de `anon` y `authenticated` en
`fn_create_journal_entry`, `assistant_register_sales_invoice`,
`assistant_register_purchase_invoice` y `fn_sync_invoice_items_from_sale`, y
mover a servidor con `service_role` cualquier llamada desde el cliente.

Lo medido:

| Función | Tipo | Quién la llama |
|---|---|---|
| `fn_create_journal_entry` (+ `_with_discount`) | SECURITY DEFINER | solo disparadores |
| `assistant_register_*_invoice` | **SECURITY INVOKER** | GO Assistant, con el cliente de **sesión** del usuario, a propósito: sus tests afirman que no usa `service_role` |
| `fn_sync_invoice_items_from_sale` | SECURITY DEFINER, **sin guarda** | `NuevaFacturaForm` (navegador), como respaldo si el insert de líneas falla |

## Decisión

- `fn_create_journal_entry` y `_with_discount`: solo `service_role`. Nadie
  fuera de los disparadores las llama. Cierra F-47.
- `assistant_register_*_invoice`: fuera `anon`; se mantiene `authenticated`.
  Son INVOKER: corren con la RLS de quien llama, y pasarlas a `service_role`
  rompería el diseño del asistente (ADR-002 del asistente: la sesión, no la
  llave de servicio). Con `anon` fuera no quedan abiertas sin sesión.
- `fn_sync_invoice_items_from_sale`: se le agrega **guarda de pertenencia**
  (`auth.uid()` miembro activo de la organización de la factura, o
  `service_role`), fuera `anon` y `PUBLIC`, y se mantiene `authenticated`. Es
  el cambio más pequeño que cierra la escritura entre inquilinos sin mover una
  ruta del navegador en medio de otro trabajo sobre ese formulario.

## Consecuencias

- Queda como deuda llevar el respaldo de `NuevaFacturaForm` a un route handler,
  o quitarlo: con la RLS actual el insert directo de líneas funciona.
- `authenticated` conserva `EXECUTE` en tres funciones, pero ninguna permite ya
  escribir en otra organización: dos por RLS y una por su guarda.
