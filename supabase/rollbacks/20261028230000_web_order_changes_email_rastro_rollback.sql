-- Rollback de 20261028230000_web_order_changes_email_rastro.
set lock_timeout = '3s';
set statement_timeout = '60s';
begin;
drop function if exists public.fn_web_order_change_registrar_correo(uuid, bigint, text, text, uuid, text, text);
alter table public.web_order_changes
  drop column if exists email_sent_to_masked,
  drop column if exists email_message_id,
  drop column if exists email_sent_count,
  drop column if exists email_sent_at;
commit;
