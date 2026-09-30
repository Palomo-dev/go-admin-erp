-- Guion del agente Pedro (org 125, GO Admin ERP): quita «facturación electrónica» y «ante la DIAN».
--
-- El sitio público marca Colombia como no integrada con la DIAN; ofrecer facturación
-- electrónica en las llamadas de prospección es publicidad inexacta. Se reemplazan las
-- cuatro frases de 20260930140600 (3 en system_prompt y 1 en first_message) por
-- «facturación». Falla si alguna frase no está, para no dejar el guion a medias.
--
-- Rollback: supabase/rollbacks/20260930200000_voz_pedro_sin_facturacion_electronica_rollback.sql

do $$
declare
  v_id constant uuid := 'c194ab52-8089-422d-b625-1b56f47ba146';
  v_sp text;
  v_fm text;
begin
  select system_prompt, first_message into v_sp, v_fm from public.voice_agents where id = v_id for update;
  if not found then
    raise exception 'voz: agente Pedro no encontrado';
  end if;

  if position('con las ventas, el inventario y la facturación electrónica».' in v_sp) = 0
     or position('¿Cómo llevan hoy las ventas, el inventario y la facturación electrónica: con algún programa' in v_sp) = 0
     or position('el inventario, la facturación electrónica ante la DIAN, las compras' in v_sp) = 0
     or position('a llevar las ventas, el inventario y la facturación electrónica en un solo lugar' in v_fm) = 0 then
    raise exception 'voz: el guion de Pedro no tiene el texto esperado; revisar antes de reemplazar';
  end if;

  update public.voice_agents
     set system_prompt = replace(replace(replace(v_sp,
           'con las ventas, el inventario y la facturación electrónica».',
           'con las ventas, el inventario y la facturación».'),
           '¿Cómo llevan hoy las ventas, el inventario y la facturación electrónica: con algún programa',
           '¿Cómo llevan hoy las ventas y el inventario: con algún programa'),
           'el inventario, la facturación electrónica ante la DIAN, las compras',
           'el inventario, la facturación, las compras'),
         first_message = replace(v_fm,
           'a llevar las ventas, el inventario y la facturación electrónica en un solo lugar',
           'a llevar las ventas, el inventario y la facturación en un solo lugar'),
         updated_at = now()
   where id = v_id;
end
$$;
