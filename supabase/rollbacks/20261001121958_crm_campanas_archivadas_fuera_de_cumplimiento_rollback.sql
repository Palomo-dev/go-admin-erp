set lock_timeout='2s';
-- Restaura la comprobación previa de existencia. No modifica historial ni constancias.
CREATE OR REPLACE FUNCTION public.crm_campaign_compliance_snapshot(p_org integer, p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_policy text;v_check jsonb;v_current boolean;
begin
 perform public.fn_assert_acceso_org(p_org);
 if not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign)then raise exception 'campana_no_encontrada'using errcode='P0002';end if;
 select data_policy_url into v_policy from public.comm_settings where organization_id=p_org;
 select to_jsonb(r)into v_check from public.campaign_rne_checks r where organization_id=p_org and campaign_id=p_campaign order by checked_at desc,id desc limit 1;
 v_current:=coalesce((v_check->>'numbers_in_file')::integer>0 and (v_check->>'valid_until')::timestamptz>now(),false);
 return jsonb_build_object('data_policy_url',v_policy,'data_policy_valid',v_policy is not null,
  'rne',v_check,'rne_current',v_current,'allowed',v_policy is not null and v_current,
  'reason',case when v_policy is null then 'data_policy_required'when not v_current then 'rne_required'end);
end;$function$;

CREATE OR REPLACE FUNCTION public.crm_register_campaign_rne(p_org integer, p_campaign uuid, p_numbers text[], p_excluded jsonb, p_file text, p_sha256 text, p_actor uuid, p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid:=gen_random_uuid();v_now timestamptz:=clock_timestamp();v_count integer;v_targets integer;v_excluded integer;v_skipped integer:=0;v_result jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_days is null or p_days not between 1 and 30 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_excluded)is distinct from 'array'or cardinality(p_numbers)>500000 then raise exception 'verificacion_rne_invalida'using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active)then raise exception 'actor_ajeno'using errcode='42501';end if;
 perform 1 from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada'using errcode='P0002';end if;
 select count(*)into v_count from public.crm_rne_valid_numbers(p_numbers);
 if v_count=0 then raise exception 'rne_sin_numeros_validos'using errcode='22023';end if;
 if exists(select 1 from public.campaign_contacts cc join public.customers u on u.id=cc.customer_id where cc.campaign_id=p_campaign and u.organization_id<>p_org)then raise exception 'contacto_campana_ajeno'using errcode='P0001';end if;
 if exists(
  with numbers as materialized(select phone_e164 from public.crm_rne_valid_numbers(p_numbers)),
  proof as materialized(select * from jsonb_to_recordset(p_excluded)as x(customer_id uuid,phone text,phone_e164 text))
  select 1 from proof p left join public.customers u on u.organization_id=p_org and u.id=p.customer_id
   left join public.campaign_contacts cc on cc.customer_id=p.customer_id and cc.campaign_id=p_campaign
   left join numbers n on n.phone_e164=p.phone_e164
  where u.id is null or cc.id is null or u.phone is distinct from p.phone or n.phone_e164 is null
 )then raise exception 'audiencia_rne_modificada'using errcode='P0001';end if;
 select count(*)into v_targets from public.campaign_contacts where campaign_id=p_campaign;
 select count(distinct customer_id)into v_excluded from jsonb_to_recordset(p_excluded)as x(customer_id uuid);
 insert into public.campaign_rne_checks(id,organization_id,campaign_id,checked_at,valid_until,file_name,file_sha256,numbers_in_file,checked_targets,excluded_targets,checked_by)
 values(v_id,p_org,p_campaign,v_now,v_now+make_interval(days=>p_days),left(p_file,255),p_sha256,v_count,v_targets,v_excluded,p_actor);
 perform public.crm_import_rne_numbers(p_org,p_numbers,v_id,p_actor);
 v_result:=public.crm_skip_campaign_contacts_subset(p_org,p_campaign,'rne',array(select distinct customer_id from jsonb_to_recordset(p_excluded)as x(customer_id uuid)),p_actor);
 v_skipped:=coalesce((v_result->>'skipped')::integer,0);
 update public.campaign_rne_checks set skipped_contacts=v_skipped where id=v_id;
 return jsonb_build_object('id',v_id,'check_id',v_id,'checked_at',v_now,'valid_until',v_now+make_interval(days=>p_days),
  'numbers_in_file',v_count,'checked_targets',v_targets,'excluded_targets',v_excluded,'skipped_contacts',v_skipped);
end;$function$;
