-- Rollback de 20261025134070. Revertir ANTES 134085, 134080 y 134075 (en ese orden).
-- Borra solo las cuentas que creó 134070 (bitácora) y que no tienen líneas; hijos antes que padres.
do $$
declare r record;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select b.organization_id, b.clave from public.p1_puc_bitacora b
            where b.migracion = '134070' and b.objeto = 'cuenta'
            order by length(b.clave) desc loop
    if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave) then
      raise exception 'rollback 134070: org % cuenta % tiene líneas; no se borra', r.organization_id, r.clave;
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
