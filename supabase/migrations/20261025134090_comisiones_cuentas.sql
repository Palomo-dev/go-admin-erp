-- Comisiones de vendedor, 25-oct-2026 (estructura del contador). NO aplicada. Paso 1 de 3.
-- Crea en TODAS las orgs (idempotente, solo lo que falte):
--   520518 Comisiones (título, bajo 5205)  -> 52051801 Comisiones a empleados       (gasto comisión de EMPLEADO)
--   529505 Comisiones (bajo 5295)           -> 52950501 Comisiones a externos        (gasto comisión EXTERNA y canal OTA)
-- y deja como TÍTULO 5205, 5295 y 529505 SOLO después de mover lo que las referencia:
--   - 5205 y 5295: al 25-oct ninguna regla/clave/categoría/mapeo las usa y no tienen líneas; si apareciera alguna
--     referencia la migración se DETIENE (raise) en vez de adivinar el destino.
--   - 529505: la regla 'Comision OTA' (débito, 5 orgs) y la clave 'comisiones' (5 orgs) pasan a 52950501.
-- NO crea 25050501 / 23359501 / 23652001 (contrapartidas y retención del contador): crearlas convierte 2505, 2335 y
-- 2365 en TÍTULO, y de ellas cuelgan la nómina (116 orgs, fn_auto_journal_payroll), la retefuente de compras
-- (clave retefuente 115 orgs, fn_cuenta_retencion_compra), la comisión OTA, compras y manifiestos. Queda pendiente
-- de que el contador defina los auxiliares hermanos (salarios por pagar, retefuente general, CxP general).
-- Mientras tanto la regla de comisión (134095) usa el auxiliar si existe y si no su cuenta de 4 dígitos.
-- trg_puc_validar_cuenta desactivado durante los INSERT (como 134010/134070). activa es GENERADA: no se inserta.
-- Bitácora p1_puc_bitacora migracion '134090'.
-- Rollback: supabase/rollbacks/20261025134090_comisiones_cuentas_rollback.sql

create or replace function public.fn_comisiones_asegurar_cuentas(p_org integer, p_migracion text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select * from (values
      ('520518',   '5205',   'Comisiones',              false, 1),
      ('52051801', '520518', 'Comisiones a empleados',  true,  2),
      ('529505',   '5295',   'Comisiones',              false, 3),
      ('52950501', '529505', 'Comisiones a externos',   true,  4)
    ) as t(codigo, padre, nombre, mov, orden)
    order by orden
  loop
    continue when exists (select 1 from public.chart_of_accounts
                           where organization_id = p_org and account_code = r.codigo);
    continue when not exists (select 1 from public.chart_of_accounts
                               where organization_id = p_org and account_code = r.padre);
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, r.codigo, r.nombre, p.type, r.padre, true,
           p.naturaleza, r.mov, case when r.mov then true else coalesce(p.requiere_tercero, false) end,
           p.requiere_centro_costo, p.centro_costo_modo, p.presentacion_niif, now(), now()
      from public.chart_of_accounts p
     where p.organization_id = p_org and p.account_code = r.padre
    on conflict (organization_id, account_code) do nothing;
    if found then
      v_n := v_n + 1;
      if p_migracion is not null then
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values (p_migracion, p_org, 'cuenta', r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_comisiones_asegurar_cuentas(integer, text) from public, anon, authenticated;

do $$
declare
  v_org integer;
  r record;
  v_total integer := 0;
  v_ref boolean;
begin
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for v_org in select o.id from public.organizations o order by 1 loop
    v_total := v_total + public.fn_comisiones_asegurar_cuentas(v_org, '134090');
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise notice '134090: % cuentas creadas', v_total;

  for v_org in select o.id from public.organizations o order by 1 loop
    -- 529505 -> 52950501 (regla y clave), solo si el auxiliar existe de movimiento
    if exists (select 1 from public.chart_of_accounts where organization_id = v_org
                and account_code = '52950501' and es_movimiento is true) then
      for r in select id, debit_account_code d, credit_account_code c from public.accounting_rules
                where organization_id = v_org and '529505' in (debit_account_code, credit_account_code) loop
        if r.d = '529505' then
          update public.accounting_rules set debit_account_code = '52950501', updated_at = now() where id = r.id;
          insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
          values ('134090', v_org, 'accounting_rules', r.id::text, 'debit_account_code', '529505', '52950501');
        end if;
        if r.c = '529505' then
          update public.accounting_rules set credit_account_code = '52950501', updated_at = now() where id = r.id;
          insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
          values ('134090', v_org, 'accounting_rules', r.id::text, 'credit_account_code', '529505', '52950501');
        end if;
      end loop;
      for r in select id, clave from public.configuracion_contable where organization_id = v_org and account_code = '529505' loop
        update public.configuracion_contable set account_code = '52950501' where id = r.id;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134090', v_org, 'configuracion_contable', r.id::text, r.clave, '529505', '52950501');
      end loop;
      for r in select id from public.categorias_tesoreria where organization_id = v_org and cuenta_sugerida = '529505' loop
        update public.categorias_tesoreria set cuenta_sugerida = '52950501' where id = r.id;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134090', v_org, 'categorias_tesoreria', r.id::text, 'cuenta_sugerida', '529505', '52950501');
      end loop;
    end if;

    -- Títulos: 5205, 5295, 529505 (si tienen hijo de movimiento y nada las referencia)
    for r in select a.account_code, a.es_movimiento from public.chart_of_accounts a
              where a.organization_id = v_org and a.account_code in ('5205', '5295', '529505')
                and a.es_movimiento is not false
                and exists (select 1 from public.chart_of_accounts h where h.organization_id = v_org
                              and h.parent_code = a.account_code) loop
      v_ref := exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.is_active
                         and r.account_code in (x.debit_account_code, x.credit_account_code,
                                                coalesce(x.discount_account_code, ''), coalesce(x.tax_account_code, '')))
            or exists (select 1 from public.configuracion_contable x where x.organization_id = v_org and x.account_code = r.account_code)
            or exists (select 1 from public.categorias_tesoreria x where x.organization_id = v_org and x.cuenta_sugerida = r.account_code)
            or exists (select 1 from public.branch_account_mappings x where x.organization_id = v_org
                         and r.account_code in (x.base_account_code, x.sub_account_code))
            or exists (select 1 from public.journal_lines l where l.organization_id = v_org and l.account_code = r.account_code);
      if v_ref then
        raise exception '134090: org % cuenta % sigue referenciada o con líneas; detener y revisar con el contador', v_org, r.account_code;
      end if;
      update public.chart_of_accounts set es_movimiento = false, updated_at = now()
       where organization_id = v_org and account_code = r.account_code;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134090', v_org, 'cuenta', r.account_code, 'es_movimiento', r.es_movimiento::text, 'false');  -- QA BAJO #4
    end loop;
  end loop;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;

-- AJUSTE: fila propia en schema_migrations (los rollbacks cruzados de 134115/134140 la consultan).
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134090', 'comisiones_cuentas', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
