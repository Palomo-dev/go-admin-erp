-- Acceso v3 (docs/design/AUTH-ACCESO-V2.md §12.4 y §13): UN solo alta de
-- organización, en una transacción.
--
-- Antes había tres copias en el navegador (registro, confirmación de correo y
-- «Nueva organización» en la app), cada una con su propia tabla de planes
-- (ultimate 5 · business 3 · pro 2 · resto 1 o 2) y sin transacción: si fallaba
-- la sucursal quedaba una organización sin sucursal configurada ni membresía
-- completa.
--
-- SECURITY INVOKER a propósito: corre con la sesión del usuario y las MISMAS
-- políticas RLS que las inserciones que hacía el navegador (organización del
-- usuario, membresía del dueño, sucursal y suscripción de su organización). No
-- eleva privilegios; solo junta los pasos en una transacción. El plan se
-- resuelve por su código en `plans` (no por ids fijos) y los días de prueba
-- salen del plan.
--
-- Los disparadores de `organizations` siguen haciendo su parte: sucursal
-- principal y periodo (trg_create_default_branch_and_period), suscripción por
-- defecto (after_organization_insert_subscription), impuestos, monedas y demás.

create or replace function public.fn_alta_organizacion(p_datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org jsonb := coalesce(p_datos -> 'organizacion', '{}'::jsonb);
  v_suc jsonb := coalesce(p_datos -> 'sucursal', '{}'::jsonb);
  v_nombre text := nullif(btrim(v_org ->> 'nombre'), '');
  v_pais text := upper(nullif(btrim(v_org ->> 'pais_codigo'), ''));
  v_periodo text := case when p_datos ->> 'periodo' = 'yearly' then 'yearly' else 'monthly' end;
  v_sin_prueba boolean := coalesce((p_datos ->> 'sin_prueba')::boolean, false);
  v_zona text := nullif(btrim(p_datos ->> 'zona_horaria'), '');
  v_plan_id integer;
  v_dias_prueba integer;
  v_org_id integer;
  v_miembro_id bigint;
  v_sucursal_id integer;
begin
  if v_uid is null then
    raise exception 'fn_alta_organizacion: se necesita una sesión' using errcode = '42501';
  end if;
  if v_nombre is null then
    raise exception 'fn_alta_organizacion: falta el nombre de la organización' using errcode = '22023';
  end if;
  if v_pais is null or not exists (select 1 from countries where code = v_pais) then
    raise exception 'fn_alta_organizacion: país no válido' using errcode = '22023';
  end if;

  select id, coalesce(trial_days, 15)
    into v_plan_id, v_dias_prueba
    from plans
   where code = coalesce(nullif(p_datos ->> 'plan_codigo', ''), 'pro')
     and coalesce(is_active, true)
   limit 1;
  if v_plan_id is null then
    raise exception 'fn_alta_organizacion: plan no válido' using errcode = '22023';
  end if;

  -- Zona horaria del navegador solo si Postgres la conoce (la valida además
  -- trg_validate_org_timezone); si no, la del catálogo por defecto.
  if v_zona is not null and not exists (select 1 from pg_timezone_names where name = v_zona) then
    v_zona := null;
  end if;

  insert into organizations (
    name, legal_name, type_id, description, email, phone, website, tax_id, nit, dv,
    address, city, state, country, country_code, municipality_id, postal_code,
    primary_color, secondary_color, subdomain, logo_url,
    owner_user_id, created_by, plan_id, status, timezone
  ) values (
    v_nombre,
    coalesce(nullif(btrim(v_org ->> 'razon_social'), ''), v_nombre),
    coalesce(nullif(v_org ->> 'tipo_id', '')::integer, 2),
    nullif(v_org ->> 'descripcion', ''),
    nullif(v_org ->> 'correo', ''),
    nullif(v_org ->> 'telefono', ''),
    nullif(v_org ->> 'sitio_web', ''),
    nullif(v_org ->> 'nit', ''),
    nullif(v_org ->> 'nit', ''),
    nullif(v_org ->> 'dv', '')::integer,
    nullif(v_org ->> 'direccion', ''),
    nullif(v_org ->> 'ciudad', ''),
    nullif(v_org ->> 'departamento', ''),
    coalesce(nullif(v_org ->> 'pais_nombre', ''), (select name from countries where code = v_pais)),
    v_pais,
    nullif(v_org ->> 'municipio_id', '')::uuid,
    nullif(v_org ->> 'codigo_postal', ''),
    coalesce(nullif(v_org ->> 'color_primario', ''), '#3B82F6'),
    coalesce(nullif(v_org ->> 'color_secundario', ''), '#F59E0B'),
    nullif(v_org ->> 'subdominio', ''),
    nullif(v_org ->> 'logo_url', ''),
    v_uid, v_uid, v_plan_id, 'active',
    coalesce(v_zona, 'America/Bogota')
  )
  returning id into v_org_id;

  insert into organization_members (organization_id, user_id, role_id, is_super_admin, is_active)
  values (v_org_id, v_uid, 2, true, true)
  returning id into v_miembro_id;

  update branches set
    name = coalesce(nullif(btrim(v_suc ->> 'nombre'), ''), 'Sucursal principal'),
    branch_code = coalesce(nullif(btrim(v_suc ->> 'codigo'), ''), 'MAIN-001'),
    address = nullif(v_suc ->> 'direccion', ''),
    city = nullif(v_suc ->> 'ciudad', ''),
    state = nullif(v_suc ->> 'departamento', ''),
    state_code = nullif(v_suc ->> 'departamento_codigo', ''),
    country = coalesce(nullif(v_suc ->> 'pais_nombre', ''), (select name from countries where code = v_pais)),
    country_code = coalesce(upper(nullif(v_suc ->> 'pais_codigo', '')), v_pais),
    municipality_id = nullif(v_suc ->> 'municipio_id', '')::uuid,
    postal_code = nullif(v_suc ->> 'codigo_postal', ''),
    phone = nullif(v_suc ->> 'telefono', ''),
    email = coalesce(nullif(v_suc ->> 'correo', ''), nullif(v_org ->> 'correo', '')),
    tax_identification = nullif(v_suc ->> 'nit', ''),
    opening_hours = coalesce(v_suc -> 'horario', opening_hours, jsonb_build_object(
      'monday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
      'tuesday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
      'wednesday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
      'thursday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
      'friday', jsonb_build_object('open', '09:00', 'close', '18:00', 'closed', false),
      'saturday', jsonb_build_object('open', '10:00', 'close', '15:00', 'closed', false),
      'sunday', jsonb_build_object('closed', true)
    )),
    manager_id = v_uid,
    is_main = true,
    is_active = true,
    is_web_stock_source = true
  where organization_id = v_org_id and is_main
  returning id into v_sucursal_id;

  if v_sucursal_id is null then
    raise exception 'fn_alta_organizacion: no se creó la sucursal principal' using errcode = 'P0002';
  end if;

  insert into member_branches (organization_member_id, branch_id)
  values (v_miembro_id, v_sucursal_id)
  on conflict (organization_member_id, branch_id) do nothing;

  update subscriptions set
    plan_id = v_plan_id,
    billing_period = v_periodo,
    skip_trial = v_sin_prueba,
    status = case when v_sin_prueba then 'active' else 'trialing' end,
    trial_start = case when v_sin_prueba then null else now() end,
    trial_end = case when v_sin_prueba then null else now() + make_interval(days => v_dias_prueba) end,
    current_period_start = now(),
    current_period_end = now() + case when v_periodo = 'yearly' then interval '365 days' else interval '30 days' end,
    updated_at = now()
  where organization_id = v_org_id;

  update profiles set last_org_id = v_org_id where id = v_uid;

  return jsonb_build_object('organization_id', v_org_id, 'branch_id', v_sucursal_id, 'plan_id', v_plan_id);
end;
$$;

comment on function public.fn_alta_organizacion(jsonb) is
  'Alta de organización en una transacción (organización, membresía del dueño, sucursal principal, suscripción y última organización del perfil). SECURITY INVOKER: mismas políticas RLS que el navegador. Acceso v3, docs/design/AUTH-ACCESO-V2.md §13.';

revoke all on function public.fn_alta_organizacion(jsonb) from public, anon;
grant execute on function public.fn_alta_organizacion(jsonb) to authenticated;
