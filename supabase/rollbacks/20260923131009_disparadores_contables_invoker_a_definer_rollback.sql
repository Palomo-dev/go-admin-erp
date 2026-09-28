-- Rollback de 20260923131009_disparadores_contables_invoker_a_definer.sql
--
-- Devuelve los dos disparadores a SECURITY INVOKER con su search_path anterior.
-- OJO: mientras fn_create_journal_entry sea solo de service_role, esto vuelve a
-- romper la inserción de comisiones con la sesión del usuario y a saltar en
-- silencio el asiento del pago de folio. Solo tiene sentido junto con el
-- rollback de 20260923081953.

alter function public.fn_auto_journal_commission() security invoker;
alter function public.fn_auto_journal_commission() set search_path = public;
alter function public.fn_auto_journal_folio_payment() security invoker;
alter function public.fn_auto_journal_folio_payment() reset search_path;

comment on function public.temp_audit_amount_validation() is null;
