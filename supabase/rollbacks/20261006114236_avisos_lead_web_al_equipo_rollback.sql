-- Reversión de 20261006200100_avisos_lead_web_al_equipo (aplicada el 2026-10-06 como 20261006114236).
-- Devuelve `fn_avisos_miembro_lead` y `trg_avisos_miembro_lead` a como estaban
-- (solo avisan al asignado). No borra los avisos «Llegó un lead desde la web» ya
-- creados: se reconocen por `idempotency_key like '%:lead.web:%'` o por
-- `subject_key like 'lead.web:%'`, por si alguien decide limpiarlos a mano.

create or replace function public.fn_avisos_miembro_lead()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor_id uuid;
  v_actor text;
  v_nombre text;
  v_id uuid;
begin
  if new.organization_id is null
     or new.lifecycle_stage is distinct from 'lead'
     or new.lead_discarded_at is not null
     or new.owner_id is null
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  v_actor_id := auth.uid();
  v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
  v_nombre := nullif(btrim(coalesce(new.full_name, '')), '');
  if v_nombre is null then
    v_nombre := 'Sin nombre';
  end if;

  v_id := public.fn_avisos_miembro_poner(
    new.organization_id, new.owner_id, v_actor_id,
    'lead.asignado', 'customer', new.id,
    'Te asignaron un lead',
    v_actor || ' te asignó el lead «' || v_nombre || '».',
    '/app/crm/leads?lead=' || new.id::text,
    'lead.asignado:' || new.organization_id::text || ':' || new.id::text || ':' || new.owner_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
  );

  if v_id is not null then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$function$;

create or replace trigger trg_avisos_miembro_lead
  after insert or update of owner_id on public.customers
  for each row execute function public.fn_avisos_miembro_lead();
