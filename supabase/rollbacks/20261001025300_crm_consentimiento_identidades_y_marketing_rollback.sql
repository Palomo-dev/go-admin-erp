-- Restaura el predicado anterior. No elimina consentimientos ni fusiones.
-- Esta reversión vuelve a permitir marketing de WhatsApp sin opt-in explícito.
CREATE OR REPLACE FUNCTION public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text DEFAULT 'utility'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_channel text := lower(btrim(p_channel));
  v_meta    jsonb;
  v_dnc     boolean;
  v_consent text;
  v_flag    text;
begin
  -- fail-closed: canal desconocido o NULL => no contactar (normalizado: 'EMAIL' == 'email')
  if v_channel is null or v_channel not in ('email','whatsapp','sms','voice') then return false; end if;

  -- F0-DB r3 (QA problema 5): con sesión de usuario la organización deja de ser
  -- un parámetro en el que confiar. service_role / postgres no pasan por aquí.
  if auth.role() = 'authenticated' and not exists (
    select 1 from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.organization_id = p_org
       and om.is_active = true
  ) then
    return false;
  end if;

  -- p_purpose se ignora explicitamente en F0 (reservado para reglas marketing/utility/transactional)
  select metadata, do_not_call into v_meta, v_dnc
    from public.customers where id = p_customer and organization_id = p_org;
  if not found then return false; end if;

  -- F6: columna real de "no llamar" (solo aplica al canal de voz)
  if v_channel = 'voice' and coalesce(v_dnc, false) then return false; end if;

  select status into v_consent from public.contact_consents
   where organization_id = p_org and customer_id = p_customer and channel = v_channel;
  if v_consent = 'opted_out' then return false; end if;

  v_flag := case v_channel
              when 'email'    then 'do_not_email'
              when 'whatsapp' then 'do_not_whatsapp'
              when 'sms'      then 'do_not_sms'
              when 'voice'    then 'do_not_call'
              else null end;
  if v_flag is not null and coalesce(v_meta ->> v_flag, 'false') in ('true','1') then return false; end if;
  return true;
end $function$

revoke all on function public.fn_can_contact(integer,uuid,text,text) from public,anon;
grant execute on function public.fn_can_contact(integer,uuid,text,text) to authenticated,service_role;
comment on function public.fn_can_contact(integer,uuid,text,text) is 'Puerta única de contacto (F0). Fail-closed. p_channel se normaliza con lower(trim). Con rol authenticated exige pertenencia activa a p_org (no es oráculo entre organizaciones); service_role pasa. p_purpose reservado. SUPUESTO: la guarda de pertenencia depende de request.jwt.claims (auth.role()), no del rol de sesión: una conexión con rol authenticated sin JWT no pasa por ella. Válido bajo PostgREST/Supabase, donde los claims siempre viajan; no aplica a conexiones sin claims (service_role, pg_cron, sesión directa).';
