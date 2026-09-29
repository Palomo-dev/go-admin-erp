-- Reversión de 20260929170200_inv_b8_3_factura_lotes_seriales.sql.
-- Revertir antes que 20260929170100_inv_b8_2_recepcionar.
-- Vuelve a crear los seriales de la factura al GUARDAR y deja la recepción de la
-- factura sin lotes. Las recepciones, lotes y seriales ya creados no se tocan.
-- fn_oc_recepcionar vuelve a su versión de 20260929170100 (reaplicar su
-- sección 3 si se revierte solo esta migración), porque la de esta migración
-- usa los ayudantes que aquí se borran.

-- 1. Definiciones exactas anteriores de fn_fc_guardar_int, fn_fc_recepcionar_int(uuid)
--    y fn_fc_confirmar_int(uuid, boolean, boolean, uuid).
do $$
declare
  v_fila record;
begin
  for v_fila in
    select firma, definicion from private.respaldo_funciones
     where migracion = '20260929170200_inv_b8_3'
  loop
    execute v_fila.definicion;
  end loop;
end $$;

revoke all on function public.fn_fc_recepcionar_int(uuid) from public, anon, authenticated;
revoke all on function public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid) from public, anon, authenticated;

-- 2. Sobrecargas con lotes y ayudantes.
drop function if exists public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb);
drop function if exists public.fn_factura_compra_recepcionar(uuid, jsonb);
drop function if exists public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid, jsonb);
drop function if exists public.fn_fc_recepcionar_int(uuid, jsonb);

-- 3. fn_oc_recepcionar sin los ayudantes: reaplicar la sección 3 de
--    supabase/migrations/20260929170100_inv_b8_2_recepcionar.sql ANTES de borrarlos
--    (o revertir también esa migración con su rollback).
drop function if exists public.fn_inv_int_seriales_de_recepcion(integer, integer, integer, integer, integer, integer, uuid, numeric, integer, text[]);
drop function if exists public.fn_inv_int_lote_de_recepcion(integer, integer, integer, integer, jsonb);

delete from private.respaldo_funciones where migracion = '20260929170200_inv_b8_3';
