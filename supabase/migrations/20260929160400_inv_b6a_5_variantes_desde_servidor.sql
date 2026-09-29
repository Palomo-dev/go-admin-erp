-- Inventario B6a · Variantes: escrituras grandes desde el servidor, a nombre
-- de quien las pide.
--
-- Medido en la base (org 137, 11.551 variantes con «Talla»): renombrar el tipo
-- reescribe 11.551 filas de `products` y otras tantas de `products_audit_log`
-- (disparador existente) en ~17 s. PostgREST corta a `authenticated` a los 8 s
-- (`statement_timeout`), así que desde el navegador un renombre o una fusión
-- en una organización grande fallaría a mitad (la transacción se deshace, no
-- queda nada a medias, pero no se puede hacer).
--
-- Solución: las escrituras del catálogo de variantes las hace la ruta
-- `POST /api/inventario/variantes` (organización de la sesión con
-- `getServerOrgContext`, cliente de servicio, sin límite de 8 s) llamando a
-- `fn_variantes_como_actor`, que solo puede ejecutar `service_role`. Esa
-- función fija `request.jwt.claims` al usuario de la sesión dentro de la
-- transacción: `auth.uid()` vuelve a ser la persona, así que las RPC públicas
-- vuelven a exigir su pertenencia y su permiso (`fn_inventario_exigir_permiso`)
-- y el historial (`products_audit_log.user_id`) queda a su nombre. No hay un
-- segundo camino de permisos: son las mismas funciones.
--
-- También: `fn_variantes_int_valores_de` pasa a plpgsql. La versión SQL dejaba
-- que el planificador reevaluara las claves del tipo por cada fila (10 s en la
-- org 137); ahora se calculan una vez.

set local lock_timeout = '5s';

create or replace function public.fn_variantes_int_valores_de(p_org integer, p_tipo integer, p_valor integer)
returns text[]
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_claves text[] := public.fn_variantes_int_claves_de(p_org, p_tipo);
  v_texto text;
  v_out text[];
begin
  select value into v_texto from public.variant_values where id = p_valor and variant_type_id = p_tipo;
  if v_texto is null or cardinality(v_claves) = 0 then
    return '{}';
  end if;
  select coalesce(array_agg(d.valor), '{}') into v_out
    from (select distinct f.valor
            from public.fn_variantes_int_filas(p_org, true) f
           where f.clave = any (v_claves)
             and lower(f.valor) = lower(btrim(v_texto))) d
   where public.fn_variantes_int_valor_de(p_tipo, d.valor) = p_valor;
  return v_out;
end;
$$;
revoke all on function public.fn_variantes_int_valores_de(integer, integer, integer) from public, anon, authenticated;

create or replace function public.fn_variantes_como_actor(p_actor uuid, p_org integer, p_accion text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_ids integer[];
  v_ids2 integer[];
begin
  if p_actor is null then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  -- Desde aquí `auth.uid()` es la persona de la sesión: las RPC públicas
  -- validan su pertenencia y su permiso como si llamara ella.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);

  select coalesce(array_agg(x::integer), '{}') into v_ids from jsonb_array_elements_text(coalesce(v_args -> 'ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::integer), '{}') into v_ids2 from jsonb_array_elements_text(coalesce(v_args -> 'valores', '[]'::jsonb)) x;

  case p_accion
    when 'tipo_guardar' then
      return public.fn_variante_tipo_guardar(p_org, nullif(v_args ->> 'id', '')::integer, coalesce(v_args -> 'datos', '{}'::jsonb));
    when 'valor_guardar' then
      return public.fn_variante_valor_guardar(p_org, nullif(v_args ->> 'id', '')::integer, coalesce(v_args -> 'datos', '{}'::jsonb));
    when 'fusionar_tipos' then
      return public.fn_variantes_fusionar_tipos(p_org, v_ids, (v_args ->> 'destino')::integer);
    when 'fusionar_valores' then
      return public.fn_variantes_fusionar_valores(p_org, v_ids, (v_args ->> 'destino')::integer);
    when 'reordenar' then
      return to_jsonb(public.fn_variantes_reordenar(p_org, nullif(v_args ->> 'tipo', '')::integer, v_ids));
    when 'cambiar' then
      return to_jsonb(public.fn_variantes_cambiar(p_org, v_ids, v_ids2, coalesce(v_args -> 'cambios', '{}'::jsonb)));
    when 'eliminar' then
      return to_jsonb(public.fn_variantes_eliminar(p_org, v_ids, v_ids2));
    when 'completar' then
      return public.fn_variantes_completar_catalogo(p_org);
    when 'sugeridos' then
      return to_jsonb(public.fn_variantes_usar_sugeridos(p_org, case when v_args ? 'ids' then v_ids end));
    else
      raise exception 'accion_desconocida' using errcode = '22023', detail = p_accion;
  end case;
end;
$$;

comment on function public.fn_variantes_como_actor(uuid, integer, text, jsonb) is
  'Solo service_role (ruta POST /api/inventario/variantes). Ejecuta una escritura del catálogo de variantes como el usuario de la sesión: las RPC públicas validan su pertenencia y permiso y el historial queda a su nombre.';

revoke all on function public.fn_variantes_como_actor(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_variantes_como_actor(uuid, integer, text, jsonb) to service_role;
