-- Listas de precios por cliente — FASE 1, funciones de las pantallas (Ventas › Listas de precios y
-- la tarjeta «Lista de precios» de la ficha del cliente). Aplicada con apply_migration (MCP).
-- Depende de 20261124213000_listas_precios_base.
--
-- Todas SECURITY DEFINER, con la organización como argumento que la ruta toma de la SESIÓN
-- (getServerOrgContext) y comprobada otra vez aquí: miembro activo para leer y
-- pos.listas_precios.gestionar para escribir. Cerradas a anon (revoke) — nacen así desde
-- 20261104053000, pero se repite explícito.
--
-- Lectura:  price_lists_overview · price_list_detail · price_list_customers ·
--           price_list_customer_candidates · price_list_segment_candidates · customer_price_list_info
-- Escritura (una transacción cada una):
--           price_list_save (lista + excepciones + precios fijos) · price_list_import (vista previa y
--           confirmación del Excel/CSV: valida en el servidor) · price_list_assign_customers ·
--           price_list_assign_segment · price_list_remove_assignment · customer_set_price_list ·
--           price_list_reorder · price_list_duplicate · price_list_delete
--
-- Rollback: supabase/rollbacks/20261124213200_listas_precios_gestion_rollback.sql

set lock_timeout = '10s';

-- ── Guardas ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_lista_precios_exigir_miembro(p_org integer)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.organization_members om
                     where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.fn_lista_precios_exigir_miembro(integer) from public, anon, authenticated;

create or replace function public.fn_lista_precios_exigir_gestion(p_org integer)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  if not public.fn_tiene_permiso(p_org, 'pos.listas_precios.gestionar') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.fn_lista_precios_exigir_gestion(integer) from public, anon, authenticated;

-- Inicio y fin del mes en curso en la zona de la organización.
create or replace function public.fn_lista_precios_mes(p_org integer)
returns table(desde timestamptz, hasta timestamptz) language sql stable security definer set search_path = public, pg_temp as $$
  with z as (
    select coalesce((select nullif(btrim(o.timezone), '') from public.organizations o where o.id = p_org), 'America/Bogota') tz
  )
  select (date_trunc('month', now() at time zone z.tz)) at time zone z.tz,
         (date_trunc('month', now() at time zone z.tz) + interval '1 month') at time zone z.tz
    from z
$$;
revoke all on function public.fn_lista_precios_mes(integer) from public, anon, authenticated;

-- Lista EFECTIVA de cada cliente con lista (sin mirar canal ni fechas): uno a uno gana; si no, el
-- primer grupo en el orden de listas. Base de los conteos de las pantallas.
create or replace function public.fn_lista_precios_clientes_efectivos(p_org integer)
returns table(customer_id uuid, price_list_id uuid, via text, segment_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.customer_id, a.price_list_id, 'directo'::text, null::uuid
    from public.price_list_assignments a
   where a.organization_id = p_org and a.customer_id is not null and a.price_list_id is not null
  union all
  select g.* from (
    select distinct on (sm.customer_id) sm.customer_id, a.price_list_id, 'grupo'::text, a.segment_id
      from public.price_list_assignments a
      join public.price_lists l on l.id = a.price_list_id
      join public.segment_members sm on sm.segment_id = a.segment_id and sm.organization_id = p_org
     where a.organization_id = p_org and a.segment_id is not null
       and not exists (select 1 from public.price_list_assignments d
                        where d.organization_id = p_org and d.customer_id = sm.customer_id)
     order by sm.customer_id, l.sort_order, l.created_at, l.id
  ) g
$$;
revoke all on function public.fn_lista_precios_clientes_efectivos(integer) from public, anon, authenticated;

create or replace function public.fn_lista_precios_estado(
  p_activa boolean, p_desde date, p_hasta date, p_hoy date, p_clientes integer)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when not p_activa then 'inactiva'
    when p_desde > p_hoy then 'programada'
    when p_hasta is not null and p_hasta < p_hoy then 'vencida'
    when coalesce(p_clientes, 0) = 0 then 'sin_clientes'
    else 'activa'
  end
$$;

-- ── Lectura ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.price_lists_overview(p_org integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hoy date := public.fn_lista_precios_hoy(p_org, now());
  v_desde timestamptz;
  v_hasta timestamptz;
  v_res jsonb;
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  select m.desde, m.hasta into v_desde, v_hasta from public.fn_lista_precios_mes(p_org) m;

  with ef as (select * from public.fn_lista_precios_clientes_efectivos(p_org)),
  por_lista as (
    select l.*,
           (select count(*) from ef where ef.price_list_id = l.id)::integer as clientes,
           (select count(*) from ef where ef.price_list_id = l.id and ef.via = 'grupo')::integer as clientes_grupo,
           (select count(distinct i.product_id) from public.price_list_items i where i.price_list_id = l.id)::integer as productos_fijos,
           (select count(*) from public.price_list_rules r where r.price_list_id = l.id and r.scope = 'category')::integer as reglas_categoria,
           (select count(*) from public.price_list_rules r where r.price_list_id = l.id and r.scope = 'brand')::integer as reglas_marca,
           (select count(*) from public.price_list_items i where i.price_list_id = l.id and i.min_qty > 1)::integer as escalones
      from public.price_lists l
     where l.organization_id = p_org
  ),
  ventas as (
    select count(*)::integer as n, coalesce(sum(s.total - coalesce(s.tax_total, 0) - coalesce(s.tip_amount, 0)), 0) as neto
      from public.sales s
     where s.organization_id = p_org and s.price_list_id is not null
       and s.sale_date >= v_desde and s.sale_date < v_hasta
       and s.status not in ('void', 'draft', 'cancelled')
  )
  select jsonb_build_object(
    'listas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'is_active', p.is_active,
        'effective_from', p.effective_from, 'effective_to', p.effective_to,
        'base_mode', p.base_mode, 'base_percent', p.base_percent,
        'applies_to_pos', p.applies_to_pos, 'applies_to_web', p.applies_to_web, 'applies_to_documents', p.applies_to_documents,
        'sort_order', p.sort_order, 'clientes', p.clientes, 'clientes_grupo', p.clientes_grupo,
        'productos_fijos', p.productos_fijos, 'reglas_categoria', p.reglas_categoria, 'reglas_marca', p.reglas_marca,
        'escalones', p.escalones, 'estado', public.fn_lista_precios_estado(p.is_active, p.effective_from, p.effective_to, v_hoy, p.clientes)
      ) order by p.sort_order, p.created_at, p.id) from por_lista p), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'creadas', (select count(*) from por_lista),
      'activas', (select count(*) from por_lista p where public.fn_lista_precios_estado(p.is_active, p.effective_from, p.effective_to, v_hoy, p.clientes) in ('activa', 'sin_clientes')),
      'programadas', (select count(*) from por_lista p where p.is_active and p.effective_from > v_hoy),
      'clientes', (select count(*) from ef),
      'clientes_grupo', (select count(*) from ef where ef.via = 'grupo'),
      'clientes_directos', (select count(*) from ef where ef.via = 'directo'),
      'productos_fijos', (select count(distinct i.product_id) from public.price_list_items i
                            join public.price_lists l on l.id = i.price_list_id
                           where l.organization_id = p_org and l.is_active),
      'ventas_netas_mes', (select neto from ventas),
      'ventas_mes', (select n from ventas)
    )
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.price_list_detail(p_org integer, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_l public.price_lists;
  v_hoy date := public.fn_lista_precios_hoy(p_org, now());
  v_desde timestamptz;
  v_hasta timestamptz;
  v_ids integer[];
  v_res jsonb;
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  select * into v_l from public.price_lists l where l.id = p_id and l.organization_id = p_org;
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  select m.desde, m.hasta into v_desde, v_hasta from public.fn_lista_precios_mes(p_org) m;
  select array_agg(distinct i.product_id) into v_ids from public.price_list_items i where i.price_list_id = p_id;

  with ef as (select * from public.fn_lista_precios_clientes_efectivos(p_org) e where e.price_list_id = p_id),
  normales as (
    select v.product_id, v.precio from public.fn_precios_vigentes_lote(p_org, null, coalesce(v_ids, '{}'::integer[]), now(), false) v
  ),
  productos as (
    select p.id, p.name, p.sku, n.precio as normal,
           jsonb_agg(jsonb_build_object('min_qty', i.min_qty, 'price', i.price) order by i.min_qty) as escalones
      from public.price_list_items i
      join public.products p on p.id = i.product_id
      left join normales n on n.product_id = p.id
     where i.price_list_id = p_id
     group by p.id, p.name, p.sku, n.precio
  ),
  ventas as (
    select count(*)::integer as n, coalesce(sum(s.total - coalesce(s.tax_total, 0) - coalesce(s.tip_amount, 0)), 0) as neto
      from public.sales s
     where s.organization_id = p_org and s.price_list_id = p_id
       and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled')
  ),
  ahorro as (
    select coalesce(sum(greatest(si.list_base_price - si.unit_price, 0) * si.quantity), 0) as monto
      from public.sale_items si join public.sales s on s.id = si.sale_id
     where si.price_list_id = p_id and s.organization_id = p_org
       and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled')
  )
  select jsonb_build_object(
    'lista', to_jsonb(v_l),
    'estado', public.fn_lista_precios_estado(v_l.is_active, v_l.effective_from, v_l.effective_to, v_hoy, (select count(*)::integer from ef)),
    'reglas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'scope', r.scope, 'category_id', r.category_id, 'category_name', c.name, 'brand', r.brand,
        'adjust_percent', r.adjust_percent, 'no_discount', r.no_discount) order by r.created_at)
      from public.price_list_rules r left join public.categories c on c.id = r.category_id
     where r.price_list_id = p_id), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'sku', p.sku,
        'normal_price', p.normal, 'escalones', p.escalones) order by p.name) from productos p), '[]'::jsonb),
    'grupos', coalesce((select jsonb_agg(jsonb_build_object('segment_id', s.id, 'name', s.name, 'is_dynamic', coalesce(s.is_dynamic, false),
        'miembros', (select count(*) from public.segment_members sm where sm.segment_id = s.id)) order by s.name)
      from public.price_list_assignments a join public.segments s on s.id = a.segment_id
     where a.price_list_id = p_id and a.organization_id = p_org), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'clientes', (select count(*) from ef),
      'clientes_grupo', (select count(*) from ef where ef.via = 'grupo'),
      'clientes_directos', (select count(*) from ef where ef.via = 'directo'),
      'ventas_netas_mes', (select neto from ventas),
      'ventas_mes', (select n from ventas),
      'ahorro_mes', (select monto from ahorro))
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.price_list_customers(
  p_org integer, p_id uuid, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_res jsonb;
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  if not exists (select 1 from public.price_lists l where l.id = p_id and l.organization_id = p_org) then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  select m.desde, m.hasta into v_desde, v_hasta from public.fn_lista_precios_mes(p_org) m;

  with ef as (
    select e.* from public.fn_lista_precios_clientes_efectivos(p_org) e where e.price_list_id = p_id
  ),
  base as (
    select c.id, c.full_name, c.company_name, c.trade_name, c.identification_type, c.identification_number,
           ef.via, s.name as grupo
      from ef
      join public.customers c on c.id = ef.customer_id and c.organization_id = p_org
      left join public.segments s on s.id = ef.segment_id
     where v_q is null
        or coalesce(c.full_name, '') ilike '%' || v_q || '%'
        or coalesce(c.company_name, '') ilike '%' || v_q || '%'
        or coalesce(c.trade_name, '') ilike '%' || v_q || '%'
        or coalesce(c.identification_number, '') ilike '%' || v_q || '%'
  ),
  pagina as (
    select * from base order by coalesce(nullif(trade_name, ''), nullif(company_name, ''), full_name) nulls last, id
     limit greatest(1, least(coalesce(p_limit, 20), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'clientes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', coalesce(nullif(p.trade_name, ''), nullif(p.company_name, ''), p.full_name),
        'doc_type', p.identification_type, 'doc_number', p.identification_number,
        'via', p.via, 'grupo', p.grupo,
        'ultima_compra', (select max(s.sale_date) from public.sales s
                           where s.organization_id = p_org and s.customer_id = p.id and s.status not in ('void', 'draft', 'cancelled')),
        'ventas_netas_mes', (select coalesce(sum(s.total - coalesce(s.tax_total, 0) - coalesce(s.tip_amount, 0)), 0) from public.sales s
                              where s.organization_id = p_org and s.customer_id = p.id and s.price_list_id = p_id
                                and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled')),
        'ahorro_mes', (select coalesce(sum(greatest(si.list_base_price - si.unit_price, 0) * si.quantity), 0)
                         from public.sale_items si join public.sales s on s.id = si.sale_id
                        where s.organization_id = p_org and s.customer_id = p.id and si.price_list_id = p_id
                          and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled'))
      )) from pagina p), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.price_list_customer_candidates(p_org integer, p_id uuid, p_search text default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  return coalesce((
    with ef as (select * from public.fn_lista_precios_clientes_efectivos(p_org)),
    c as (
      select c.id, coalesce(nullif(c.trade_name, ''), nullif(c.company_name, ''), c.full_name) as nombre,
             c.identification_type, c.identification_number
        from public.customers c
       where c.organization_id = p_org
         and (v_q is null
              or coalesce(c.full_name, '') ilike '%' || v_q || '%'
              or coalesce(c.company_name, '') ilike '%' || v_q || '%'
              or coalesce(c.trade_name, '') ilike '%' || v_q || '%'
              or coalesce(c.identification_number, '') ilike '%' || v_q || '%'
              or coalesce(c.phone, '') ilike '%' || v_q || '%')
       order by 2 nulls last, c.id
       limit greatest(1, least(coalesce(p_limit, 30), 100))
    )
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'doc_type', c.identification_type, 'doc_number', c.identification_number,
      'lista_actual_id', ef.price_list_id, 'lista_actual', l.name, 'via', ef.via))
      from c left join ef on ef.customer_id = c.id left join public.price_lists l on l.id = ef.price_list_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.price_list_segment_candidates(p_org integer, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'segment_id', s.id, 'name', s.name, 'is_dynamic', coalesce(s.is_dynamic, false),
      'miembros', (select count(*) from public.segment_members sm where sm.segment_id = s.id),
      'lista_id', a.price_list_id, 'lista', l.name,
      'con_directa', (select count(*) from public.segment_members sm
                        join public.price_list_assignments d on d.organization_id = p_org and d.customer_id = sm.customer_id
                       where sm.segment_id = s.id and d.price_list_id is distinct from p_id),
      'con_directa_lista', (select l2.name from public.segment_members sm
                              join public.price_list_assignments d on d.organization_id = p_org and d.customer_id = sm.customer_id
                              join public.price_lists l2 on l2.id = d.price_list_id
                             where sm.segment_id = s.id and d.price_list_id is distinct from p_id
                             group by l2.name order by count(*) desc limit 1)
    ) order by s.name)
      from public.segments s
      left join public.price_list_assignments a on a.organization_id = p_org and a.segment_id = s.id
      left join public.price_lists l on l.id = a.price_list_id
     where s.organization_id = p_org
  ), '[]'::jsonb);
end;
$$;

create or replace function public.customer_price_list_info(p_org integer, p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hoy date := public.fn_lista_precios_hoy(p_org, now());
  v_desde timestamptz;
  v_hasta timestamptz;
  v_dir_existe boolean;
  v_dir uuid;
  v_grupo_lista uuid;
  v_grupo_seg uuid;
  v_lista uuid;
  v_via text;
begin
  perform public.fn_lista_precios_exigir_miembro(p_org);
  if not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_org) then
    raise exception 'no_encontrado' using errcode = 'P0002';
  end if;
  select m.desde, m.hasta into v_desde, v_hasta from public.fn_lista_precios_mes(p_org) m;
  select true, a.price_list_id into v_dir_existe, v_dir
    from public.price_list_assignments a where a.organization_id = p_org and a.customer_id = p_customer;
  select a.price_list_id, a.segment_id into v_grupo_lista, v_grupo_seg
    from public.price_list_assignments a
    join public.price_lists l on l.id = a.price_list_id
    join public.segment_members sm on sm.segment_id = a.segment_id and sm.customer_id = p_customer and sm.organization_id = p_org
   where a.organization_id = p_org and a.segment_id is not null
   order by l.sort_order, l.created_at, l.id limit 1;
  if coalesce(v_dir_existe, false) then
    v_lista := v_dir;
    v_via := case when v_dir is null then 'sin_lista' else 'directo' end;
  elsif v_grupo_lista is not null then
    v_lista := v_grupo_lista;
    v_via := 'grupo';
  else
    v_via := 'ninguna';
  end if;

  return jsonb_build_object(
    'via', v_via,
    'lista', (select jsonb_build_object('id', l.id, 'name', l.name, 'base_mode', l.base_mode, 'base_percent', l.base_percent,
                'applies_to_pos', l.applies_to_pos, 'applies_to_web', l.applies_to_web, 'applies_to_documents', l.applies_to_documents,
                'productos_fijos', (select count(distinct i.product_id) from public.price_list_items i where i.price_list_id = l.id),
                'reglas', (select jsonb_agg(jsonb_build_object('scope', r.scope, 'name', coalesce(c.name, r.brand),
                             'adjust_percent', r.adjust_percent, 'no_discount', r.no_discount) order by r.created_at)
                             from public.price_list_rules r left join public.categories c on c.id = r.category_id
                            where r.price_list_id = l.id),
                'estado', public.fn_lista_precios_estado(l.is_active, l.effective_from, l.effective_to, v_hoy, 1))
                from public.price_lists l where l.id = v_lista),
    'grupo', (select jsonb_build_object('id', s.id, 'name', s.name) from public.segments s where s.id = v_grupo_seg),
    'lista_del_grupo_id', v_grupo_lista,
    'ahorro_mes', (select coalesce(sum(greatest(si.list_base_price - si.unit_price, 0) * si.quantity), 0)
                     from public.sale_items si join public.sales s on s.id = si.sale_id
                    where s.organization_id = p_org and s.customer_id = p_customer and si.price_list_id is not null
                      and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled')),
    'compras_mes', (select count(distinct s.id) from public.sales s
                     where s.organization_id = p_org and s.customer_id = p_customer and s.price_list_id is not null
                       and s.sale_date >= v_desde and s.sale_date < v_hasta and s.status not in ('void', 'draft', 'cancelled')),
    'opciones', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'base_mode', l.base_mode,
                  'base_percent', l.base_percent, 'effective_from', l.effective_from,
                  'productos_fijos', (select count(distinct i.product_id) from public.price_list_items i where i.price_list_id = l.id),
                  'estado', public.fn_lista_precios_estado(l.is_active, l.effective_from, l.effective_to, v_hoy, 1)) order by l.sort_order, l.created_at)
                  from public.price_lists l where l.organization_id = p_org and l.is_active), '[]'::jsonb)
  );
end;
$$;

-- ── Escritura ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.price_list_save(p_org integer, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := p_id;
  v_r jsonb;
  v_ramas jsonb := case when jsonb_typeof(p_data->'branches') = 'array' and jsonb_array_length(p_data->'branches') > 0
                        then p_data->'branches' else null end;
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if nullif(btrim(coalesce(p_data->>'name', '')), '') is null then
    raise exception 'nombre_requerido' using errcode = '22023';
  end if;
  if v_ramas is not null and exists (
       select 1 from jsonb_array_elements_text(v_ramas) b
        where not exists (select 1 from public.branches x where x.id = b.value::integer and x.organization_id = p_org)) then
    raise exception 'sede_invalida' using errcode = '22023';
  end if;
  begin
    if v_id is null then
      insert into public.price_lists (organization_id, name, effective_from, effective_to, is_active, base_mode, base_percent,
                                      rounding_step, rounding_mode, applies_to_pos, applies_to_web, applies_to_documents,
                                      branches, web_login_notice, sort_order, created_by)
      values (p_org, btrim(p_data->>'name'),
              coalesce(nullif(p_data->>'effective_from', '')::date, public.fn_lista_precios_hoy(p_org, now())),
              nullif(p_data->>'effective_to', '')::date,
              coalesce((p_data->>'is_active')::boolean, true),
              coalesce(nullif(p_data->>'base_mode', ''), 'percent'),
              coalesce(nullif(p_data->>'base_percent', '')::numeric, 0),
              coalesce(nullif(p_data->>'rounding_step', '')::numeric, 0),
              coalesce(nullif(p_data->>'rounding_mode', ''), 'down'),
              coalesce((p_data->>'applies_to_pos')::boolean, true),
              coalesce((p_data->>'applies_to_web')::boolean, true),
              coalesce((p_data->>'applies_to_documents')::boolean, true),
              v_ramas,
              coalesce((p_data->>'web_login_notice')::boolean, false),
              coalesce((select max(l.sort_order) + 1 from public.price_lists l where l.organization_id = p_org), 0),
              auth.uid())
      returning id into v_id;
    else
      update public.price_lists l set
        name = btrim(p_data->>'name'),
        effective_from = coalesce(nullif(p_data->>'effective_from', '')::date, l.effective_from),
        effective_to = nullif(p_data->>'effective_to', '')::date,
        is_active = coalesce((p_data->>'is_active')::boolean, l.is_active),
        base_mode = coalesce(nullif(p_data->>'base_mode', ''), l.base_mode),
        base_percent = coalesce(nullif(p_data->>'base_percent', '')::numeric, l.base_percent),
        rounding_step = coalesce(nullif(p_data->>'rounding_step', '')::numeric, l.rounding_step),
        rounding_mode = coalesce(nullif(p_data->>'rounding_mode', ''), l.rounding_mode),
        applies_to_pos = coalesce((p_data->>'applies_to_pos')::boolean, l.applies_to_pos),
        applies_to_web = coalesce((p_data->>'applies_to_web')::boolean, l.applies_to_web),
        applies_to_documents = coalesce((p_data->>'applies_to_documents')::boolean, l.applies_to_documents),
        branches = v_ramas,
        web_login_notice = coalesce((p_data->>'web_login_notice')::boolean, l.web_login_notice)
       where l.id = v_id and l.organization_id = p_org;
      if not found then
        raise exception 'no_encontrada' using errcode = 'P0002';
      end if;
    end if;
  exception
    when unique_violation then raise exception 'nombre_duplicado' using errcode = '23505';
    when check_violation then raise exception 'datos_invalidos' using errcode = '22023';
  end;

  if jsonb_typeof(p_data->'rules') = 'array' then
    delete from public.price_list_rules r where r.price_list_id = v_id;
    for v_r in select value from jsonb_array_elements(p_data->'rules') loop
      begin
        insert into public.price_list_rules (organization_id, price_list_id, scope, category_id, brand, adjust_percent, no_discount)
        values (p_org, v_id, v_r->>'scope', nullif(v_r->>'category_id', '')::integer, nullif(btrim(coalesce(v_r->>'brand', '')), ''),
                case when coalesce((v_r->>'no_discount')::boolean, false) then null else nullif(v_r->>'adjust_percent', '')::numeric end,
                coalesce((v_r->>'no_discount')::boolean, false));
      exception
        when unique_violation then raise exception 'regla_duplicada' using errcode = '23505';
        when check_violation then raise exception 'regla_invalida' using errcode = '22023';
      end;
    end loop;
  end if;

  if jsonb_typeof(p_data->'items') = 'array' then
    delete from public.price_list_items i where i.price_list_id = v_id;
    begin
      insert into public.price_list_items (organization_id, price_list_id, product_id, min_qty, price)
      select p_org, v_id, (x->>'product_id')::integer, coalesce(nullif(x->>'min_qty', '')::numeric, 1), (x->>'price')::numeric
        from jsonb_array_elements(p_data->'items') x;
    exception
      when unique_violation then raise exception 'escalon_duplicado' using errcode = '23505';
      when check_violation then raise exception 'precio_invalido' using errcode = '22023';
    end;
  end if;
  return v_id;
end;
$$;

create or replace function public.price_list_import(p_org integer, p_id uuid, p_rows jsonb, p_replace boolean default false, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_res jsonb;
  v_fuera integer;
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if not exists (select 1 from public.price_lists l where l.id = p_id and l.organization_id = p_org) then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'archivo_invalido' using errcode = '22023';
  end if;

  create temp table if not exists _lp_import (
    fila integer, sku text, product_id integer, nombre text, min_qty numeric, precio numeric, hoy numeric, estado text
  ) on commit drop;
  truncate _lp_import;

  insert into _lp_import (fila, sku, min_qty, precio, estado)
  select coalesce(nullif(x->>'fila', '')::integer, o::integer + 1),
         nullif(btrim(coalesce(x->>'sku', '')), ''),
         case when coalesce(x->>'min_qty', '') ~ '^\s*[0-9]+([.,][0-9]+)?\s*$' then replace(btrim(x->>'min_qty'), ',', '.')::numeric
              when nullif(btrim(coalesce(x->>'min_qty', '')), '') is null then 1 end,
         case when coalesce(x->>'price', '') ~ '^\s*[0-9]+([.][0-9]+)?\s*$' then btrim(x->>'price')::numeric end,
         null
    from jsonb_array_elements(p_rows) with ordinality t(x, o);

  update _lp_import i set product_id = (
      select p.id from public.products p
       where p.organization_id = p_org and coalesce(p.status, 'active') <> 'deleted'
         and (lower(p.sku) = lower(i.sku) or p.barcode = i.sku)
       order by (lower(p.sku) = lower(i.sku)) desc, p.id limit 1)
   where i.sku is not null;
  update _lp_import i set nombre = p.name from public.products p where p.id = i.product_id;

  update _lp_import i set hoy = it.price
    from public.price_list_items it
   where it.price_list_id = p_id and it.product_id = i.product_id and it.min_qty = i.min_qty;

  update _lp_import i set estado = case
      when i.sku is null or i.product_id is null then 'no_existe'
      when i.precio is null or i.precio < 0 then 'precio_invalido'
      when i.min_qty is null or i.min_qty <= 0 then 'cantidad_invalida'
      when exists (select 1 from _lp_import d where d.product_id = i.product_id and d.min_qty = i.min_qty and d.fila < i.fila) then 'duplicado'
      when i.hoy is null and i.min_qty > 1 then 'escalon_nuevo'
      when i.hoy is null then 'nuevo'
      when i.hoy = i.precio then 'igual'
      else 'cambia' end;

  select count(*) into v_fuera
    from public.price_list_items it
   where it.price_list_id = p_id
     and not exists (select 1 from _lp_import i where i.product_id = it.product_id and i.min_qty = it.min_qty
                       and i.estado in ('igual', 'nuevo', 'escalon_nuevo', 'cambia'));

  if p_apply then
    insert into public.price_list_items (organization_id, price_list_id, product_id, min_qty, price)
    select p_org, p_id, i.product_id, i.min_qty, i.precio from _lp_import i where i.estado in ('nuevo', 'escalon_nuevo', 'cambia')
    on conflict (price_list_id, product_id, min_qty) do update set price = excluded.price, updated_at = now();
    if p_replace then
      delete from public.price_list_items it
       where it.price_list_id = p_id
         and not exists (select 1 from _lp_import i where i.product_id = it.product_id and i.min_qty = it.min_qty
                           and i.estado in ('igual', 'nuevo', 'escalon_nuevo', 'cambia'));
    end if;
  end if;

  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'filas', (select count(*) from _lp_import),
      'nuevos', (select count(*) from _lp_import where estado in ('nuevo', 'escalon_nuevo')),
      'cambian', (select count(*) from _lp_import where estado = 'cambia'),
      'iguales', (select count(*) from _lp_import where estado = 'igual'),
      'errores', (select count(*) from _lp_import where estado in ('no_existe', 'precio_invalido', 'cantidad_invalida', 'duplicado')),
      'quedan_fuera', v_fuera,
      'aplicado', p_apply),
    'filas', coalesce((select jsonb_agg(jsonb_build_object('fila', fila, 'sku', sku, 'product_id', product_id, 'nombre', nombre,
                         'min_qty', min_qty, 'hoy', hoy, 'nuevo', precio, 'estado', estado) order by fila)
                         from _lp_import), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.price_list_assign_customers(p_org integer, p_id uuid, p_customer_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if not exists (select 1 from public.price_lists l where l.id = p_id and l.organization_id = p_org) then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_customer_ids, 1), 0) > 1000 then
    raise exception 'demasiados_clientes' using errcode = '22023';
  end if;
  insert into public.price_list_assignments (organization_id, price_list_id, customer_id, created_by)
  select p_org, p_id, c.id, auth.uid()
    from public.customers c
   where c.organization_id = p_org and c.id = any(coalesce(p_customer_ids, '{}'::uuid[]))
  on conflict (organization_id, customer_id) where customer_id is not null
  do update set price_list_id = excluded.price_list_id, created_by = excluded.created_by, created_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.price_list_assign_segment(p_org integer, p_id uuid, p_segment uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if not exists (select 1 from public.price_lists l where l.id = p_id and l.organization_id = p_org)
     or not exists (select 1 from public.segments s where s.id = p_segment and s.organization_id = p_org) then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  insert into public.price_list_assignments (organization_id, price_list_id, segment_id, created_by)
  values (p_org, p_id, p_segment, auth.uid())
  on conflict (organization_id, segment_id) where segment_id is not null
  do update set price_list_id = excluded.price_list_id, created_by = excluded.created_by, created_at = now();
end;
$$;

-- Quitar de la lista. Un grupo: se borra su fila. Un cliente: si sigue en un grupo con lista queda
-- «sin lista» explícito (paga el precio normal; no se le saca del grupo del CRM); si no, se borra.
create or replace function public.price_list_remove_assignment(p_org integer, p_id uuid, p_customer uuid default null, p_segment uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if p_segment is not null then
    delete from public.price_list_assignments a
     where a.organization_id = p_org and a.price_list_id = p_id and a.segment_id = p_segment;
    return;
  end if;
  if p_customer is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if exists (select 1 from public.price_list_assignments a
               join public.segment_members sm on sm.segment_id = a.segment_id and sm.customer_id = p_customer
              where a.organization_id = p_org and a.segment_id is not null) then
    insert into public.price_list_assignments (organization_id, price_list_id, customer_id, created_by)
    values (p_org, null, p_customer, auth.uid())
    on conflict (organization_id, customer_id) where customer_id is not null
    do update set price_list_id = null, created_by = excluded.created_by, created_at = now();
  else
    delete from public.price_list_assignments a
     where a.organization_id = p_org and a.customer_id = p_customer;
  end if;
end;
$$;

-- Ficha del cliente: cambiar su lista. p_list nulo = «Sin lista». Elegir la misma lista que le da
-- su grupo deja al cliente «por el grupo» (sin fila uno a uno).
create or replace function public.customer_set_price_list(p_org integer, p_customer uuid, p_list uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_grupo uuid;
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  if not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_org) then
    raise exception 'no_encontrado' using errcode = 'P0002';
  end if;
  if p_list is not null and not exists (select 1 from public.price_lists l where l.id = p_list and l.organization_id = p_org) then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  select a.price_list_id into v_grupo
    from public.price_list_assignments a
    join public.price_lists l on l.id = a.price_list_id
    join public.segment_members sm on sm.segment_id = a.segment_id and sm.customer_id = p_customer and sm.organization_id = p_org
   where a.organization_id = p_org and a.segment_id is not null
   order by l.sort_order, l.created_at, l.id limit 1;
  if p_list is not distinct from v_grupo then
    delete from public.price_list_assignments a where a.organization_id = p_org and a.customer_id = p_customer;
    return;
  end if;
  if p_list is null and v_grupo is null then
    delete from public.price_list_assignments a where a.organization_id = p_org and a.customer_id = p_customer;
    return;
  end if;
  insert into public.price_list_assignments (organization_id, price_list_id, customer_id, created_by)
  values (p_org, p_list, p_customer, auth.uid())
  on conflict (organization_id, customer_id) where customer_id is not null
  do update set price_list_id = excluded.price_list_id, created_by = excluded.created_by, created_at = now();
end;
$$;

create or replace function public.price_list_reorder(p_org integer, p_ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  update public.price_lists l set sort_order = o.pos::integer - 1
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality o(id, pos)
   where l.id = o.id and l.organization_id = p_org;
end;
$$;

create or replace function public.price_list_duplicate(p_org integer, p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nuevo uuid;
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  begin
    insert into public.price_lists (organization_id, name, currency_code, effective_from, effective_to, is_active, base_mode,
                                    base_percent, rounding_step, rounding_mode, applies_to_pos, applies_to_web,
                                    applies_to_documents, branches, web_login_notice, sort_order, created_by)
    select l.organization_id, btrim(p_name), l.currency_code, l.effective_from, l.effective_to, false, l.base_mode,
           l.base_percent, l.rounding_step, l.rounding_mode, l.applies_to_pos, l.applies_to_web,
           l.applies_to_documents, l.branches, l.web_login_notice,
           coalesce((select max(x.sort_order) + 1 from public.price_lists x where x.organization_id = p_org), 0), auth.uid()
      from public.price_lists l where l.id = p_id and l.organization_id = p_org
    returning id into v_nuevo;
  exception
    when unique_violation then raise exception 'nombre_duplicado' using errcode = '23505';
    when check_violation then raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if v_nuevo is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  insert into public.price_list_rules (organization_id, price_list_id, scope, category_id, brand, adjust_percent, no_discount)
  select r.organization_id, v_nuevo, r.scope, r.category_id, r.brand, r.adjust_percent, r.no_discount
    from public.price_list_rules r where r.price_list_id = p_id;
  insert into public.price_list_items (organization_id, price_list_id, product_id, min_qty, price)
  select i.organization_id, v_nuevo, i.product_id, i.min_qty, i.price
    from public.price_list_items i where i.price_list_id = p_id;
  return v_nuevo;
end;
$$;

create or replace function public.price_list_delete(p_org integer, p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_lista_precios_exigir_gestion(p_org);
  delete from public.price_lists l where l.id = p_id and l.organization_id = p_org;
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.price_lists_overview(integer)',
    'public.price_list_detail(integer, uuid)',
    'public.price_list_customers(integer, uuid, text, integer, integer)',
    'public.price_list_customer_candidates(integer, uuid, text, integer)',
    'public.price_list_segment_candidates(integer, uuid)',
    'public.customer_price_list_info(integer, uuid)',
    'public.price_list_save(integer, uuid, jsonb)',
    'public.price_list_import(integer, uuid, jsonb, boolean, boolean)',
    'public.price_list_assign_customers(integer, uuid, uuid[])',
    'public.price_list_assign_segment(integer, uuid, uuid)',
    'public.price_list_remove_assignment(integer, uuid, uuid, uuid)',
    'public.customer_set_price_list(integer, uuid, uuid)',
    'public.price_list_reorder(integer, uuid[])',
    'public.price_list_duplicate(integer, uuid, text)',
    'public.price_list_delete(integer, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.fn_lista_precios_clientes_efectivos(integer) from public, anon, authenticated;
