-- Reversión aditiva: conserva las funciones nuevas sin exposición al cliente.
CREATE OR REPLACE FUNCTION public.fn_contactos_efectivos_semana(p_org integer, p_customer uuid, p_desde timestamp with time zone, p_hasta timestamp with time zone)
 RETURNS TABLE(canal text, contactos integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Voz: llamadas salientes CONTESTADAS por una persona (humanas o del agente).
  select 'voice'::text, count(*)::integer
    from public.calls c
   where c.organization_id = p_org
     and c.customer_id = p_customer
     and c.direction = 'outbound'
     and c.answered_at is not null
     and c.answered_at >= p_desde and c.answered_at < p_hasta
     and c.status in ('in_progress', 'completed')
     and coalesce(c.answered_by, 'human') not like 'machine%'
     and coalesce(c.answered_by, '') <> 'fax'
  union all
  -- Correo: enviados (los fallidos o rebotados no llegaron).
  select 'email'::text, count(*)::integer
    from public.email_messages e
   where e.organization_id = p_org
     and e.to_customer_id = p_customer
     and e.sent_at >= p_desde and e.sent_at < p_hasta
     and e.status in ('sent', 'delivered', 'opened', 'clicked')
  union all
  -- Mensajería: mensajes salientes que inicia la empresa. Una respuesta dentro
  -- de las 24 h siguientes a un mensaje del cliente no es un contacto nuevo:
  -- la conversación la abrió él. Un contacto por conversación y día.
  select case when ch.type = 'whatsapp' then 'whatsapp' else 'mensajeria' end,
         count(distinct (m.conversation_id, floor(extract(epoch from (m.created_at - p_desde)) / 86400)))::integer
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id and cv.organization_id = p_org
    left join public.channels ch on ch.id = cv.channel_id
   where m.organization_id = p_org
     and cv.customer_id = p_customer
     and m.direction = 'outbound'
     and m.created_at >= p_desde and m.created_at < p_hasta
     and not exists (
       select 1 from public.messages mi
        where mi.conversation_id = m.conversation_id
          and mi.direction = 'inbound'
          and mi.created_at <= m.created_at
          and mi.created_at > m.created_at - interval '24 hours'
     )
   group by 1
$function$
;
revoke execute on function public.crm_voice_campaign_detail(integer,uuid,integer) from authenticated;

