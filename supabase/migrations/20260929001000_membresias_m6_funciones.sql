-- Membresías — fase 2, M6: funciones del ciclo de vida (docs/design/MEMBRESIAS-FASE-1-2.md §3 M6 y §4).
--
-- Regla única (§4): una membresía se crea o se activa DENTRO de la transacción de la función que deja
-- la línea de venta pagada. Nunca desde el navegador ni en una segunda llamada. Por eso:
--   fn_membresias_activar_venta   la llaman pos_checkout_v1, fn_factura_venta_emitir, fn_registrar_pago
--                                 y la confirmación de pedidos web (servidor, service role).
--   fn_membresias_revertir_linea  la llaman pos_anular_venta_v1, procesar_devolucion y
--                                 fn_nota_credito_emitir (vía fn_membresias_revertir_producto).
-- Ninguna de las dos se concede a authenticated: solo las funciones de venta (y el service role).
--
-- Decisiones del dueño aplicadas (§9): P1 cliente obligatorio (membresia_sin_cliente); P2 billing_mode
-- por plan, por defecto «por adelantado · se activa al pagar»; P3 renovar suma desde el vencimiento;
-- P4 N unidades = N periodos seguidos; P5 la gracia deja entrar con aviso; P6 devolución parcial =
-- recorte por periodos completos.
--
-- Fechas: start_date/end_date son timestamptz; los días se cuentan en la zona de la organización
-- (fn_timezone_for). 1 mes pagado el 28 sep vence el 27 oct a las 23:59:59 de la organización.
--
-- Idempotencia: índice único memberships(sale_item_id); las renovaciones quedan ligadas por
-- membership_events.metadata.sale_item_id; los reversos por (sale_item_id, documento) y con tope en
-- la cantidad de la línea. Todas las funciones de venta ya se reproducen con candado.
--
-- R4 (§8): fn_auto_journal_membership contabilizaba con membership_plans.price cuando la membresía no
-- tenía sale_id. Toda membresía del modelo nuevo nace de una venta (el asiento es de la venta), y la
-- legada quedó con source = 'manual_legacy': el disparador ya no actúa si source o sale_item_id
-- vienen informados. Solo sigue contabilizando filas que otro repositorio inserte a la antigua.

-- ── Utilidades internas ─────────────────────────────────────────────────────

-- Fin de N periodos que empiezan en p_inicio: último día a las 23:59:59 en la zona dada.
create or replace function public.fn_membresias_int_fin(
  p_inicio timestamptz, p_unidad text, p_valor integer, p_periodos integer, p_tz text)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select ((((p_inicio at time zone p_tz)::date
           + ((coalesce(p_valor, 1) * greatest(coalesce(p_periodos, 1), 1))::text || ' ' ||
              case p_unidad when 'week' then 'weeks' when 'month' then 'months' when 'year' then 'years' else 'days' end
             )::interval)::date - 1) + time '23:59:59') at time zone p_tz;
$$;

-- Recorta N periodos desde un vencimiento (inverso de fn_membresias_int_fin).
create or replace function public.fn_membresias_int_restar(
  p_fin timestamptz, p_unidad text, p_valor integer, p_periodos integer, p_tz text)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select ((((p_fin at time zone p_tz)::date + 1
           - ((coalesce(p_valor, 1) * greatest(coalesce(p_periodos, 1), 1))::text || ' ' ||
              case p_unidad when 'week' then 'weeks' when 'month' then 'months' when 'year' then 'years' else 'days' end
             )::interval)::date - 1) + time '23:59:59') at time zone p_tz;
$$;

-- Copia de las reglas del plan al venderse (R6): el check-in valida contra esta copia.
create or replace function public.fn_membresias_int_snapshot(p_plan_id integer, p_periodos integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan_id', mp.id, 'nombre', mp.name, 'duration_unit', mp.duration_unit, 'duration_value', mp.duration_value,
    'periodos', greatest(coalesce(p_periodos, 1), 1),
    'grace_days', mp.grace_days, 'billing_mode', mp.billing_mode, 'renewal_mode', mp.renewal_mode,
    'requires_activation', mp.requires_activation, 'activation_window_days', mp.activation_window_days,
    'freeze_allowed', mp.freeze_allowed, 'freeze_max_times', mp.freeze_max_times, 'freeze_max_days', mp.freeze_max_days,
    'allowed_branch_ids', to_jsonb(mp.allowed_branch_ids), 'access_schedule', mp.access_schedule,
    'daily_checkin_limit', mp.daily_checkin_limit)
  from public.membership_plans mp where mp.id = p_plan_id;
$$;

-- ¿Está pagada la venta de una membresía? La factura manda si existe; si no, la venta.
create or replace function public.fn_membresias_int_pagada(p_sale_id uuid, p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select i.status not in ('draft', 'void', 'voided', 'cancelled')
            and (i.status = 'paid' or coalesce(i.balance, 0) <= 0.009)
       from public.invoice_sales i
      where i.id = coalesce(p_invoice_id, (select x.id from public.invoice_sales x
                                             where x.sale_id = p_sale_id and coalesce(x.document_type, 'invoice') = 'invoice'
                                               and x.status not in ('void', 'voided', 'cancelled')
                                             order by x.created_at desc limit 1))),
    (select s.status = 'paid' and coalesce(s.balance, 0) <= 0.009 from public.sales s where s.id = p_sale_id),
    false);
$$;

create or replace function public.fn_membresias_int_evento(
  p_membership_id integer, p_org integer, p_tipo text, p_descripcion text, p_antes jsonb, p_despues jsonb, p_meta jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.membership_events (membership_id, organization_id, event_type, description, old_value, new_value,
                                        performed_by, metadata)
  values (p_membership_id, p_org, p_tipo, p_descripcion, p_antes, p_despues, auth.uid(), coalesce(p_meta, '{}'::jsonb));
$$;

-- Activa una membresía pendiente (pagada o, con requires_activation, en su primera entrada).
-- Si el titular ya tiene una membresía viva del mismo plan, la pendiente se aplica como renovación
-- de esa (P3: suma desde el vencimiento) y queda cancelada con motivo «renovacion_aplicada».
-- Devuelve el id de la membresía que quedó vigente.
create or replace function public.fn_membresias_int_activar(p_membership_id integer, p_forzar boolean default false)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.memberships%rowtype;
  v_viva public.memberships%rowtype;
  v_tz text;
  v_ini timestamptz;
  v_fin timestamptz;
  v_unidad text;
  v_valor integer;
  v_periodos integer;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found or v_m.status <> 'pending' then
    return v_m.id;
  end if;
  v_tz := public.fn_timezone_for(v_m.organization_id, v_m.branch_id);
  v_unidad := coalesce(v_m.plan_snapshot->>'duration_unit', 'month');
  v_valor := coalesce((v_m.plan_snapshot->>'duration_value')::int, 1);
  v_periodos := coalesce((v_m.plan_snapshot->>'periodos')::int, 1);

  select * into v_viva from public.memberships m
   where m.organization_id = v_m.organization_id and m.customer_id = v_m.customer_id
     and m.membership_plan_id = v_m.membership_plan_id and m.id <> v_m.id
     and m.status in ('active', 'frozen', 'past_due', 'expired')
   order by m.end_date desc limit 1
   for update;
  if found then
    v_ini := greatest(v_viva.end_date + interval '1 second', now());
    v_fin := public.fn_membresias_int_fin(v_ini, v_unidad, v_valor, v_periodos, v_tz);
    update public.memberships set
      end_date = v_fin,
      status = case when status = 'frozen' then 'frozen' else 'active' end,
      grace_until = null, plan_snapshot = v_m.plan_snapshot, updated_at = now()
     where id = v_viva.id;
    perform public.fn_membresias_int_evento(v_viva.id, v_m.organization_id,
      case when v_viva.status in ('past_due', 'expired') then 'reactivated' else 'renewed' end,
      'Renovación por pago', jsonb_build_object('end_date', v_viva.end_date, 'status', v_viva.status),
      jsonb_build_object('end_date', v_fin),
      jsonb_build_object('sale_item_id', v_m.sale_item_id, 'sale_id', v_m.sale_id, 'invoice_id', v_m.invoice_id,
                         'periodos', v_periodos, 'desde', v_ini, 'hasta', v_fin, 'desde_pendiente', v_m.id));
    update public.memberships set status = 'cancelled', cancelled_at = now(), cancel_reason = 'renovacion_aplicada',
           notes = coalesce(notes || E'\n', '') || 'Aplicada como renovación de la membresía #' || v_viva.id, updated_at = now()
     where id = v_m.id;
    perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'cancelled', 'Aplicada como renovación',
      null, jsonb_build_object('status', 'cancelled'),
      jsonb_build_object('motivo', 'renovacion_aplicada', 'membresia_renovada', v_viva.id));
    return v_viva.id;
  end if;

  if coalesce((v_m.plan_snapshot->>'requires_activation')::boolean, false) and not p_forzar then
    return v_m.id; -- pagada, espera su primera entrada o la ventana de activación
  end if;

  v_ini := now();
  v_fin := public.fn_membresias_int_fin(v_ini, v_unidad, v_valor, v_periodos, v_tz);
  update public.memberships set status = 'active', start_date = v_ini, end_date = v_fin,
         activated_at = now(), updated_at = now()
   where id = v_m.id;
  perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'activated', 'Membresía activada',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'active', 'start_date', v_ini, 'end_date', v_fin),
    jsonb_build_object('sale_item_id', v_m.sale_item_id, 'forzada', p_forzar));
  return v_m.id;
end;
$$;

-- ── Activación desde la venta ───────────────────────────────────────────────
create or replace function public.fn_membresias_activar_venta(
  p_sale_id uuid, p_invoice_id uuid default null, p_source text default null, p_pagado boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_customer uuid;
  v_emitida boolean;
  v_pagada boolean;
  v_tz text;
  v_li record;
  v_m public.memberships%rowtype;
  v_viva public.memberships%rowtype;
  v_periodos integer;
  v_ini timestamptz;
  v_fin timestamptz;
  v_estado text;
  v_ids integer[] := '{}';
  v_id integer;
  v_snap jsonb;
  v_source text := case when p_source in ('pos', 'invoice', 'web') then p_source else 'pos' end;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found or v_sale.status in ('void', 'cancelled') then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.sale_items si
                   join public.membership_plans mp on mp.product_id = si.product_id and mp.organization_id = v_sale.organization_id
                  where si.sale_id = p_sale_id and si.quantity > 0) then
    return '[]'::jsonb;
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('membresias_venta:' || p_sale_id::text, 0));

  if p_invoice_id is not null then
    select * into v_inv from public.invoice_sales i where i.id = p_invoice_id and i.organization_id = v_sale.organization_id;
  end if;
  if v_inv.id is null then
    select * into v_inv from public.invoice_sales i
     where i.sale_id = p_sale_id and i.organization_id = v_sale.organization_id
       and coalesce(i.document_type, 'invoice') = 'invoice' and i.status not in ('void', 'voided', 'cancelled')
     order by i.created_at desc limit 1;
  end if;

  v_customer := coalesce(v_sale.customer_id, v_inv.customer_id);
  if v_customer is null then
    raise exception 'membresia_sin_cliente' using errcode = '22023',
      detail = 'Una membresía necesita el cliente titular';
  end if;
  v_emitida := v_inv.id is not null and v_inv.status not in ('draft', 'void', 'voided', 'cancelled');
  v_pagada := coalesce(p_pagado, public.fn_membresias_int_pagada(p_sale_id, v_inv.id));
  v_tz := public.fn_timezone_for(v_sale.organization_id, v_sale.branch_id);

  for v_li in
    select si.id as si_id, si.quantity, si.product_id, mp.id as plan_id, mp.duration_unit, mp.duration_value,
           mp.billing_mode, mp.requires_activation
      from public.sale_items si
      join public.membership_plans mp on mp.product_id = si.product_id and mp.organization_id = v_sale.organization_id
     where si.sale_id = p_sale_id and si.quantity > 0
     order by si.created_at, si.id
  loop
    v_periodos := greatest(floor(v_li.quantity)::int, 1);

    -- Ya existe por esta línea (reproducción, o pago posterior de una pendiente).
    select * into v_m from public.memberships where sale_item_id = v_li.si_id;
    if found then
      if v_m.status = 'pending'
         and (v_pagada or (v_emitida and v_m.plan_snapshot->>'billing_mode' = 'on_credit')) then
        v_id := public.fn_membresias_int_activar(v_m.id, false);
        v_ids := v_ids || v_id;
      elsif v_m.status = 'past_due' and v_pagada and v_m.end_date > now() then
        -- Crédito vencido que se acaba de pagar: vuelve a estar al día.
        update public.memberships set status = 'active', grace_until = null, updated_at = now() where id = v_m.id;
        perform public.fn_membresias_int_evento(v_m.id, v_sale.organization_id, 'payment_received', 'Factura pagada',
          jsonb_build_object('status', 'past_due'), jsonb_build_object('status', 'active'),
          jsonb_build_object('sale_item_id', v_li.si_id, 'invoice_id', v_inv.id));
        v_ids := v_ids || v_m.id;
      elsif v_m.status = 'cancelled' and v_m.cancel_reason = 'renovacion_aplicada' then
        v_ids := v_ids || coalesce((select e.membership_id from public.membership_events e
                                     where e.organization_id = v_sale.organization_id
                                       and e.event_type in ('renewed', 'reactivated')
                                       and e.metadata->>'sale_item_id' = v_li.si_id::text
                                     order by e.created_at desc limit 1), v_m.id);
      else
        v_ids := v_ids || v_m.id;
      end if;
      continue;
    end if;

    -- Ya aplicada como renovación de otra membresía.
    select e.membership_id into v_id from public.membership_events e
     where e.organization_id = v_sale.organization_id and e.event_type in ('renewed', 'reactivated')
       and e.metadata->>'sale_item_id' = v_li.si_id::text
     order by e.created_at desc limit 1;
    if found then
      v_ids := v_ids || v_id;
      continue;
    end if;

    v_snap := public.fn_membresias_int_snapshot(v_li.plan_id, v_periodos);

    if v_pagada or (v_emitida and v_li.billing_mode = 'on_credit') then
      -- Renovación (P3): membresía viva o vencida del mismo plan → se extiende desde su vencimiento.
      select * into v_viva from public.memberships m
       where m.organization_id = v_sale.organization_id and m.customer_id = v_customer
         and m.membership_plan_id = v_li.plan_id and m.status in ('active', 'frozen', 'past_due', 'expired')
       order by m.end_date desc limit 1
       for update;
      if found then
        v_ini := greatest(v_viva.end_date + interval '1 second', now());
        v_fin := public.fn_membresias_int_fin(v_ini, v_li.duration_unit, v_li.duration_value, v_periodos, v_tz);
        update public.memberships set
          end_date = v_fin,
          status = case when status = 'frozen' then 'frozen' else 'active' end,
          grace_until = null, plan_snapshot = v_snap, updated_at = now()
         where id = v_viva.id;
        perform public.fn_membresias_int_evento(v_viva.id, v_sale.organization_id,
          case when v_viva.status in ('past_due', 'expired') then 'reactivated' else 'renewed' end,
          'Renovación', jsonb_build_object('end_date', v_viva.end_date, 'status', v_viva.status),
          jsonb_build_object('end_date', v_fin),
          jsonb_build_object('sale_item_id', v_li.si_id, 'sale_id', p_sale_id, 'invoice_id', v_inv.id,
                             'periodos', v_periodos, 'desde', v_ini, 'hasta', v_fin, 'source', v_source));
        v_ids := v_ids || v_viva.id;
        continue;
      end if;
      v_estado := case when v_li.requires_activation then 'pending' else 'active' end;
    else
      v_estado := 'pending';
    end if;

    v_ini := now();
    v_fin := public.fn_membresias_int_fin(v_ini, v_li.duration_unit, v_li.duration_value, v_periodos, v_tz);
    insert into public.memberships (organization_id, customer_id, membership_plan_id, start_date, end_date, status,
                                    sale_id, product_id, sale_item_id, invoice_id, branch_id, plan_snapshot,
                                    activated_at, source, access_code)
    values (v_sale.organization_id, v_customer, v_li.plan_id, v_ini, v_fin, v_estado,
            p_sale_id, v_li.product_id, v_li.si_id, v_inv.id, v_sale.branch_id, v_snap,
            case when v_estado = 'active' then now() end, v_source,
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
    returning * into v_m;
    perform public.fn_membresias_int_evento(v_m.id, v_sale.organization_id, 'created', 'Membresía vendida',
      null, jsonb_build_object('status', v_estado, 'start_date', v_ini, 'end_date', v_fin),
      jsonb_build_object('sale_item_id', v_li.si_id, 'sale_id', p_sale_id, 'invoice_id', v_inv.id,
                         'periodos', v_periodos, 'source', v_source));
    if v_estado = 'active' then
      perform public.fn_membresias_int_evento(v_m.id, v_sale.organization_id, 'activated', 'Membresía activada',
        null, jsonb_build_object('status', 'active'), jsonb_build_object('sale_item_id', v_li.si_id));
    end if;
    v_ids := v_ids || v_m.id;
  end loop;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'plan', mp.name, 'plan_id', mp.id, 'product_id', m.product_id, 'estado', m.status,
             'desde', m.start_date, 'hasta', m.end_date, 'codigo', m.access_code, 'customer_id', m.customer_id)
           order by m.id)
      from public.memberships m join public.membership_plans mp on mp.id = m.membership_plan_id
     where m.id = any(v_ids)), '[]'::jsonb);
end;
$$;

-- ── Reverso por línea (anulación, devolución, nota crédito) ─────────────────
create or replace function public.fn_membresias_revertir_linea(
  p_sale_item_id uuid, p_cantidad numeric, p_motivo text, p_documento jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_si record;
  v_doc text := coalesce(p_documento->>'tipo', 'documento') || ':' || coalesce(p_documento->>'id', '');
  v_ya numeric;
  v_cant integer;
  v_m public.memberships%rowtype;
  v_renovacion boolean := false;
  v_tz text;
  v_fin timestamptz;
  v_meta jsonb;
begin
  select si.id, si.quantity, si.product_id, s.organization_id, s.branch_id into v_si
    from public.sale_items si join public.sales s on s.id = si.sale_id
   where si.id = p_sale_item_id;
  if not found or not exists (select 1 from public.membership_plans mp
                               where mp.product_id = v_si.product_id and mp.organization_id = v_si.organization_id) then
    return null;
  end if;
  perform public.fn_assert_acceso_org(v_si.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('membresias_linea:' || p_sale_item_id::text, 0));

  if exists (select 1 from public.membership_events e
              where e.organization_id = v_si.organization_id and e.metadata->>'sale_item_id' = p_sale_item_id::text
                and e.metadata->>'documento' = v_doc) then
    return jsonb_build_object('repetido', true);
  end if;
  select coalesce(sum((e.metadata->>'cantidad')::numeric), 0) into v_ya
    from public.membership_events e
   where e.organization_id = v_si.organization_id and e.metadata->>'sale_item_id' = p_sale_item_id::text
     and e.event_type in ('trimmed', 'cancelled') and e.metadata ? 'documento';
  v_cant := least(floor(coalesce(p_cantidad, 0)), floor(v_si.quantity) - v_ya)::int;
  if v_cant <= 0 then
    return jsonb_build_object('sin_cambios', true);
  end if;

  select * into v_m from public.memberships
   where sale_item_id = p_sale_item_id and cancel_reason is distinct from 'renovacion_aplicada'
   for update;
  if not found then
    select m.* into v_m from public.membership_events e join public.memberships m on m.id = e.membership_id
     where e.organization_id = v_si.organization_id and e.event_type in ('renewed', 'reactivated')
       and e.metadata->>'sale_item_id' = p_sale_item_id::text
     order by e.created_at desc limit 1;
    if not found then
      return null;
    end if;
    perform 1 from public.memberships where id = v_m.id for update;
    v_renovacion := true;
  end if;
  if v_m.status = 'cancelled' then
    return jsonb_build_object('membership_id', v_m.id, 'ya_cancelada', true);
  end if;

  v_meta := jsonb_build_object('sale_item_id', p_sale_item_id, 'documento', v_doc,
                               'documento_tipo', p_documento->>'tipo', 'documento_id', p_documento->>'id',
                               'cantidad', v_cant, 'motivo', left(coalesce(p_motivo, ''), 500));
  v_tz := public.fn_timezone_for(v_m.organization_id, v_m.branch_id);
  v_fin := public.fn_membresias_int_restar(v_m.end_date, coalesce(v_m.plan_snapshot->>'duration_unit', 'month'),
             coalesce((v_m.plan_snapshot->>'duration_value')::int, 1), v_cant, v_tz);

  if v_m.status = 'pending'
     or (not v_renovacion and v_cant + v_ya >= floor(v_si.quantity))
     or v_fin < now() then
    update public.memberships set status = 'cancelled', cancelled_at = now(),
           cancel_reason = left(coalesce(nullif(btrim(p_motivo), ''), v_doc), 500), updated_at = now()
     where id = v_m.id;
    perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'cancelled', 'Cancelada por ' || v_doc,
      jsonb_build_object('status', v_m.status, 'end_date', v_m.end_date), jsonb_build_object('status', 'cancelled'), v_meta);
    return jsonb_build_object('membership_id', v_m.id, 'accion', 'cancelada');
  end if;

  update public.memberships set end_date = v_fin, updated_at = now() where id = v_m.id;
  perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'trimmed', 'Recortada por ' || v_doc,
    jsonb_build_object('end_date', v_m.end_date), jsonb_build_object('end_date', v_fin),
    v_meta || jsonb_build_object('fin_anterior', v_m.end_date, 'fin_nuevo', v_fin));
  return jsonb_build_object('membership_id', v_m.id, 'accion', 'recortada', 'hasta', v_fin);
end;
$$;

-- Nota crédito: la línea acreditada es de la factura; se reparte sobre las líneas de venta del producto.
create or replace function public.fn_membresias_revertir_producto(
  p_sale_id uuid, p_product_id integer, p_cantidad numeric, p_motivo text, p_documento jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_si record;
  v_resto numeric := floor(coalesce(p_cantidad, 0));
  v_toca numeric;
  v_res jsonb := '[]'::jsonb;
  v_r jsonb;
begin
  if p_sale_id is null or p_product_id is null or v_resto <= 0 then
    return v_res;
  end if;
  for v_si in
    select si.id, si.quantity from public.sale_items si
     where si.sale_id = p_sale_id and si.product_id = p_product_id and si.quantity > 0
     order by si.created_at, si.id
  loop
    exit when v_resto <= 0;
    v_toca := least(v_resto, floor(v_si.quantity));
    v_r := public.fn_membresias_revertir_linea(v_si.id, v_toca, p_motivo, p_documento);
    if v_r is not null then
      v_res := v_res || v_r;
    end if;
    v_resto := v_resto - v_toca;
  end loop;
  return v_res;
end;
$$;

-- ── Vencimiento diario ─────────────────────────────────────────────────────
create or replace function public.fn_membresias_vencer(p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_hoy date;
  v_r record;
  v_n_congeladas integer := 0;
  v_n_descongeladas integer := 0;
  v_n_activadas integer := 0;
  v_n_gracia integer := 0;
  v_n_vencidas integer := 0;
  v_n_credito integer := 0;
  v_gracia timestamptz;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  v_tz := public.fn_timezone_for(p_organization_id, null);
  v_hoy := (now() at time zone v_tz)::date;

  -- 1. Congelamientos programados que empiezan hoy o antes.
  for v_r in
    select f.id as freeze_id, m.id, m.status from public.membership_freezes f
      join public.memberships m on m.id = f.membership_id
     where m.organization_id = p_organization_id and f.status = 'scheduled' and f.start_date <= v_hoy
  loop
    update public.membership_freezes set status = 'active' where id = v_r.freeze_id;
    if v_r.status in ('active', 'past_due') then
      update public.memberships set status = 'frozen', updated_at = now() where id = v_r.id;
      perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'frozen', 'Inicio de congelamiento programado',
        jsonb_build_object('status', v_r.status), jsonb_build_object('status', 'frozen'),
        jsonb_build_object('freeze_id', v_r.freeze_id));
      v_n_congeladas := v_n_congeladas + 1;
    end if;
  end loop;

  -- 2. Congelamientos terminados.
  for v_r in
    select f.id as freeze_id, m.id from public.membership_freezes f
      join public.memberships m on m.id = f.membership_id
     where m.organization_id = p_organization_id and f.status = 'active' and f.end_date < v_hoy
  loop
    update public.membership_freezes set status = 'ended' where id = v_r.freeze_id;
    update public.memberships set status = 'active', updated_at = now() where id = v_r.id and status = 'frozen';
    if found then
      perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'unfrozen', 'Fin del congelamiento',
        jsonb_build_object('status', 'frozen'), jsonb_build_object('status', 'active'),
        jsonb_build_object('freeze_id', v_r.freeze_id));
      v_n_descongeladas := v_n_descongeladas + 1;
    end if;
  end loop;

  -- 3. Pagadas que esperan su primera entrada y ya agotaron la ventana de activación.
  for v_r in
    select m.id from public.memberships m
     where m.organization_id = p_organization_id and m.status = 'pending'
       and coalesce((m.plan_snapshot->>'requires_activation')::boolean, false)
       and nullif(m.plan_snapshot->>'activation_window_days', '') is not null
       and m.created_at + ((m.plan_snapshot->>'activation_window_days')::int || ' days')::interval < now()
       and public.fn_membresias_int_pagada(m.sale_id, m.invoice_id)
  loop
    perform public.fn_membresias_int_activar(v_r.id, true);
    v_n_activadas := v_n_activadas + 1;
  end loop;

  -- 4. Créditos vencidos sin pagar (billing_mode on_credit): pasan a «en gracia».
  for v_r in
    select m.id, m.plan_snapshot, i.due_date from public.memberships m
      join public.invoice_sales i on i.id = m.invoice_id
     where m.organization_id = p_organization_id and m.status = 'active'
       and m.plan_snapshot->>'billing_mode' = 'on_credit'
       and i.status not in ('paid', 'void', 'voided', 'cancelled') and coalesce(i.balance, 0) > 0.009
       and i.due_date is not null and i.due_date < now()
  loop
    v_gracia := ((((v_r.due_date at time zone v_tz)::date + coalesce((v_r.plan_snapshot->>'grace_days')::int, 0))
                  + time '23:59:59') at time zone v_tz);
    update public.memberships set status = 'past_due', grace_until = v_gracia, updated_at = now() where id = v_r.id;
    perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'grace_started', 'Factura a crédito vencida',
      jsonb_build_object('status', 'active'), jsonb_build_object('status', 'past_due', 'grace_until', v_gracia), '{}'::jsonb);
    v_n_credito := v_n_credito + 1;
  end loop;

  -- 5. Vencidas: con gracia → past_due; sin gracia → expired.
  for v_r in
    select m.id, m.end_date, m.plan_snapshot from public.memberships m
     where m.organization_id = p_organization_id and m.status = 'active' and m.end_date < now()
  loop
    if coalesce((v_r.plan_snapshot->>'grace_days')::int, 0) > 0 then
      v_gracia := public.fn_membresias_int_fin(v_r.end_date + interval '1 second', 'day',
                    (v_r.plan_snapshot->>'grace_days')::int, 1, v_tz);
      update public.memberships set status = 'past_due', grace_until = v_gracia, updated_at = now() where id = v_r.id;
      perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'grace_started', 'Vencida, en periodo de gracia',
        jsonb_build_object('status', 'active'), jsonb_build_object('status', 'past_due', 'grace_until', v_gracia), '{}'::jsonb);
      v_n_gracia := v_n_gracia + 1;
    else
      update public.memberships set status = 'expired', updated_at = now() where id = v_r.id;
      perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'expired', 'Membresía vencida',
        jsonb_build_object('status', 'active'), jsonb_build_object('status', 'expired'), '{}'::jsonb);
      v_n_vencidas := v_n_vencidas + 1;
    end if;
  end loop;

  -- 6. Fin de la gracia.
  for v_r in
    select m.id from public.memberships m
     where m.organization_id = p_organization_id and m.status = 'past_due'
       and coalesce(m.grace_until, m.end_date) < now()
  loop
    update public.memberships set status = 'expired', updated_at = now() where id = v_r.id;
    perform public.fn_membresias_int_evento(v_r.id, p_organization_id, 'expired', 'Fin del periodo de gracia',
      jsonb_build_object('status', 'past_due'), jsonb_build_object('status', 'expired'), '{}'::jsonb);
    v_n_vencidas := v_n_vencidas + 1;
  end loop;

  return jsonb_build_object('organization_id', p_organization_id, 'hoy', v_hoy,
    'congeladas', v_n_congeladas, 'descongeladas', v_n_descongeladas, 'activadas', v_n_activadas,
    'en_gracia', v_n_gracia, 'credito_vencido', v_n_credito, 'vencidas', v_n_vencidas);
end;
$$;

-- Todas las organizaciones con membresías por revisar (lo corre pg_cron cada hora: cada organización
-- cruza su medianoche a una hora distinta y la función es idempotente).
create or replace function public.fn_membresias_vencer_todas()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_res jsonb := '[]'::jsonb;
  v_r jsonb;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'solo_tarea_programada' using errcode = '42501';
  end if;
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.status in ('active', 'past_due', 'frozen', 'pending')
  loop
    begin
      v_r := public.fn_membresias_vencer(v_org);
      if (v_r->>'congeladas')::int + (v_r->>'descongeladas')::int + (v_r->>'activadas')::int
         + (v_r->>'en_gracia')::int + (v_r->>'credito_vencido')::int + (v_r->>'vencidas')::int > 0 then
        v_res := v_res || v_r;
      end if;
    exception when others then
      v_res := v_res || jsonb_build_object('organization_id', v_org, 'error', sqlerrm);
    end;
  end loop;
  return v_res;
end;
$$;

-- ── Acciones de pantalla ────────────────────────────────────────────────────
create or replace function public.fn_membresia_congelar(
  p_membership_id integer, p_desde date, p_hasta date, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.memberships%rowtype;
  v_tz text;
  v_hoy date;
  v_dias integer;
  v_usados integer;
  v_veces integer;
  v_freeze uuid;
  v_ahora boolean;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membresia_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_membresias_int_exigir(v_m.organization_id, array['memberships.freeze']);
  if v_m.status not in ('active', 'past_due') then
    raise exception 'membresia_no_congelable' using errcode = '22023', detail = v_m.status;
  end if;
  if not coalesce((v_m.plan_snapshot->>'freeze_allowed')::boolean, false) then
    raise exception 'congelamiento_no_permitido' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(v_m.organization_id, v_m.branch_id);
  v_hoy := (now() at time zone v_tz)::date;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;
  if p_desde < v_hoy then
    raise exception 'congelamiento_en_el_pasado' using errcode = '22023';
  end if;
  if p_desde > (v_m.end_date at time zone v_tz)::date then
    raise exception 'congelamiento_despues_del_vencimiento' using errcode = '22023';
  end if;
  if exists (select 1 from public.membership_freezes f
              where f.membership_id = v_m.id and f.status in ('scheduled', 'active')) then
    raise exception 'congelamiento_en_curso' using errcode = '22023';
  end if;
  v_dias := p_hasta - p_desde + 1;
  select coalesce(sum(f.days_frozen), 0), count(*) into v_usados, v_veces
    from public.membership_freezes f where f.membership_id = v_m.id and f.status <> 'cancelled';
  if nullif(v_m.plan_snapshot->>'freeze_max_times', '') is not null
     and v_veces >= (v_m.plan_snapshot->>'freeze_max_times')::int then
    raise exception 'congelamiento_tope_veces' using errcode = '22023',
      detail = jsonb_build_object('usadas', v_veces, 'tope', (v_m.plan_snapshot->>'freeze_max_times')::int)::text;
  end if;
  if nullif(v_m.plan_snapshot->>'freeze_max_days', '') is not null
     and v_usados + v_dias > (v_m.plan_snapshot->>'freeze_max_days')::int then
    raise exception 'congelamiento_tope_dias' using errcode = '22023',
      detail = jsonb_build_object('usados', v_usados, 'pedidos', v_dias, 'tope', (v_m.plan_snapshot->>'freeze_max_days')::int)::text;
  end if;

  v_ahora := p_desde <= v_hoy;
  insert into public.membership_freezes (membership_id, start_date, end_date, reason, approved_by, status, days_frozen, branch_id)
  values (v_m.id, p_desde, p_hasta, left(nullif(btrim(coalesce(p_motivo, '')), ''), 500), auth.uid(),
          case when v_ahora then 'active' else 'scheduled' end, v_dias, v_m.branch_id)
  returning id into v_freeze;

  -- Los días congelados se devuelven al final: el vencimiento se corre esos días.
  update public.memberships set
    end_date = end_date + (v_dias || ' days')::interval,
    status = case when v_ahora then 'frozen' else status end,
    updated_at = now()
   where id = v_m.id;
  perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'frozen',
    case when v_ahora then 'Membresía congelada' else 'Congelamiento programado' end,
    jsonb_build_object('status', v_m.status, 'end_date', v_m.end_date),
    jsonb_build_object('status', case when v_ahora then 'frozen' else v_m.status end,
                       'end_date', v_m.end_date + (v_dias || ' days')::interval),
    jsonb_build_object('freeze_id', v_freeze, 'desde', p_desde, 'hasta', p_hasta, 'dias', v_dias, 'motivo', p_motivo));
  return jsonb_build_object('membership_id', v_m.id, 'freeze_id', v_freeze, 'dias', v_dias,
                            'estado', case when v_ahora then 'frozen' else v_m.status end,
                            'hasta', v_m.end_date + (v_dias || ' days')::interval);
end;
$$;

create or replace function public.fn_membresia_descongelar(p_membership_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.memberships%rowtype;
  v_f public.membership_freezes%rowtype;
  v_tz text;
  v_hoy date;
  v_sobran integer;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membresia_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_membresias_int_exigir(v_m.organization_id, array['memberships.freeze']);
  select * into v_f from public.membership_freezes f
   where f.membership_id = v_m.id and f.status in ('active', 'scheduled')
   order by f.start_date limit 1 for update;
  if not found then
    raise exception 'sin_congelamiento' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(v_m.organization_id, v_m.branch_id);
  v_hoy := (now() at time zone v_tz)::date;
  -- Días no usados: programado → todos; en curso → desde hoy (hoy ya no cuenta como congelado).
  v_sobran := case when v_f.status = 'scheduled' then v_f.days_frozen
                   else greatest(v_f.end_date - v_hoy + 1, 0) end;
  update public.membership_freezes set
    status = case when v_f.status = 'scheduled' then 'cancelled' else 'ended' end,
    end_date = case when v_f.status = 'scheduled' then end_date else greatest(least(end_date, v_hoy - 1), start_date) end,
    days_frozen = greatest(days_frozen - v_sobran, 0)
   where id = v_f.id;
  update public.memberships set
    end_date = end_date - (v_sobran || ' days')::interval,
    status = case when status = 'frozen' then 'active' else status end,
    updated_at = now()
   where id = v_m.id;
  perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'unfrozen',
    case when v_f.status = 'scheduled' then 'Congelamiento programado cancelado' else 'Membresía descongelada' end,
    jsonb_build_object('status', v_m.status, 'end_date', v_m.end_date),
    jsonb_build_object('status', case when v_m.status = 'frozen' then 'active' else v_m.status end,
                       'end_date', v_m.end_date - (v_sobran || ' days')::interval),
    jsonb_build_object('freeze_id', v_f.id, 'dias_devueltos', v_sobran));
  return jsonb_build_object('membership_id', v_m.id, 'dias_devueltos', v_sobran,
                            'hasta', v_m.end_date - (v_sobran || ' days')::interval);
end;
$$;

create or replace function public.fn_membresia_cancelar(p_membership_id integer, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.memberships%rowtype;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membresia_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_membresias_int_exigir(v_m.organization_id, array['memberships.cancel']);
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if v_m.status = 'cancelled' then
    return jsonb_build_object('membership_id', v_m.id, 'ya_cancelada', true);
  end if;
  update public.membership_freezes set status = 'cancelled'
   where membership_id = v_m.id and status = 'scheduled';
  update public.membership_freezes set status = 'ended'
   where membership_id = v_m.id and status = 'active';
  update public.memberships set status = 'cancelled', cancelled_at = now(), cancel_reason = v_motivo, updated_at = now()
   where id = v_m.id;
  perform public.fn_membresias_int_evento(v_m.id, v_m.organization_id, 'cancelled', 'Membresía cancelada',
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('motivo', v_motivo));
  return jsonb_build_object('membership_id', v_m.id, 'estado', 'cancelled');
end;
$$;

-- Check-in: valida contra la copia de reglas (plan_snapshot), registra la entrada o el rechazo.
create or replace function public.fn_membresia_registrar_checkin(
  p_organization_id integer, p_customer_id uuid, p_branch_id integer,
  p_method text default 'manual', p_membership_id integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_ahora_local timestamp;
  v_m public.memberships%rowtype;
  v_motivo text;
  v_aviso text;
  v_dias_gracia integer;
  v_sched jsonb;
  v_hoy_count integer;
  v_id integer;
  v_checkin integer;
  v_method text := case when p_method in ('qr', 'manual', 'rfid', 'fingerprint', 'facial') then p_method else 'manual' end;
begin
  perform public.fn_membresias_int_exigir(p_organization_id, array['memberships.checkin']);
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_ahora_local := now() at time zone v_tz;

  -- La membresía que mejor da acceso: vigente, en gracia, por activar, congelada, pendiente, vencida.
  select * into v_m from public.memberships m
   where m.organization_id = p_organization_id and m.customer_id = p_customer_id
     and (p_membership_id is null or m.id = p_membership_id)
     and m.status <> 'cancelled'
   order by case
              when m.status = 'active' and m.start_date <= now() and m.end_date >= now() then 0
              when m.status = 'past_due' and coalesce(m.grace_until, m.end_date) >= now() then 1
              when m.status = 'pending' then 2
              when m.status = 'frozen' then 3
              else 4 end,
            m.end_date desc
   limit 1
   for update;

  if not found then
    v_motivo := 'sin_membresia';
  elsif v_m.status = 'pending' then
    if coalesce((v_m.plan_snapshot->>'requires_activation')::boolean, false)
       and public.fn_membresias_int_pagada(v_m.sale_id, v_m.invoice_id) then
      v_id := public.fn_membresias_int_activar(v_m.id, true);
      select * into v_m from public.memberships where id = v_id;
      v_aviso := 'activada_hoy';
    else
      v_motivo := 'pendiente_de_pago';
    end if;
  elsif v_m.status = 'frozen' then
    v_motivo := 'congelada';
  elsif v_m.status = 'past_due' and coalesce(v_m.grace_until, v_m.end_date) >= now() then
    v_dias_gracia := greatest((coalesce(v_m.grace_until, v_m.end_date) at time zone v_tz)::date - v_ahora_local::date, 0);
    v_aviso := 'en_gracia';
  elsif v_m.status = 'active' and v_m.end_date >= now() and v_m.start_date <= now() then
    null;
  else
    v_motivo := 'vencida';
  end if;

  if v_motivo is null and v_m.id is not null then
    if jsonb_typeof(v_m.plan_snapshot->'allowed_branch_ids') = 'array'
       and jsonb_array_length(v_m.plan_snapshot->'allowed_branch_ids') > 0
       and not (v_m.plan_snapshot->'allowed_branch_ids') @> to_jsonb(p_branch_id) then
      v_motivo := 'sede_no_permitida';
    end if;
  end if;
  if v_motivo is null and v_m.id is not null then
    v_sched := v_m.plan_snapshot->'access_schedule';
    if jsonb_typeof(v_sched) = 'object' then
      if jsonb_typeof(v_sched->'dias') = 'array' and jsonb_array_length(v_sched->'dias') > 0
         and not (v_sched->'dias') @> to_jsonb(extract(isodow from v_ahora_local)::int) then
        v_motivo := 'fuera_de_horario';
      elsif nullif(v_sched->>'desde', '') is not null and nullif(v_sched->>'hasta', '') is not null
         and not (v_ahora_local::time between (v_sched->>'desde')::time and (v_sched->>'hasta')::time) then
        v_motivo := 'fuera_de_horario';
      end if;
    end if;
  end if;
  if v_motivo is null and v_m.id is not null and nullif(v_m.plan_snapshot->>'daily_checkin_limit', '') is not null then
    select count(*) into v_hoy_count from public.member_checkins c
     where c.membership_id = v_m.id and c.denied_reason is null
       and (c.checkin_at at time zone v_tz)::date = v_ahora_local::date;
    if v_hoy_count >= (v_m.plan_snapshot->>'daily_checkin_limit')::int then
      v_motivo := 'limite_diario';
    end if;
  end if;

  insert into public.member_checkins (organization_id, customer_id, branch_id, checkin_at, method, denied_reason,
                                      staff_id, membership_id)
  values (p_organization_id, p_customer_id, p_branch_id, now(), v_method, v_motivo, auth.uid(), v_m.id)
  returning id into v_checkin;
  if v_m.id is not null then
    perform public.fn_membresias_int_evento(v_m.id, p_organization_id,
      case when v_motivo is null then 'access_granted' else 'access_denied' end,
      coalesce(v_motivo, v_aviso, 'Entrada'), null, null,
      jsonb_build_object('checkin_id', v_checkin, 'branch_id', p_branch_id, 'method', v_method, 'aviso', v_aviso));
  end if;

  return jsonb_build_object(
    'permitido', v_motivo is null and v_m.id is not null,
    'motivo', v_motivo, 'aviso', v_aviso, 'dias_gracia', v_dias_gracia, 'checkin_id', v_checkin,
    'membresia', case when v_m.id is null then null else jsonb_build_object(
      'id', v_m.id, 'estado', v_m.status, 'plan', v_m.plan_snapshot->>'nombre', 'desde', v_m.start_date,
      'hasta', v_m.end_date, 'grace_until', v_m.grace_until, 'codigo', v_m.access_code) end);
end;
$$;

-- ── R4: el disparador contable no toca membresías del modelo nuevo ──────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_membership()'::regprocedure);
  v_frag text := E'    v_org_id := NEW.organization_id;\n';
begin
  if position('20260929001000' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_frag, ''))) / length(v_frag) <> 1 then
    raise exception 'fn_auto_journal_membership: el fragmento no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_frag,
       E'    -- Membresías (20260929001000): las del modelo nuevo las contabiliza su venta o factura.\n'
    || E'    IF NEW.source IS NOT NULL OR NEW.sale_item_id IS NOT NULL THEN\n'
    || E'        RETURN NEW;\n'
    || E'    END IF;\n\n'
    || v_frag);
end $$;

-- ── Privilegios ─────────────────────────────────────────────────────────────
-- Internas y de venta: sin acceso desde la API (solo otras funciones y el service role).
revoke all on function public.fn_membresias_int_fin(timestamptz, text, integer, integer, text) from public, anon;
revoke all on function public.fn_membresias_int_restar(timestamptz, text, integer, integer, text) from public, anon;
revoke all on function public.fn_membresias_int_snapshot(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_membresias_int_pagada(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_membresias_int_evento(integer, integer, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fn_membresias_int_activar(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_membresias_activar_venta(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_membresias_revertir_linea(uuid, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_membresias_revertir_producto(uuid, integer, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_membresias_vencer_todas() from public, anon, authenticated;
grant execute on function public.fn_membresias_int_fin(timestamptz, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_membresias_int_restar(timestamptz, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_membresias_activar_venta(uuid, uuid, text, boolean) to service_role;
grant execute on function public.fn_membresias_revertir_linea(uuid, numeric, text, jsonb) to service_role;
grant execute on function public.fn_membresias_vencer_todas() to service_role;

-- Acciones de pantalla: sesión con permiso (la guarda va dentro de cada función).
revoke all on function public.fn_membresias_vencer(integer) from public, anon;
revoke all on function public.fn_membresia_congelar(integer, date, date, text) from public, anon;
revoke all on function public.fn_membresia_descongelar(integer) from public, anon;
revoke all on function public.fn_membresia_cancelar(integer, text) from public, anon;
revoke all on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer) from public, anon;
grant execute on function public.fn_membresias_vencer(integer) to authenticated, service_role;
grant execute on function public.fn_membresia_congelar(integer, date, date, text) to authenticated, service_role;
grant execute on function public.fn_membresia_descongelar(integer) to authenticated, service_role;
grant execute on function public.fn_membresia_cancelar(integer, text) to authenticated, service_role;
grant execute on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer) to authenticated, service_role;
