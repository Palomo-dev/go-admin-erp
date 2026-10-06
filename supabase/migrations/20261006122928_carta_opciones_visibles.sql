-- ⚠️ SIN APLICAR (2026-10-06). Sitio web › Carta › detalle › «Variantes y extras»
-- Ensayo 2026-10-06 (integrador): las dos columnas se crearon dentro del ensayo de
-- 20261008150100 (ENSAYO_OK); products.parent_product_id y product_modifier_groups.product_id
-- verificadas por MCP. guardar_carta no se ensayó (el MCP retiene el SQL con «delete from»).
-- (Figma B/13-02; arquitectura: «Variantes y extras: cuáles se muestran»).
--
-- DEPENDE de 20261008150100_carta_restaurante.sql (también sin aplicar): se aplica
-- DESPUÉS de esa.
--
-- ⚠️ No se pudo verificar el esquema ni correr el ensayo: el MCP de Supabase respondió
-- «FGA Authentication Error. Unauthorized» el 2026-10-06. Antes de aplicar, verificar por
-- MCP que existen products.parent_product_id y product_modifier_groups(id, product_id,
-- organization_id) — los leen hoy posService y ProductModifiersService — y correr el
-- ensayo del final.
--
-- Qué hace (aditivo, sin datos de clientes: la tabla aún no existe en producción):
-- 1. restaurant_menu_items.hidden_variant_ids y hidden_modifier_group_ids (integer[]
--    NOT NULL DEFAULT '{}'): variantes (productos hijos) y grupos de extras que NO se
--    muestran en esa carta. Vacío = se muestran todos (lo de hoy).
-- 2. guardar_carta guarda las dos listas en el mismo lote que el resto del detalle.
--
-- Pendiente fuera de este archivo (reportado al integrador): get_public_menu y el
-- sitio público (goadmin-websites) deben omitir las variantes y extras ocultos. Hoy el
-- sitio lee los modificadores por su cuenta; sin ese cambio, ocultarlos aquí solo
-- queda guardado.

alter table public.restaurant_menu_items
  add column if not exists hidden_variant_ids integer[] not null default '{}',
  add column if not exists hidden_modifier_group_ids integer[] not null default '{}';

comment on column public.restaurant_menu_items.hidden_variant_ids is
  'Variantes (products.id hijos del producto) que no se muestran en esta carta. Vacío = todas.';
comment on column public.restaurant_menu_items.hidden_modifier_group_ids is
  'Grupos de extras (product_modifier_groups.id) que no se muestran en esta carta. Vacío = todos.';

-- ---------------------------------------------------------------------------
-- guardar_carta: igual que en 20261008150100, más las dos listas de items.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_carta(p_menu uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select organization_id into v_org from public.restaurant_menus where id = p_menu for update;
  if not found then
    raise exception 'carta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_website_exigir_permiso(v_org, 'website.sites.edit');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticion_invalida' using errcode = '22023';
  end if;

  update public.restaurant_menus set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    icon = case when p_patch ? 'icon' then p_patch ->> 'icon' else icon end,
    schedule = case when p_patch ? 'schedule' then p_patch -> 'schedule' else schedule end,
    branch_ids = case when p_patch ? 'branch_ids' then
                   case when jsonb_typeof(p_patch -> 'branch_ids') = 'array'
                        then array(select (jsonb_array_elements_text(p_patch -> 'branch_ids'))::integer)
                        else null end
                 else branch_ids end,
    pdf_url = case when p_patch ? 'pdf_url' then nullif(p_patch ->> 'pdf_url', '') else pdf_url end,
    is_active = case when p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean else is_active end
  where id = p_menu;

  if p_patch ? 'secciones' then
    delete from public.restaurant_menu_sections s
     where s.menu_id = p_menu
       and not exists (select 1 from jsonb_array_elements(p_patch -> 'secciones') e where (e ->> 'category_id')::integer = s.category_id);
    insert into public.restaurant_menu_sections (organization_id, menu_id, category_id, sort_order)
      select v_org, p_menu, (e ->> 'category_id')::integer, coalesce((e ->> 'sort_order')::integer, 0)
        from jsonb_array_elements(p_patch -> 'secciones') e
    on conflict (menu_id, category_id) do update set sort_order = excluded.sort_order;
  end if;

  if p_patch ? 'items' then
    delete from public.restaurant_menu_items i
     where i.menu_id = p_menu
       and not exists (select 1 from jsonb_array_elements(p_patch -> 'items') e where (e ->> 'product_id')::integer = i.product_id);
    insert into public.restaurant_menu_items (organization_id, menu_id, product_id, is_featured, is_hidden, sort_order,
                                              hidden_variant_ids, hidden_modifier_group_ids)
      select v_org, p_menu, (e ->> 'product_id')::integer,
             coalesce((e ->> 'is_featured')::boolean, false), coalesce((e ->> 'is_hidden')::boolean, false),
             (e ->> 'sort_order')::integer,
             coalesce(array(select (jsonb_array_elements_text(coalesce(e -> 'hidden_variant_ids', '[]'::jsonb)))::integer), '{}'),
             coalesce(array(select (jsonb_array_elements_text(coalesce(e -> 'hidden_modifier_group_ids', '[]'::jsonb)))::integer), '{}')
        from jsonb_array_elements(p_patch -> 'items') e
    on conflict (menu_id, product_id) do update
      set is_featured = excluded.is_featured, is_hidden = excluded.is_hidden, sort_order = excluded.sort_order,
          hidden_variant_ids = excluded.hidden_variant_ids, hidden_modifier_group_ids = excluded.hidden_modifier_group_ids;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ensayo (correr con execute_sql ANTES de aplicar; se deshace solo):
--
-- do $ensayo$
-- begin
--   alter table public.restaurant_menu_items
--     add column if not exists hidden_variant_ids integer[] not null default '{}',
--     add column if not exists hidden_modifier_group_ids integer[] not null default '{}';
--   perform 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'restaurant_menu_items'
--      and column_name in ('hidden_variant_ids', 'hidden_modifier_group_ids')
--   having count(*) = 2;
--   if not found then raise exception 'ENSAYO_FALLO columnas'; end if;
--   raise exception 'ENSAYO_OK carta_opciones_visibles';
-- end
-- $ensayo$;
-- ---------------------------------------------------------------------------
