-- Copiar/borrar conserva la audiencia estática y registra el actor en la misma transacción.
create or replace function public.crm_duplicate_segment(p_org integer,p_actor uuid,p_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.segments;v_new public.segments;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'nombre_invalido' using errcode='22023';end if;
 select * into v_old from public.segments where id=p_id and organization_id=p_org for share;
 if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
 if v_old.is_dynamic=false and v_old.members_snapshotted_at is null then raise exception 'snapshot_requerido' using errcode='40001';end if;
 insert into public.segments(organization_id,name,description,filter_json,is_dynamic,customer_count,last_run_at,created_by,members_snapshotted_at)
 values(p_org,btrim(p_name),v_old.description,v_old.filter_json,v_old.is_dynamic,v_old.customer_count,v_old.last_run_at,p_actor,v_old.members_snapshotted_at)
 returning * into v_new;
 if v_old.is_dynamic=false then
  insert into public.segment_members(organization_id,segment_id,customer_id,created_by)
  select p_org,v_new.id,customer_id,p_actor from public.segment_members where organization_id=p_org and segment_id=p_id;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.duplicated','segment',v_new.id,jsonb_build_object('actor',p_actor,'source_id',p_id),'processed',now());
 return to_jsonb(v_new);
end;
$$;
revoke all on function public.crm_duplicate_segment(integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_duplicate_segment(integer,uuid,uuid,text) to service_role;

-- Las referencias en JSON también toman un lock: impide crear una campaña
-- mientras otra transacción elimina su segmento (no existe FK para ese JSON).
create or replace function public.crm_campaign_segment_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;
revoke all on function public.crm_campaign_segment_guard() from public,anon,authenticated;
create or replace trigger crm_campaign_segment_scope before insert or update of segment_id,statistics,organization_id
 on public.campaigns for each row execute function public.crm_campaign_segment_guard();
create or replace trigger crm_voice_segment_scope before insert or update of target_config,organization_id
 on public.voice_agent_campaigns for each row execute function public.crm_campaign_segment_guard();

create or replace function public.crm_delete_segment(p_org integer,p_actor uuid,p_id uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.segments;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 select * into v_old from public.segments where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
 if v_old.updated_at is distinct from p_expected then raise exception 'registro_cambio' using errcode='40001';end if;
 if exists(select 1 from public.campaigns where organization_id=p_org and
  (segment_id=p_id or statistics#>>'{audience,segment_id}'=p_id::text))
  or exists(select 1 from public.voice_agent_campaigns where organization_id=p_org and target_config->>'segment_id'=p_id::text) then
  raise exception 'segmento_en_uso' using errcode='40001';
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.deleted','segment',p_id,jsonb_build_object('actor',p_actor,'previous',to_jsonb(v_old)),'processed',now());
 delete from public.segments where organization_id=p_org and id=p_id;
end;
$$;
revoke all on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) to service_role;

-- Solo las API con actor validado escriben filtros/snapshots. Lectura queda bajo RLS.
revoke insert,update,delete,truncate,references,trigger on public.segments from authenticated,anon;
