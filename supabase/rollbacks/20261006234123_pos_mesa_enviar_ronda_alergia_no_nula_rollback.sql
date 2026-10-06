-- Reversión de 20261006234123_pos_mesa_enviar_ronda_alergia_no_nula: vuelve a la versión de
-- 20261006164925_pos_mesas_flujo_atencion (sin el coalesce; reintroduce el 400).

set lock_timeout = '10s';
create or replace function public.pos_mesa_enviar_ronda(p_session_id uuid, p_round_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ses     public.table_sessions%rowtype;
  v_branch  integer;
  v_ids     uuid[];
  v_ronda   integer;
  v_ticket  integer;
  v_server  text;
  v_cocina  integer := 0;
  v_est     jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_round_key is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_ses from public.table_sessions where id = p_session_id for update;
  if v_ses.id is null then
    raise exception 'sesion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_ses.organization_id);
  v_branch := coalesce(v_ses.branch_id, (select t.branch_id from public.restaurant_tables t where t.id = v_ses.restaurant_table_id));
  if v_branch is not null and not public.app_branch_access(v_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Idempotencia: la misma ronda (doble clic, reintento sin red) devuelve lo mismo.
  if exists (select 1 from public.kitchen_tickets kt
              where kt.organization_id = v_ses.organization_id and kt.round_key = p_round_key
                and kt.table_session_id is distinct from p_session_id) then
    raise exception 'ronda_de_otra_mesa' using errcode = '22023';
  end if;
  if v_ses.sale_id is not null and exists (
       select 1 from public.sale_items si where si.sale_id = v_ses.sale_id and si.notes->>'round_key' = p_round_key::text) then
    select (si.notes->>'ronda')::integer into v_ronda
      from public.sale_items si where si.sale_id = v_ses.sale_id and si.notes->>'round_key' = p_round_key::text limit 1;
    select kt.id into v_ticket from public.kitchen_tickets kt
     where kt.organization_id = v_ses.organization_id and kt.round_key = p_round_key limit 1;
    return jsonb_build_object('ya_enviada', true, 'ronda', v_ronda, 'ticket_id', v_ticket);
  end if;

  if v_ses.status not in ('active', 'bill_requested') then
    raise exception 'sesion_cerrada' using errcode = 'P0001';
  end if;
  if v_ses.sale_id is null then
    return jsonb_build_object('ya_enviada', false, 'lineas', 0);
  end if;

  select array_agg(si.id order by si.created_at, si.id) into v_ids
    from public.sale_items si
   where si.sale_id = v_ses.sale_id
     and si.paid_at is null
     and coalesce((si.notes->>'por_enviar')::boolean, false);
  if v_ids is null then
    return jsonb_build_object('ya_enviada', false, 'lineas', 0);
  end if;

  select greatest(
           coalesce((select max((si.notes->>'ronda')::integer) from public.sale_items si
                      where si.sale_id = v_ses.sale_id and si.notes ? 'ronda'), 0),
           (select count(*)::integer from public.kitchen_tickets kt
             where kt.table_session_id = p_session_id and kt.ticket_type = 'order')) + 1
    into v_ronda;

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') into v_server
    from public.profiles pr where pr.id = auth.uid();

  if exists (select 1 from public.fn_lineas_a_cocina(v_ses.organization_id, v_ids)) then
    insert into public.kitchen_tickets (organization_id, branch_id, sale_id, table_session_id, status, priority,
                                        source, server_name, round_key, ticket_type, has_allergy, table_note)
    values (v_ses.organization_id, v_branch, v_ses.sale_id, p_session_id, 'new', 0,
            'pos', left(v_server, 120), p_round_key, 'order',
            exists (select 1 from public.sale_items si
                     where si.id = any(v_ids) and coalesce((si.notes->>'is_allergy')::boolean, false)
                       and nullif(btrim(coalesce(si.notes->>'extra', '')), '') is not null)
              or (jsonb_typeof(v_ses.service_notes->'alergias') = 'array'
                  and jsonb_array_length(v_ses.service_notes->'alergias') > 0),
            public.fn_pos_mesa_nota_cocina(v_ses.service_notes))
    returning id into v_ticket;

    insert into public.kitchen_ticket_items (organization_id, kitchen_ticket_id, sale_item_id, station, notes, status,
                                             product_name, quantity, variant_data, modifiers, is_allergy)
    select v_ses.organization_id, v_ticket, si.id, c.station,
           nullif(left(concat_ws(' - ',
             case when si.notes ? 'guest_number' then 'Comensal ' || (si.notes->>'guest_number') end,
             nullif(btrim(coalesce(si.notes->>'extra', '')), '')), 500), ''),
           'pending',
           coalesce(nullif(si.notes->>'product_name', ''), p.name, 'Producto'),
           si.quantity,
           p.variant_data,
           case when jsonb_typeof(si.notes->'modifiers') = 'array' and jsonb_array_length(si.notes->'modifiers') > 0
                then (select jsonb_agg(jsonb_build_object('name', m.value->>'name',
                                                          'extraPrice', coalesce(nullif(m.value->>'extraPrice', '')::numeric, 0)))
                        from jsonb_array_elements(si.notes->'modifiers') m) end,
           coalesce((si.notes->>'is_allergy')::boolean, false)
             and nullif(btrim(coalesce(si.notes->>'extra', '')), '') is not null
      from public.fn_lineas_a_cocina(v_ses.organization_id, v_ids) c
      join public.sale_items si on si.id = c.sale_item_id
      left join public.products p on p.id = si.product_id
     order by si.created_at, si.id;
    get diagnostics v_cocina = row_count;

    select coalesce(jsonb_agg(jsonb_build_object('station', e.station, 'lineas', e.n) order by e.station), '[]'::jsonb)
      into v_est
      from (select coalesce(ki.station, '') as station, count(*) as n
              from public.kitchen_ticket_items ki where ki.kitchen_ticket_id = v_ticket
             group by coalesce(ki.station, '')) e;
  end if;

  update public.sale_items
     set notes = (coalesce(notes, '{}'::jsonb) - 'por_enviar')
                 || jsonb_build_object('ronda', v_ronda, 'round_key', p_round_key, 'enviada_at', now()),
         updated_at = now()
   where id = any(v_ids);

  return jsonb_build_object('ya_enviada', false, 'ronda', v_ronda, 'ticket_id', v_ticket,
                            'lineas', cardinality(v_ids), 'a_cocina', v_cocina, 'estaciones', v_est);
end;
$function$;
