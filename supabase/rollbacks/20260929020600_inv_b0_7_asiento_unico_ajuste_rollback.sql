-- Reversión de 20260929020600_inv_b0_7_asiento_unico_ajuste.sql
-- Restaura byte a byte fn_auto_journal_stock_movement() desde el respaldo que la
-- migración guardó en private.respaldo_funciones (md5 69a391b031b1b5d2fac0a13e1bd757b7).
-- Advertencia: al revertir, los ajustes vuelven a contabilizarse dos veces
-- (documento + cada movimiento). Los asientos creados mientras estuvo activa no se tocan.

do $$
declare
  r record;
begin
  select definicion, md5 into r from private.respaldo_funciones
   where migracion = '20260929020600_inv_b0_7' and firma = 'fn_auto_journal_stock_movement()';
  if r.definicion is null then
    raise exception 'No hay respaldo de 20260929020600_inv_b0_7';
  end if;
  if md5(r.definicion) <> r.md5 or r.md5 <> '69a391b031b1b5d2fac0a13e1bd757b7' then
    raise exception 'El respaldo no coincide con su md5';
  end if;
  execute r.definicion;
end $$;
