-- HRM fase 0 · paso 11: corrige el valor vigente ANTES del primer cambio.
-- ADR-001 §3.
--
-- La prueba del motor de aprobaciones lo destapó: cuando un evento aprobado ya
-- se copió a employments, pedir el valor de una fecha anterior a ese evento
-- devolvía la columna actual (el valor nuevo) en vez del anterior.
-- Ahora: el último evento aprobado con effective_from <= fecha manda; si la
-- fecha es anterior a todos los eventos, vale el old_value del primero; la
-- columna actual solo se usa si el campo nunca tuvo eventos.

create or replace function public.fn_hr_valor_vigente_interno(p_employment uuid, p_campo text, p_fecha date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select ev.new_value into v from public.hr_employment_events ev
   where ev.employment_id = p_employment and ev.field = p_campo and ev.status = 'aprobado'
     and ev.effective_from <= p_fecha
   order by ev.effective_from desc, ev.approved_at desc nulls last, ev.created_at desc
   limit 1;
  if found then
    return v;
  end if;

  select ev.old_value into v from public.hr_employment_events ev
   where ev.employment_id = p_employment and ev.field = p_campo and ev.status = 'aprobado'
     and ev.effective_from > p_fecha
   order by ev.effective_from, ev.approved_at nulls last, ev.created_at
   limit 1;
  if found then
    return v;
  end if;

  select public.fn_hr_valor_columna(e, p_campo) into v from public.employments e where e.id = p_employment;
  return v;
end;
$$;
revoke execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) from public, anon, authenticated;
grant execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) to service_role;
