-- IVA 19 % bien configurado al crear una organización. SIN APLICAR (pendiente de QA y decisión de Juan).
-- Causa (org 358, bitacora_siembra_org 29-oct): fn_sembrar_mapeo_impuestos abortó COMPLETA con 55006
-- "cannot ALTER TABLE chart_of_accounts because it has pending trigger events": el PUC por tipo de org dejó
-- 2365/2368 como cuentas de movimiento; al crear 23652501 bajo un padre de movimiento, fn_puc_asegurar_cuenta
-- hace ALTER TABLE ... DISABLE TRIGGER, y en la misma transacción hay eventos pendientes del constraint trigger
-- diferido trg_chart_cuenta_titulo_configurada. Un solo fallo tumbaba también el mapeo de IVA_19 → 24080501.
-- Cambios:
--   1. Cada impuesto se siembra en su propio bloque (un fallo no arrastra a los demás) y nunca se intenta crear
--      una auxiliar bajo un padre de movimiento (eso es lo que dispara el ALTER TABLE): se omite y se registra.
--   2. IVA_19: cuenta = 2408 si existe y es de movimiento; si no 24080501 (de movimiento); si no, la primera
--      auxiliar de movimiento de pasivo bajo 240805, luego bajo 2408; solo si no hay ninguna se crea 24080501.
--      El mapeo queda con organization_tax_id del impuesto de la org.
--   3. Solo en el ALTA (trigger AFTER INSERT): el IVA 19 % de la org nueva queda con tax_included = true.
--      fn_reintentar_siembra_mapeo NO toca tax_included (orgs existentes).
-- Rollback: volver a 20261027211000 + 20261027211500.

create or replace function public.fn_cuenta_iva19_sugerida(p_org integer)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.account_code
    from public.chart_of_accounts c
   where c.organization_id = p_org
     and coalesce(c.is_active, true)
     and c.es_movimiento is true
     and c.type = 'liability'
     and c.account_code like '2408%'
   order by case
              when c.account_code = '2408' then 0
              when c.account_code = '24080501' then 1
              when c.account_code like '240805%' then 2
              else 3
            end,
            c.account_code
   limit 1;
$function$;
revoke all on function public.fn_cuenta_iva19_sugerida(integer) from public, anon;
grant execute on function public.fn_cuenta_iva19_sugerida(integer) to authenticated, service_role;

create or replace function public.fn_sembrar_mapeo_impuestos(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
  v_cuenta text;
  v_padre_mov boolean;
  v_estado text;
begin
  perform public.fn_assert_acceso_org(p_org);
  for r in
    select tt.id, tt.code, v.cuenta, v.nombre,
           (select ot.id from public.organization_taxes ot
             where ot.organization_id = p_org and ot.template_id = tt.id
             order by ot.created_at limit 1) as org_tax_id
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
    begin
      v_cuenta := case when r.code = 'IVA_19' then public.fn_cuenta_iva19_sugerida(p_org) end;
      if v_cuenta is null then
        if exists (select 1 from public.chart_of_accounts c
                    where c.organization_id = p_org and c.account_code = r.cuenta) then
          v_cuenta := r.cuenta;
        else
          -- Ancestro más cercano que ya existe; si es de movimiento no se crea la auxiliar (evita el ALTER TABLE).
          select c.es_movimiento is true into v_padre_mov
            from public.chart_of_accounts c
           where c.organization_id = p_org and r.cuenta like c.account_code || '%'
             and c.account_code <> r.cuenta
           order by length(c.account_code) desc limit 1;
          if coalesce(v_padre_mov, false) then
            raise exception 'padre_de_movimiento: % no se crea bajo una cuenta de movimiento', r.cuenta;
          end if;
          v_cuenta := public.fn_puc_asegurar_cuenta(p_org, r.cuenta, r.nombre, true);
        end if;
      end if;
      continue when v_cuenta is null;
      insert into public.tax_account_mapping (
        organization_id, tax_template_id, organization_tax_id, account_code, account_type, is_active
      ) values (p_org, r.id, r.org_tax_id, v_cuenta, 'tax_payable', true);
      v_n := v_n + 1;
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate;
      insert into public.bitacora_siembra_org (organization_id, paso, error, sqlstate)
      values (p_org, 'fn_sembrar_mapeo_impuestos:' || r.code, left(sqlerrm, 1000), v_estado);
      raise warning 'fn_sembrar_mapeo_impuestos(%, %) falló: %', p_org, r.code, sqlerrm;
    end;
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
declare
  v_estado text;
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  begin
    perform public.fn_sembrar_mapeo_impuestos(new.id);
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    insert into public.bitacora_siembra_org (organization_id, paso, error, sqlstate)
    values (new.id, 'fn_sembrar_mapeo_impuestos', left(sqlerrm, 1000), v_estado);
    raise warning 'fn_sembrar_mapeo_impuestos(%) falló (bitacora_siembra_org): %', new.id, sqlerrm;
  end;
  -- Solo orgs NUEVAS: precios con IVA 19 % incluido por defecto.
  update public.organization_taxes ot
     set tax_included = true, updated_at = now()
    from public.tax_templates tt
   where ot.organization_id = new.id
     and ot.template_id = tt.id
     and tt.code = 'IVA_19'
     and ot.kind = 'tax';
  return new;
end;
$function$;
