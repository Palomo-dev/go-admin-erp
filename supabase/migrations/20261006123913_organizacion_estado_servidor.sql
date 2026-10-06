-- ⚠️ SIN APLICAR (2026-10-06). Auditoría de Organización 2026-10, P0-9.
--
-- Desactivar o reactivar una organización se hacía desde el navegador (`update organizations set
-- status = ...` con la clave anónima): una organización suspendida por la plataforma volvía a
-- `active` con un clic de su admin, y «eliminar» dejaba la suscripción de Stripe cobrando. Además el
-- admin podía escribir `owner_user_id` y `plan_id`.
--
-- Desde el código de esta tarea:
--   - Desactivar: POST /api/organizacion/desactivar (exige admin, rechaza con 409 si hay suscripción
--     de Stripe viva, escribe con service role; reglas en organizacionEstadoService).
--   - Reactivar: no se expone a la organización; lo hace la plataforma (soporte, service role).
-- Aquí la base lo hace firme:
--   1. authenticated/anon no cambian status, owner_user_id ni plan_id de una organización (sí el
--      resto: nombre, NIT, colores, subdominio... como hoy Organización › Información).
--   2. Entrar o salir de `suspended` solo lo hace la plataforma (service role, o mantenimiento sin
--      sesión). Ni una función SECURITY DEFINER llamada desde una sesión de usuario puede.
--   El alta (INSERT) no pasa por aquí. El webhook de Stripe y aplicarCheckoutDePlan escriben plan_id
--   con service role: siguen igual.
--
-- Verificado por MCP (solo SELECT) el 2026-10-06: 90 organizaciones `active`, 1 `suspended`. Ninguna
-- fila cambia.
--
-- Ensayo 2026-10-06 (do/raise): ENSAYO_OK. Alta OK; editar datos con la sesión OK; cambiar estado,
-- plan o dueño con la sesión RECHAZADO; service role desactiva, reactiva y cambia el plan;
-- reactivar una suspendida desde la sesión, incluso a través de una función SECURITY DEFINER,
-- RECHAZADO; la plataforma (service role o mantenimiento sin sesión) sí la reactiva.

create or replace function public.fn_organizations_proteger_estado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.status is distinct from old.status
          or new.owner_user_id is distinct from old.owner_user_id
          or new.plan_id is distinct from old.plan_id) then
    raise exception 'organizacion: el estado, el dueño y el plan de la organización solo se cambian desde el servidor'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and (old.status = 'suspended' or new.status = 'suspended')
     and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'organizacion: una organización suspendida solo la reactiva la plataforma'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_organizations_proteger_estado() from public, anon, authenticated;

create or replace trigger trg_organizations_proteger_estado
  before update of status, owner_user_id, plan_id on public.organizations
  for each row execute function public.fn_organizations_proteger_estado();
