-- Membresías — fase 1, M4 y permisos (docs/design/MEMBRESIAS-FASE-1-2.md §3 M4 y §5).
--
-- El módulo «Gimnasio» (gym) se generaliza como «Membresías» (memberships). organization_modules
-- tiene FK a modules(code) ON DELETE CASCADE: borrar «gym» borraría las 43 activaciones. Por eso
-- «gym» NUNCA se borra: se copian sus filas a «memberships» y el módulo viejo queda inactivo en el
-- catálogo. Sus filas en organization_modules no se tocan (go-admin-super y goadmin-websites aún
-- leen «gym»).
--
-- Alias mientras los otros repos usen «gym»: un trigger replica en «memberships» toda activación,
-- desactivación o borrado de «gym» en organization_modules. Se retira junto con el alias.
--
-- validate_module_activation contaba los módulos pagados activos sin mirar si el módulo sigue en
-- el catálogo. Con el alias, una organización con «gym» y «memberships» contaría dos veces el mismo
-- módulo y podría toparse con el límite de su plan. Dos cambios:
--   * se cuenta solo lo que está activo en el catálogo (hoy los 20 módulos lo están; el único que
--     deja de contar es «gym»);
--   * activar «memberships» en una organización que ya tiene «gym» activo es un cambio de nombre, no
--     un módulo nuevo: no se valida contra el límite. Medido el 2026-09-28: 33 de las 43
--     organizaciones con «gym» activo ya están en el tope de su plan (el límite es posterior a su
--     activación); sin esta excepción la copia falla y el módulo desaparecería de su menú.

-- ── 1. Catálogo ──────────────────────────────────────────────────────────────
insert into public.modules (code, name, description, is_core, icon, rank, is_active)
select 'memberships', 'Membresías', 'Gimnasios, academias, clubes, coworking y spa', false, 'user-check', rank, true
  from public.modules where code = 'gym'
on conflict (code) do nothing;

update public.modules set is_active = false, updated_at = now() where code = 'gym' and is_active;

-- ── 2. Límite de módulos del plan: solo cuenta lo que sigue en el catálogo ──
do $$
declare
  v_def text := pg_get_functiondef('public.validate_module_activation()'::regprocedure);
  v_viejo1 text := E'    AND m.is_core = false\n';
  v_nuevo1 text := E'    AND m.is_core = false\n    AND m.is_active = true -- alias gym -> memberships (20260929000200): el código viejo no cuenta dos veces\n';
  v_viejo2 text := E'    -- Verificar si el módulo es core\n';
  v_nuevo2 text := E'    -- Alias gym -> memberships (20260929000200): con «gym» activo es un cambio de nombre, no un módulo nuevo.\n'
                || E'    IF NEW.module_code = ''memberships'' AND EXISTS (\n'
                || E'         SELECT 1 FROM organization_modules g\n'
                || E'          WHERE g.organization_id = NEW.organization_id AND g.module_code = ''gym'' AND g.is_active) THEN\n'
                || E'      IF NEW.enabled_at IS NULL THEN\n        NEW.enabled_at := NOW();\n      END IF;\n'
                || E'      RETURN NEW;\n    END IF;\n\n'
                || E'    -- Verificar si el módulo es core\n';
begin
  if position('alias gym -> memberships' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo1, ''))) / length(v_viejo1) <> 1
     or (length(v_def) - length(replace(v_def, v_viejo2, ''))) / length(v_viejo2) <> 1 then
    raise exception 'validate_module_activation: un fragmento a reemplazar no aparece exactamente una vez';
  end if;
  execute replace(replace(v_def, v_viejo1, v_nuevo1), v_viejo2, v_nuevo2);
end $$;

-- ── 3. Activaciones por organización ────────────────────────────────────────
insert into public.organization_modules (organization_id, module_code, is_active, enabled_at, activated_at, disabled_at)
select organization_id, 'memberships', is_active, enabled_at, activated_at, disabled_at
  from public.organization_modules where module_code = 'gym'
on conflict (organization_id, module_code) do nothing;

-- Páginas: rutas viejas → nuevas. Horarios se funde con Clases (vista Lista · Calendario);
-- «ajustes» nunca existió como página (404) y pasa a Configuración.
with mapa(viejo, nuevo, nombre) as (values
  ('/app/gym/checkin', '/app/membresias/check-in', 'Check-in'),
  ('/app/gym/membresias', '/app/membresias/membresias', 'Membresías'),
  ('/app/gym/planes', '/app/membresias/planes', 'Planes'),
  ('/app/gym/clases', '/app/membresias/clases', 'Clases'),
  ('/app/gym/horarios', '/app/membresias/clases', 'Clases'),
  ('/app/gym/reservaciones', '/app/membresias/reservas', 'Reservas'),
  ('/app/gym/instructores', '/app/membresias/instructores', 'Instructores'),
  ('/app/gym/dispositivos', '/app/membresias/control-de-acceso', 'Control de acceso')
)
insert into public.organization_module_pages (organization_id, module_code, page_href, page_name, is_active, enabled_at, disabled_at)
select distinct on (p.organization_id, m.nuevo)
       p.organization_id, 'memberships', m.nuevo, m.nombre, p.is_active, p.enabled_at, p.disabled_at
  from public.organization_module_pages p
  join mapa m on m.viejo = p.page_href
 where p.module_code = 'gym'
 order by p.organization_id, m.nuevo, p.is_active desc
on conflict (organization_id, module_code, page_href) do nothing;

-- Acceso por cargo (0 filas hoy; se copia igual por si aparecen antes de aplicar).
insert into public.job_position_module_access (job_position_id, module_code, can_view, can_access)
select job_position_id, 'memberships', can_view, can_access
  from public.job_position_module_access where module_code = 'gym'
on conflict (job_position_id, module_code) do nothing;

with mapa(viejo, nuevo) as (values
  ('/app/gym/checkin', '/app/membresias/check-in'),
  ('/app/gym/membresias', '/app/membresias/membresias'),
  ('/app/gym/planes', '/app/membresias/planes'),
  ('/app/gym/clases', '/app/membresias/clases'),
  ('/app/gym/horarios', '/app/membresias/clases'),
  ('/app/gym/reservaciones', '/app/membresias/reservas'),
  ('/app/gym/instructores', '/app/membresias/instructores'),
  ('/app/gym/dispositivos', '/app/membresias/control-de-acceso')
)
insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
select distinct on (a.job_position_id, m.nuevo) a.job_position_id, 'memberships', m.nuevo, a.can_view, a.can_access
  from public.job_position_page_access a
  join mapa m on m.viejo = a.page_href
 where a.module_code = 'gym'
 order by a.job_position_id, m.nuevo, a.can_access desc
on conflict (job_position_id, page_href) do nothing;

-- Planes de suscripción que ofrecen el módulo (2).
update public.plans
   set module_config = replace(module_config::text, '"gym"', '"memberships"')::jsonb
 where module_config::text like '%"gym"%';

-- ── 4. Alias: lo que otro repo haga con «gym» se refleja en «memberships» ──
create or replace function public.fn_org_modules_alias_gym()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.module_code = 'gym' then
      delete from public.organization_modules
       where organization_id = old.organization_id and module_code = 'memberships';
    end if;
    return old;
  end if;
  if new.module_code <> 'gym' then
    return new;
  end if;
  insert into public.organization_modules (organization_id, module_code, is_active, enabled_at, activated_at, disabled_at)
  values (new.organization_id, 'memberships', new.is_active, new.enabled_at, new.activated_at, new.disabled_at)
  on conflict (organization_id, module_code) do update
     set is_active = excluded.is_active, disabled_at = excluded.disabled_at
   where public.organization_modules.is_active is distinct from excluded.is_active;
  return new;
end;
$$;

revoke all on function public.fn_org_modules_alias_gym() from public, anon, authenticated;

drop trigger if exists trg_org_modules_alias_gym on public.organization_modules;
create trigger trg_org_modules_alias_gym
  after insert or update of is_active or delete on public.organization_modules
  for each row execute function public.fn_org_modules_alias_gym();

-- ── 5. Permisos del módulo (§5) ─────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select v.code, v.name, v.description, 'memberships', 'memberships'
  from (values
    ('memberships.view', 'Ver membresías', 'Ver Resumen, Miembros, Membresías, Planes y Pagos del módulo'),
    ('memberships.plans.manage', 'Gestionar planes', 'Configuración de membresía en el producto y detalle del plan'),
    ('memberships.freeze', 'Congelar membresías', 'Congelar y descongelar membresías'),
    ('memberships.cancel', 'Cancelar membresías', 'Cancelar membresías con motivo'),
    ('memberships.checkin', 'Registrar entradas', 'Registrar check-in de miembros'),
    ('memberships.classes.manage', 'Gestionar clases', 'Clases, horarios, reservas e instructores'),
    ('memberships.devices.manage', 'Gestionar control de acceso', 'Dispositivos y control de acceso')
  ) as v(code, name, description)
 where not exists (select 1 from public.permissions p where p.code = v.code);

-- Siembra aditiva. Hoy el módulo no tenía permisos: lo protegía solo el código de módulo, así que
-- cualquier miembro con el módulo activo lo operaba entero. Para no quitarle nada a nadie:
--   * Super Admin (1), Admin de organización (2) y Manager (5): los 7 permisos.
--   * Empleado (4): ver, registrar entradas y gestionar clases (lo que usaba en recepción).
--   * Cargos que ya venden en el POS (pos_access): ver y registrar entradas.
-- Congelar, cancelar, planes y control de acceso quedan para quien administra.
insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from (values (1), (2), (5)) as r(role_id)
 cross join public.permissions p
 where p.module = 'memberships'
   and exists (select 1 from public.roles x where x.id = r.role_id)
   and not exists (select 1 from public.role_permissions rp where rp.role_id = r.role_id and rp.permission_id = p.id);

insert into public.role_permissions (role_id, permission_id, allowed)
select 4, p.id, true
  from public.permissions p
 where p.code in ('memberships.view', 'memberships.checkin', 'memberships.classes.manage')
   and exists (select 1 from public.roles x where x.id = 4)
   and not exists (select 1 from public.role_permissions rp where rp.role_id = 4 and rp.permission_id = p.id);

insert into public.job_position_permissions (job_position_id, permission_id, allowed)
select distinct jp.job_position_id, pn.id, true
  from public.job_position_permissions jp
  join public.permissions pm on pm.id = jp.permission_id and pm.code = 'pos_access'
 cross join (select id from public.permissions where code in ('memberships.view', 'memberships.checkin')) pn
 where jp.allowed
on conflict (job_position_id, permission_id) do nothing;

-- ── 6. Guarda de permiso para las funciones del módulo ──────────────────────
-- Dueño de la organización y service role pasan; el resto necesita alguno de los códigos.
create or replace function public.fn_membresias_int_exigir(p_org integer, p_codigos text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return; -- service role / cron (fn_assert_acceso_org ya rechazó anon y authenticated sin sesión)
  end if;
  if exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = 'No tienes permiso para esta acción sobre membresías';
end;
$$;

revoke all on function public.fn_membresias_int_exigir(integer, text[]) from public, anon;
grant execute on function public.fn_membresias_int_exigir(integer, text[]) to authenticated, service_role;
