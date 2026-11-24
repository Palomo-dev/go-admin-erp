-- Listas de precios por cliente — FASE 1, enganche con ventas y documentos.
-- Aplicada con apply_migration (MCP). Depende de 20261124213000_listas_precios_base.
--
--   1. resolve_customer_prices: la guarda deja pasar el trabajo interno (sin sesión y sin rol
--      anon/authenticated: cron, funciones del servidor), igual que get_user_permission_codes.
--   2. El servidor marca el rastro (nunca lo decide el navegador):
--        sales            price_list_id = la lista que rige para el cliente al crear la venta.
--        sale_items       price_list_id + list_base_price si la línea se cobró con el precio de la
--                         lista (más extras de modificadores). «Usar precio normal» viaja como
--                         notes.lista_quitada y exige pos.precios.cambiar_en_venta a quien cobra.
--        quotations       price_list_id del cliente (canal documents) al crear o cambiar de cliente.
--        quotation_items  price_list_id + list_base_price si la línea tiene el precio de la lista.
--        invoice_items    price_list_id: de la venta (POS), de la cotización convertida o del cliente
--                         (factura manual). El unitario es el de la lista (a la DIAN va ese).
--      Un fallo calculando el rastro nunca bloquea la venta ni el documento (se traga), salvo la
--      falta del permiso de «Usar precio normal».
--   3. fn_pos_validar_linea_venta (7 argumentos) acepta también el precio de la lista del cliente
--      (fn_lista_precio_linea, ahora o a la hora de la venta sin conexión de hasta 30 días), y
--      pos_checkout_v1 le pasa el cliente de la venta en la línea (`_lista_cliente`). Los dos son
--      reemplazos textuales de UNA línea, idempotentes y que fallan cerrados si no encuentran el
--      texto (otra sesión pudo haber cambiado la función).
--
-- Rollback: supabase/rollbacks/20261124213100_listas_precios_ventas_y_documentos_rollback.sql

set lock_timeout = '10s';

-- ── 1. Guarda de resolve_customer_prices ───────────────────────────────────────────────────────
create or replace function public.resolve_customer_prices(
  p_org integer, p_customer uuid, p_product_ids integer[], p_channel text default 'pos', p_branch integer default null)
returns table(product_id integer, normal_price numeric, list_price numeric, price_list_id uuid, price_list_name text,
              source text, rule_percent numeric, rule_label text, rule_price numeric, tiers jsonb, no_discount boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_canal text := coalesce(nullif(p_channel, ''), 'pos');
  v_lista uuid;
  v_nombre text;
begin
  if v_canal not in ('pos', 'web', 'documents') then
    raise exception 'Canal inválido: %', v_canal using errcode = '22023';
  end if;
  if coalesce(array_length(p_product_ids, 1), 0) > 2000 then
    raise exception 'Demasiados productos (máximo 2000)' using errcode = '22023';
  end if;
  if v_uid is null then
    -- Sin sesión: solo service_role o trabajo interno (nunca la clave pública).
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Acceso denegado' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.organization_members om
                     where om.user_id = v_uid and om.organization_id = p_org and om.is_active) then
    -- Tienda (fase 2): el propio cliente con su sesión, solo canal web.
    if p_customer is null or not exists (select 1 from public.customers c
                                          where c.id = p_customer and c.organization_id = p_org and c.user_id = v_uid) then
      raise exception 'Acceso denegado' using errcode = '42501';
    end if;
    v_canal := 'web';
  end if;
  if p_customer is not null and not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_org) then
    raise exception 'El cliente no pertenece a la organización' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'La sede no pertenece a la organización' using errcode = '42501';
  end if;

  v_lista := public.fn_lista_precios_del_cliente(p_org, p_customer, v_canal, p_branch, now());
  if v_lista is null then
    return query
      select v.product_id, v.precio, null::numeric, null::uuid, null::text, null::text, null::numeric, null::text,
             null::numeric, null::jsonb, false
        from public.fn_precios_vigentes_lote(p_org, p_branch, coalesce(p_product_ids, '{}'::integer[]), now(), false) v
        join public.products p on p.id = v.product_id and p.organization_id = p_org;
    return;
  end if;
  select l.name into v_nombre from public.price_lists l where l.id = v_lista;
  return query
    select r.product_id, r.normal_price,
           public.fn_lista_precios_por_cantidad(r.tiers, case when r.no_discount then null else r.rule_price end, 1),
           v_lista, v_nombre,
           case when public.fn_lista_precios_por_cantidad(r.tiers, null, 1) is not null then 'item' else r.rule_source end,
           r.rule_percent, r.rule_label,
           case when r.no_discount then null else r.rule_price end,
           r.tiers, r.no_discount
      from public.fn_lista_precios_resolver(p_org, v_lista, p_product_ids, p_branch, now()) r;
end;
$$;
revoke all on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) from public, anon;
grant execute on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) to authenticated, service_role;

-- ── 2. Rastro en ventas ────────────────────────────────────────────────────────────────────────
create or replace function public.fn_lista_precios_canal_venta(p_source text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_source when 'web' then 'web' when 'invoice' then 'documents' else 'pos' end
$$;

create or replace function public.fn_trg_sales_lista_precios()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.price_list_id is null and new.customer_id is not null then
    begin
      new.price_list_id := public.fn_lista_precios_del_cliente(
        new.organization_id, new.customer_id, public.fn_lista_precios_canal_venta(new.source), new.branch_id, now());
    exception when others then
      new.price_list_id := null; -- El rastro de la lista nunca bloquea una venta.
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_trg_sales_lista_precios() from public, anon, authenticated;
drop trigger if exists trg_sales_lista_precios on public.sales;
create trigger trg_sales_lista_precios before insert on public.sales
  for each row execute function public.fn_trg_sales_lista_precios();

create or replace function public.fn_trg_sale_items_lista_precios()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s record;
  v_lista numeric;
  v_normal numeric;
  v_extra numeric;
begin
  if new.product_id is null or new.sale_id is null then
    return new;
  end if;
  select s.organization_id, s.customer_id, s.branch_id, s.source, s.price_list_id
    into v_s from public.sales s where s.id = new.sale_id;
  if not found then
    return new;
  end if;
  -- «Usar precio normal» en una venta de cliente con lista: permiso resuelto en el servidor.
  if coalesce(new.notes->>'lista_quitada', '') = 'true' then
    if auth.uid() is not null
       and not public.fn_tiene_permiso(v_s.organization_id, 'pos.precios.cambiar_en_venta') then
      raise exception 'lista_quitada_sin_permiso' using errcode = '42501',
        detail = 'Usar el precio normal pide el permiso «Cambiar precios en la venta».';
    end if;
    new.price_list_id := null;
    new.list_base_price := null;
    return new;
  end if;
  if new.price_list_id is not null or v_s.customer_id is null or v_s.price_list_id is null then
    return new;
  end if;
  begin
    v_lista := public.fn_lista_precio_linea(v_s.organization_id, v_s.customer_id, new.product_id, new.quantity,
                                            public.fn_lista_precios_canal_venta(v_s.source), v_s.branch_id, now());
    if v_lista is null then
      return new;
    end if;
    v_extra := coalesce(public.fn_pos_extra_modificadores(v_s.organization_id, new.product_id, new.notes->'modifiers'), 0);
    if abs(v_lista + v_extra - coalesce(new.unit_price, 0)) > 0.01 then
      return new;
    end if;
    v_normal := public.fn_precio_vigente(new.product_id, v_s.branch_id, now());
    new.price_list_id := v_s.price_list_id;
    new.list_base_price := case when v_normal is null then null else v_normal + v_extra end;
  exception when others then
    new.price_list_id := null;
    new.list_base_price := null;
  end;
  return new;
end;
$$;
revoke all on function public.fn_trg_sale_items_lista_precios() from public, anon, authenticated;
drop trigger if exists trg_sale_items_lista_precios on public.sale_items;
create trigger trg_sale_items_lista_precios before insert on public.sale_items
  for each row execute function public.fn_trg_sale_items_lista_precios();

-- ── Cotizaciones ───────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_trg_quotations_lista_precios()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id or new.branch_id is distinct from old.branch_id then
    begin
      new.price_list_id := public.fn_lista_precios_del_cliente(new.organization_id, new.customer_id, 'documents', new.branch_id, now());
    exception when others then
      new.price_list_id := null;
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_trg_quotations_lista_precios() from public, anon, authenticated;
drop trigger if exists trg_quotations_lista_precios on public.quotations;
create trigger trg_quotations_lista_precios before insert or update of customer_id, branch_id on public.quotations
  for each row execute function public.fn_trg_quotations_lista_precios();

create or replace function public.fn_trg_quotation_items_lista_precios()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_q record;
  v_lista numeric;
begin
  new.price_list_id := null;
  new.list_base_price := null;
  if new.product_id is null then
    return new;
  end if;
  begin
    select q.organization_id, q.customer_id, q.branch_id, q.price_list_id
      into v_q from public.quotations q where q.id = new.quotation_id;
    if not found or v_q.price_list_id is null then
      return new;
    end if;
    v_lista := public.fn_lista_precio_linea(v_q.organization_id, v_q.customer_id, new.product_id, new.qty, 'documents', v_q.branch_id, now());
    if v_lista is not null and abs(v_lista - coalesce(new.unit_price, 0)) <= 0.01 then
      new.price_list_id := v_q.price_list_id;
      new.list_base_price := public.fn_precio_vigente(new.product_id, v_q.branch_id, now());
    end if;
  exception when others then
    new.price_list_id := null;
    new.list_base_price := null;
  end;
  return new;
end;
$$;
revoke all on function public.fn_trg_quotation_items_lista_precios() from public, anon, authenticated;
drop trigger if exists trg_quotation_items_lista_precios on public.quotation_items;
create trigger trg_quotation_items_lista_precios before insert or update of unit_price, qty, product_id on public.quotation_items
  for each row execute function public.fn_trg_quotation_items_lista_precios();

-- ── Facturas ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_trg_invoice_items_lista_precios()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_i record;
  v_list uuid;
  v_lista numeric;
begin
  if new.invoice_sales_id is null or new.product_id is null or new.price_list_id is not null then
    return new;
  end if;
  begin
    select i.organization_id, i.customer_id, i.branch_id, i.sale_id, i.quotation_id
      into v_i from public.invoice_sales i where i.id = new.invoice_sales_id;
    if not found then
      return new;
    end if;
    -- Factura de una venta: la línea ya trae su marca.
    if v_i.sale_id is not null then
      select si.price_list_id into v_list
        from public.sale_items si
       where si.sale_id = v_i.sale_id and si.product_id = new.product_id and si.price_list_id is not null
         and abs(si.unit_price - coalesce(new.unit_price, 0)) <= 0.01
       limit 1;
      new.price_list_id := v_list;
      return new;
    end if;
    -- Cotización convertida: la cotización conserva sus precios.
    if v_i.quotation_id is not null then
      select qi.price_list_id into v_list
        from public.quotation_items qi
       where qi.quotation_id = v_i.quotation_id and qi.product_id = new.product_id and qi.price_list_id is not null
         and abs(qi.unit_price - coalesce(new.unit_price, 0)) <= 0.01
       limit 1;
      if v_list is not null then
        new.price_list_id := v_list;
        return new;
      end if;
    end if;
    if v_i.customer_id is null then
      return new;
    end if;
    v_list := public.fn_lista_precios_del_cliente(v_i.organization_id, v_i.customer_id, 'documents', v_i.branch_id, now());
    if v_list is null then
      return new;
    end if;
    v_lista := public.fn_lista_precio_linea(v_i.organization_id, v_i.customer_id, new.product_id, new.qty, 'documents', v_i.branch_id, now());
    if v_lista is not null and abs(v_lista - coalesce(new.unit_price, 0)) <= 0.01 then
      new.price_list_id := v_list;
    end if;
  exception when others then
    new.price_list_id := null;
  end;
  return new;
end;
$$;
revoke all on function public.fn_trg_invoice_items_lista_precios() from public, anon, authenticated;
drop trigger if exists trg_invoice_items_lista_precios on public.invoice_items;
create trigger trg_invoice_items_lista_precios before insert on public.invoice_items
  for each row execute function public.fn_trg_invoice_items_lista_precios();

-- ── 3. Validación del cobro en el servidor ─────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamp with time zone, jsonb, integer, boolean)'::regprocedure);
  v_decl_old text := E'  v_nombre   text;\nbegin';
  v_decl_new text := E'  v_nombre   text;\n  v_lista    numeric;\nbegin';
  v_ancla text := E'  if not v_hay_base then\n';
  v_bloque text := E'  -- listas_precios_20261124: el precio de la lista del cliente también vale (fn_lista_precio_linea).\n'
    || E'  if not v_ok and nullif(p_item->>''_lista_cliente'', '''') is not null then\n'
    || E'    for v_momento in\n'
    || E'      select m from unnest(array[\n'
    || E'        now(),\n'
    || E'        case when p_created_at between now() - interval ''30 days'' and now() + interval ''5 minutes'' then p_created_at end\n'
    || E'      ]) m where m is not null\n'
    || E'    loop\n'
    || E'      v_lista := public.fn_lista_precio_linea(p_org, (p_item->>''_lista_cliente'')::uuid, v_product, v_qty, ''pos'', p_branch_id, v_momento);\n'
    || E'      if v_lista is not null then\n'
    || E'        v_hay_base := true;\n'
    || E'        if abs(v_lista + v_extra - v_price) <= 0.01 then\n'
    || E'          v_ok := true;\n'
    || E'          exit;\n'
    || E'        end if;\n'
    || E'      end if;\n'
    || E'    end loop;\n'
    || E'  end if;\n';
begin
  if position('listas_precios_20261124' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if position(v_decl_old in v_def) = 0 or position(v_ancla in v_def) = 0 then
    raise exception 'fn_pos_validar_linea_venta cambió: no se encontró el texto a reemplazar';
  end if;
  v_def := replace(v_def, v_decl_old, v_decl_new);
  v_def := replace(v_def, v_ancla, v_bloque || v_ancla);
  execute v_def;
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old text := 'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio,';
  v_new text := 'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item || jsonb_build_object(''_lista_cliente'', v_customer), v_hora_precio,';
begin
  if position('_lista_cliente' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'pos_checkout_v1 cambió: no se encontró la llamada a fn_pos_validar_linea_venta';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
