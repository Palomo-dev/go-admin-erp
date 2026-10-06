-- ⚠️ SIN APLICAR (2026-10-06). Sitio web › Carta › detalle: guardado ATÓMICO de la carta
-- y de su pestaña «Por sede».
--
-- DEPENDE de 20261008150100_carta_restaurante.sql y 20261008150200_carta_opciones_visibles.sql
-- (guardar_carta): se aplica DESPUÉS de las dos. Con p_menu NULL (carta implícita) no llama a
-- guardar_carta y funciona sin ellas.
--
-- Problema: PUT /api/sitio-web/carta/[menuId] guardaba primero la carta (guardar_carta) y
-- después cada sede con un upsert propio. Si fallaba una sede, la carta ya había cambiado.
--
-- Qué hace (aditivo, sin tocar datos):
--   guardar_carta_y_sedes(p_org, p_menu, p_patch, p_filas) guarda en UNA transacción el
--   detalle de la carta (si p_menu no es NULL) y las filas finales de website_branch_products
--   que calcula el servidor (prepararFilasCartaSede: permiso, sede y productos de la
--   organización, fusión con lo guardado). O queda todo o no queda nada.
--
-- Seguridad: SECURITY INVOKER, así que la RLS de website_branch_products
-- (fn_website_tiene_permiso(org, 'website.sites.edit')) sigue aplicando. Además exige el
-- permiso, que la carta sea de p_org y que cada sede y producto sea de p_org (la organización
-- la pone el route handler desde la sesión, nunca el body).
--
-- Esquema verificado por MCP el 2026-10-06: website_branch_products(organization_id int NOT
-- NULL, branch_id int NOT NULL, product_id int NOT NULL, is_listed bool NOT NULL default true,
-- web_price numeric NULL CHECK >= 0, is_sold_out bool NOT NULL default false, sold_out_until
-- timestamptz NULL, updated_by uuid default auth.uid(), updated_at timestamptz default now()),
-- PK (branch_id, product_id). fn_website_exigir_permiso(integer, text) existe.
--
-- Ensayo 2026-10-06 por MCP: ENSAYO_OK. Bloque do $$ que crea la función, pasa a `authenticated`
-- con un miembro administrador de una organización de prueba (org 131), guarda una fila real de
-- website_branch_products ({"ok": true, "filas": 1}) y comprueba que una fila con un producto de
-- otra organización se rechaza con 42501. Después del ensayo la función y la fila no existen: se
-- deshizo todo.

create or replace function public.guardar_carta_y_sedes(
  p_org integer,
  p_menu uuid,
  p_patch jsonb,
  p_filas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_menu integer;
  v_filas integer := 0;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'peticion_invalida' using errcode = '22023';
  end if;

  if p_menu is not null then
    select organization_id into v_org_menu from public.restaurant_menus where id = p_menu;
    if not found or v_org_menu <> p_org then
      raise exception 'carta_no_encontrada' using errcode = 'P0002';
    end if;
    if p_patch is not null and p_patch <> '{}'::jsonb then
      perform public.guardar_carta(p_menu, p_patch);
    end if;
  end if;

  if jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('ok', true, 'filas', 0);
  end if;

  -- Cada fila es de la organización: sede y producto.
  if exists (
    select 1
    from jsonb_to_recordset(p_filas) as f(branch_id integer, product_id integer)
    where not exists (select 1 from public.branches b where b.id = f.branch_id and b.organization_id = p_org)
       or not exists (select 1 from public.products p where p.id = f.product_id and p.organization_id = p_org)
  ) then
    raise exception 'fila_de_otra_organizacion' using errcode = '42501';
  end if;

  insert into public.website_branch_products as w
    (organization_id, branch_id, product_id, is_listed, web_price, is_sold_out, sold_out_until, updated_by, updated_at)
  select p_org, f.branch_id, f.product_id,
         coalesce(f.is_listed, true), f.web_price, coalesce(f.is_sold_out, false), f.sold_out_until,
         auth.uid(), now()
  from jsonb_to_recordset(p_filas)
       as f(branch_id integer, product_id integer, is_listed boolean, web_price numeric, is_sold_out boolean, sold_out_until timestamptz)
  on conflict (branch_id, product_id) do update set
    is_listed = excluded.is_listed,
    web_price = excluded.web_price,
    is_sold_out = excluded.is_sold_out,
    sold_out_until = excluded.sold_out_until,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
  get diagnostics v_filas = row_count;

  return jsonb_build_object('ok', true, 'filas', v_filas);
end;
$$;

revoke all on function public.guardar_carta_y_sedes(integer, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_carta_y_sedes(integer, uuid, jsonb, jsonb) to authenticated, service_role;

comment on function public.guardar_carta_y_sedes(integer, uuid, jsonb, jsonb) is
  'Sitio web › Carta: guarda el detalle de la carta (guardar_carta) y las filas por sede de website_branch_products en una sola transacción. SECURITY INVOKER: aplica la RLS.';

-- ---------------------------------------------------------------------------
-- Ensayo (se deshace solo): se corre con el MCP como un bloque do $$ … $$ que crea la
-- función, se pone como `authenticated` con el sub de un miembro con website.sites.edit,
-- llama con p_menu NULL y una fila real (mismo valor que ya tiene, para no cambiar nada
-- visible), comprueba que la fila existe y lanza 'ENSAYO_OK …' para deshacerlo todo.
-- También comprueba que una fila de otra organización se rechaza con 42501.
-- ---------------------------------------------------------------------------
