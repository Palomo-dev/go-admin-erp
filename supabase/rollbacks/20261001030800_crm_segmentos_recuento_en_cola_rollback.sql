-- Conserva columnas derivadas, jobs, referencias protegidas y auditoría.
-- Revertir también el productor/consumidor de aplicación; las nuevas RPC quedan cerradas.
CREATE OR REPLACE FUNCTION public.fn_crm_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_save_segment(p_org integer, p_actor uuid, p_id uuid, p_name text, p_description text, p_filter jsonb, p_dynamic boolean, p_count integer, p_members uuid[], p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old public.segments; v_row public.segments; v_count integer;
begin
 perform public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.segments.manage');
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or length(coalesce(p_description,''))>1000
  or p_dynamic is null or p_count is null or p_count<0 or jsonb_typeof(p_filter) not in('object','array')
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
 else v_count:=p_count;
 end if;
 if p_id is null then
  insert into public.segments(organization_id,name,description,filter_json,is_dynamic,customer_count,last_run_at,created_by,members_snapshotted_at)
  values(p_org,btrim(p_name),nullif(btrim(p_description),''),p_filter,p_dynamic,v_count,now(),p_actor,case when not p_dynamic then now() end)
  returning * into v_row;
 else
  update public.segments set name=btrim(p_name),description=nullif(btrim(p_description),''),filter_json=p_filter,
   is_dynamic=p_dynamic,customer_count=v_count,last_run_at=now(),updated_at=clock_timestamp(),
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
 return to_jsonb(v_new);
end;
$function$
;
-- Se conserva el bloqueo de borrado por referencias de secuencias; protege datos ya vinculados.
revoke all on function public.crm_request_segment_recount(integer,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.crm_continue_segment_recount(integer,uuid,uuid,timestamptz,uuid,timestamptz,jsonb,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.crm_segment_usages(integer,uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.crm_save_segment(integer,uuid,uuid,text,text,jsonb,boolean,integer,uuid[],timestamptz) to service_role;
revoke all on function public.crm_duplicate_segment(integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_duplicate_segment(integer,uuid,uuid,text) to service_role;
revoke all on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_delete_segment(integer,uuid,uuid,timestamptz) to service_role;

revoke all on function public.crm_enqueue_due_segment_recounts(integer) from public,anon,authenticated,service_role;
