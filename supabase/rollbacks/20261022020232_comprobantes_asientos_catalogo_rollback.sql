-- Reversa de 20261022020232_comprobantes_asientos_catalogo.
--
-- Ultima de la fase 5. Antes hay que revertir, en este orden:
--   20261022020752, 20261022020701, 20261022020425 y 20261022020351.
--
-- No restaura valores. Si despues del despliegue alguien guardo una cuenta
-- en un producto, una categoria o una linea, o un consecutivo de comprobante,
-- al quitar la columna o la tabla ese valor se pierde. Los asientos ya
-- publicados no se borran: sus columnas de comprobante y tercero vuelven
-- a no existir.

drop function if exists public.fn_documento_lineas_json_tienen_cuenta(integer, jsonb, text);
drop function if exists public.fn_documento_tiene_cuenta_propia(integer, uuid, text);
drop function if exists public.fn_bloqueo_tercero_documento(integer, integer, text, uuid);
drop function if exists public.fn_tercero_de_documento(text, uuid);
drop function if exists public.fn_exigencias_cuenta(integer, text);
drop function if exists public.fn_cuenta_catalogo_linea(integer, integer, text, text);
drop function if exists public.fn_validar_cuenta_movimiento(integer, text);

drop table if exists public.plantillas_asiento_lineas;
drop table if exists public.plantillas_asiento;
drop table if exists public.comprobante_consecutivos;

drop index if exists public.uq_journal_entries_comprobante;
alter table public.journal_entries drop constraint if exists journal_entries_comprobante_tipo_chk;

alter table public.journal_entries
  drop column if exists comprobante_numero,
  drop column if exists comprobante_prefijo,
  drop column if exists comprobante_tipo;
alter table public.journal_lines
  drop column if exists tercero_nombre,
  drop column if exists tercero_nit;
alter table public.invoice_items
  drop column if exists cuenta_contable;
alter table public.products
  drop column if exists cuenta_devolucion,
  drop column if exists cuenta_inventario,
  drop column if exists cuenta_costo,
  drop column if exists cuenta_ingreso;
alter table public.categories
  drop column if exists cuenta_devolucion,
  drop column if exists cuenta_inventario,
  drop column if exists cuenta_costo,
  drop column if exists cuenta_ingreso;
