-- Recálculo de segmentos en la cola canónica de operaciones locales (noop).
-- La migración no encola los segmentos existentes: el productor nuevo lo hace al desplegar.
set lock_timeout='2s';
alter table public.segments add column if not exists counts_json jsonb;
alter table public.segments add column if not exists counted_at timestamptz;
alter table public.segments add column if not exists count_requested_at timestamptz;
alter table public.segments add column if not exists count_error text;
alter table public.segments add column if not exists count_job_id uuid references public.outbound_jobs(id) on delete set null;
create index if not exists crm_segments_count_job_idx on public.segments(count_job_id);

-- Los conteos derivados no invalidan la versión del formulario.
create or replace function public.fn_crm_touch_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $function$
begin
 if row(new.name,new.description,new.filter_json,new.is_dynamic,new.members_snapshotted_at)
  is distinct from row(old.name,old.description,old.filter_json,old.is_dynamic,old.members_snapshotted_at) then
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 else new.updated_at:=old.updated_at;end if;
 return new;
end;
$function$;
revoke all on function public.fn_crm_touch_updated_at() from public,anon,authenticated;

create or replace function public.crm_request_segment_recount(p_org integer,p_id uuid,p_force boolean default false)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row public.segments;v_job uuid;v_counts jsonb;
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_row from public.segments where organization_id=p_org and id=p_id for update;
 if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
 if v_row.is_dynamic=false and v_row.members_snapshotted_at is null then return null;end if;
 if exists(select 1 from public.outbound_jobs j where j.organization_id=p_org and j.id=v_row.count_job_id
  and j.status in('queued','running') and j.payload->>'expected_updated_at'=v_row.updated_at::text) then
  return v_row.count_job_id;
 end if;
 if not coalesce(p_force,false) and v_row.count_requested_at>now()-interval '15 minutes' then return v_row.count_job_id;end if;
 v_counts:='{"total":0,"base":0,"with_phone":0,"with_email":0,"whatsapp_opt_in":0,"rne_excluded":0,"voice_contactable":0,"email_contactable":0,"whatsapp_contactable":0}';
 v_job:=public.fn_enqueue_job(p_org,'noop',jsonb_build_object('operation','crm_segment_recount','segment_id',p_id,
  'expected_updated_at',v_row.updated_at::text,'after',null,'as_of',clock_timestamp(),'counts',v_counts),
  now(),'segment_recount:'||p_id::text||':'||v_row.updated_at::text||':start',5);
 update public.segments set count_job_id=v_job,count_requested_at=now(),count_error=null where organization_id=p_org and id=p_id;
 return v_job;
end;
$function$;
revoke all on function public.crm_request_segment_recount(integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.crm_request_segment_recount(integer,uuid,boolean) to service_role;

create or replace function public.crm_continue_segment_recount(
 p_org integer,p_id uuid,p_job uuid,p_expected timestamptz,p_after uuid,p_as_of timestamptz,p_counts jsonb,p_done boolean,p_error text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row public.segments;v_next uuid;v_key text;v_keys constant text[]:=array['total','base','with_phone','with_email','whatsapp_opt_in','rne_excluded','voice_contactable','email_contactable','whatsapp_contactable'];
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_row from public.segments where organization_id=p_org and id=p_id for update;
 if not found or v_row.count_job_id is distinct from p_job or v_row.updated_at is distinct from p_expected then
  return jsonb_build_object('skipped',true,'reason','version_changed');
 end if;
 if p_error is not null then
  update public.segments set count_job_id=null,count_error=left(p_error,500) where organization_id=p_org and id=p_id;
  return jsonb_build_object('failed',true);
 end if;
 if p_done is null or p_as_of is null or p_as_of>clock_timestamp() or jsonb_typeof(p_counts) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_counts) k where not k=any(v_keys)) then
  raise exception 'conteo_invalido' using errcode='22023';
 end if;
 foreach v_key in array v_keys loop
  if jsonb_typeof(p_counts->v_key) is distinct from 'number' or (p_counts->>v_key)!~'^[0-9]+$'
   or (p_counts->>v_key)::numeric>2147483647 then raise exception 'conteo_invalido' using errcode='22023';end if;
  if v_key not in('total','base') and (p_counts->>v_key)::integer>(p_counts->>'total')::integer then
   raise exception 'conteo_invalido' using errcode='22023';
  end if;
 end loop;
 if p_done then
  if (p_counts->>'total')::integer>(p_counts->>'base')::integer then raise exception 'conteo_invalido' using errcode='22023';end if;
  update public.segments set customer_count=(p_counts->>'total')::integer,counts_json=p_counts,counted_at=p_as_of,
   last_run_at=now(),count_job_id=null,count_error=null where organization_id=p_org and id=p_id;
  return jsonb_build_object('done',true,'total',p_counts->'total');
 end if;
 if p_after is null then raise exception 'cursor_invalido' using errcode='22023';end if;
 v_next:=public.fn_enqueue_job(p_org,'noop',jsonb_build_object('operation','crm_segment_recount','segment_id',p_id,
  'expected_updated_at',p_expected::text,'after',p_after,'as_of',p_as_of,'counts',p_counts),
  now(),'segment_recount:'||p_id::text||':'||p_expected::text||':'||p_after::text,5);
 update public.segments set count_job_id=v_next where organization_id=p_org and id=p_id;
 return jsonb_build_object('continued',true,'job_id',v_next);
end;
$function$;
revoke all on function public.crm_continue_segment_recount(integer,uuid,uuid,timestamptz,uuid,timestamptz,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.crm_continue_segment_recount(integer,uuid,uuid,timestamptz,uuid,timestamptz,jsonb,boolean,text) to service_role;

create or replace function public.crm_segment_usages(p_org integer,p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_rows jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.view']);
 if coalesce(cardinality(p_ids),0)>500 then raise exception 'lote_invalido' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,
  'campaigns',(select count(*) from public.campaigns c where c.organization_id=p_org and (c.segment_id=s.id or c.statistics#>>'{audience,segment_id}'=s.id::text)),
  'voice_campaigns',(select count(*) from public.voice_agent_campaigns c where c.organization_id=p_org and c.target_config->>'segment_id'=s.id::text),
  'sequences',(select count(*) from public.sequences q where q.organization_id=p_org and q.trigger_config->>'segment_id'=s.id::text))), '[]') into v_rows
 from public.segments s where s.organization_id=p_org and s.id=any(p_ids);
 return v_rows;
end;
$function$;
revoke all on function public.crm_segment_usages(integer,uuid[]) from public,anon;
grant execute on function public.crm_segment_usages(integer,uuid[]) to authenticated,service_role;

create or replace function public.crm_sequence_segment_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_id text:=nullif(new.trigger_config->>'segment_id','');
begin
 if v_id is not null then
  perform id from public.segments where organization_id=new.organization_id and id::text=v_id for key share;
  if not found then raise exception 'segmento_no_encontrado' using errcode='23514';end if;
 end if;
 return new;
end;
$function$;
revoke all on function public.crm_sequence_segment_guard() from public,anon,authenticated;
create or replace trigger crm_sequence_segment_scope before insert or update of trigger_config,organization_id
on public.sequences for each row execute function public.crm_sequence_segment_guard();

CREATE OR REPLACE FUNCTION public.crm_save_segment(p_org integer, p_actor uuid, p_id uuid, p_name text, p_description text, p_filter jsonb, p_dynamic boolean, p_count integer, p_members uuid[], p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old public.segments; v_row public.segments; v_count integer;v_keep boolean:=false;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or length(coalesce(p_description,''))>1000
  or p_dynamic is null or (p_count is null and not p_dynamic) or coalesce(p_count,0)<0 or jsonb_typeof(p_filter) not in('object','array')
  or p_filter is null or coalesce(cardinality(p_members),0)>100000 then
  raise exception 'segmento_invalido' using errcode='22023';
 end if;
 if p_id is not null then
  select * into v_old from public.segments where id=p_id and organization_id=p_org for update;
  if not found then raise exception 'segmento_no_encontrado' using errcode='P0002'; end if;
  if v_old.updated_at is distinct from p_expected then raise exception 'registro_cambio' using errcode='P0001'; end if;
 end if;
 if not p_dynamic and p_members is null and (v_old.id is null or v_old.is_dynamic is distinct from false) then
  raise exception 'snapshot_requerido' using errcode='22023';
 end if;
 if not p_dynamic and p_members is not null then
  perform id from public.customers where organization_id=p_org and id=any(p_members) order by id for key share;
  select count(distinct c.id) into v_count from unnest(p_members) member(customer_id)
   join public.customers c on c.id=member.customer_id and c.organization_id=p_org and c.status<>'merged';
  if v_count<>cardinality(p_members) then raise exception 'miembro_segmento_invalido' using errcode='23514'; end if;
 elsif not p_dynamic then
  select count(*) into v_count from public.segment_members where segment_id=p_id and organization_id=p_org;
 else v_count:=coalesce(p_count,0);
 end if;
 v_keep:=v_old.id is not null and v_old.is_dynamic is not distinct from p_dynamic
  and v_old.filter_json is not distinct from p_filter and p_members is null;
 if p_id is null then
  insert into public.segments(organization_id,name,description,filter_json,is_dynamic,customer_count,last_run_at,created_by,members_snapshotted_at)
  values(p_org,btrim(p_name),nullif(btrim(p_description),''),p_filter,p_dynamic,v_count,case when p_dynamic and p_count is null then null else now() end,p_actor,case when not p_dynamic then now() end)
  returning * into v_row;
 else
  update public.segments set name=btrim(p_name),description=nullif(btrim(p_description),''),filter_json=p_filter,
   is_dynamic=p_dynamic,customer_count=case when v_keep then v_old.customer_count else v_count end,
   last_run_at=case when v_keep then v_old.last_run_at when p_dynamic and p_count is null then null else now() end,
   counts_json=case when v_keep then v_old.counts_json end,counted_at=case when v_keep then v_old.counted_at end,
   count_error=null,updated_at=clock_timestamp(),
   members_snapshotted_at=case when p_dynamic then null when p_members is not null then now() else members_snapshotted_at end
  where id=p_id and organization_id=p_org returning * into v_row;
 end if;
 if p_dynamic or p_members is not null then
  delete from public.segment_members where segment_id=v_row.id and organization_id=p_org;
  if not p_dynamic then
   insert into public.segment_members(organization_id,segment_id,customer_id,created_by)
   select p_org,v_row.id,member.customer_id,p_actor from unnest(p_members) member(customer_id);
  end if;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.saved','segment',v_row.id,jsonb_build_object('actor',p_actor,'dynamic',p_dynamic,'members',v_count,
  'previous_updated_at',v_old.updated_at,'updated_at',v_row.updated_at),'processed',now());
 perform public.crm_request_segment_recount(p_org,v_row.id,true);
 select * into v_row from public.segments where organization_id=p_org and id=v_row.id;
 return to_jsonb(v_row);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_duplicate_segment(p_org integer, p_actor uuid, p_id uuid, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old public.segments;v_new public.segments;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'nombre_invalido' using errcode='22023';end if;
 select * into v_old from public.segments where id=p_id and organization_id=p_org for share;
 if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
 if v_old.is_dynamic=false and v_old.members_snapshotted_at is null then raise exception 'snapshot_requerido' using errcode='P0001';end if;
 insert into public.segments(organization_id,name,description,filter_json,is_dynamic,customer_count,last_run_at,created_by,members_snapshotted_at)
 values(p_org,btrim(p_name),v_old.description,v_old.filter_json,v_old.is_dynamic,v_old.customer_count,v_old.last_run_at,p_actor,v_old.members_snapshotted_at)
 returning * into v_new;
 if v_old.is_dynamic=false then
  insert into public.segment_members(organization_id,segment_id,customer_id,created_by)
  select p_org,v_new.id,customer_id,p_actor from public.segment_members where organization_id=p_org and segment_id=p_id;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.duplicated','segment',v_new.id,jsonb_build_object('actor',p_actor,'source_id',p_id),'processed',now());
 perform public.crm_request_segment_recount(p_org,v_new.id,true);
 select * into v_new from public.segments where organization_id=p_org and id=v_new.id;
 return to_jsonb(v_new);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_delete_segment(p_org integer, p_actor uuid, p_id uuid, p_expected timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old public.segments;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 select * into v_old from public.segments where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
 if v_old.updated_at is distinct from p_expected then raise exception 'registro_cambio' using errcode='P0001';end if;
 if exists(select 1 from public.campaigns where organization_id=p_org and
  (segment_id=p_id or statistics#>>'{audience,segment_id}'=p_id::text))
  or exists(select 1 from public.voice_agent_campaigns where organization_id=p_org and target_config->>'segment_id'=p_id::text)
  or exists(select 1 from public.sequences where organization_id=p_org and trigger_config->>'segment_id'=p_id::text) then
  raise exception 'segmento_en_uso' using errcode='P0001';
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'segment.deleted','segment',p_id,jsonb_build_object('actor',p_actor,'previous',to_jsonb(v_old)),'processed',now());
 delete from public.segments where organization_id=p_org and id=p_id;
end;
$function$
;

revoke all on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) to service_role;
revoke all on function public.crm_duplicate_segment(integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_duplicate_segment(integer,uuid,uuid,text) to service_role;
revoke all on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) to service_role;

-- El cron produce lotes pequeños; los consumidores recorren la audiencia por cursor.
create or replace function public.crm_enqueue_due_segment_recounts(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row record;v_count integer:=0;
begin
 if coalesce(auth.role(),'') in('anon','authenticated') then raise exception 'Acceso denegado' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'lote_invalido' using errcode='22023';end if;
 for v_row in
  select s.id,s.organization_id from public.segments s
  where (s.is_dynamic or s.members_snapshotted_at is not null)
   and (s.count_requested_at is null or s.count_requested_at<=now()-interval '15 minutes')
   and exists(select 1 from public.organization_modules m where m.organization_id=s.organization_id and m.module_code='crm' and m.is_active)
   and not exists(select 1 from public.outbound_jobs j where j.organization_id=s.organization_id and j.id=s.count_job_id
    and j.status in('queued','running') and j.payload->>'expected_updated_at'=s.updated_at::text)
  order by s.count_requested_at nulls first,s.id limit p_limit for update of s skip locked
 loop
  perform public.crm_request_segment_recount(v_row.organization_id,v_row.id,false);
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('enqueued',v_count);
end;
$function$;
revoke all on function public.crm_enqueue_due_segment_recounts(integer) from public,anon,authenticated;
grant execute on function public.crm_enqueue_due_segment_recounts(integer) to service_role;
