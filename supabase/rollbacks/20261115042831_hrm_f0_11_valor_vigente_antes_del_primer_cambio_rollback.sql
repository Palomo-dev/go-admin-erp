-- Revierte HRM fase 0 · paso 11: devuelve fn_hr_valor_vigente_interno a la
-- versión del paso 4 (con el defecto de leer la columna actual para fechas
-- anteriores al primer evento). No toca datos.

create or replace function public.fn_hr_valor_vigente_interno(p_employment uuid, p_campo text, p_fecha date)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select ev.new_value from public.hr_employment_events ev
      where ev.employment_id = p_employment and ev.field = p_campo and ev.status = 'aprobado'
        and ev.effective_from <= p_fecha
      order by ev.effective_from desc, ev.approved_at desc nulls last, ev.created_at desc
      limit 1),
    (select public.fn_hr_valor_columna(e, p_campo) from public.employments e where e.id = p_employment));
$$;
revoke execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) from public, anon, authenticated;
grant execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) to service_role;
