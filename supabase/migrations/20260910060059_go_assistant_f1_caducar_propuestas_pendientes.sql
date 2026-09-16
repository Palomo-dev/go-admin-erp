-- GO Assistant F1 — cierra la deuda declarada en F0.
--
-- Las propuestas caducan a los 30 minutos, pero hasta ahora eso solo se detectaba
-- cuando alguien intentaba confirmarlas: una propuesta vieja se quedaba `pending`
-- indefinidamente, y una que se quedó a medias (`executing`, porque el proceso
-- murió tras el claim) tampoco se limpiaba sola.
--
-- Una propuesta vieja no debe poder confirmarse cuando el mundo ya cambió: el
-- precio que se leyó hace hora y media puede no ser el de ahora.

create or replace function public.fn_expire_ai_agent_actions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.ai_agent_actions
     set status = 'expired',
         error_code = coalesce(error_code, 'expired'),
         error_message = coalesce(error_message, 'La propuesta caduco sin confirmarse')
   where status in ('pending', 'confirmed', 'executing')
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fn_expire_ai_agent_actions() from public;

comment on function public.fn_expire_ai_agent_actions() is
  'GO Assistant: marca `expired` las propuestas vencidas. La ejecuta pg_cron cada 10 minutos.';

-- Cada 10 minutos: la ventana es de 30, así que el retraso máximo entre que
-- caduca y se marca es de 10 minutos. `/execute-action` comprueba `expires_at`
-- igualmente, así que el cron es higiene, no la garantía.
select cron.unschedule('go-assistant-expire-actions')
 where exists (select 1 from cron.job where jobname = 'go-assistant-expire-actions');

select cron.schedule(
  'go-assistant-expire-actions',
  '*/10 * * * *',
  $$select public.fn_expire_ai_agent_actions();$$
);