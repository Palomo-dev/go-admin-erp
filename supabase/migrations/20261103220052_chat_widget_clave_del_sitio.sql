-- Widget de chat del sitio web: la clave del canal llega sola al sitio.
--
-- Contexto: el sitio público (goadmin-websites) pinta el widget solo si
-- website_settings.chat_widget_enabled = true Y chat_widget_public_key no es
-- null. Dos caminos dejaban el interruptor encendido sin widget:
--   1. Sitio web › Configuración › Chat escribe solo chat_widget_enabled (la
--      RPC update_website_settings no conoce la clave).
--   2. Rotar la clave del canal (Chat › Canales › Sitio web) no actualizaba la
--      copia de website_settings: el sitio seguía cargando la clave vieja y el
--      widget respondía «canal no disponible».
--
-- Qué hace (aditiva, sin tocar datos existentes):
--   - fn_canal_web_clave_del_sitio(org): clave del canal «sitio web» activo más
--     reciente de la organización. Solo la usan funciones internas.
--   - update_website_settings: mismo cuerpo y misma lista blanca; al encender el
--     chat completa la clave si falta o apunta a un canal que ya no está activo,
--     y devuelve chat_sin_canal = true si la organización no tiene canal.
--   - trg_canal_web_sincronizar_clave: al rotar channels.public_key de un canal
--     «sitio web», reemplaza la clave vieja por la nueva en website_settings de
--     la MISMA organización (solo las filas que tenían la vieja).
--   - idx_conversations_widget_sesion: la Edge Function chat-widget busca la
--     conversación del visitante por (channel_id, metadata->>'sessionId') en
--     cada sondeo.
--
-- Rollback: supabase/rollbacks/<esta versión>_chat_widget_clave_del_sitio_rollback.sql

create or replace function public.fn_canal_web_clave_del_sitio(p_org integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select c.public_key
    from public.channels c
   where c.organization_id = p_org
     and c.type = 'website'
     and c.status = 'active'
     and c.public_key is not null
   order by c.updated_at desc nulls last, c.created_at desc nulls last
   limit 1;
$fn$;

revoke all on function public.fn_canal_web_clave_del_sitio(integer) from public, anon, authenticated;
grant execute on function public.fn_canal_web_clave_del_sitio(integer) to service_role;

comment on function public.fn_canal_web_clave_del_sitio(integer) is
  'Clave pública del canal «sitio web» activo más reciente de la organización. Uso interno de update_website_settings.';

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
  v_sin_canal boolean := false;
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

  -- Chat del sitio: al encenderlo, si el sitio no tiene clave o tiene la de un
  -- canal que ya no está activo, se toma la del canal «sitio web» activo de la
  -- organización. Sin esto el interruptor quedaba encendido y el sitio no
  -- mostraba nada (el sitio pinta el widget solo con enabled Y clave).
  if p_patch ? 'chat_widget_enabled' and (p_patch ->> 'chat_widget_enabled')::boolean then
    update public.website_settings ws
       set chat_widget_public_key = public.fn_canal_web_clave_del_sitio(p_org)
     where ws.organization_id = p_org
       and ws.branch_id is null
       and not exists (
         select 1
           from public.channels c
          where c.organization_id = p_org
            and c.type = 'website'
            and c.status = 'active'
            and c.public_key = ws.chat_widget_public_key
       );
    v_sin_canal := public.fn_canal_web_clave_del_sitio(p_org) is null;
  end if;

  return jsonb_build_object('ok', true, 'chat_sin_canal', v_sin_canal);
end;
$$;

revoke all on function public.update_website_settings(integer, jsonb) from public, anon;
grant execute on function public.update_website_settings(integer, jsonb) to authenticated, service_role;

create or replace function public.fn_canal_web_sincronizar_clave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.type = 'website'
     and old.public_key is not null
     and new.public_key is distinct from old.public_key then
    update public.website_settings
       set chat_widget_public_key = new.public_key,
           updated_at = now()
     where organization_id = new.organization_id
       and chat_widget_public_key = old.public_key;
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_canal_web_sincronizar_clave() from public, anon, authenticated;

create or replace trigger trg_canal_web_sincronizar_clave
  after update of public_key on public.channels
  for each row
  execute function public.fn_canal_web_sincronizar_clave();

comment on function public.fn_canal_web_sincronizar_clave() is
  'Al rotar la clave de un canal «sitio web», el sitio de la misma organización pasa a usar la nueva.';

create index if not exists idx_conversations_widget_sesion
  on public.conversations (channel_id, (metadata ->> 'sessionId'))
  where (metadata ->> 'sessionId') is not null;
