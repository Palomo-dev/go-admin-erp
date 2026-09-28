-- GO-sec (2026-09-28) — payment_qr_sessions: lectura por pertenencia estándar.
--
-- Verificado en la base viva antes de aplicar:
--   * La única política permisiva (payment_qr_sessions_org_isolation, FOR ALL,
--     rol public) comparaba organization_id con
--     current_setting('app.current_organization_id'), que nadie fija: la página
--     «Sesiones QR» (/app/finanzas/metodos-pago/qr-sessions) salía siempre vacía.
--   * Todos los escritores son de servidor con service role (qrSessionService,
--     paymentConfirmation, cobroQrServidor, webhooks de Bancolombia, Bre-B,
--     Redeban y Wompi, /api/integrations/qr/expire-sessions): la RLS no los
--     afecta. El navegador solo lee.
--   * anon y authenticated tenían todos los privilegios de tabla.
--   * Se conserva la restrictiva branch_access_restrictive (app_branch_access).

drop policy if exists payment_qr_sessions_org_isolation on public.payment_qr_sessions;
drop policy if exists payment_qr_sessions_lectura_miembros on public.payment_qr_sessions;
create policy payment_qr_sessions_lectura_miembros on public.payment_qr_sessions
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

-- Solo lectura desde el cliente; escribe el servidor con service role.
revoke all on table public.payment_qr_sessions from anon;
revoke insert, update, delete, truncate on table public.payment_qr_sessions from authenticated;
