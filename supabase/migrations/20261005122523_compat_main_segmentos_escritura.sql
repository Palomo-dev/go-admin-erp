-- Compatibilidad de la base con el código de main tras las migraciones de
-- feat/crm-flujo-completo (aplicadas en producción, código no fusionado).
--
-- 1. 20261001015500_crm_segmentos_operaciones_atomicas revocó INSERT/UPDATE/DELETE
--    sobre public.segments a authenticated porque la rama escribe por RPC
--    (crm_save_segment/crm_delete_segment). Main escribe directo desde el
--    navegador (src/components/crm/segmentos/SegmentosService.ts: crear,
--    editar, duplicar, recalcular y eliminar), así que en producción todas esas
--    acciones fallaban con "permission denied for table segments".
--    Se devuelve el privilegio solo a authenticated; anon sigue sin escritura.
--    El aislamiento lo siguen dando las políticas RLS segments_*_policy
--    (pertenencia a la organización vía organization_members).
--
-- 2. Los guardas crm_campaign_segment_guard / crm_sequence_segment_guard
--    validaban el segmento en CADA update de statistics/target_config/
--    trigger_config. Con la escritura de main restaurada, borrar un segmento
--    referenciado dejaría la campaña sin poder actualizar sus estadísticas
--    ('segmento_no_encontrado'). Ahora solo validan cuando la referencia
--    cambia (o en insert). Se conserva el bloqueo FOR KEY SHARE al validar.
set local lock_timeout = '3s';

grant insert, update, delete on table public.segments to authenticated;

create or replace function public.crm_campaign_segment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_refs text[]; v_old_refs text[]; v_ref text;
begin
 if tg_table_name = 'campaigns' then
  v_refs := array[new.segment_id::text, new.statistics#>>'{audience,segment_id}'];
  if tg_op = 'UPDATE' then
   v_old_refs := array[old.segment_id::text, old.statistics#>>'{audience,segment_id}'];
  end if;
 else
  v_refs := array[new.target_config->>'segment_id'];
  if tg_op = 'UPDATE' then
   v_old_refs := array[old.target_config->>'segment_id'];
  end if;
 end if;
 -- Compatibilidad con main: una actualización que no cambia la referencia
 -- (p. ej. progreso en statistics) no se bloquea aunque el segmento ya no exista.
 if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id
    and v_refs is not distinct from v_old_refs then
  return new;
 end if;
 foreach v_ref in array v_refs loop
  if v_ref is null or v_ref = '' then continue; end if;
  perform id from public.segments where organization_id = new.organization_id and id::text = v_ref for key share;
  if not found then raise exception 'segmento_no_encontrado' using errcode = '23514'; end if;
 end loop;
 return new;
end;
$function$;
revoke all on function public.crm_campaign_segment_guard() from public, anon, authenticated;

create or replace function public.crm_sequence_segment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_id text := nullif(new.trigger_config->>'segment_id', '');
begin
 if tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id
    and v_id is not distinct from nullif(old.trigger_config->>'segment_id', '') then
  return new;
 end if;
 if v_id is not null then
  perform id from public.segments where organization_id = new.organization_id and id::text = v_id for key share;
  if not found then raise exception 'segmento_no_encontrado' using errcode = '23514'; end if;
 end if;
 return new;
end;
$function$;
revoke all on function public.crm_sequence_segment_guard() from public, anon, authenticated;
