-- Rollback de 20260930200000_voz_pedro_sin_facturacion_electronica.sql
-- Vuelve a poner las cuatro frases con «facturación electrónica» (y «ante la DIAN») de
-- 20260930140600 en el guion del agente Pedro (org 125).

do $$
declare
  v_id constant uuid := 'c194ab52-8089-422d-b625-1b56f47ba146';
begin
  update public.voice_agents
     set system_prompt = replace(replace(replace(system_prompt,
           'con las ventas, el inventario y la facturación».',
           'con las ventas, el inventario y la facturación electrónica».'),
           '¿Cómo llevan hoy las ventas y el inventario: con algún programa',
           '¿Cómo llevan hoy las ventas, el inventario y la facturación electrónica: con algún programa'),
           'el inventario, la facturación, las compras',
           'el inventario, la facturación electrónica ante la DIAN, las compras'),
         first_message = replace(first_message,
           'a llevar las ventas, el inventario y la facturación en un solo lugar',
           'a llevar las ventas, el inventario y la facturación electrónica en un solo lugar'),
         updated_at = now()
   where id = v_id;
end
$$;
