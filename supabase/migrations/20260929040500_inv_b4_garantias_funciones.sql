-- Inventario B4 · Garantías: listado, detalle y ciclo del reclamo por RPC.
--
-- Figma «Existencias — Garantías» (592:329722) y RMA (973:186133):
--   pendiente → aprobado → en proceso (con el proveedor, RMA) → resuelto
--   pendiente · aprobado · en proceso → rechazado (con motivo)
--
-- * fn_garantias_listado(org, filtros)     → { filas, total, kpis }
-- * fn_garantia_detalle(org, id)           → reclamo, unidad, venta, historial
-- * fn_garantia_serial_para_reclamo(org, serial_id | código)
--                                          → ¿se puede abrir un reclamo? y por qué no
-- * fn_garantia_crear(org, serial, motivo, descripción)
--       solo seriales vendidos, con garantía vigente y sin reclamo abierto;
--       el serial pasa a «Reclamo garantía» y queda el evento.
-- * fn_garantia_cambiar_estado(org, id, 'aprobar' | 'rechazar', motivo)
-- * fn_garantia_enviar_rma(org, id, { proveedor, rma, transportadora, guia, notas })
--       guarda el número de RMA (antes se perdía) y el envío.
-- * fn_garantia_reemplazos(org, id)        → unidades del mismo producto en stock
-- * fn_garantia_resolver(org, id, { tipo: repair | replacement | refund,
--       serial_reemplazo, monto, notas, respuesta_proveedor })
--       guarda resolved_by (antes siempre nulo). Con reemplazo, la unidad nueva
--       queda vendida al cliente del reclamo con garantía desde hoy (disparador
--       de 20260929040200) y la reclamada queda «Dañado» (o «RMA» si ya está
--       con el proveedor).
--
-- SIN MOVER STOCK (plan §5.12: B4 va en paralelo con el núcleo B0). El
-- reemplazo cambia estados de seriales y deja en el evento de la unidad nueva
-- `metadata.stock_pendiente` = { producto, sucursal, cantidad: -1, origen:
-- 'warranty_replacement', reclamo }: el contrato que B0 cumplirá llamando a su
-- primitiva de movimiento dentro de esta misma función (y B10 conciliará los
-- pendientes que queden de antes). Anotado en INVENTARIO-PLAN.md.
--
-- Todas: DEFINER, fn_assert_acceso_org (vía fn_productos_exigir_permiso), el
-- permiso en el servidor y REVOKE de anon y public. Errores con mensaje =
-- código estable (lo traduce la ruta): serial_no_encontrado, serial_no_vendido,
-- sin_garantia, garantia_vencida, reclamo_abierto, reclamo_no_encontrado,
-- transicion_invalida, motivo_requerido, rma_requerido, proveedor_invalido,
-- tipo_invalido, reemplazo_requerido, reemplazo_invalido, monto_invalido.

-- ── Ayudantes internos ───────────────────────────────────────────────────────

create or replace function public.fn_garantia_int_siguiente_codigo(p_org integer)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('warranty_claims.code'), p_org);
  select coalesce(max((substring(w.code from '^GAR-(\d+)$'))::integer), 0) + 1
    into v_n
    from public.warranty_claims w
   where w.organization_id = p_org;
  return 'GAR-' || lpad(v_n::text, 4, '0');
end;
$$;

-- Estado de la garantía de un serial para abrir un reclamo.
create or replace function public.fn_garantia_int_evaluar(p_org integer, p_serial_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sn public.serial_numbers%rowtype;
  v_p public.products%rowtype;
  v_hoy date := public.fn_seriales_int_hoy(p_org);
  v_abierto record;
  v_motivo text;
  v_estado_garantia text;
begin
  select * into v_sn from public.serial_numbers where id = p_serial_id and organization_id = p_org;
  if not found then
    return jsonb_build_object('encontrado', false, 'puede', false, 'motivo', 'serial_no_encontrado');
  end if;
  select * into v_p from public.products where id = v_sn.product_id;
  select w.id, w.code, w.status into v_abierto
    from public.warranty_claims w
   where w.serial_number_id = v_sn.id and w.organization_id = p_org
     and w.status in ('pending', 'approved', 'in_process')
   limit 1;

  v_estado_garantia := case
    when v_sn.warranty_end is null then 'sin_garantia'
    when v_sn.warranty_end >= v_hoy then 'vigente'
    else 'vencida' end;

  v_motivo := case
    when v_abierto.id is not null then 'reclamo_abierto'
    when v_sn.status <> 'sold' then 'serial_no_vendido'
    when v_estado_garantia = 'sin_garantia' then 'sin_garantia'
    when v_estado_garantia = 'vencida' then 'garantia_vencida'
    else null end;

  return jsonb_build_object(
    'encontrado', true,
    'puede', v_motivo is null,
    'motivo', v_motivo,
    'id', v_sn.id,
    'serial', v_sn.serial,
    'estado', v_sn.status,
    'producto', jsonb_build_object('id', v_p.id, 'uuid', v_p.uuid, 'nombre', v_p.name, 'sku', v_p.sku),
    'venta', public.fn_seriales_int_venta(p_org, v_sn.sale_id, v_sn.invoice_sale_id),
    'fecha_venta', v_sn.sale_date,
    'cliente', (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
                  from public.customers c where c.id = v_sn.sold_to_customer_id and c.organization_id = p_org),
    'proveedor', (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
                    from public.suppliers s where s.id = v_sn.supplier_id and s.organization_id = p_org),
    'garantia', jsonb_build_object('meses', coalesce(v_sn.warranty_months, v_p.warranty_months),
                                   'inicio', v_sn.warranty_start, 'fin', v_sn.warranty_end,
                                   'estado', v_estado_garantia),
    'reclamo_abierto', case when v_abierto.id is not null
                            then jsonb_build_object('id', v_abierto.id, 'codigo', v_abierto.code, 'estado', v_abierto.status) end,
    'hoy', v_hoy);
end;
$$;

-- Evento del reclamo en la historia del serial.
create or replace function public.fn_garantia_int_evento(
  p_org integer, p_serial_id integer, p_claim_id uuid, p_tipo text,
  p_de text, p_a text, p_cliente uuid, p_notas text, p_metadata jsonb)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.serial_tracking_events (
    serial_number_id, organization_id, event_type, from_status, to_status, from_branch_id,
    source_table, source_id, customer_id, performed_by, event_date, notes, metadata)
  select p_serial_id, p_org, p_tipo, p_de, p_a, sn.current_branch_id,
         'warranty_claims', p_claim_id::text, p_cliente, auth.uid(), now(), p_notas,
         coalesce(p_metadata, '{}'::jsonb)
    from public.serial_numbers sn
   where sn.id = p_serial_id;
$$;

-- ── Listado ──────────────────────────────────────────────────────────────────
-- p_filtros: { busqueda, estados: text[], garantia (vigente · vencida),
--   orden (fecha · codigo), direccion, desde, limite }

create or replace function public.fn_garantias_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busqueda text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
  v_estados text[];
  v_garantia text := nullif(v_f->>'garantia', '');
  v_orden text := coalesce(nullif(v_f->>'orden', ''), 'fecha');
  v_asc boolean := lower(coalesce(v_f->>'direccion', 'desc')) = 'asc';
  v_desde integer := greatest(case when coalesce(v_f->>'desde', '') ~ '^\d+$' then (v_f->>'desde')::integer else 0 end, 0);
  v_limite integer := least(greatest(case when coalesce(v_f->>'limite', '') ~ '^\d+$' then (v_f->>'limite')::integer else 25 end, 1), 5000);
  v_patron text;
  v_hoy date;
  v_zona text;
  v_mes_inicio timestamptz;
  v_total integer;
  v_filas jsonb;
  v_kpis jsonb;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  if jsonb_typeof(v_f->'estados') = 'array' then
    select array_agg(x) into v_estados from jsonb_array_elements_text(v_f->'estados') x;
  end if;
  v_hoy := public.fn_seriales_int_hoy(p_org);
  v_zona := public.fn_timezone_for(p_org, null);
  v_mes_inicio := (date_trunc('month', v_hoy)::timestamp) at time zone v_zona;
  v_patron := '%' || replace(replace(replace(coalesce(v_busqueda, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select w.*, sn.serial, sn.warranty_end, sn.product_id
      from public.warranty_claims w
      join public.serial_numbers sn on sn.id = w.serial_number_id
      left join public.customers c on c.id = w.customer_id
      left join public.products p on p.id = sn.product_id
     where w.organization_id = p_org
       and (v_estados is null or w.status = any (v_estados))
       and (v_busqueda is null
            or w.code ilike v_patron
            or sn.serial ilike v_patron
            or c.full_name ilike v_patron
            or w.claim_reason ilike v_patron
            or p.name ilike v_patron
            or w.supplier_rma_number ilike v_patron)
       and (v_garantia is null
            or (v_garantia = 'vigente' and sn.warranty_end >= v_hoy)
            or (v_garantia = 'vencida' and (sn.warranty_end is null or sn.warranty_end < v_hoy)))
  ), pagina as (
    select b.*
      from base b
     order by
       case when v_orden = 'codigo' and v_asc then b.code end asc,
       case when v_orden = 'codigo' and not v_asc then b.code end desc,
       case when v_orden <> 'codigo' and v_asc then b.claim_date end asc,
       case when v_orden <> 'codigo' and not v_asc then b.claim_date end desc,
       b.id
     offset v_desde limit v_limite
  )
  select (select count(*) from base),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', pg.id,
                   'codigo', pg.code,
                   'fecha', pg.claim_date,
                   'estado', pg.status,
                   'motivo', pg.claim_reason,
                   'serial', jsonb_build_object('id', pg.serial_number_id, 'serial', pg.serial),
                   'producto', (select jsonb_build_object('id', p.id, 'uuid', p.uuid, 'nombre', p.name, 'sku', p.sku)
                                  from public.products p where p.id = pg.product_id),
                   'cliente', (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
                                 from public.customers c where c.id = pg.customer_id and c.organization_id = p_org),
                   'garantia', jsonb_build_object('fin', pg.warranty_end,
                                                  'estado', case when pg.warranty_end is null then 'sin_garantia'
                                                                 when pg.warranty_end >= v_hoy then 'vigente'
                                                                 else 'vencida' end),
                   'rma', pg.supplier_rma_number,
                   'proveedor', (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
                                   from public.suppliers s where s.id = pg.supplier_id and s.organization_id = p_org),
                   'resolucion', pg.resolution_type)
                 order by
                   case when v_orden = 'codigo' and v_asc then pg.code end asc,
                   case when v_orden = 'codigo' and not v_asc then pg.code end desc,
                   case when v_orden <> 'codigo' and v_asc then pg.claim_date end asc,
                   case when v_orden <> 'codigo' and not v_asc then pg.claim_date end desc,
                   pg.id), '[]'::jsonb)
            from pagina pg)
    into v_total, v_filas;

  select jsonb_build_object(
           'pendientes', count(*) filter (where w.status = 'pending'),
           'pendientes_en_plazo', count(*) filter (where w.status = 'pending' and w.claim_date > now() - interval '48 hours'),
           'pendientes_vencidos', count(*) filter (where w.status = 'pending' and w.claim_date <= now() - interval '48 hours'),
           'aprobados', count(*) filter (where w.status = 'approved'),
           'con_proveedor', count(*) filter (where w.status = 'in_process'),
           'resueltos_mes', count(*) filter (where w.status = 'resolved' and w.resolution_date >= v_mes_inicio),
           'reparados_mes', count(*) filter (where w.status = 'resolved' and w.resolution_type = 'repair' and w.resolution_date >= v_mes_inicio),
           'reemplazados_mes', count(*) filter (where w.status = 'resolved' and w.resolution_type = 'replacement' and w.resolution_date >= v_mes_inicio),
           'reembolsos_mes', count(*) filter (where w.status = 'resolved' and w.resolution_type = 'refund' and w.resolution_date >= v_mes_inicio),
           'reembolsado_mes', coalesce(sum(w.refund_amount) filter (where w.status = 'resolved' and w.resolution_type = 'refund'
                                                                    and w.resolution_date >= v_mes_inicio), 0),
           'total', count(*))
    into v_kpis
    from public.warranty_claims w
   where w.organization_id = p_org;

  return jsonb_build_object('filas', coalesce(v_filas, '[]'::jsonb), 'total', coalesce(v_total, 0), 'kpis', v_kpis,
                            'hoy', v_hoy, 'permisos', public.fn_seriales_permisos(p_org));
end;
$$;

-- ── Detalle ──────────────────────────────────────────────────────────────────

create or replace function public.fn_garantia_detalle(p_org integer, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_w public.warranty_claims%rowtype;
  v_unidad jsonb;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  select * into v_w from public.warranty_claims where id = p_id and organization_id = p_org;
  if not found then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  v_unidad := public.fn_garantia_int_evaluar(p_org, v_w.serial_number_id);

  return jsonb_build_object(
    'id', v_w.id,
    'codigo', v_w.code,
    'estado', v_w.status,
    'fecha', v_w.claim_date,
    'motivo', v_w.claim_reason,
    'descripcion', v_w.description,
    'adjuntos', coalesce(v_w.attachments, '[]'::jsonb),
    'creado_por', public.fn_seriales_int_nombre_usuario(v_w.created_by),
    'aprobado', case when v_w.approved_at is not null then jsonb_build_object(
                  'fecha', v_w.approved_at, 'por', public.fn_seriales_int_nombre_usuario(v_w.approved_by)) end,
    'rma', case when v_w.supplier_rma_number is not null or v_w.rma_sent_at is not null then jsonb_build_object(
             'numero', v_w.supplier_rma_number, 'transportadora', v_w.rma_carrier, 'guia', v_w.rma_tracking,
             'notas', v_w.rma_notes, 'fecha', v_w.rma_sent_at,
             'por', public.fn_seriales_int_nombre_usuario(v_w.rma_sent_by)) end,
    'proveedor', coalesce(
       (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
          from public.suppliers s where s.id = v_w.supplier_id and s.organization_id = p_org),
       v_unidad->'proveedor'),
    'resolucion', case when v_w.status in ('resolved', 'rejected') then jsonb_build_object(
                    'tipo', v_w.resolution_type, 'notas', v_w.resolution, 'fecha', v_w.resolution_date,
                    'por', public.fn_seriales_int_nombre_usuario(v_w.resolved_by),
                    'monto', v_w.refund_amount, 'respuesta_proveedor', v_w.supplier_response,
                    'reemplazo', (select jsonb_build_object('id', r.id, 'serial', r.serial)
                                    from public.serial_numbers r
                                   where r.id = v_w.replacement_serial_id and r.organization_id = p_org)) end,
    'cliente', coalesce(
       (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
          from public.customers c where c.id = v_w.customer_id and c.organization_id = p_org),
       v_unidad->'cliente'),
    'unidad', v_unidad,
    'eventos', public.fn_seriales_int_eventos(p_org, v_w.serial_number_id),
    'hoy', public.fn_seriales_int_hoy(p_org),
    'permisos', public.fn_seriales_permisos(p_org));
end;
$$;

-- ── Serial para un reclamo nuevo (por id o por código escaneado) ─────────────

create or replace function public.fn_garantia_serial_para_reclamo(p_org integer, p_serial_id integer default null, p_codigo text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id integer := p_serial_id;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  if v_id is null and nullif(btrim(coalesce(p_codigo, '')), '') is not null then
    select sn.id into v_id
      from public.serial_numbers sn
     where sn.organization_id = p_org and lower(sn.serial) = lower(btrim(p_codigo))
     order by (sn.serial = btrim(p_codigo)) desc, sn.id
     limit 1;
  end if;
  if v_id is null then
    return jsonb_build_object('encontrado', false, 'puede', false, 'motivo', 'serial_no_encontrado');
  end if;
  return public.fn_garantia_int_evaluar(p_org, v_id);
end;
$$;

-- ── Crear ────────────────────────────────────────────────────────────────────

create or replace function public.fn_garantia_crear(p_org integer, p_serial_id integer, p_motivo text, p_descripcion text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sn public.serial_numbers%rowtype;
  v_eval jsonb;
  v_id uuid;
  v_codigo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform public.fn_seriales_int_exigir(p_org, true);
  if v_motivo is null or length(v_motivo) > 200 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  select * into v_sn from public.serial_numbers where id = p_serial_id and organization_id = p_org for update;
  if not found then
    raise exception 'serial_no_encontrado' using errcode = 'P0002';
  end if;
  v_eval := public.fn_garantia_int_evaluar(p_org, p_serial_id);
  if not (v_eval->>'puede')::boolean then
    raise exception '%', v_eval->>'motivo' using errcode = 'P0001';
  end if;

  v_codigo := public.fn_garantia_int_siguiente_codigo(p_org);
  insert into public.warranty_claims (
    organization_id, serial_number_id, customer_id, claim_date, claim_reason, description,
    status, created_by, supplier_id, code)
  values (p_org, v_sn.id, v_sn.sold_to_customer_id, now(), v_motivo,
          nullif(btrim(coalesce(p_descripcion, '')), ''), 'pending', auth.uid(), v_sn.supplier_id, v_codigo)
  returning id into v_id;

  update public.serial_numbers
     set status = 'warranty_claim', updated_at = now(), updated_by = auth.uid()
   where id = v_sn.id;

  perform public.fn_garantia_int_evento(p_org, v_sn.id, v_id, 'warranty_claim', v_sn.status, 'warranty_claim',
    v_sn.sold_to_customer_id, v_motivo, jsonb_build_object('reclamo', v_codigo));

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

-- ── Aprobar · rechazar ───────────────────────────────────────────────────────

create or replace function public.fn_garantia_cambiar_estado(p_org integer, p_id uuid, p_accion text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_w public.warranty_claims%rowtype;
  v_sn public.serial_numbers%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform public.fn_seriales_int_exigir(p_org, true);
  select * into v_w from public.warranty_claims where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  select * into v_sn from public.serial_numbers where id = v_w.serial_number_id for update;

  if p_accion = 'aprobar' then
    if v_w.status <> 'pending' then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    update public.warranty_claims
       set status = 'approved', approved_at = now(), approved_by = auth.uid()
     where id = v_w.id;
    perform public.fn_garantia_int_evento(p_org, v_sn.id, v_w.id, 'warranty_approved', v_sn.status, v_sn.status,
      v_w.customer_id, v_motivo, jsonb_build_object('reclamo', v_w.code));
    return jsonb_build_object('id', v_w.id, 'estado', 'approved');
  elsif p_accion = 'rechazar' then
    if v_w.status not in ('pending', 'approved', 'in_process') then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 500 then
      raise exception 'motivo_requerido' using errcode = '22023';
    end if;
    update public.warranty_claims
       set status = 'rejected', resolution_type = 'rejected', resolution = v_motivo,
           resolution_date = now(), resolved_by = auth.uid()
     where id = v_w.id;
    -- La unidad vuelve al cliente: su garantía sigue como estaba.
    if v_sn.status = 'warranty_claim' then
      update public.serial_numbers
         set status = 'sold', updated_at = now(), updated_by = auth.uid()
       where id = v_sn.id;
    end if;
    perform public.fn_garantia_int_evento(p_org, v_sn.id, v_w.id, 'warranty_resolved', v_sn.status,
      case when v_sn.status = 'warranty_claim' then 'sold' else v_sn.status end,
      v_w.customer_id, v_motivo, jsonb_build_object('reclamo', v_w.code, 'resolucion', 'rejected'));
    return jsonb_build_object('id', v_w.id, 'estado', 'rejected');
  end if;

  raise exception 'transicion_invalida' using errcode = 'P0001';
end;
$$;

-- ── Enviar al proveedor (RMA) ────────────────────────────────────────────────

create or replace function public.fn_garantia_enviar_rma(p_org integer, p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_w public.warranty_claims%rowtype;
  v_sn public.serial_numbers%rowtype;
  v_d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_rma text := nullif(btrim(coalesce(v_d->>'rma', '')), '');
  v_proveedor integer := case when coalesce(v_d->>'proveedor', '') ~ '^\d+$' then (v_d->>'proveedor')::integer end;
begin
  perform public.fn_seriales_int_exigir(p_org, true);
  select * into v_w from public.warranty_claims where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  if v_w.status not in ('pending', 'approved') then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  if v_rma is null or length(v_rma) > 80 then
    raise exception 'rma_requerido' using errcode = '22023';
  end if;
  v_proveedor := coalesce(v_proveedor, v_w.supplier_id);
  if v_proveedor is not null
     and not exists (select 1 from public.suppliers s where s.id = v_proveedor and s.organization_id = p_org) then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  select * into v_sn from public.serial_numbers where id = v_w.serial_number_id for update;

  update public.warranty_claims
     set status = 'in_process',
         supplier_id = v_proveedor,
         supplier_rma_number = v_rma,
         rma_carrier = nullif(btrim(coalesce(v_d->>'transportadora', '')), ''),
         rma_tracking = nullif(btrim(coalesce(v_d->>'guia', '')), ''),
         rma_notes = nullif(btrim(coalesce(v_d->>'notas', '')), ''),
         rma_sent_at = now(),
         rma_sent_by = auth.uid()
   where id = v_w.id;

  perform public.fn_garantia_int_evento(p_org, v_sn.id, v_w.id, 'rma_created', v_sn.status, v_sn.status,
    v_w.customer_id, nullif(btrim(coalesce(v_d->>'notas', '')), ''),
    jsonb_build_object('reclamo', v_w.code, 'rma', v_rma, 'proveedor', v_proveedor));

  return jsonb_build_object('id', v_w.id, 'estado', 'in_process', 'rma', v_rma);
end;
$$;

-- ── Unidades para reemplazo ──────────────────────────────────────────────────

create or replace function public.fn_garantia_reemplazos(p_org integer, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_producto integer;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  select sn.product_id into v_producto
    from public.warranty_claims w
    join public.serial_numbers sn on sn.id = w.serial_number_id
   where w.id = p_id and w.organization_id = p_org;
  if v_producto is null then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', sn.id, 'serial', sn.serial,
                   'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b
                                 where b.id = coalesce(sn.current_branch_id, sn.branch_id) and b.organization_id = p_org))
                 order by sn.serial), '[]'::jsonb)
            from (select * from public.serial_numbers s
                   where s.organization_id = p_org and s.product_id = v_producto and s.status = 'in_stock'
                   order by s.serial limit 200) sn);
end;
$$;

-- ── Resolver ─────────────────────────────────────────────────────────────────

create or replace function public.fn_garantia_resolver(p_org integer, p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_w public.warranty_claims%rowtype;
  v_sn public.serial_numbers%rowtype;
  v_r public.serial_numbers%rowtype;
  v_d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_tipo text := v_d->>'tipo';
  v_notas text := nullif(btrim(coalesce(v_d->>'notas', '')), '');
  v_respuesta text := nullif(btrim(coalesce(v_d->>'respuesta_proveedor', '')), '');
  v_monto numeric;
  v_reemplazo integer := case when coalesce(v_d->>'serial_reemplazo', '') ~ '^\d+$' then (v_d->>'serial_reemplazo')::integer end;
  v_estado_reclamada text;
begin
  perform public.fn_seriales_int_exigir(p_org, true);
  select * into v_w from public.warranty_claims where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'reclamo_no_encontrado' using errcode = 'P0002';
  end if;
  if v_w.status not in ('pending', 'approved', 'in_process') then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  if v_tipo is null or v_tipo not in ('repair', 'replacement', 'refund') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  select * into v_sn from public.serial_numbers where id = v_w.serial_number_id for update;

  if v_tipo = 'refund' then
    begin
      v_monto := nullif(v_d->>'monto', '')::numeric;
    exception when others then
      v_monto := null;
    end;
    if v_monto is null or v_monto <= 0 then
      raise exception 'monto_invalido' using errcode = '22023';
    end if;
  end if;

  if v_tipo = 'replacement' then
    if v_reemplazo is null then
      raise exception 'reemplazo_requerido' using errcode = '22023';
    end if;
    select * into v_r from public.serial_numbers
     where id = v_reemplazo and organization_id = p_org for update;
    if not found or v_r.product_id <> v_sn.product_id or v_r.status <> 'in_stock' or v_r.id = v_sn.id then
      raise exception 'reemplazo_invalido' using errcode = 'P0001';
    end if;
  end if;

  -- La unidad reclamada: reparada vuelve al cliente; reemplazada o reembolsada
  -- queda en la empresa como dañada (o en RMA si ya está con el proveedor).
  v_estado_reclamada := case
    when v_tipo = 'repair' then 'sold'
    when v_w.status = 'in_process' then 'rma'
    else 'damaged' end;

  update public.warranty_claims
     set status = 'resolved',
         resolution_type = v_tipo,
         resolution = v_notas,
         resolution_date = now(),
         resolved_by = auth.uid(),
         replacement_serial_id = case when v_tipo = 'replacement' then v_r.id end,
         refund_amount = case when v_tipo = 'refund' then v_monto end,
         supplier_response = coalesce(v_respuesta, supplier_response)
   where id = v_w.id;

  update public.serial_numbers
     set status = v_estado_reclamada, updated_at = now(), updated_by = auth.uid(),
         notes = case when v_tipo = 'repair' then notes
                      else btrim(coalesce(notes || E'\n', '') || 'Garantía ' || coalesce(v_w.code, '') ||
                                 case when v_tipo = 'replacement' then ': reemplazada por ' || v_r.serial
                                      else ': reembolsada' end) end
   where id = v_sn.id;

  perform public.fn_garantia_int_evento(p_org, v_sn.id, v_w.id, 'warranty_resolved', v_sn.status, v_estado_reclamada,
    v_w.customer_id, v_notas,
    jsonb_build_object('reclamo', v_w.code, 'resolucion', v_tipo,
                       'reemplazo', case when v_tipo = 'replacement' then v_r.serial end,
                       'monto', v_monto));

  if v_tipo = 'replacement' then
    -- La unidad nueva sale vendida al mismo cliente, enlazada a la venta
    -- original; su garantía empieza hoy (disparador trg_serial_garantia_desde_venta).
    update public.serial_numbers
       set status = 'sold',
           sold_to_customer_id = v_sn.sold_to_customer_id,
           sale_id = v_sn.sale_id,
           invoice_sale_id = v_sn.invoice_sale_id,
           sale_channel = coalesce(v_sn.sale_channel, 'in_stock'),
           sale_date = now(),
           sold_by_user_id = auth.uid(),
           price_at_sale = 0,
           warranty_months = coalesce(v_r.warranty_months, v_sn.warranty_months),
           updated_at = now(),
           updated_by = auth.uid(),
           notes = btrim(coalesce(notes || E'\n', '') || 'Reemplazo de garantía ' || coalesce(v_w.code, '') ||
                         ' (unidad ' || v_sn.serial || ')')
     where id = v_r.id;

    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status, from_branch_id,
      source_table, source_id, customer_id, performed_by, event_date, notes, metadata)
    values (v_r.id, p_org, 'sold', 'in_stock', 'sold', v_r.current_branch_id,
      'warranty_claims', v_w.id::text, v_sn.sold_to_customer_id, auth.uid(), now(),
      'Reemplazo de garantía ' || coalesce(v_w.code, ''),
      jsonb_build_object(
        'reclamo', v_w.code,
        'reemplazo_de', v_sn.serial,
        'stock_pendiente', jsonb_build_object(
          'producto', v_r.product_id,
          'sucursal', coalesce(v_r.current_branch_id, v_r.branch_id),
          'cantidad', -1,
          'origen', 'warranty_replacement',
          'reclamo', v_w.id)));
  end if;

  return jsonb_build_object('id', v_w.id, 'estado', 'resolved', 'tipo', v_tipo,
                            'reemplazo', case when v_tipo = 'replacement' then v_r.serial end);
end;
$$;

-- ── Privilegios ──────────────────────────────────────────────────────────────

revoke all on function public.fn_garantia_int_siguiente_codigo(integer) from public, anon, authenticated;
revoke all on function public.fn_garantia_int_evaluar(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_garantia_int_evento(integer, integer, uuid, text, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_garantia_int_siguiente_codigo(integer) to service_role;
grant execute on function public.fn_garantia_int_evaluar(integer, integer) to service_role;
grant execute on function public.fn_garantia_int_evento(integer, integer, uuid, text, text, text, uuid, text, jsonb) to service_role;

revoke all on function public.fn_garantias_listado(integer, jsonb) from public, anon;
revoke all on function public.fn_garantia_detalle(integer, uuid) from public, anon;
revoke all on function public.fn_garantia_serial_para_reclamo(integer, integer, text) from public, anon;
revoke all on function public.fn_garantia_crear(integer, integer, text, text) from public, anon;
revoke all on function public.fn_garantia_cambiar_estado(integer, uuid, text, text) from public, anon;
revoke all on function public.fn_garantia_enviar_rma(integer, uuid, jsonb) from public, anon;
revoke all on function public.fn_garantia_reemplazos(integer, uuid) from public, anon;
revoke all on function public.fn_garantia_resolver(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_garantias_listado(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_garantia_detalle(integer, uuid) to authenticated, service_role;
grant execute on function public.fn_garantia_serial_para_reclamo(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_garantia_crear(integer, integer, text, text) to authenticated, service_role;
grant execute on function public.fn_garantia_cambiar_estado(integer, uuid, text, text) to authenticated, service_role;
grant execute on function public.fn_garantia_enviar_rma(integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.fn_garantia_reemplazos(integer, uuid) to authenticated, service_role;
grant execute on function public.fn_garantia_resolver(integer, uuid, jsonb) to authenticated, service_role;
