-- Reversión de 20261125233000_anticipo_2805_nota_contador.sql
--
-- 1. Devuelve el texto anterior a los asientos de ajuste (memo y descripción de líneas):
--    «Ajuste: anticipo de contraentrega de 1305 a 2805 - pedido WO-…».
-- 2. Devuelve fn_trg_anticipo_pedido_web_aplicado al texto de 20261125120000.
-- Los cruces registrados mientras estuvo la versión nueva conservan su nota (no se editan
-- asientos por una reversión de texto).

DO $nota$
begin
  perform set_config('app.contabilidad_mantenimiento', 'on', true);

  update public.journal_entries e set
    memo = 'Ajuste: anticipo de contraentrega de 1305 a 2805 - pedido ' || w.order_number,
    updated_at = now()
    from public.web_orders w
   where e.fact_key like 'web_order_advance:reclass:%'
     and e.source = 'web_order_advance'
     and w.id::text = e.source_id
     and w.organization_id = e.organization_id
     and e.memo like 'Reclasificación anticipo contraentrega a 2805 · %';

  update public.journal_lines l set
    description = e.memo,
    updated_at = now()
    from public.journal_entries e
   where l.journal_entry_id = e.id
     and e.fact_key like 'web_order_advance:reclass:%'
     and e.memo like 'Ajuste: anticipo de contraentrega de 1305 a 2805%'
     and l.description like 'Reclasificación anticipo contraentrega a 2805 · %';

  perform set_config('app.contabilidad_mantenimiento', '', true);
end
$nota$;

CREATE OR REPLACE FUNCTION public.fn_trg_anticipo_pedido_web_aplicado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido uuid;
  v_wo record;
begin
  if not (old.source = 'web_order' and new.source = 'invoice_sales'
          and coalesce(new.processor_response->>'concepto', '') = 'anticipo_contraentrega'
          and coalesce(new.status, 'completed') = 'completed') then
    return new;
  end if;
  -- Solo si el anticipo está en 2805: si el recibo falló o quedó en 1305 sin reclasificar,
  -- el cruce dejaría 2805 en negativo.
  if not public.fn_anticipo_en_2805(new.id) then
    return new;
  end if;
  begin
    v_pedido := old.source_id::uuid;
  exception when others then
    return new;
  end;
  select w.id, w.organization_id, w.branch_id, w.order_number into v_wo
    from public.web_orders w where w.id = v_pedido and w.organization_id = new.organization_id;
  if v_wo.id is null then
    return new;
  end if;
  perform public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := coalesce(new.branch_id, v_wo.branch_id),
    p_entry_date := now(),
    p_memo := 'Anticipo de contraentrega aplicado a la factura - pedido ' || v_wo.order_number,
    p_source := 'web_order_advance',
    p_source_id := v_wo.id::text,
    p_debit_account := '2805',
    p_credit_account := '1305',
    p_amount := new.amount,
    p_created_by := coalesce(auth.uid(), new.created_by),
    p_fact_key := 'web_order_advance:apply:' || new.id::text
  );
  return new;
end;
$function$;
