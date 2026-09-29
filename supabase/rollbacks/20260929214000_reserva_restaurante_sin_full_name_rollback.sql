-- Reversión de 20260929214000_reserva_restaurante_sin_full_name.
-- ATENCIÓN: vuelve a la versión que nunca pudo guardar una reserva (full_name generado y branch_id
-- NULL). Solo para deshacer si el parche rompiera otra cosa.

do $$
declare
  v_def text := pg_get_functiondef(
    'public.create_restaurant_reservation(integer,date,time without time zone,integer,text,integer,text,text,text,text,text,text)'::regprocedure);
  v_cambios text[][] := array[
    array['v_table_rec       record;
  v_branch          integer;',
          'v_table_rec       record;'],
    array['SELECT t.id, t.capacity, t.branch_id',
          'SELECT t.id, t.capacity'],
    array['AND (p_zone IS NULL OR t.zone = p_zone)
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)',
          'AND (p_zone IS NULL OR t.zone = p_zone)'],
    array['v_assigned_table := v_table_rec.id;
      v_branch := v_table_rec.branch_id;',
          'v_assigned_table := v_table_rec.id;'],
    array['INSERT INTO public.customers (organization_id, first_name, last_name, email, phone, is_registered)',
          'INSERT INTO public.customers (organization_id, first_name, full_name, email, phone, is_registered)'],
    array['VALUES (p_organization_id, split_part(btrim(p_customer_name), '' '', 1), '
          || 'nullif(btrim(substr(btrim(p_customer_name), length(split_part(btrim(p_customer_name), '' '', 1)) + 1)), ''''), '
          || 'p_customer_email, p_customer_phone, false)',
          'VALUES (p_organization_id, p_customer_name, p_customer_name, p_customer_email, p_customer_phone, false)'],
    array['p_organization_id, v_branch, v_assigned_table,',
          'p_organization_id, p_branch_id, v_assigned_table,']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_cambios, 1) loop
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end;
$$;
