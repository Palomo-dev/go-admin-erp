-- Reversión solo antes de usar el nuevo libro. Nunca borra evidencia ni revierte saldos reales.
-- Si ya hubo tráfico con estas RPC, conservar estructura y conciliar; no volver al cobro antiguo.
do $rollback$
begin
 if to_regclass('public.crm_voice_credit_reservations') is not null then
  if exists(select 1 from public.crm_voice_credit_reservations) then
   raise exception 'reversion_bloqueada_por_evidencia_financiera' using errcode='P0001';end if;
 end if;
end;$rollback$;
drop function if exists public.crm_voice_callback_apply(integer,uuid,text,text,integer,text);
drop function if exists public.crm_voice_session_settle(integer,text,timestamptz,integer);
drop function if exists public.crm_voice_session_open(integer,text,uuid,timestamptz,text);
drop function if exists public.crm_voice_dispatch_failure(integer,uuid,integer,text);
drop function if exists public.crm_voice_dispatch_accept(integer,uuid,text);
drop function if exists public.crm_voice_dispatch_begin(integer,uuid);
drop function if exists public.crm_voice_dispatch_cancel_prepared(integer,uuid);
drop function if exists public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb);
drop function if exists public.crm_voice_credit_return_reserved(integer,uuid);
drop table if exists public.crm_voice_credit_reservations;
