-- GO-contabilidad · Reasignación de tercero en la 1305: facturas a consumidor final cuyo cliente hoy
-- tiene documento (instrucción del Contador, 2026-11-25, punto 2)
--
-- Instrucción, en resumen: «Muévelas al NIT del cliente con un solo ajuste que pase factura y recibo
-- juntos. En la 1305: débito al cliente y crédito al consumidor final por cada factura, y luego lo
-- inverso por el recibo. Cada ajuste va enlazado a los dos documentos y lleva la nota "Reasignación
-- de tercero · cliente con documento". La factura electrónica no se toca: ya salió a la DIAN a
-- consumidor final y se queda así. Solo se corrige el auxiliar.»
--
-- Facturas afectadas: el devengo (accrual:sale:<venta>) dejó la 1305 con el tercero consumidor final
-- (222222222222) porque el cliente no tenía documento al facturar; hoy su ficha sí lo tiene. Sus recibos
-- también quedaron en el consumidor final (por 20261126000000, que copia el tercero del devengo).
-- Verificado el 2026-11-25: 16 facturas, todas pagadas por completo con un solo recibo, sin notas
-- crédito ni anulaciones:
--   org 338:  5 facturas, $ 350.358 en la 1305 (la suma de las facturas es $ 350.357,50: una de ellas
--             vale $ 119.992,50 y su devengo y su recibo se registraron redondeados a $ 119.993)
--   org 358: 11 facturas, $ 1.280.092
--
-- Esta migración:
--   1. fn_tercero_cartera_factura y fn_tercero_cartera_venta toman primero el tercero de la
--      reasignación (si existe): así un movimiento posterior de esas facturas (anulación de su recibo,
--      nota crédito) cruza el auxiliar del cliente y no vuelve al consumidor final.
--   2. Un asiento de ajuste por factura (publicado, fecha de hoy, comprobante de nota contable NA):
--        Dr 1305 cliente (NIT/cédula)  / Cr 1305 consumidor final   por el devengo de la factura
--        Cr 1305 cliente               / Dr 1305 consumidor final   por cada recibo (neto en el CF)
--      fact_key  reasignacion_tercero:<factura>   (única por factura)
--      source    reasignacion_tercero, source_id = la factura (no 'invoice_sales': fn_salud_contable
--                suma como devengo todo asiento con ese source y lo marcaría «devengo duplicado»)
--      memo      «Reasignación de tercero · cliente con documento · factura … · recibo …»
--      líneas    la misma nota con la factura (líneas 1-2) o con el recibo y su pago (líneas 3-4)
--   Solo se ajusta una factura si su auxiliar cuadra: devengo − recibos netos en el CF = saldo real de
--   la factura (±1). Con nota crédito viva, o si no cuadra, se omite y se avisa (lista al Contador).
--   No se tocan la factura, su factura electrónica, su adquiriente ni los asientos originales.
--   Resultado esperado: saldo total de la 1305 por organización igual; auxiliar del cliente = su
--   cartera real (0 en las 16); el consumidor final queda sin esos documentos (neto 0 por documento).
--   Si el número de facturas o los totales por organización no son los verificados, la migración
--   se aborta (no se fuerza nada).
--
-- Idempotente: CREATE OR REPLACE y fact_key únicas (una factura ya reasignada no se repite).
-- Reversión: supabase/rollbacks/20261126010000_reasignacion_tercero_cliente_con_documento_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La cartera de la factura sigue la reasignación.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_factura(p_invoice uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_sale uuid;
begin
  nit := null;
  nombre := null;
  select i.organization_id, i.sale_id into v_org, v_sale
    from public.invoice_sales i where i.id = p_invoice;
  if v_org is null then
    return;
  end if;
  -- Reasignación de tercero (20261126010000): el cliente con documento al que se movió la factura
  -- (primera línea débito del ajuste).
  select l.tercero_nit, l.tercero_nombre into nit, nombre
    from public.journal_entries e
    join public.journal_lines l on l.journal_entry_id = e.id
   where e.organization_id = v_org
     and e.fact_key = 'reasignacion_tercero:' || p_invoice::text
     and l.account_code like '1305%'
     and l.debit > 0
     and nullif(btrim(l.tercero_nit), '') is not null
   order by l.id
   limit 1;
  if nit is null and v_sale is not null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.fact_key = 'accrual:sale:' || v_sale::text
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.source = 'invoice_sales'
       and e.source_id = p_invoice::text
       and e.fact_key like 'accrual:sale:%'
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_invoice) t;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_venta(p_org integer, p_sale uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  nit := null;
  nombre := null;
  if p_org is null or p_sale is null then
    return;
  end if;
  -- Reasignación de tercero (20261126010000) de la factura de esta venta.
  select l.tercero_nit, l.tercero_nombre
    into nit, nombre
    from public.invoice_sales i
    join public.journal_entries e
      on e.organization_id = i.organization_id
     and e.fact_key = 'reasignacion_tercero:' || i.id::text
    join public.journal_lines l on l.journal_entry_id = e.id
   where i.organization_id = p_org
     and i.sale_id = p_sale
     and l.account_code like '1305%'
     and l.debit > 0
     and nullif(btrim(l.tercero_nit), '') is not null
   order by l.id
   limit 1;
  -- El tercero con el que la venta entró a la 1305 (devengo accrual:sale:<venta>).
  if nit is null then
    select l.tercero_nit, l.tercero_nombre
      into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = p_org
       and e.fact_key = 'accrual:sale:' || p_sale::text
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  -- Aún sin devengo (el recibo puede llegar antes): la misma regla con la que se devengará.
  if nit is null and exists (select 1 from public.sales s where s.id = p_sale and s.organization_id = p_org) then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_sale) t;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_tercero_cartera_factura(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_factura(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Un ajuste por factura: factura y recibo(s) del consumidor final al cliente.
-- ─────────────────────────────────────────────────────────────────────────────
DO $reasignacion$
declare
  v_nota constant text := 'Reasignación de tercero · cliente con documento';
  v_f record;
  v_p record;
  v_c record;
  v_recibos numeric;
  v_lista text;
  v_memo text;
  v_entry integer;
  v_n integer := 0;
  v_omitidas integer := 0;
  v_por_org jsonb := '{}'::jsonb;
  v_esperado constant jsonb := '{"338": {"n": 5, "total": 350358}, "358": {"n": 11, "total": 1280092}}'::jsonb;
begin
  for v_f in
    with devengo as (
      -- La factura en la 1305 con el consumidor final (su devengo), y el cliente que hoy tiene documento.
      select i.id, i.organization_id as org, i.branch_id, i.number, i.sale_id, i.balance,
             btrim(c.identification_number) as nit_cliente,
             coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(c.company_name), '')) as nombre_cliente,
             cf.nit as nit_cf, cf.nombre as nombre_cf,
             min(l.account_code) as cuenta,
             min(e.branch_id) as branch_devengo,
             sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)) as devengo
        from public.invoice_sales i
        join public.customers c on c.id = i.customer_id and c.organization_id = i.organization_id
        cross join lateral public.fn_consumidor_final_contable(i.organization_id) cf
        join public.journal_entries e
          on e.organization_id = i.organization_id
         and (e.fact_key = 'accrual:sale:' || coalesce(i.sale_id::text, '-')
              or (e.source = 'invoice_sales' and e.source_id = i.id::text and e.fact_key like 'accrual:sale:%'))
        join public.journal_lines l
          on l.journal_entry_id = e.id and l.account_code like '1305%' and l.tercero_nit = cf.nit
       where coalesce(i.document_type, 'invoice') = 'invoice'
         and i.status not in ('draft', 'void', 'voided', 'cancelled')
         and nullif(btrim(c.identification_number), '') is not null
         and btrim(c.identification_number) <> cf.nit
         and not exists (select 1 from public.journal_entries a
                          where a.organization_id = i.organization_id
                            and a.fact_key = 'reasignacion_tercero:' || i.id::text)
       group by i.id, i.organization_id, i.branch_id, i.number, i.sale_id, i.balance,
                c.identification_number, c.full_name, c.company_name, cf.nit, cf.nombre
      having sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)) > 0
    )
    select d.* from devengo d order by d.org, d.number
  loop
    -- Notas crédito vivas de la factura: fuera de este ajuste (se reportan).
    if exists (select 1 from public.invoice_sales n
                where n.related_invoice_id = v_f.id and n.organization_id = v_f.org
                  and n.document_type = 'credit_note'
                  and n.status not in ('void', 'voided', 'cancelled')) then
      v_omitidas := v_omitidas + 1;
      raise notice 'Reasignación omitida (nota crédito): org %, factura %', v_f.org, v_f.number;
      continue;
    end if;

    -- Recibos de la factura: lo neto que su 1305 dejó en el consumidor final (recibo, su ajuste de
    -- tercero 20261126000000 y, si se anuló, su contra-asiento).
    select coalesce(sum(r.neto), 0), string_agg(r.recibo, ', ' order by r.creado)
      into v_recibos, v_lista
      from (
        select p.id, p.created_at as creado,
               coalesce(nullif(btrim(p.receipt_number), ''), nullif(btrim(g.receipt_number), ''), p.id::text) as recibo,
               (select coalesce(sum(coalesce(l.credit, 0) - coalesce(l.debit, 0)), 0)
                  from public.journal_entries e
                  join public.journal_lines l on l.journal_entry_id = e.id
                 where e.organization_id = v_f.org
                   and l.account_code like '1305%'
                   and l.tercero_nit = v_f.nit_cf
                   and ((e.source = 'payments' and e.source_id = p.id::text)
                        or (e.source = 'reversal' and e.source_id in (
                              select x.id::text from public.journal_entries x
                               where x.organization_id = v_f.org and x.source = 'payments' and x.source_id = p.id::text)))) as neto
          from public.payments p
          left join public.payment_groups g on g.id = p.payment_group_id
         where p.organization_id = v_f.org
           and ((p.source = 'invoice_sales' and p.source_id = v_f.id::text)
                or (v_f.sale_id is not null and p.source = 'sale' and p.source_id = v_f.sale_id::text))
      ) r
     where abs(r.neto) > 0.005;

    -- Cuadre: lo que queda en el CF por este documento debe ser exactamente su saldo real.
    if abs((v_f.devengo - v_recibos) - coalesce(v_f.balance, 0)) > 1 then
      v_omitidas := v_omitidas + 1;
      raise notice 'Reasignación omitida (no cuadra): org %, factura %, devengo %, recibos %, saldo %',
        v_f.org, v_f.number, v_f.devengo, v_recibos, v_f.balance;
      continue;
    end if;

    v_memo := v_nota || ' · factura ' || v_f.number || coalesce(' · recibo ' || v_lista, '');

    select c.numero, c.prefijo into v_c
      from public.fn_tomar_consecutivo_comprobante(v_f.org, 'nota_contable', 'NA') c;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key,
      comprobante_tipo, comprobante_prefijo, comprobante_numero
    ) values (
      v_f.org, coalesce(v_f.branch_id, v_f.branch_devengo), now(), v_memo, 'reasignacion_tercero', v_f.id::text,
      true, null, 'reasignacion_tercero:' || v_f.id::text,
      'nota_contable', v_c.prefijo, v_c.numero
    ) returning id into v_entry;

    -- Factura: Dr cliente / Cr consumidor final.
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_f.cuenta, v_nota || ' · factura ' || v_f.number, v_f.devengo, 0, v_f.nit_cliente, v_f.nombre_cliente);
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_f.cuenta, v_nota || ' · factura ' || v_f.number, 0, v_f.devengo, v_f.nit_cf, v_f.nombre_cf);

    -- Cada recibo: lo inverso (Cr cliente / Dr consumidor final), con su número y su pago.
    for v_p in
      select r.* from (
        select p.id, p.created_at,
               coalesce(nullif(btrim(p.receipt_number), ''), nullif(btrim(g.receipt_number), ''), p.id::text) as recibo,
               (select coalesce(sum(coalesce(l.credit, 0) - coalesce(l.debit, 0)), 0)
                  from public.journal_entries e
                  join public.journal_lines l on l.journal_entry_id = e.id
                 where e.organization_id = v_f.org
                   and l.account_code like '1305%'
                   and l.tercero_nit = v_f.nit_cf
                   and ((e.source = 'payments' and e.source_id = p.id::text)
                        or (e.source = 'reversal' and e.source_id in (
                              select x.id::text from public.journal_entries x
                               where x.organization_id = v_f.org and x.source = 'payments' and x.source_id = p.id::text)))) as neto
          from public.payments p
          left join public.payment_groups g on g.id = p.payment_group_id
         where p.organization_id = v_f.org
           and ((p.source = 'invoice_sales' and p.source_id = v_f.id::text)
                or (v_f.sale_id is not null and p.source = 'sale' and p.source_id = v_f.sale_id::text))
      ) r
      where abs(r.neto) > 0.005
      order by r.created_at
    loop
      if v_p.neto > 0 then
        insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
        values (v_entry, v_f.cuenta, v_nota || ' · recibo ' || v_p.recibo || ' · pago ' || v_p.id::text, 0, v_p.neto, v_f.nit_cliente, v_f.nombre_cliente);
        insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
        values (v_entry, v_f.cuenta, v_nota || ' · recibo ' || v_p.recibo || ' · pago ' || v_p.id::text, v_p.neto, 0, v_f.nit_cf, v_f.nombre_cf);
      else
        insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
        values (v_entry, v_f.cuenta, v_nota || ' · recibo ' || v_p.recibo || ' · pago ' || v_p.id::text, -v_p.neto, 0, v_f.nit_cliente, v_f.nombre_cliente);
        insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
        values (v_entry, v_f.cuenta, v_nota || ' · recibo ' || v_p.recibo || ' · pago ' || v_p.id::text, 0, -v_p.neto, v_f.nit_cf, v_f.nombre_cf);
      end if;
    end loop;

    v_n := v_n + 1;
    v_por_org := jsonb_set(v_por_org, array[v_f.org::text], jsonb_build_object(
      'n', coalesce((v_por_org #>> array[v_f.org::text, 'n'])::integer, 0) + 1,
      'total', coalesce((v_por_org #>> array[v_f.org::text, 'total'])::numeric, 0) + v_f.devengo));
  end loop;

  -- Solo lo verificado con el Contador: si cambió el universo, no se fuerza.
  if v_por_org <> v_esperado then
    raise exception 'Reasignación de tercero abortada: se esperaba % y se encontró % (% omitidas)',
      v_esperado, v_por_org, v_omitidas;
  end if;
  raise notice 'Reasignación de tercero: % ajustes %; % omitidas', v_n, v_por_org, v_omitidas;
end
$reasignacion$;
