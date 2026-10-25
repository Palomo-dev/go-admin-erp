-- P1 (25-oct-2026): reglas y configuración contable hacia los auxiliares del contador. NO aplicada.
-- Paso 2 de 3. Requiere 134010 aplicada. En cada org solo se cambia la regla/clave si la cuenta destino
-- YA existe y es de movimiento en esa org (primero la cuenta, después la regla; nunca al revés).
-- Configuración HACIA ADELANTE: no reprocesa el histórico de faltantes/sobrantes.
-- Conteo esperado al 25-oct:
--   inventory/opening  C3105 -> 37050501 ............ 116 reglas (109 D1405 / 7 D1435)
--   inventory/gain + inventory_adjustment/gain  C4250|C4295 -> 42959501 ... 232 reglas
--   inventory/loss + inventory_adjustment/loss  D519595 -> 61350502 ........ 173 reglas
--   inventory/sale D6135 y inventory/return C6135 -> 61350501 ................ 232 reglas
--   tax_account_code 240805/240810 -> 24080501/24081001 donde existan los auxiliares
--   configuracion_contable: saldo_inicial 3105 (5), costo_ventas 6135 (53), faltante_inventario 519595 (5),
--     redondeo 4295 (5) -> 42958101 (Ajuste al peso a favor) + nueva clave redondeo_en_contra -> 53959501 (5),
--     comisiones (5235/529505): NO se toca en P1 (son comisiones de vendedores, regla «comisión causada» D5235/C2370;
--     53051501 queda solo para cobros bancarios),
--     iva_generado/iva_descontable -> auxiliar 19% donde exista (si no, el padre de movimiento)
--   fn_cuentas_movimiento_stock: respaldos 3105 -> 37050501, 4295 -> 42959501, 519595 -> 61350502, 6135 -> 61350501.
--   fn_redondear_asiento_pesos: respaldo 4295 -> 42958101 (a favor) / 53959501 (en contra), clave redondeo_en_contra.
--   Redondeo: decisión CERRADA por el contador (25-oct): auxiliares propios de Ajuste al peso.
-- NO se tocan: inventory/adjusted y expense/created (519595, salida no venta/consumo), bank/adjusted,
--   membership y reservation (4250): no son sobrantes/faltantes de inventario.
-- Rollback: supabase/rollbacks/20261025134020_p1_reglas_saldos_iniciales_37050501_rollback.sql

create or replace function pg_temp.p1_mov(p_org integer, p_code text) returns boolean
language sql stable as $$
  select exists (select 1 from public.chart_of_accounts
                  where organization_id = p_org and account_code = p_code and es_movimiento is true)
$$;

create or replace function pg_temp.p1_regla(p_where text, p_campo text, p_nuevo text) returns integer
language plpgsql as $$
declare v_n integer;
begin
  execute format($q$
    with obj as (
      select ar.id, ar.organization_id, ar.%1$I as anterior from public.accounting_rules ar
       where %2$s and ar.%1$I is distinct from %3$L and pg_temp.p1_mov(ar.organization_id, %3$L)
    ), log as (
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134020', organization_id, 'regla', id::text, %1$L, anterior, %3$L from obj
    )
    update public.accounting_rules ar set %1$I = %3$L, updated_at = now()
      from obj where ar.id = obj.id$q$, p_campo, p_where, p_nuevo);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function pg_temp.p1_config(p_where text, p_nuevo text) returns integer
language plpgsql as $$
declare v_n integer;
begin
  execute format($q$
    with obj as (
      select cc.id, cc.organization_id, cc.account_code as anterior from public.configuracion_contable cc
       where %1$s and cc.account_code is distinct from %2$L and pg_temp.p1_mov(cc.organization_id, %2$L)
    ), log as (
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134020', organization_id, 'config', id::text, 'account_code', anterior, %2$L from obj
    )
    update public.configuracion_contable cc set account_code = %2$L
      from obj where cc.id = obj.id$q$, p_where, p_nuevo);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$
declare n integer;
begin
  n := pg_temp.p1_regla($w$ar.source_type = 'inventory' and ar.event_type = 'opening'$w$, 'credit_account_code', '37050501');
  raise notice 'opening -> 37050501: % (esperado 116)', n;
  n := pg_temp.p1_regla($w$ar.source_type in ('inventory','inventory_adjustment') and ar.event_type = 'gain' and ar.credit_account_code in ('4250','4295')$w$, 'credit_account_code', '42959501');
  raise notice 'gain -> 42959501: % (esperado 232)', n;
  n := pg_temp.p1_regla($w$ar.source_type in ('inventory','inventory_adjustment') and ar.event_type = 'loss' and ar.debit_account_code = '519595'$w$, 'debit_account_code', '61350502');
  raise notice 'loss -> 61350502: % (esperado 173)', n;
  -- Hoteles y restaurantes (type_id 1/2, regla del contador): costo 61400501 y mermas 61400502, nunca 6135/6140.
  n := pg_temp.p1_regla($w$ar.source_type = 'inventory' and ar.event_type = 'sale' and ar.debit_account_code in ('6135','6140') and ar.organization_id in (select id from public.organizations where type_id in (1, 2))$w$, 'debit_account_code', '61400501');
  raise notice 'sale H/R -> 61400501: %', n;
  n := pg_temp.p1_regla($w$ar.source_type = 'inventory' and ar.event_type = 'return' and ar.credit_account_code in ('6135','6140') and ar.organization_id in (select id from public.organizations where type_id in (1, 2))$w$, 'credit_account_code', '61400501');
  raise notice 'return H/R -> 61400501: %', n;
  n := pg_temp.p1_regla($w$ar.source_type in ('inventory','inventory_adjustment') and ar.event_type = 'loss' and ar.debit_account_code in ('519595','61350502') and ar.organization_id in (select id from public.organizations where type_id in (1, 2))$w$, 'debit_account_code', '61400502');
  raise notice 'loss H/R -> 61400502: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'costo_ventas' and cc.account_code in ('6135','6140','61350501') and cc.organization_id in (select id from public.organizations where type_id in (1, 2))$w$, '61400501');
  raise notice 'cfg costo_ventas H/R -> 61400501: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'faltante_inventario' and cc.account_code in ('519595','61350502') and cc.organization_id in (select id from public.organizations where type_id in (1, 2))$w$, '61400502');
  raise notice 'cfg faltante H/R -> 61400502: %', n;
  n := pg_temp.p1_regla($w$ar.source_type = 'inventory' and ar.event_type = 'sale' and ar.debit_account_code = '6135'$w$, 'debit_account_code', '61350501');
  raise notice 'sale -> 61350501: %', n;
  n := pg_temp.p1_regla($w$ar.source_type = 'inventory' and ar.event_type = 'return' and ar.credit_account_code = '6135'$w$, 'credit_account_code', '61350501');
  raise notice 'return -> 61350501: %', n;
  n := pg_temp.p1_regla($w$ar.tax_account_code = '240805'$w$, 'tax_account_code', '24080501');
  raise notice 'tax 240805 -> 24080501: %', n;
  n := pg_temp.p1_regla($w$ar.tax_account_code = '240810'$w$, 'tax_account_code', '24081001');
  raise notice 'tax 240810 -> 24081001: %', n;

  n := pg_temp.p1_config($w$cc.clave = 'saldo_inicial' and cc.account_code = '3105'$w$, '37050501');
  raise notice 'cfg saldo_inicial: % (esperado 5)', n;
  n := pg_temp.p1_config($w$cc.clave = 'costo_ventas' and cc.account_code = '6135'$w$, '61350501');
  raise notice 'cfg costo_ventas: % (esperado 53)', n;
  n := pg_temp.p1_config($w$cc.clave = 'faltante_inventario' and cc.account_code = '519595'$w$, '61350502');
  raise notice 'cfg faltante_inventario: % (esperado 5)', n;
  n := pg_temp.p1_config($w$cc.clave = 'redondeo' and cc.account_code = '4295'$w$, '42958101');
  raise notice 'cfg redondeo -> 42958101: % (esperado 5)', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_generado' and cc.account_code in ('2408','240805')$w$, '24080501');
  raise notice 'cfg iva_generado -> 24080501: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_generado' and cc.account_code = '2408'$w$, '240805');
  n := pg_temp.p1_config($w$cc.clave = 'iva_descontable' and cc.account_code in ('2408','240810')$w$, '24081001');
  raise notice 'cfg iva_descontable -> 24081001: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_descontable' and cc.account_code = '2408'$w$, '240810');
end $$;

-- Redondeo en contra: clave nueva (el CHECK de claves se amplía) para las orgs que ya configuran redondeo.
alter table public.configuracion_contable drop constraint configuracion_contable_clave_chk;
alter table public.configuracion_contable add constraint configuracion_contable_clave_chk check (clave = any (array[
  'caja', 'bancos', 'clientes', 'proveedores', 'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
  'costo_ventas', 'inventario', 'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica', 'propinas',
  'comisiones', 'anticipos', 'nomina', 'nomina_por_pagar', 'nomina_aportes', 'faltante_inventario',
  'gastos_extraordinarios', 'consumo_interno', 'manifiesto_por_pagar', 'manifiesto_transporte', 'saldo_inicial',
  'impuesto_consumo', 'redondeo', 'compra_servicio', 'ingresos_diversos', 'redondeo_en_contra']::text[]));

with ins as (
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select cc.organization_id, cc.branch_id, 'redondeo_en_contra', '53959501'
    from public.configuracion_contable cc
   where cc.clave = 'redondeo' and pg_temp.p1_mov(cc.organization_id, '53959501')
  on conflict (organization_id, branch_id, clave) do nothing
  returning id, organization_id
)
insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
select '134020', organization_id, 'config_nueva', id::text, 'redondeo_en_contra', null, '53959501' from ins;

-- Org 149: no tiene clave iva_generado en 240805 (la cuenta no existía). Se siembra si falta.
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
select 149, null, 'iva_generado', x.cta
  from (select case when pg_temp.p1_mov(149, '24080501') then '24080501' else '240805' end as cta) x
 where pg_temp.p1_mov(149, x.cta)
   and not exists (select 1 from public.configuracion_contable where organization_id = 149 and clave = 'iva_generado');

CREATE OR REPLACE FUNCTION public.fn_cuentas_movimiento_stock(p_organization_id integer, p_source text, p_direction text, OUT debito text, OUT credito text, OUT evento text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv text;
  v_cmv text;
  v_faltante text;
  v_tmp text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select o.type_id into v_type
  from public.organizations o
  where o.id = p_organization_id;

  select ar.credit_account_code
    into v_inv
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = 'adjusted'
    and ar.is_active
  order by ar.priority
  limit 1;
  -- QA 25-oct: nunca 1405 (ni 1435 de grupo). Respaldo: auxiliar 1435 de la org, si no 14350101.
  v_inv := coalesce(nullif(btrim(v_inv), ''), public.fn_inventario_auxiliar_1435(p_organization_id, null), '14350101');
  -- 6135 pasa a título en 134060: el respaldo es su auxiliar 61350501. Igual que con 1435, el auxiliar
  -- de la sede lo resuelve después fn_cuenta_configurada_de_sede (branch_account_mappings 6135->61350501).
  -- Hoteles y restaurantes (regla del contador): 61400501 / mermas de cocina 61400502.
  v_cmv := case when v_type in (1, 2) then '61400501' else '61350501' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    case when v_type in (1, 2) then '61400502' else '61350502' end
  );

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = evento
    and ar.is_active
  order by ar.priority
  limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '37050501';
    elsif evento = 'sale' then
      debito := v_cmv;
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := v_cmv;
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '2205';
    elsif evento = 'loss' then
      debito := v_faltante;
      credito := v_inv;
    else
      debito := v_inv;
      credito := '42959501';
    end if;
  end if;

  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '42959501';
  end if;

  -- Faltante: 61350502 (Mermas y faltantes) es la cuenta correcta desde el 25-oct; cualquier otra
  -- cuenta de costo (6xxx) o 5150/6105 se corrige al faltante configurado.
  if evento = 'loss' and debito is distinct from '61350502'
     and (left(coalesce(debito, ''), 1) = '6' or debito in ('5150', '6105')) then
    debito := v_faltante;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_redondear_asiento_pesos(p_entry_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_diff numeric;
  v_line integer;
  v_cuenta text;
begin
  select organization_id into v_org from public.journal_entries where id = p_entry_id;
  if v_org is null then
    return;
  end if;

  update public.journal_lines
     set debit = round(coalesce(debit, 0), 0),
         credit = round(coalesce(credit, 0), 0),
         debit_base = case when debit_base is null then debit_base else round(debit_base, 0) end,
         credit_base = case when credit_base is null then credit_base else round(credit_base, 0) end
   where journal_entry_id = p_entry_id;

  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0)
    into v_diff
  from public.journal_lines
  where journal_entry_id = p_entry_id;

  if v_diff = 0 then
    return;
  end if;

  if v_diff > 0 then
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and credit > 0
    order by credit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set credit = credit + v_diff,
             credit_base = case when credit_base is null then credit_base else credit_base + v_diff end
       where id = v_line;
      return;
    end if;
  else
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and debit > 0
    order by debit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set debit = debit + abs(v_diff),
             debit_base = case when debit_base is null then debit_base else debit_base + abs(v_diff) end
       where id = v_line;
      return;
    end if;
  end if;

  select c.account_code into v_cuenta
  from public.configuracion_contable c
  join public.chart_of_accounts a
    on a.organization_id = c.organization_id and a.account_code = c.account_code
  where c.organization_id = v_org
    and c.clave = case when v_diff > 0 then 'redondeo' else 'redondeo_en_contra' end
    and c.branch_id is null
    and coalesce(a.is_active, true)
    and a.es_movimiento is true
  limit 1;
  -- Ajuste al peso (contador, 25-oct): a favor 42958101, en contra 53959501. Nunca 4295/5395 (pasan a
  -- título en 134060): si la org no tiene el auxiliar, el asiento queda sin redondear y con aviso.
  if v_cuenta is null then
    select a.account_code into v_cuenta
    from public.chart_of_accounts a
    where a.organization_id = v_org and a.es_movimiento is true and coalesce(a.is_active, true)
      and a.account_code = case when v_diff > 0 then '42958101' else '53959501' end;
  end if;
  if v_cuenta is null then
    raise notice 'redondeo_sin_cuenta: org % asiento % sin auxiliar %', v_org, p_entry_id,
      case when v_diff > 0 then '42958101' else '53959501' end;
    return;
  end if;

  if v_diff > 0 then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', 0, v_diff, v_org, 0, v_diff);
  else
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', abs(v_diff), 0, v_org, abs(v_diff), 0);
  end if;
end;
$function$;
