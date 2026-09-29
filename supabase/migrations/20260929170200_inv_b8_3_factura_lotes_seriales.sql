-- Inventario B8 · Lotes y seriales en la recepción de la FACTURA de compra
-- (INVENTARIO-PLAN.md §5.9, 2.ª parte) y una sola forma de crear el lote y los
-- seriales de una recepción (OC o factura; regla dura 7).
--
-- Antes (2026-09-29):
-- * La factura de compra creaba sus seriales al GUARDAR el borrador
--   (fn_fc_guardar_int), `in_stock` antes de que la mercancía entrara, y el
--   repetido se «omitía» sin más (plan §2 F2.5).
-- * La recepción de la factura (fn_fc_recepcionar_int) no admitía lote ni
--   vencimiento ni pasaba los seriales a la primitiva.
--
-- Ahora:
-- * fn_inv_int_lote_de_recepcion: busca el lote por código (o id) o lo crea;
--   mismo lote con otro vencimiento → `lote_vencimiento_distinto`. Interna: la
--   llaman fn_oc_recepcionar y fn_fc_recepcionar_int después de exigir su
--   permiso (no pasa por fn_lote_guardar para no pedir un segundo permiso de
--   catálogo a quien ya puede recibir).
-- * fn_inv_int_seriales_de_recepcion: crea los seriales «en tránsito» (únicos
--   por organización, P8; solo el plazo de garantía, B4) para que la primitiva
--   los deje in_stock al mover el kardex.
-- * fn_fc_recepcionar_int(p_id, p_lotes): lotes por línea (por invoice_item_id,
--   o por product_id si el producto está en una sola línea), obligatorios si el
--   producto maneja lotes; los seriales de la línea se crean AL RECIBIR y viajan
--   a la primitiva. La de un argumento queda como envoltura (p_lotes = null).
-- * fn_fc_confirmar_int(…, p_lotes) y las públicas fn_factura_compra_confirmar
--   y fn_factura_compra_recepcionar con p_lotes (sobrecargas: las firmas de
--   siempre siguen igual y con los mismos permisos).
-- * fn_fc_guardar_int ya no crea seriales: solo avisa en `omitidos` si alguno
--   ya existe en la organización (la recepción lo rechazaría).
-- * fn_oc_recepcionar usa los dos ayudantes (mismo comportamiento).
-- Datos: 0 líneas de factura de compra con seriales hoy; nada que migrar.

-- ── 0. Respaldo y comprobación de las definiciones vivas ─────────────────────
do $$
declare
  v_esperado constant jsonb := jsonb_build_object(
    'fn_fc_guardar_int(integer,jsonb,uuid)', '2d246b7890a40404487056b8c30c095d',
    'fn_fc_recepcionar_int(uuid)', '188410fb7bd0cdcdcd2b3ae29369862d',
    'fn_fc_confirmar_int(uuid,boolean,boolean,uuid)', '66c528000c23438cefd0ef3feb8f0180');
  v_firma text;
  v_def text;
begin
  for v_firma in select jsonb_object_keys(v_esperado) loop
    v_def := pg_get_functiondef(('public.' || v_firma)::regprocedure);
    if position('B8 (inventario)' in v_def) > 0 then
      continue; -- ya aplicada
    end if;
    if md5(v_def) <> v_esperado->>v_firma then
      raise exception 'La definición viva de % cambió desde que se escribió esta migración (md5 %). Releer y rehacer el parche.',
        v_firma, md5(v_def);
    end if;
    insert into private.respaldo_funciones (migracion, firma, definicion, md5)
    values ('20260929170200_inv_b8_3', v_firma, v_def, md5(v_def))
    on conflict (migracion, firma) do nothing;
  end loop;
end $$;

-- ── 1. Ayudantes internos ────────────────────────────────────────────────────
create or replace function public.fn_inv_int_lote_de_recepcion(
  p_org integer, p_product integer, p_supplier integer, p_branch integer, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lote public.lots%rowtype;
  v_code text := left(nullif(btrim(coalesce(p_lote->>'lot_code', '')), ''), 60);
  v_exp date;
  v_base text;
  v_n integer := 1;
begin
  if nullif(p_lote->>'expiry_date', '') is not null then
    if p_lote->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'fecha_invalida' using errcode = '22023';
    end if;
    v_exp := (p_lote->>'expiry_date')::date;
  end if;

  if coalesce(p_lote->>'lot_id', '') ~ '^\d{1,9}$' then
    select * into v_lote from public.lots l
     where l.id = (p_lote->>'lot_id')::integer and l.organization_id = p_org and l.product_id = p_product
     for update;
    if v_lote.id is null then
      raise exception 'lote_invalido' using errcode = '22023', detail = (p_lote->>'lot_id');
    end if;
  else
    if v_code is not null then
      select * into v_lote from public.lots l
       where l.organization_id = p_org and l.product_id = p_product and l.lot_code = v_code
       for update;
    else
      -- Sin código: L-AAAAMMDD (día de la organización), como el alta de lotes.
      v_base := 'L-' || to_char((now() at time zone coalesce(public.fn_timezone_for(p_org, p_branch), 'America/Bogota'))::date, 'YYYYMMDD');
      v_code := v_base;
      while exists (select 1 from public.lots x where x.organization_id = p_org and x.product_id = p_product and x.lot_code = v_code) loop
        v_n := v_n + 1;
        v_code := v_base || '-' || v_n;
      end loop;
    end if;
    if v_lote.id is null then
      begin
        insert into public.lots (organization_id, product_id, lot_code, expiry_date, supplier_id, branch_id, created_by)
        values (p_org, p_product, v_code, v_exp, p_supplier, p_branch, auth.uid())
        returning * into v_lote;
      exception when unique_violation then
        raise exception 'lote_repetido' using errcode = '23505', detail = v_code;
      end;
    end if;
  end if;

  -- Mismo lote con otro vencimiento: error legible. Sin vencimiento previo, se completa.
  if v_exp is not null then
    if v_lote.expiry_date is null then
      update public.lots set expiry_date = v_exp, updated_at = now() where id = v_lote.id;
      v_lote.expiry_date := v_exp;
    elsif v_lote.expiry_date <> v_exp then
      raise exception 'lote_vencimiento_distinto' using errcode = '22023',
        detail = jsonb_build_object('lot_code', v_lote.lot_code, 'vence', v_lote.expiry_date, 'recibido', v_exp)::text;
    end if;
  end if;

  return jsonb_build_object('lot_id', v_lote.id, 'lot_code', v_lote.lot_code, 'expiry_date', v_lote.expiry_date);
end;
$function$;

create or replace function public.fn_inv_int_seriales_de_recepcion(
  p_org integer, p_product integer, p_branch integer, p_lot integer, p_supplier integer,
  p_po_id integer, p_invoice uuid, p_cost numeric, p_warranty_months integer, p_seriales text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_s text;
  v_id integer;
  v_res jsonb := '[]'::jsonb;
begin
  foreach v_s in array coalesce(p_seriales, '{}'::text[]) loop
    v_id := null;
    -- Un serial que esta misma factura ya había creado al guardarse (antes de B8) se reutiliza.
    if p_invoice is not null then
      select s.id into v_id from public.serial_numbers s
       where s.organization_id = p_org and s.serial = v_s and s.product_id = p_product
         and s.purchase_invoice_id = p_invoice and s.status in ('in_stock', 'in_transit');
    end if;
    if v_id is null then
      if exists (select 1 from public.serial_numbers s where s.organization_id = p_org and s.serial = v_s) then
        raise exception 'serial_repetido' using errcode = '23505', detail = v_s;
      end if;
      begin
        insert into public.serial_numbers (
          product_id, serial, status, organization_id, branch_id, lot_id, supplier_id, purchase_order_id,
          purchase_invoice_id, cost_at_purchase, received_date, warranty_months, updated_by)
        values (p_product, v_s, 'in_transit', p_org, p_branch, p_lot, p_supplier, p_po_id,
                p_invoice, coalesce(p_cost, 0), now(), p_warranty_months, auth.uid())
        returning id into v_id;
      exception when unique_violation then
        -- La unicidad global (serial_numbers_serial_key) sigue hasta P8 fase 2:
        -- no se dice de quién es el serial.
        raise exception 'serial_repetido' using errcode = '23505';
      end;
    end if;
    v_res := v_res || jsonb_build_object('id', v_id, 'serial', v_s);
  end loop;
  return v_res;
end;
$function$;

comment on function public.fn_inv_int_lote_de_recepcion(integer, integer, integer, integer, jsonb) is
  'B8 · Lote de una recepción (OC o factura de compra): lo busca por id o código o lo crea; otro vencimiento → lote_vencimiento_distinto. Interna.';
comment on function public.fn_inv_int_seriales_de_recepcion(integer, integer, integer, integer, integer, integer, uuid, numeric, integer, text[]) is
  'B8 · Seriales de una recepción: únicos por organización, en tránsito y solo con el plazo de garantía; la primitiva los deja in_stock. Interna.';

revoke all on function public.fn_inv_int_lote_de_recepcion(integer, integer, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_inv_int_seriales_de_recepcion(integer, integer, integer, integer, integer, integer, uuid, numeric, integer, text[])
  from public, anon, authenticated;

-- ── 2. Recepción de la factura con lotes y seriales ─────────────────────────
create or replace function public.fn_fc_recepcionar_int(p_id uuid, p_lotes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- B8 (inventario): lotes por línea y seriales creados al recibir.
  v_inv public.invoice_purchase%rowtype;
  v_iva_al_costo boolean;
  v_lineas jsonb := '[]'::jsonb;
  v_res jsonb;
  v_desde timestamptz;
  v_ii record;
  v_costo numeric;
  v_lotes jsonb;
  v_trozos jsonb;
  v_trozo jsonb;
  v_q numeric;
  v_suma numeric;
  v_lote jsonb;
  v_lot_id integer;
  v_seriales text[];
  v_pos integer;
  v_ser_ids integer[];
  v_lotes_res jsonb := '[]'::jsonb;
begin
  select * into v_inv from public.invoice_purchase where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'NO_CONFIRMADA' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided') then
    raise exception 'ANULADA' using errcode = '22023';
  end if;
  if v_inv.stock_received_at is not null then
    return jsonb_build_object('ya_recepcionado', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;
  if p_lotes is not null and jsonb_typeof(p_lotes) <> 'array' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  -- Recepciones hechas por los caminos viejos (`purchase` o `purchase_invoice`).
  select min(created_at) into v_desde from public.stock_movements
   where organization_id = v_inv.organization_id and source in ('purchase', 'purchase_invoice')
     and source_id = p_id::text and direction = 'in';
  if v_desde is not null then
    update public.invoice_purchase set stock_received_at = v_desde where id = p_id;
    return jsonb_build_object('ya_recepcionado', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  -- La mercancía de una factura que viene de una OC ya entró con la recepción de la OC.
  if v_inv.po_id is not null and exists (
    select 1 from public.stock_movements
     where organization_id = v_inv.organization_id and source = 'purchase_order'
       and source_id = v_inv.po_id::text and direction = 'in'
  ) then
    update public.invoice_purchase set stock_received_at = now() where id = p_id;
    return jsonb_build_object('ya_recepcionado', false, 'recibido_por_orden', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  -- Cada entrada de lotes debe corresponder a una línea de esta factura.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) e
     where not exists (
       select 1 from public.invoice_items ii
        where (ii.invoice_purchase_id = p_id or (ii.invoice_id = p_id and ii.invoice_type = 'purchase'))
          and (ii.id::text = e->>'invoice_item_id'
               or (nullif(e->>'invoice_item_id', '') is null and ii.product_id::text = e->>'product_id')))
  ) then
    raise exception 'lotes_sin_linea' using errcode = '22023';
  end if;

  -- D6: el costo es neto de descuento y, para responsables de IVA, sin el IVA
  -- descontable. Para no responsables (R-99-PN sin O-48), el IVA va al costo.
  select coalesce('R-99-PN' = any(o.fiscal_responsibilities) and not ('O-48' = any(o.fiscal_responsibilities)), false)
    into v_iva_al_costo
    from public.organizations o where o.id = v_inv.organization_id;

  for v_ii in
    select ii.id, ii.product_id, ii.qty, ii.unit_price, ii.discount_amount, ii.tax_rate, ii.total_line, ii.serial_numbers,
           p.name, p.track_stock, coalesce(p.track_lots, false) as track_lots,
           coalesce(p.track_serial, false) as track_serial, p.warranty_months,
           count(*) over (partition by ii.product_id) as mismas
      from public.invoice_items ii
      left join public.products p on p.id = ii.product_id
     where ii.invoice_purchase_id = p_id or (ii.invoice_id = p_id and ii.invoice_type = 'purchase')
     order by ii.created_at, ii.id
  loop
    v_costo := case when v_ii.qty > 0 then round(
                 (case
                    when coalesce(v_iva_al_costo, false) then v_ii.total_line
                    when v_inv.tax_included and coalesce(v_ii.tax_rate, 0) > 0
                      then round((v_ii.qty * v_ii.unit_price - coalesce(v_ii.discount_amount, 0)) / (1 + v_ii.tax_rate / 100), 2)
                    else v_ii.qty * v_ii.unit_price - coalesce(v_ii.discount_amount, 0)
                  end) / v_ii.qty, 6) else 0 end;

    -- Sin producto, sin cantidad o sin control de existencias: como antes, el
    -- kardex la salta y lo informa en «saltadas».
    if v_ii.product_id is null or coalesce(v_ii.qty, 0) <= 0 or v_ii.track_stock is not true then
      v_lineas := v_lineas || jsonb_build_object('product_id', v_ii.product_id, 'qty', v_ii.qty, 'unit_cost', v_costo);
      continue;
    end if;

    select e->'lotes' into v_lotes
      from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) e
     where e->>'invoice_item_id' = v_ii.id::text
        or (nullif(e->>'invoice_item_id', '') is null and e->>'product_id' = v_ii.product_id::text and v_ii.mismas = 1)
     order by (e->>'invoice_item_id' = v_ii.id::text) desc nulls last
     limit 1;
    if v_lotes is null or jsonb_typeof(v_lotes) <> 'array' then
      v_lotes := '[]'::jsonb;
    end if;
    if jsonb_array_length(v_lotes) = 0 then
      if v_ii.track_lots then
        raise exception 'lote_requerido' using errcode = '22023',
          detail = jsonb_build_object('producto', v_ii.name, 'invoice_item_id', v_ii.id)::text;
      end if;
      v_trozos := jsonb_build_array(jsonb_build_object('qty', v_ii.qty));
    else
      select coalesce(sum(round(nullif(x->>'qty', '')::numeric, 3)), 0) into v_suma from jsonb_array_elements(v_lotes) x;
      if v_suma <> round(v_ii.qty, 3) or exists (select 1 from jsonb_array_elements(v_lotes) x
                                                  where coalesce(round(nullif(x->>'qty', '')::numeric, 3), 0) <= 0) then
        raise exception 'lotes_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('producto', v_ii.name, 'cantidad', v_ii.qty, 'lotes', v_suma)::text;
      end if;
      v_trozos := v_lotes;
    end if;

    -- Seriales de la línea (en orden, sin repetir): se crean AHORA, al recibir.
    select coalesce(array_agg(s order by o), '{}') into v_seriales
      from (select btrim(x) s, min(o) o
              from unnest(coalesce(v_ii.serial_numbers, '{}'::text[])) with ordinality t(x, o)
             where btrim(x) <> '' group by btrim(x)) q;
    if cardinality(v_seriales) > 0 or v_ii.track_serial then
      if cardinality(v_seriales) <> v_ii.qty then
        raise exception 'seriales_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('producto', v_ii.name, 'cantidad', v_ii.qty, 'seriales', cardinality(v_seriales))::text;
      end if;
    end if;

    v_pos := 1;
    for v_trozo in select * from jsonb_array_elements(v_trozos) loop
      v_q := round((v_trozo->>'qty')::numeric, 3);
      v_lot_id := null;
      if jsonb_array_length(v_lotes) > 0 then
        v_lote := public.fn_inv_int_lote_de_recepcion(v_inv.organization_id, v_ii.product_id, v_inv.supplier_id, v_inv.branch_id, v_trozo);
        v_lot_id := (v_lote->>'lot_id')::integer;
        v_lotes_res := v_lotes_res || (v_lote || jsonb_build_object('invoice_item_id', v_ii.id, 'qty', v_q));
      end if;
      v_ser_ids := '{}';
      if cardinality(v_seriales) > 0 then
        if v_q <> trunc(v_q) then
          raise exception 'cantidad_serial_entera' using errcode = '22023';
        end if;
        select coalesce(array_agg((x->>'id')::integer), '{}') into v_ser_ids
          from jsonb_array_elements(public.fn_inv_int_seriales_de_recepcion(
                 v_inv.organization_id, v_ii.product_id, v_inv.branch_id, v_lot_id, v_inv.supplier_id, null, p_id,
                 v_costo, v_ii.warranty_months, v_seriales[v_pos : v_pos + v_q::integer - 1])) x;
        v_pos := v_pos + v_q::integer;
      end if;
      v_lineas := v_lineas || jsonb_build_object('product_id', v_ii.product_id, 'qty', v_q, 'unit_cost', v_costo,
                                                 'lot_id', v_lot_id, 'serial_ids', to_jsonb(v_ser_ids));
    end loop;
  end loop;

  v_res := public.fn_kardex_entrada_compra_int(
    v_inv.organization_id, v_inv.branch_id, 'purchase', p_id::text, v_lineas, auth.uid(), v_inv.supplier_id, true);

  update public.invoice_purchase set stock_received_at = now() where id = p_id;
  return v_res || jsonb_build_object('lotes', v_lotes_res);
end;
$function$;

create or replace function public.fn_fc_recepcionar_int(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- B8 (inventario): envoltura de la firma de siempre (sin lotes).
  return public.fn_fc_recepcionar_int(p_id, null::jsonb);
end;
$function$;

revoke all on function public.fn_fc_recepcionar_int(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_fc_recepcionar_int(uuid) from public, anon, authenticated;

-- ── 3. Confirmar con lotes ───────────────────────────────────────────────────
create or replace function public.fn_fc_confirmar_int(p_id uuid, p_recepcionar boolean, p_generar_ds boolean, p_user uuid, p_lotes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- B8 (inventario): igual que la de 4 argumentos, con los lotes de la recepción.
  v_inv public.invoice_purchase%rowtype;
  v_ap uuid;
  v_rec jsonb := null;
  v_ds uuid := null;
begin
  select * into v_inv from public.invoice_purchase where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_inv.organization_id);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  if v_inv.status <> 'draft' then
    raise exception 'YA_CONFIRMADA' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.invoice_items ii
     where ii.invoice_purchase_id = p_id or (ii.invoice_id = p_id and ii.invoice_type = 'purchase')
  ) then
    raise exception 'SIN_LINEAS' using errcode = '22023';
  end if;

  -- El devengo lo registra `trg_auto_journal_purchase` con el total ya calculado
  -- por las líneas; la CxP la crea `trg_cxp_desde_factura`.
  update public.invoice_purchase set status = 'received', updated_at = now() where id = p_id;

  v_ap := public.fn_cxp_asegurar_de_factura(p_id);
  perform public.fn_fc_recalcular_saldo(p_id);

  if p_recepcionar then
    v_rec := public.fn_fc_recepcionar_int(p_id, p_lotes);
  end if;
  if p_generar_ds then
    v_ds := public.fn_fc_crear_ds_int(p_id, p_user);
  end if;

  return jsonb_build_object(
    'invoice_id', p_id,
    'status', 'received',
    'accounts_payable_id', v_ap,
    'recepcion', v_rec,
    'support_document_id', v_ds
  );
end;
$function$;

create or replace function public.fn_fc_confirmar_int(p_id uuid, p_recepcionar boolean, p_generar_ds boolean, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- B8 (inventario): envoltura de la firma de siempre (sin lotes).
  return public.fn_fc_confirmar_int(p_id, p_recepcionar, p_generar_ds, p_user, null::jsonb);
end;
$function$;

revoke all on function public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid) from public, anon, authenticated;

-- Públicas con lotes (sobrecargas sin valores por defecto: las llamadas de
-- siempre, sin p_lotes, siguen resolviendo a las firmas de siempre).
create or replace function public.fn_factura_compra_confirmar(p_id uuid, p_recepcionar boolean, p_generar_ds boolean, p_lotes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select organization_id into v_org from public.invoice_purchase where id = p_id;
  if v_org is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if p_recepcionar then
    perform public.fn_finanzas_exigir_permiso(v_org, array['inventory.create']);
  end if;
  return public.fn_fc_confirmar_int(p_id, coalesce(p_recepcionar, true), coalesce(p_generar_ds, false), auth.uid(), p_lotes);
end;
$function$;

create or replace function public.fn_factura_compra_recepcionar(p_id uuid, p_lotes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inv record;
begin
  select organization_id, branch_id into v_inv from public.invoice_purchase where id = p_id;
  if v_inv.organization_id is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['inventory.create']);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  return public.fn_fc_recepcionar_int(p_id, p_lotes);
end;
$function$;

revoke all on function public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb) from public, anon;
revoke all on function public.fn_factura_compra_recepcionar(uuid, jsonb) from public, anon;
grant execute on function public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb) to authenticated;
grant execute on function public.fn_factura_compra_recepcionar(uuid, jsonb) to authenticated;

-- ── 4. fn_fc_guardar_int: los seriales ya no se crean al guardar ─────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure);
  v_ini constant text := '    -- L14: seriales `in_stock` con proveedor, factura y costo; un serial ya';
  v_fin constant text := E'      end loop;\n    end if;\n';
  v_nuevo constant text := E'    -- B8 (inventario): los seriales se crean al RECIBIR la mercancía\n'
    || E'    -- (fn_fc_recepcionar_int), no al guardar el borrador; aquí solo se avisa si\n'
    || E'    -- alguno ya existe en la organización (la recepción lo rechazaría).\n'
    || E'    if v_prod is not null then\n'
    || E'      foreach v_s in array coalesce(v_seriales, ''{}''::text[]) loop\n'
    || E'        if exists (select 1 from public.serial_numbers sn\n'
    || E'                    where sn.organization_id = p_org and sn.serial = v_s\n'
    || E'                      and sn.purchase_invoice_id is distinct from v_id) then\n'
    || E'          v_omitidos := v_omitidos || jsonb_build_object(''serial'', v_s, ''product_id'', v_prod, ''reason'', ''serial_duplicado'');\n'
    || E'        end if;\n'
    || E'      end loop;\n'
    || E'    end if;\n';
  v_i integer;
  v_j integer;
begin
  if position('B8 (inventario)' in v_def) > 0 then
    return;
  end if;
  v_i := position(v_ini in v_def);
  if v_i = 0 or position(v_ini in substring(v_def from v_i + 1)) > 0 then
    raise exception 'fn_fc_guardar_int: el marcador de inicio no aparece exactamente una vez';
  end if;
  v_j := position(v_fin in substring(v_def from v_i));
  if v_j = 0 then
    raise exception 'fn_fc_guardar_int: no se encontró el final del bloque de seriales';
  end if;
  execute substring(v_def from 1 for v_i - 1) || v_nuevo || substring(v_def from v_i + v_j - 1 + length(v_fin));
end $$;

-- ── 5. fn_oc_recepcionar con los ayudantes (mismo comportamiento) ───────────
create or replace function public.fn_oc_recepcionar(
  p_org integer,
  p_po_uuid uuid,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_clave text := nullif(btrim(coalesce(p_clave_idempotencia, '')), '');
  v_po public.purchase_orders%rowtype;
  v_previa public.purchase_receipts%rowtype;
  v_recepcion_id bigint;
  v_codigo text;
  v_n integer;
  v_l jsonb;
  v_item record;
  v_item_id integer;
  v_vistos integer[] := '{}';
  v_qty numeric;
  v_antes numeric;
  v_exige_serial boolean;
  v_seriales text[];
  v_todos text[] := '{}';
  v_repetido text;
  v_lotes jsonb;
  v_suma numeric;
  v_trozos jsonb;
  v_trozo jsonb;
  v_trozo_qty numeric;
  v_lot_id integer;
  v_lote jsonb;
  v_ser jsonb;
  v_pos integer;
  v_ser_ids integer[];
  v_k jsonb;
  v_mov integer;
  v_lineas_res jsonb := '[]'::jsonb;
  v_lotes_res jsonb;
  v_ser_res jsonb;
  v_movs jsonb;
  v_saltadas jsonb := '[]'::jsonb;
  v_completa boolean;
  v_estado text;
  v_factura jsonb;
  v_pendientes jsonb;
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['recibir']);

  if v_clave is null or length(v_clave) < 8 or length(v_clave) > 120 then
    raise exception 'clave_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 500 then
    raise exception 'demasiadas_lineas' using errcode = '22023';
  end if;

  -- La orden, bloqueada: dos recepciones simultáneas de la misma OC se serializan.
  select * into v_po from public.purchase_orders po
   where po.uuid = p_po_uuid and po.organization_id = p_org
   for update;
  if v_po.id is null then
    raise exception 'orden_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_fc_acceso_sucursal(v_po.branch_id);

  -- Idempotencia: la misma clave devuelve la misma recepción, sin mover nada.
  perform pg_advisory_xact_lock(hashtextextended('oc_recepcion:' || p_org || ':' || v_clave, 0));
  select * into v_previa from public.purchase_receipts r
   where r.organization_id = p_org and r.idempotency_key = v_clave;
  if v_previa.id is not null then
    if v_previa.purchase_order_id <> v_po.id then
      raise exception 'clave_reutilizada' using errcode = '22023';
    end if;
    return v_previa.resultado || jsonb_build_object('ya_procesada', true);
  end if;

  if v_po.status not in ('sent', 'partial') then
    raise exception 'orden_no_recibible' using errcode = '22023', detail = v_po.status;
  end if;

  -- Documento de recepción (REC-0001 por organización).
  perform pg_advisory_xact_lock(hashtextextended('oc_recepcion_codigo:' || p_org, 0));
  select coalesce(max(substring(r.code from '^REC-([0-9]{1,9})$')::integer), 0) + 1 into v_n
    from public.purchase_receipts r where r.organization_id = p_org;
  v_codigo := 'REC-' || lpad(v_n::text, 4, '0');
  insert into public.purchase_receipts (organization_id, purchase_order_id, branch_id, code, idempotency_key, notes, received_by)
  values (p_org, v_po.id, v_po.branch_id, v_codigo, v_clave, left(nullif(btrim(coalesce(p_notas, '')), ''), 1000), v_uid)
  returning id into v_recepcion_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce(v_l->>'po_item_id', '') !~ '^\d{1,9}$' then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    v_item_id := (v_l->>'po_item_id')::integer;
    if v_item_id = any(v_vistos) then
      raise exception 'linea_repetida' using errcode = '22023', detail = v_item_id::text;
    end if;
    v_vistos := v_vistos || v_item_id;

    select poi.id, poi.product_id, poi.quantity, poi.received_quantity, poi.unit_cost,
           coalesce(poi.requires_serial, false) as requires_serial,
           p.name, p.track_stock, coalesce(p.track_serial, false) as track_serial,
           coalesce(p.track_lots, false) as track_lots, p.warranty_months
      into v_item
      from public.purchase_order_items poi
      join public.products p on p.id = poi.product_id
     where poi.id = v_item_id and poi.purchase_order_id = v_po.id
     for update of poi;
    if v_item.id is null then
      raise exception 'linea_no_es_de_la_orden' using errcode = '22023', detail = v_item_id::text;
    end if;
    if nullif(v_l->>'product_id', '') is not null and (v_l->>'product_id') <> v_item.product_id::text then
      raise exception 'producto_no_coincide' using errcode = '22023', detail = v_item_id::text;
    end if;
    -- P1: el stock vive en las variantes; un padre con variantes no se recibe.
    if exists (select 1 from public.products c where c.parent_product_id = v_item.product_id) then
      raise exception 'producto_con_variantes' using errcode = '22023', detail = v_item_id::text;
    end if;

    begin
      v_qty := round(nullif(v_l->>'qty', '')::numeric, 3);
    exception when others then
      v_qty := null;
    end;
    if v_qty is null or v_qty <= 0 then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = v_item_id::text;
    end if;
    v_antes := coalesce(v_item.received_quantity, 0);
    if v_antes + v_qty > v_item.quantity then
      raise exception 'sobre_recepcion' using errcode = '23514',
        detail = jsonb_build_object('po_item_id', v_item_id, 'producto', v_item.name, 'pedido', v_item.quantity,
                                    'recibido', v_antes, 'solicitado', v_qty,
                                    'pendiente', greatest(v_item.quantity - v_antes, 0))::text;
    end if;

    -- Seriales: limpios, sin repetir en la petición ni en la organización (P8).
    select coalesce(array_agg(s order by o), '{}') into v_seriales
      from (select btrim(x) s, min(o) o
              from jsonb_array_elements_text(case when jsonb_typeof(v_l->'seriales') = 'array'
                                                  then v_l->'seriales' else '[]'::jsonb end) with ordinality t(x, o)
             where btrim(x) <> '' group by btrim(x)) q;
    if jsonb_typeof(v_l->'seriales') = 'array'
       and cardinality(v_seriales) <> (select count(*) from jsonb_array_elements_text(v_l->'seriales') x where btrim(x) <> '') then
      raise exception 'serial_repetido' using errcode = '23505',
        detail = (select btrim(x) from jsonb_array_elements_text(v_l->'seriales') x where btrim(x) <> ''
                   group by btrim(x) having count(*) > 1 limit 1);
    end if;
    v_exige_serial := v_item.track_serial or v_item.requires_serial;
    if cardinality(v_seriales) > 0 or v_exige_serial then
      if v_qty <> trunc(v_qty) then
        raise exception 'cantidad_serial_entera' using errcode = '22023', detail = v_item_id::text;
      end if;
      if cardinality(v_seriales) <> v_qty then
        raise exception 'seriales_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('po_item_id', v_item_id, 'producto', v_item.name,
                                      'cantidad', v_qty, 'seriales', cardinality(v_seriales))::text;
      end if;
      if v_item.track_stock is not true then
        raise exception 'producto_sin_control_de_stock' using errcode = '22023', detail = v_item_id::text;
      end if;
    end if;
    select x into v_repetido from unnest(v_seriales) x where x = any(v_todos) limit 1;
    if v_repetido is not null then
      raise exception 'serial_repetido' using errcode = '23505', detail = v_repetido;
    end if;
    v_todos := v_todos || v_seriales;

    -- Lotes: el reparto debe cuadrar con la cantidad; obligatorio si el producto los maneja.
    v_lotes := case when jsonb_typeof(v_l->'lotes') = 'array' then v_l->'lotes' else '[]'::jsonb end;
    if jsonb_array_length(v_lotes) = 0 then
      if v_item.track_lots then
        raise exception 'lote_requerido' using errcode = '22023', detail = v_item_id::text;
      end if;
      v_trozos := jsonb_build_array(jsonb_build_object('qty', v_qty));
    else
      select coalesce(sum(round(nullif(x->>'qty', '')::numeric, 3)), 0) into v_suma from jsonb_array_elements(v_lotes) x;
      if v_suma <> v_qty or exists (select 1 from jsonb_array_elements(v_lotes) x
                                     where coalesce(round(nullif(x->>'qty', '')::numeric, 3), 0) <= 0) then
        raise exception 'lotes_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('po_item_id', v_item_id, 'cantidad', v_qty, 'lotes', v_suma)::text;
      end if;
      v_trozos := v_lotes;
    end if;

    v_lotes_res := '[]'::jsonb;
    v_ser_res := '[]'::jsonb;
    v_movs := '[]'::jsonb;
    v_pos := 1;

    for v_trozo in select * from jsonb_array_elements(v_trozos) loop
      v_trozo_qty := round((v_trozo->>'qty')::numeric, 3);
      v_lot_id := null;
      if jsonb_array_length(v_lotes) > 0 then
        v_lote := public.fn_inv_int_lote_de_recepcion(p_org, v_item.product_id, v_po.supplier_id, v_po.branch_id, v_trozo);
        v_lot_id := (v_lote->>'lot_id')::integer;
        v_lotes_res := v_lotes_res || (v_lote || jsonb_build_object('qty', v_trozo_qty));
      end if;

      -- Seriales de este trozo (en orden) → filas «en tránsito»; la primitiva las deja in_stock.
      v_ser_ids := '{}';
      if cardinality(v_seriales) > 0 then
        if v_trozo_qty <> trunc(v_trozo_qty) then
          raise exception 'cantidad_serial_entera' using errcode = '22023', detail = v_item_id::text;
        end if;
        v_ser := public.fn_inv_int_seriales_de_recepcion(
          p_org, v_item.product_id, v_po.branch_id, v_lot_id, v_po.supplier_id, v_po.id, null,
          coalesce(v_item.unit_cost, 0), v_item.warranty_months, v_seriales[v_pos : v_pos + v_trozo_qty::integer - 1]);
        v_pos := v_pos + v_trozo_qty::integer;
        select coalesce(array_agg((x->>'id')::integer), '{}') into v_ser_ids from jsonb_array_elements(v_ser) x;
        v_ser_res := v_ser_res || v_ser;
      end if;

      -- Kardex por el núcleo: costo del proveedor → promedio ponderado, vigencia y lote.
      v_k := public.fn_kardex_entrada_compra_int(
        p_org, v_po.branch_id, 'purchase_order', v_po.id::text,
        jsonb_build_array(jsonb_build_object(
          'product_id', v_item.product_id, 'qty', v_trozo_qty, 'unit_cost', coalesce(v_item.unit_cost, 0),
          'lot_id', v_lot_id, 'note', 'Recepción ' || v_codigo || ' de OC-' || v_po.id,
          'serial_ids', to_jsonb(v_ser_ids))),
        v_uid, v_po.supplier_id, false);
      v_mov := nullif(v_k->'procesadas'->0->>'movement_id', '')::integer;
      if v_mov is not null then
        v_movs := v_movs || to_jsonb(v_mov);
      end if;
      if jsonb_array_length(coalesce(v_k->'saltadas', '[]'::jsonb)) > 0 then
        v_saltadas := v_saltadas || (v_k->'saltadas'->0 || jsonb_build_object('po_item_id', v_item_id));
      end if;

      insert into public.purchase_receipt_items (
        receipt_id, organization_id, purchase_order_item_id, product_id, qty, unit_cost, lot_id, serial_ids,
        movement_id, ordered_qty, received_before)
      values (v_recepcion_id, p_org, v_item_id, v_item.product_id, v_trozo_qty, coalesce(v_item.unit_cost, 0), v_lot_id,
              v_ser_ids, v_mov, v_item.quantity, v_antes);
    end loop;

    update public.purchase_order_items
       set received_quantity = v_antes + v_qty,
           serials_received = case when cardinality(v_seriales) > 0
                                   then coalesce(serials_received, '{}'::text[]) || v_seriales
                                   else serials_received end,
           updated_at = now()
     where id = v_item_id;

    v_lineas_res := v_lineas_res || jsonb_build_object(
      'po_item_id', v_item_id, 'product_id', v_item.product_id, 'producto', v_item.name,
      'pedido', v_item.quantity, 'recibido_antes', v_antes, 'recibido_ahora', v_qty,
      'recibido_total', v_antes + v_qty, 'pendiente', greatest(v_item.quantity - v_antes - v_qty, 0),
      'costo_unitario', coalesce(v_item.unit_cost, 0),
      'lotes', v_lotes_res, 'seriales', v_ser_res, 'movimientos', v_movs);
  end loop;

  -- Estado de la OC y diferencia con la orden (todas sus líneas).
  select coalesce(bool_and(poi.received_quantity >= poi.quantity), false),
         coalesce(jsonb_agg(jsonb_build_object(
           'po_item_id', poi.id, 'product_id', poi.product_id, 'producto', p.name,
           'pedido', poi.quantity, 'recibido', poi.received_quantity,
           'pendiente', poi.quantity - poi.received_quantity) order by poi.id)
           filter (where poi.received_quantity < poi.quantity), '[]'::jsonb)
    into v_completa, v_pendientes
    from public.purchase_order_items poi
    left join public.products p on p.id = poi.product_id
   where poi.purchase_order_id = v_po.id;
  v_estado := case when v_completa then 'received' else 'partial' end;
  update public.purchase_orders set status = v_estado, updated_at = now() where id = v_po.id;

  -- Completa: factura de compra y CxP en la misma transacción (idempotente por OC).
  if v_completa then
    v_factura := public.fn_fc_int_desde_oc(v_po.uuid);
    update public.purchase_receipts set purchase_invoice_id = (v_factura->>'invoice_id')::uuid where id = v_recepcion_id;
  end if;

  v_res := jsonb_build_object(
    'recepcion_id', v_recepcion_id,
    'codigo', v_codigo,
    'orden', jsonb_build_object('id', v_po.id, 'uuid', v_po.uuid, 'codigo', 'OC-' || v_po.id,
                                'estado', v_estado, 'completa', v_completa),
    'lineas', v_lineas_res,
    'pendientes', v_pendientes,
    'saltadas', v_saltadas,
    'factura', v_factura);
  update public.purchase_receipts set resultado = v_res where id = v_recepcion_id;
  return v_res || jsonb_build_object('ya_procesada', false);
end;
$function$;
