-- GO Assistant — deshacer una factura de compra registrada por el asistente.
--
-- Compensa, no borra (§6.4 del plan): la factura pasa a `void` con saldo 0, la
-- cuenta por pagar queda en `void` con saldo 0, el stock que entró sale con un
-- movimiento `return` (queda el rastro doble, que es lo correcto) y cada asiento
-- generado por los disparadores (`invoice_purchase` y `accounts_payable`) se
-- revierte con un asiento espejo (débitos y créditos intercambiados). Nada se
-- elimina.
--
-- Solo si la factura no tiene pagos: con pagos, deshacer desde el chat sería
-- una nota de crédito, y eso se hace desde Finanzas.

create or replace function public.assistant_void_purchase_invoice(
  p_organization_id integer,
  p_user_id         uuid,
  p_invoice_id      uuid
) returns jsonb
language plpgsql
as $$
declare
  v_inv        record;
  v_mov        record;
  v_je         record;
  v_new_je     integer;
  v_asientos   integer := 0;
  v_salidas    integer := 0;
  v_ap_id      uuid;
begin
  select * into v_inv from public.invoice_purchase
   where id = p_invoice_id and organization_id = p_organization_id;
  if v_inv.id is null then
    raise exception 'INVOICE_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if v_inv.status = 'void' then
    return jsonb_build_object('invoice_id', p_invoice_id, 'already_void', true);
  end if;
  if exists (select 1 from public.payments
              where source = 'invoice_purchase' and source_id = p_invoice_id::text and status = 'completed') then
    raise exception 'VOID_HAS_PAYMENTS' using errcode = '22023';
  end if;

  -- 1. El stock que entró, sale.
  for v_mov in select * from public.stock_movements
                where organization_id = p_organization_id and source = 'purchase'
                  and source_id = p_invoice_id::text and direction = 'in' loop
    insert into public.stock_movements (
      organization_id, branch_id, product_id, direction, qty, source, source_id, note, updated_by
    ) values (
      p_organization_id, v_mov.branch_id, v_mov.product_id, 'out', v_mov.qty, 'return', p_invoice_id::text,
      'Anulación de compra ' || coalesce(v_inv.number_ext, ''), p_user_id
    );
    update public.stock_levels
       set qty_on_hand = qty_on_hand - v_mov.qty, updated_at = now()
     where product_id = v_mov.product_id and branch_id = v_mov.branch_id and lot_id is null;
    v_salidas := v_salidas + 1;
  end loop;

  -- 2. Cuenta por pagar a cero.
  update public.accounts_payable
     set balance = 0, status = 'void', updated_at = now()
   where organization_id = p_organization_id and invoice_id = p_invoice_id
  returning id into v_ap_id;

  -- 3. Asientos espejo de los que generaron los disparadores.
  -- `journal_entries` tiene UNIQUE (source, source_id): el espejo va con
  -- source `<origen>_void` y el mismo source_id, y así además no se revierte
  -- dos veces.
  for v_je in select * from public.journal_entries
               where organization_id = p_organization_id
                 and ((source = 'invoice_purchase' and source_id = p_invoice_id::text)
                   or (v_ap_id is not null and source = 'accounts_payable' and source_id = v_ap_id::text))
                 and not exists (select 1 from public.journal_entries r
                                  where r.source = journal_entries.source || '_void' and r.source_id = journal_entries.source_id) loop
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, posted, source, source_id, created_by,
      currency_code, exchange_rate, base_currency_code
    ) values (
      v_je.organization_id, v_je.branch_id, now(), 'Reversión ' || coalesce(v_je.memo, ''), v_je.posted,
      v_je.source || '_void', v_je.source_id, p_user_id, v_je.currency_code, v_je.exchange_rate, v_je.base_currency_code
    ) returning id into v_new_je;
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id,
      currency_code, exchange_rate, debit_base, credit_base, cost_center_id
    )
    select v_new_je, account_code, 'Reversión: ' || coalesce(description, ''), credit, debit, organization_id,
           currency_code, exchange_rate, credit_base, debit_base, cost_center_id
      from public.journal_lines where journal_entry_id = v_je.id;
    v_asientos := v_asientos + 1;
  end loop;

  -- 4. La factura, anulada.
  update public.invoice_purchase
     set status = 'void', balance = 0, updated_at = now(),
         notes = coalesce(notes, '') || E'\nAnulada desde GO Assistant (deshacer).'
   where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id, 'number_ext', v_inv.number_ext,
    'salidas_stock', v_salidas, 'asientos_revertidos', v_asientos, 'accounts_payable_id', v_ap_id
  );
end;
$$;

comment on function public.assistant_void_purchase_invoice(integer, uuid, uuid) is
  'GO Assistant: anula por compensacion una factura de compra sin pagos (stock, CxP y asientos espejo).';

revoke all on function public.assistant_void_purchase_invoice(integer, uuid, uuid) from public;
grant execute on function public.assistant_void_purchase_invoice(integer, uuid, uuid) to authenticated, service_role;
