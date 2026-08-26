-- Trigger pg_net para disparar la Edge Function push
-- cuando se inserta una notificación con channel='push'.
--
-- Requiere configurar en Supabase Dashboard:
--   alter database postgres set app.settings.supabase_url = 'https://jgmgphmzusbluqhuqihj.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service_role_key>';

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer as $$
begin
  if new.channel = 'push' and new.recipient_user_id is not null then
    perform net.http_post(
      url := current_setting('app.settings.supabase_url')
             || '/functions/v1/push',
      body := json_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', row_to_json(new),
        'old_record', null
      )::jsonb,
      headers := json_build_object(
        'Authorization', 'Bearer '
          || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      )::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger trigger_push_notification
  after insert on public.notifications
  for each row execute procedure public.notify_push();
