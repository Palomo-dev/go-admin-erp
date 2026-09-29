-- Reversión de 20260929020700_inv_b0_8_primitiva_escala.sql
-- Restaura fn_inv_int_mover y fn_inv_int_mover_fila a la versión de
-- 20260929020200_inv_b0_3_primitiva.sql desde private.respaldo_funciones.
-- No toca datos.

do $$
declare
  r record;
begin
  if not exists (select 1 from private.respaldo_funciones where migracion = '20260929020700_inv_b0_8') then
    raise exception 'No hay respaldo de 20260929020700_inv_b0_8 en private.respaldo_funciones';
  end if;
  for r in select firma, definicion, md5 from private.respaldo_funciones where migracion = '20260929020700_inv_b0_8' loop
    if md5(r.definicion) <> r.md5 then
      raise exception 'El respaldo de % no coincide con su md5', r.firma;
    end if;
    execute r.definicion;
  end loop;
end $$;

revoke all on function public.fn_inv_int_mover_fila(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) from anon, public, authenticated;
revoke all on function public.fn_inv_int_mover(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) from anon, public, authenticated;
