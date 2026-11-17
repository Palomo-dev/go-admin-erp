-- HRM · Marcación M0 · paso 5: corrección del paso 4.
-- En un trigger BEFORE, las columnas GENERATED (attendance_events.event_time) llegan
-- nulas en NEW: se excluyen de la comparación para que las columnas técnicas
-- (photo_hold, work_date…) se puedan escribir desde las funciones de la base.
create or replace function public.fn_hr_attendance_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Solo la cascada al borrar la organización.
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    raise exception 'marca_inmutable: una marca no se borra; corrígela con un ajuste' using errcode = '42501';
  end if;
  -- Solo columnas técnicas que escribe la base, y solo desde sus funciones.
  if current_user not in ('postgres', 'supabase_admin')
     or (to_jsonb(new) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id', 'event_time'])
        is distinct from (to_jsonb(old) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id', 'event_time']) then
    raise exception 'marca_inmutable: una marca no se edita; corrígela con un ajuste' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_attendance_inmutable() from public, anon, authenticated;
