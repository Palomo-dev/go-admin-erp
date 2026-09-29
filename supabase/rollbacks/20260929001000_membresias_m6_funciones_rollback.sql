-- Rollback de 20260929001000_membresias_m6_funciones.sql
--
-- Orden: revertir antes 20260929001200 (cron) y 20260929001100 (enganche en las funciones de venta):
-- pos_checkout_v1 y compañía llaman a fn_membresias_activar_venta / fn_membresias_revertir_linea y
-- plpgsql no registra esa dependencia, así que borrarlas primero rompería el cobro.
-- No revierte datos: las membresías, eventos, congelamientos y entradas creados se quedan.

-- fn_auto_journal_membership vuelve a su definición anterior (se quita el bloque R4).
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_membership()'::regprocedure);
  v_bloque text := E'    -- Membresías (20260929001000): las del modelo nuevo las contabiliza su venta o factura.\n'
                || E'    IF NEW.source IS NOT NULL OR NEW.sale_item_id IS NOT NULL THEN\n'
                || E'        RETURN NEW;\n'
                || E'    END IF;\n\n';
begin
  if position(v_bloque in v_def) = 0 then
    return;
  end if;
  execute replace(v_def, v_bloque, '');
end $$;

drop function if exists public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer);
drop function if exists public.fn_membresia_cancelar(integer, text);
drop function if exists public.fn_membresia_descongelar(integer);
drop function if exists public.fn_membresia_congelar(integer, date, date, text);
drop function if exists public.fn_membresias_vencer_todas();
drop function if exists public.fn_membresias_vencer(integer);
drop function if exists public.fn_membresias_revertir_producto(uuid, integer, numeric, text, jsonb);
drop function if exists public.fn_membresias_revertir_linea(uuid, numeric, text, jsonb);
drop function if exists public.fn_membresias_activar_venta(uuid, uuid, text, boolean);
drop function if exists public.fn_membresias_int_activar(integer, boolean);
drop function if exists public.fn_membresias_int_evento(integer, integer, text, text, jsonb, jsonb, jsonb);
drop function if exists public.fn_membresias_int_pagada(uuid, uuid);
drop function if exists public.fn_membresias_int_snapshot(integer, integer);
drop function if exists public.fn_membresias_int_restar(timestamptz, text, integer, integer, text);
drop function if exists public.fn_membresias_int_fin(timestamptz, text, integer, integer, text);
