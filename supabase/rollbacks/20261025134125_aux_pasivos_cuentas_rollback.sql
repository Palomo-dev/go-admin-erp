-- Rollback de 20261025134125. Revertir ANTES 134140, 134135 y 134130.
-- 1. tax_account_mapping vuelve a 23650501/23650502 (bitácora). 2. Borra las cuentas creadas (bitácora 'cuenta_nueva'),
-- hijos antes que padres. Las que ya tienen líneas contabilizadas revertidas (saldo 0, p. ej. 22050501 tras revertir
-- la reclasificación de 2205) NO se pueden borrar (líneas inmutables): quedan en el plan con aviso. Con saldo o
-- borradores, aborta.
do $$
declare r record;
begin
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;  -- AJUSTE: antes del DISABLE TRIGGER
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select * from public.p1_puc_bitacora where migracion = '134125' and objeto = 'cuenta_nueva'
            order by length(clave) desc, id desc loop
    if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave)
       or exists (select 1 from public.chart_of_accounts h where h.organization_id = r.organization_id and h.parent_code = r.clave) then
      if coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is true), 0) <> 0
         or exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                     where l.organization_id = r.organization_id and l.account_code = r.clave and e.posted is not true) then
        raise exception 'rollback 134125: org % cuenta % tiene saldo o borradores; revertir antes 134135', r.organization_id, r.clave;
      end if;
      raise notice 'rollback 134125: org % cuenta % queda en el plan (movimientos revertidos, saldo 0)', r.organization_id, r.clave;
      continue;
    end if;
    delete from public.chart_of_accounts where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  for r in select * from public.p1_puc_bitacora where migracion = '134125' and objeto = 'tax_account_mapping' order by id desc loop
    update public.tax_account_mapping set account_code = r.valor_anterior, updated_at = now() where id::text = r.clave;
  end loop;
  -- AJUSTE: mapeos nuevos RETE_11_COMISION, plantilla nueva (solo si nadie la usa) y nombre de RETE_11.
  for r in select * from public.p1_puc_bitacora where migracion = '134125' and objeto = 'tax_account_mapping_nuevo' order by id desc loop
    delete from public.tax_account_mapping where id::text = r.clave;
  end loop;
  if exists (select 1 from public.p1_puc_bitacora where migracion = '134125' and objeto = 'tax_template_nuevo') then
    if exists (select 1 from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                where tt.code = 'RETE_11_COMISION')
       or exists (select 1 from public.tax_account_mapping m join public.tax_templates tt on tt.id = m.tax_template_id
                   where tt.code = 'RETE_11_COMISION') then
      raise exception 'rollback 134125: la plantilla RETE_11_COMISION ya está en uso; quitarla de las orgs antes';
    end if;
    delete from public.tax_templates where code = 'RETE_11_COMISION';
  end if;
  for r in select * from public.p1_puc_bitacora where migracion = '134125' and objeto = 'tax_templates' order by id desc loop
    update public.tax_templates set name = r.valor_anterior, updated_at = now() where code = r.clave;
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  delete from public.p1_puc_bitacora where migracion = '134125';
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
drop function if exists public.fn_pasivos_asegurar_auxiliares(integer, text);
delete from supabase_migrations.schema_migrations where version = '20261025134125';
