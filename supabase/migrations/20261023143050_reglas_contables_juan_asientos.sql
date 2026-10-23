-- Asientos de faltante, consumo interno y manifiesto (22 oct 2026).
-- Sigue a 20261023143000_reglas_contables_juan.sql.
-- No edita journal_lines publicados. Los borradores los crea la migración siguiente.
-- Reversión: supabase/rollbacks/20261023143050_reglas_contables_juan_asientos_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- Estas dos quedaron ejecutables por anon en la migración anterior.
revoke all on function public.fn_debito_salida_inventario(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_cuentas_manifiesto(integer, integer, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Salida de stock: un faltante no debita la clase 6
-- ---------------------------------------------------------------------------

create or replace function public.fn_cuentas_movimiento_stock(
  p_organization_id integer,
  p_source text,
  p_direction text,
  out debito text,
  out credito text,
  out evento text
)
returns record
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
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
  v_cmv := case when v_type in (1, 2) then '6140' else '6135' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    '519595'
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
      credito := '3105';
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
      credito := '4250';
    end if;
  end if;

  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '4250';
  end if;

  if evento = 'loss' and (left(coalesce(debito, ''), 1) = '6' or debito in ('5150', '6105')) then
    debito := v_faltante;
    if left(coalesce(debito, ''), 1) = '6' then
      debito := '519595';
    end if;
  end if;
end;
$fn$;

revoke all on function public.fn_cuentas_movimiento_stock(integer, text, text) from public, anon;
grant execute on function public.fn_cuentas_movimiento_stock(integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Ajuste: faltante a 519595, robo o siniestro a 5315, crédito a inventario
-- ---------------------------------------------------------------------------

create or replace function public.fn_auto_journal_inventory_adjustment()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_rule record;
  v_neto numeric;
  v_amount numeric;
  v_event_type text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_description text;
  v_nprod integer;
  v_prod integer;
  v_explicita boolean;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(sum(case when sm.direction = 'in' then 1 else -1 end * abs(sm.qty)
                      * coalesce(nullif(sm.unit_cost, 0),
                                 (select sl.avg_cost from stock_levels sl
                                   where sl.product_id = sm.product_id and sl.branch_id = sm.branch_id
                                     and sl.lot_id is not distinct from sm.lot_id
                                   order by sl.id limit 1), 0)), 0),
         count(distinct sm.product_id),
         min(sm.product_id)
    into v_neto, v_nprod, v_prod
    from stock_movements sm
   where sm.source = 'adjustment'
     and sm.source_id = new.id::text
     and sm.organization_id = new.organization_id;

  v_amount := round(abs(v_neto), 2);
  if v_amount <= 0 then
    return new;
  end if;
  v_event_type := case when v_neto > 0 then 'gain' else 'loss' end;

  select je.id into v_existing_entry
    from journal_entries je
   where je.source = 'inventory_adjustment'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;
  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory_adjustment'
     and event_type = v_event_type
     and is_active = true
   order by priority
   limit 1;

  v_credit_account := public.fn_cuenta_inventario_producto(
    new.organization_id,
    new.branch_id,
    case when v_nprod = 1 then v_prod else null end
  );

  if v_event_type = 'gain' then
    v_debit_account := v_credit_account;
    v_credit_account := coalesce(v_rule.credit_account_code, '4250');
    if left(coalesce(v_credit_account, ''), 1) = '6' then
      v_credit_account := coalesce(
        public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']),
        '4250'
      );
    end if;
  else
    v_explicita := v_rule.debit_account_code is not null
      and v_rule.debit_account_code not in ('5150', '6105', '519595', '5315')
      and left(v_rule.debit_account_code, 1) <> '6'
      and coalesce(new.motivo_ajuste, '') = ''
      and lower(coalesce(new.reason, '')) not in ('robo', 'siniestro', 'theft', 'consumo_interno', 'consumo interno');
    if v_explicita then
      v_debit_account := v_rule.debit_account_code;
    else
      v_debit_account := public.fn_debito_salida_inventario(
        new.organization_id, new.branch_id, new.motivo_ajuste, new.reason
      );
    end if;
    if left(coalesce(v_debit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'salida_clase_6', 'Un faltante o un consumo interno no debita la clase 6');
      return new;
    end if;
  end if;

  if v_debit_account is null or v_credit_account is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
      'inventory_adjustment', new.id::text, null, v_debit_account, v_credit_account, v_amount,
      'no_rule', 'Sin cuenta de inventario o de gasto para el ajuste');
    return new;
  end if;

  v_description := 'Ajuste de inventario ' || coalesce(new.code, new.id::text)
    || ' - ' || coalesce(new.motivo_ajuste, new.reason, 'N/A')
    || coalesce(' - ' || nullif(new.notes, ''), '');

  perform public.fn_create_journal_entry(
    p_organization_id => new.organization_id,
    p_branch_id => new.branch_id,
    p_entry_date => coalesce(new.posted_at, new.updated_at, now()),
    p_memo => v_description,
    p_source => 'inventory_adjustment',
    p_source_id => new.id::text,
    p_debit_account => v_debit_account,
    p_credit_account => v_credit_account,
    p_amount => v_amount,
    p_fact_key => 'inventory_adjustment:' || new.id::text
  );
  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_inventory_adjustment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manifiesto: inventario contra 2205 o 2335. Caja solo si es de contado.
-- ---------------------------------------------------------------------------

create or replace function public.fn_auto_journal_manifest()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_cuentas record;
  v_amount numeric;
  v_texto text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.status is not distinct from old.status or new.status <> 'completed' then
    return new;
  end if;

  v_texto := new.metadata->>'costo';
  if v_texto ~ '^[0-9]+(\.[0-9]+)?$' then
    v_amount := round(v_texto::numeric, 2);
  end if;
  if coalesce(v_amount, 0) <= 0 then
    return new;
  end if;

  if exists (
    select 1 from public.journal_entries je
    where je.organization_id = new.organization_id
      and (je.fact_key = 'manifest:' || new.id::text
        or (je.source = 'manifest' and je.source_id = new.id::text))
  ) then
    return new;
  end if;

  select c.debito, c.credito into v_cuentas
  from public.fn_cuentas_manifiesto(new.organization_id, new.branch_id, new.pagado_contado) c;

  if not coalesce(new.pagado_contado, false) and left(coalesce(v_cuentas.credito, ''), 2) = '11' then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.completed_at, now()),
      'manifest', new.id::text, 'manifest:' || new.id::text,
      v_cuentas.debito, v_cuentas.credito, v_amount,
      'manifiesto_caja', 'Un manifiesto que no es de contado no acredita caja ni bancos');
    return new;
  end if;

  perform public.fn_create_journal_entry(
    p_organization_id => new.organization_id,
    p_branch_id => coalesce(new.branch_id, 0),
    p_entry_date => coalesce(new.completed_at, now()),
    p_memo => 'Manifiesto ' || coalesce(new.manifest_number, new.id::text),
    p_source => 'manifest',
    p_source_id => new.id::text,
    p_debit_account => v_cuentas.debito,
    p_credit_account => v_cuentas.credito,
    p_amount => v_amount,
    p_fact_key => 'manifest:' || new.id::text
  );
  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_manifest() from public, anon, authenticated;
