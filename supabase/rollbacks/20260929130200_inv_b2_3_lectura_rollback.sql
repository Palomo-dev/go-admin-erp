-- Reversión de 20260929130200_inv_b2_3_lectura.sql
-- Quita las funciones de lectura de ajustes y deshace, por marcador, el parche de
-- fn_inv_documentos (vuelve a numerar 'AJ-' || id). Se deshace por marcador y no
-- restaurando el respaldo completo para no pisar parches posteriores de otros
-- bloques sobre la misma función. No toca datos.

drop function if exists public.fn_ajuste_productos(integer, integer, text, integer[], integer);
drop function if exists public.fn_ajuste_detalle(integer, integer);
drop function if exists public.fn_ajustes_listado(integer, jsonb);
drop function if exists public.fn_ajuste_int_nombre(uuid);

do $$
declare
  v_def text := pg_get_functiondef('public.fn_inv_documentos(integer,jsonb)'::regprocedure);
  v_m1 constant text := 'select a.id into v_x from public.inventory_adjustments a where a.id = v_int and a.organization_id = p_org;';
  v_n1 constant text := 'select a.id, a.code into v_x from public.inventory_adjustments a where a.id = v_int and a.organization_id = p_org;';
  v_m2 constant text := E'v_num := ''AJ-'' || v_x.id;';
  v_n2 constant text := E'v_num := coalesce(v_x.code, ''AJ-'' || v_x.id);';
begin
  if position(v_n1 in v_def) = 0 then
    return; -- no estaba aplicado
  end if;
  execute replace(replace(v_def, v_n1, v_m1), v_n2, v_m2);
end $$;
