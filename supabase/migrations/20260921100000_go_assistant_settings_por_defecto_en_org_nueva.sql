-- GO Assistant: toda organización nueva nace con el asistente activo.
--
-- El plan (§3.2) decía "default off" como contrato de no regresión mientras
-- el asistente era piloto. El 2026-09-19 se activó `write_full` en las 83
-- organizaciones activas: el piloto terminó. Pero no había disparador para las
-- nuevas, así que la siguiente organización volvía a "solo puedo consultar y
-- explicar" — exactamente lo que el dueño reportó de una organización que lo
-- probó antes de esa activación.
--
-- Aditiva: una fila en `ai_assistant_settings` por organización nueva, con el
-- mismo nivel que tienen todas las demás. El resto de columnas conservan sus
-- defaults (voz y TTS apagados, deshacer 15 min, carga masiva 500 filas).

create or replace function public.fn_seed_ai_assistant_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_assistant_settings (organization_id, capability_level)
  values (new.id, 'write_full')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function public.fn_seed_ai_assistant_settings() from public;

drop trigger if exists trg_seed_ai_assistant_settings on public.organizations;
create trigger trg_seed_ai_assistant_settings
  after insert on public.organizations
  for each row execute function public.fn_seed_ai_assistant_settings();

comment on function public.fn_seed_ai_assistant_settings() is
  'GO Assistant: crea ai_assistant_settings (write_full) al crear una organizacion.';

-- Las que existan sin fila (ninguna a día de hoy, pero por si acaso).
insert into public.ai_assistant_settings (organization_id, capability_level)
select o.id, 'write_full' from public.organizations o
 where not exists (select 1 from public.ai_assistant_settings s where s.organization_id = o.id)
on conflict (organization_id) do nothing;
