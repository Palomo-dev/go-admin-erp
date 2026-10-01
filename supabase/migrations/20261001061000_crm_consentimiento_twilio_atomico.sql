-- Constancia privada: un webhook repetido no deshace una preferencia posterior.
set lock_timeout='2s';
create table if not exists public.crm_provider_consent_receipts(
 id uuid primary key default gen_random_uuid(),organization_id integer not null references public.organizations(id) on delete cascade,
 channel text not null check(channel in('whatsapp','sms')),provider_message_key text not null,
 evidence_hash text not null,targets_count integer not null check(targets_count>0),processed_at timestamptz not null default clock_timestamp(),
 unique(organization_id,channel,provider_message_key)
);
alter table public.crm_provider_consent_receipts enable row level security;
revoke all on public.crm_provider_consent_receipts from public,anon,authenticated;
grant select on public.crm_provider_consent_receipts to service_role;
-- Política de lectura preparada, sin GRANT de navegador; escrituras solo por la RPC privada.
drop policy if exists crm_provider_consent_receipts_own_read on public.crm_provider_consent_receipts;
create policy crm_provider_consent_receipts_own_read on public.crm_provider_consent_receipts for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_provider_consent_receipts.organization_id and m.user_id=(select auth.uid()) and m.is_active));

create or replace function public.crm_record_twilio_contact_consent(p_org integer,p_targets jsonb,p_channel text,p_status text,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_target jsonb;v_customer public.customers;v_key text;v_hash text;v_receipt public.crm_provider_consent_receipts;v_count integer:=0;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_channel is null or p_channel not in('whatsapp','sms') or p_status is null or p_status not in('opted_in','opted_out')
  or jsonb_typeof(p_targets) is distinct from 'array' or jsonb_typeof(p_evidence) is distinct from 'object'
  or octet_length(p_evidence::text)>10000 or octet_length(p_targets::text)>5000000 then raise exception 'consentimiento_invalido' using errcode='22023';end if;
 if jsonb_array_length(p_targets) not between 1 and 50000 then raise exception 'contactos_invalidos' using errcode='22023';end if;
 v_key:=nullif(p_evidence->>'message_sid','');v_hash:=md5(jsonb_build_object('status',p_status,'evidence',p_evidence)::text);
 if length(coalesce(v_key,''))>120 then raise exception 'mensaje_invalido' using errcode='22023';end if;
 if v_key is not null then
  select * into v_receipt from public.crm_provider_consent_receipts where organization_id=p_org and channel=p_channel and provider_message_key=v_key;
  if found then
   if v_receipt.evidence_hash is distinct from v_hash then raise exception 'mensaje_reutilizado' using errcode='P0001';end if;
   return jsonb_build_object('updated',0,'already_applied',true);
  end if;
 end if;
 if exists(select 1 from jsonb_array_elements(p_targets)t where jsonb_typeof(t) is distinct from 'object'
  or t->>'customer_id' is null or jsonb_typeof(t->'expected_phone') is distinct from 'string')
  or (select count(distinct (t->>'customer_id')::uuid) from jsonb_array_elements(p_targets)t)<>jsonb_array_length(p_targets) then
  raise exception 'contactos_invalidos' using errcode='22023';end if;
 -- Prevalidar todos los destinos antes de modificar el primero; CAS del teléfono evita conceder alta a otro número.
 for v_target in select t from jsonb_array_elements(p_targets)t order by t->>'customer_id'
 loop
  select * into v_customer from public.customers where organization_id=p_org and id=(v_target->>'customer_id')::uuid for update;
  if not found then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
  if v_customer.phone is distinct from v_target->>'expected_phone' then raise exception 'telefono_desactualizado' using errcode='P0001';end if;
 end loop;
 for v_target in select t from jsonb_array_elements(p_targets)t order by t->>'customer_id'
 loop
  perform public.crm_set_contact_consent(p_org,(v_target->>'customer_id')::uuid,p_channel,p_status,'inbound_keyword',p_evidence);
  v_count:=v_count+1;
 end loop;
 if v_key is not null then
  insert into public.crm_provider_consent_receipts(organization_id,channel,provider_message_key,evidence_hash,targets_count)
  values(p_org,p_channel,v_key,v_hash,v_count);
 end if;
 return jsonb_build_object('updated',v_count,'already_applied',false);
end;$function$;
revoke all on function public.crm_record_twilio_contact_consent(integer,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_record_twilio_contact_consent(integer,jsonb,text,text,jsonb) to service_role;
