-- IVA · clasificación fiscal por línea de documento (P3) y procedencia del IVA descontable (P9)
-- Respuestas del Contador del 2026-11-07: docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md
-- Explicación para el Contador: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- Reversión: supabase/rollbacks/20261108150000_iva_clasificacion_por_linea_rollback.sql
-- No depende de H1 (20261108140000) ni H1 depende de esta.
--
-- RONDA 2 DEL CONTADOR (2026-11-07), reescrita sin aplicar:
--   · B1: tipo de operación «exportación de bienes» / «exportación de servicios» y SOPORTE estructurado de la
--     línea (tipo, número y fecha: p. ej. la declaración de exportación). «Exenta» + un texto no prueba una
--     exportación: sin los tres datos del soporte, el borrador la deja pendiente.
--   · Corrección (b): se QUITA el selector libre «período en que se descuenta» (columna de período del descuento). La
--     oportunidad (art. 496) se deriva de la fecha de contabilización y del período fiscal; el borrador muestra la
--     fecha del documento y la de contabilización y señala la compra causada en un período anterior.
--   · Corrección (c): una línea de documento soporte (compra a un no responsable) no queda «descontable» por una
--     marca manual: la RPC lo rechaza salvo un supuesto especial (tipo «otra especial» o «importación») con su
--     fundamento, y aun así el borrador lo deja pendiente para su tratamiento propio.
--
-- Qué agrega (aditivo: columnas NULL-ables sin DEFAULT, sin DROP, sin cambios de tipo; no toca totales):
--   1. Por línea (invoice_items: venta, nota crédito/débito, compra, documento soporte; sale_items: POS):
--        iva_tratamiento     gravada | exenta | excluida | no_sujeta
--        iva_tarifa          tarifa en % (0 para exenta/excluida/no sujeta)
--        iva_tipo_operacion  bienes | servicios | exportacion_bienes | exportacion_servicios | importacion | aiu |
--                            licores | retiro_inventario | otra_especial
--        iva_soporte_tipo / iva_soporte_numero / iva_soporte_fecha  soporte de la condición (exportación u otra)
--        iva_fundamento      norma o soporte (obligatorio en la práctica para exentas: sin él, el borrador la
--                            deja «pendiente»)
--        iva_clasificacion_origen  sugerida (del impuesto/producto al crear la línea) | heredada (nota crédito:
--                            de la línea que acredita) | manual (la fijó una persona)
--        iva_clasificado_por / iva_clasificado_en
--      Solo invoice_items (compras y documento soporte):
--        iva_descontable     por_evaluar | descontable | no_descontable | proporcional  (ET arts. 485, 488, 490, 496)
--        iva_descontable_porcentaje (proporcional; art. 490, sustentado en el motivo), iva_descontable_motivo,
--        iva_descontable_evaluado_por / _en. Sin selector de período: el IVA se descuenta en el período fiscal de la
--        contabilización (ronda 2, corrección b).
--   2. fn_iva_sugerencia_linea: la sugerencia sale del IMPUESTO DE LA LÍNEA (tax_code/tax_rate ya normalizados)
--      y, si la línea no lo dice, del PRODUCTO (sus impuestos y su tipo producto/servicio). Nunca inventa:
--      si no se sabe, devuelve NULL y la línea queda «sin clasificar».
--   3. Disparador BEFORE INSERT/UPDATE en invoice_items y sale_items (trg_zz_iva_clasificacion: corre después de
--      trg_normalizar_impuesto_linea y de trg_invoice_items_marca_excluido, que fijan tax_code). Es el ÚNICO
--      punto que llena la clasificación: cubre las 16 funciones que escriben líneas (pos_checkout_v1,
--      fn_factura_venta_guardar, fn_fc_guardar_int, fn_documento_soporte_guardar, fn_nota_credito_emitir,
--      fn_nota_debito_emitir, procesar_devolucion, pos_anular_venta_v1, fn_sync_invoice_items_from_sale,
--      assistant_register_sale, assistant_register_sales_invoice, fn_cobrar_pedido_web_en_caja,
--      fn_confirmar_pedido_web_completo, fn_marcar_pedido_web_pagado_pasarela, pos_mesa_agregar_pedido_web)
--      y cualquier inserción directa, sin copiar la lógica en cada una.
--        · Solo escribe columnas iva_*: no cambia cantidades, precios, impuestos ni totales.
--        · Respeta lo que venga explícito. En UPDATE solo recalcula si la clasificación es «sugerida» y cambió
--          el impuesto o el producto DE LA LÍNEA; una clasificación manual o heredada no se toca.
--        · Cambiar después el producto (tabla products) no toca ninguna línea guardada.
--        · Línea de compra o soporte: iva_descontable = 'por_evaluar' (nunca «descontable» automático).
--        · Cualquier error dentro del disparador deja la línea como vino (no bloquea una venta ni una factura).
--   4. fn_iva_lineas_documento (lectura) y fn_iva_clasificar_linea (escritura con permiso y bitácora
--      iva_clasificacion_cambios). Las líneas históricas quedan NULL: no se rellenan; el borrador las muestra
--      «sin clasificar» hasta que alguien las clasifique.
--
-- Prueba en seco (org 374, begin … rollback, usuario simulado): docs/contador/pruebas/10_iva_clasificacion_y_300.sql

-- ── 1. Columnas ─────────────────────────────────────────────────────────────────
alter table public.invoice_items
  add column if not exists iva_tratamiento text
    constraint invoice_items_iva_tratamiento_chk check (iva_tratamiento in ('gravada', 'exenta', 'excluida', 'no_sujeta')),
  add column if not exists iva_tarifa numeric(6, 2)
    constraint invoice_items_iva_tarifa_chk check (iva_tarifa >= 0 and iva_tarifa <= 100),
  add column if not exists iva_tipo_operacion text
    constraint invoice_items_iva_tipo_operacion_chk check (iva_tipo_operacion in
      ('bienes', 'servicios', 'exportacion_bienes', 'exportacion_servicios', 'importacion', 'aiu', 'licores',
       'retiro_inventario', 'otra_especial')),
  add column if not exists iva_fundamento text
    constraint invoice_items_iva_fundamento_chk check (char_length(iva_fundamento) <= 500),
  add column if not exists iva_soporte_tipo text
    constraint invoice_items_iva_soporte_tipo_chk check (iva_soporte_tipo in ('declaracion_exportacion', 'soporte_exportacion_servicios', 'otro')),
  add column if not exists iva_soporte_numero text
    constraint invoice_items_iva_soporte_numero_chk check (char_length(iva_soporte_numero) <= 80),
  add column if not exists iva_soporte_fecha date,
  add column if not exists iva_clasificacion_origen text
    constraint invoice_items_iva_clasificacion_origen_chk check (iva_clasificacion_origen in ('sugerida', 'heredada', 'manual')),
  add column if not exists iva_clasificado_por uuid,
  add column if not exists iva_clasificado_en timestamptz,
  add column if not exists iva_descontable text
    constraint invoice_items_iva_descontable_chk check (iva_descontable in ('por_evaluar', 'descontable', 'no_descontable', 'proporcional')),
  add column if not exists iva_descontable_porcentaje numeric(5, 2)
    constraint invoice_items_iva_descontable_porcentaje_chk check (iva_descontable_porcentaje > 0 and iva_descontable_porcentaje < 100),
  add column if not exists iva_descontable_motivo text
    constraint invoice_items_iva_descontable_motivo_chk check (char_length(iva_descontable_motivo) <= 500),
  add column if not exists iva_descontable_evaluado_por uuid,
  add column if not exists iva_descontable_evaluado_en timestamptz;

alter table public.sale_items
  add column if not exists iva_tratamiento text
    constraint sale_items_iva_tratamiento_chk check (iva_tratamiento in ('gravada', 'exenta', 'excluida', 'no_sujeta')),
  add column if not exists iva_tarifa numeric(6, 2)
    constraint sale_items_iva_tarifa_chk check (iva_tarifa >= 0 and iva_tarifa <= 100),
  add column if not exists iva_tipo_operacion text
    constraint sale_items_iva_tipo_operacion_chk check (iva_tipo_operacion in
      ('bienes', 'servicios', 'exportacion_bienes', 'exportacion_servicios', 'importacion', 'aiu', 'licores',
       'retiro_inventario', 'otra_especial')),
  add column if not exists iva_fundamento text
    constraint sale_items_iva_fundamento_chk check (char_length(iva_fundamento) <= 500),
  add column if not exists iva_soporte_tipo text
    constraint sale_items_iva_soporte_tipo_chk check (iva_soporte_tipo in ('declaracion_exportacion', 'soporte_exportacion_servicios', 'otro')),
  add column if not exists iva_soporte_numero text
    constraint sale_items_iva_soporte_numero_chk check (char_length(iva_soporte_numero) <= 80),
  add column if not exists iva_soporte_fecha date,
  add column if not exists iva_clasificacion_origen text
    constraint sale_items_iva_clasificacion_origen_chk check (iva_clasificacion_origen in ('sugerida', 'heredada', 'manual')),
  add column if not exists iva_clasificado_por uuid,
  add column if not exists iva_clasificado_en timestamptz;

comment on column public.invoice_items.iva_tratamiento is
  'Tratamiento del IVA de la línea (gravada, exenta, excluida, no_sujeta). Sugerido al crear la línea; NULL = sin clasificar (líneas históricas). No cambia si cambia el producto.';
comment on column public.invoice_items.iva_descontable is
  'Solo compras y documento soporte: por_evaluar (por defecto), descontable, no_descontable (va al costo/gasto) o proporcional. Nunca se marca descontable automáticamente (ET arts. 485, 488, 490, 496).';
comment on column public.invoice_items.iva_soporte_numero is
  'Soporte de la condición de la línea (p. ej. número de la declaración de exportación). Con iva_soporte_tipo y iva_soporte_fecha; sin los tres, una exportación queda pendiente.';
comment on column public.sale_items.iva_tratamiento is
  'Tratamiento del IVA de la línea POS (gravada, exenta, excluida, no_sujeta). Sugerido al crear la línea; NULL = sin clasificar.';

-- Bitácora de cambios hechos por personas (las sugerencias del disparador no se registran: son el valor inicial).
create table if not exists public.iva_clasificacion_cambios (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  tabla text not null check (tabla in ('invoice_items', 'sale_items')),
  linea_id uuid not null,
  antes jsonb not null,
  despues jsonb not null,
  usuario uuid,
  creado_en timestamptz not null default now()
);
create index if not exists iva_clasificacion_cambios_org_linea_idx on public.iva_clasificacion_cambios (organization_id, linea_id);
alter table public.iva_clasificacion_cambios enable row level security;
drop policy if exists iva_clasificacion_cambios_select_miembros on public.iva_clasificacion_cambios;
create policy iva_clasificacion_cambios_select_miembros
  on public.iva_clasificacion_cambios for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.iva_clasificacion_cambios from anon;
revoke insert, update, delete, truncate, references, trigger on public.iva_clasificacion_cambios from authenticated;
grant select on public.iva_clasificacion_cambios to authenticated;

-- ── 2. Base de una línea de factura (misma fórmula que el recálculo de totales y el borrador v1) ──
create or replace function public.fn_iva_base_linea(p_qty numeric, p_precio numeric, p_descuento numeric, p_incluido boolean, p_tarifa numeric)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case when coalesce(p_incluido, false) and coalesce(p_tarifa, 0) > 0
              then round((coalesce(p_qty, 0) * coalesce(p_precio, 0) - coalesce(p_descuento, 0)) / (1 + p_tarifa / 100), 2)
              else round(coalesce(p_qty, 0) * coalesce(p_precio, 0) - coalesce(p_descuento, 0), 2) end;
$function$;

-- ── 3. Sugerencia ───────────────────────────────────────────────────────────────
create or replace function public.fn_iva_sugerencia_linea(
  p_organization_id integer,
  p_product_id integer,
  p_tax_code text,
  p_tax_rate numeric,
  p_tax_amount numeric default null,
  p_base numeric default null,
  p_is_excluded integer default null
)
returns table (tratamiento text, tarifa numeric, tipo_operacion text)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_tax_code, '')));
  v_rate numeric := coalesce(p_tax_rate, 0);
  v_tipo text;
  v_codes text[];
  v_cand numeric[];
begin
  if p_product_id is not null then
    select case p.product_type when 'service' then 'servicios' when 'product' then 'bienes' end
      into v_tipo
      from public.products p where p.id = p_product_id and p.organization_id = p_organization_id;
  end if;
  tipo_operacion := v_tipo;

  -- a) El impuesto de la línea.
  if v_code = 'IVA_EXCLUIDO' or coalesce(p_is_excluded, 0) = 1 then
    tratamiento := 'excluida'; tarifa := 0; return next; return;
  elsif v_code = 'IVA_0' then
    tratamiento := 'exenta'; tarifa := 0; return next; return;
  elsif v_code like 'INC%' then
    -- El INC no es IVA: la línea queda sin clasificar frente al IVA (decide una persona).
    return next; return;
  elsif v_rate > 0 then
    tratamiento := 'gravada'; tarifa := round(v_rate, 2); return next; return;
  end if;

  -- b) POS: IVA guardado con tarifa 0. Solo si coincide (±$1) con UNA tarifa de IVA de la organización.
  if coalesce(p_tax_amount, 0) > 0 and coalesce(p_base, 0) > 0 then
    select array_agg(distinct ot.rate) into v_cand
      from public.organization_taxes ot
      left join public.tax_templates t on t.id = ot.template_id
     where ot.organization_id = p_organization_id and coalesce(ot.is_active, true) and ot.kind = 'tax'
       and ot.rate > 0 and coalesce(t.code, 'IVA') like 'IVA%'
       and abs(round(p_base * ot.rate / 100, 2) - p_tax_amount) <= 1;
    if coalesce(array_length(v_cand, 1), 0) = 1 then
      tratamiento := 'gravada'; tarifa := round(v_cand[1], 2);
    end if;
    return next; return;
  end if;

  -- c) Línea sin impuesto: lo que diga el producto (excluido / exento). Si el producto es gravado y la línea
  --    no trae IVA, no se adivina.
  if p_product_id is not null and coalesce(p_tax_amount, 0) = 0 then
    select array_agg(distinct t.code) filter (where t.code is not null) into v_codes
      from public.product_tax_relations r
      join public.organization_taxes ot on ot.id = r.tax_id and ot.organization_id = p_organization_id and coalesce(ot.is_active, true)
      left join public.tax_templates t on t.id = ot.template_id
     where r.product_id = p_product_id;
    if v_codes is null then
      select array[t.code] into v_codes
        from public.products p join public.tax_templates t on t.id = p.tax_id
       where p.id = p_product_id and p.organization_id = p_organization_id;
    end if;
    if 'IVA_EXCLUIDO' = any (coalesce(v_codes, '{}')) and not ('IVA_0' = any (v_codes)) then
      tratamiento := 'excluida'; tarifa := 0;
    elsif 'IVA_0' = any (coalesce(v_codes, '{}')) and not ('IVA_EXCLUIDO' = any (v_codes)) then
      tratamiento := 'exenta'; tarifa := 0;
    end if;
  end if;
  return next;
end;
$function$;

comment on function public.fn_iva_sugerencia_linea(integer, integer, text, numeric, numeric, numeric, integer) is
  'Sugerencia de clasificación de IVA de una línea: del impuesto de la línea y, si no lo dice, del producto. NULL = no se sabe (la línea queda sin clasificar).';

-- ── 4. Disparador ───────────────────────────────────────────────────────────────
create or replace function public.fn_iva_clasificacion_linea_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_compra boolean := false;
  v_incluido boolean;
  v_base numeric;
  v_s record;
  v_c record;
  v_recalcular boolean;
begin
  if tg_op = 'UPDATE' then
    -- Solo se recalcula una clasificación sugerida (o vacía) cuando cambió el impuesto o el producto de la línea.
    if coalesce(new.iva_clasificacion_origen, 'sugerida') <> 'sugerida'
       or new.iva_tratamiento is distinct from old.iva_tratamiento then
      return new;
    end if;
    if tg_table_name = 'invoice_items' then
      v_recalcular := new.tax_code is distinct from old.tax_code or new.tax_rate is distinct from old.tax_rate
                      or new.product_id is distinct from old.product_id;
    else
      v_recalcular := new.tax_rate is distinct from old.tax_rate or new.tax_amount is distinct from old.tax_amount
                      or new.product_id is distinct from old.product_id;
    end if;
    if not v_recalcular then
      return new;
    end if;
    new.iva_tratamiento := null; new.iva_tarifa := null; new.iva_tipo_operacion := null;
    new.iva_clasificacion_origen := null;
  end if;

  if tg_table_name = 'invoice_items' then
    v_compra := new.invoice_type in ('purchase', 'support_document') or new.invoice_purchase_id is not null
                or (new.support_document_id is not null and coalesce(new.invoice_type, '') <> 'sale');
    if tg_op = 'INSERT' and v_compra and new.iva_descontable is null then
      new.iva_descontable := 'por_evaluar';
    end if;
    if new.iva_tratamiento is not null then
      new.iva_clasificacion_origen := coalesce(new.iva_clasificacion_origen, 'manual');
      return new;
    end if;

    -- Nota crédito: hereda la clasificación de la línea que acredita.
    if new.credited_item_id is not null then
      select c.iva_tratamiento, c.iva_tarifa, c.iva_tipo_operacion, c.iva_fundamento into v_c
        from public.invoice_items c where c.id = new.credited_item_id;
      if v_c.iva_tratamiento is not null then
        new.iva_tratamiento := v_c.iva_tratamiento; new.iva_tarifa := v_c.iva_tarifa;
        new.iva_tipo_operacion := v_c.iva_tipo_operacion; new.iva_fundamento := coalesce(new.iva_fundamento, v_c.iva_fundamento);
        new.iva_clasificacion_origen := 'heredada';
        return new;
      end if;
    end if;

    if new.invoice_purchase_id is not null or new.invoice_type = 'purchase' then
      select p.organization_id into v_org from public.invoice_purchase p where p.id = coalesce(new.invoice_purchase_id, new.invoice_id);
    elsif new.invoice_type = 'support_document' then
      select d.organization_id into v_org from public.support_documents d where d.id = coalesce(new.support_document_id, new.invoice_id);
    else
      select f.organization_id into v_org from public.invoice_sales f where f.id = coalesce(new.invoice_sales_id, new.invoice_id);
    end if;
    if v_org is null then
      return new;
    end if;
    select * into v_s from public.fn_iva_sugerencia_linea(v_org, new.product_id, new.tax_code, new.tax_rate, null, null, new.is_excluded);
  else
    select s.organization_id, s.tax_included into v_org, v_incluido from public.sales s where s.id = new.sale_id;
    if v_org is null or new.iva_tratamiento is not null then
      if new.iva_tratamiento is not null then
        new.iva_clasificacion_origen := coalesce(new.iva_clasificacion_origen, 'manual');
      end if;
      return new;
    end if;
    v_base := case when coalesce(new.tax_included, v_incluido, false) then coalesce(new.total, 0) - coalesce(new.tax_amount, 0)
                   else coalesce(new.total, 0) end;
    select * into v_s from public.fn_iva_sugerencia_linea(v_org, new.product_id, null, new.tax_rate, new.tax_amount, v_base, null);
  end if;

  new.iva_tipo_operacion := coalesce(new.iva_tipo_operacion, v_s.tipo_operacion);
  if v_s.tratamiento is not null then
    new.iva_tratamiento := v_s.tratamiento;
    new.iva_tarifa := v_s.tarifa;
    new.iva_clasificacion_origen := 'sugerida';
    new.iva_clasificado_en := now();
  end if;
  return new;
exception when others then
  -- Nunca bloquea la venta ni la factura: la línea queda sin clasificar.
  return new;
end;
$function$;

revoke all on function public.fn_iva_clasificacion_linea_trg() from public, anon, authenticated;

drop trigger if exists trg_zz_iva_clasificacion on public.invoice_items;
create trigger trg_zz_iva_clasificacion
  before insert or update of tax_code, tax_rate, product_id on public.invoice_items
  for each row execute function public.fn_iva_clasificacion_linea_trg();

drop trigger if exists trg_zz_iva_clasificacion on public.sale_items;
create trigger trg_zz_iva_clasificacion
  before insert or update of tax_rate, tax_amount, product_id on public.sale_items
  for each row execute function public.fn_iva_clasificacion_linea_trg();

-- ── 5. Lectura: líneas de un documento con su clasificación y la sugerencia actual ──
-- p_tipo: factura_venta (también notas crédito y débito) | factura_compra | documento_soporte | venta_pos
create or replace function public.fn_iva_lineas_documento(p_organization_id integer, p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.view')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  if p_tipo = 'venta_pos' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabla', 'sale_items', 'id', si.id, 'descripcion', coalesce(p.name, ''), 'product_id', si.product_id,
             'cantidad', si.quantity,
             'base', case when coalesce(si.tax_included, s.tax_included, false) then coalesce(si.total, 0) - coalesce(si.tax_amount, 0) else coalesce(si.total, 0) end,
             'iva', coalesce(si.tax_amount, 0), 'tax_code', null, 'tax_rate', si.tax_rate, 'compra', false,
             'clasificacion', jsonb_build_object('tratamiento', si.iva_tratamiento, 'tarifa', si.iva_tarifa,
               'tipo_operacion', si.iva_tipo_operacion, 'fundamento', si.iva_fundamento, 'origen', si.iva_clasificacion_origen,
               'soporte_tipo', si.iva_soporte_tipo, 'soporte_numero', si.iva_soporte_numero, 'soporte_fecha', si.iva_soporte_fecha),
             'soporte_doc', false,
             'sugerencia', (select to_jsonb(g) from public.fn_iva_sugerencia_linea(p_organization_id, si.product_id, null, si.tax_rate, si.tax_amount,
               case when coalesce(si.tax_included, s.tax_included, false) then coalesce(si.total, 0) - coalesce(si.tax_amount, 0) else coalesce(si.total, 0) end, null) g)
           ) order by si.created_at, si.id), '[]'::jsonb)
      into v_res
      from public.sales s join public.sale_items si on si.sale_id = s.id
      left join public.products p on p.id = si.product_id
     where s.id = p_id and s.organization_id = p_organization_id;
    return jsonb_build_object('tipo', p_tipo, 'id', p_id, 'lineas', v_res);
  end if;

  if p_tipo not in ('factura_venta', 'factura_compra', 'documento_soporte') then
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tabla', 'invoice_items', 'id', it.id, 'descripcion', it.description, 'product_id', it.product_id,
           'cantidad', it.qty,
           'base', abs(b.base), 'iva', abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)),
           'tax_code', it.tax_code, 'tax_rate', it.tax_rate, 'compra', p_tipo <> 'factura_venta',
           'clasificacion', jsonb_build_object('tratamiento', it.iva_tratamiento, 'tarifa', it.iva_tarifa,
             'tipo_operacion', it.iva_tipo_operacion, 'fundamento', it.iva_fundamento, 'origen', it.iva_clasificacion_origen,
             'soporte_tipo', it.iva_soporte_tipo, 'soporte_numero', it.iva_soporte_numero, 'soporte_fecha', it.iva_soporte_fecha),
           'soporte_doc', p_tipo = 'documento_soporte',
           'descontable', case when p_tipo <> 'factura_venta' then jsonb_build_object('estado', coalesce(it.iva_descontable, 'por_evaluar'),
             'porcentaje', it.iva_descontable_porcentaje, 'motivo', it.iva_descontable_motivo) end,
           'sugerencia', (select to_jsonb(g) from public.fn_iva_sugerencia_linea(p_organization_id, it.product_id, it.tax_code, it.tax_rate, null, null, it.is_excluded) g)
         ) order by it.created_at, it.id), '[]'::jsonb)
    into v_res
    from public.invoice_items it
    cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
   where (p_tipo = 'factura_venta' and coalesce(it.invoice_sales_id, case when it.invoice_type = 'sale' then it.invoice_id end) = p_id
          and exists (select 1 from public.invoice_sales f where f.id = p_id and f.organization_id = p_organization_id))
      or (p_tipo = 'factura_compra' and coalesce(it.invoice_purchase_id, case when it.invoice_type = 'purchase' then it.invoice_id end) = p_id
          and exists (select 1 from public.invoice_purchase f where f.id = p_id and f.organization_id = p_organization_id))
      or (p_tipo = 'documento_soporte' and it.support_document_id = p_id and it.invoice_type = 'support_document'
          and exists (select 1 from public.support_documents d where d.id = p_id and d.organization_id = p_organization_id));
  return jsonb_build_object('tipo', p_tipo, 'id', p_id, 'lineas', v_res);
end;
$function$;

comment on function public.fn_iva_lineas_documento(integer, text, uuid) is
  'Líneas de un documento con su clasificación de IVA guardada y la sugerencia actual (solo lectura). Requiere finance.view.';
revoke all on function public.fn_iva_lineas_documento(integer, text, uuid) from public, anon;
grant execute on function public.fn_iva_lineas_documento(integer, text, uuid) to authenticated;

-- ── 6. Escritura: clasificar una línea (persona con finance.create o admin) ──
-- p_datos: { tratamiento, tarifa, tipo_operacion, fundamento, soporte_tipo?, soporte_numero?, soporte_fecha?,
--            descontable?, descontable_porcentaje?, descontable_motivo? }
-- Las claves de «descontable» solo se aceptan en líneas de compra o documento soporte; si no vienen, no se tocan.
-- Ronda 2: exportación solo con tratamiento «exenta»; en documento soporte, «descontable» o «proporcional» solo en un
-- supuesto especial (tipo «otra especial» o «importación») con fundamento: SOPORTE_NO_DESCONTABLE si no.
create or replace function public.fn_iva_clasificar_linea(p_organization_id integer, p_tabla text, p_linea_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_compra boolean := false;
  v_soporte_doc boolean := false;
  v_antes jsonb;
  v_despues jsonb;
  v_trat text := nullif(btrim(coalesce(p_datos ->> 'tratamiento', '')), '');
  v_tarifa numeric := nullif(p_datos ->> 'tarifa', '')::numeric;
  v_tipo text := nullif(btrim(coalesce(p_datos ->> 'tipo_operacion', '')), '');
  v_fund text := nullif(btrim(coalesce(p_datos ->> 'fundamento', '')), '');
  v_desc text := nullif(btrim(coalesce(p_datos ->> 'descontable', '')), '');
  v_pct numeric := nullif(p_datos ->> 'descontable_porcentaje', '')::numeric;
  v_motivo text := nullif(btrim(coalesce(p_datos ->> 'descontable_motivo', '')), '');
  v_sop_tipo text := nullif(btrim(coalesce(p_datos ->> 'soporte_tipo', '')), '');
  v_sop_num text := nullif(btrim(coalesce(p_datos ->> 'soporte_numero', '')), '');
  v_sop_fecha date := nullif(p_datos ->> 'soporte_fecha', '')::date;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.create')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  -- La línea debe ser de la organización (por su documento).
  if p_tabla = 'invoice_items' then
    select coalesce(fs.organization_id, fp.organization_id, ds.organization_id),
           (it.invoice_type in ('purchase', 'support_document') or it.invoice_purchase_id is not null),
           it.invoice_type = 'support_document',
           jsonb_build_object('tratamiento', it.iva_tratamiento, 'tarifa', it.iva_tarifa, 'tipo_operacion', it.iva_tipo_operacion,
             'fundamento', it.iva_fundamento, 'origen', it.iva_clasificacion_origen, 'descontable', it.iva_descontable,
             'descontable_porcentaje', it.iva_descontable_porcentaje, 'descontable_motivo', it.iva_descontable_motivo,
             'soporte_tipo', it.iva_soporte_tipo, 'soporte_numero', it.iva_soporte_numero, 'soporte_fecha', it.iva_soporte_fecha)
      into v_org, v_compra, v_soporte_doc, v_antes
      from public.invoice_items it
      left join public.invoice_sales fs on it.invoice_type = 'sale' and fs.id = coalesce(it.invoice_sales_id, it.invoice_id)
      left join public.invoice_purchase fp on it.invoice_type = 'purchase' and fp.id = coalesce(it.invoice_purchase_id, it.invoice_id)
      left join public.support_documents ds on it.invoice_type = 'support_document' and ds.id = it.support_document_id
     where it.id = p_linea_id;
  elsif p_tabla = 'sale_items' then
    select s.organization_id, false, false,
           jsonb_build_object('tratamiento', si.iva_tratamiento, 'tarifa', si.iva_tarifa, 'tipo_operacion', si.iva_tipo_operacion,
             'fundamento', si.iva_fundamento, 'origen', si.iva_clasificacion_origen,
             'soporte_tipo', si.iva_soporte_tipo, 'soporte_numero', si.iva_soporte_numero, 'soporte_fecha', si.iva_soporte_fecha)
      into v_org, v_compra, v_soporte_doc, v_antes
      from public.sale_items si join public.sales s on s.id = si.sale_id
     where si.id = p_linea_id;
  else
    raise exception 'TABLA_INVALIDA' using errcode = '22023';
  end if;
  if v_org is null or v_org <> p_organization_id then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;

  -- Validaciones de la clasificación.
  if v_trat is null or v_trat not in ('gravada', 'exenta', 'excluida', 'no_sujeta') then
    raise exception 'TRATAMIENTO_INVALIDO' using errcode = '22023';
  end if;
  if v_trat = 'gravada' and (v_tarifa is null or v_tarifa <= 0 or v_tarifa > 100) then
    raise exception 'TARIFA_INVALIDA' using errcode = '22023';
  end if;
  if v_trat <> 'gravada' then
    if coalesce(v_tarifa, 0) <> 0 then
      raise exception 'TARIFA_INVALIDA' using errcode = '22023';
    end if;
    v_tarifa := 0;
  end if;
  if v_tipo is not null and v_tipo not in ('bienes', 'servicios', 'exportacion_bienes', 'exportacion_servicios', 'importacion', 'aiu',
                                           'licores', 'retiro_inventario', 'otra_especial') then
    raise exception 'TIPO_OPERACION_INVALIDO' using errcode = '22023';
  end if;
  -- B1: una exportación es exenta (art. 481); gravada o excluida con tipo exportación no se acepta.
  if v_tipo in ('exportacion_bienes', 'exportacion_servicios') and v_trat <> 'exenta' then
    raise exception 'EXPORTACION_DEBE_SER_EXENTA' using errcode = '22023';
  end if;
  if v_sop_tipo is not null and v_sop_tipo not in ('declaracion_exportacion', 'soporte_exportacion_servicios', 'otro') then
    raise exception 'SOPORTE_INVALIDO' using errcode = '22023';
  end if;
  if char_length(coalesce(v_fund, '')) > 500 or char_length(coalesce(v_motivo, '')) > 500 or char_length(coalesce(v_sop_num, '')) > 80 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;

  -- Validaciones de la procedencia del descontable (solo compras / soporte).
  if p_datos ? 'descontable' then
    if not v_compra then
      raise exception 'DESCONTABLE_SOLO_COMPRAS' using errcode = '22023';
    end if;
    if v_desc is null or v_desc not in ('por_evaluar', 'descontable', 'no_descontable', 'proporcional') then
      raise exception 'DESCONTABLE_INVALIDO' using errcode = '22023';
    end if;
    if v_desc = 'proporcional' and (v_pct is null or v_pct <= 0 or v_pct >= 100) then
      raise exception 'PORCENTAJE_INVALIDO' using errcode = '22023';
    end if;
    if v_desc <> 'proporcional' then
      v_pct := null;
    end if;
    if v_desc <> 'por_evaluar' and v_motivo is null then
      raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
    end if;
    -- Corrección (c): compra a un no responsable (documento soporte) no genera IVA descontable por una marca manual.
    if v_soporte_doc and v_desc in ('descontable', 'proporcional')
       and (coalesce(v_tipo, '') not in ('otra_especial', 'importacion') or v_fund is null) then
      raise exception 'SOPORTE_NO_DESCONTABLE' using errcode = '22023';
    end if;
  end if;

  if p_tabla = 'invoice_items' then
    update public.invoice_items it set
      iva_tratamiento = v_trat, iva_tarifa = v_tarifa, iva_tipo_operacion = v_tipo, iva_fundamento = v_fund,
      iva_soporte_tipo = v_sop_tipo, iva_soporte_numero = v_sop_num, iva_soporte_fecha = v_sop_fecha,
      iva_clasificacion_origen = 'manual', iva_clasificado_por = v_uid, iva_clasificado_en = now(),
      iva_descontable = case when p_datos ? 'descontable' then v_desc else it.iva_descontable end,
      iva_descontable_porcentaje = case when p_datos ? 'descontable' then v_pct else it.iva_descontable_porcentaje end,
      iva_descontable_motivo = case when p_datos ? 'descontable' then v_motivo else it.iva_descontable_motivo end,
      iva_descontable_evaluado_por = case when p_datos ? 'descontable' then v_uid else it.iva_descontable_evaluado_por end,
      iva_descontable_evaluado_en = case when p_datos ? 'descontable' then now() else it.iva_descontable_evaluado_en end
     where it.id = p_linea_id
    returning jsonb_build_object('tratamiento', it.iva_tratamiento, 'tarifa', it.iva_tarifa, 'tipo_operacion', it.iva_tipo_operacion,
             'fundamento', it.iva_fundamento, 'origen', it.iva_clasificacion_origen, 'descontable', it.iva_descontable,
             'descontable_porcentaje', it.iva_descontable_porcentaje, 'descontable_motivo', it.iva_descontable_motivo,
             'soporte_tipo', it.iva_soporte_tipo, 'soporte_numero', it.iva_soporte_numero, 'soporte_fecha', it.iva_soporte_fecha)
      into v_despues;
  else
    update public.sale_items si set
      iva_tratamiento = v_trat, iva_tarifa = v_tarifa, iva_tipo_operacion = v_tipo, iva_fundamento = v_fund,
      iva_soporte_tipo = v_sop_tipo, iva_soporte_numero = v_sop_num, iva_soporte_fecha = v_sop_fecha,
      iva_clasificacion_origen = 'manual', iva_clasificado_por = v_uid, iva_clasificado_en = now()
     where si.id = p_linea_id
    returning jsonb_build_object('tratamiento', si.iva_tratamiento, 'tarifa', si.iva_tarifa, 'tipo_operacion', si.iva_tipo_operacion,
             'fundamento', si.iva_fundamento, 'origen', si.iva_clasificacion_origen,
             'soporte_tipo', si.iva_soporte_tipo, 'soporte_numero', si.iva_soporte_numero, 'soporte_fecha', si.iva_soporte_fecha)
      into v_despues;
  end if;

  insert into public.iva_clasificacion_cambios (organization_id, tabla, linea_id, antes, despues, usuario)
  values (p_organization_id, p_tabla, p_linea_id, v_antes, v_despues, v_uid);

  return v_despues;
end;
$function$;

comment on function public.fn_iva_clasificar_linea(integer, text, uuid, jsonb) is
  'Fija la clasificación de IVA de una línea (y, en compras, la procedencia del descontable) con bitácora. Requiere finance.create o admin.full_access. No cambia importes.';
revoke all on function public.fn_iva_clasificar_linea(integer, text, uuid, jsonb) from public, anon;
grant execute on function public.fn_iva_clasificar_linea(integer, text, uuid, jsonb) to authenticated;
