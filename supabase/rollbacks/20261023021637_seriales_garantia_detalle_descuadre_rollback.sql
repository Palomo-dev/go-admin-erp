-- Rollback de 20261023021637_seriales_garantia_detalle_descuadre.sql
-- Restaura evaluar, detalle y crear de garantía como estaban en
-- 20260929040500_inv_b4_garantias_funciones.sql (no hubo un reemplazo
-- posterior antes de este bloque). Pierde reclamante, nota crédito en el
-- detalle y la fecha de garantía calculada cuando el serial no la tiene.
-- No borra reclamos ni datos de contacto ya guardados: las columnas las
-- quita el rollback de 20261023021111, que va después.
-- Ejecutar antes de borrar esas columnas.

drop function if exists public.fn_seriales_descuadre(integer);
drop function if exists public.fn_garantia_crear(integer, integer, text, text, text, text, text, text);

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


revoke all on function public.fn_garantia_int_evaluar(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_garantia_detalle(integer, uuid) from public, anon;
grant execute on function public.fn_garantia_detalle(integer, uuid) to authenticated, service_role;
revoke all on function public.fn_garantia_crear(integer, integer, text, text) from public, anon;
grant execute on function public.fn_garantia_crear(integer, integer, text, text) to authenticated, service_role;
