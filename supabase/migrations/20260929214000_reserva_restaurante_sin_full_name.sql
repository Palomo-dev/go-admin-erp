-- create_restaurant_reservation (reservas de mesa desde el sitio web) nunca pudo guardar una reserva:
-- en producción restaurant_reservations tiene 0 filas. HANDOFF 2026-09-29 §8.4. Dos fallos:
--   1. Insertaba customers.full_name, columna GENERATED ALWAYS: con el correo de un cliente nuevo
--      fallaba. Ahora el nombre se parte en first_name (primera palabra) y last_name (el resto).
--   2. Si el sitio no manda sucursal (p_branch_id NULL), insertaba branch_id NULL en una columna
--      NOT NULL. Ahora la reserva toma la sucursal de la mesa asignada; y si llega sucursal, solo se
--      buscan mesas de esa sucursal (antes se podía asignar una mesa de otra).
--
-- Parche sobre la definición viva (pg_get_functiondef + replace) comprobando que cada fragmento
-- aparece exactamente una vez: varias sesiones parchean funciones y no se parte de una copia vieja.

do $$
declare
  v_def text := pg_get_functiondef(
    'public.create_restaurant_reservation(integer,date,time without time zone,integer,text,integer,text,text,text,text,text,text)'::regprocedure);
  v_cambios text[][] := array[
    array['v_table_rec       record;',
          'v_table_rec       record;
  v_branch          integer;'],
    array['SELECT t.id, t.capacity',
          'SELECT t.id, t.capacity, t.branch_id'],
    array['AND (p_zone IS NULL OR t.zone = p_zone)',
          'AND (p_zone IS NULL OR t.zone = p_zone)
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)'],
    array['v_assigned_table := v_table_rec.id;',
          'v_assigned_table := v_table_rec.id;
      v_branch := v_table_rec.branch_id;'],
    array['INSERT INTO public.customers (organization_id, first_name, full_name, email, phone, is_registered)',
          'INSERT INTO public.customers (organization_id, first_name, last_name, email, phone, is_registered)'],
    array['VALUES (p_organization_id, p_customer_name, p_customer_name, p_customer_email, p_customer_phone, false)',
          'VALUES (p_organization_id, split_part(btrim(p_customer_name), '' '', 1), '
          || 'nullif(btrim(substr(btrim(p_customer_name), length(split_part(btrim(p_customer_name), '' '', 1)) + 1)), ''''), '
          || 'p_customer_email, p_customer_phone, false)'],
    array['p_organization_id, p_branch_id, v_assigned_table,',
          'p_organization_id, v_branch, v_assigned_table,']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_cambios, 1) loop
    if (length(v_def) - length(replace(v_def, v_cambios[i][1], ''))) / length(v_cambios[i][1]) <> 1 then
      raise exception 'create_restaurant_reservation cambió: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end;
$$;
