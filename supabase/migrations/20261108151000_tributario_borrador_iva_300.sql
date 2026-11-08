-- Borrador del IVA · formulario 300 por casillas oficiales (versión 2). Respuestas del Contador del 2026-11-07
-- (P2, P3, P4, P9 y «Condiciones… IVA»): docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md
-- Explicación para el Contador, casilla por casilla y con ejemplos: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md
-- ESCRITA, NO APLICADA. Se aplica por el MCP después de 20261108150000 y 20261108150500.
-- Reversión: supabase/rollbacks/20261108151000_tributario_borrador_iva_300_rollback.sql
--
-- NO reemplaza fn_tributario_borrador_iva (v1, aplicada): es una función nueva, fn_tributario_borrador_iva_300.
-- Solo lectura (STABLE). Nada se presenta ni se firma ante la DIAN. El sistema NUNCA lo marca «aprobado
-- fiscalmente»: «conciliado» solo dice que cuadra con los libros (cuentas 2408).
--
-- Casillas (tabla del Contador, formulario e instructivo 2026, operaciones ordinarias):
--   ventas gravadas 5 % ............... base 27 · IVA 58      ventas tarifa general ........ base 28 · IVA 59
--   compras nacionales de bienes 5 % .. base 50 · IVA 71      bienes tarifa general ........ base 51 · IVA 72
--   servicios nacionales 5 % .......... base 52 · IVA 74      servicios tarifa general ..... base 53 · IVA 75
--   devoluciones de ventas ............ base 42 · IVA 79
--   devoluciones de compras ........... base 56 · IVA 66 SOLO si la compra devuelta tuvo IVA evaluado
--                                        «descontable» (o proporcional); si no, pendiente.
-- Reglas (cada valor sale de una línea guardada o de un asiento, y lleva el enlace a su origen):
--   · Documentos con asiento publicado en el período: ventas POS, facturas de venta, notas crédito y débito de
--     venta, facturas de compra y documentos soporte. Su IVA de libros (2408) se compara con el de sus líneas
--     (±$1). Si no cuadra, no tiene líneas o el documento ya tenía asiento en un período anterior, el documento
--     entero queda PENDIENTE con el valor de los libros. Nunca se reparte por adivinación.
--   · Cada línea va a su casilla según SU clasificación guardada (20261108150000), no la del producto:
--       gravada 5 %/19 % de bienes o servicios → su casilla; nota crédito de venta → 42/79 (en el período de la
--       nota, aunque la factura sea de otro: se señala «entre períodos»); nota débito → como venta.
--       Sin clasificar, tipo de operación vacío, operaciones especiales (licores, AIU, importación, retiro de
--       inventario, otra), tarifa distinta de 5/19, tarifa de la clasificación que no coincide con el IVA de la
--       línea, exenta sin fundamento → PENDIENTE con su base e IVA.
--       Exenta con fundamento, excluida y no sujeta → «casilla por confirmar» (con su base): el Contador no fijó
--       aún su casilla.
--   · Compras y soporte: solo el IVA evaluado «descontable» (o la parte del «proporcional») entra en 71/72/74/75.
--       por evaluar → pendiente; no descontable → pendiente «marcado no descontable pero contabilizado en 2408»
--       (pide un ajuste contable); período de descuento posterior → pendiente «se descuenta en otro período».
--       El IVA de compras de períodos anteriores marcado para descontarse en ESTE período entra en sus casillas
--       señalado «de otro período» y fuera de la conciliación (no está en la 2408 de este período).
--   · Otros movimientos de la 2408 (sin documento con líneas), por su naturaleza (20261108150500):
--       registrada por una persona, o deducida solo si es inequívoca: cierre de ejercicio; traslado entre
--       auxiliares (neto 2408 del asiento = 0); pago desde caja/banco con todas sus otras líneas en 11xx.
--       Pago a la DIAN, traslado y cierre → «no afecta» (no es IVA generado ni descontable).
--       Devolución de compra → 56/66 (ver arriba). Ajuste procedente con soporte → «por diligenciar».
--       Reversa contable de un documento → pendiente («una reversa no sustituye una nota crédito»): la venta
--       original se conserva en su casilla; nada se compensa en silencio. Lo demás (manual sin soporte,
--       importación, otro) → pendiente con su valor.
--     Excepción técnica: un asiento recontabilizado (journal_reversals con repost) cuyo original y reversa caen
--     en el mismo período se omite (corrige el asiento, no la operación); el nuevo asiento sí se lee.
--   · Períodos declarados (tributario_iva_declaraciones): se señalan los documentos y asientos grabados después
--     de la fecha de presentación de un período ya declarado.
--   · Valores del formulario redondeados a miles (como el formulario), con la diferencia de redondeo por casilla.
--     Resumen preliminar = IVA generado (58+59+66) − descontable (71+72+74+75+79). NO es saldo a pagar: faltan
--     las casillas «por diligenciar» (saldo a favor anterior, retenciones de IVA sufridas, ajustes, sanciones).
--   · Conciliación: neto de la 2408 del período (crédito − débito) = efecto de casillas + pendientes + otros
--     movimientos + redondeo líneas/libros. «conciliado» si la diferencia es ≤ $1.
-- SECURITY DEFINER con guarda de pertenencia y finance.view (o admin.full_access); sin anon.
-- Prueba en seco (org 374, begin … rollback): docs/contador/pruebas/10_iva_clasificacion_y_300.sql

create or replace function public.fn_tributario_borrador_iva_300(p_organization_id integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
  v_ini timestamptz;
  v_fin timestamptz;
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.view')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'PERIODO_INVALIDO' using errcode = '22023';
  end if;

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  v_ini := p_desde::timestamp at time zone v_tz;
  v_fin := (p_hasta + 1)::timestamp at time zone v_tz;

  with
  decl as (
    select d.desde, d.hasta, d.numero_formulario, d.presentada_en,
           ((d.presentada_en + 1)::timestamp at time zone v_tz) as despues_de
      from public.tributario_iva_declaraciones d where d.organization_id = p_organization_id
  ),
  en_periodo as (
    select je.id, je.source, je.source_id, je.entry_date, je.created_at,
           case when je.fact_key ~ '^reversal:[0-9]+$' then substring(je.fact_key from 10)::integer end as revierte_a
      from public.journal_entries je
     where je.organization_id = p_organization_id and je.posted
       and je.entry_date >= v_ini and je.entry_date < v_fin
  ),
  mov as (
    select e.*, coalesce(x.neto, 0) as neto, coalesce(x.toca, false) as toca, coalesce(x.solo_disp, false) as solo_disp
      from en_periodo e
      left join lateral (
        select sum(case when l.account_code like '2408%' then l.credit - l.debit else 0 end) as neto,
               bool_or(l.account_code like '2408%') as toca,
               bool_and(l.account_code like '2408%' or l.account_code like '11%') as solo_disp
          from public.journal_lines l where l.journal_entry_id = e.id) x on true
  ),
  -- Recontabilizaciones técnicas con original y reversa dentro del período: se omiten las dos.
  omitidos as (
    select r.original_entry_id as id from public.journal_reversals r
     where r.organization_id = p_organization_id and r.repost_entry_id is not null
       and r.original_entry_id in (select id from en_periodo) and r.reversal_entry_id in (select id from en_periodo)
    union
    select r.reversal_entry_id from public.journal_reversals r
     where r.organization_id = p_organization_id and r.repost_entry_id is not null
       and r.original_entry_id in (select id from en_periodo) and r.reversal_entry_id in (select id from en_periodo)
  ),
  doc_mov as (
    select m.* from mov m
     where m.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase', 'support_documents')
       and m.revierte_a is null and m.id not in (select id from omitidos)
  ),
  docs as (
    select m.source, m.source_id, array_agg(m.id order by m.id) as asientos, sum(m.neto) as neto,
           min(m.entry_date) as fecha, max(m.created_at) as grabado
      from doc_mov m group by m.source, m.source_id
  ),
  docs_info as (
    select d.*,
           case when d.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d.source_id::uuid end as doc_uuid,
           case when d.source in ('sales', 'sale') then 'venta_pos'
                when d.source = 'invoice_purchase' then 'factura_compra'
                when d.source = 'support_documents' then 'documento_soporte'
                when f.document_type = 'credit_note' then 'nota_credito'
                when f.document_type = 'debit_note' then 'nota_debito'
                else 'factura_venta' end as clase,
           case when d.source in ('invoice_purchase', 'support_documents') then 'descontable' else 'generado' end as lado,
           coalesce(f.number, p.number_ext, sd.number, sd.reference_code) as numero,
           fo.id as origen_id, fo.number as origen_numero,
           (fo.issue_date is not null and fo.issue_date < v_ini) as entre_periodos,
           exists (select 1 from public.journal_entries a
                    where a.organization_id = p_organization_id and a.posted and a.source = d.source
                      and a.source_id = d.source_id and a.entry_date < v_ini) as previo,
           exists (select 1 from decl x where (d.fecha at time zone v_tz)::date between x.desde and x.hasta
                    and d.grabado >= x.despues_de) as posterior_declaracion
      from docs d
      left join public.invoice_sales f on d.source = 'invoice_sales' and f.id::text = d.source_id and f.organization_id = p_organization_id
      left join public.invoice_sales fo on fo.id = f.related_invoice_id and f.document_type = 'credit_note'
      left join public.invoice_purchase p on d.source = 'invoice_purchase' and p.id::text = d.source_id and p.organization_id = p_organization_id
      left join public.support_documents sd on d.source = 'support_documents' and sd.id::text = d.source_id and sd.organization_id = p_organization_id
  ),
  -- Compras de períodos anteriores con IVA marcado para descontarse en ESTE período (art. 496).
  arrastre_docs as (
    select x.source, x.source_id, x.asientos, x.fecha, x.numero
      from (
        select 'invoice_purchase'::text as source, p.id::text as source_id, p.number_ext as numero,
               (select array_agg(a.id order by a.id) from public.journal_entries a
                 where a.organization_id = p_organization_id and a.posted and a.source = 'invoice_purchase' and a.source_id = p.id::text) as asientos,
               (select min(a.entry_date) from public.journal_entries a
                 where a.organization_id = p_organization_id and a.posted and a.source = 'invoice_purchase' and a.source_id = p.id::text) as fecha
          from public.invoice_purchase p
         where p.organization_id = p_organization_id
           and exists (select 1 from public.invoice_items it
                        where coalesce(it.invoice_purchase_id, case when it.invoice_type = 'purchase' then it.invoice_id end) = p.id
                          and it.iva_descontable in ('descontable', 'proporcional') and it.iva_descontable_periodo between p_desde and p_hasta)
        union all
        select 'support_documents', sd.id::text, coalesce(sd.number, sd.reference_code),
               (select array_agg(a.id order by a.id) from public.journal_entries a
                 where a.organization_id = p_organization_id and a.posted and a.source = 'support_documents' and a.source_id = sd.id::text),
               (select min(a.entry_date) from public.journal_entries a
                 where a.organization_id = p_organization_id and a.posted and a.source = 'support_documents' and a.source_id = sd.id::text)
          from public.support_documents sd
         where sd.organization_id = p_organization_id
           and exists (select 1 from public.invoice_items it
                        where it.support_document_id = sd.id and it.invoice_type = 'support_document'
                          and it.iva_descontable in ('descontable', 'proporcional') and it.iva_descontable_periodo between p_desde and p_hasta)
      ) x
     where x.fecha is not null and x.fecha < v_ini
  ),
  lineas as (
    -- POS
    select di.source, di.source_id, di.clase, di.lado, false as arrastre, 'sale_items'::text as tabla, si.id as linea_id,
           (case when coalesce(si.tax_included, s.tax_included, false) then coalesce(si.total, 0) - coalesce(si.tax_amount, 0)
                 else coalesce(si.total, 0) end)::numeric as base,
           coalesce(si.tax_amount, 0)::numeric as iva,
           si.iva_tratamiento as trat, si.iva_tarifa as tarifa, si.iva_tipo_operacion as tipo, si.iva_fundamento as fund,
           null::text as desc_estado, null::numeric as pct, null::date as desc_periodo
      from docs_info di
      join public.sales s on s.id = di.doc_uuid and s.organization_id = p_organization_id
      join public.sale_items si on si.sale_id = s.id
     where di.clase = 'venta_pos'
    union all
    -- Factura de venta, nota crédito, nota débito
    select di.source, di.source_id, di.clase, di.lado, false, 'invoice_items', it.id,
           abs(b.base), abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)),
           it.iva_tratamiento, it.iva_tarifa, it.iva_tipo_operacion, it.iva_fundamento, null, null, null
      from docs_info di
      join public.invoice_items it on (it.invoice_sales_id = di.doc_uuid or (it.invoice_id = di.doc_uuid and it.invoice_type = 'sale'))
      cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
     where di.clase in ('factura_venta', 'nota_credito', 'nota_debito')
    union all
    -- Compras y documento soporte del período, y compras de períodos anteriores que se descuentan en este
    select c.source, c.source_id, c.clase, 'descontable', c.arrastre, 'invoice_items', it.id,
           abs(b.base), abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)),
           it.iva_tratamiento, it.iva_tarifa, it.iva_tipo_operacion, it.iva_fundamento,
           coalesce(it.iva_descontable, 'por_evaluar'), it.iva_descontable_porcentaje, it.iva_descontable_periodo
      from (
        select di.source, di.source_id, di.doc_uuid, di.clase, false as arrastre from docs_info di where di.lado = 'descontable'
        union all
        select a.source, a.source_id, a.source_id::uuid, case a.source when 'invoice_purchase' then 'factura_compra' else 'documento_soporte' end, true
          from arrastre_docs a
      ) c
      join public.invoice_items it on
           (c.source = 'invoice_purchase' and (it.invoice_purchase_id = c.doc_uuid or (it.invoice_id = c.doc_uuid and it.invoice_type = 'purchase')))
        or (c.source = 'support_documents' and it.support_document_id = c.doc_uuid and it.invoice_type = 'support_document')
      cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
     where not c.arrastre
        or (it.iva_descontable in ('descontable', 'proporcional') and it.iva_descontable_periodo between p_desde and p_hasta)
  ),
  por_doc as (
    select l.source, l.source_id, count(*) as n, sum(l.iva) as iva, sum(l.base) as base
      from lineas l where not l.arrastre group by l.source, l.source_id
  ),
  estado_doc as (
    select di.*, coalesce(pd.n, 0) as n_lineas, coalesce(pd.base, 0) as base_lineas,
           -- IVA de libros en su sentido normal: venta/ND + crédito; NC débito (positivo); compra débito (positivo).
           case when di.lado = 'descontable' then -di.neto when di.clase = 'nota_credito' then -di.neto else di.neto end as iva_libro,
           -- Documento que ya tenía asiento en un período anterior: sus líneas ya se declararon allá. Si este
           -- asiento no mueve la 2408 (p. ej. aplicación de retenciones) no tiene efecto en el IVA.
           case when di.previo and abs(di.neto) < 0.005 then 'sin_efecto_iva'
                when di.previo then 'documento_de_otro_periodo'
                when coalesce(pd.n, 0) = 0 then 'sin_lineas'
                when abs(coalesce(pd.iva, 0) - case when di.lado = 'descontable' then -di.neto when di.clase = 'nota_credito' then -di.neto else di.neto end) > 1 then 'no_cuadra'
           end as motivo_doc
      from docs_info di
      left join por_doc pd on pd.source = di.source and pd.source_id = di.source_id
  ),
  lin_estado as (
    select l.*,
           case
             when l.trat is null then 'sin_clasificar'
             when l.trat = 'gravada' and abs(round(l.base * l.tarifa / 100, 2) - l.iva) > 1 then 'tarifa_inconsistente'
             when l.trat <> 'gravada' and l.iva > 0.5 then 'tarifa_inconsistente'
             when l.trat = 'gravada' and l.tipo is null then 'sin_tipo_operacion'
             when l.trat = 'gravada' and l.tipo not in ('bienes', 'servicios') then 'operacion_especial'
             when l.trat = 'gravada' and l.tarifa not in (5, 19) then 'tarifa_no_prevista'
             when l.trat = 'exenta' and l.fund is null then 'exenta_sin_soporte'
             when l.trat <> 'gravada' then 'casilla_por_confirmar'
             when l.lado = 'descontable' and l.desc_estado = 'por_evaluar' then 'descontable_por_evaluar'
             when l.lado = 'descontable' and l.desc_estado = 'no_descontable' then 'no_descontable_en_2408'
             when l.lado = 'descontable' and not l.arrastre and l.desc_periodo > p_hasta then 'descontable_en_otro_periodo'
           end as motivo
      from lineas l
      left join estado_doc e on e.source = l.source and e.source_id = l.source_id
     where l.arrastre or e.motivo_doc is null
  ),
  partes as (
    -- Una línea «proporcional» se parte en el IVA descontable (a su casilla) y el resto (pendiente).
    select le.*, pt.principal,
           case when pt.principal then le.base end as base_parte,
           case when le.motivo is null and le.desc_estado = 'proporcional'
                then case when pt.principal then round(le.iva * le.pct / 100, 2) else le.iva - round(le.iva * le.pct / 100, 2) end
                else le.iva end as iva_parte,
           case when pt.principal then le.motivo else 'no_descontable_en_2408' end as motivo_parte
      from lin_estado le
      cross join lateral (
        select true as principal
        union all
        select false where le.motivo is null and le.desc_estado = 'proporcional'
      ) pt
  ),
  items_lineas as (
    select p.lado, p.clase, p.source, p.source_id, p.tabla, p.linea_id, p.base_parte as base, p.iva_parte as iva,
           -- Efecto en la 2408 (crédito − débito). El arrastre no está en los libros de este período.
           case when p.arrastre then 0
                when p.lado = 'descontable' then -p.iva_parte
                when p.clase = 'nota_credito' then -p.iva_parte
                else p.iva_parte end as efecto,
           p.motivo_parte as motivo,
           case when p.motivo_parte is not null then null
                when p.clase = 'nota_credito' then 42
                when p.lado = 'generado' then case p.tarifa when 5 then 27 else 28 end
                when p.tipo = 'bienes' then case p.tarifa when 5 then 50 else 51 end
                else case p.tarifa when 5 then 52 else 53 end end as casilla_base,
           case when p.motivo_parte is not null then null
                when p.clase = 'nota_credito' then 79
                when p.lado = 'generado' then case p.tarifa when 5 then 58 else 59 end
                when p.tipo = 'bienes' then case p.tarifa when 5 then 71 else 72 end
                else case p.tarifa when 5 then 74 else 75 end end as casilla_iva,
           p.arrastre
      from partes p
  ),
  items_docs as (
    -- Documento entero pendiente (no cuadra, sin líneas o con asiento de otro período): valor de los libros.
    select e.lado, e.clase, e.source, e.source_id, null::text as tabla, null::uuid as linea_id,
           e.base_lineas as base, e.iva_libro as iva, e.neto as efecto, e.motivo_doc as motivo,
           null::integer as casilla_base, null::integer as casilla_iva, false as arrastre
      from estado_doc e where e.motivo_doc is not null and e.motivo_doc <> 'sin_efecto_iva'
  ),
  redondeo as (
    select coalesce(sum(e.neto - coalesce((select sum(i.efecto) from items_lineas i
                                             where i.source = e.source and i.source_id = e.source_id and not i.arrastre), 0)), 0) as valor
      from estado_doc e where e.motivo_doc is null
  ),
  -- Otros movimientos de la 2408
  otros as (
    select m.id, m.source, m.neto, m.created_at, m.entry_date, m.revierte_a,
           n.naturaleza as declarada, n.invoice_purchase_id, n.base as base_declarada, n.soporte,
           coalesce(n.naturaleza,
             case when m.source = 'cierre_ejercicio' then 'cierre'
                  when m.revierte_a is not null then 'reversa_contable'
                  when abs(m.neto) < 0.005 then 'traslado_auxiliares'
                  when m.source in ('cash_movements', 'bank_transactions') and m.solo_disp and m.neto < 0 then 'pago_dian'
                  else 'sin_soporte' end) as naturaleza,
           exists (select 1 from decl x where (m.entry_date at time zone v_tz)::date between x.desde and x.hasta
                    and m.created_at >= x.despues_de) as posterior_declaracion
      from mov m
      left join public.tributario_iva_naturaleza_asiento n on n.organization_id = p_organization_id and n.journal_entry_id = m.id
     where m.toca and m.id not in (select id from omitidos)
       and not (m.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase', 'support_documents') and m.revierte_a is null)
  ),
  otros_dest as (
    select o.*,
           case
             when o.naturaleza in ('pago_dian', 'traslado_auxiliares', 'cierre') then 'no_afecta'
             when o.naturaleza = 'ajuste_procedente' then 'por_diligenciar'
             when o.naturaleza = 'devolucion_compra' and exists (
                    select 1 from public.invoice_items it
                     where coalesce(it.invoice_purchase_id, case when it.invoice_type = 'purchase' then it.invoice_id end) = o.invoice_purchase_id
                       and it.iva_descontable in ('descontable', 'proporcional')
                       and coalesce(it.iva_descontable_periodo, p_hasta) <= p_hasta) then 'casilla'
             else 'pendiente' end as destino,
           case o.naturaleza
             when 'reversa_contable' then 'reversa_contable'
             when 'devolucion_compra' then 'devolucion_compra_sin_descuento'
             when 'importacion' then 'operacion_especial'
             when 'otro' then 'otro_movimiento'
             else 'sin_soporte' end as motivo
      from otros o
  ),
  items_otros as (
    select 'otros'::text as lado, 'asiento'::text as clase, od.source, od.id::text as source_id, null::text as tabla, null::uuid as linea_id,
           od.base_declarada as base, od.neto as iva, od.neto as efecto, od.motivo,
           56 as casilla_base, 66 as casilla_iva, false as arrastre
      from otros_dest od where od.destino = 'casilla'
  ),
  items as (
    select * from items_lineas
    union all select * from items_docs
    union all select * from items_otros
  ),
  -- Metadatos de cada origen para los enlaces.
  origen as (
    select i.*, coalesce(di.numero, ad.numero) as numero,
           coalesce(di.asientos, ad.asientos, case when i.clase = 'asiento' then array[i.source_id::integer] end) as asientos,
           (coalesce(di.fecha, ad.fecha, (select m.entry_date from mov m where i.clase = 'asiento' and m.id::text = i.source_id)) at time zone v_tz)::date as fecha,
           coalesce(di.entre_periodos, false) as entre_periodos,
           di.origen_id, di.origen_numero,
           coalesce(di.posterior_declaracion, false) as posterior_declaracion
      from items i
      left join docs_info di on di.source = i.source and di.source_id = i.source_id and not i.arrastre
      left join arrastre_docs ad on ad.source = i.source and ad.source_id = i.source_id and i.arrastre
  ),
  origen_json as (
    select o.*, jsonb_build_object(
             'clase', o.clase, 'documento_id', o.source_id, 'numero', o.numero, 'fecha', o.fecha,
             'tabla', o.tabla, 'linea_id', o.linea_id, 'base', o.base, 'iva', o.iva,
             'asiento', o.asientos[1],
             'entre_periodos', o.entre_periodos, 'de_otro_periodo', o.arrastre,
             'posterior_declaracion', o.posterior_declaracion,
             'factura_origen', case when o.origen_id is not null then jsonb_build_object('id', o.origen_id, 'numero', o.origen_numero) end
           ) as j
      from origen o
  ),
  casillas_val as (
    select c.casilla, c.tipo, c.par, sum(c.valor) as valor, count(*) as n,
           (array_agg(c.j order by c.fecha, c.source_id))[1:200] as origenes,
           bool_or(c.entre_periodos or c.arrastre or c.posterior_declaracion) as senalada
      from (
        select o.casilla_base as casilla, 'base'::text as tipo, o.casilla_iva as par, coalesce(o.base, 0) as valor, o.j, o.fecha, o.source_id,
               o.entre_periodos, o.arrastre, o.posterior_declaracion
          from origen_json o where o.casilla_base is not null and o.base is not null
        union all
        select o.casilla_iva, 'iva', o.casilla_base, o.iva, o.j, o.fecha, o.source_id, o.entre_periodos, o.arrastre, o.posterior_declaracion
          from origen_json o where o.casilla_iva is not null
      ) c
     group by c.casilla, c.tipo, c.par
  ),
  catalogo (casilla, tipo, par, concepto, lado) as (
    values (27, 'base', 58, 'ventas_5', 'generado'), (58, 'iva', 27, 'ventas_5', 'generado'),
           (28, 'base', 59, 'ventas_general', 'generado'), (59, 'iva', 28, 'ventas_general', 'generado'),
           (42, 'base', 79, 'devoluciones_ventas', 'descontable'), (79, 'iva', 42, 'devoluciones_ventas', 'descontable'),
           (50, 'base', 71, 'compras_bienes_5', 'descontable'), (71, 'iva', 50, 'compras_bienes_5', 'descontable'),
           (51, 'base', 72, 'compras_bienes_general', 'descontable'), (72, 'iva', 51, 'compras_bienes_general', 'descontable'),
           (52, 'base', 74, 'compras_servicios_5', 'descontable'), (74, 'iva', 52, 'compras_servicios_5', 'descontable'),
           (53, 'base', 75, 'compras_servicios_general', 'descontable'), (75, 'iva', 53, 'compras_servicios_general', 'descontable'),
           (56, 'base', 66, 'devoluciones_compras', 'generado'), (66, 'iva', 56, 'devoluciones_compras', 'generado')
  ),
  casillas as (
    select k.casilla, k.tipo, k.par, k.concepto, k.lado,
           coalesce(v.valor, 0) as valor,
           round(coalesce(v.valor, 0), -3) as valor_formulario,
           round(coalesce(v.valor, 0), -3) - coalesce(v.valor, 0) as diferencia_redondeo,
           coalesce(v.n, 0) as n, coalesce(v.origenes, '{}'::jsonb[]) as origenes, coalesce(v.senalada, false) as senalada
      from catalogo k left join casillas_val v on v.casilla = k.casilla and v.tipo = k.tipo
  ),
  pend as (
    select o.motivo, o.lado, sum(coalesce(o.base, 0)) as base, sum(o.iva) as iva, sum(o.efecto) as efecto, count(*) as n,
           (array_agg(o.j order by o.fecha, o.source_id))[1:200] as origenes
      from origen_json o where o.casilla_base is null and o.casilla_iva is null and o.motivo is not null
     group by o.motivo, o.lado
  ),
  otros_json as (
    select od.*, jsonb_build_object(
             'asiento', od.id, 'origen', od.source, 'fecha', (od.entry_date at time zone v_tz)::date, 'valor', od.neto,
             'naturaleza', od.naturaleza, 'declarada', od.declarada is not null, 'destino', od.destino,
             'motivo', case when od.destino = 'pendiente' then od.motivo end,
             'soporte', od.soporte, 'revierte_a', od.revierte_a,
             'factura_compra', od.invoice_purchase_id, 'base', od.base_declarada,
             'posterior_declaracion', od.posterior_declaracion) as j
      from otros_dest od
  ),
  totales as (
    select
      (select coalesce(sum(m.neto), 0) from mov m) as libro_2408,
      (select coalesce(sum(i.efecto), 0) from items i where i.casilla_iva is not null and i.clase <> 'asiento') as efecto_casillas,
      (select coalesce(sum(p.efecto), 0) from pend p) as efecto_pendientes,
      (select coalesce(sum(od.neto), 0) from otros_dest od where od.destino <> 'pendiente') as efecto_otros,
      (select coalesce(sum(od.neto), 0) from otros_dest od where od.destino = 'pendiente') as efecto_otros_pendientes,
      (select r.valor from redondeo r) as redondeo_lineas
  ),
  resumen as (
    select
      (select coalesce(sum(c.valor), 0) from casillas c where c.casilla in (58, 59, 66)) as generado,
      (select coalesce(sum(c.valor_formulario), 0) from casillas c where c.casilla in (58, 59, 66)) as generado_form,
      (select coalesce(sum(c.valor), 0) from casillas c where c.casilla in (71, 72, 74, 75, 79)) as descontable,
      (select coalesce(sum(c.valor_formulario), 0) from casillas c where c.casilla in (71, 72, 74, 75, 79)) as descontable_form
  )
  select jsonb_build_object(
    'version', 2,
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'zona', v_tz),
    'estado', case when abs(t.libro_2408 - (t.efecto_casillas + t.efecto_pendientes + t.efecto_otros + t.efecto_otros_pendientes + t.redondeo_lineas)) <= 1
                   then 'conciliado' else 'no_conciliado' end,
    'aprobado_fiscalmente', false,
    'liquidacion_completa', false,
    'periodo_declarado', (select jsonb_build_object('desde', x.desde, 'hasta', x.hasta, 'numero_formulario', x.numero_formulario, 'presentada_en', x.presentada_en)
                            from decl x where x.desde <= p_hasta and x.hasta >= p_desde order by x.desde limit 1),
    'casillas', coalesce((select jsonb_agg(jsonb_build_object(
                   'casilla', c.casilla, 'tipo', c.tipo, 'par', c.par, 'concepto', c.concepto, 'lado', c.lado,
                   'valor', c.valor, 'valor_formulario', c.valor_formulario, 'diferencia_redondeo', c.diferencia_redondeo,
                   'total_origenes', c.n, 'senalada', c.senalada, 'origenes', to_jsonb(c.origenes)) order by c.casilla)
                 from casillas c), '[]'::jsonb),
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object(
                   'motivo', p.motivo, 'lado', p.lado, 'base', p.base, 'iva', p.iva, 'efecto_2408', p.efecto,
                   'total_origenes', p.n, 'origenes', to_jsonb(p.origenes))
                   order by case p.lado when 'generado' then 1 when 'descontable' then 2 else 3 end, p.motivo)
                 from pend p), '[]'::jsonb),
    'otros_movimientos', coalesce((select jsonb_agg(o.j order by o.entry_date, o.id) from otros_json o), '[]'::jsonb),
    'por_diligenciar', jsonb_build_array(
       jsonb_build_object('clave', 'saldo_favor_anterior', 'valor', null),
       jsonb_build_object('clave', 'retenciones_iva_sufridas', 'valor', null),
       jsonb_build_object('clave', 'ajustes', 'valor',
         (select sum(od.neto) from otros_dest od where od.destino = 'por_diligenciar'),
         'asientos', coalesce((select jsonb_agg(od.id order by od.id) from otros_dest od where od.destino = 'por_diligenciar'), '[]'::jsonb)),
       jsonb_build_object('clave', 'sanciones', 'valor', null)),
    'resumen', jsonb_build_object(
       'iva_generado', r.generado, 'iva_generado_formulario', r.generado_form,
       'iva_descontable', r.descontable, 'iva_descontable_formulario', r.descontable_form,
       'diferencia_preliminar', r.generado - r.descontable,
       'diferencia_preliminar_formulario', r.generado_form - r.descontable_form,
       'pendientes', (select coalesce(sum(p.n), 0) from pend p) + (select count(*) from otros_dest od where od.destino = 'pendiente'),
       'pendientes_iva', (select coalesce(sum(p.iva), 0) from pend p where p.lado <> 'otros')
                         + (select coalesce(sum(abs(od.neto)), 0) from otros_dest od where od.destino = 'pendiente')),
    'conciliacion', jsonb_build_object(
       'libro_2408', t.libro_2408,
       'casillas', t.efecto_casillas, 'pendientes', t.efecto_pendientes + t.efecto_otros_pendientes,
       'otros_no_afectan_o_por_diligenciar', t.efecto_otros, 'redondeo_lineas_libros', t.redondeo_lineas,
       'diferencia', t.libro_2408 - (t.efecto_casillas + t.efecto_pendientes + t.efecto_otros + t.efecto_otros_pendientes + t.redondeo_lineas)),
    'alertas', jsonb_build_object(
       'documentos_entre_periodos', (select count(distinct (o.source, o.source_id)) from origen o where o.entre_periodos),
       'descontable_de_otros_periodos', (select count(distinct (o.source, o.source_id)) from origen o where o.arrastre),
       'grabados_despues_de_declarar', (
         select coalesce(jsonb_agg(jsonb_build_object('asiento', a.id, 'origen', a.source, 'documento_id', a.source_id,
                  'fecha', (a.entry_date at time zone v_tz)::date, 'grabado', a.created_at, 'periodo_declarado',
                  jsonb_build_object('desde', a.desde, 'hasta', a.hasta)) order by a.entry_date), '[]'::jsonb)
           from (select je.id, je.source, je.source_id, je.entry_date, je.created_at, x.desde, x.hasta
                   from public.journal_entries je
                   join decl x on (je.entry_date at time zone v_tz)::date between x.desde and x.hasta and je.created_at >= x.despues_de
                  where je.organization_id = p_organization_id and je.posted
                    and (je.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase', 'support_documents')
                         or exists (select 1 from public.journal_lines l where l.journal_entry_id = je.id and l.account_code like '2408%'))
                  order by je.entry_date limit 50) a)),
    'calculado_en', now()
  ) into v_res
  from totales t, resumen r;

  return v_res;
end;
$function$;

comment on function public.fn_tributario_borrador_iva_300(integer, date, date) is
  'Borrador del formulario 300 por casillas oficiales (tabla del Contador 2026-11-07) desde las líneas clasificadas y los asientos 2408, con pendientes, otros movimientos por naturaleza, casillas por diligenciar y conciliación. Solo lectura; nunca aprobado fiscalmente.';
revoke all on function public.fn_tributario_borrador_iva_300(integer, date, date) from public, anon;
grant execute on function public.fn_tributario_borrador_iva_300(integer, date, date) to authenticated;
