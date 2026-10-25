-- IMPORTANTE: correr con el período de OCTUBRE 2026 ABIERTO.
-- Rollback de 20261025134140 (org 113). Los asientos 1573/1574 NO se "des-revierten" borrando: se revierte la
-- reversa (contraasiento del contraasiento) y las 2 comisiones vuelven a 'accrued' (el CHECK de 134100 lo rechaza:
-- revertir este rollback SOLO junto con el de 134100 o con el CHECK ya quitado; si el CHECK sigue, aborta sin cambios).
do $$
declare r record;
begin
  for r in select * from public.p1_puc_bitacora where migracion = '134140' order by id desc loop
    if r.objeto = 'commissions' then
      -- sin disparar el contraasiento de anulación ni una nueva causación
      alter table public.commissions disable trigger user;
      update public.commissions set status = r.valor_anterior, updated_at = now() where id::text = r.clave;
      alter table public.commissions enable trigger user;
    elsif r.objeto = 'journal_entries' then
      perform public.fn_revertir_asiento(r.clave::integer, 'rollback-134140', 'puc_migracion');
    end if;
  end loop;
  delete from public.p1_puc_bitacora where migracion = '134140';
exception when others then
  alter table public.commissions enable trigger user;
  raise;
end $$;
delete from supabase_migrations.schema_migrations where version = '20261025134140';
