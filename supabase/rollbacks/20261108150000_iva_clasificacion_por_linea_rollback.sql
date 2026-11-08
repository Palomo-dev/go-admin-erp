-- Reversión de 20261108150000_iva_clasificacion_por_linea.sql (escrita, no aplicada).
-- ADVERTENCIA: quita las columnas de clasificación y la bitácora: las clasificaciones y evaluaciones del IVA
-- descontable que las personas hayan guardado SE PIERDEN (esta reversión no restaura datos). Si hay que
-- conservarlas, copie antes invoice_items/sale_items (id + columnas iva_*) e iva_clasificacion_cambios.
-- Ningún importe, impuesto ni total depende de estas columnas: los documentos quedan igual.
-- Revertir antes 20261108151000 (el borrador v2 las lee) y 20261108150500.

drop trigger if exists trg_zz_iva_clasificacion on public.invoice_items;
drop trigger if exists trg_zz_iva_clasificacion on public.sale_items;
drop function if exists public.fn_iva_clasificacion_linea_trg();
drop function if exists public.fn_iva_clasificar_linea(integer, text, uuid, jsonb);
drop function if exists public.fn_iva_lineas_documento(integer, text, uuid);
drop function if exists public.fn_iva_sugerencia_linea(integer, integer, text, numeric, numeric, numeric, integer);
drop function if exists public.fn_iva_base_linea(numeric, numeric, numeric, boolean, numeric);
drop table if exists public.iva_clasificacion_cambios;
drop index if exists public.invoice_items_iva_descontable_periodo_idx;

alter table public.invoice_items
  drop column if exists iva_tratamiento,
  drop column if exists iva_tarifa,
  drop column if exists iva_tipo_operacion,
  drop column if exists iva_fundamento,
  drop column if exists iva_clasificacion_origen,
  drop column if exists iva_clasificado_por,
  drop column if exists iva_clasificado_en,
  drop column if exists iva_descontable,
  drop column if exists iva_descontable_porcentaje,
  drop column if exists iva_descontable_motivo,
  drop column if exists iva_descontable_periodo,
  drop column if exists iva_descontable_evaluado_por,
  drop column if exists iva_descontable_evaluado_en;

alter table public.sale_items
  drop column if exists iva_tratamiento,
  drop column if exists iva_tarifa,
  drop column if exists iva_tipo_operacion,
  drop column if exists iva_fundamento,
  drop column if exists iva_clasificacion_origen,
  drop column if exists iva_clasificado_por,
  drop column if exists iva_clasificado_en;
