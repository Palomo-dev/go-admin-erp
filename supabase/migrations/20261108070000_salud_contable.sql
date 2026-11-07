-- Finanzas ronda 3 · Frente C · Salud contable (Contabilidad v2 BK-9, decisión 3 del dueño).
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño.
-- ya existe: la pestaña Pendientes lee `journal_entry_failures` y Estructura sale
-- de `fn_plan_saldos` + `fn_reglas_contables_diagnostico`. Descuadres y Huérfanos
-- necesitan cruzar asientos con documentos, y eso no lo da PostgREST: la pantalla
-- llama a esta función y, mientras no exista, dice «Revisión pendiente de activar»
-- en esas dos pestañas (nunca muestra cero como si estuviera revisado).
--
-- Solo lectura. SECURITY DEFINER con guarda de pertenencia y permiso `finance.view`
-- (igual que `fn_plan_saldos`); sin `anon`. No toca tablas ni datos.
--
-- «Asiento vivo» = no es contra-asiento y no tiene contra-asiento
-- (`journal_reversals.original_entry_id` ni `fact_key = 'reversal:<id>'`).
--   Descuadres: factura de venta o de compra cuyo total no coincide con Σ débitos
--   de sus asientos vivos publicados (tolerancia $ 1), devengo duplicado (más de un
--   asiento vivo) y factura de compra en borrador con asiento.
--   Huérfanos: asiento vivo cuyo documento ya no existe (factura, venta, pago,
--   compra, movimiento de inventario, propina) y asientos sin líneas.
-- Devuelve como mucho 200 filas por lista y los conteos totales.

create or replace function public.fn_salud_contable(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_descuadres jsonb;
  v_huerfanos jsonb;
  v_n_descuadres integer;
  v_n_huerfanos integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  with vivos as (
    select je.id, je.source, je.source_id, je.posted, je.entry_date,
           coalesce((select sum(l.debit) from public.journal_lines l where l.journal_entry_id = je.id), 0) as debitos,
           exists (select 1 from public.journal_lines l where l.journal_entry_id = je.id) as con_lineas
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and coalesce(je.source, '') <> 'reversal'
       and not exists (select 1 from public.journal_reversals r where r.original_entry_id = je.id)
       and not exists (
         select 1 from public.journal_entries x
          where x.organization_id = p_organization_id and x.fact_key = 'reversal:' || je.id
       )
  ), documentos as (
    select 'factura'::text as tipo, i.id::text as doc_id, i.number as numero, i.total, i.status,
           sum(v.debitos) as total_asiento, count(*) as n, array_agg(v.id order by v.id) as asientos
      from public.invoice_sales i
      join vivos v on v.source = 'invoice_sales' and v.source_id = i.id::text and v.posted
     where i.organization_id = p_organization_id
     group by 1, 2, 3, 4, 5
    union all
    select 'facturaCompra', p.id::text, null, p.total, p.status,
           sum(v.debitos), count(*), array_agg(v.id order by v.id)
      from public.invoice_purchase p
      join vivos v on v.source = 'invoice_purchase' and v.source_id = p.id::text and v.posted
     where p.organization_id = p_organization_id
     group by 1, 2, 3, 4, 5
  ), con_problema as (
    select d.*,
           case
             when d.tipo = 'facturaCompra' and d.status = 'draft' then 'borrador_con_asiento'
             when d.n > 1 then 'devengo_duplicado'
             else 'asiento_distinto'
           end as subtipo
      from documentos d
     where (d.tipo = 'facturaCompra' and d.status = 'draft')
        or d.n > 1
        or abs(coalesce(d.total, 0) - d.total_asiento) > 1
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'tipo', c.tipo, 'documento_id', c.doc_id, 'numero', c.numero, 'subtipo', c.subtipo,
           'total_documento', c.total, 'total_asiento', c.total_asiento,
           'diferencia', c.total_asiento - coalesce(c.total, 0), 'asientos', to_jsonb(c.asientos)
         ) order by abs(c.total_asiento - coalesce(c.total, 0)) desc) filter (where c.rn <= 200), '[]'::jsonb)
    into v_n_descuadres, v_descuadres
    from (select cp.*, row_number() over (order by abs(cp.total_asiento - coalesce(cp.total, 0)) desc) as rn from con_problema cp) c;

  with vivos as (
    select je.id, je.source, je.source_id, je.posted, je.entry_date,
           coalesce((select sum(l.debit) from public.journal_lines l where l.journal_entry_id = je.id), 0) as debitos,
           exists (select 1 from public.journal_lines l where l.journal_entry_id = je.id) as con_lineas
      from public.journal_entries je
     where je.organization_id = p_organization_id
       and coalesce(je.source, '') <> 'reversal'
       and not exists (select 1 from public.journal_reversals r where r.original_entry_id = je.id)
       and not exists (
         select 1 from public.journal_entries x
          where x.organization_id = p_organization_id and x.fact_key = 'reversal:' || je.id
       )
  ), huerfanos as (
    select v.id, v.source, v.source_id, v.entry_date, v.debitos,
           case when v.con_lineas then 'documento_eliminado' else 'sin_lineas' end as motivo
      from vivos v
     where not v.con_lineas
        or (v.source = 'invoice_sales' and not exists (select 1 from public.invoice_sales i where i.id::text = v.source_id))
        or (v.source in ('sales', 'sale') and not exists (select 1 from public.sales s where s.id::text = v.source_id))
        or (v.source = 'payments' and not exists (select 1 from public.payments p where p.id::text = v.source_id))
        or (v.source = 'invoice_purchase' and not exists (select 1 from public.invoice_purchase p where p.id::text = v.source_id))
        or (v.source = 'stock_movements' and not exists (select 1 from public.stock_movements m where m.id::text = v.source_id))
        or (v.source = 'tips' and not exists (select 1 from public.tips t where t.id::text = v.source_id))
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'asiento_id', h.id, 'origen', h.source, 'origen_id', h.source_id, 'fecha', h.entry_date,
           'importe', h.debitos, 'motivo', h.motivo
         ) order by h.id desc) filter (where h.rn <= 200), '[]'::jsonb)
    into v_n_huerfanos, v_huerfanos
    from (select x.*, row_number() over (order by x.id desc) as rn from huerfanos x) h;

  return jsonb_build_object(
    'descuadres', v_descuadres,
    'total_descuadres', v_n_descuadres,
    'huerfanos', v_huerfanos,
    'total_huerfanos', v_n_huerfanos,
    'revisado_en', now()
  );
end;
$function$;

comment on function public.fn_salud_contable(integer) is
  'Salud contable por organización: descuadres documento ↔ asiento y asientos huérfanos (solo lectura).';

revoke all on function public.fn_salud_contable(integer) from public, anon;
grant execute on function public.fn_salud_contable(integer) to authenticated;
