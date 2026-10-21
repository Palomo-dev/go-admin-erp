-- Rollback de 20261021011945_correo_compra_pendiente_clave_vault.sql
--
-- Quita el horario y las funciones. No borra el secreto resend_api_key del
-- vault: esta migración no lo creó. Tampoco toca la marca
-- abandoned_email_sent_at de los pedidos.

do $uns$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'compra-pendiente-sitio';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end
$uns$;

drop function if exists public.fn_websites_cron_post(text);
drop function if exists public.fn_leer_secreto_vault(text);
drop function if exists public.fn_secreto_vault_coincide(text, text);
