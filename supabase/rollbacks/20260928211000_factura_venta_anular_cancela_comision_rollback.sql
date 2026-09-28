-- Rollback de 20260928211000_factura_venta_anular_cancela_comision.
-- Restaura el cuerpo anterior EXACTO de fn_factura_venta_anular (leído con
-- pg_get_functiondef el 2026-09-28; es la versión de la migración
-- 20260924104430. Verificado en una transacción que se deshace: recrearla
-- desde este archivo y desde schema_migrations da el mismo
-- md5(pg_get_functiondef) = 5d4db278f9a3ef801ce0a77f12af3d62).
-- No revierte datos: las comisiones que una anulación ya canceló (y sus
-- contra-asientos) se quedan como están; un asiento no se borra.

CREATE OR REPLACE FUNCTION public.fn_factura_venta_anular(p_invoice_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_mov record;
  v_serial record;
  v_devueltos integer := 0;
  v_seriales integer := 0;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.void']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'ya_anulada' using errcode = '22023';
  end if;
  if coalesce(v_inv.document_type, 'invoice') = 'credit_note' then
    raise exception 'nota_credito' using errcode = '22023';
  end if;
  -- L4: con pagos (o notas crédito) va por nota crédito (misma regla que puedeAnular).
  if coalesce(v_inv.total, 0) > 0 and coalesce(v_inv.balance, 0) < coalesce(v_inv.total, 0) then
    raise exception 'con_pagos' using errcode = '22023';
  end if;
  if v_inv.einvoice_status = 'accepted' then
    raise exception 'fe_aceptada' using errcode = '22023';
  end if;

  update public.invoice_sales
     set status = 'void',
         balance = 0,
         notes = case when coalesce(btrim(notes), '') = '' then 'ANULADA: ' || btrim(p_motivo)
                      else notes || E'\n\nANULADA: ' || btrim(p_motivo) end,
         updated_at = now()
   where id = v_inv.id;

  -- Inventario: vuelve exactamente lo que salió por esta factura o su venta,
  -- menos lo que ya se reingresó al anular.
  for v_mov in
    select sm.product_id, sm.branch_id, sum(sm.qty) as qty,
           (array_agg(sm.unit_cost order by sm.id))[1] as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_inv.organization_id
       and sm.direction = 'out'
       and sm.source in ('invoice_sale', 'sale', 'mesa_sale', 'web_sale')
       and sm.source_id in (v_inv.id::text, coalesce(v_inv.sale_id::text, v_inv.id::text))
     group by sm.product_id, sm.branch_id
  loop
    v_mov.qty := v_mov.qty - coalesce((
      select sum(e.qty) from public.stock_movements e
       where e.organization_id = v_inv.organization_id and e.direction = 'in'
         and e.source = 'invoice_void' and e.source_id = v_inv.id::text
         and e.product_id = v_mov.product_id and e.branch_id = v_mov.branch_id), 0);
    continue when v_mov.qty <= 0;
    perform public.fn_stock_entrada(v_inv.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.qty,
                                    v_mov.unit_cost, 'invoice_void', v_inv.id::text,
                                    'Anulación de la factura ' || coalesce(v_inv.number, v_inv.id::text), v_uid);
    v_devueltos := v_devueltos + 1;
  end loop;

  -- Seriales que vendió esta factura (o su venta): vuelven a stock.
  for v_serial in
    select sn.id, sn.status, sn.current_branch_id from public.serial_numbers sn
     where sn.organization_id = v_inv.organization_id and sn.status = 'sold'
       and (sn.invoice_sale_id = v_inv.id or (v_inv.sale_id is not null and sn.sale_id = v_inv.sale_id::text))
     for update
  loop
    update public.serial_numbers set
      status = 'in_stock', sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
      invoice_sale_id = null, sale_channel = 'in_stock', sale_date = null, price_at_sale = null,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status, from_branch_id, to_branch_id,
      source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, v_inv.organization_id, 'returned', 'sold', 'in_stock', v_serial.current_branch_id, v_serial.current_branch_id,
      'invoice_sales', v_inv.id::text, v_inv.sale_id, v_inv.customer_id, v_uid, 'Anulación: ' || btrim(p_motivo)
    );
    v_seriales := v_seriales + 1;
  end loop;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_inv.id::text, 'void', v_uid,
          jsonb_build_object('number', v_inv.number, 'total', v_inv.total, 'productos_devueltos', v_devueltos,
                             'seriales_devueltos', v_seriales),
          btrim(p_motivo));

  return jsonb_build_object('id', v_inv.id, 'status', 'void', 'productos_devueltos', v_devueltos, 'seriales_devueltos', v_seriales);
end;
$function$;
