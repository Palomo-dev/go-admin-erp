-- Rollback de 20260928172526_cotizaciones_servidor.sql
--
-- ADVERTENCIA: no revierte datos. Las cotizaciones guardadas, duplicadas o
-- convertidas con estas funciones siguen como quedaron; las facturas borrador
-- nacidas de una conversión siguen existiendo (y pierden su quotation_id al
-- quitar la columna). El código de la app llama a estas RPC: revertir la base
-- sin revertir el código deja las rutas de cotizaciones en 500.

drop function if exists public.fn_cotizaciones_listado(integer, jsonb);
drop function if exists public.fn_cotizacion_convertir(integer, uuid, text, integer, uuid, numeric);
drop function if exists public.fn_cotizacion_duplicar(integer, uuid, date);
drop function if exists public.fn_cotizacion_eliminar(integer, uuid);
drop function if exists public.fn_cotizacion_cambiar_estado(integer, uuid, text);
drop function if exists public.fn_cotizacion_guardar(integer, uuid, jsonb);
drop function if exists public.fn_cotizacion_recalcular(uuid);
drop function if exists public.fn_cotizacion_estado_vivo(text, date, date);
drop function if exists public.fn_cotizacion_numero(integer, integer);

drop index if exists public.uq_quotations_org_number;

drop index if exists public.idx_invoice_sales_quotation;
alter table public.invoice_sales drop column if exists quotation_id;
