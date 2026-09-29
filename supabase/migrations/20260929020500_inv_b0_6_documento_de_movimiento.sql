-- Inventario B0 · 6/7 — Documento legible de cada movimiento de kardex
-- docs/implementacion/INVENTARIO-PLAN.md §5.1 (migración 5) y §2 F12.
--
-- Hoy ningún movimiento enlaza a su documento: getSourceRoute tenía rutas 404 y
-- solo conocía 5 orígenes. fn_inv_documentos resuelve, en lote (una página del
-- kardex), el tipo de documento, su número legible y la ruta de la pantalla que
-- lo muestra, para los 24 orígenes del CHECK de stock_movements.source.
-- Solo resuelve documentos de la organización pedida: si el id no existe o es de
-- otra organización devuelve el tipo sin número ni ruta (no filtra datos ajenos).
--
-- Contrato (src/lib/inventario/nucleo/tipos.ts → DocumentoMovimiento):
--   fn_inv_documentos(p_org, p_refs jsonb [{source, source_id, product_id?}])
--     → jsonb [{source, source_id, product_id, tipo, numero, ruta}]   (máx. 500)
--   fn_documento_de_movimiento(p_org, p_source, p_source_id, p_product_id)
--     → jsonb {source, source_id, product_id, tipo, numero, ruta}
--
--   tipo ∈ venta · factura_venta · nota_credito · devolucion · anulacion_venta ·
--          factura_compra · orden_compra · ajuste · traslado · orden_produccion ·
--          folio · pedido_web · producto · otro
--
-- Cuando B2, B3 y B5 añadan `code` a ajustes, traslados y órdenes de producción,
-- actualizan aquí el número (hoy AJ-<id>, TR-<id>, OP-<id>).

create or replace function public.fn_inv_documentos(p_org integer, p_refs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref jsonb;
  v_out jsonb := '[]'::jsonb;
  v_s text;
  v_id text;
  v_pid integer;
  v_uuid uuid;
  v_int integer;
  v_tipo text;
  v_num text;
  v_ruta text;
  v_x record;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if jsonb_typeof(p_refs) is distinct from 'array' then
    raise exception 'refs_invalidas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_refs) > 500 then
    raise exception 'demasiadas_referencias' using errcode = '22023', detail = 'máximo 500';
  end if;

  for v_ref in select * from jsonb_array_elements(p_refs) loop
    v_s := v_ref->>'source';
    v_id := nullif(btrim(v_ref->>'source_id'), '');
    v_pid := case when (v_ref->>'product_id') ~ '^[0-9]{1,9}$' then (v_ref->>'product_id')::integer end;
    v_uuid := case when v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id::uuid end;
    v_int := case when v_id ~ '^[0-9]{1,9}$' then v_id::integer end;
    v_tipo := 'otro';
    v_num := null;
    v_ruta := null;

    if v_s in ('sale', 'mesa_sale', 'web_sale') then
      v_tipo := 'venta';
      select s.id into v_x from public.sales s where s.id = v_uuid and s.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce((select i.number from public.invoice_sales i
                            where i.sale_id = v_uuid and i.organization_id = p_org
                              and coalesce(i.document_type, '') <> 'credit_note' and i.number is not null
                            order by i.created_at limit 1), upper(left(v_id, 8)));
        v_ruta := '/app/pos/ventas/' || v_id;
      end if;

    elsif v_s in ('invoice_sale', 'invoice_void') then
      v_tipo := 'factura_venta';
      select i.id, i.number into v_x from public.invoice_sales i where i.id = v_uuid and i.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.number, upper(left(v_id, 8)));
        v_ruta := '/app/finanzas/facturas-venta/' || v_id;
      else
        -- La factura emitida desde una venta usa el id de la venta como origen.
        select s.id into v_x from public.sales s where s.id = v_uuid and s.organization_id = p_org;
        if v_x.id is not null then
          v_tipo := 'venta';
          v_num := coalesce((select i.number from public.invoice_sales i
                              where i.sale_id = v_uuid and i.organization_id = p_org
                                and coalesce(i.document_type, '') <> 'credit_note' and i.number is not null
                              order by i.created_at limit 1), upper(left(v_id, 8)));
          v_ruta := '/app/pos/ventas/' || v_id;
        end if;
      end if;

    elsif v_s in ('credit_note', 'credit_note_void') then
      v_tipo := 'nota_credito';
      select i.id, i.number into v_x from public.invoice_sales i where i.id = v_uuid and i.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.number, upper(left(v_id, 8)));
        v_ruta := '/app/finanzas/notas-credito/' || v_id;
      end if;

    elsif v_s = 'return' then
      if v_id like 'anulacion:%' then
        v_tipo := 'anulacion_venta';
        v_id := substr(v_id, length('anulacion:') + 1);
        v_uuid := case when v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id::uuid end;
        select s.id into v_x from public.sales s where s.id = v_uuid and s.organization_id = p_org;
        if v_x.id is not null then
          v_num := upper(left(v_id, 8));
          v_ruta := '/app/pos/ventas/' || v_id;
        end if;
        v_id := v_ref->>'source_id';
      else
        v_tipo := 'devolucion';
        select r.id, r.sale_id into v_x from public.returns r where r.id = v_int and r.organization_id = p_org;
        if v_x.id is not null then
          v_num := 'DEV-' || v_x.id;
          v_ruta := case when v_x.sale_id is not null then '/app/pos/ventas/' || v_x.sale_id end;
        end if;
      end if;

    elsif v_s in ('purchase', 'purchase_invoice', 'purchase_void') then
      v_tipo := 'factura_compra';
      select f.id, f.number_ext into v_x from public.invoice_purchase f where f.id = v_uuid and f.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.number_ext, upper(left(v_id, 8)));
        v_ruta := '/app/finanzas/facturas-compra/' || v_id;
      end if;

    elsif v_s = 'purchase_order' then
      v_tipo := 'orden_compra';
      select po.id, po.uuid into v_x from public.purchase_orders po
       where po.organization_id = p_org and (po.id = v_int or po.uuid = v_uuid);
      if v_x.id is not null then
        v_num := 'OC-' || v_x.id;
        v_ruta := '/app/inventario/ordenes-compra/' || v_x.uuid;
      end if;

    elsif v_s = 'adjustment' then
      v_tipo := 'ajuste';
      select a.id into v_x from public.inventory_adjustments a where a.id = v_int and a.organization_id = p_org;
      if v_x.id is not null then
        v_num := 'AJ-' || v_x.id;
        v_ruta := '/app/inventario/ajustes/' || v_x.id;
      end if;

    elsif v_s in ('transfer', 'transfer_in', 'transfer_out') then
      v_tipo := 'traslado';
      select t.id into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;
      if v_x.id is not null then
        v_num := 'TR-' || v_x.id;
        v_ruta := '/app/inventario/transferencias/' || v_x.id;
      end if;

    elsif v_s = 'production' then
      v_tipo := 'orden_produccion';
      select o.id into v_x from public.production_orders o where o.id = v_int and o.organization_id = p_org;
      if v_x.id is not null then
        v_num := 'OP-' || v_x.id;
        v_ruta := '/app/inventario/produccion?orden=' || v_x.id;
      end if;

    elsif v_s in ('folio_item', 'room_consumption', 'folio_item_reversal') then
      v_tipo := 'folio';
      select r.id into v_x
        from public.folios f join public.reservations r on r.id = f.reservation_id
       where f.id = v_uuid and r.organization_id = p_org;
      if v_x.id is not null then
        v_num := upper(left(v_x.id::text, 8));
        v_ruta := '/app/pms/reservas/' || v_x.id;
      end if;

    elsif v_s in ('web_order', 'web_refund') then
      v_tipo := 'pedido_web';
      select w.id, w.order_number into v_x from public.web_orders w where w.id = v_uuid and w.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.order_number, upper(left(v_id, 8)));
        v_ruta := '/app/pos/pedidos-online/' || v_id;
      end if;

    elsif v_s in ('initial', 'loss') then
      v_tipo := 'producto';
    end if;

    -- Sin documento propio (apertura, pérdida, ajuste masivo): el producto.
    if v_ruta is null and v_tipo in ('producto', 'ajuste', 'otro') and v_pid is not null
       and exists (select 1 from public.products p where p.id = v_pid and p.organization_id = p_org) then
      v_ruta := '/app/inventario/productos/' || v_pid;
      if v_tipo = 'otro' then
        v_tipo := 'producto';
      end if;
    end if;

    v_out := v_out || jsonb_build_object('source', v_s, 'source_id', v_ref->>'source_id', 'product_id', v_pid,
                                         'tipo', v_tipo, 'numero', v_num, 'ruta', v_ruta);
  end loop;

  return v_out;
end;
$$;

create or replace function public.fn_documento_de_movimiento(
  p_org integer, p_source text, p_source_id text, p_product_id integer default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_inv_documentos(p_org, jsonb_build_array(
    jsonb_build_object('source', p_source, 'source_id', p_source_id, 'product_id', p_product_id))) -> 0;
$$;

revoke all on function public.fn_inv_documentos(integer, jsonb) from anon, public;
revoke all on function public.fn_documento_de_movimiento(integer, text, text, integer) from anon, public;
grant execute on function public.fn_inv_documentos(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_documento_de_movimiento(integer, text, text, integer) to authenticated, service_role;
