-- Aplicada por MCP el 2026-10-06 (antes que 20261006120000, que quedó sin aplicar). Auditoría de Organización 2026-10, P1-5 (parte de base).
--
-- Invitaciones vencidas que bloqueaban volver a invitar y ocupaban cupo. El código ya las trata
-- como vencidas (src/lib/organizacion/invitaciones.ts, /api/auth/invite las pasa a `expired` antes
-- de crear la nueva, y /api/me/plan y fn_cupo_plan solo cuentan las pendientes SIN vencer). Aquí
-- la base deja de aceptar estados inventados:
--
--   1. La única fila con un estado que no existe (`half`, invitación id 54) tiene `used_at`: se
--      normaliza a `used`. Es un UPDATE de una fila, sin borrar nada. El segundo UPDATE es la red
--      por si aparece otra sin `used_at` entre hoy y la aplicación (pasa a `revoked`).
--   2. CHECK (status in ('pending','used','revoked','expired')), VALIDADO.
--
-- Convive con la migración pendiente del rediseño de Organización
-- (20261006120000_organizacion_invitaciones_y_cargo), que crea el mismo CHECK como NOT VALID
-- (sin tocar la fila `half`), el único parcial de pendientes y la tarea que marca `expired`. Esta
-- es idempotente con ella en cualquier orden: crea el CHECK solo si no existe y luego lo valida.
--
-- Verificado por MCP (solo SELECT) el 2026-10-06: estados pending 13, used 56, revoked 57, half 1;
-- ninguna fila con status nulo.
--
-- Ensayo 2026-10-06 (do/raise): ENSAYO_OK en los dos órdenes. Sola: CHECK validado, fila 54 a used,
-- estado inválido rechazado, vencida → expired → nueva pendiente y reenvío de la expired OK. Con el
-- CHECK NOT VALID de 20261006120000 ya creado: normaliza y valida igual.

update public.invitations
   set status = 'used'
 where status not in ('pending', 'used', 'revoked', 'expired')
   and used_at is not null;

update public.invitations
   set status = 'revoked'
 where status not in ('pending', 'used', 'revoked', 'expired');

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
end;
$$;

alter table public.invitations validate constraint invitations_status_check;

comment on constraint invitations_status_check on public.invitations is
  'Estados de una invitación: pending (vigente si expires_at > now()), used, revoked, expired. Una pending vencida no ocupa cupo ni bloquea reinvitar.';
