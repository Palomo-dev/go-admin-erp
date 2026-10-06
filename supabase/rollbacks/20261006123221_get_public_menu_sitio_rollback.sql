-- Reversión de 20261010090000_get_public_menu_sitio.sql (SIN APLICAR).
-- Vuelve a la get_public_menu de 20261008150100 (solo cartas vigentes, firma de 3 argumentos).
-- No toca datos. Correr ANTES del rollback de 20261008150100 si se revierten las dos.

drop function if exists public.get_public_menu(integer, integer, timestamptz, uuid, boolean);

create or replace function public.get_public_menu(p_org integer, p_branch integer, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_local timestamp;
  v_dow integer;
  v_hora text;
  v_cartas jsonb;
begin
  select coalesce(nullif(b.timezone, ''), nullif(o.timezone, ''), 'America/Bogota')
    into v_tz
    from public.organizations o
    left join public.branches b on b.id = p_branch and b.organization_id = o.id
   where o.id = p_org;
  if v_tz is null then
    raise exception 'organizacion_no_encontrada' using errcode = 'P0002';
  end if;
  v_local := p_at at time zone v_tz;
  v_dow := extract(isodow from v_local)::integer;
  v_hora := to_char(v_local, 'HH24:MI');

  select coalesce(jsonb_agg(c order by (c ->> 'orden')::int), '[]'::jsonb) into v_cartas
  from (
    select jsonb_build_object(
      'id', m.id, 'nombre', m.name, 'icono', m.icon, 'pdfUrl', m.pdf_url, 'orden', m.sort_order,
      'secciones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'categoriaId', cat.id, 'nombre', cat.name,
          'productos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id, 'nombre', p.name, 'descripcion', p.description,
              'precio', coalesce(wbp.web_price, pbp.price, pp.price),
              'destacado', coalesce(mi.is_featured, false),
              'agotado', coalesce(wbp.is_sold_out and (wbp.sold_out_until is null or wbp.sold_out_until > p_at), false),
              'etiquetas', coalesce((
                select jsonb_agg(jsonb_build_object('nombre', t.name, 'tipo', t.kind, 'color', t.color) order by t.name)
                from public.product_tags t
                where t.organization_id = p_org and t.kind in ('dieta', 'alergeno', 'picante')
                  and (t.id = p.tag_id or exists (select 1 from public.product_tag_relations r where r.product_id = p.id and r.tag_id = t.id))
              ), '[]'::jsonb)
            ) order by mi.sort_order nulls last, p.name)
            from public.products p
            left join public.restaurant_menu_items mi on mi.menu_id = m.id and mi.product_id = p.id
            left join public.website_branch_products wbp on wbp.branch_id = p_branch and wbp.product_id = p.id and wbp.organization_id = p_org
            left join lateral (
              select x.price from public.product_branch_prices x
               where x.product_id = p.id and x.branch_id = p_branch and x.organization_id = p_org
                 and x.effective_from <= p_at and (x.effective_to is null or x.effective_to > p_at)
               order by x.effective_from desc limit 1
            ) pbp on true
            left join lateral (
              select x.price from public.product_prices x
               where x.product_id = p.id and x.effective_from <= p_at and (x.effective_to is null or x.effective_to > p_at)
               order by x.effective_from desc limit 1
            ) pp on true
            where p.organization_id = p_org and p.category_id = cat.id and p.status = 'active' and p.parent_product_id is null
              and coalesce(mi.is_hidden, false) = false
              and coalesce(wbp.is_listed, true) = true
          ), '[]'::jsonb)
        ) order by s.sort_order)
        from public.restaurant_menu_sections s
        join public.categories cat on cat.id = s.category_id and cat.organization_id = p_org
        where s.menu_id = m.id
      ), '[]'::jsonb)
    ) c
    from public.restaurant_menus m
    where m.organization_id = p_org and m.is_active
      and (m.branch_ids is null or p_branch = any (m.branch_ids))
      and public.fn_carta_vigente(m.schedule, v_dow, v_hora)
  ) x;

  return jsonb_build_object('zonaHoraria', v_tz, 'dia', v_dow, 'hora', v_hora, 'cartas', v_cartas);
end;
$$;

revoke all on function public.get_public_menu(integer, integer, timestamptz) from public;
grant execute on function public.get_public_menu(integer, integer, timestamptz) to anon, authenticated, service_role;
comment on function public.get_public_menu(integer, integer, timestamptz) is
  'Cartas vigentes de una sede a una hora (zona de la sede o de la organización), con precio vigente, agotados y etiquetas de dieta. La usan el sitio público y la vista previa del ERP.';
