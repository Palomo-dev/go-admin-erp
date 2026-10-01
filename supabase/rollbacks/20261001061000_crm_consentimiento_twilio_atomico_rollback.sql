-- Revoca el consumidor nuevo; conserva preferencias, auditoría, constancias y saldos.
-- No reactiva el INSERT antiguo de Twilio: podía perder START/STOP posteriores.
revoke execute on function public.crm_record_twilio_contact_consent(integer,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on public.crm_provider_consent_receipts from public,anon,authenticated,service_role;
