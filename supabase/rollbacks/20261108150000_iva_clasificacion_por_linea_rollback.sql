-- Reversión de 20261108150000_iva_clasificacion_por_linea.sql (escrita, no aplicada).
-- ADVERTENCIA: quita las columnas de clasificación y la bitácora: las clasificaciones y evaluaciones del IVA
-- descontable que las personas hayan guardado SE PIERDEN (esta reversión no restaura datos). Si hay que
-- conservarlas, copie antes invoice_items/sale_items (id + columnas iva_*) e iva_clasificacion_cambios.
-- Ningún importe, impuesto ni total depende de estas columnas: los documentos quedan igual.
-- Revertir antes 20261108151000 (el borrador v2 las lee) y 20261108150500.
-- Ronda 3: revertir antes también 20261108152000 (B5): el asiento de compra lee iva_descontable* para llevar el
-- IVA no descontable al costo. Si sigue aplicada, esta reversión se detiene.
-- Ronda 4: también quita iva_soporte_aduanero (soporte de importaciones de la casilla 47); se pierde lo registrado.

do $do$
begin
  if to_regprocedure('public.fn_iva_no_descontable_linea(uuid)') is not null then
    raise exception 'Revierta primero 20261108152000_iva_no_descontable_al_costo (usa estas columnas)';
  end if;
end;
$do$;

drop trigger if exists trg_zz_iva_clasificacion on public.invoice_items;
drop trigger if exists trg_zz_iva_clasificacion on public.sale_items;
drop function if exists public.fn_iva_clasificacion_linea_trg();
drop function if exists public.fn_iva_clasificar_linea(integer, text, uuid, jsonb);
drop function if exists public.fn_iva_lineas_documento(integer, text, uuid);
drop function if exists public.fn_iva_sugerencia_linea(integer, integer, text, numeric, numeric, numeric, integer);
drop function if exists public.fn_iva_base_linea(numeric, numeric, numeric, boolean, numeric);
drop table if exists public.iva_clasificacion_cambios;

alter table public.invoice_items
  drop column if exists iva_tratamiento,
  drop column if exists iva_tarifa,
  drop column if exists iva_tipo_operacion,
  drop column if exists iva_fundamento,
  drop column if exists iva_soporte_tipo,
  drop column if exists iva_soporte_numero,
  drop column if exists iva_soporte_fecha,
  drop column if exists iva_clasificacion_origen,
  drop column if exists iva_clasificado_por,
  drop column if exists iva_clasificado_en,
  drop column if exists iva_soporte_aduanero,
  drop column if exists iva_descontable,
  drop column if exists iva_descontable_porcentaje,
  drop column if exists iva_descontable_motivo,
  drop column if exists iva_descontable_evaluado_por,
  drop column if exists iva_descontable_evaluado_en;

alter table public.sale_items
  drop column if exists iva_tratamiento,
  drop column if exists iva_tarifa,
  drop column if exists iva_tipo_operacion,
  drop column if exists iva_fundamento,
  drop column if exists iva_soporte_tipo,
  drop column if exists iva_soporte_numero,
  drop column if exists iva_soporte_fecha,
  drop column if exists iva_clasificacion_origen,
  drop column if exists iva_clasificado_por,
  drop column if exists iva_clasificado_en;
