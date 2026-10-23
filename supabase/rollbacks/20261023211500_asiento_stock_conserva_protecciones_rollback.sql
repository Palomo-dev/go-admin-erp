-- Vuelve fn_auto_journal_stock_movement al cuerpo de 20261023181348.
-- No toca borradores ni asientos ya publicados.

create or replace function public.fn_auto_journal_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_debit_account text;
  v_credit_account text;
  v_debito_base text;
  v_credito_base text;
  v_evento text;
  v_fallo text;
  v_fact_key text;
begin
  -- Compras (las contabiliza la factura) y traslados no son ajustes.
  -- La apertura sí se contabiliza: inventario contra patrimonio, no contra costos.
  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  -- Los movimientos de un documento de ajuste de ganancia o pérdida los
  -- contabiliza el documento. El ajuste masivo usa source_id 'masivo:…',
  -- que no entra en este salto.
  if new.source = 'adjustment' and new.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = new.source_id::integer
       and ia.organization_id = new.organization_id
       and ia.type in ('gain', 'loss')
  ) then
    return new;
  end if;

  if new.direction not in ('out', 'in') then
    return new;
  end if;

  v_unit_cost := coalesce(new.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = new.product_id
       and sl.branch_id = new.branch_id
     limit 1;
  end if;

  v_amount := abs(new.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    return new;
  end if;

  v_fact_key := 'stock_movement:' || new.id::text;

  -- Un segundo paso del mismo movimiento no crea otro asiento.
  if exists (
    select 1
      from public.journal_entries je
     where je.organization_id = new.organization_id
       and (
         je.fact_key = v_fact_key
         or (je.source = 'stock_movements' and je.source_id = new.id::text)
       )
  ) then
    return new;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(new.organization_id, new.source, new.direction) c;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(new.source, '') || ' ' || coalesce(new.direction, ''));
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = new.product_id
     and not exists (
       select 1 from public.products pp_elim
        where pp_elim.id = p.parent_product_id
          and pp_elim.status = 'deleted'
     )
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || new.product_id);

  begin
    perform public.fn_create_journal_entry(
      new.organization_id,
      new.branch_id,
      coalesce(new.created_at, now()),
      v_description,
      'stock_movements',
      new.id::text,
      v_debit_account,
      v_credit_account,
      v_amount,
      null::text,
      0,
      null::uuid,
      false,
      v_fact_key
    );
  exception
    when unique_violation then
      return new;
  end;

  return new;
end;
$fn$;
