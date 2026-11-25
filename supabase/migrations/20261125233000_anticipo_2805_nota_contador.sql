-- GO-contabilidad · Anticipo de contraentrega a 2805: la nota que pidió el Contador (2026-11-25)
--
-- Respuesta del Contador sobre la reclasificación de 20261125120000: confirmada (asiento de
-- ajuste con fecha de hoy, sin editar los originales, cliente como tercero en cada pago). Pidió
-- que cada ajuste quede enlazado al pago y al pedido «con una nota que diga "Reclasificación
-- anticipo contraentrega a 2805"».
--
-- Esta migración cambia SOLO TEXTO (montos, cuentas, terceros, fechas y claves intactos):
--   1. Los asientos de ajuste ya registrados (fact_key web_order_advance:reclass:<pago>): memo del
--      asiento y descripción de sus líneas pasan a
--        «Reclasificación anticipo contraentrega a 2805 · pedido WO-… · pago <id del pago>».
--      El enlace sigue siendo el de siempre: source_id = pedido y fact_key = pago (journal_entries
--      no tiene una columna propia para el pago; la fact_key es la relación única y explícita).
--      Los asientos están publicados: el texto se cambia con app.contabilidad_mantenimiento,
--      el mismo interruptor de mantenimiento que respeta fn_asiento_publicado_inmutable.
--   2. El cruce al facturar (fn_trg_anticipo_pedido_web_aplicado, Dr 2805 / Cr 1305, fact_key
--      web_order_advance:apply:<pago>) se escribe con la misma forma de nota:
--        «Cruce anticipo contraentrega 2805 contra 1305 · pedido WO-… · pago … · factura …».
--      La lógica no cambia: una sola vez por pago (fact_key), solo si el anticipo está en 2805.
--
-- La reclasificación fue un bloque único en 20261125120000 (no hay función que genere ajustes
-- nuevos: desde esa migración el recibo del anticipo ya acredita 2805 directamente).
--
-- Reversión: supabase/rollbacks/20261125233000_anticipo_2805_nota_contador_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nota en los ajustes ya registrados.
-- ─────────────────────────────────────────────────────────────────────────────
DO $nota$
declare
  v_n integer;
  v_l integer;
begin
  perform set_config('app.contabilidad_mantenimiento', 'on', true);

  update public.journal_entries e set
    memo = 'Reclasificación anticipo contraentrega a 2805 · pedido ' || w.order_number
           || ' · pago ' || split_part(e.fact_key, ':', 3),
    updated_at = now()
    from public.web_orders w
   where e.fact_key like 'web_order_advance:reclass:%'
     and e.source = 'web_order_advance'
     and w.id::text = e.source_id
     and w.organization_id = e.organization_id
     and e.memo like 'Ajuste: anticipo de contraentrega de 1305 a 2805%';
  get diagnostics v_n = row_count;

  update public.journal_lines l set
    description = e.memo,
    updated_at = now()
    from public.journal_entries e
   where l.journal_entry_id = e.id
     and e.fact_key like 'web_order_advance:reclass:%'
     and e.memo like 'Reclasificación anticipo contraentrega a 2805 · %'
     and l.description like 'Ajuste: anticipo de contraentrega de 1305 a 2805%';
  get diagnostics v_l = row_count;

  perform set_config('app.contabilidad_mantenimiento', '', true);
  raise notice 'Nota del Contador: % asientos y % líneas', v_n, v_l;
end
$nota$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cruce al facturar con la misma forma de nota.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_anticipo_pedido_web_aplicado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido uuid;
  v_wo record;
  v_factura text;
begin
  if not (old.source = 'web_order' and new.source = 'invoice_sales'
          and coalesce(new.processor_response->>'concepto', '') = 'anticipo_contraentrega'
          and coalesce(new.status, 'completed') = 'completed') then
    return new;
  end if;
  -- Solo si el anticipo está en 2805: si el recibo falló o quedó en 1305 sin reclasificar,
  -- el cruce dejaría 2805 en negativo.
  if not public.fn_anticipo_en_2805(new.id) then
    return new;
  end if;
  begin
    v_pedido := old.source_id::uuid;
  exception when others then
    return new;
  end;
  select w.id, w.organization_id, w.branch_id, w.order_number into v_wo
    from public.web_orders w where w.id = v_pedido and w.organization_id = new.organization_id;
  if v_wo.id is null then
    return new;
  end if;
  select i.number into v_factura
    from public.invoice_sales i
   where i.id::text = new.source_id and i.organization_id = new.organization_id;
  -- Nota del Contador (2026-11-25): enlazada al pago, al pedido y a la factura.
  perform public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := coalesce(new.branch_id, v_wo.branch_id),
    p_entry_date := now(),
    p_memo := 'Cruce anticipo contraentrega 2805 contra 1305 · pedido ' || v_wo.order_number
              || ' · pago ' || new.id::text
              || coalesce(' · factura ' || nullif(btrim(v_factura), ''), ''),
    p_source := 'web_order_advance',
    p_source_id := v_wo.id::text,
    p_debit_account := '2805',
    p_credit_account := '1305',
    p_amount := new.amount,
    p_created_by := coalesce(auth.uid(), new.created_by),
    p_fact_key := 'web_order_advance:apply:' || new.id::text
  );
  return new;
end;
$function$;
