-- Conserva reservas, saldos y auditoría. No habilita un segundo reembolso ni borra evidencia.
revoke all on function public.crm_lock_comm_wallet(integer) from public,anon,authenticated,service_role;
revoke all on function public.crm_reserve_whatsapp_credit(integer,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_consume_whatsapp_credit(integer,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_refund_whatsapp_credit(integer,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on public.crm_whatsapp_credit_reservations from public,anon,authenticated,service_role;
