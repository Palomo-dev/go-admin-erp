-- Limite por sesion y hora del widget: 100 (decision del usuario).
--
-- Que cuenta: solo mensajes que teclea un VISITANTE en el widget web
-- (role='customer', direction='inbound', metadata.source='widget'). No cuenta
-- respuestas de la IA, ni mensajes de agentes, ni WhatsApp.
--
-- Unidad: (canal, sessionId del navegador, hora de reloj). Cada visitante tiene
-- su propio contador; no se comparte entre visitantes ni entre organizaciones.
--
-- Medicion sobre 8.172 pares sesion/hora reales de 120 dias:
--   media 4,3 · p99 = 20 · p99,9 = 39,6 · maximo = 56
-- Con 100 hay 1,8x de margen sobre el maximo historico y cero sesiones
-- historicas afectadas.
create or replace function public.fn_widget_limite_de_tasa()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_sesion text;
  v_cabe   boolean;
  v_limite integer;
begin
  if NEW.role <> 'customer'
     or NEW.direction <> 'inbound'
     or coalesce(NEW.metadata->>'source', '') <> 'widget' then
    return NEW;
  end if;

  select conv.metadata->>'sessionId'
    into v_sesion
    from conversations conv
   where conv.id = NEW.conversation_id;

  if v_sesion is null or v_sesion = '' then
    return NEW;
  end if;

  select coalesce(s.metadata->>'widget_limite_por_hora', '100')::integer
    into v_limite
    from ai_settings s
   where s.organization_id = NEW.organization_id;

  v_limite := coalesce(v_limite, 100);
  if v_limite <= 0 then
    return NEW;  -- 0 = sin limite, por organizacion
  end if;

  begin
    v_cabe := public.widget_registrar_uso(NEW.channel_id, v_sesion, v_limite);
  exception when others then
    return NEW;  -- si el contador falla, se deja pasar
  end;

  if not v_cabe then
    raise exception 'WIDGET_RATE_LIMIT: la sesion supero % mensajes en una hora', v_limite
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$fn$;

comment on function public.fn_widget_limite_de_tasa() is
  'Corta bucles automatizados en el widget publico: 100 mensajes por visitante (sessionId) y hora de reloj. Configurable en ai_settings.metadata.widget_limite_por_hora; 0 lo desactiva. Maximo real medido: 56.';
