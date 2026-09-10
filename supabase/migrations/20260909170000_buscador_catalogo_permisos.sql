-- =============================================================================
-- Endurecimiento de permisos del buscador de catalogo
--
-- Supabase aplica DEFAULT PRIVILEGES que conceden a `anon` y `authenticated`
-- todo objeto nuevo creado en el esquema `public`. Por eso los objetos que
-- crearon las migraciones anteriores quedaron accesibles para `anon` aunque
-- nunca se les concedio explicitamente.
--
-- Lo grave:
--   - `org_vocabulario` es una MATERIALIZED VIEW y las MV **no admiten RLS**.
--     Con acceso `anon` —y la clave anonima va embebida en el widget publico—
--     cualquiera podia leer el vocabulario del catalogo de TODAS las
--     organizaciones: nombres de producto, marcas y categorias ajenas.
--   - `refrescar_org_vocabulario()` es SECURITY DEFINER y era ejecutable por
--     `anon`: se podia forzar en bucle un REFRESH MATERIALIZED VIEW sobre los
--     28.348 productos y quemar recursos de la base sin autenticarse.
--
-- Ver [[supabase-rpc-anon-exposure]]: revocar a `anon` es parte del trabajo,
-- no un extra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) El vocabulario no sale de la organizacion
--
-- Nadie lo consulta directamente: se accede a traves de `palabras_de_catalogo()`,
-- que ya filtra por organizacion. Se deja solo para service_role (la Edge
-- Function) y se le quita a anon y authenticated.
-- -----------------------------------------------------------------------------
revoke all on public.org_vocabulario from anon;
revoke all on public.org_vocabulario from authenticated;
grant select on public.org_vocabulario to service_role;

-- `palabras_de_catalogo` es SECURITY INVOKER y lee la MV, asi que si se la
-- llamara desde el navegador dejaria de funcionar. Pasa a DEFINER con filtro
-- explicito por organizacion, que es lo que ya hacia.
create or replace function public.palabras_de_catalogo(
  p_org integer,
  p_palabras text[],
  p_umbral_similitud real default 0.6
)
returns table (palabra_cliente text, palabra_catalogo text, exacta boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  with entrada as (
    select distinct public.normalizar_busqueda(w) as w
    from unnest(coalesce(p_palabras, '{}'::text[])) as w
  ),
  filtrada as (
    select w from entrada where length(w) >= 3
  )
  select f.w,
         coalesce(exacta.palabra, aprox.palabra),
         exacta.palabra is not null
  from filtrada f
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org and v.palabra = f.w
    limit 1
  ) exacta on true
  left join lateral (
    select v.palabra from public.org_vocabulario v
    where v.organization_id = p_org
      and exacta.palabra is null
      and public.similarity(v.palabra, f.w) >= p_umbral_similitud
    order by public.similarity(v.palabra, f.w) desc, v.frecuencia desc
    limit 1
  ) aprox on true
  where coalesce(exacta.palabra, aprox.palabra) is not null;
$fn$;

-- -----------------------------------------------------------------------------
-- 2) Refrescar el vocabulario es mantenimiento: solo el cron
-- -----------------------------------------------------------------------------
revoke all on function public.refrescar_org_vocabulario() from public;
revoke all on function public.refrescar_org_vocabulario() from anon;
revoke all on function public.refrescar_org_vocabulario() from authenticated;
grant execute on function public.refrescar_org_vocabulario() to service_role;

-- -----------------------------------------------------------------------------
-- 3) Las funciones del buscador no se ofrecen a visitantes anonimos
--
-- `PUBLIC` incluye a `anon`, y Postgres concede EXECUTE a PUBLIC por defecto en
-- toda funcion nueva: conceder a authenticated no quita nada, hay que revocar.
-- -----------------------------------------------------------------------------
revoke all on function public.palabras_de_catalogo(integer, text[], real) from public;
revoke all on function public.palabras_de_catalogo(integer, text[], real) from anon;
grant execute on function public.palabras_de_catalogo(integer, text[], real) to authenticated, service_role;

revoke all on function public.buscar_productos(integer, text[], integer, real) from public;
revoke all on function public.buscar_productos(integer, text[], integer, real) from anon;
grant execute on function public.buscar_productos(integer, text[], integer, real) to authenticated, service_role;

revoke all on function public.calcular_costo_llm(text, integer, integer) from public;
revoke all on function public.calcular_costo_llm(text, integer, integer) from anon;
grant execute on function public.calcular_costo_llm(text, integer, integer) to authenticated, service_role;

-- `normalizar_busqueda` y `f_unaccent` son transformaciones de texto sin acceso
-- a datos, pero `buscar_productos` (INVOKER) las invoca, asi que `authenticated`
-- las necesita. A `anon` no se le ofrecen.
revoke all on function public.normalizar_busqueda(text) from anon;
revoke all on function public.f_unaccent(text) from anon;
grant execute on function public.normalizar_busqueda(text) to authenticated, service_role;
grant execute on function public.f_unaccent(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Catalogo de modelos: global y de solo lectura, pero no para anonimos
-- -----------------------------------------------------------------------------
revoke all on public.ai_model_catalog from anon;
revoke all on public.ai_modelos_disponibles from anon;
grant select on public.ai_model_catalog to authenticated, service_role;
grant select on public.ai_modelos_disponibles to authenticated, service_role;

-- La vista se ejecutaba con los permisos de su dueño, saltandose la RLS de la
-- tabla de abajo. Con security_invoker manda quien consulta.
alter view public.ai_modelos_disponibles set (security_invoker = true);

notify pgrst, 'reload schema';
