-- ============================================================================
-- Agente de voz: números de prueba internos por organización (2026-09-30)
--
-- Un número de prueba es un número del PROPIO equipo de la organización, con
-- su consentimiento, que se usa para probar el agente de voz. Lo único que
-- exime es el tope semanal de la Ley 2300 de 2023 (un contacto efectivo por
-- canal y dos en total por semana y persona): sin la exención, quien prueba su
-- agente con su celular queda bloqueado hasta el lunes siguiente.
--
-- NO exime de nada más: la franja horaria legal, la lista de excluidos (RNE y
-- manual), la baja voluntaria (`fn_can_contact`), los topes diarios/horarios
-- del agente y de la campaña, la concurrencia, los créditos y la verificación
-- RNE de la campaña siguen aplicando igual. La exención se aplica en un solo
-- punto del código (`evaluarLey2300Cliente`, voiceAgent/cumplimiento.ts).
--
-- 1. crm_voice_test_numbers: una fila por número. Se da de baja con
--    `removed_at`/`removed_by` (no se borra): queda el rastro de quién lo
--    agregó, cuándo, y quién lo quitó.
-- 2. Guarda (trigger): máximo 10 números vigentes por organización (con
--    candado por organización, sin carreras); una fila solo puede pasar de
--    vigente a dada de baja, y nada más cambia; las fechas las pone el servidor.
-- 3. RLS: leen los miembros activos de la organización; agregan y dan de baja
--    SOLO sus administradores (rol 1/2, super admin o permiso
--    `admin.full_access` vía `check_user_permission`), y siempre a su nombre
--    (`created_by`/`removed_by` = auth.uid()). Nadie borra con sesión.
-- 4. fn_voz_es_numero_prueba(org, número): la consulta que usa el despachador.
--
-- Por qué tabla y no `comm_settings`: `comm_settings` solo la puede leer
-- service_role (guarda secretos del proveedor) y una lista en jsonb no deja
-- auditoría por número. Aquí cada alta y cada baja tienen autor y fecha, y el
-- permiso lo resuelve la base, no solo la ruta.
--
-- Aditiva e idempotente.
-- ============================================================================

-- 1. Tabla --------------------------------------------------------------------
create table if not exists public.crm_voice_test_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  phone_e164 text not null,
  label text null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz null,
  removed_by uuid null references auth.users(id),
  constraint crm_voice_test_numbers_phone_e164 check (phone_e164 ~ '^\+[1-9][0-9]{9,14}$'),
  constraint crm_voice_test_numbers_label check (label is null or length(label) <= 80),
  constraint crm_voice_test_numbers_baja check ((removed_at is null) = (removed_by is null))
);

comment on table public.crm_voice_test_numbers is
  'Números de prueba internos del agente de voz (del propio equipo, con consentimiento). Solo eximen del tope semanal de la Ley 2300 de 2023; la franja horaria, los excluidos, los topes diarios y los créditos siguen aplicando. Máximo 10 vigentes por organización. Baja lógica (removed_at/removed_by) para conservar la auditoría.';

create unique index if not exists uq_crm_voice_test_numbers_vigente
  on public.crm_voice_test_numbers (organization_id, phone_e164)
  where removed_at is null;

-- 2. Guarda: tope de 10 vigentes e inmutabilidad salvo la baja ------------------
create or replace function public.fn_crm_voice_test_numbers_guarda()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_vigentes integer;
begin
  if tg_op = 'INSERT' then
    -- Un candado por organización serializa las altas: dos pestañas no pueden
    -- colar el número 11 a la vez.
    perform pg_advisory_xact_lock(hashtext('crm_voice_test_numbers'), new.organization_id);
    select count(*) into v_vigentes
      from public.crm_voice_test_numbers t
     where t.organization_id = new.organization_id
       and t.removed_at is null;
    if v_vigentes >= 10 then
      raise exception 'Máximo 10 números de prueba vigentes por organización' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.removed_at := null;
    new.removed_by := null;
    return new;
  end if;

  -- UPDATE: la única transición permitida es vigente → dada de baja.
  if old.removed_at is not null then
    raise exception 'El número de prueba ya fue dado de baja' using errcode = '42501';
  end if;
  if new.removed_by is null
     or new.organization_id is distinct from old.organization_id
     or new.phone_e164 is distinct from old.phone_e164
     or new.label is distinct from old.label
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception 'Un número de prueba solo se puede dar de baja' using errcode = '42501';
  end if;
  new.removed_at := now();
  return new;
end $$;

revoke all on function public.fn_crm_voice_test_numbers_guarda() from public, anon, authenticated;

drop trigger if exists trg_crm_voice_test_numbers_guarda on public.crm_voice_test_numbers;
create trigger trg_crm_voice_test_numbers_guarda
  before insert or update on public.crm_voice_test_numbers
  for each row execute function public.fn_crm_voice_test_numbers_guarda();

-- 3. RLS y privilegios ------------------------------------------------------------
alter table public.crm_voice_test_numbers enable row level security;

drop policy if exists crm_voice_test_numbers_select on public.crm_voice_test_numbers;
create policy crm_voice_test_numbers_select on public.crm_voice_test_numbers
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true
  ));

drop policy if exists crm_voice_test_numbers_insert on public.crm_voice_test_numbers;
create policy crm_voice_test_numbers_insert on public.crm_voice_test_numbers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and removed_at is null
    and (
      exists (
        select 1 from public.organization_members om
         where om.user_id = (select auth.uid())
           and om.organization_id = crm_voice_test_numbers.organization_id
           and om.is_active = true
           and (om.is_super_admin = true or om.role_id in (1, 2))
      )
      or public.check_user_permission((select auth.uid()), organization_id, 'admin.full_access')
    )
  );

drop policy if exists crm_voice_test_numbers_update on public.crm_voice_test_numbers;
create policy crm_voice_test_numbers_update on public.crm_voice_test_numbers
  for update to authenticated
  using (
    removed_at is null
    and (
      exists (
        select 1 from public.organization_members om
         where om.user_id = (select auth.uid())
           and om.organization_id = crm_voice_test_numbers.organization_id
           and om.is_active = true
           and (om.is_super_admin = true or om.role_id in (1, 2))
      )
      or public.check_user_permission((select auth.uid()), organization_id, 'admin.full_access')
    )
  )
  with check (removed_by = (select auth.uid()));

revoke all on public.crm_voice_test_numbers from anon, authenticated;
grant select, insert on public.crm_voice_test_numbers to authenticated;
grant update (removed_at, removed_by) on public.crm_voice_test_numbers to authenticated;
grant all on public.crm_voice_test_numbers to service_role;

-- 4. Consulta del despachador -----------------------------------------------------
create or replace function public.fn_voz_es_numero_prueba(p_org integer, p_phone text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.crm_voice_test_numbers t
     where t.organization_id = p_org
       and t.phone_e164 = p_phone
       and t.removed_at is null
  )
$$;

revoke all on function public.fn_voz_es_numero_prueba(integer, text) from public, anon;
grant execute on function public.fn_voz_es_numero_prueba(integer, text) to authenticated, service_role;

comment on function public.fn_voz_es_numero_prueba(integer, text) is
  '¿El número (E.164) es un número de prueba vigente de la organización? Lo usa el despachador de voz para eximir SOLO el tope semanal de la Ley 2300. SECURITY INVOKER: con sesión de usuario aplica la RLS de la tabla.';
