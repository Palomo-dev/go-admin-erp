-- Reversion de 20260910202235_widget_limite_por_hora_a_100_definitivo
--
-- Devuelve el limite del widget a 30 mensajes por sesion y hora.
--
-- OJO: 30 es demasiado estrecho. Medido sobre 8.172 pares sesion/hora reales de
-- 120 dias (media 4,3 · p99 = 20 · p99,9 = 39,6 · maximo = 56), con 30 se
-- habrian cortado 19 sesiones de clientes legitimos. Con 100 se cortan cero.
--
-- Si lo que quieres es quitar el limite, no revi ertas: ponlo en 0 por
-- organizacion, que es reversible y no toca codigo:
--   update ai_settings
--      set metadata = jsonb_set(coalesce(metadata,'{}'), '{widget_limite_por_hora}', '0')
--    where organization_id = <id>;

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

  select coalesce(s.metadata->>'widget_limite_por_hora', '30')::integer
    into v_limite
    from ai_settings s
   where s.organization_id = NEW.organization_id;

  v_limite := coalesce(v_limite, 30);
  if v_limite <= 0 then
    return NEW;
  end if;

  begin
    v_cabe := public.widget_registrar_uso(NEW.channel_id, v_sesion, v_limite);
  exception when others then
    return NEW;
  end;

  if not v_cabe then
    raise exception 'WIDGET_RATE_LIMIT: la sesion supero % mensajes en una hora', v_limite
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$fn$;
