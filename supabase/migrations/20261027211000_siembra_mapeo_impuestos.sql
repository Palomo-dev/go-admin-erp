-- Siembra del mapeo de impuestos para orgs NUEVAS con las cuentas del contador. SIN APLICAR (pendiente de QA).
-- Nunca siembra 23170501, 23650501, 23650502 ni 24080503 (inexistentes / nómina). IVA_0 (exento) no lleva cuenta.
--   IVA_19 → 24080501, IVA_5 → 24080502, RETE_4 → 23652501, RETE_11 → 23651501, RETE_11_COMISION → 23652001,
--   ICA_0.966 → 23680501. Las auxiliares que falten se crean con fn_puc_asegurar_cuenta (clase 2 = crédito).
-- Se engancha al alta de la org (trg_fn_sembrar_configuracion_contable, que corre después del PUC) y no puede
-- tumbar el alta (WARNING). Requiere 20261027210000 (plantilla RETE_11_COMISION).
-- Rollback: supabase/rollbacks/20261027211000_siembra_mapeo_impuestos_rollback.sql
create or replace function public.fn_sembrar_mapeo_impuestos(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  for r in
    select tt.id, v.cuenta, v.nombre
      from (values
        ('IVA_19',           '24080501', 'IVA generado 19%'),
        ('IVA_5',            '24080502', 'IVA generado 5%'),
        ('RETE_4',           '23652501', 'Retención servicios'),
        ('RETE_11',          '23651501', 'Retención honorarios'),
        ('RETE_11_COMISION', '23652001', 'Retención comisiones'),
        ('ICA_0.966',        '23680501', 'ReteICA por pagar')
      ) v(code, cuenta, nombre)
      join public.tax_templates tt on tt.code = v.code
     where not exists (select 1 from public.tax_account_mapping m
                        where m.organization_id = p_org and m.tax_template_id = tt.id)
  loop
    continue when public.fn_puc_asegurar_cuenta(p_org, r.cuenta, r.nombre, true) is null;
    insert into public.tax_account_mapping (organization_id, tax_template_id, account_code, account_type, is_active)
    values (p_org, r.id, r.cuenta, 'tax_payable', true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_sembrar_mapeo_impuestos(integer) from public, anon;
grant execute on function public.fn_sembrar_mapeo_impuestos(integer) to authenticated, service_role;

create or replace function public.trg_fn_sembrar_configuracion_contable()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  begin
    perform public.fn_sembrar_mapeo_impuestos(new.id);
  exception when others then
    raise warning 'fn_sembrar_mapeo_impuestos(%) falló: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
