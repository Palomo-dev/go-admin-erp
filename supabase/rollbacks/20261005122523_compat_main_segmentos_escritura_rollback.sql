-- Revierte 20261005122523_compat_main_segmentos_escritura.
-- AVISO: volver a revocar la escritura rompe de nuevo la pantalla de segmentos
-- de main (crear/editar/duplicar/recalcular/eliminar). No toca datos.
set local lock_timeout = '3s';

revoke insert, update, delete on table public.segments from authenticated;

-- Cuerpos exactos aplicados por feat/crm-flujo-completo
-- (20261001015500_crm_segmentos_operaciones_atomicas y
--  20261001030800_crm_segmentos_recuento_en_cola).
create or replace function public.crm_campaign_segment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_refs text[];v_ref text;
begin
 if tg_table_name='campaigns' then
  v_refs:=array[new.segment_id::text,new.statistics#>>'{audience,segment_id}'];
 else v_refs:=array[new.target_config->>'segment_id'];end if;
 foreach v_ref in array v_refs loop
  if v_ref is null or v_ref='' then continue;end if;
  perform id from public.segments where organization_id=new.organization_id and id::text=v_ref for key share;
  if not found then raise exception 'segmento_no_encontrado' using errcode='23514';end if;
 end loop;
 return new;
end;
$function$;
revoke all on function public.crm_campaign_segment_guard() from public, anon, authenticated;

create or replace function public.crm_sequence_segment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_id text:=nullif(new.trigger_config->>'segment_id','');
begin
 if v_id is not null then
  perform id from public.segments where organization_id=new.organization_id and id::text=v_id for key share;
  if not found then raise exception 'segmento_no_encontrado' using errcode='23514';end if;
 end if;
 return new;
end;
$function$;
revoke all on function public.crm_sequence_segment_guard() from public, anon, authenticated;
