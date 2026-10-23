-- Revierte la carga inicial.
--
-- 1. Si ya hay asientos PUBLICADOS con fact_key carga_inicial:<org>:<sede>:<id>
--    (los de una carga nueva, no los borradores), este script les hace el
--    contra-asiento con fn_revertir_asiento. El periodo tiene que estar abierto.
--    Un borrador no se revierte así: se borra.
-- 2. Borra los borradores carga_inicial_borrador:<org> que sigan sin publicar,
--    sus líneas y la marca de cobertura.
-- 3. Quita el disparador diferido y devuelve las cuatro funciones al respaldo
--    de esta migración (el asiento por movimiento de stock, el ajuste, y la
--    configuración de inventario).
-- 4. Elimina las funciones y tablas nuevas. El respaldo de las funciones se
--    conserva para poder volver a aplicar este rollback.
--
-- No toca los borradores ni las tablas de la corrección de flujo anterior.

do $rev$
declare
  r record;
begin
  for r in
    select je.id
    from public.journal_entries je
    where je.posted is true
      and je.fact_key like 'carga_inicial:%'
      and je.fact_key not like 'carga_inicial_borrador:%'
      and not exists (
        select 1 from public.journal_entries rev
        where rev.organization_id = je.organization_id
          and rev.fact_key = 'reversal:' || je.id::text
      )
  loop
    perform public.fn_revertir_asiento(r.id, 'carga_inicial', 'rollback');
  end loop;
end
$rev$;

delete from public.journal_lines jl
using public.journal_entries je
where jl.journal_entry_id = je.id
  and je.posted is false
  and je.fact_key like 'carga_inicial_borrador:%';

delete from public.carga_inicial_cubierta c
using public.journal_entries je
where c.journal_entry_id = je.id
  and je.posted is false
  and je.fact_key like 'carga_inicial_borrador:%';

delete from public.journal_entries
where posted is false
  and fact_key like 'carga_inicial_borrador:%';

drop trigger if exists trg_carga_inicial_cerrar on public.stock_movements;

do $restaurar$
declare
  r record;
begin
  if to_regclass('public.carga_inicial_funcion_respaldo') is null then
    raise exception 'falta carga_inicial_funcion_respaldo';
  end if;
  for r in
    select definicion
    from public.carga_inicial_funcion_respaldo
    where migracion = '20261023180000'
    order by case
      when firma like 'fn_auto_journal_stock_movement%' then 1
      when firma like 'fn_auto_journal_inventory_adjustment%' then 2
      else 3
    end
  loop
    execute r.definicion;
  end loop;
end
$restaurar$;

drop function if exists public.fn_carga_inicial_cerrar();
drop function if exists public.fn_carga_inicial_publicar();
drop function if exists public.fn_carga_inicial_borradores();
drop function if exists public.fn_carga_inicial_cuentas(integer, integer);
drop function if exists public.fn_carga_inicial_cuenta(integer, integer, text);

drop table if exists public.carga_inicial_pendiente;
drop table if exists public.carga_inicial_cubierta;
drop table if exists public.carga_inicial_aviso;
