-- Rollback de 20260924031746_payfac_escritura_solo_plataforma.sql
--
-- ADVERTENCIA: restaura las políticas anteriores, que dejaban a cualquier miembro con
-- `finance.approve` escribir sus tarifas de comisión y sus payouts (hallazgo 7 de la auditoría de
-- integraciones). No toca datos. El REVOKE sobre fn_is_platform_admin no se revierte: la función
-- nunca tuvo EXECUTE para anon/public.

drop policy if exists commission_rates_escritura_plataforma on public.organization_commission_rates;
drop policy if exists commission_rates_escritura on public.organization_commission_rates;
create policy commission_rates_escritura on public.organization_commission_rates
  as permissive for all to public
  using (organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = (select auth.uid())
      and om.is_active
      and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.approve'::text)
  ));

drop policy if exists payouts_escritura_plataforma on public.organization_payouts;
drop policy if exists payouts_escritura on public.organization_payouts;
create policy payouts_escritura on public.organization_payouts
  as permissive for all to public
  using (organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = (select auth.uid())
      and om.is_active
      and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.approve'::text)
  ));

drop policy if exists payout_items_escritura_plataforma on public.payout_items;
