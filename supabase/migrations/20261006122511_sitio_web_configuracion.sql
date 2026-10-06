-- ⚠️ SIN APLICAR (2026-10-08). Sitio web › Configuración (Figma B/12-01…12-06).
-- Ensayo 2026-10-06 (integrador, execute_sql, do/raise que se deshace solo): columnas, CHECK
-- validados sobre 92 filas y update_website_settings llamada con mantenimiento, idioma y un
-- código a medida → ENSAYO_OK {"ok": true}. delete_website NO se ensayó: el MCP retiene sin
-- responder el SQL que contiene «delete from» (espera confirmación del usuario). Columnas que
-- lee verificadas por MCP (website_menus, website_site_drafts, website_site_states,
-- header_menu_id, header_mega_menu_id). No se aplicó.
--
-- Estado verificado por MCP antes de escribir esto:
-- - website_settings: 92 filas, todas con branch_id NULL (una por organización).
--   No existen maintenance_mode, maintenance_message, site_locale, custom_code,
--   contact_email, contact_phone, whatsapp_number ni whatsapp_greeting.
-- - custom_scripts (text) tiene valor en 4 organizaciones (el snippet de Meta Pixel):
--   NO se cambia de tipo ni se borra. Queda de solo lectura («Código anterior»)
--   hasta que el área seoanalitica lo pase a meta_pixel_id.
-- - La política de escritura de website_settings decide por el NOMBRE del rol
--   («Admins pueden modificar website»): por eso la escritura va por una RPC
--   SECURITY DEFINER que exige el permiso `website.sites.edit` (o
--   `website.sites.publish` para despublicar/eliminar) con fn_website_exigir_permiso.
-- - website_site_revisions es inmutable por trigger: eliminar el sitio NO la toca.
--
-- Qué hace (aditivo):
-- 1. Columnas nuevas en website_settings, con DEFAULT o NULL-ables.
-- 2. update_website_settings(p_org, p_patch): escribe SOLO claves de una lista
--    blanca en un paso; sella autor y fecha de cada código a medida nuevo.
-- 3. delete_website(p_org): borra páginas, secciones, menús y borradores V2 del
--    sitio y lo deja despublicado. Nunca toca products, web_orders, customers,
--    organization_domains ni las revisiones publicadas (auditoría).
--
-- Dependencia: goadmin-websites debe responder 503 con la página «Volvemos pronto»
-- cuando maintenance_mode = true (PR separado). El ERP no muestra el interruptor
-- como activo hasta que esta migración esté aplicada.

alter table public.website_settings
  add column if not exists maintenance_mode    boolean not null default false,
  add column if not exists maintenance_message text null,
  add column if not exists site_locale         text not null default 'es-CO',
  add column if not exists custom_code         jsonb not null default '[]'::jsonb,
  add column if not exists contact_email       text null,
  add column if not exists contact_phone       text null,
  add column if not exists whatsapp_number     text null,
  add column if not exists whatsapp_greeting   text null;

alter table public.website_settings
  add constraint website_settings_site_locale_valido
    check (site_locale in ('es-CO', 'en', 'fr', 'pt')) not valid,
  add constraint website_settings_custom_code_lista
    check (jsonb_typeof(custom_code) = 'array' and jsonb_array_length(custom_code) <= 20) not valid,
  add constraint website_settings_maintenance_message_largo
    check (maintenance_message is null or char_length(maintenance_message) <= 300) not valid,
  add constraint website_settings_contacto_largo
    check (
      (contact_email is null or char_length(contact_email) <= 254)
      and (contact_phone is null or char_length(contact_phone) <= 40)
      and (whatsapp_number is null or char_length(whatsapp_number) <= 40)
      and (whatsapp_greeting is null or char_length(whatsapp_greeting) <= 200)
    ) not valid;

-- Todas las filas actuales tienen los DEFAULT: validar no falla.
alter table public.website_settings validate constraint website_settings_site_locale_valido;
alter table public.website_settings validate constraint website_settings_custom_code_lista;
alter table public.website_settings validate constraint website_settings_maintenance_message_largo;
alter table public.website_settings validate constraint website_settings_contacto_largo;

comment on column public.website_settings.maintenance_mode is
  'Sitio en construcción: el sitio público responde «Volvemos pronto» salvo a la sesión del ERP. Sitio web › Configuración › Mantenimiento.';
comment on column public.website_settings.maintenance_message is 'Texto opcional de la página «Volvemos pronto».';
comment on column public.website_settings.site_locale is 'Idioma de los textos del checkout, correos y botones del sitio. Sitio web › Configuración › Idioma y moneda.';
comment on column public.website_settings.custom_code is
  'Código a medida: [{id, nombre, alcance (todas|/ruta), posicion (head|body), activo, codigo, creado_por, creado_en}]. Autor y fecha los sella update_website_settings.';
comment on column public.website_settings.contact_email is 'Correo de contacto del sitio (si es NULL, el de la organización).';
comment on column public.website_settings.contact_phone is 'Teléfono del sitio (si es NULL, el de la organización).';
comment on column public.website_settings.whatsapp_number is 'Número del botón flotante de WhatsApp.';
comment on column public.website_settings.whatsapp_greeting is 'Saludo prellenado del botón de WhatsApp.';

-- ---------------------------------------------------------------------------
-- update_website_settings: un solo paso, lista blanca de claves.
-- ---------------------------------------------------------------------------
create or replace function public.update_website_settings(p_org integer, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_permitidas constant text[] := array[
    'chat_widget_enabled', 'maintenance_mode', 'maintenance_message', 'site_locale',
    'contact_email', 'contact_phone', 'whatsapp_number', 'whatsapp_greeting', 'custom_code'
  ];
  v_clave text;
  v_actual jsonb;
  v_codigo jsonb := null;
  v_item jsonb;
  v_previo jsonb;
  v_salida jsonb := '[]'::jsonb;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticion_invalida' using errcode = '22023';
  end if;
  for v_clave in select jsonb_object_keys(p_patch) loop
    if not (v_clave = any (v_permitidas)) then
      raise exception 'clave_no_permitida: %', v_clave using errcode = '22023';
    end if;
  end loop;

  select custom_code into v_actual
    from public.website_settings
   where organization_id = p_org and branch_id is null
   for update;
  if not found then
    raise exception 'sin_ajustes' using errcode = 'P0002';
  end if;

  -- Código a medida: conserva autor y fecha de lo que ya existía (por id) y sella lo nuevo.
  -- Una clave ausente en el ítem conserva su valor anterior (un parche no borra el código).
  if p_patch ? 'custom_code' then
    if jsonb_typeof(p_patch -> 'custom_code') <> 'array' then
      raise exception 'peticion_invalida' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_patch -> 'custom_code') loop
      select value into v_previo
        from jsonb_array_elements(coalesce(v_actual, '[]'::jsonb))
       where value ->> 'id' = v_item ->> 'id'
       limit 1;
      v_salida := v_salida || jsonb_build_array(jsonb_build_object(
        'id', coalesce(v_previo ->> 'id', gen_random_uuid()::text),
        'nombre', left(coalesce(v_item ->> 'nombre', v_previo ->> 'nombre', ''), 80),
        'alcance', left(coalesce(v_item ->> 'alcance', v_previo ->> 'alcance', 'todas'), 200),
        'posicion', case when coalesce(v_item ->> 'posicion', v_previo ->> 'posicion') = 'head' then 'head' else 'body' end,
        'activo', coalesce((v_item ->> 'activo')::boolean, (v_previo ->> 'activo')::boolean, true),
        'codigo', left(coalesce(v_item ->> 'codigo', v_previo ->> 'codigo', ''), 20000),
        'creado_por', coalesce(v_previo ->> 'creado_por', auth.uid()::text),
        'creado_en', coalesce(v_previo ->> 'creado_en', now()::text)
      ));
      v_previo := null;
    end loop;
    v_codigo := v_salida;
  end if;

  update public.website_settings set
    chat_widget_enabled = case when p_patch ? 'chat_widget_enabled' then (p_patch ->> 'chat_widget_enabled')::boolean else chat_widget_enabled end,
    maintenance_mode    = case when p_patch ? 'maintenance_mode' then (p_patch ->> 'maintenance_mode')::boolean else maintenance_mode end,
    maintenance_message = case when p_patch ? 'maintenance_message' then nullif(p_patch ->> 'maintenance_message', '') else maintenance_message end,
    site_locale         = case when p_patch ? 'site_locale' then p_patch ->> 'site_locale' else site_locale end,
    contact_email       = case when p_patch ? 'contact_email' then nullif(p_patch ->> 'contact_email', '') else contact_email end,
    contact_phone       = case when p_patch ? 'contact_phone' then nullif(p_patch ->> 'contact_phone', '') else contact_phone end,
    whatsapp_number     = case when p_patch ? 'whatsapp_number' then nullif(p_patch ->> 'whatsapp_number', '') else whatsapp_number end,
    whatsapp_greeting   = case when p_patch ? 'whatsapp_greeting' then nullif(p_patch ->> 'whatsapp_greeting', '') else whatsapp_greeting end,
    custom_code         = coalesce(v_codigo, custom_code),
    updated_at          = now()
  where organization_id = p_org and branch_id is null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_website_settings(integer, jsonb) from public, anon;
grant execute on function public.update_website_settings(integer, jsonb) to authenticated, service_role;

comment on function public.update_website_settings(integer, jsonb) is
  'Sitio web › Configuración: guarda en un paso las claves permitidas de website_settings (exige website.sites.edit).';

-- ---------------------------------------------------------------------------
-- delete_website: borra el contenido del sitio y lo despublica.
-- ---------------------------------------------------------------------------
create or replace function public.delete_website(p_org integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paginas integer;
  v_menus integer;
  v_borradores integer;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.publish');

  delete from public.website_menus where organization_id = p_org;      -- cascada: website_menu_items
  get diagnostics v_menus = row_count;
  delete from public.website_pages where organization_id = p_org;      -- cascada: secciones y versiones
  get diagnostics v_paginas = row_count;
  delete from public.website_site_drafts where organization_id = p_org;
  get diagnostics v_borradores = row_count;

  -- El sitio V2 deja de tener publicación vigente; las revisiones (inmutables) se conservan.
  update public.website_site_states set published_revision_id = null, updated_at = now()
   where organization_id = p_org;

  update public.website_settings
     set is_published = false, published_at = null, header_menu_id = null, header_mega_menu_id = null, updated_at = now()
   where organization_id = p_org;

  return jsonb_build_object('paginas', v_paginas, 'menus', v_menus, 'borradores', v_borradores);
end;
$$;

revoke all on function public.delete_website(integer) from public, anon;
grant execute on function public.delete_website(integer) to authenticated, service_role;

comment on function public.delete_website(integer) is
  'Sitio web › Configuración › Zona de peligro: borra páginas, menús y borradores del sitio y lo despublica (exige website.sites.publish). No toca productos, pedidos, clientes, dominios ni revisiones.';
