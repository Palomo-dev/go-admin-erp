-- Aplicada por MCP el 2026-10-06 (ensayo de compatibilidad con el código desplegado: ENSAYO_OK). Auditoría de Organización 2026-10, P0-4 (y la parte de cupo de P1-5).
--
-- Los límites del plan (usuarios y sucursales) solo existían en el navegador: con un fetch directo
-- a /api/auth/invite, o reactivando miembros, se superaba el plan. Aquí pasan a la base, igual que
-- los módulos (validate_module_activation):
--
--   fn_plan_vigente(org)  → la suscripción que da el plan (misma regla que get_current_plan: la más
--                           reciente active/trialing/past_due, si no el plan free). La migración de
--                           pruebas vencidas (20261006150100) la reemplaza sin tocar a quien la usa.
--   fn_cupo_plan(org)     → UNA sola fuente: máximos del plan + complementos activos, miembros
--                           activos, invitaciones vigentes (pendientes sin vencer) y sucursales
--                           activas. La lee /api/me/plan con service role.
--   Disparadores BEFORE   → organization_members (alta o reactivación), branches (alta o
--                           reactivación) e invitations (pendiente vigente nueva o renovada).
--                           Mensaje claro y hint estable (cupo_plan_usuarios / cupo_plan_sucursales)
--                           para que el servidor y la UI lo reconozcan.
--
-- Reglas:
--   - Un miembro o sucursal que ya estaba activo no se vuelve a comprobar (editar no consume cupo).
--   - El primer miembro y la primera sucursal siempre pasan: el alta de una organización nueva no
--     puede depender del plan (fn_alta_organizacion y fn_create_default_branch_and_period).
--   - Aceptar una invitación solo mira los miembros activos: la plaza ya la reservó la invitación.
--   - Invitar mira miembros activos + invitaciones vigentes. Una vencida no ocupa cupo (P1-5).
--   - Bloqueo por organización (pg_advisory_xact_lock) para que dos altas simultáneas no pasen las dos.
--   - El disparador no salta con service role: el límite vale también para las rutas del servidor.
--
-- Verificado por MCP (solo SELECT) el 2026-10-06: 0 organizaciones por encima del cupo de usuarios
-- (ni contando invitaciones vigentes) ni del de sucursales, 39 justo en el tope de sucursales, 0
-- miembros o sucursales con is_active nulo, 0 suscripciones sin plan.
--
-- Ensayo 2026-10-06 (do/raise, se deshace solo): ENSAYO_OK. Alta con fn_alta_organizacion como
-- authenticated (pro, 1/10 usuarios, 1/1 sucursal); con plan free: invitar dentro del cupo pasa,
-- fuera falla («El plan permite 2 usuarios y ya están ocupados 2 (1 activos y 1 invitaciones
-- pendientes)…») también con service role; aceptar dentro pasa y fuera falla; una vencida no
-- cuenta; desactivar/invitar/reactivar dentro pasa y reactivar fuera falla; crear o reactivar
-- sucursal fuera falla y dentro (business) pasa; editar una sucursal activa no consume cupo; un
-- complemento activo amplía el tope; renovar una vencida fuera del cupo falla.

-- ─── 1. Plan vigente ─────────────────────────────────────────────────────────

create or replace function public.fn_plan_vigente(p_org integer)
returns table (plan_id integer, subscription_id uuid, estado text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select s.plan_id, s.id, s.status
    from public.subscriptions s
   where s.organization_id = p_org
     and s.plan_id is not null
     and s.status in ('active', 'trialing', 'past_due')
   order by s.created_at desc, s.updated_at desc
   limit 1;
  if found then
    return;
  end if;

  return query
  select p.id, null::uuid, 'sin_suscripcion'::text
    from public.plans p
   where p.code = 'free'
   limit 1;
end;
$$;

revoke all on function public.fn_plan_vigente(integer) from public, anon, authenticated;
grant execute on function public.fn_plan_vigente(integer) to service_role;

comment on function public.fn_plan_vigente(integer) is
  'Plan que rige a la organización: suscripción vigente más reciente o, si no hay, el plan free. Única regla para cupos y módulos.';

-- ─── 2. Cupo del plan ────────────────────────────────────────────────────────

create or replace function public.fn_cupo_plan(p_org integer)
returns table (
  plan_id integer,
  plan_codigo text,
  estado text,
  max_usuarios integer,
  usuarios_activos integer,
  invitaciones_vigentes integer,
  extra_usuarios integer,
  max_sucursales integer,
  sucursales_activas integer,
  extra_sucursales integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select * from public.fn_plan_vigente(p_org) limit 1
  ),
  ex as (
    select coalesce(sum(a.quantity) filter (where a.addon_type = 'extra_users'), 0)::integer as usuarios,
           coalesce(sum(a.quantity) filter (where a.addon_type = 'extra_branches'), 0)::integer as sucursales
      from public.subscription_addons a
     where a.organization_id = p_org
       and a.status = 'active'
  )
  select
    v.plan_id,
    p.code,
    v.estado,
    case when p.max_users is null then null else p.max_users + ex.usuarios end,
    (select count(*)::integer from public.organization_members m
      where m.organization_id = p_org and m.is_active),
    (select count(*)::integer from public.invitations i
      where i.organization_id = p_org and i.status = 'pending' and i.expires_at > now()),
    ex.usuarios,
    case when p.max_branches is null then null else p.max_branches + ex.sucursales end,
    (select count(*)::integer from public.branches b
      where b.organization_id = p_org and b.is_active),
    ex.sucursales
  from ex
  left join v on true
  left join public.plans p on p.id = v.plan_id
$$;

revoke all on function public.fn_cupo_plan(integer) from public, anon, authenticated;
grant execute on function public.fn_cupo_plan(integer) to service_role;

comment on function public.fn_cupo_plan(integer) is
  'Cupo del plan: máximos (plan + complementos activos, null = ilimitado) y uso (miembros activos, invitaciones vigentes, sucursales activas). Única fuente para /api/me/plan y los disparadores de cupo.';

-- ─── 3. Disparadores ─────────────────────────────────────────────────────────

create or replace function public.fn_cupo_plan_miembro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if not coalesce(new.is_active, false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.is_active, false) and old.organization_id = new.organization_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('fn_cupo_plan'), new.organization_id);
  select * into c from public.fn_cupo_plan(new.organization_id);

  if c.max_usuarios is not null and c.usuarios_activos > 0 and c.usuarios_activos >= c.max_usuarios then
    raise exception 'El plan permite % usuarios activos y ya hay %. Compra usuarios adicionales o cambia de plan para sumar a alguien más.',
      c.max_usuarios, c.usuarios_activos
      using errcode = 'P0001', hint = 'cupo_plan_usuarios';
  end if;
  return new;
end;
$$;

create or replace function public.fn_cupo_plan_invitacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if coalesce(new.status, '') <> 'pending' or new.expires_at is null or new.expires_at <= now() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and old.expires_at > now()
     and old.organization_id = new.organization_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('fn_cupo_plan'), new.organization_id);
  select * into c from public.fn_cupo_plan(new.organization_id);

  if c.max_usuarios is not null and c.usuarios_activos + c.invitaciones_vigentes >= c.max_usuarios then
    raise exception 'El plan permite % usuarios y ya están ocupados % (% activos y % invitaciones pendientes). Compra usuarios adicionales, cambia de plan o revoca una invitación.',
      c.max_usuarios, c.usuarios_activos + c.invitaciones_vigentes, c.usuarios_activos, c.invitaciones_vigentes
      using errcode = 'P0001', hint = 'cupo_plan_usuarios';
  end if;
  return new;
end;
$$;

create or replace function public.fn_cupo_plan_sucursal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if not coalesce(new.is_active, false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.is_active, false) and old.organization_id = new.organization_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('fn_cupo_plan'), new.organization_id);
  select * into c from public.fn_cupo_plan(new.organization_id);

  if c.max_sucursales is not null and c.sucursales_activas > 0 and c.sucursales_activas >= c.max_sucursales then
    raise exception 'El plan permite % sucursales activas y ya hay %. Compra sucursales adicionales o cambia de plan.',
      c.max_sucursales, c.sucursales_activas
      using errcode = 'P0001', hint = 'cupo_plan_sucursales';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_cupo_plan_miembro() from public, anon, authenticated;
revoke all on function public.fn_cupo_plan_invitacion() from public, anon, authenticated;
revoke all on function public.fn_cupo_plan_sucursal() from public, anon, authenticated;

create or replace trigger trg_cupo_plan_miembro
  before insert or update of is_active on public.organization_members
  for each row execute function public.fn_cupo_plan_miembro();

create or replace trigger trg_cupo_plan_invitacion
  before insert or update of status, expires_at on public.invitations
  for each row execute function public.fn_cupo_plan_invitacion();

create or replace trigger trg_cupo_plan_sucursal
  before insert or update of is_active on public.branches
  for each row execute function public.fn_cupo_plan_sucursal();
