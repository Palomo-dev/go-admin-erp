-- Rollback de 20260928213000_comisiones_escritura_solo_servidor.
-- Restaura la política ALL por pertenencia y los GRANT previos (leídos por MCP
-- el 2026-09-28: anon y authenticated con DELETE, INSERT, REFERENCES, SELECT,
-- TRIGGER, TRUNCATE, UPDATE). Reabre el hueco: cualquier miembro vuelve a poder
-- escribir commissions por API. Antes de aplicarlo, el código debe volver a la
-- versión previa de commissionAdminService.ts, payrollService.ts y
-- FacturasCompraService.ts, o las transiciones y la nómina fallan por la RPC
-- ausente. No toca datos.

drop policy if exists commissions_select on public.commissions;
drop policy if exists commissions_org_member_all on public.commissions;
create policy commissions_org_member_all on public.commissions
  for all to authenticated
  using (organization_id in (select om.organization_id from organization_members om
                              where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (select om.organization_id from organization_members om
                                   where om.user_id = auth.uid() and om.is_active = true));

grant select, insert, update, delete, truncate, references, trigger on table public.commissions to anon, authenticated;

drop function if exists public.fn_comisiones_pagar_por_nomina(uuid);
drop function if exists public.fn_comision_aplicar_transicion(integer, uuid, text, jsonb);
drop function if exists public.fn_comisiones_orgs_ver_todas();
drop function if exists public.fn_comisiones_es_gestor(integer);
