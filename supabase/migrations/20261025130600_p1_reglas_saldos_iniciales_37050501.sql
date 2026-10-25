-- P1 (25-oct-2026): reglas y configuración contable hacia los auxiliares del contador. NO aplicada.
-- Paso 2 de 3. Requiere 130500 aplicada. En cada org solo se cambia la regla/clave si la cuenta destino
-- YA existe y es de movimiento en esa org (primero la cuenta, después la regla; nunca al revés).
-- Configuración HACIA ADELANTE: no reprocesa el histórico de faltantes/sobrantes.
-- Conteo esperado al 25-oct:
--   inventory/opening  C3105 -> 37050501 ............ 116 reglas (109 D1405 / 7 D1435)
--   inventory/gain + inventory_adjustment/gain  C4250|C4295 -> 42959501 ... 232 reglas
--   inventory/loss + inventory_adjustment/loss  D519595 -> 61350502 ........ 173 reglas
--   inventory/sale D6135 y inventory/return C6135 -> 61350501 ................ 232 reglas
--   tax_account_code 240805/240810 -> 24080501/24081001 donde existan los auxiliares
--   configuracion_contable: saldo_inicial 3105 (5), costo_ventas 6135 (53), faltante_inventario 519595 (5),
--     redondeo 4295 (5) -> 42959501 [DECISIÓN ABIERTA], comisiones 5235/529505 (113) -> 53051501,
--     iva_generado/iva_descontable -> auxiliar 19% donde exista (si no, el padre de movimiento)
--   fn_cuentas_movimiento_stock: fallback 3105 -> 37050501, 4295 -> 42959501, 519595 -> 61350502.
-- NO se tocan: inventory/adjusted y expense/created (519595, salida no venta/consumo), bank/adjusted,
--   membership y reservation (4250): no son sobrantes/faltantes de inventario.
-- Rollback: supabase/rollbacks/20261025130600_p1_reglas_saldos_iniciales_37050501_rollback.sql

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
      select '130600', organization_id, 'regla', id::text, %1$L, anterior, %3$L from obj
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
      select '130600', organization_id, 'config', id::text, 'account_code', anterior, %2$L from obj
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
  -- DECISIÓN ABIERTA: redondeo→42959501 pendiente de confirmación del contador
  n := pg_temp.p1_config($w$cc.clave = 'redondeo' and cc.account_code = '4295'$w$, '42959501');
  raise notice 'cfg redondeo: % (esperado 5) [decisión abierta]', n;
  n := pg_temp.p1_config($w$cc.clave = 'comisiones' and cc.account_code in ('5235','529505')$w$, '53051501');
  raise notice 'cfg comisiones: % (esperado 113)', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_generado' and cc.account_code in ('2408','240805')$w$, '24080501');
  raise notice 'cfg iva_generado -> 24080501: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_generado' and cc.account_code = '2408'$w$, '240805');
  n := pg_temp.p1_config($w$cc.clave = 'iva_descontable' and cc.account_code in ('2408','240810')$w$, '24081001');
  raise notice 'cfg iva_descontable -> 24081001: %', n;
  n := pg_temp.p1_config($w$cc.clave = 'iva_descontable' and cc.account_code = '2408'$w$, '240810');
end $$;

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
  v_inv := coalesce(nullif(btrim(v_inv), ''), '1405');
  -- 6135 pasa a título en 130700: el respaldo es su auxiliar 61350501. Igual que con 1435, el auxiliar
  -- de la sede lo resuelve después fn_cuenta_configurada_de_sede (branch_account_mappings 6135->61350501).
  v_cmv := case when v_type in (1, 2) then '6140' else '61350501' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    '61350502'
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
