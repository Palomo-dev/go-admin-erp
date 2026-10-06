-- ============================================================================
-- Organización › Equipo: invitaciones vencidas y cargo del miembro.
-- PENDIENTE — NO APLICADA. Se aplica con el MCP de Supabase (`apply_migration`)
-- y, al aplicarla, este archivo pasa a supabase/migrations/ y su rollback a
-- supabase/rollbacks/ (docs/POLITICA-MIGRACIONES.md).
--
-- Auditoría 2026-10 (docs/acceso/AUDITORIA-ORGANIZACION-2026-10.md):
--   P1-5  Invitaciones `pending` con `expires_at` pasado bloqueaban volver a
--         invitar y ocupaban cupo. El código ya las trata como vencidas
--         (`src/lib/organizacion/invitaciones.ts`, `/api/me/plan`,
--         `/api/auth/invite` las marca `expired`); aquí la base lo hace firme:
--         CHECK de estados + función que marca las vencidas + tarea diaria.
--   P3-7  Único parcial: una sola invitación pendiente por correo y organización
--         (0 duplicados el 2026-10-06).
--   Rol y cargo «como etiquetas que se editan desde ⋯ con confirmación» (Figma
--   08, sección 10): no había forma de cambiar el cargo de un miembro sin
--   escribir `organization_members` desde el navegador. RPC con la misma guarda
--   que las demás de miembros (`fn_miembro_gestion_guarda`).
--
-- Verificado el 2026-10-06 (solo SELECT): 1 fila con status 'half' (por eso el
-- CHECK va NOT VALID: las filas nuevas se validan; la vieja se revisa a mano y
-- luego `validate constraint`), 10 `pending` vencidas, pg_cron instalado.
-- ============================================================================

-- 1. Estados válidos de una invitación (NOT VALID: no toca la fila 'half').
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invitations'::regclass and conname = 'invitations_status_check'
  ) then
    alter table public.invitations
      add constraint invitations_status_check
      check (status in ('pending', 'used', 'revoked', 'expired')) not valid;
  end if;
end $$;

-- 2. Una sola pendiente por correo y organización.
create unique index if not exists invitations_pendiente_unica
  on public.invitations (organization_id, lower(email))
  where status = 'pending';

create index if not exists invitations_organization_id_idx
  on public.invitations (organization_id);

-- 3. Marcar como vencidas las pendientes con la vigencia pasada.
create or replace function public.fn_invitaciones_marcar_vencidas()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with marcadas as (
    update public.invitations
       set status = 'expired'
     where status = 'pending'
       and expires_at is not null
       and expires_at < now()
    returning 1
  )
  select count(*)::integer from marcadas;
$$;

revoke all on function public.fn_invitaciones_marcar_vencidas() from public, anon, authenticated;

-- Tarea diaria (03:17 UTC). Idempotente: se reprograma con el mismo nombre.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'invitaciones_marcar_vencidas';
    perform cron.schedule('invitaciones_marcar_vencidas', '17 3 * * *', 'select public.fn_invitaciones_marcar_vencidas()');
  end if;
end $$;

-- 4. Cambiar el cargo de un miembro (Organización › Miembros › ⋯ › Editar cargo).
--    Misma guarda que rol/estado/retirar: admin o permiso `users.edit`, nunca
--    sobre uno mismo ni sobre el dueño, y un super admin solo lo toca otro.
--    Si el miembro tiene un contrato activo en Talento humano, el cargo sale de
--    ahí (`get_profiles_by_organization` usa `employments.position_id` primero):
--    cambiar `organization_members.job_position_id` no se vería, así que se
--    rechaza con un mensaje que lo explica.
create or replace function public.fn_miembro_cambiar_cargo(p_member_id bigint, p_job_position_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_objetivo public.organization_members;
begin
  v_objetivo := public.fn_miembro_gestion_guarda(p_member_id, 'users.edit');

  if p_job_position_id is not null and not exists (
       select 1 from public.job_positions
        where id = p_job_position_id
          and organization_id = v_objetivo.organization_id
          and coalesce(is_active, true)) then
    raise exception 'miembros: el cargo no existe en esta organización' using errcode = '22023';
  end if;

  if exists (select 1 from public.employments
              where organization_member_id = p_member_id and status = 'active') then
    raise exception 'miembros: el cargo lo define su contrato en Talento humano' using errcode = '42501';
  end if;

  update public.organization_members
     set job_position_id = p_job_position_id
   where id = p_member_id;

  return jsonb_build_object('id', p_member_id, 'job_position_id', p_job_position_id);
end;
$$;

revoke all on function public.fn_miembro_cambiar_cargo(bigint, uuid) from public, anon;
grant execute on function public.fn_miembro_cambiar_cargo(bigint, uuid) to authenticated;

comment on function public.fn_miembro_cambiar_cargo(bigint, uuid) is
  'Organización › Miembros: cambia el cargo de otro miembro con la guarda fn_miembro_gestion_guarda (users.edit).';
