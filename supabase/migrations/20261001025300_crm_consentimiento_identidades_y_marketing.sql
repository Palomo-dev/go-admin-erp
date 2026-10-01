-- Consentimiento canónico: conserva bajas durante una fusión reversible.
create or replace function public.fn_can_contact(
  p_org integer, p_customer uuid, p_channel text, p_purpose text default 'utility'
) returns boolean language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_channel text := lower(btrim(p_channel));
  v_purpose text := lower(btrim(p_purpose));
  v_customer public.customers;
  v_identity public.customers;
  v_ids uuid[];
  v_flag text;
  v_consent text;
  v_changed timestamptz;
begin
  if v_channel is null or v_channel not in ('email','whatsapp','sms','voice')
    or v_purpose is null or v_purpose not in ('utility','marketing','transactional') then return false; end if;
  if auth.role()='authenticated' and not exists (
    select 1 from public.organization_members om where om.organization_id=p_org
      and om.user_id=(select auth.uid()) and om.is_active
  ) then return false; end if;
  select * into v_customer from public.customers where organization_id=p_org and id=p_customer;
  if not found or v_customer.status='merged' then return false; end if;
  v_ids := array[p_customer] || coalesce((
    select array_agg(m.secondary_customer_id) from public.customer_merges m
      join public.customers s on s.id=m.secondary_customer_id and s.organization_id=p_org and s.status='merged'
    where m.organization_id=p_org and m.primary_customer_id=p_customer and m.undone_at is null
  ), array[]::uuid[]);
  v_flag := case v_channel when 'email' then 'do_not_email' when 'whatsapp' then 'do_not_whatsapp'
    when 'sms' then 'do_not_sms' when 'voice' then 'do_not_call' end;
  -- Una baja del cliente fusionado no se pierde al elegir otro dato principal.
  for v_identity in select * from public.customers where organization_id=p_org and id=any(v_ids) loop
    if v_channel='voice' and coalesce(v_identity.do_not_call,false) then return false; end if;
    if lower(coalesce(v_identity.metadata->>v_flag,'false')) in ('true','1') then return false; end if;
  end loop;
  if exists (select 1 from public.contact_consents where organization_id=p_org
    and customer_id=any(v_ids) and channel=v_channel and status='opted_out') then return false; end if;
  if v_channel='whatsapp' and v_purpose='marketing' then
    select status,changed_at into v_consent,v_changed from public.contact_consents
      where organization_id=p_org and customer_id=p_customer and channel=v_channel;
    if v_consent is distinct from 'opted_in' then return false; end if;
    -- Un opt-in anterior para el número original no autoriza el número sustituido.
    if exists (select 1 from public.customer_merges m where m.organization_id=p_org
      and m.primary_customer_id=p_customer and m.undone_at is null
      and m.snapshot->'before'->'primary'->>'phone' is distinct from v_customer.phone
      and (v_changed is null or v_changed<m.merged_at)) then return false; end if;
  end if;
  return true;
end;
$function$;
revoke all on function public.fn_can_contact(integer,uuid,text,text) from public,anon;
grant execute on function public.fn_can_contact(integer,uuid,text,text) to authenticated,service_role;
comment on function public.fn_can_contact(integer,uuid,text,text) is
  'Predicado único por canal: bajas de identidades fusionadas y opt-in explícito para marketing de WhatsApp.';
