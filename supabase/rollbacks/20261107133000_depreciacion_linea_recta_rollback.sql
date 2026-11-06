-- Reversión de 20261107133000_depreciacion_linea_recta.sql
-- Advertencia: no revierte asientos ni filas de asset_depreciations ya creadas; un asiento
-- publicado se revierte con su contra-asiento. El índice único y el CHECK se quitan.

drop function if exists public.fn_depreciar_mes(integer, date);
drop function if exists public.fn_depreciacion_estado(integer);
drop function if exists public.fn_depreciacion_bloqueo(public.fixed_assets);
drop trigger if exists trg_activo_con_depreciacion on public.fixed_assets;
drop function if exists public.fn_trg_activo_con_depreciacion();
alter table public.fixed_assets drop constraint if exists fixed_assets_metodo_disponible_check;
drop index if exists public.asset_depreciations_activo_mes_uq;
