-- Saldos a favor (4/6) — RLS y grants: lectura por pertenencia, escritura solo por RPC.
--
-- Antes:
--   · credit_notes: GRANT ALL a anon y authenticated y una política ALL por
--     pertenencia ("Users can only access credit notes from their
--     organization"): cualquier miembro podía crear, cambiar el saldo o borrar
--     un saldo a favor desde el navegador, sin asiento ni caja.
--   · credit_note_applications: GRANT ALL a anon y authenticated y políticas
--     INSERT/UPDATE/DELETE por pertenencia: un miembro podía "aplicar" (o borrar
--     una aplicación) sin tocar el saldo del crédito ni el asiento.
--
-- Ahora:
--   · anon: sin ningún privilegio en las dos tablas.
--   · authenticated: solo SELECT. credit_notes se lee por pertenencia activa y
--     sigue la política restrictiva de sucursal existente (branch_access_restrictive);
--     credit_note_applications conserva su política de lectura.
--   · Escritura SOLO por las RPC SECURITY DEFINER (dueño postgres, BYPASSRLS):
--     fn_create_customer_credit (interna), fn_saldo_favor_crear,
--     fn_apply_customer_credit, fn_registrar_pago (sobrante),
--     fn_liquidar_excedente_nota_credito, procesar_devolucion (store credit),
--     fn_nota_credito_anular y las de anular/devolver (migración 5/6).
--     Verificado el 2026-09-28: ninguna función SECURITY INVOKER escribe estas
--     tablas y el código solo las lee (facturas, estado de cuenta, cartera del
--     cliente, CRM, asistente).

revoke all on table public.credit_notes from anon;
revoke all on table public.credit_note_applications from anon;
revoke insert, update, delete, truncate, references, trigger on table public.credit_notes from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.credit_note_applications from authenticated;
grant select on table public.credit_notes to authenticated;
grant select on table public.credit_note_applications to authenticated;

drop policy if exists "Users can only access credit notes from their organization" on public.credit_notes;
drop policy if exists credit_notes_select_miembros on public.credit_notes;
create policy credit_notes_select_miembros on public.credit_notes
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
  ));

drop policy if exists credit_note_applications_organization_insert on public.credit_note_applications;
drop policy if exists credit_note_applications_organization_update on public.credit_note_applications;
drop policy if exists credit_note_applications_organization_delete on public.credit_note_applications;
