-- Trigger pg_net para disparar la Edge Function push
-- cuando se inserta una notificación con channel='push' o channel='app'.
--
-- Configuración preferida (opcional, en Supabase Dashboard SQL Editor como superuser):
--   alter database postgres set app.settings.supabase_url = 'https://jgmgphmzusbluqhuqihj.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service_role_key>';
--
-- Si los settings de BD no están configurados, la función usa valores fallback
-- hardcodeados (ver más abajo). Esto permite que el push funcione sin necesidad
-- de ALTER DATABASE (que requiere superuser).
--
-- El push es best-effort: NUNCA debe bloquear la operación principal.
-- - Si los settings no están configurados → usa fallback hardcodeado.
-- - Si net.http_post falla por cualquier motivo (edge function caída, timeout,
--   error de red, etc.) → el bloque EXCEPTION captura el error y sale sin
--   propagarlo, evitando que se revierta la transacción que disparó el trigger.

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer as $$
declare
  v_supabase_url text;
  v_service_role_key text;
begin
  -- Solo procesar notificaciones con canal 'push' o 'app' (in-app)
  -- que son las que el usuario debe ver en su pantalla.
  if new.channel not in ('push', 'app') then
    return new;
  end if;

  -- Leer configuración de forma segura (true => NULL si no existe el setting)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- Fallback: si los settings de BD no están configurados, usar valores por defecto.
  -- Esto permite que el push funcione sin ALTER DATABASE (que requiere superuser).
  -- Los settings de BD siguen siendo preferidos si existen.
  if v_supabase_url is null then
    v_supabase_url := 'https://jgmgphmzusbluqhuqihj.supabase.co';
  end if;
  if v_service_role_key is null then
    v_service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbWdwaG16dXNibHVxaHVxaWhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNDUyMiwiZXhwIjoyMDYxNjEwNTIyfQ.GZXSzO5lH_ejDCxVFdlfVC4PjAlWO5lk_pFJ6t_BK3o';
  end if;

  -- Caso 1: notificación dirigida a un usuario específico
  if new.recipient_user_id is not null then
    begin
      perform net.http_post(
        url := v_supabase_url || '/functions/v1/push',
        body := json_build_object(
          'type', 'INSERT',
          'table', 'notifications',
          'record', row_to_json(new),
          'old_record', null
        )::jsonb,
        headers := json_build_object(
          'Authorization', 'Bearer ' || v_service_role_key,
          'Content-Type', 'application/json'
        )::jsonb
      );
    exception when others then
      -- Push es best-effort: nunca debe bloquear la operación principal.
      return new;
    end;
    return new;
  end if;

  -- Caso 2: notificación de organización (recipient_user_id IS NULL)
  -- Enviar push a TODOS los miembros activos de la organización.
  if new.recipient_user_id is null and new.organization_id is not null then
    begin
      perform net.http_post(
        url := v_supabase_url || '/functions/v1/push',
        body := json_build_object(
          'type', 'INSERT',
          'table', 'notifications',
          'record', row_to_json(new),
          'old_record', null
        )::jsonb,
        headers := json_build_object(
          'Authorization', 'Bearer ' || v_service_role_key,
          'Content-Type', 'application/json'
        )::jsonb
      );
    exception when others then
      -- Push es best-effort: nunca debe bloquear la operación principal.
      return new;
    end;
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
