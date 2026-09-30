-- Preferencias del inicio por usuario y organización (Figma «03 Navegación y
-- shell»: «Diálogo — Personalizar el inicio» 448:196794 y «Módulos — Reordenar
-- y ocultar» 646:32649). Aprobado por el dueño el 2026-09-30.
--
-- Hasta hoy el plegado y el orden de los módulos vivían en localStorage: no
-- viajaban entre dispositivos. Una fila por (usuario, organización):
--   - bloques_ocultos: bloques del inicio que la persona apagó (tendencia,
--     actividad, tienda web…). «Hoy» no se puede ocultar: lo impone el servidor.
--   - modulos_orden:   orden elegido de las filas de «Módulos» (códigos de
--     `modules.code`). Los módulos que no aparezcan van detrás, en el orden
--     por defecto.
--   - modulos_ocultos: módulos que no se consultan en su inicio. NO cambia
--     permisos ni `organization_modules`.
-- La lista válida de bloques y módulos la valida el servidor
-- (src/lib/dashboard/preferenciasInicio.ts); aquí solo se acota el tamaño.
--
-- Aditiva: tabla nueva, sin tocar datos existentes. RLS: cada persona ve y
-- escribe SOLO sus filas, y solo en organizaciones donde es miembro activo.

create table if not exists public.user_dashboard_preferences (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  organization_id integer not null references public.organizations (id) on delete cascade,
  bloques_ocultos text[] not null default '{}'::text[],
  modulos_orden text[] not null default '{}'::text[],
  modulos_ocultos text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_dashboard_preferences_usuario_org_key unique (user_id, organization_id),
  constraint user_dashboard_preferences_tamano_chk check (
    cardinality(bloques_ocultos) <= 20
    and cardinality(modulos_orden) <= 60
    and cardinality(modulos_ocultos) <= 60
  )
);

comment on table public.user_dashboard_preferences is
  'Preferencias del inicio (/app/inicio) por usuario y organización: bloques ocultos y orden/visibilidad de los módulos. Solo cambia lo que la persona ve en su inicio; no cambia permisos ni módulos de la organización.';

create index if not exists idx_user_dashboard_preferences_org
  on public.user_dashboard_preferences (organization_id);

drop trigger if exists trg_user_dashboard_preferences_updated_at on public.user_dashboard_preferences;
create trigger trg_user_dashboard_preferences_updated_at
  before update on public.user_dashboard_preferences
  for each row execute function public.set_updated_at();

alter table public.user_dashboard_preferences enable row level security;

drop policy if exists user_dashboard_preferences_select on public.user_dashboard_preferences;
create policy user_dashboard_preferences_select on public.user_dashboard_preferences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.organization_id = user_dashboard_preferences.organization_id
         and om.is_active = true
    )
  );

drop policy if exists user_dashboard_preferences_insert on public.user_dashboard_preferences;
create policy user_dashboard_preferences_insert on public.user_dashboard_preferences
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.organization_id = user_dashboard_preferences.organization_id
         and om.is_active = true
    )
  );

drop policy if exists user_dashboard_preferences_update on public.user_dashboard_preferences;
create policy user_dashboard_preferences_update on public.user_dashboard_preferences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.organization_id = user_dashboard_preferences.organization_id
         and om.is_active = true
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.organization_id = user_dashboard_preferences.organization_id
         and om.is_active = true
    )
  );

drop policy if exists user_dashboard_preferences_delete on public.user_dashboard_preferences;
create policy user_dashboard_preferences_delete on public.user_dashboard_preferences
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.organization_id = user_dashboard_preferences.organization_id
         and om.is_active = true
    )
  );

revoke all on table public.user_dashboard_preferences from anon, public;
grant select, insert, update, delete on table public.user_dashboard_preferences to authenticated;
grant all on table public.user_dashboard_preferences to service_role;
