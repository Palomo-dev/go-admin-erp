-- Dos disparadores contables corrían como SECURITY INVOKER y llaman a
-- fn_create_journal_entry, que desde 20260923081953 (F-47) solo ejecuta
-- service_role. Con la sesión del usuario:
--   · fn_auto_journal_commission (commissions, sin EXCEPTION): la inserción de
--     la comisión falla con «permission denied» y arrastra la operación. La
--     insertan desde el navegador posService (cobro de deuda), pedidosService
--     (mesas) y FacturasCompraService.
--   · fn_auto_journal_folio_payment (payments, con EXCEPTION): se salta el
--     asiento en silencio.
-- Medido al aplicar: 0 comisiones y 0 pagos de folio creados desde el revoke
-- (08:19 UTC), así que no hubo operaciones afectadas.
--
-- Los otros 41 llamadores ya eran SECURITY DEFINER.
--
-- temp_audit_amount_validation: sin disparador ni llamador (0 y 0 en pg_proc /
-- pg_trigger). Se deja constancia como código muerto; no se borra aquí.

alter function public.fn_auto_journal_commission() security definer set search_path = public, pg_temp;
alter function public.fn_auto_journal_folio_payment() security definer set search_path = public, pg_temp;

comment on function public.temp_audit_amount_validation() is
  'CÓDIGO MUERTO (2026-09-23): no está enganchada a ningún disparador ni la llama ninguna función. Candidata a retiro en una limpieza de esquema.';
