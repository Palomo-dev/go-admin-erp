-- Reversión de 20261124213100_listas_precios_ventas_y_documentos.
-- NO RESTAURA DATOS: las marcas price_list_id / list_base_price ya escritas se quedan (las columnas
-- las quita el rollback de 20261124213000).
-- Revertir ANTES que 20261124213000 (estas funciones usan las suyas).

set lock_timeout = '10s';

-- pos_checkout_v1: reemplazo textual inverso.
do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_new text := 'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item || jsonb_build_object(''_lista_cliente'', v_customer), v_hora_precio,';
  v_old text := 'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio,';
begin
  if position(v_new in v_def) > 0 then
    execute replace(v_def, v_new, v_old);
  end if;
end $$;

-- fn_pos_validar_linea_venta: quita el bloque de la lista y su variable.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamp with time zone, jsonb, integer, boolean)'::regprocedure);
  v_ini integer := position('  -- listas_precios_20261124' in v_def);
  v_fin integer;
begin
  if v_ini = 0 then
    return;
  end if;
  v_fin := position(E'  if not v_hay_base then\n' in v_def);
  v_def := substr(v_def, 1, v_ini - 1) || substr(v_def, v_fin);
  v_def := replace(v_def, E'  v_lista    numeric;\n', '');
  execute v_def;
end $$;

drop trigger if exists trg_invoice_items_lista_precios on public.invoice_items;
drop function if exists public.fn_trg_invoice_items_lista_precios();
drop trigger if exists trg_quotation_items_lista_precios on public.quotation_items;
drop function if exists public.fn_trg_quotation_items_lista_precios();
drop trigger if exists trg_quotations_lista_precios on public.quotations;
drop function if exists public.fn_trg_quotations_lista_precios();
drop trigger if exists trg_sale_items_lista_precios on public.sale_items;
drop function if exists public.fn_trg_sale_items_lista_precios();
drop trigger if exists trg_sales_lista_precios on public.sales;
drop function if exists public.fn_trg_sales_lista_precios();
drop function if exists public.fn_lista_precios_canal_venta(text);

-- resolve_customer_prices vuelve a la guarda de 20261124213000 (sin sesión: solo service_role).
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
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Acceso denegado' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.organization_members om
                     where om.user_id = v_uid and om.organization_id = p_org and om.is_active) then
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
