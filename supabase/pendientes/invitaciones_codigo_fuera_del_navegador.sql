-- PENDIENTE DE APLICAR — GO-sec (auditoría de acceso 2026-09-28, §4.1), fase 2.
--
-- Aplicar con apply_migration (MCP) SOLO DESPUÉS de desplegar el commit
-- «fix(GO-sec): invitaciones…» que mueve el alta y el reenvío de invitaciones
-- al servidor. Con el código anterior desplegado, esta migración rompe la
-- pestaña de invitaciones del admin (pedía la columna `code` y hacía
-- `insert().select()`).
--
-- Al aplicarla: moverla a supabase/migrations/<timestamp>_invitaciones_codigo_fuera_del_navegador.sql
-- y su rollback a supabase/rollbacks/ con el mismo timestamp, en el mismo commit
-- (docs/POLITICA-MIGRACIONES.md).
--
-- Qué hace:
--  1. Quita la política del invitado (`invitations_select_for_invitee`): el
--     proyecto confirma los correos al registrarse, así que una sesión NO
--     prueba el buzón; quien registrara un correo invitado sin cuenta leía el
--     código. El invitado ya no consulta la tabla: el servidor le manda el
--     enlace (/api/auth/invite/pendiente) o lo resuelve tras verifyOtp.
--  2. authenticated deja de ver la columna `code` y de insertar/borrar: el
--     admin lista (sin código) y revoca (solo `status`); el alta y el reenvío
--     los hace /api/auth/invite con la service role.
--
-- Probado en begin/rollback el 2026-09-28: un admin de la org 142 ve sus 50
-- invitaciones, puede actualizar `status` y no tiene SELECT sobre `code`.

drop policy if exists invitations_select_for_invitee on public.invitations;

revoke select, insert, update, delete on table public.invitations from authenticated;
grant select (
  id, organization_id, email, role_id, created_by, created_at,
  expires_at, used_at, status, branch_id, job_position_id
) on table public.invitations to authenticated;
grant update (status) on table public.invitations to authenticated;
