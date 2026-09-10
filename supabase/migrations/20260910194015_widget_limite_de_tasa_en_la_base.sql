-- Limite de tasa aplicado en la base, no en la Edge Function.
--
-- Por que aqui: cubre CUALQUIER camino que inserte un mensaje del widget, no
-- solo el que pasa por `chat-widget`, y no obliga a redesplegar esa funcion
-- mientras hay clientes usandola.
--
-- Por que no se valida `Origin`: es una cabecera que cualquier script fija con
-- una linea de curl. Solo frena abuso desde un navegador en otro sitio, no un
-- bucle automatizado, que es la amenaza real. Se anadira cuando toque tocar
-- `chat-widget` por otro motivo.
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
  -- Solo mensajes entrantes de cliente que vengan del widget publico.
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
    return NEW;  -- sin sesion identificable no se puede contar
  end if;

  select coalesce(s.metadata->>'widget_limite_por_hora', '30')::integer
    into v_limite
    from ai_settings s
   where s.organization_id = NEW.organization_id;

  -- 0 = sin limite, para poder desactivarlo por organizacion sin migrar nada.
  v_limite := coalesce(v_limite, 30);
  if v_limite <= 0 then
    return NEW;
  end if;

  begin
    v_cabe := public.widget_registrar_uso(NEW.channel_id, v_sesion, v_limite);
  exception when others then
    -- Si el contador falla, se deja pasar: cortar el chat de un cliente
    -- legitimo por un fallo de telemetria es peor que el abuso que evita.
    return NEW;
  end;

  if not v_cabe then
    raise exception 'WIDGET_RATE_LIMIT: la sesion supero % mensajes en una hora', v_limite
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists trg_widget_limite_de_tasa on public.messages;
create trigger trg_widget_limite_de_tasa
  before insert on public.messages
  for each row
  execute function public.fn_widget_limite_de_tasa();

comment on function public.fn_widget_limite_de_tasa() is
  'Corta bucles automatizados en el widget publico: 30 mensajes por sesion y hora (configurable en ai_settings.metadata.widget_limite_por_hora; 0 lo desactiva). Trafico real: mediana 3 por conversacion, p99 = 32.';
