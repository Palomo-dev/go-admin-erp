-- Rollback de 20260924104430_factura_venta_guardar_y_seriales_al_emitir.sql
--
-- ADVERTENCIA: no revierte datos. Los borradores guardados con la RPC siguen
-- (son documentos reales); los seriales vendidos al emitir quedan vendidos.
-- Restaura fn_factura_venta_emitir y fn_factura_venta_anular como estaban en
-- 20260924075934 y quita las funciones nuevas.

drop function if exists public.fn_factura_venta_guardar(integer, uuid, jsonb);

-- ── 1 ── Emitir ─────────────────────────────────────────────────────────────
create or replace function public.fn_factura_venta_emitir(p_invoice_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_faltantes jsonb;
  v_numero text;
  v_descontar boolean;
  v_item record;
  v_lineas integer := 0;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'factura_no_borrador' using errcode = '22023';
  end if;
  if not exists (select 1 from public.invoice_items ii
                  where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id) then
    raise exception 'factura_sin_lineas' using errcode = '22023';
  end if;

  -- Faltantes de inventario (recetas incluidas): no se emite.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', s.product_id, 'producto', s.product_name,
                                                'requerido', s.required, 'disponible', s.available)), '[]'::jsonb)
    into v_faltantes
    from public.fn_invoice_stock_shortages(v_inv.id) s;
  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'stock_insuficiente' using errcode = '22023', detail = v_faltantes::text;
  end if;

  -- Número: el del borrador si ya lo tiene; si no, la resolución de la sucursal
  -- o el consecutivo FACT- de la organización (mismo criterio que el formulario).
  v_numero := nullif(btrim(coalesce(v_inv.number, '')), '');
  if v_numero is null then
    begin
      select n.invoice_number into v_numero
        from public.fn_get_next_invoice_number(v_inv.organization_id, v_inv.branch_id, 'invoice') n;
    exception when others then
      v_numero := null;
    end;
    if v_numero is null then
      perform pg_advisory_xact_lock(hashtextextended('numero_factura_venta:' || v_inv.organization_id, 0));
      select 'FACT-' || lpad((coalesce(max(nullif(regexp_replace(i.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
        into v_numero
        from public.invoice_sales i
       where i.organization_id = v_inv.organization_id
         and coalesce(i.document_type, 'invoice') = 'invoice'
         and i.number ~* '^FACT-?\d+$';
    end if;
  end if;

  update public.invoice_sales
     set status = 'issued', number = v_numero, updated_at = now()
   where id = v_inv.id;
  -- La cartera nace por tr_update_account_receivable; issue_invoice la llamaba
  -- a mano: se conserva la llamada por si el disparador estuviera apagado.
  perform public.create_account_receivable(v_inv.id::text);

  -- Inventario: una sola salida (L3).
  v_descontar := not (v_inv.sale_id is not null and exists (
    select 1 from public.stock_movements sm
     where sm.source_id = v_inv.sale_id::text and sm.source in ('sale', 'mesa_sale', 'web_sale')));
  if v_descontar then
    for v_item in
      select ii.product_id, sum(ii.qty) as qty, max(ii.unit_price) as unit_price
        from public.invoice_items ii
       where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id
         and ii.product_id is not null and coalesce(ii.qty, 0) > 0
       group by ii.product_id
    loop
      perform public.decrement_stock_with_recipe(
        v_inv.organization_id, v_inv.branch_id, v_item.product_id, v_item.qty,
        'invoice_sale', coalesce(v_inv.sale_id::text, v_inv.id::text), v_item.unit_price, v_uid,
        'Factura ' || v_numero);
      v_lineas := v_lineas + 1;
    end loop;
  end if;

  return jsonb_build_object('id', v_inv.id, 'numero', v_numero, 'status', 'issued',
                            'stock_descontado', v_descontar and v_lineas > 0, 'productos', v_lineas);
end;
$function$;

revoke all on function public.fn_factura_venta_emitir(uuid) from public, anon;
grant execute on function public.fn_factura_venta_emitir(uuid) to authenticated, service_role;

-- ── 2 ── Anular ─────────────────────────────────────────────────────────────
create or replace function public.fn_factura_venta_anular(p_invoice_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_mov record;
  v_devueltos integer := 0;
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
  -- L4: con pagos va por nota crédito (misma regla que puedeAnular).
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

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_inv.id::text, 'void', v_uid,
          jsonb_build_object('number', v_inv.number, 'total', v_inv.total, 'productos_devueltos', v_devueltos),
          btrim(p_motivo));

  return jsonb_build_object('id', v_inv.id, 'status', 'void', 'productos_devueltos', v_devueltos);
end;
$function$;

revoke all on function public.fn_factura_venta_anular(uuid, text) from public, anon;
grant execute on function public.fn_factura_venta_anular(uuid, text) to authenticated, service_role;

drop function if exists public.fn_seriales_vender(integer, integer[], uuid, uuid, integer, uuid, numeric, text, uuid);
