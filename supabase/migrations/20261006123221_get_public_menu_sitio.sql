-- ⚠️ SIN APLICAR (2026-10-06). get_public_menu para el sitio público (goadmin-websites).
--
-- DEPENDE de 20261008150100_carta_restaurante.sql y 20261008150200_carta_opciones_visibles.sql
-- (también sin aplicar): se aplica DESPUÉS de las dos. Reversión: el _rollback de este archivo
-- ANTES que el de 20261008150100 (aquel quita la firma de 3 argumentos, no esta).
--
-- Por qué: get_public_menu solo devolvía las cartas VIGENTES en ese instante. El sitio público
-- necesita además:
--   1. «Carta fija» (editor › sección Carta › `content.carta_id`): una carta concreta, esté o no
--      en horario (p_menu).
--   2. Las pestañas de cartas («Desayuno · 07:00–11:00», «Disponible desde las 12:00»): todas
--      las cartas activas de la sede con su horario y si están vigentes (p_todas).
--   3. «Variantes y extras» de la carta (20261008150200): qué variantes y grupos de extras NO se
--      muestran de cada plato (variantesOcultas, extrasOcultos).
-- Una sola RPC y una sola regla de vigencia (fn_carta_vigente) para el ERP y para la web.
--
-- Compatibilidad: los parámetros nuevos tienen default. Con (p_org, p_branch, p_at) devuelve lo
-- mismo que antes (solo vigentes) más campos nuevos aditivos (`horario`, `vigente` por carta y
-- `variantesOcultas`/`extrasOcultos` por plato): el ERP (carta.server.ts) los ignora.
-- Se quita la firma de 3 argumentos para que PostgREST no vea dos funciones con el mismo nombre
-- (una llamada con argumentos por nombre sería ambigua). No toca datos.
--
-- Ensayo 2026-10-06 (execute_sql, do/raise que se deshace solo; base verificada igual después):
-- tablas mínimas de 20261008150100 + columnas de 20261008150200 + esta función, una carta de
-- prueba fuera de horario con un plato destacado y variantes/extras ocultos, llamadas como anon →
-- «ENSAYO_OK get_public_menu_sitio org=2 fija=1 todas=1 vigentes=0 dia=1 hora=10:00»:
-- carta fija devuelta fuera de horario con vigente=false, p_todas la incluye con su horario,
-- la llamada de 3 argumentos por nombre (la del ERP) no la incluye, y el plato trae
-- destacado, variantesOcultas [7] y extrasOcultos [9]. El «drop» de la firma vieja no se ensayó
-- (esa firma aún no existe en la base).

drop function if exists public.get_public_menu(integer, integer, timestamptz);

create or replace function public.get_public_menu(
  p_org integer,
  p_branch integer,
  p_at timestamptz default now(),
  p_menu uuid default null,
  p_todas boolean default false
)
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
      'horario', m.schedule,
      'vigente', public.fn_carta_vigente(m.schedule, v_dow, v_hora),
      'secciones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'categoriaId', cat.id, 'nombre', cat.name,
          'productos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id, 'nombre', p.name, 'descripcion', p.description,
              'precio', coalesce(wbp.web_price, pbp.price, pp.price),
              'destacado', coalesce(mi.is_featured, false),
              'agotado', coalesce(wbp.is_sold_out and (wbp.sold_out_until is null or wbp.sold_out_until > p_at), false),
              'variantesOcultas', to_jsonb(coalesce(mi.hidden_variant_ids, '{}'::integer[])),
              'extrasOcultos', to_jsonb(coalesce(mi.hidden_modifier_group_ids, '{}'::integer[])),
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
      and (
        case
          when p_menu is not null then m.id = p_menu
          when p_todas then true
          else public.fn_carta_vigente(m.schedule, v_dow, v_hora)
        end
      )
  ) x;

  return jsonb_build_object('zonaHoraria', v_tz, 'dia', v_dow, 'hora', v_hora, 'cartas', v_cartas);
end;
$$;

revoke all on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) from public;
grant execute on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) to anon, authenticated, service_role;
comment on function public.get_public_menu(integer, integer, timestamptz, uuid, boolean) is
  'Cartas de una sede a una hora (zona de la sede o de la organización): vigentes (por defecto), todas las activas con su horario (p_todas) o una carta fija (p_menu). Con precio vigente, agotados, etiquetas de dieta y variantes/extras ocultos. La usan el sitio público y la vista previa del ERP.';

-- ---------------------------------------------------------------------------
-- Ensayo (execute_sql ANTES de aplicar; se deshace solo con la excepción final).
-- Crea lo mínimo de 20261008150100/150200 si no existe (tablas y fn_carta_vigente), esta
-- función, una carta de prueba en una organización con categoría y producto activos, y llama
-- a la RPC como anon en los tres modos.
--
-- do $ensayo$
-- declare v_org integer; v_cat integer; v_prod integer; v_menu uuid; v_r jsonb;
-- begin
--   (crear tablas y fn_carta_vigente como en 20261008150100, columnas de 20261008150200,
--    ejecutar el create function de arriba)
--   select p.organization_id, p.category_id, p.id into v_org, v_cat, v_prod
--     from public.products p where p.status = 'active' and p.parent_product_id is null and p.category_id is not null limit 1;
--   insert into public.restaurant_menus (organization_id, name, schedule) values (v_org, 'Ensayo', '{"1":[{"from":"03:00","to":"03:01"}]}') returning id into v_menu;
--   insert into public.restaurant_menu_sections (organization_id, menu_id, category_id) values (v_org, v_menu, v_cat);
--   insert into public.restaurant_menu_items (organization_id, menu_id, product_id, is_featured, hidden_variant_ids) values (v_org, v_menu, v_prod, true, '{7}');
--   set local role anon;
--   v_r := public.get_public_menu(v_org, null, now(), v_menu);         -- carta fija fuera de horario
--   v_r := public.get_public_menu(v_org, null, now(), null, true);     -- todas, con vigente=false
--   v_r := public.get_public_menu(v_org, null, now());                 -- solo vigentes: ninguna
--   raise exception 'ENSAYO_OK get_public_menu_sitio';
-- end
-- $ensayo$;
-- ---------------------------------------------------------------------------
