-- Revierte HRM fase 0 · paso 4: historial con fecha de efecto.
-- ADVERTENCIA: borra hr_employment_events (todo el historial registrado). Los
-- valores ya copiados a employments se quedan. Exportar la tabla antes.
-- Deja fn_hr_aprobacion_al_cerrar en su versión base del paso 3.
-- Revertir antes el paso 7 (lee hr_employment_events).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-aplicar-eventos') then
    perform cron.unschedule('hrm-aplicar-eventos');
  end if;
end $$;

drop trigger if exists trg_employments_historial_directo on public.employments;
drop function if exists public.fn_hr_employments_historial_directo();
drop function if exists public.fn_hr_registrar_cambio(uuid, text, date, jsonb, text, jsonb);
drop function if exists public.fn_hr_validar_valor(integer, uuid, text, jsonb);
drop function if exists public.fn_hr_aplicar_eventos_vigentes();
drop function if exists public.fn_hr_aplicar_evento(uuid);
drop function if exists public.fn_hr_valor_tramos(uuid, text, date, date);
drop function if exists public.fn_hr_valor_vigente(uuid, text, date);
drop function if exists public.fn_hr_actor_puede_empleo(uuid, uuid, text, text);
drop function if exists public.fn_hr_valor_vigente_interno(uuid, text, date);
drop function if exists public.fn_hr_valor_columna(public.employments, text);
drop table if exists public.hr_employment_events;
drop function if exists public.fn_hr_eventos_inmutables();
drop function if exists public.fn_hr_grupo_de_campo(text);

create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return;
end;
$$;
revoke execute on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
