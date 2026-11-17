-- Reversión de 20261117012641_hrm_m0_05_marca_inmutable_columna_generada.
-- Vuelve a la versión del paso 4 (sin excluir event_time). No toca datos.
create or replace function public.fn_hr_attendance_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    raise exception 'marca_inmutable: una marca no se borra; corrígela con un ajuste' using errcode = '42501';
  end if;
  if current_user not in ('postgres', 'supabase_admin')
     or (to_jsonb(new) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id'])
        is distinct from (to_jsonb(old) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id']) then
    raise exception 'marca_inmutable: una marca no se edita; corrígela con un ajuste' using errcode = '42501';
  end if;
  return new;
end;
$$;
