-- Revertir primero el consumidor RPC. No elimina reuniones ni restaura marcas de contacto.
DROP FUNCTION IF EXISTS public.fn_crm_guardar_reunion(integer,uuid,jsonb);
DROP TRIGGER IF EXISTS trg_activities_contacto_actualizado ON public.activities;
CREATE OR REPLACE FUNCTION public.fn_activities_ultimo_contacto_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_customer uuid;
  v_at timestamptz := coalesce(new.occurred_at, new.created_at, now());
begin
  if new.activity_type not in ('call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'ai_call') then
    return new;
  end if;
  if new.related_type = 'customer' then
    v_customer := new.related_id;
  elsif new.related_type = 'opportunity' then
    select o.customer_id into v_customer
      from public.opportunities o
     where o.id = new.related_id and o.organization_id = new.organization_id;
  end if;
  if v_customer is null then
    return new;
  end if;
  -- Nunca hacia atrás, nunca otro inquilino.
  update public.customers c
     set last_contact_at = v_at
   where c.id = v_customer
     and c.organization_id = new.organization_id
     and (c.last_contact_at is null or c.last_contact_at < v_at);
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.fn_activities_ultimo_contacto_cliente() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_activities_ultimo_contacto_cliente() TO service_role;
