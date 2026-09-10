-- =============================================================================
-- Saca las claves JWT embebidas de las funciones de public y las mueve a Vault.
--
-- Antes: 4 funciones llevaban el JWT en su cuerpo, visible en pg_proc para
-- cualquiera con acceso SQL. Tres de ellas con la service_role, que salta RLS.
-- Las cuatro tenian EXECUTE para anon y authenticated.
--
-- Los valores NUNCA se escriben en claro aqui: se extraen del propio prosrc.
-- Idempotente. Si tras la reescritura quedara algun JWT, la migracion aborta.
--
-- Aplicada con MCP apply_migration el 2026-09-09 (version 20260910041620).
-- Rollback: supabase/rollbacks/20260910041620_secretos_fuera_de_pg_proc_rollback.sql
-- =============================================================================

-- 1. Esquema privado (PostgREST no lo expone)
create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

-- 2. Secretos a Vault, tomando el valor de las propias funciones
do $mig$
declare
  v_key text;
begin
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    select (regexp_match(p.prosrc, 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'))[1]
      into v_key
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'notify_push';
    if v_key is null then
      raise exception 'No se pudo extraer la service_role key de notify_push';
    end if;
    perform vault.create_secret(v_key, 'service_role_key',
      'service_role JWT. Movido desde public.notify_push el 2026-09-09.');
  end if;

  if not exists (select 1 from vault.secrets where name = 'anon_key') then
    select (regexp_match(p.prosrc, 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'))[1]
      into v_key
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'auto_update_exchange_rates';
    if v_key is null then
      raise exception 'No se pudo extraer la anon key de auto_update_exchange_rates';
    end if;
    perform vault.create_secret(v_key, 'anon_key',
      'anon JWT (publico por diseno). Movido desde public.auto_update_exchange_rates el 2026-09-09.');
  end if;
end
$mig$;

-- 3. Lector de secretos, solo para el servidor
create or replace function private.get_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = p_name
   limit 1;
$fn$;

revoke all on function private.get_secret(text) from public;
grant execute on function private.get_secret(text) to postgres, service_role;

-- 4. Reescribir las 4 funciones sustituyendo el literal por la lectura de Vault.
--    Se parte de pg_get_functiondef para no alterar nada mas de su cuerpo.
do $mig$
declare
  r        record;
  v_def    text;
  v_secret text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('notify_push', 'auto_update_exchange_rates',
                         'fill_historical_rates_real_api', 'fill_missing_currency_dates')
       and p.prosrc ~ 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'
  loop
    v_secret := case when r.proname = 'auto_update_exchange_rates'
                     then 'anon_key' else 'service_role_key' end;
    v_def := pg_get_functiondef(r.oid);

    -- 'Bearer <JWT>'  ->  'Bearer ' || private.get_secret('...')
    v_def := regexp_replace(
      v_def,
      '''Bearer eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}''',
      '''Bearer '' || private.get_secret(''' || v_secret || ''')',
      'g');

    -- '<JWT>'  ->  private.get_secret('...')
    v_def := regexp_replace(
      v_def,
      '''eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}''',
      'private.get_secret(''' || v_secret || ''')',
      'g');

    execute v_def;
    raise notice 'Reescrita public.% usando %', r.proname, v_secret;
  end loop;
end
$mig$;

-- 5. Estas cuatro no las llama el cliente: fuera anon y authenticated
revoke execute on function public.notify_push() from anon, authenticated;
revoke execute on function public.auto_update_exchange_rates() from anon, authenticated;
revoke execute on function public.fill_historical_rates_real_api() from anon, authenticated;
revoke execute on function public.fill_missing_currency_dates() from anon, authenticated;

-- 6. El historial de migraciones tambien guardaba el JWT en claro
update supabase_migrations.schema_migrations
   set statements = (
         select array_agg(regexp_replace(s, 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
                                         '<JWT_REDACTADO_2026_09_09>', 'g') order by ord)
           from unnest(statements) with ordinality as u(s, ord))
 where statements::text ~ 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}';

-- 7. Verificacion fail-closed: si queda un JWT en cualquier funcion, abortar
do $mig$
declare
  v_restantes text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ')
    into v_restantes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}';
  if v_restantes is not null then
    raise exception 'Quedan JWT embebidos en: %', v_restantes;
  end if;
end
$mig$;
