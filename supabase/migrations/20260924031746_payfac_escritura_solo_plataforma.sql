-- GO-sec (2026-09-23) · PayFac: las tablas de la PLATAFORMA dejan de ser escribibles por el tenant.
--
-- Auditoría de integraciones (docs/design/AUDITORIA-INTEGRACIONES-OPENFINANCE-PAYFAC-FACTUS.md §2.4,
-- hallazgo 7): `commission_rates_escritura` y `payouts_escritura` daban FOR ALL a cualquier miembro
-- con `finance.approve`. Un cliente podía ponerse comisión 0 o marcar sus payouts `completed` por
-- PostgREST, sin pasar por ninguna ruta.
--
-- Después:
-- - Escritura de `organization_commission_rates`, `organization_payouts` y `payout_items`: solo un
--   admin de plataforma verificado con `fn_is_platform_admin()` (SECURITY DEFINER, `auth.uid()`,
--   `status = 'active'`; ya existe y solo la ejecutan authenticated/service_role). El servidor
--   escribe con service role, que no pasa por RLS.
-- - Lectura: sin cambios (`commission_rates_lectura`, `payouts_lectura`: pertenencia).
--   `payout_items` sigue sin política de lectura para el tenant (denegado; lo leen las rutas).
-- - `(select fn_is_platform_admin())`: se evalúa una vez por consulta (initplan), no por fila.
--
-- Probado en `begin; … rollback;` con un miembro rol 2 con `finance.approve` que no es admin de
-- plataforma: antes, el INSERT en organization_commission_rates pasaba; después, «new row violates
-- row-level security policy». Las tres tablas tienen 0 filas (2026-09-23): no hay datos que migrar.

drop policy if exists commission_rates_escritura on public.organization_commission_rates;
drop policy if exists commission_rates_escritura_plataforma on public.organization_commission_rates;
create policy commission_rates_escritura_plataforma on public.organization_commission_rates
  as permissive for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

drop policy if exists payouts_escritura on public.organization_payouts;
drop policy if exists payouts_escritura_plataforma on public.organization_payouts;
create policy payouts_escritura_plataforma on public.organization_payouts
  as permissive for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

drop policy if exists payout_items_escritura_plataforma on public.payout_items;
create policy payout_items_escritura_plataforma on public.payout_items
  as permissive for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

-- La función ya no admite anon/public (defensa en profundidad; hoy no los tiene).
revoke execute on function public.fn_is_platform_admin() from anon, public;
