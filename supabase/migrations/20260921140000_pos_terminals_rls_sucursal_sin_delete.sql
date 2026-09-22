-- POS de doble pantalla — Fase 2, parte A (ronda 2, QA alto #1)
-- Endurece la RLS de public.pos_terminals (PLAN §6.5):
--   1. insert/update: la sucursal debe pertenecer a la MISMA organización de
--      la fila (antes solo se comprobaba la pertenencia del usuario a la
--      organización y la FK a branches: un miembro de la organización A
--      podía insertar una terminal con branch_id de la organización B).
--   2. Se retira la política DELETE: §6.5 solo prevé select/insert/update y
--      el servicio nunca borra («desactivar» es is_active = false; el id
--      puede seguir en el localStorage de una caja).
-- Renombrar / activar / desactivar exigen además rol admin o manager, que se
-- resuelve en el servidor (PATCH /api/pos/terminals/[id], PLAN §7): la RLS
-- sigue siendo por pertenencia y esa ruta usa el cliente de la sesión.
--
-- Aditiva e idempotente: no toca datos (la tabla nació el 2026-09-16).

drop policy if exists pos_terminals_insert on public.pos_terminals;
create policy pos_terminals_insert on public.pos_terminals
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true)
    and branch_id in (
      select b.id
        from public.branches b
       where b.organization_id = pos_terminals.organization_id));

drop policy if exists pos_terminals_update on public.pos_terminals;
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true))
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true)
    and branch_id in (
      select b.id
        from public.branches b
       where b.organization_id = pos_terminals.organization_id));

drop policy if exists pos_terminals_delete on public.pos_terminals;
