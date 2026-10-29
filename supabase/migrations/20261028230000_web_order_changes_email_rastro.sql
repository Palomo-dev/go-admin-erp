-- Rastro del envío del link de pago por correo en los cambios de pedidos web.
-- Columnas nuevas (sin tocar grants de la tabla) y una función atómica que guarda el rastro,
-- suma el contador, agrega la nota interna del pedido y deja el registro en ops_audit_log.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.web_order_changes
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_sent_count integer not null default 0,
  add column if not exists email_message_id text,
  add column if not exists email_sent_to_masked text;

comment on column public.web_order_changes.email_sent_at is 'Último envío del link de pago por correo.';
comment on column public.web_order_changes.email_sent_count is 'Veces que se envió el link por correo.';
comment on column public.web_order_changes.email_message_id is 'Id del último correo en el proveedor (Resend).';
comment on column public.web_order_changes.email_sent_to_masked is 'Destinatario enmascarado (l***@dominio.com).';

create or replace function public.fn_web_order_change_registrar_correo(
  p_change_id uuid,
  p_organization_id bigint,
  p_message_id text,
  p_to_masked text,
  p_user uuid default null,
  p_from_domain text default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c public.web_order_changes%rowtype;
  v_tz text := coalesce(nullif(p_timezone, ''), 'UTC');
  v_nota text;
begin
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;
  update public.web_order_changes
     set email_sent_at = now(),
         email_sent_count = coalesce(email_sent_count, 0) + 1,
         email_message_id = p_message_id,
         email_sent_to_masked = p_to_masked,
         updated_at = now()
   where id = p_change_id and organization_id = p_organization_id
  returning * into v_c;
  if not found then raise exception 'CAMBIO_NO_ENCONTRADO' using errcode = 'P0002'; end if;

  v_nota := format('[CORREO CAMBIO %s] Link de pago del cambio %s enviado a %s%s.',
                   to_char(now() at time zone v_tz, 'YYYY-MM-DD HH24:MI'), left(v_c.id::text, 8), p_to_masked,
                   case when v_c.email_sent_count > 1 then format(' (envío %s)', v_c.email_sent_count) else '' end);
  update public.web_orders
     set internal_notes = concat_ws(E'\n', nullif(coalesce(internal_notes, ''), ''), v_nota), updated_at = now()
   where id = v_c.web_order_id and organization_id = p_organization_id;

  insert into public.ops_audit_log (organization_id, branch_id, user_id, entity_type, entity_id, action, metadata)
  values (v_c.organization_id, v_c.branch_id, p_user, 'web_orders', v_c.web_order_id::text, 'WEB_ORDER_CHANGE_EMAIL_SENT',
          jsonb_build_object('change_id', v_c.id, 'to_masked', p_to_masked, 'message_id', p_message_id,
                             'from_domain', p_from_domain, 'count', v_c.email_sent_count));

  return jsonb_build_object('ok', true, 'email_sent_at', v_c.email_sent_at, 'email_sent_count', v_c.email_sent_count,
                            'email_message_id', v_c.email_message_id, 'email_sent_to_masked', v_c.email_sent_to_masked);
end;
$function$;

revoke all on function public.fn_web_order_change_registrar_correo(uuid, bigint, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_web_order_change_registrar_correo(uuid, bigint, text, text, uuid, text, text) to service_role;
