-- GO-pos · Correo al equipo cuando se paga un pedido online (encargo 2026-11-25, Figma «05 POS y
-- ventas» 3326-211186, versión minimalista).
--
-- El disparador deja un aviso pendiente en `member_notices` por cada dueño o administrador (resuelto
-- por PERMISO con fn_avisos_miembro_destinatarios(org, 'admin.full_access'), el mismo resolvedor de
-- los demás avisos al equipo). El correo lo manda el despacho de avisos (cron cada 5 min,
-- src/lib/services/avisos/despachoAvisos.ts) con la marca GO Admin; nunca el webhook de la pasarela.
--
-- Eventos (uno por pedido, evento y persona: la llave de idempotencia no deja duplicar si el
-- webhook llega dos veces):
--   pedido.pago.linea          pago completo en línea (pasarela).
--   pedido.pago.contraentrega  pedido contraentrega sin anticipo: se cobra todo al recibir.
--   pedido.pago.anticipo       anticipo de contraentrega pagado a tiempo.
--   pedido.pago.anticipo_tarde anticipo pagado con el pedido vencido (el despacho mira si la base
--                              lo reactivó o quedó para revisar: fn_web_order_anticipo_tardio).
--   pedido.pago.devolucion     devolución del pago o del anticipo (payment_status → refunded).
-- Rechazos y pagos fallidos NO dejan aviso.
--
-- La campana no cambia: el aviso nace descartado (dismissed_at) porque la campana ya tiene su
-- «Nuevo pedido web» y los avisos del anticipo (notifications). Este aviso es solo para el correo.

ALTER TABLE public.member_notices DROP CONSTRAINT IF EXISTS member_notices_event_check;
ALTER TABLE public.member_notices ADD CONSTRAINT member_notices_event_check
  CHECK (event = ANY (ARRAY[
    'tarea.asignada'::text, 'oportunidad.asignada'::text, 'oportunidad.etapa'::text, 'tarea.completada'::text,
    'tarea.atrasada'::text, 'tarea.vence'::text, 'oportunidad.vence'::text, 'oportunidad.atrasada'::text,
    'oportunidad.ganada'::text, 'oportunidad.perdida'::text, 'oportunidad.contacto'::text, 'caja.diferencia'::text,
    'cartera.resumen'::text, 'inventario.cero'::text, 'inventario.bajo'::text, 'transporte.documento.vence'::text,
    'pedido.pago.linea'::text, 'pedido.pago.contraentrega'::text, 'pedido.pago.anticipo'::text,
    'pedido.pago.anticipo_tarde'::text, 'pedido.pago.devolucion'::text]));

ALTER TABLE public.member_notices DROP CONSTRAINT IF EXISTS member_notices_entity_check;
ALTER TABLE public.member_notices ADD CONSTRAINT member_notices_entity_check
  CHECK (entity_type = ANY (ARRAY['task'::text, 'opportunity'::text, 'cash_session'::text, 'digest'::text,
                                  'stock'::text, 'vehicle_document'::text, 'web_order'::text]));

-- Agrupación por hora (más de 10 pagos en una hora): el despacho cuenta los avisos de pago de la
-- persona en la hora.
CREATE INDEX IF NOT EXISTS member_notices_pago_pedido_idx
  ON public.member_notices (organization_id, recipient_user_id, created_at)
  WHERE event LIKE 'pedido.pago.%';

CREATE OR REPLACE FUNCTION public.fn_avisos_pago_pedido_web()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_evento text;
  v_titulo text;
  v_user uuid;
begin
  if tg_op = 'INSERT' then
    -- Contraentrega sin anticipo (la misma regla de esPedidoContraentrega): domicilio, sin pasarela
    -- y método de efectivo o contraentrega.
    if new.delivery_type in ('delivery_own', 'delivery_third_party')
       and new.table_session_id is null
       and coalesce(new.advance_amount, 0) <= 0
       and coalesce(new.status, '') not in ('cancelled', 'rejected', 'expired', 'refunded')
       and not public.fn_pedido_web_es_pasarela(new.payment_method, new.payment_reference)
       and lower(btrim(coalesce(new.payment_method, ''))) in ('', 'cash', 'efectivo', 'cash_on_delivery', 'contraentrega', 'contra_entrega') then
      v_evento := 'pedido.pago.contraentrega';
    end if;
  else
    if new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded'
       and (old.payment_status in ('paid', 'partial') or old.advance_status = 'paid') then
      v_evento := 'pedido.pago.devolucion';
    elsif new.advance_status = 'paid' and old.advance_status is distinct from 'paid'
          and coalesce(new.advance_amount, 0) > 0 then
      v_evento := case when old.status = 'expired' then 'pedido.pago.anticipo_tarde' else 'pedido.pago.anticipo' end;
    elsif new.payment_status = 'paid' and old.payment_status is distinct from 'paid'
          and new.table_session_id is null
          and public.fn_pedido_web_es_pasarela(new.payment_method, new.payment_reference) then
      v_evento := 'pedido.pago.linea';
    end if;
  end if;

  if v_evento is null then
    return new;
  end if;

  begin
    v_titulo := case v_evento
      when 'pedido.pago.contraentrega' then 'Nuevo pedido contraentrega · '
      when 'pedido.pago.anticipo_tarde' then 'Anticipo pagado tarde · '
      when 'pedido.pago.devolucion' then 'Devolución · '
      else 'Nuevo pago · ' end || coalesce(new.order_number, '');
    for v_user in
      select d.user_id from public.fn_avisos_miembro_destinatarios(new.organization_id, 'admin.full_access') d
    loop
      insert into public.member_notices (
        organization_id, recipient_user_id, event, entity_type, entity_id,
        title, body, href, idempotency_key, dismissed_at
      ) values (
        new.organization_id, v_user, v_evento, 'web_order', new.id,
        v_titulo, 'Pedido online ' || coalesce(new.order_number, ''),
        '/app/pos/pedidos-online/' || new.id::text,
        new.organization_id || ':' || v_evento || ':web_order:' || new.id::text || ':' || v_user::text,
        now()
      )
      on conflict (idempotency_key) do nothing;
    end loop;
  exception when others then
    -- Un aviso nunca tumba el pago.
    raise warning 'fn_avisos_pago_pedido_web: %', sqlerrm;
  end;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_avisos_pago_pedido_web() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_avisos_pago_pedido_web ON public.web_orders;
CREATE TRIGGER trg_avisos_pago_pedido_web
  AFTER INSERT OR UPDATE OF payment_status, advance_status ON public.web_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_avisos_pago_pedido_web();
