-- Reversión de 20261008150200_carta_opciones_visibles.sql (SIN APLICAR).
-- Devuelve guardar_carta a la versión de 20261008150100 y quita las dos columnas.
-- Se pierde qué variantes y extras estaban ocultos en cada carta (vuelven a verse todos).

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
    insert into public.restaurant_menu_items (organization_id, menu_id, product_id, is_featured, is_hidden, sort_order)
      select v_org, p_menu, (e ->> 'product_id')::integer,
             coalesce((e ->> 'is_featured')::boolean, false), coalesce((e ->> 'is_hidden')::boolean, false),
             (e ->> 'sort_order')::integer
        from jsonb_array_elements(p_patch -> 'items') e
    on conflict (menu_id, product_id) do update
      set is_featured = excluded.is_featured, is_hidden = excluded.is_hidden, sort_order = excluded.sort_order;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

alter table public.restaurant_menu_items
  drop column if exists hidden_modifier_group_ids,
  drop column if exists hidden_variant_ids;
