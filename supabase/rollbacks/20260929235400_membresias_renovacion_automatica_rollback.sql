-- Rollback de 20260929235400_membresias_renovacion_automatica.sql (versión aplicada 20260929211718).
--
-- Restaura fn_membresias_vencer_todas tal como la dejó 20260929001000_membresias_m6_funciones, quita la
-- generación de renovaciones pendientes, su índice y el tipo de evento `renewal_due`.
-- ADVERTENCIA: borra los eventos `renewal_due` ya generados (son avisos: no llevan dinero ni documentos
-- asociados; la membresía y sus ventas no cambian). Sin borrarlos la CHECK anterior no se podría restaurar.

create or replace function public.fn_membresias_vencer_todas()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_org integer;
  v_res jsonb := '[]'::jsonb;
  v_r jsonb;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'solo_tarea_programada' using errcode = '42501';
  end if;
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.status in ('active', 'past_due', 'frozen', 'pending')
  loop
    begin
      v_r := public.fn_membresias_vencer(v_org);
      if (v_r->>'congeladas')::int + (v_r->>'descongeladas')::int + (v_r->>'activadas')::int
         + (v_r->>'en_gracia')::int + (v_r->>'credito_vencido')::int + (v_r->>'vencidas')::int > 0 then
        v_res := v_res || v_r;
      end if;
    exception when others then
      v_res := v_res || jsonb_build_object('organization_id', v_org, 'error', sqlerrm);
    end;
  end loop;
  return v_res;
end;
$function$;

drop function if exists public.fn_membresias_generar_renovaciones(integer);
drop index if exists public.membership_events_renewal_due_uq;

delete from public.membership_events where event_type = 'renewal_due';

alter table public.membership_events drop constraint if exists membership_events_event_type_check;
alter table public.membership_events add constraint membership_events_event_type_check check (event_type in
  ('created', 'activated', 'renewed', 'frozen', 'unfrozen', 'cancelled', 'expired', 'payment_received',
   'payment_failed', 'access_granted', 'access_denied', 'plan_changed', 'notes_updated',
   'trimmed', 'grace_started', 'reactivated'));
