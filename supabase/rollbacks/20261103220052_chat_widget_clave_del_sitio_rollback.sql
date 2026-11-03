-- Rollback de 20261103220052_chat_widget_clave_del_sitio.sql
--
-- Restaura update_website_settings EXACTAMENTE como la dejó
-- 20261006122511_sitio_web_configuracion.sql y quita lo que añadió la migración.
-- No revierte datos: las claves que el trigger o la RPC hayan completado en
-- website_settings.chat_widget_public_key se quedan (son claves válidas de la
-- misma organización).

drop trigger if exists trg_canal_web_sincronizar_clave on public.channels;
drop function if exists public.fn_canal_web_sincronizar_clave();

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

drop function if exists public.fn_canal_web_clave_del_sitio(integer);
drop index if exists public.idx_conversations_widget_sesion;
