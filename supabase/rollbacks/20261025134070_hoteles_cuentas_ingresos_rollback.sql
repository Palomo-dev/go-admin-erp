-- Rollback de 20261025134070. Revertir ANTES 134085, 134080 y 134075 (en ese orden).
-- Borra las cuentas que creó 134070 (bitácora), hijos antes que padres. Las que ya tienen líneas (contabilizadas y
-- revertidas, saldo 0) quedan en el plan con aviso: las líneas contabilizadas no se pueden borrar.
do $$
declare r record;
begin
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select b.organization_id, b.clave from public.p1_puc_bitacora b
            where b.migracion = '134070' and b.objeto = 'cuenta'
            order by length(b.clave) desc loop
    if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave)
       or exists (select 1 from public.chart_of_accounts h where h.organization_id = r.organization_id and h.parent_code = r.clave) then
      -- Las líneas contabilizadas son inmutables: tras revertir los asientos (contraasiento) la cuenta queda con
      -- saldo 0 y NO se puede borrar. Se deja en el plan (con aviso); si tuviera saldo o borradores, se aborta.
      if coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is true), 0) <> 0
         or exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                     where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is not true) then
        raise exception 'rollback %: org % cuenta % tiene saldo o borradores; revertir antes las migraciones posteriores', '134070', r.organization_id, r.clave;
      end if;
      raise notice 'rollback %: org % cuenta % queda en el plan (movimientos revertidos, saldo 0)', '134070', r.organization_id, r.clave;
      continue;
    end if;
    delete from public.chart_of_accounts where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  delete from public.p1_puc_bitacora where migracion = '134070';
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
drop function if exists public.fn_hoteles_asegurar_cuentas_ingreso(integer, text);

delete from supabase_migrations.schema_migrations where version = '20261025134070';
