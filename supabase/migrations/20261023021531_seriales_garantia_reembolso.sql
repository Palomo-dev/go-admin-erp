-- Reembolso de garantía sobre procesar_devolucion.

create or replace function public.fn_garantia_int_reembolsar(p_org integer, p_claim uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_w public.warranty_claims%rowtype;
  v_sn public.serial_numbers%rowtype;
  v_sale uuid;
  v_item uuid;
  v_qty numeric;
  v_total numeric;
  v_unit numeric;
  v_monto numeric;
  v_motivo text;
  v_metodo text;
  v_res jsonb;
  v_lineas integer;
begin
  select * into v_w from public.warranty_claims where id = p_claim and organization_id = p_org for update;
  if not found then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  if v_w.return_id is not null or v_w.credit_note_invoice_id is not null then
    return jsonb_build_object(
      'return_id', v_w.return_id,
      'credit_note_invoice_id', v_w.credit_note_invoice_id,
      'repetida', true);
  end if;

  select * into v_sn from public.serial_numbers where id = v_w.serial_number_id and organization_id = p_org for update;
  if not found then
    raise exception 'serial_no_encontrado' using errcode = 'P0002';
  end if;
  if v_sn.sale_id is null or v_sn.sale_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  v_sale := v_sn.sale_id::uuid;

  if exists (
    select 1
      from public.return_lines rl
      join public.returns r on r.id = rl.return_id
     where r.organization_id = p_org
       and r.sale_id = v_sale
       and coalesce(r.status, 'processed') not in ('void', 'cancelled', 'anulado')
       and v_sn.id = any(rl.serial_ids)
  ) then
    raise exception 'unidad_ya_devuelta' using errcode = 'P0001';
  end if;

  select count(*) into v_lineas
    from public.sale_items si
   where si.sale_id = v_sale and si.product_id = v_sn.product_id;

  select si.id, si.quantity, si.total
    into v_item, v_qty, v_total
    from public.sale_items si
    join public.sales s on s.id = si.sale_id and s.organization_id = p_org
   where si.sale_id = v_sale
     and si.product_id = v_sn.product_id
     and (
       v_sn.id = any(coalesce(si.serial_ids, '{}'))
       or v_lineas = 1
     )
   order by (v_sn.id = any(coalesce(si.serial_ids, '{}'))) desc, si.created_at
   limit 1;
  if v_item is null then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;

  v_unit := round(coalesce(v_total, 0) / nullif(v_qty, 0), 2);
  begin
    v_monto := nullif(coalesce(p_datos, '{}'::jsonb)->>'monto', '')::numeric;
  exception when others then
    v_monto := null;
  end;
  if v_monto is not null and abs(v_monto - coalesce(v_unit, 0)) > 0.01 then
    raise exception 'monto_no_coincide' using errcode = '22023',
      detail = format('La unidad se vendió en %s', v_unit);
  end if;

  select rr.code into v_motivo
    from public.return_reasons rr
   where rr.organization_id = p_org and rr.is_active
   order by (upper(rr.code) = 'GARANTIA') desc, rr.id
   limit 1;
  if v_motivo is null then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;

  v_metodo := coalesce(nullif(btrim(coalesce(p_datos, '{}'::jsonb)->>'metodo'), ''), 'cash');
  v_res := public.procesar_devolucion(
    p_org,
    v_sale,
    jsonb_build_array(jsonb_build_object(
      'sale_item_id', v_item,
      'quantity', 1,
      'reason_code', v_motivo,
      'serial_ids', jsonb_build_array(v_sn.id),
      'serial_dispositions', jsonb_build_object(v_sn.id::text, 'damaged'),
      'restock', false,
      'movimiento_danado', true,
      'origen_garantia', true
    )),
    v_metodo,
    'Reembolso de garantía',
    nullif(btrim(coalesce(p_datos->>'notas', '')), ''),
    'garantia:' || p_claim::text
  );

  update public.warranty_claims
     set return_id = nullif(v_res->>'return_id', '')::integer,
         credit_note_invoice_id = nullif(v_res->>'credit_note_invoice_id', '')::uuid
   where id = p_claim and organization_id = p_org;

  return v_res;
end;
$function$;

comment on function public.fn_garantia_int_reembolsar(integer, uuid, jsonb) is
  'Reembolso de una garantía: una devolución de la unidad (dañada, con kardex de entrada y salida) sobre la venta del serial. El monto tiene que coincidir con lo cobrado por esa unidad. La llama fn_garantia_resolver antes de marcar el serial.';

revoke all on function public.fn_garantia_int_reembolsar(integer, uuid, jsonb) from public, anon, authenticated;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_garantia_resolver(integer,uuid,jsonb)'::regprocedure);
  v_nuevo text;
begin
  if position('reembolso_contable_20261023' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def,
    $old$  v_estado_reclamada := case
    when v_tipo = 'repair' then 'sold'
    when v_w.status = 'in_process' then 'rma'
    else 'damaged' end;

  update public.warranty_claims$old$,
    $new$  v_estado_reclamada := case
    when v_tipo = 'repair' then 'sold'
    when v_tipo = 'refund' then 'damaged'
    when v_w.status = 'in_process' then 'rma'
    else 'damaged' end;

  -- reembolso_contable_20261023: nota, asiento, caja e inventario antes de
  -- marcar el serial. Reparación y reemplazo no pasan por aquí.
  if v_tipo = 'refund' then
    perform public.fn_garantia_int_reembolsar(p_org, v_w.id, v_d);
  end if;

  update public.warranty_claims$new$);
  if v_nuevo = v_def then
    raise exception 'fn_garantia_resolver: no está el caso del reembolso';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    $old$  return jsonb_build_object('id', v_w.id, 'estado', 'resolved', 'tipo', v_tipo,
                            'reemplazo', case when v_tipo = 'replacement' then v_r.serial end);$old$,
    $new$  return jsonb_build_object('id', v_w.id, 'estado', 'resolved', 'tipo', v_tipo,
                            'reemplazo', case when v_tipo = 'replacement' then v_r.serial end,
                            'nota_credito', (
                              select jsonb_build_object('id', i.id, 'numero', i.number)
                                from public.warranty_claims w
                                join public.invoice_sales i on i.id = w.credit_note_invoice_id
                               where w.id = v_w.id and i.organization_id = p_org),
                            'devolucion_id', (select w.return_id from public.warranty_claims w where w.id = v_w.id));$new$);
  if v_nuevo = v_def then
    raise exception 'fn_garantia_resolver: no está el retorno';
  end if;
  execute v_nuevo;
end
$patch$;
