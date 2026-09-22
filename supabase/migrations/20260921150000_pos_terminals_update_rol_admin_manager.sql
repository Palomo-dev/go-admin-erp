-- POS de doble pantalla — Fase 2, parte A (ronda 3, QA medio #2)
-- Defensa en profundidad para public.pos_terminals (PLAN §6.5, §7):
-- renombrar, cambiar el código y activar/desactivar una terminal exigen rol
-- Admin o Manager. Hasta ahora ese rol se comprobaba SOLO en la ruta
-- PATCH /api/pos/terminals/[id]; la política UPDATE era por pertenencia
-- (cualquier miembro activo) y `authenticated` tiene grant UPDATE, así que un
-- cajero con su sesión podía saltarse la ruta con
-- `supabase.from('pos_terminals').update(...)` por PostgREST.
--
-- Ahora `using` / `with_check` de la política UPDATE exigen:
--   - membresía ACTIVA con role_id in (1, 2, 5) — Super Admin, Admin de
--     organización, Manager (ids verificados en public.roles el 2026-09-21;
--     regla dura 6: por id, nunca por nombre) — o is_super_admin, O
--   - public.check_user_permission(uid, organization_id, 'admin.full_access'),
--     para que los cargos con ese permiso sigan pasando igual que en la ruta
--     (hasOrgAdminOrPermission). La función es SECURITY DEFINER y ya la usan
--     las rutas; se evalúa solo cuando la condición por rol no se cumple.
-- Se conserva la comprobación de que la sucursal pertenece a la misma
-- organización (migración 20260921140000). select/insert siguen por
-- pertenencia (cualquier cajero lista y crea, PLAN §7).
--
-- La ruta sigue usando el cliente de la sesión (ctx.supabase): la RLS queda
-- por debajo del gate de rol, no lo sustituye.
--
-- Aditiva e idempotente: no toca datos (la tabla tiene 0 filas).

drop policy if exists pos_terminals_update on public.pos_terminals;
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true
         and (om.role_id in (1, 2, 5) or om.is_super_admin = true))
    or public.check_user_permission((select auth.uid()), pos_terminals.organization_id, 'admin.full_access')
  )
  with check (
    (
      organization_id in (
        select om.organization_id
          from public.organization_members om
         where om.user_id = (select auth.uid())
           and om.is_active = true
           and (om.role_id in (1, 2, 5) or om.is_super_admin = true))
      or public.check_user_permission((select auth.uid()), pos_terminals.organization_id, 'admin.full_access')
    )
    and branch_id in (
      select b.id
        from public.branches b
       where b.organization_id = pos_terminals.organization_id)
  );
