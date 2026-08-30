-- Trigger pg_net para disparar la Edge Function push
-- cuando se inserta una notificación con channel='push' o channel='app'.
--
-- Requiere configurar en Supabase Dashboard:
--   alter database postgres set app.settings.supabase_url = 'https://jgmgphmzusbluqhuqihj.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service_role_key>';

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer as $$
begin
  -- Solo procesar notificaciones con canal 'push' o 'app' (in-app)
  -- que son las que el usuario debe ver en su pantalla.
  if new.channel not in ('push', 'app') then
    return new;
  end if;

  -- Caso 1: notificación dirigida a un usuario específico
  if new.recipient_user_id is not null then
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
    return new;
  end if;

  -- Caso 2: notificación de organización (recipient_user_id IS NULL)
  -- Enviar push a TODOS los miembros activos de la organización.
  if new.recipient_user_id is null and new.organization_id is not null then
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
    return new;
  end if;

  return new;
end;
$$;

-- Recrear el trigger (drop if exists + create)
drop trigger if exists trigger_push_notification on public.notifications;
create trigger trigger_push_notification
  after insert on public.notifications
  for each row execute procedure public.notify_push();
