-- Revierte HRM fase 0 · paso 2: persona-empleado.
-- ADVERTENCIAS:
-- - Borra hr_people y los datos sensibles (identificación, beneficiarios,
--   contactos y cuentas). Exportarlos antes si tienen filas.
-- - Devuelve la FK de employments.organization_member_id a ON DELETE CASCADE
--   (riesgo R5: borrar un usuario vuelve a borrar su vínculo laboral).
-- - El NOT NULL de organization_member_id solo se restaura si ningún vínculo
--   quedó sin miembro; si hay alguno, se avisa y queda NULL-able.
-- - Se quitan employments.organization_id y person_id (se rellenaron desde
--   organization_members; no son datos que se pierdan).
-- Revertir antes los pasos 3 a 10, que dependen de este.

drop policy if exists hr_people_select on public.hr_people;
drop policy if exists hr_people_insert on public.hr_people;
drop policy if exists hr_people_update on public.hr_people;
drop function if exists public.fn_hr_equipo_personas(text);
drop function if exists public.fn_hr_equipo_empleos(text);
drop function if exists public.fn_hr_equipo_empleos_actor(uuid, text);
drop function if exists public.fn_hr_mis_personas();
drop function if exists public.fn_hr_mis_empleos();

drop trigger if exists trg_employments_campos_sensibles_legados on public.employments;
drop function if exists public.fn_hr_employments_campos_legados();
drop trigger if exists trg_000_employments_organizacion on public.employments;
drop function if exists public.fn_hr_employments_organizacion();

alter table public.employments drop constraint if exists employments_organization_id_nn;
alter table public.employments drop constraint if exists employments_organization_member_id_fkey;
alter table public.employments add constraint employments_organization_member_id_fkey
  foreign key (organization_member_id) references public.organization_members(id) on delete cascade;
do $$
begin
  if exists (select 1 from public.employments where organization_member_id is null) then
    raise notice 'hay vínculos sin miembro: organization_member_id queda NULL-able';
  else
    alter table public.employments alter column organization_member_id set not null;
  end if;
end $$;
comment on column public.employments.base_salary is null;
alter table public.employments drop column if exists person_id;
alter table public.employments drop column if exists organization_id;

drop table if exists public.hr_person_bank_accounts;
drop table if exists public.hr_person_emergency_contacts;
drop table if exists public.hr_person_beneficiaries;
drop table if exists public.hr_people_identification;
drop trigger if exists trg_hr_people_updated on public.hr_people;
drop table if exists public.hr_people;
drop function if exists public.fn_hr_people_updated();
drop function if exists public.fn_hr_misma_org_persona();
