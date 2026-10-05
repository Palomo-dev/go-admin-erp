-- Campañas email: mismo escritor/render de email y una clave email/{id} por destinatario.
-- Exclusivo service_role. No activa las políticas pendientes del CRM ni cobra créditos WA.
create or replace function public.crm_claim_email_campaign_batch(p_org integer,p_campaign uuid,p_batch integer,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.campaigns; r public.campaign_contacts; m public.email_messages; rows jsonb:='[]'; t timestamptz:=clock_timestamp(); proof jsonb; token uuid; first_at timestamptz; lock_at timestamptz; branch integer; actor_denied boolean:=false;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'servicio_requerido' using errcode='42501';end if;
 perform public.fn_assert_acceso_org(p_org);
 if p_batch is null or p_batch<1 or p_limit is null or p_limit not between 1 and 50 then raise exception 'lote_invalido' using errcode='22023';end if;
 select * into c from public.campaigns where organization_id=p_org and id=p_campaign and channel='email' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if c.status not in('sending','scheduled') or nullif(c.statistics->>'state','') is not null or nullif(c.statistics->>'archived_at','') is not null then return jsonb_build_object('rows',rows,'campaign',to_jsonb(c),'reason','inactive');end if;
 if c.scheduled_at>t then return jsonb_build_object('rows',rows,'campaign',to_jsonb(c),'reason','scheduled_future');end if;
 begin
  perform public.fn_crm_exigir_permiso_actor(p_org,c.created_by,'crm.campaigns.manage');
 exception when insufficient_privilege then actor_denied:=true;end;
 proof:=public.crm_campaign_compliance_snapshot(p_org,p_campaign);
 if proof->>'allowed' is distinct from 'true' or actor_denied then
  update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason',case when proof->>'allowed' is distinct from 'true' then proof->>'reason' else 'actor_permission_changed' end,'paused_at',t) where id=p_campaign and organization_id=p_org returning * into c;
  return jsonb_build_object('rows',rows,'campaign',to_jsonb(c),'reason','compliance_required');
 end if;
 if c.status='scheduled' then update public.campaigns set status='sending',statistics=coalesce(statistics,'{}')||jsonb_build_object('started_at',coalesce(statistics->'started_at',to_jsonb(t))) where id=p_campaign and organization_id=p_org returning * into c;end if;
 for r in select cc.* from public.campaign_contacts cc where cc.campaign_id=p_campaign and cc.sent_at is null and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued') order by cc.created_at,cc.id for update skip locked loop
  exit when jsonb_array_length(rows)>=p_limit;
  m:=null;
  if nullif(r.metadata->>'email_message_id','') is not null then
   select * into m from public.email_messages where organization_id=p_org and id=(r.metadata->>'email_message_id')::uuid and to_customer_id=r.customer_id and metadata->>'campaign_id'=p_campaign::text and metadata->>'campaign_contact_id'=r.id::text for update;
   if not found then raise exception 'vinculo_correo_invalido' using errcode='P0001';end if;
   if m.provider_message_id is not null or m.status<>'pending' then continue;end if;
   first_at:=nullif(m.metadata->>'campaign_first_dispatch_at','')::timestamptz;
   lock_at:=nullif(m.metadata->>'campaign_dispatch_locked_until','')::timestamptz;
   if first_at is not null and first_at<=t-interval '23 hours' then
    update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason','email_reconciliation_required','paused_at',t) where id=p_campaign and organization_id=p_org returning * into c;
    return jsonb_build_object('rows','[]'::jsonb,'campaign',to_jsonb(c),'reason','reconciliation_required');
   end if;
   if lock_at>t then continue;end if;
  else
   if public.crm_campaign_contact_ready_at(coalesce(r.state,r.metadata->>'state','pending'),r.metadata)>t then continue;end if;
  end if;
  if not exists(select 1 from public.customers u where u.id=r.customer_id and u.organization_id=p_org and u.status is distinct from 'merged' and nullif(trim(u.email),'') is not null and (u.branch_id is null or exists(select 1 from public.branches b where b.id=u.branch_id and b.organization_id=p_org))) then
   if m.id is not null and first_at is not null then
    update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason','email_recipient_changed','paused_at',t) where id=p_campaign and organization_id=p_org returning * into c;
    return jsonb_build_object('rows','[]'::jsonb,'campaign',to_jsonb(c),'reason','recipient_changed');
   end if;
   update public.campaign_contacts set state='failed',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','failed','error_code','customer_unavailable') where id=r.id;continue;
  end if;
  select u.branch_id into branch from public.customers u where u.id=r.customer_id and u.organization_id=p_org;
  begin
   perform public.fn_crm_red_actor_sucursal(p_org,c.created_by,'crm.campaigns.manage',branch);
  exception when insufficient_privilege then
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason','actor_branch_permission_changed','paused_at',t) where id=p_campaign and organization_id=p_org returning * into c;
   return jsonb_build_object('rows','[]'::jsonb,'campaign',to_jsonb(c),'reason','actor_branch_permission_changed');
  end;
  if not public.fn_can_contact(p_org,r.customer_id,'email',coalesce(c.statistics->>'purpose','utility')) then
   -- No borrar un recibo incierto; la conciliación debe conservar el contacto.
   if m.id is not null and first_at is not null then
    update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason','email_consent_changed','paused_at',t) where id=p_campaign and organization_id=p_org returning * into c;
    return jsonb_build_object('rows','[]'::jsonb,'campaign',to_jsonb(c),'reason','consent_changed');
   end if;
   update public.campaign_contacts set state='skipped',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','skipped','skipped_reason','opted_out') where id=r.id;continue;
  end if;
  token:=gen_random_uuid();
  update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','batch_no',p_batch,'claim_token',token,'claimed_at',t,'retry_after',null,'attempts',case when metadata->>'attempts'~'^[0-9]{1,6}$' then (metadata->>'attempts')::integer+1 else 1 end)
   where id=r.id returning * into r;
  rows:=rows||jsonb_build_array(to_jsonb(r));
 end loop;
 return jsonb_build_object('rows',rows,'campaign',to_jsonb(c));
end;$$;

create or replace function public.crm_prepare_email_campaign_contact(p_org integer,p_campaign uuid,p_contact uuid,p_token uuid,p_message jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.campaigns; r public.campaign_contacts; u public.customers; m public.email_messages; proposed public.email_messages; t timestamptz:=clock_timestamp(); client_key text; opportunity_branch integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'servicio_requerido' using errcode='42501';end if;
 perform public.fn_assert_acceso_org(p_org);
 select * into c from public.campaigns where organization_id=p_org and id=p_campaign and channel='email' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 select * into r from public.campaign_contacts where campaign_id=p_campaign and id=p_contact for update;
 if not found then raise exception 'contacto_campana_no_encontrado' using errcode='P0002';end if;
 if p_token is null or r.metadata->>'claim_token' is distinct from p_token::text then raise exception 'claim_vencido' using errcode='P0001';end if;
 client_key:='campaign:'||p_campaign::text||':'||r.customer_id::text;
 if nullif(r.metadata->>'email_message_id','') is not null then
  select * into m from public.email_messages where organization_id=p_org and id=(r.metadata->>'email_message_id')::uuid and to_customer_id=r.customer_id and metadata->>'campaign_id'=p_campaign::text and metadata->>'campaign_contact_id'=p_contact::text and metadata->>'client_request_id'=client_key;
  if not found then raise exception 'vinculo_correo_invalido' using errcode='P0001';end if;
  return to_jsonb(m);
 end if;
 if c.status<>'sending' or nullif(c.statistics->>'state','') is not null or nullif(c.statistics->>'archived_at','') is not null or c.scheduled_at>t or r.state<>'queued' or r.sent_at is not null then raise exception 'campana_no_disponible' using errcode='P0001';end if;
 perform public.crm_require_campaign_compliance(p_org,p_campaign);
 perform public.fn_crm_exigir_permiso_actor(p_org,c.created_by,'crm.campaigns.manage');
 select * into u from public.customers where id=r.customer_id and organization_id=p_org for share;
 if not found or u.status='merged' or (u.branch_id is not null and not exists(select 1 from public.branches b where b.id=u.branch_id and b.organization_id=p_org)) then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 perform public.fn_crm_red_actor_sucursal(p_org,c.created_by,'crm.campaigns.manage',u.branch_id);
 if not public.fn_can_contact(p_org,r.customer_id,'email',coalesce(c.statistics->>'purpose','utility')) then raise exception 'contacto_sin_consentimiento' using errcode='P0001';end if;
 if p_message is null or jsonb_typeof(p_message)<>'object' then raise exception 'correo_invalido' using errcode='22023';end if;
 proposed:=jsonb_populate_record(null::public.email_messages,p_message);
 if proposed.id is null or proposed.organization_id is distinct from p_org or proposed.provider is distinct from 'resend' or proposed.to_customer_id is distinct from r.customer_id
  or proposed.to_email is distinct from lower(trim(u.email)) or proposed.to_email is distinct from lower(trim(r.metadata->>'recipient')) or proposed.idempotency_key is distinct from 'email/'||proposed.id::text
  or proposed.status is distinct from 'pending' or proposed.provider_message_id is not null or proposed.sequence_step_run_id is not null or proposed.scheduled_at is not null
  or proposed.cc is not null or proposed.bcc is not null or length(coalesce(proposed.subject,''))=0 or length(coalesce(proposed.from_email,''))=0
  or proposed.metadata->>'campaign_id' is distinct from p_campaign::text or proposed.metadata->>'campaign_contact_id' is distinct from p_contact::text
  or proposed.metadata->>'client_request_id' is distinct from client_key or proposed.metadata->>'from_user_id' is distinct from c.created_by::text
  or proposed.metadata->>'direction' is distinct from 'outbound' or proposed.metadata->>'kind' is distinct from (case when c.statistics->>'purpose'='marketing' then 'marketing' else 'transactional' end)
  or coalesce(proposed.metadata->'extra_to','[]')<>'[]'::jsonb or coalesce(proposed.metadata->'attachments','[]')<>'[]'::jsonb
  or coalesce(proposed.metadata->>'test','false')<>'false' or proposed.metadata ? 'campaign_dispatch_token' or proposed.metadata ? 'campaign_first_dispatch_at' or coalesce(proposed.metadata->>'campaign_payload_hash','') !~ '^[a-f0-9]{64}$' or coalesce(proposed.metadata->>'sender_key_fingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'correo_discordante' using errcode='22023';end if;
 if proposed.related_type='opportunity' then
  if not exists(select 1 from public.opportunities o where o.id=proposed.related_id::uuid and o.organization_id=p_org and o.customer_id=r.customer_id and (o.branch_id is null or exists(select 1 from public.branches b where b.id=o.branch_id and b.organization_id=p_org))) then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
  select o.branch_id::integer into opportunity_branch from public.opportunities o where o.id=proposed.related_id::uuid and o.organization_id=p_org and o.customer_id=r.customer_id for share;
  perform public.fn_crm_red_actor_sucursal(p_org,c.created_by,'crm.campaigns.manage',opportunity_branch);
 elsif proposed.related_type is distinct from 'customer' or proposed.related_id is distinct from r.customer_id::text then raise exception 'relacion_correo_invalida' using errcode='22023';end if;
 -- El bloqueo del contacto serializa la publicación incluso si el worker perdió la respuesta.
 select * into m from public.email_messages where organization_id=p_org and metadata->>'client_request_id'=client_key order by created_at,id limit 1 for update;
 if found then
  if m.to_customer_id is distinct from r.customer_id or m.to_email is distinct from proposed.to_email or m.metadata->>'campaign_id' is distinct from p_campaign::text or m.metadata->>'campaign_contact_id' is distinct from p_contact::text then raise exception 'clave_correo_conflictiva' using errcode='P0001';end if;
 else
  insert into public.email_messages(id,organization_id,provider,template_id,to_email,to_customer_id,cc,bcc,from_email,subject,body_html_snapshot,related_type,related_id,sequence_step_run_id,status,scheduled_at,idempotency_key,metadata)
   values(proposed.id,p_org,'resend',proposed.template_id,proposed.to_email,r.customer_id,null,null,proposed.from_email,proposed.subject,proposed.body_html_snapshot,proposed.related_type,proposed.related_id,null,'pending',null,proposed.idempotency_key,proposed.metadata||jsonb_build_object('campaign_batch_no',r.metadata->'batch_no','campaign_prepared_at',t)) returning * into m;
 end if;
 if not exists(select 1 from public.activities where organization_id=p_org and email_message_id=m.id) then
  insert into public.activities(organization_id,activity_type,channel,user_id,notes,related_type,related_id,email_message_id,branch_id,metadata)
  values(p_org,'email','email',c.created_by,'Email a '||m.to_email||': "'||m.subject||'"',m.related_type,m.related_id::uuid,m.id,u.branch_id,jsonb_build_object('subject',m.subject,'to',m.to_email,'from',m.from_email,'status',m.status,'direction','outbound','email_message_id',m.id));
 end if;
 update public.campaign_contacts set metadata=coalesce(metadata,'{}')||jsonb_build_object('email_message_id',m.id,'message_id',m.id,'state','queued','prepared_at',t) where id=p_contact and campaign_id=p_campaign;
 return to_jsonb(m);
end;$$;

create or replace function public.crm_email_campaign_dispatch(p_org integer,p_campaign uuid,p_message uuid,p_action text,p_token uuid default null,p_provider_id text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.campaigns; r public.campaign_contacts; m public.email_messages; u public.customers; t timestamptz:=clock_timestamp(); token uuid; first_at timestamptz; lock_at timestamptz; reason text; next_state text; counts jsonb; opportunity_branch integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'servicio_requerido' using errcode='42501';end if;
 perform public.fn_assert_acceso_org(p_org);
 if p_action is null or p_action not in('begin','sent','failed','blocked') or length(coalesce(p_error,''))>1000 or length(coalesce(p_provider_id,''))>500 then raise exception 'recibo_invalido' using errcode='22023';end if;
 select * into c from public.campaigns where organization_id=p_org and id=p_campaign and channel='email' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 -- Orden constante campaign -> contact -> message en las cuatro RPC.
 select * into r from public.campaign_contacts where campaign_id=p_campaign and metadata->>'email_message_id'=p_message::text for update;
 if not found then raise exception 'contacto_correo_no_encontrado' using errcode='P0002';end if;
 select * into m from public.email_messages where organization_id=p_org and id=p_message and to_customer_id=r.customer_id and metadata->>'campaign_id'=p_campaign::text and metadata->>'campaign_contact_id'=r.id::text for update;
 if not found or m.idempotency_key is distinct from 'email/'||p_message::text or m.metadata->>'client_request_id' is distinct from 'campaign:'||p_campaign::text||':'||r.customer_id::text then raise exception 'vinculo_correo_invalido' using errcode='P0001';end if;
 token:=nullif(m.metadata->>'campaign_dispatch_token','')::uuid;
 first_at:=nullif(m.metadata->>'campaign_first_dispatch_at','')::timestamptz;
 lock_at:=nullif(m.metadata->>'campaign_dispatch_locked_until','')::timestamptz;
 if p_action='blocked' then
  if p_error is null or p_error not in('email_sender_unavailable','email_sender_changed','email_payload_changed','email_idempotency_conflict') then raise exception 'bloqueo_invalido' using errcode='22023';end if;
  if m.provider_message_id is not null then return jsonb_build_object('applied',false,'reason','already_sent','message',to_jsonb(m));end if;
  if c.status in('sending','scheduled') and nullif(c.statistics->>'state','') is null then
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason',p_error,'paused_at',t) where id=p_campaign and organization_id=p_org;
  end if;
  return jsonb_build_object('applied',true,'reason',p_error,'message',to_jsonb(m));
 end if;
 if p_action='begin' then
  if m.provider_message_id is not null then return jsonb_build_object('allowed',false,'reason','already_sent','message',to_jsonb(m));end if;
  begin
   perform public.fn_crm_exigir_permiso_actor(p_org,c.created_by,'crm.campaigns.manage');
  exception when insufficient_privilege then reason:='actor_permission_changed';end;
  if reason is not null then null;
  elsif first_at is not null and first_at<=t-interval '23 hours' then reason:='email_reconciliation_required';
  elsif c.status<>'sending' or nullif(c.statistics->>'state','') is not null or nullif(c.statistics->>'archived_at','') is not null or c.scheduled_at>t then return jsonb_build_object('allowed',false,'reason','inactive','message',to_jsonb(m));
  elsif m.status<>'pending' or coalesce(r.state,r.metadata->>'state','pending') not in('pending','queued') then return jsonb_build_object('allowed',false,'reason','terminal','message',to_jsonb(m));
  elsif lock_at>t then return jsonb_build_object('allowed',false,'reason','in_flight','message',to_jsonb(m));
  elsif public.crm_campaign_compliance_snapshot(p_org,p_campaign)->>'allowed' is distinct from 'true' then reason:='compliance_required';
  else
   select * into u from public.customers where id=r.customer_id and organization_id=p_org for share;
   if not found or u.status='merged' or m.to_email is distinct from lower(trim(u.email)) or m.to_email is distinct from lower(trim(r.metadata->>'recipient')) or (u.branch_id is not null and not exists(select 1 from public.branches b where b.id=u.branch_id and b.organization_id=p_org)) then reason:='email_recipient_changed';
   elsif not public.fn_can_contact(p_org,r.customer_id,'email',coalesce(c.statistics->>'purpose','utility')) then reason:='email_consent_changed';end if;
   if reason is null then
    begin
     perform public.fn_crm_red_actor_sucursal(p_org,c.created_by,'crm.campaigns.manage',u.branch_id);
     if m.related_type='opportunity' then
      select o.branch_id::integer into opportunity_branch from public.opportunities o where o.id=m.related_id::uuid and o.organization_id=p_org and o.customer_id=r.customer_id for share;
      if not found then reason:='email_opportunity_changed';else perform public.fn_crm_red_actor_sucursal(p_org,c.created_by,'crm.campaigns.manage',opportunity_branch);end if;
     elsif m.related_type is distinct from 'customer' or m.related_id is distinct from r.customer_id::text then reason:='email_relation_changed';end if;
    exception when insufficient_privilege then reason:='actor_branch_permission_changed';end;
   end if;
  end if;
  if reason is not null then
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason',reason,'paused_at',t) where id=p_campaign and organization_id=p_org;
   return jsonb_build_object('allowed',false,'reason',reason,'message',to_jsonb(m));
  end if;
  token:=coalesce(token,gen_random_uuid());
  update public.email_messages set metadata=metadata||jsonb_build_object('campaign_dispatch_token',token,'campaign_first_dispatch_at',coalesce(first_at,t),'campaign_dispatch_locked_until',t+interval '15 minutes','campaign_dispatch_state','processing'),updated_at=t where id=p_message and organization_id=p_org returning * into m;
  return jsonb_build_object('allowed',true,'token',token,'message',to_jsonb(m));
 end if;
 if token is null or p_token is distinct from token or first_at is null then return jsonb_build_object('applied',false,'reason','stale_receipt','message',to_jsonb(m));end if;
 if p_action='sent' then
  if nullif(trim(p_provider_id),'') is null then raise exception 'proveedor_sin_recibo' using errcode='22023';end if;
  if m.provider_message_id is not null and m.provider_message_id is distinct from p_provider_id then raise exception 'recibo_proveedor_conflictivo' using errcode='P0001';end if;
  -- Confirmación tardía: persiste incluso tras pausa/cancelación; nunca retrocede eventos.
  update public.email_messages set provider_message_id=p_provider_id,status=case when status='pending' then 'sent' else status end,sent_at=coalesce(sent_at,t),metadata=metadata||jsonb_build_object('campaign_dispatch_state','sent','campaign_dispatch_locked_until',null,'campaign_confirmed_at',coalesce(metadata->'campaign_confirmed_at',to_jsonb(t))),updated_at=t where id=p_message and organization_id=p_org returning * into m;
  next_state:=case when m.status in('opened','clicked','delivered','bounced') then m.status when m.status in('complained','unsubscribed') then 'sent' else 'sent' end;
  update public.campaign_contacts set sent_at=coalesce(sent_at,m.sent_at),state=case when state in('opened','clicked','delivered','read','replied','bounced') then state else next_state end,metadata=coalesce(metadata,'{}')||jsonb_build_object('state',case when state in('opened','clicked','delivered','read','replied','bounced') then state else next_state end,'provider_message_id',p_provider_id,'claim_token',null)
   where id=r.id and campaign_id=p_campaign;
 else
  if m.provider_message_id is not null or m.status<>'pending' then return jsonb_build_object('applied',false,'reason','already_terminal','message',to_jsonb(m));end if;
  update public.email_messages set status='failed',metadata=metadata||jsonb_build_object('campaign_dispatch_state','failed','campaign_dispatch_locked_until',null,'last_error',left(coalesce(p_error,'provider_failed'),500),'failed_at',t),updated_at=t where id=p_message and organization_id=p_org returning * into m;
  update public.campaign_contacts set state='failed',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','failed','error_code','EMAIL_PROVIDER_FAILED','error_message',left(coalesce(p_error,'provider_failed'),500),'claim_token',null) where id=r.id and campaign_id=p_campaign;
 end if;
 update public.activities set metadata=coalesce(metadata,'{}')||jsonb_build_object('status',m.status),updated_at=t where organization_id=p_org and email_message_id=m.id;
 counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',counts,'pending',(counts->>'pending')::integer+(counts->>'queued')::integer) where id=p_campaign and organization_id=p_org;
 return jsonb_build_object('applied',true,'message',to_jsonb(m));
end;$$;

create or replace function public.crm_email_campaign_batch_progress(p_org integer,p_campaign uuid,p_batch integer,p_not_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.campaigns; r public.campaign_contacts; m public.email_messages; t timestamptz:=clock_timestamp(); counts jsonb; remaining integer; next_batch integer; at_time timestamptz; wait_at timestamptz; first_at timestamptz; lock_at timestamptz; state_text text; reason text; job uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'servicio_requerido' using errcode='42501';end if;
 perform public.fn_assert_acceso_org(p_org);
 if p_batch is null or p_batch<1 then raise exception 'lote_invalido' using errcode='22023';end if;
 select * into c from public.campaigns where organization_id=p_org and id=p_campaign and channel='email' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 -- Los recibos terminales idénticos no se bloquean ni reescriben en cada lote.
 -- El LEFT JOIN conserva enlaces inválidos para pausarlos; la fila del correo
 -- se bloquea dentro del bucle, después del contacto, siguiendo campaña→contacto→correo.
 for r in
  select cc.* from public.campaign_contacts cc
  left join public.email_messages e on e.organization_id=p_org
   and e.id=nullif(cc.metadata->>'email_message_id','')::uuid and e.to_customer_id=cc.customer_id
   and e.metadata->>'campaign_id'=p_campaign::text and e.metadata->>'campaign_contact_id'=cc.id::text
  cross join lateral(select case when e.status in('opened','clicked','delivered','bounced','failed') then e.status when e.status in('complained','unsubscribed') then case when e.provider_message_id is null then 'skipped' else 'sent' end else 'sent' end as email_state) s
  cross join lateral(select case when cc.state in('replied','read','opened','clicked','bounced') and s.email_state in('sent','delivered','opened') then cc.state else s.email_state end as contact_state) target
  where cc.campaign_id=p_campaign and nullif(cc.metadata->>'email_message_id','') is not null
   and (e.id is null or (e.status='pending' and e.provider_message_id is null)
    or cc.state is distinct from target.contact_state
    or cc.metadata->>'state' is distinct from target.contact_state
    or cc.metadata->>'provider_message_id' is distinct from e.provider_message_id
    or (cc.sent_at is null and e.sent_at is not null)
    or nullif(cc.metadata->>'claim_token','') is not null)
  order by cc.id for update of cc
 loop
  select * into m from public.email_messages where organization_id=p_org and id=(r.metadata->>'email_message_id')::uuid and to_customer_id=r.customer_id and metadata->>'campaign_id'=p_campaign::text and metadata->>'campaign_contact_id'=r.id::text for update;
  if not found then reason:='email_link_reconciliation_required';exit;end if;
  if m.provider_message_id is not null or m.status<>'pending' then
   state_text:=case when m.status in('opened','clicked','delivered','bounced','failed') then m.status when m.status in('complained','unsubscribed') then case when m.provider_message_id is null then 'skipped' else 'sent' end else 'sent' end;
   state_text:=case when r.state in('replied','read','opened','clicked','bounced') and state_text in('sent','delivered','opened') then r.state else state_text end;
   update public.campaign_contacts set state=state_text,
    sent_at=coalesce(sent_at,m.sent_at),metadata=coalesce(metadata,'{}')||jsonb_build_object('state',state_text,'provider_message_id',m.provider_message_id,'claim_token',null)
    where id=r.id and (state is distinct from state_text or metadata->>'state' is distinct from state_text
     or metadata->>'provider_message_id' is distinct from m.provider_message_id or (sent_at is null and m.sent_at is not null)
     or nullif(metadata->>'claim_token','') is not null);
  else
   first_at:=nullif(m.metadata->>'campaign_first_dispatch_at','')::timestamptz;
   lock_at:=nullif(m.metadata->>'campaign_dispatch_locked_until','')::timestamptz;
   if first_at is not null and first_at<=t-interval '23 hours' then reason:='email_reconciliation_required';exit;end if;
   if lock_at is not null then wait_at:=least(wait_at,greatest(lock_at,t+interval '5 seconds'));end if;
  end if;
 end loop;
 counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 remaining:=(counts->>'pending')::integer+(counts->>'queued')::integer;
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',counts,'pending',remaining) where id=p_campaign and organization_id=p_org returning * into c;
 if reason is not null then
  update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason',reason,'paused_at',t) where id=p_campaign and organization_id=p_org;
  return jsonb_build_object('finished',false,'reason','paused_'||reason,'counts',counts);
 end if;
 if c.status not in('sending','scheduled') or nullif(c.statistics->>'state','') is not null or nullif(c.statistics->>'archived_at','') is not null then return jsonb_build_object('finished',true,'reason','status_'||coalesce(nullif(c.statistics->>'state',''),c.status),'counts',counts);end if;
 if remaining=0 then
  -- Un contacto cancelado puede conservar un recibo incierto. No declarar éxito sin resultado.
  if exists(select 1 from public.email_messages e where e.organization_id=p_org and e.metadata->>'campaign_id'=p_campaign::text and e.metadata->>'campaign_dispatch_state'='processing' and e.provider_message_id is null) then
   update public.campaigns set statistics=statistics||jsonb_build_object('state','paused','pause_reason','email_reconciliation_required','paused_at',t) where id=p_campaign and organization_id=p_org;
   return jsonb_build_object('finished',false,'reason','paused_email_reconciliation_required','counts',counts);
  end if;
  update public.campaigns set status='sent',statistics=statistics||jsonb_build_object('finished_at',t,'next_batch_no',p_batch+1) where id=p_campaign and organization_id=p_org;
  return jsonb_build_object('finished',true,'reason','completed','counts',counts);
 end if;
 select least(wait_at,min(public.crm_campaign_contact_ready_at(coalesce(cc.state,cc.metadata->>'state','pending'),cc.metadata))) into wait_at from public.campaign_contacts cc where cc.campaign_id=p_campaign and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued') and nullif(cc.metadata->>'email_message_id','') is null;
 if wait_at='infinity' then
  update public.campaigns set statistics=statistics||jsonb_build_object('state','paused','pause_reason','invalid_retry_metadata','paused_at',t) where id=p_campaign and organization_id=p_org;
  return jsonb_build_object('finished',false,'reason','paused_invalid_retry_metadata','counts',counts);
 end if;
 at_time:=greatest(t+interval '5 seconds',coalesce(p_not_before,t),coalesce(c.scheduled_at,t),coalesce(wait_at,t+interval '30 seconds'));
 next_batch:=greatest(p_batch+1,case when c.statistics->>'next_batch_no'~'^[0-9]{1,8}$' then (c.statistics->>'next_batch_no')::integer else 1 end);
 job:=public.fn_enqueue_job(p_org,'campaign_batch',jsonb_build_object('campaign_id',p_campaign,'batch_no',next_batch),at_time,'campaign_batch:'||p_campaign::text||':'||next_batch::text,50);
 update public.campaigns set statistics=statistics||jsonb_build_object('next_batch_no',next_batch) where id=p_campaign and organization_id=p_org;
 return jsonb_build_object('finished',false,'counts',counts,'next_batch_no',next_batch,'run_at',at_time,'job_id',job);
end;$$;

revoke all on function public.crm_claim_email_campaign_batch(integer,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.crm_prepare_email_campaign_contact(integer,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.crm_email_campaign_dispatch(integer,uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.crm_email_campaign_batch_progress(integer,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_claim_email_campaign_batch(integer,uuid,integer,integer) to service_role;
grant execute on function public.crm_prepare_email_campaign_contact(integer,uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.crm_email_campaign_dispatch(integer,uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.crm_email_campaign_batch_progress(integer,uuid,integer,timestamptz) to service_role;
