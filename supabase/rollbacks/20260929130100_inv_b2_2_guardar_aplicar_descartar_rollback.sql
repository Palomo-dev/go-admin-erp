-- Reversión de 20260929130100_inv_b2_2_guardar_aplicar_descartar.sql
-- Quita fn_ajuste_guardar, fn_ajuste_aplicar y fn_ajuste_descartar, y restaura
-- byte a byte fn_auto_journal_inventory_adjustment() desde el respaldo que la
-- migración guardó en private.respaldo_funciones.
-- Advertencias:
--   * Los ajustes ya aplicados por estas funciones conservan sus movimientos y su
--     asiento (no se revierten datos).
--   * Con la función anterior, el asiento de un ajuste vuelve a valorarse como
--     «promedio de costos × suma de cantidades».

drop function if exists public.fn_ajuste_guardar(integer, jsonb);
drop function if exists public.fn_ajuste_aplicar(integer, integer, text);
drop function if exists public.fn_ajuste_descartar(integer, integer, text);

do $$
declare
  r record;
begin
  select definicion, md5 into r from private.respaldo_funciones
   where migracion = '20260929130100_inv_b2_2' and firma = 'fn_auto_journal_inventory_adjustment()';
  if r.definicion is null then
    raise exception 'No hay respaldo de 20260929130100_inv_b2_2';
  end if;
  if md5(r.definicion) <> r.md5 then
    raise exception 'El respaldo no coincide con su md5';
  end if;
  execute r.definicion;
end $$;
