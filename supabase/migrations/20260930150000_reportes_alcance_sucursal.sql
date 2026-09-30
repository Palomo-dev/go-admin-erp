-- ============================================================================
-- Reportes: alcance de sucursal en las 21 fn_reporte_*
-- ============================================================================
-- Hasta hoy las fn_reporte_* (SECURITY DEFINER) solo exigían ser miembro
-- activo de la organización. Un gerente asignado a una sola sucursal podía
-- pedir `p_branch_id = NULL` (consolidado) o el id de otra sucursal y leer sus
-- ventas, su caja o su cartera: la RLS de las tablas no aplica dentro de una
-- función con elevación.
--
-- Regla (la misma del selector de sucursal del encabezado, del POS y de
-- /api/me/capacidades, sin mirar el nombre del rol):
--   - admin (is_super_admin o role_id 1/2), o miembro sin sucursales
--     asignadas: ve cualquier sucursal y el consolidado;
--   - miembro con sucursales asignadas: solo esas; el consolidado
--     (p_branch_id NULL) solo si tiene asignadas TODAS las sucursales activas.
-- Las funciones sin p_branch_id devuelven cifras de toda la organización, así
-- que se tratan como consolidado.
--
-- La guarda se inserta en cada función justo después de la guarda de
-- pertenencia existente, reescribiendo su definición vigente
-- (pg_get_functiondef). CREATE OR REPLACE conserva los GRANT: no reabre `anon`.
-- ============================================================================

create or replace function public.reporte_exigir_alcance_sucursal(
  p_organization_id bigint,
  p_branch_id bigint
)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member_id bigint;
  v_es_admin boolean;
  v_asignadas integer[];
begin
  select om.id, (om.is_super_admin = true or om.role_id in (1, 2))
    into v_member_id, v_es_admin
  from public.organization_members om
  where om.user_id = (select auth.uid())
    and om.organization_id = p_organization_id
    and om.is_active = true;

  if v_member_id is null then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
  end if;

  if v_es_admin then
    return;
  end if;

  select coalesce(array_agg(mb.branch_id), '{}')
    into v_asignadas
  from public.member_branches mb
  join public.branches b on b.id = mb.branch_id
  where mb.organization_member_id = v_member_id
    and b.organization_id = p_organization_id;

  -- Sin asignaciones no hay restricción: misma regla que app_branch_access.
  if cardinality(v_asignadas) = 0 then
    return;
  end if;

  if p_branch_id is null then
    if exists (
      select 1 from public.branches b
      where b.organization_id = p_organization_id
        and b.is_active = true
        and b.id <> all (v_asignadas)
    ) then
      raise exception 'BRANCH_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return;
  end if;

  if not (p_branch_id::integer = any (v_asignadas)) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

comment on function public.reporte_exigir_alcance_sucursal(bigint, bigint) is
  'Lanza 42501 si el usuario no puede ver esa sucursal, o el consolidado (p_branch_id NULL) sin tener todas. La llaman las fn_reporte_*.';

-- Solo la llaman las fn_reporte_* (corren como su dueño): nadie más la ejecuta.
revoke execute on function public.reporte_exigir_alcance_sucursal(bigint, bigint) from public, anon, authenticated;

do $migracion$
declare
  r record;
  v_def text;
  v_nueva text;
  v_llamada text;
  v_guarda constant text := '(RAISE EXCEPTION ''ORG_FORBIDDEN'' USING ERRCODE = ''42501'';\s*END IF;)';
begin
  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) like '%p_branch_id%' as con_sucursal
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fn_reporte\_%'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when position('reporte_exigir_alcance_sucursal' in v_def) > 0;

    v_llamada := format(
      E'\n\n  -- Alcance de sucursal (ver reporte_exigir_alcance_sucursal).\n  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, %s);',
      case when r.con_sucursal then 'p_branch_id' else 'NULL' end
    );
    v_nueva := regexp_replace(v_def, v_guarda, '\1' || v_llamada);

    if v_nueva = v_def then
      raise exception 'Sin guarda de pertenencia reconocible en %', r.proname;
    end if;

    execute v_nueva;
  end loop;
end;
$migracion$;

do $verificacion$
declare
  v_faltan text;
begin
  select string_agg(p.proname, ', ')
    into v_faltan
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'fn_reporte\_%'
    and position('reporte_exigir_alcance_sucursal' in pg_get_functiondef(p.oid)) = 0;

  if v_faltan is not null then
    raise exception 'Funciones sin alcance de sucursal: %', v_faltan;
  end if;
end;
$verificacion$;
