-- GO-sec (2026-09-28) — RPC de monedas de la organización: permiso resuelto en
-- la base, search_path fijo, una sola moneda base y la preferencia que lee
-- resolveOrgCurrency escrita en la MISMA transacción.
--
-- Verificado en la base viva antes de aplicar:
--   * Las cuatro RPC ya tenían fn_assert_acceso_org y ya no tenían EXECUTE para
--     anon/public (lotes gosec 7 y 8 del 2026-09-23), pero cualquier miembro
--     activo —cajero incluido— podía cambiar la moneda base o quitar monedas,
--     y ninguna fijaba search_path.
--   * set_currency_auto_update tenía dos sobrecargas con los MISMOS nombres de
--     parámetro: PostgREST no puede elegir (PGRST203) y la de
--     (integer, varchar, boolean) hacía UPDATE currencies WHERE organization_id,
--     columna que currencies no tiene. Se borra esa; queda la otra.
--   * set_organization_base_currency ponía todas en is_base = false y luego
--     intentaba marcar la nueva: con un código que la organización no tiene,
--     la dejaba SIN moneda base. Ahora lo rechaza.
--   * organization_currencies: 79 filas, 0 organizaciones con dos monedas base,
--     0 sin base → cabe el índice único parcial.
--   * organization_currencies no tiene política UPDATE/DELETE: la pantalla
--     «Preferencias» actualizaba 0 filas sin error. La escritura va por RPC.

-- 1. Una sola moneda base por organización.
create unique index if not exists organization_currencies_una_base
  on public.organization_currencies (organization_id)
  where is_base;

-- 2. La sobrecarga rota y ambigua.
drop function if exists public.set_currency_auto_update(integer, character varying, boolean);

-- 3. Lectura: solo pertenencia.
create or replace function public.get_organization_currencies(p_organization_id integer)
 returns table(code character, name text, symbol text, decimals integer, auto_update boolean, is_base boolean, org_auto_update boolean)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select c.code, c.name, c.symbol, c.decimals, c.auto_update, oc.is_base, oc.auto_update as org_auto_update
    from public.currencies c
    join public.organization_currencies oc on c.code = oc.currency_code
   where oc.organization_id = p_organization_id
   order by oc.is_base desc, c.code asc;
end;
$function$;

create or replace function public.get_currency_templates(p_organization_id integer)
 returns table(code character, name text, symbol text, decimals integer, auto_update boolean)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select c.code, c.name, c.symbol, c.decimals, c.auto_update
    from public.currencies c
   where not exists (
           select 1 from public.organization_currencies oc
            where oc.currency_code = c.code and oc.organization_id = p_organization_id)
   order by c.code asc;
end;
$function$;

-- 4. Escrituras: pertenencia + permiso (admin de la organización, o
--    billing_management / organization_settings por rol o cargo).
create or replace function public.set_organization_base_currency(p_organization_id integer, p_currency_code character varying)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text := upper(btrim(coalesce(p_currency_code, '')));
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['billing_management', 'organization_settings']);

  if not exists (select 1 from public.organization_currencies oc
                  where oc.organization_id = p_organization_id and oc.currency_code = v_codigo) then
    raise exception 'moneda_no_asignada' using errcode = 'P0002',
      detail = 'La organización no tiene asignada la moneda ' || v_codigo;
  end if;

  -- Primero se desmarca la anterior, luego se marca la nueva: el índice único
  -- parcial se comprueba por sentencia.
  update public.organization_currencies
     set is_base = false
   where organization_id = p_organization_id and is_base and currency_code <> v_codigo;
  update public.organization_currencies
     set is_base = true
   where organization_id = p_organization_id and currency_code = v_codigo and is_base is not true;

  -- La preferencia que lee resolveOrgCurrency / fn_moneda_base_organizacion
  -- (paso 2 de la cadena) y la clave antigua que aún lee la pantalla.
  insert into public.organization_preferences as op (organization_id, settings)
  values (p_organization_id,
          jsonb_build_object('default_currency_code', v_codigo,
                             'finance', jsonb_build_object('default_currency', v_codigo)))
  on conflict (organization_id) do update
     set settings = coalesce(op.settings, '{}'::jsonb)
                    || jsonb_build_object(
                         'default_currency_code', v_codigo,
                         'finance', case when jsonb_typeof(op.settings -> 'finance') = 'object'
                                         then op.settings -> 'finance' else '{}'::jsonb end
                                    || jsonb_build_object('default_currency', v_codigo)),
         updated_at = now();

  return true;
end;
$function$;

create or replace function public.add_organization_currency(p_organization_id integer, p_currency_code character, p_is_base boolean default false, p_auto_update boolean default true)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['billing_management', 'organization_settings']);

  if not exists (select 1 from public.currencies where code = p_currency_code) then
    raise exception 'La moneda con código % no existe en el catálogo global', p_currency_code;
  end if;
  if exists (select 1 from public.organization_currencies
              where organization_id = p_organization_id and currency_code = p_currency_code) then
    raise exception 'La moneda con código % ya está asociada a esta organización', p_currency_code;
  end if;

  insert into public.organization_currencies (organization_id, currency_code, is_base, auto_update)
  values (p_organization_id, p_currency_code, false, coalesce(p_auto_update, true));

  if coalesce(p_is_base, false) then
    perform public.set_organization_base_currency(p_organization_id, p_currency_code);
  end if;
  return true;
end;
$function$;

create or replace function public.remove_organization_currency(p_organization_id integer, p_currency_code character varying)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['billing_management', 'organization_settings']);

  if exists (select 1 from public.organization_currencies
              where organization_id = p_organization_id and currency_code = p_currency_code and is_base) then
    raise exception 'moneda_base_no_se_elimina' using errcode = '22023',
      detail = 'Cambie la moneda base antes de quitar ' || p_currency_code;
  end if;

  delete from public.organization_currencies
   where organization_id = p_organization_id and currency_code = p_currency_code;
  return found;
end;
$function$;

create or replace function public.set_currency_auto_update(p_currency_code character varying, p_auto_update boolean, p_org_id integer)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_finanzas_exigir_permiso(p_org_id, array['billing_management', 'organization_settings']);
  update public.organization_currencies
     set auto_update = p_auto_update
   where organization_id = p_org_id and currency_code = p_currency_code;
  return found;
end;
$function$;

-- 5. Permisos: nada para anon ni public; authenticated y service_role.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_organization_currencies(integer)',
    'public.get_currency_templates(integer)',
    'public.set_organization_base_currency(integer, character varying)',
    'public.add_organization_currency(integer, character, boolean, boolean)',
    'public.remove_organization_currency(integer, character varying)',
    'public.set_currency_auto_update(character varying, boolean, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
