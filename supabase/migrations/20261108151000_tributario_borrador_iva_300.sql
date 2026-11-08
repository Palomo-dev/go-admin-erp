-- Borrador del IVA · formulario 300 por casillas oficiales (versión 2). Respuestas del Contador del 2026-11-07
-- (P2, P3, P4, P9 y «Condiciones… IVA», y RONDA 2: B1–B7 y tres correcciones):
--   docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md · docs/contador/RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md
-- Explicación para el Contador, casilla por casilla y con ejemplos: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md
-- ESCRITA, NO APLICADA. Se aplica por el MCP después de 20261108150000 y 20261108150500.
-- Reversión: supabase/rollbacks/20261108151000_tributario_borrador_iva_300_rollback.sql
--
-- NO reemplaza fn_tributario_borrador_iva (v1, aplicada): es una función nueva, fn_tributario_borrador_iva_300.
-- Solo lectura (STABLE). Nada se presenta ni se firma ante la DIAN. El sistema NUNCA lo marca «aprobado
-- fiscalmente»: «conciliado» solo dice que cuadra con los libros (cuentas 2408).
--
-- Casillas (formulario e instructivo 2026, operaciones ordinarias; tablas del Contador, rondas 1 y 2):
--   ventas gravadas 5 % ............... base 27 · IVA 58      ventas tarifa general ........ base 28 · IVA 59
--   exportación de bienes ............. base 30               exportación de servicios ..... base 31
--   exentas nacionales (instructivo) .. base 35               excluidas .................... base 39
--   ingresos no gravados .............. base 40               devoluciones de ventas ....... base 42 · IVA 79
--   importaciones no gravadas ......... base 47
--   compras nacionales de bienes 5 % .. base 50 · IVA 71      bienes tarifa general ........ base 51 · IVA 72
--   servicios nacionales 5 % .......... base 52 · IVA 74      servicios tarifa general ..... base 53 · IVA 75
--   compras exentas/excluidas/no grav.  base 54               devoluciones de compras ...... base 56 · IVA 66
-- Reglas (cada valor sale de una línea guardada o de un asiento, y lleva el enlace a su origen):
--   · Documentos con asiento publicado en el período (período fiscal pedido; la fecha que cuenta es la de
--     CONTABILIZACIÓN): ventas POS, facturas de venta, notas crédito y débito de venta, facturas de compra y
--     documentos soporte. Su IVA de libros (2408) se compara con el de sus líneas (±$1). Si no cuadra, no tiene
--     líneas o ya tenía asiento en un período anterior, el documento entero queda PENDIENTE con el valor de los
--     libros. Nunca se reparte por adivinación.
--   · Cada línea va a su casilla según SU clasificación guardada (20261108150000), no la del producto:
--       ventas gravadas 5/19 de bienes o servicios → 27/58, 28/59; nota débito igual (B2), señalada si su
--       factura es de otro período («corrige una omisión: evaluar la declaración de ese período»);
--       nota crédito → 42/79 en el período de la nota, señalada «entre períodos» si la factura es de otro.
--       B1 (sin IVA): exportación (exenta, tipo exportación) → 30 bienes / 31 servicios SOLO con soporte completo
--       (tipo, número y fecha; si no, pendiente «exportación sin soporte»); exenta nacional → 35; excluida → 39;
--       no sujeta → 40; compras: importación no gravada → 47; compras exentas, excluidas o no gravadas → 54.
--       Las exentas, excluidas y no sujetas exigen fundamento; sin él, pendiente.
--   · Compras (corrección a): la BASE de una compra gravada de bienes o servicios 5/19 va a 50/51/52/53 aunque su
--       IVA no sea descontable. El IVA entra en 71/72/74/75 solo si se evaluó «descontable»; «proporcional» (B3):
--       la base completa y solo el % del IVA sustentado (art. 490); el resto del IVA y el «no descontable» →
--       pendiente «contabilizado en 2408»; «por evaluar» → pendiente.
--     Corrección (b): sin selector de período. Una compra cuya fecha de documento es anterior al período pedido
--       se señala «causada en un período anterior · verificar oportunidad (art. 496)»; su base no se mueve.
--     Corrección (c): documento soporte (compra a un no responsable) con IVA → pendiente «supuesto especial»;
--       nunca entra en 71–75 por una marca manual.
--     B5 (ronda 3, migración 20261108152000): si el IVA no descontable se determinó ANTES de contabilizar, el asiento
--       de compra lo lleva al costo y la 2408 del documento es menor. El borrador lo reconoce: si la 2408 del
--       documento = IVA de sus líneas − IVA no descontable (±$1), ese IVA no queda pendiente (no está en la 2408) y
--       se informa en resumen.iva_no_descontable_al_costo. Si la 2408 tiene el IVA completo, el pendiente de siempre.
--   · Otros movimientos de la 2408 (sin documento con líneas), por su naturaleza REGISTRADA con soporte
--     (20261108150500). Ronda 2: la contrapartida banco/caja o la suma cero en 2408 son SEÑALES («sugerido:
--     pago a la DIAN / traslado · por confirmar»), no clasificación: quedan pendientes hasta que se registren.
--     Solo el cierre de ejercicio (origen del asiento) se reconoce sin registro.
--       Pago a la DIAN, traslado y cierre registrados → «no afecta». Ajuste procedente → «por diligenciar».
--       Devolución de compra (B4, con compra, líneas, base e IVA que cuadran) → base a 56 siempre; IVA a 66 solo
--       la parte de líneas cuyo IVA se evaluó descontable; el resto, pendiente.
--       Reversa contable de un documento → pendiente (B6: control provisional; no sustituye la nota crédito).
--       Corrección de error registrada sobre la reversa (la operación nunca existió). Ronda 3: solo cuando está
--       COMPLETA (soporte con su tipo, número y fecha; documento electrónico resuelto —nota crédito electrónica,
--       anulación ante la DIAN o constancia— con referencia y fecha; y la marca de si corresponde corregir una
--       declaración anterior) la venta y su reversa salen de las casillas, si son del mismo período. Incompleta: la
--       venta sigue en sus casillas y la reversa queda pendiente «corrección de error incompleta». Si el período de
--       la venta está declarado o la marca dice que sí, alerta «correcciones_declaracion_anterior». De otro
--       período: pendiente.
--     Excepción técnica: un asiento recontabilizado (journal_reversals con repost) cuyo original y reversa caen
--     en el mismo período se omite (corrige el asiento, no la operación); el nuevo asiento sí se lee.
--   · Períodos declarados (tributario_iva_declaraciones): se señalan los asientos grabados después de la fecha
--     de presentación de un período ya declarado.
--   · Valores del formulario redondeados a miles, con la diferencia de redondeo por casilla. Resumen preliminar =
--     IVA generado (58+59+66) − descontable (71+72+74+75+79). NO es saldo a pagar: faltan las casillas «por
--     diligenciar» (saldo a favor anterior, retenciones de IVA sufridas, ajustes, sanciones).
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
  nat as (
    select n.* from public.tributario_iva_naturaleza_asiento n where n.organization_id = p_organization_id
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
  -- B6: reversa registrada como «corrección de error» (la operación nunca existió) cuyo original es del período.
  corregidos as (
    -- Ronda 3: solo la corrección COMPLETA saca la venta de las casillas.
    select m.revierte_a as id
      from mov m join nat n on n.journal_entry_id = m.id and n.naturaleza = 'correccion_error'
     where m.revierte_a in (select id from en_periodo)
       and n.soporte_tipo is not null and n.soporte is not null and n.soporte_fecha is not null
       and n.doc_electronico_resolucion is not null and n.doc_electronico_referencia is not null
       and n.doc_electronico_fecha is not null and n.corrige_declaracion_anterior is not null
  ),
  doc_mov as (
    select m.* from mov m
     where m.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase', 'support_documents')
       and m.revierte_a is null and m.id not in (select id from omitidos) and m.id not in (select id from corregidos)
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
           (coalesce(f.issue_date, p.issue_date, sd.issue_date, s.sale_date) at time zone v_tz)::date as fecha_documento,
           fo.id as origen_id, fo.number as origen_numero,
           (f.document_type = 'credit_note' and fo.issue_date is not null and fo.issue_date < v_ini) as entre_periodos,
           (f.document_type = 'debit_note' and fo.issue_date is not null and fo.issue_date < v_ini) as corrige_otro_periodo,
           (d.source in ('invoice_purchase', 'support_documents') and coalesce(p.issue_date, sd.issue_date) < v_ini) as causado_antes,
           exists (select 1 from public.journal_entries a
                    where a.organization_id = p_organization_id and a.posted and a.source = d.source
                      and a.source_id = d.source_id and a.entry_date < v_ini) as previo,
           exists (select 1 from decl x where (d.fecha at time zone v_tz)::date between x.desde and x.hasta
                    and d.grabado >= x.despues_de) as posterior_declaracion
      from docs d
      left join public.invoice_sales f on d.source = 'invoice_sales' and f.id::text = d.source_id and f.organization_id = p_organization_id
      left join public.invoice_sales fo on fo.id = f.related_invoice_id and f.document_type in ('credit_note', 'debit_note')
      left join public.invoice_purchase p on d.source = 'invoice_purchase' and p.id::text = d.source_id and p.organization_id = p_organization_id
      left join public.support_documents sd on d.source = 'support_documents' and sd.id::text = d.source_id and sd.organization_id = p_organization_id
      left join public.sales s on d.source in ('sales', 'sale') and s.id::text = d.source_id and s.organization_id = p_organization_id
  ),
  lineas as (
    -- POS
    select di.source, di.source_id, di.clase, di.lado, 'sale_items'::text as tabla, si.id as linea_id,
           (case when coalesce(si.tax_included, s.tax_included, false) then coalesce(si.total, 0) - coalesce(si.tax_amount, 0)
                 else coalesce(si.total, 0) end)::numeric as base,
           coalesce(si.tax_amount, 0)::numeric as iva,
           si.iva_tratamiento as trat, si.iva_tarifa as tarifa, si.iva_tipo_operacion as tipo, si.iva_fundamento as fund,
           (si.iva_soporte_tipo is not null and si.iva_soporte_numero is not null and si.iva_soporte_fecha is not null) as soporte_ok,
           null::text as desc_estado, null::numeric as pct
      from docs_info di
      join public.sales s on s.id = di.doc_uuid and s.organization_id = p_organization_id
      join public.sale_items si on si.sale_id = s.id
     where di.clase = 'venta_pos'
    union all
    -- Factura de venta, nota crédito, nota débito
    select di.source, di.source_id, di.clase, di.lado, 'invoice_items', it.id,
           abs(b.base), abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)),
           it.iva_tratamiento, it.iva_tarifa, it.iva_tipo_operacion, it.iva_fundamento,
           (it.iva_soporte_tipo is not null and it.iva_soporte_numero is not null and it.iva_soporte_fecha is not null),
           null, null
      from docs_info di
      join public.invoice_items it on (it.invoice_sales_id = di.doc_uuid or (it.invoice_id = di.doc_uuid and it.invoice_type = 'sale'))
      cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
     where di.clase in ('factura_venta', 'nota_credito', 'nota_debito')
    union all
    -- Compras y documento soporte
    select di.source, di.source_id, di.clase, 'descontable', 'invoice_items', it.id,
           abs(b.base), abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)),
           it.iva_tratamiento, it.iva_tarifa, it.iva_tipo_operacion, it.iva_fundamento,
           (it.iva_soporte_tipo is not null and it.iva_soporte_numero is not null and it.iva_soporte_fecha is not null),
           coalesce(it.iva_descontable, 'por_evaluar'), it.iva_descontable_porcentaje
      from docs_info di
      join public.invoice_items it on
           (di.source = 'invoice_purchase' and (it.invoice_purchase_id = di.doc_uuid or (it.invoice_id = di.doc_uuid and it.invoice_type = 'purchase')))
        or (di.source = 'support_documents' and it.support_document_id = di.doc_uuid and it.invoice_type = 'support_document')
      cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
     where di.lado = 'descontable'
  ),
  por_doc as (
    select l.source, l.source_id, count(*) as n, sum(l.iva) as iva, sum(l.base) as base,
           -- B5: IVA no descontable de las líneas gravadas (no descontable, o la parte no procedente del proporcional).
           sum(case when l.lado = 'descontable' and l.trat = 'gravada' then
                 case l.desc_estado when 'no_descontable' then l.iva
                                    when 'proporcional' then l.iva - round(l.iva * coalesce(l.pct, 0) / 100, 2)
                                    else 0 end
               else 0 end) as nd
      from lineas l group by l.source, l.source_id
  ),
  estado_doc as (
    select di.*, coalesce(pd.n, 0) as n_lineas, coalesce(pd.base, 0) as base_lineas,
           -- B5: la compra se contabilizó con el IVA no descontable en el costo (la 2408 no lo tiene).
           (di.lado = 'descontable' and coalesce(pd.nd, 0) > 1
            and abs(coalesce(pd.iva, 0) - coalesce(pd.nd, 0) + di.neto) <= 1) as al_costo,
           -- IVA de libros en su sentido normal: venta/ND + crédito; NC débito (positivo); compra débito (positivo).
           case when di.lado = 'descontable' then -di.neto when di.clase = 'nota_credito' then -di.neto else di.neto end as iva_libro,
           -- Documento que ya tenía asiento en un período anterior: sus líneas ya se declararon allá. Si este
           -- asiento no mueve la 2408 (p. ej. aplicación de retenciones) no tiene efecto en el IVA.
           case when di.previo and abs(di.neto) < 0.005 then 'sin_efecto_iva'
                when di.previo then 'documento_de_otro_periodo'
                when coalesce(pd.n, 0) = 0 then 'sin_lineas'
                when abs(coalesce(pd.iva, 0) - case when di.lado = 'descontable' then -di.neto when di.clase = 'nota_credito' then -di.neto else di.neto end) > 1
                     and not (di.lado = 'descontable' and coalesce(pd.nd, 0) > 1 and abs(coalesce(pd.iva, 0) - coalesce(pd.nd, 0) + di.neto) <= 1)
                  then 'no_cuadra'
           end as motivo_doc
      from docs_info di
      left join por_doc pd on pd.source = di.source and pd.source_id = di.source_id
  ),
  -- Destino de cada línea: casilla de base, casilla de IVA, cuánto IVA va a la casilla y cuánto queda pendiente.
  lin_destino as (
    select l.*, x.motivo_linea, x.casilla_b, x.casilla_i, x.iva_casilla, x.iva_al_costo,
           l.iva - x.iva_casilla - x.iva_al_costo as iva_pend, x.motivo_iva
      from lineas l
      join estado_doc e on e.source = l.source and e.source_id = l.source_id and e.motivo_doc is null
      cross join lateral (
        select
          case
            when l.trat is null then 'sin_clasificar'
            when l.trat = 'gravada' and abs(round(l.base * l.tarifa / 100, 2) - l.iva) > 1 then 'tarifa_inconsistente'
            when l.trat <> 'gravada' and l.iva > 0.5 then 'tarifa_inconsistente'
            -- Corrección (c): compra a un no responsable con IVA → supuesto especial, nunca automático.
            when l.clase = 'documento_soporte' and l.trat = 'gravada' then 'soporte_supuesto_especial'
            when l.trat = 'gravada' and l.tipo is null then 'sin_tipo_operacion'
            when l.trat = 'gravada' and l.tipo not in ('bienes', 'servicios') then 'operacion_especial'
            when l.trat = 'gravada' and l.tarifa not in (5, 19) then 'tarifa_no_prevista'
            -- B1: condiciones de las operaciones sin IVA.
            when l.lado = 'generado' and l.clase <> 'nota_credito' and l.trat = 'exenta'
                 and l.tipo in ('exportacion_bienes', 'exportacion_servicios') and not l.soporte_ok then 'exportacion_sin_soporte'
            when l.trat <> 'gravada' and coalesce(l.tipo, '') not in ('exportacion_bienes', 'exportacion_servicios') and l.fund is null
              then case when l.trat = 'exenta' then 'exenta_sin_fundamento' else 'sin_fundamento' end
            when l.lado = 'descontable' and l.trat <> 'gravada' and l.tipo in ('exportacion_bienes', 'exportacion_servicios') then 'operacion_especial'
            when l.clase = 'nota_credito' and l.trat <> 'gravada' then 'casilla_por_confirmar'
          end as motivo_linea,
          case
            when l.trat = 'gravada' and l.clase = 'nota_credito' then 42
            when l.trat = 'gravada' and l.lado = 'generado' then case l.tarifa when 5 then 27 else 28 end
            when l.trat = 'gravada' then case when l.tipo = 'bienes' then case l.tarifa when 5 then 50 else 51 end
                                              else case l.tarifa when 5 then 52 else 53 end end
            when l.lado = 'generado' and l.tipo = 'exportacion_bienes' then 30
            when l.lado = 'generado' and l.tipo = 'exportacion_servicios' then 31
            when l.lado = 'generado' and l.trat = 'exenta' then 35
            when l.lado = 'generado' and l.trat = 'excluida' then 39
            when l.lado = 'generado' then 40
            when l.tipo = 'importacion' then 47
            else 54
          end as casilla_b,
          case
            when l.trat <> 'gravada' then null
            when l.clase = 'nota_credito' then 79
            when l.lado = 'generado' then case l.tarifa when 5 then 58 else 59 end
            when l.tipo = 'bienes' then case l.tarifa when 5 then 71 else 72 end
            else case l.tarifa when 5 then 74 else 75 end
          end as casilla_i,
          case
            when l.trat <> 'gravada' or l.lado = 'generado' then l.iva
            when l.desc_estado = 'descontable' then l.iva
            when l.desc_estado = 'proporcional' then round(l.iva * coalesce(l.pct, 0) / 100, 2)
            else 0
          end as iva_casilla,
          -- B5: IVA no descontable que el asiento ya llevó al costo (no está en la 2408): no es pendiente.
          case
            when not e.al_costo or l.lado <> 'descontable' or l.trat is distinct from 'gravada' then 0
            when l.desc_estado = 'no_descontable' then l.iva
            when l.desc_estado = 'proporcional' then l.iva - round(l.iva * coalesce(l.pct, 0) / 100, 2)
            else 0
          end as iva_al_costo,
          case
            when l.lado = 'generado' or l.trat <> 'gravada' then null
            when l.desc_estado = 'por_evaluar' then 'descontable_por_evaluar'
            else 'no_descontable_en_2408'
          end as motivo_iva
      ) x
  ),
  items_lineas as (
    -- Línea entera pendiente (B5: sin el IVA que el asiento ya llevó al costo, que no está en la 2408).
    select d.lado, d.clase, d.source, d.source_id, d.tabla, d.linea_id, d.base, d.iva - d.iva_al_costo as iva,
           case when d.lado = 'descontable' then -(d.iva - d.iva_al_costo) when d.clase = 'nota_credito' then -d.iva else d.iva end as efecto,
           d.motivo_linea as motivo, null::integer as casilla_base, null::integer as casilla_iva
      from lin_destino d where d.motivo_linea is not null
    union all
    -- Base (y el IVA que corresponde) a sus casillas.
    select d.lado, d.clase, d.source, d.source_id, d.tabla, d.linea_id, d.base, d.iva_casilla,
           case when d.lado = 'descontable' then -d.iva_casilla when d.clase = 'nota_credito' then -d.iva_casilla else d.iva_casilla end,
           null::text, d.casilla_b, case when d.iva_casilla <> 0 then d.casilla_i end
      from lin_destino d where d.motivo_linea is null
    union all
    -- IVA de compras que no entra en la casilla (por evaluar, no descontable, resto del proporcional).
    select d.lado, d.clase, d.source, d.source_id, d.tabla, d.linea_id, null::numeric, d.iva_pend, -d.iva_pend,
           d.motivo_iva, null::integer, null::integer
      from lin_destino d where d.motivo_linea is null and d.iva_pend <> 0
  ),
  items_docs as (
    -- Documento entero pendiente (no cuadra, sin líneas o con asiento de otro período): valor de los libros.
    select e.lado, e.clase, e.source, e.source_id, null::text as tabla, null::uuid as linea_id,
           e.base_lineas as base, e.iva_libro as iva, e.neto as efecto, e.motivo_doc as motivo,
           null::integer as casilla_base, null::integer as casilla_iva
      from estado_doc e where e.motivo_doc is not null and e.motivo_doc <> 'sin_efecto_iva'
  ),
  redondeo as (
    select coalesce(sum(e.neto - coalesce((select sum(i.efecto) from items_lineas i
                                             where i.source = e.source and i.source_id = e.source_id), 0)), 0) as valor
      from estado_doc e where e.motivo_doc is null
  ),
  -- Otros movimientos de la 2408
  otros as (
    select m.id, m.source, m.neto, m.created_at, m.entry_date, m.revierte_a,
           n.naturaleza as declarada, n.soporte_tipo, n.soporte, n.soporte_fecha, n.invoice_purchase_id, n.support_document_id,
           n.base as base_declarada, n.iva as iva_declarado, n.lineas as lineas_declaradas,
           n.doc_electronico_resolucion, n.doc_electronico_referencia, n.doc_electronico_fecha, n.corrige_declaracion_anterior,
           coalesce(n.naturaleza = 'correccion_error' and n.soporte_tipo is not null and n.soporte is not null and n.soporte_fecha is not null
            and n.doc_electronico_resolucion is not null and n.doc_electronico_referencia is not null
            and n.doc_electronico_fecha is not null and n.corrige_declaracion_anterior is not null, false) as correccion_completa,
           case when n.naturaleza is not null then n.naturaleza
                when m.id in (select id from corregidos) then 'correccion_error'
                when m.source = 'cierre_ejercicio' then 'cierre'
                when m.revierte_a is not null then 'reversa_contable'
                else 'sin_registro' end as naturaleza,
           -- Ronda 2: señales, no clasificación.
           case when n.naturaleza is null and m.id not in (select id from corregidos) and m.source is distinct from 'cierre_ejercicio' and m.revierte_a is null then
                  case when abs(m.neto) < 0.005 then 'traslado_auxiliares'
                       when m.source in ('cash_movements', 'bank_transactions') and m.solo_disp and m.neto < 0 then 'pago_dian' end
           end as sugerida,
           exists (select 1 from decl x where (m.entry_date at time zone v_tz)::date between x.desde and x.hasta
                    and m.created_at >= x.despues_de) as posterior_declaracion
      from mov m
      left join nat n on n.journal_entry_id = m.id
     where (m.toca or m.id in (select id from corregidos)) and m.id not in (select id from omitidos)
       and (not (m.source in ('sales', 'sale', 'invoice_sales', 'invoice_purchase', 'support_documents') and m.revierte_a is null)
            or m.id in (select id from corregidos))
  ),
  -- Devolución de compra: IVA recuperable = el de las líneas devueltas cuyo IVA se evaluó descontable (o su %).
  devoluciones as (
    select o.id, coalesce(sum(case it.iva_descontable
                                when 'descontable' then (x ->> 'iva')::numeric
                                when 'proporcional' then round((x ->> 'iva')::numeric * coalesce(it.iva_descontable_porcentaje, 0) / 100, 2)
                                else 0 end), 0) as recuperable
      from otros o
      cross join lateral jsonb_array_elements(coalesce(o.lineas_declaradas, '[]'::jsonb)) x
      left join public.invoice_items it on it.id = nullif(x ->> 'invoice_item_id', '')::uuid
     where o.declarada = 'devolucion_compra'
     group by o.id
  ),
  otros_dest as (
    select o.*, coalesce(dv.recuperable, 0) as recuperable,
           case
             when o.declarada in ('pago_dian', 'traslado_auxiliares', 'cierre') then 'no_afecta'
             when o.declarada is null and o.naturaleza = 'cierre' then 'no_afecta'
             when o.naturaleza = 'correccion_error' and (o.revierte_a is null or o.revierte_a in (select id from corregidos)) then 'no_afecta'
             when o.declarada = 'ajuste_procedente' then 'por_diligenciar'
             when o.declarada = 'devolucion_compra' and abs(o.neto - coalesce(o.iva_declarado, -1)) <= 1 then 'casilla'
             else 'pendiente' end as destino,
           case
             when o.declarada = 'correccion_error' and not o.correccion_completa then 'correccion_incompleta'
             when o.naturaleza = 'correccion_error' then 'correccion_otro_periodo'
             when o.naturaleza = 'reversa_contable' then 'reversa_contable'
             when o.declarada = 'devolucion_compra' then 'devolucion_compra_no_cuadra'
             when o.declarada = 'importacion' then 'operacion_especial'
             when o.declarada = 'otro' then 'otro_movimiento'
             when o.sugerida is not null then 'sugerido_por_confirmar'
             else 'sin_soporte' end as motivo
      from otros o
      left join devoluciones dv on dv.id = o.id
  ),
  items_otros as (
    -- B4: base a 56 siempre; IVA a 66 solo lo recuperable.
    select 'otros'::text as lado, 'asiento'::text as clase, od.source, od.id::text as source_id, null::text as tabla, null::uuid as linea_id,
           od.base_declarada as base, od.recuperable as iva, od.recuperable as efecto, null::text as motivo,
           56 as casilla_base, case when od.recuperable <> 0 then 66 end as casilla_iva
      from otros_dest od where od.destino = 'casilla'
    union all
    select 'otros', 'asiento', od.source, od.id::text, null, null, null, od.neto - od.recuperable, od.neto - od.recuperable,
           'devolucion_iva_no_descontado', null, null
      from otros_dest od where od.destino = 'casilla' and abs(od.neto - od.recuperable) >= 0.005
  ),
  items as (
    select * from items_lineas
    union all select * from items_docs
    union all select * from items_otros
  ),
  -- Metadatos de cada origen para los enlaces.
  origen as (
    select i.*, di.numero,
           coalesce(di.asientos, case when i.clase = 'asiento' then array[i.source_id::integer] end) as asientos,
           (coalesce(di.fecha, (select m.entry_date from mov m where i.clase = 'asiento' and m.id::text = i.source_id)) at time zone v_tz)::date as fecha,
           di.fecha_documento,
           coalesce(di.entre_periodos, false) as entre_periodos,
           coalesce(di.corrige_otro_periodo, false) as corrige_otro_periodo,
           coalesce(di.causado_antes, false) as causado_antes,
           di.origen_id, di.origen_numero,
           coalesce(di.posterior_declaracion, false) as posterior_declaracion
      from items i
      left join docs_info di on di.source = i.source and di.source_id = i.source_id
  ),
  origen_json as (
    select o.*, jsonb_build_object(
             'clase', o.clase, 'documento_id', o.source_id, 'numero', o.numero,
             'fecha', o.fecha, 'fecha_contabilizacion', o.fecha, 'fecha_documento', o.fecha_documento,
             'tabla', o.tabla, 'linea_id', o.linea_id, 'base', o.base, 'iva', o.iva,
             'asiento', o.asientos[1],
             'entre_periodos', o.entre_periodos, 'corrige_otro_periodo', o.corrige_otro_periodo,
             'causado_periodo_anterior', o.causado_antes,
             'posterior_declaracion', o.posterior_declaracion,
             'factura_origen', case when o.origen_id is not null then jsonb_build_object('id', o.origen_id, 'numero', o.origen_numero) end
           ) as j
      from origen o
  ),
  casillas_val as (
    select c.casilla, c.tipo, sum(c.valor) as valor, count(*) as n,
           (array_agg(c.j order by c.fecha, c.source_id))[1:200] as origenes,
           bool_or(c.senal) as senalada
      from (
        select o.casilla_base as casilla, 'base'::text as tipo, coalesce(o.base, 0) as valor, o.j, o.fecha, o.source_id,
               (o.entre_periodos or o.corrige_otro_periodo or o.causado_antes or o.posterior_declaracion) as senal
          from origen_json o where o.casilla_base is not null and o.base is not null
        union all
        select o.casilla_iva, 'iva', o.iva, o.j, o.fecha, o.source_id,
               (o.entre_periodos or o.corrige_otro_periodo or o.causado_antes or o.posterior_declaracion)
          from origen_json o where o.casilla_iva is not null
      ) c
     group by c.casilla, c.tipo
  ),
  catalogo (casilla, tipo, par, concepto, lado) as (
    values (27, 'base', 58, 'ventas_5', 'generado'), (58, 'iva', 27, 'ventas_5', 'generado'),
           (28, 'base', 59, 'ventas_general', 'generado'), (59, 'iva', 28, 'ventas_general', 'generado'),
           (30, 'base', null::integer, 'exportacion_bienes', 'generado'),
           (31, 'base', null, 'exportacion_servicios', 'generado'),
           (35, 'base', null, 'exentas_nacionales', 'generado'),
           (39, 'base', null, 'excluidas', 'generado'),
           (40, 'base', null, 'no_gravadas', 'generado'),
           (42, 'base', 79, 'devoluciones_ventas', 'descontable'), (79, 'iva', 42, 'devoluciones_ventas', 'descontable'),
           (47, 'base', null, 'importaciones_no_gravadas', 'descontable'),
           (50, 'base', 71, 'compras_bienes_5', 'descontable'), (71, 'iva', 50, 'compras_bienes_5', 'descontable'),
           (51, 'base', 72, 'compras_bienes_general', 'descontable'), (72, 'iva', 51, 'compras_bienes_general', 'descontable'),
           (52, 'base', 74, 'compras_servicios_5', 'descontable'), (74, 'iva', 52, 'compras_servicios_5', 'descontable'),
           (53, 'base', 75, 'compras_servicios_general', 'descontable'), (75, 'iva', 53, 'compras_servicios_general', 'descontable'),
           (54, 'base', null, 'compras_no_gravadas', 'descontable'),
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
      from origen_json o where o.motivo is not null
     group by o.motivo, o.lado
  ),
  otros_json as (
    select od.*, jsonb_build_object(
             'asiento', od.id, 'origen', od.source, 'fecha', (od.entry_date at time zone v_tz)::date, 'valor', od.neto,
             'naturaleza', od.naturaleza, 'declarada', od.declarada is not null, 'sugerida', od.sugerida, 'destino', od.destino,
             'motivo', case when od.destino = 'pendiente' then od.motivo end,
             'soporte_tipo', od.soporte_tipo, 'soporte', od.soporte, 'soporte_fecha', od.soporte_fecha, 'revierte_a', od.revierte_a,
             'factura_compra', od.invoice_purchase_id, 'documento_soporte', od.support_document_id,
             'base', od.base_declarada, 'iva_declarado', od.iva_declarado, 'iva_recuperable', od.recuperable,
             'posterior_declaracion', od.posterior_declaracion,
             'correccion', case when od.declarada = 'correccion_error' then jsonb_build_object(
               'completa', od.correccion_completa, 'resolucion', od.doc_electronico_resolucion,
               'referencia', od.doc_electronico_referencia, 'fecha', od.doc_electronico_fecha,
               'corrige_declaracion_anterior', od.corrige_declaracion_anterior) end) as j
      from otros_dest od
  ),
  totales as (
    select
      (select coalesce(sum(m.neto), 0) from mov m) as libro_2408,
      (select coalesce(sum(i.efecto), 0) from items i where i.motivo is null) as efecto_casillas,
      (select coalesce(sum(i.efecto), 0) from items i where i.motivo is not null) as efecto_pendientes,
      (select coalesce(sum(od.neto), 0) from otros_dest od where od.destino in ('no_afecta', 'por_diligenciar')) as efecto_otros,
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
    'version', 4,
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
       'iva_no_descontable_al_costo', (select coalesce(sum(d.iva_al_costo), 0) from lin_destino d),
       'pendientes_iva', (select coalesce(sum(abs(p.iva)), 0) from pend p)
                         + (select coalesce(sum(abs(od.neto)), 0) from otros_dest od where od.destino = 'pendiente')),
    'conciliacion', jsonb_build_object(
       'libro_2408', t.libro_2408,
       'casillas', t.efecto_casillas, 'pendientes', t.efecto_pendientes + t.efecto_otros_pendientes,
       'otros_no_afectan_o_por_diligenciar', t.efecto_otros, 'redondeo_lineas_libros', t.redondeo_lineas,
       'diferencia', t.libro_2408 - (t.efecto_casillas + t.efecto_pendientes + t.efecto_otros + t.efecto_otros_pendientes + t.redondeo_lineas)),
    'alertas', jsonb_build_object(
       'documentos_entre_periodos', (select count(distinct (o.source, o.source_id)) from origen o where o.entre_periodos),
       'notas_debito_otro_periodo', (select count(distinct (o.source, o.source_id)) from origen o where o.corrige_otro_periodo),
       'compras_causadas_antes', (select count(distinct (o.source, o.source_id)) from origen o where o.causado_antes),
       -- Ronda 3: corrección de error de una venta cuyo período ya se declaró, o marcada «corrige una declaración».
       'correcciones_declaracion_anterior', (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'asiento', od.id, 'venta_asiento', od.revierte_a, 'fecha_venta', (vo.entry_date at time zone v_tz)::date,
                  'completa', od.correccion_completa, 'corrige_declaracion_anterior', od.corrige_declaracion_anterior,
                  'periodo_declarado', (select jsonb_build_object('desde', x.desde, 'hasta', x.hasta, 'numero_formulario', x.numero_formulario)
                                          from decl x where (vo.entry_date at time zone v_tz)::date between x.desde and x.hasta limit 1))
                  order by od.id), '[]'::jsonb)
           from otros_dest od
           join public.journal_entries vo on vo.id = od.revierte_a
          where od.declarada = 'correccion_error'
            and (coalesce(od.corrige_declaracion_anterior, false)
                 or exists (select 1 from decl x where (vo.entry_date at time zone v_tz)::date between x.desde and x.hasta))),
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
  'Borrador del formulario 300 por casillas oficiales (Contador 2026-11-07, rondas 1 y 2) desde las líneas clasificadas y los asientos 2408, con pendientes, otros movimientos por naturaleza registrada, casillas por diligenciar y conciliación. Solo lectura; nunca aprobado fiscalmente.';
revoke all on function public.fn_tributario_borrador_iva_300(integer, date, date) from public, anon;
grant execute on function public.fn_tributario_borrador_iva_300(integer, date, date) to authenticated;
