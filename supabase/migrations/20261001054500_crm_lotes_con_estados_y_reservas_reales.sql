-- Reclamación privada: preparar un mensaje no equivale a confirmarlo enviado.
set lock_timeout='2s';

create or replace function public.crm_campaign_contact_ready_at(p_state text,p_metadata jsonb)
returns timestamptz language plpgsql immutable set search_path=public,pg_temp as $function$
declare v_at timestamptz;v_text text;
begin
 if p_state='queued' and nullif(p_metadata->>'message_id','') is not null then return 'infinity';end if;
 if p_state not in('pending','queued') then return 'infinity';end if;
 v_text:=case when p_state='queued' then p_metadata->>'claimed_at' else p_metadata->>'retry_after' end;
 if nullif(v_text,'') is null then return '-infinity';end if;
 -- Metadata inválida nunca autoriza anticipar un contacto.
 if v_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then return 'infinity';end if;
 begin v_at:=v_text::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return 'infinity';end;
 return v_at+case when p_state='queued' then interval '15 minutes' else interval '0' end;
end;$function$;
revoke all on function public.crm_campaign_contact_ready_at(text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_campaign_contact_ready_at(text,jsonb) to service_role;

create or replace function public.crm_claim_campaign_batch(p_org integer,p_campaign uuid,p_batch integer,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_campaign public.campaigns;v_row public.campaign_contacts;v_rows jsonb:='[]';v_now timestamptz:=clock_timestamp();v_token uuid;v_res public.crm_whatsapp_credit_reservations;v_msg uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_batch is null or p_batch<1 or p_limit is null or p_limit not between 1 and 50 then raise exception 'lote_invalido' using errcode='22023';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign and channel='whatsapp' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if v_campaign.status not in('sending','scheduled') or nullif(v_campaign.statistics->>'state','') is not null then
  return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign),'reason','inactive');end if;
 if v_campaign.scheduled_at is not null and v_campaign.scheduled_at>v_now then
  return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign),'reason','scheduled_future');end if;
 if v_campaign.status='scheduled' then
  update public.campaigns set status='sending',statistics=coalesce(statistics,'{}')||jsonb_build_object('started_at',coalesce(statistics->'started_at',to_jsonb(v_now)))
   where organization_id=p_org and id=p_campaign returning * into v_campaign;
 end if;
 -- Sin recorte de candidatos: las filas terminales no llenan la ventana.
 for v_row in select cc.* from public.campaign_contacts cc where cc.campaign_id=p_campaign and cc.sent_at is null
  and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued')
  and public.crm_campaign_contact_ready_at(coalesce(cc.state,cc.metadata->>'state','pending'),cc.metadata)<=v_now
  order by cc.created_at,cc.id for update skip locked
 loop
  exit when jsonb_array_length(v_rows)>=p_limit;
  -- El vínculo privado también impide rescatar un envío incierto con metadata atrasada.
  select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and contact_id=v_row.id for update;
  if found and (v_res.message_id is not null or v_res.metadata->>'message_attached'='true') then continue;end if;
  if found and v_res.state<>'reserved' then
   update public.campaign_contacts set state='failed',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','failed','error_code','reservation_settled') where id=v_row.id;
   continue;
  end if;
  -- Compatibilidad con mensajes legacy: una clave estable existente tampoco se rescata.
  select id into v_msg from public.messages where organization_id=p_org and direction='outbound'
   and metadata->>'client_request_id'='campaign:'||p_campaign::text||':'||v_row.customer_id::text order by created_at,id limit 1;
  if found then
   update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','message_id',v_msg,'reconciliation_required',true) where id=v_row.id;
   continue;
  end if;
  if not public.fn_can_contact(p_org,v_row.customer_id,'whatsapp',coalesce(v_campaign.statistics->>'purpose','utility')) then
   perform public.crm_skip_campaign_contacts(p_org,p_campaign,'opted_out',v_row.customer_id);continue;
  end if;
  v_token:=gen_random_uuid();
  update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','batch_no',p_batch,
   'attempts',case when metadata->>'attempts' ~ '^[0-9]{1,6}$' then (metadata->>'attempts')::integer+1 else 1 end,
   'retry_after',null,'claim_token',v_token,'claimed_at',v_now)
  where id=v_row.id returning * into v_row;
  v_rows:=v_rows||jsonb_build_array(to_jsonb(v_row));
 end loop;
 return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign));
end;$function$;
revoke all on function public.crm_claim_campaign_batch(integer,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.crm_claim_campaign_batch(integer,uuid,integer,integer) to service_role;

create or replace function public.crm_finish_campaign_contact(p_org integer,p_campaign uuid,p_contact uuid,p_token uuid,p_action text,p_reason text default null,p_retry_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row public.campaign_contacts;v_campaign public.campaigns;v_res public.crm_whatsapp_credit_reservations;v_state text;v_now timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_action is null or p_action not in('prepared','release','skip','fail','pause') or p_token is null
  or length(coalesce(p_reason,''))>1000 then raise exception 'resultado_lote_invalido' using errcode='22023';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 select * into v_row from public.campaign_contacts where campaign_id=p_campaign and id=p_contact for update;
 if not found then raise exception 'contacto_campana_no_encontrado' using errcode='P0002';end if;
 if v_row.metadata->>'claim_token' is distinct from p_token::text then return jsonb_build_object('applied',false,'reason','stale_claim');end if;
 v_state:=coalesce(v_row.state,v_row.metadata->>'state','pending');
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and contact_id=p_contact for update;
 -- Tras un timeout de Node el mensaje puede estar confirmado en SQL. No se libera ni reenvía.
 if v_res.message_id is not null or v_res.metadata->>'message_attached'='true' or nullif(v_row.metadata->>'message_id','') is not null
  or v_row.sent_at is not null or v_state not in('pending','queued') then
  return jsonb_build_object('applied',false,'state',v_state,'reason','message_already_prepared');end if;
 if p_action='prepared' then raise exception 'preparacion_no_persistida' using errcode='P0001';end if;
 if p_action in('skip','fail') then
  if v_res.id is not null then perform public.crm_cancel_reserved_whatsapp(p_org,v_res.id,coalesce(nullif(p_reason,''),'contact_not_prepared'));end if;
  v_state:=case when p_action='skip' then 'skipped' else 'failed' end;
 else v_state:='pending';end if;
 update public.campaign_contacts set state=v_state,metadata=coalesce(metadata,'{}')||jsonb_build_object('state',v_state,'claim_token',null,
  'retry_after',p_retry_at,'skipped_reason',case when p_action='skip' then p_reason else null end,
  'error_message',p_reason,'error_code',case when p_action='fail' then 'PREPARATION_FAILED' else null end)
 where campaign_id=p_campaign and id=p_contact;
 if p_action='pause' and v_campaign.status in('sending','scheduled') and nullif(v_campaign.statistics->>'state','') is null then
  update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','paused_at',v_now,'pause_reason',coalesce(nullif(p_reason,''),'preparation_failed'))
  where organization_id=p_org and id=p_campaign;
 end if;
 return jsonb_build_object('applied',true,'state',v_state);
end;$function$;
revoke all on function public.crm_finish_campaign_contact(integer,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_finish_campaign_contact(integer,uuid,uuid,uuid,text,text,timestamptz) to service_role;

create or replace function public.crm_campaign_batch_progress(p_org integer,p_campaign uuid,p_batch integer,p_not_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_campaign public.campaigns;v_counts jsonb;v_now timestamptz:=clock_timestamp();v_next integer;v_at timestamptz;v_wait timestamptz;v_remaining integer;
 v_reason text;v_job uuid;v_reserved integer;v_msg public.messages;v_cc public.campaign_contacts;v_res public.crm_whatsapp_credit_reservations;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_batch is null or p_batch<1 then raise exception 'lote_invalido' using errcode='22023';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign and channel='whatsapp' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 v_counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 v_remaining:=(v_counts->>'pending')::integer+(v_counts->>'queued')::integer;
 select count(*) into v_reserved from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved';
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',v_counts,'pending',v_remaining,'credits_reserved',v_reserved)
 where organization_id=p_org and id=p_campaign returning * into v_campaign;
 if v_campaign.status not in('sending','scheduled') or nullif(v_campaign.statistics->>'state','') is not null then
  return jsonb_build_object('finished',true,'reason','status_'||coalesce(nullif(v_campaign.statistics->>'state',''),v_campaign.status),'counts',v_counts);end if;
 if v_remaining=0 and v_reserved>0 then
  update public.campaigns set statistics=statistics||jsonb_build_object('state','paused','paused_at',v_now,'pause_reason','unsettled_reservations') where organization_id=p_org and id=p_campaign;
  return jsonb_build_object('finished',false,'reason','paused_unsettled_reservations','counts',v_counts);end if;
 if v_remaining=0 then
  update public.campaigns set status='sent',statistics=statistics||jsonb_build_object('finished_at',v_now,'next_batch_no',p_batch+1) where organization_id=p_org and id=p_campaign;
  return jsonb_build_object('finished',true,'reason','completed','counts',v_counts);end if;
 -- Sin expiración que reenvíe: processing/uncertain requieren evidencia de resultado.
 for v_cc in select * from public.campaign_contacts where campaign_id=p_campaign and coalesce(state,metadata->>'state','pending')='queued'
 loop
  select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and contact_id=v_cc.id;
  if v_res.message_id is not null then
   select * into v_msg from public.messages where organization_id=p_org and id=v_res.message_id;
   if not found or v_msg.metadata->>'dispatch_state'='uncertain' then v_reason:='dispatch_reconciliation_required';exit;end if;
   if v_msg.metadata->>'dispatch_state'='deferred' then v_reason:='channel_unavailable';exit;end if;
   if v_msg.created_at<v_now-interval '15 minutes' and coalesce(v_msg.metadata->>'dispatch_state','') in('','processing') then v_reason:='dispatch_reconciliation_required';exit;end if;
  elsif v_res.metadata->>'message_attached'='true' or v_cc.metadata->>'reconciliation_required'='true' or nullif(v_cc.metadata->>'message_id','') is not null then
   v_reason:='dispatch_reconciliation_required';exit;
  end if;
 end loop;
 if v_reason is not null then
  update public.campaigns set statistics=statistics||jsonb_build_object('state','paused','paused_at',v_now,'pause_reason',v_reason)
   where organization_id=p_org and id=p_campaign;
  return jsonb_build_object('finished',false,'reason','paused_'||v_reason,'counts',v_counts);end if;
 select min(public.crm_campaign_contact_ready_at(coalesce(state,metadata->>'state','pending'),metadata)) into v_wait from public.campaign_contacts
  where campaign_id=p_campaign and coalesce(state,metadata->>'state','pending') in('pending','queued') and nullif(metadata->>'message_id','') is null;
 if v_wait='infinity' and not exists(select 1 from public.crm_whatsapp_credit_reservations r join public.campaign_contacts cc on cc.id=r.contact_id
   where r.organization_id=p_org and r.campaign_id=p_campaign and cc.state='queued' and r.message_id is not null) then
  update public.campaigns set statistics=statistics||jsonb_build_object('state','paused','paused_at',v_now,'pause_reason','invalid_retry_metadata') where organization_id=p_org and id=p_campaign;
  return jsonb_build_object('finished',false,'reason','paused_invalid_retry_metadata','counts',v_counts);end if;
 v_at:=greatest(v_now+interval '5 seconds',coalesce(p_not_before,v_now),coalesce(v_campaign.scheduled_at,v_now));
 if v_wait is not null and v_wait<>'infinity' then v_at:=greatest(v_at,v_wait);end if;
 if v_wait is null or v_wait='infinity' then v_at:=greatest(v_at,v_now+interval '30 seconds');end if;
 v_next:=greatest(p_batch+1,case when v_campaign.statistics->>'next_batch_no' ~ '^[0-9]{1,8}$' then (v_campaign.statistics->>'next_batch_no')::integer else 1 end);
 v_job:=public.fn_enqueue_job(p_org,'campaign_batch',jsonb_build_object('campaign_id',p_campaign,'batch_no',v_next),v_at,'campaign_batch:'||p_campaign::text||':'||v_next::text,50);
 update public.campaigns set statistics=statistics||jsonb_build_object('next_batch_no',v_next) where organization_id=p_org and id=p_campaign;
 return jsonb_build_object('finished',false,'counts',v_counts,'next_batch_no',v_next,'run_at',v_at,'job_id',v_job);
end;$function$;
revoke all on function public.crm_campaign_batch_progress(integer,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_campaign_batch_progress(integer,uuid,integer,timestamptz) to service_role;
