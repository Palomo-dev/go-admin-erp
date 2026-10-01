-- Reservas internas, trazables y reembolsables una sola vez. No descuenta al consumir.
set lock_timeout='2s';
create table if not exists public.crm_whatsapp_credit_reservations(
 id uuid primary key default gen_random_uuid(),organization_id integer not null references public.organizations(id) on delete cascade,
 idempotency_key text not null,campaign_id uuid references public.campaigns(id) on delete set null,
 contact_id uuid unique references public.campaign_contacts(id) on delete set null,
 message_id uuid unique references public.messages(id) on delete set null,
 state text not null default 'reserved' check(state in('reserved','consumed','refunded')),
 units integer not null default 1 check(units=1),debited boolean not null,
 created_at timestamptz not null default now(),settled_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,metadata jsonb not null default '{}',
 unique(organization_id,idempotency_key)
);
alter table public.crm_whatsapp_credit_reservations enable row level security;
create index if not exists crm_wa_reservations_campaign_idx on public.crm_whatsapp_credit_reservations(campaign_id);
create index if not exists crm_wa_reservations_actor_idx on public.crm_whatsapp_credit_reservations(created_by);
create index if not exists crm_wa_reservations_org_state_idx on public.crm_whatsapp_credit_reservations(organization_id,state);
revoke all on public.crm_whatsapp_credit_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.crm_whatsapp_credit_reservations to service_role;
-- Política de pertenencia preparada para lecturas futuras; el navegador no tiene GRANT.
drop policy if exists crm_wa_reservations_own_read on public.crm_whatsapp_credit_reservations;
create policy crm_wa_reservations_own_read on public.crm_whatsapp_credit_reservations for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_whatsapp_credit_reservations.organization_id and m.user_id=(select auth.uid()) and m.is_active));

create or replace function public.crm_lock_comm_wallet(p_org integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 if p_org is null then raise exception 'organizacion_invalida' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(18002300,p_org);
end;$function$;
revoke all on function public.crm_lock_comm_wallet(integer) from public,anon,authenticated;
grant execute on function public.crm_lock_comm_wallet(integer) to service_role;

create or replace function public.crm_reserve_whatsapp_credit(p_org integer,p_key text,p_campaign uuid default null,p_contact uuid default null,p_actor uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_whatsapp_credit_reservations;v_balance integer;v_id uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_key is null or length(p_key) not between 1 and 250 or ((p_campaign is null)<>(p_contact is null)) then
  raise exception 'reserva_invalida' using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 if p_campaign is not null and not exists(select 1 from public.campaigns c join public.campaign_contacts cc on cc.campaign_id=c.id
   join public.customers u on u.id=cc.customer_id and u.organization_id=c.organization_id
   where c.organization_id=p_org and c.channel='whatsapp' and c.id=p_campaign and cc.id=p_contact) then
  raise exception 'contacto_campana_no_encontrado' using errcode='P0002';end if;
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and idempotency_key=p_key for update;
 if found then
  if v_res.campaign_id is distinct from p_campaign or v_res.contact_id is distinct from p_contact then raise exception 'clave_reserva_conflictiva' using errcode='P0001';end if;
  return v_res.id;
 end if;
 if p_contact is not null and exists(select 1 from public.crm_whatsapp_credit_reservations where contact_id=p_contact) then raise exception 'contacto_ya_reservado' using errcode='P0001';end if;
 select whatsapp_remaining into v_balance from public.comm_settings where organization_id=p_org and is_active for update;
 if not found or not public.deduct_comm_credits(p_org,'whatsapp',1) then raise exception 'creditos_insuficientes' using errcode='P0001';end if;
 insert into public.crm_whatsapp_credit_reservations(organization_id,idempotency_key,campaign_id,contact_id,debited,created_by,metadata)
 values(p_org,p_key,p_campaign,p_contact,v_balance is not null,p_actor,jsonb_build_object('campaign_id',p_campaign,'contact_id',p_contact,'balance_before',v_balance)) returning id into v_id;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.credit_reserved','credit_reservation',v_id,jsonb_build_object('units',1,'balance_before',v_balance,'applied_by',p_actor,'campaign_id',p_campaign,'contact_id',p_contact),'processed',clock_timestamp());
 return v_id;
end;$function$;
revoke all on function public.crm_reserve_whatsapp_credit(integer,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_reserve_whatsapp_credit(integer,text,uuid,uuid,uuid) to service_role;

create or replace function public.crm_consume_whatsapp_credit(p_org integer,p_reservation uuid,p_message uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_whatsapp_credit_reservations;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 if v_res.message_id is distinct from p_message or p_message is null then raise exception 'mensaje_reserva_invalido' using errcode='P0001';end if;
 if v_res.state='consumed' then return false;end if;
 if v_res.state='refunded' then raise exception 'reserva_reembolsada' using errcode='P0001';end if;
 if v_res.metadata->>'dispatch_confirmed' is distinct from 'true' then raise exception 'entrega_no_confirmada' using errcode='P0001';end if;
 if not exists(select 1 from public.messages m where m.organization_id=p_org and m.id=p_message and m.external_message_id is not null
   and m.metadata->>'credit_reservation_id'=p_reservation::text and m.metadata->>'dispatched'='true') then
  raise exception 'entrega_no_confirmada' using errcode='P0001';end if;
 update public.crm_whatsapp_credit_reservations set state='consumed',settled_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.credit_consumed','credit_reservation',p_reservation,jsonb_build_object('message_id',p_message,'units',1),'processed',clock_timestamp());
 return true;
end;$function$;
revoke all on function public.crm_consume_whatsapp_credit(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_consume_whatsapp_credit(integer,uuid,uuid) to service_role;

create or replace function public.crm_refund_whatsapp_credit(p_org integer,p_reservation uuid,p_reason text,p_actor uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_whatsapp_credit_reservations;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'motivo_invalido' using errcode='22023';end if;
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 if v_res.state='refunded' then return false;end if;
 -- La evidencia financiera vive aquí, no en metadata/eventos editables del mensaje.
 -- El consumidor y la cancelación privados publicarán safe_to_refund en la transacción.
 if (v_res.message_id is not null or v_res.state='consumed' or v_res.metadata->>'message_attached'='true')
   and v_res.metadata->>'safe_to_refund' is distinct from 'true' then
  raise exception 'entrega_pendiente_de_conciliacion' using errcode='P0001';end if;
 if v_res.debited and not public.deduct_comm_credits(p_org,'whatsapp',-1) then raise exception 'reembolso_no_disponible' using errcode='P0001';end if;
 update public.crm_whatsapp_credit_reservations set state='refunded',settled_at=clock_timestamp(),metadata=metadata||jsonb_build_object('refund_reason',btrim(p_reason),'refunded_by',p_actor)
 where organization_id=p_org and id=p_reservation;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.credit_refunded','credit_reservation',p_reservation,jsonb_build_object('units',1,'reason',btrim(p_reason),'applied_by',p_actor,'debited',v_res.debited),'processed',clock_timestamp());
 return true;
end;$function$;
revoke all on function public.crm_refund_whatsapp_credit(integer,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_refund_whatsapp_credit(integer,uuid,text,uuid) to service_role;
