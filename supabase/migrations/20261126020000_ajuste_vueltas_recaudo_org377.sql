-- GO-pos · Ajuste: vueltas registradas como recaudo (org 377) — aprobado por el Contador 2026-11-25
--
-- Lo anterior a 20261126010000: 8 recibos de caja en efectivo del POS de la org 377 contabilizaron
-- Dr 1105 / Cr 1305 por lo que el cliente ENTREGÓ, no por lo que se cobró. La diferencia son las
-- vueltas ($ 104.000 en total): la 1305 quedó con saldo crédito y la 1105 inflada por lo mismo.
--
-- Instrucción del Contador: «débito 1305 y crédito 1105 de esa caja por $104.000, en los 8 recibos,
-- con el mismo tercero y enlazado a cada uno. Antes de aplicarlo, confirma con el arqueo que esa
-- caja tiene de verdad $104.000 de más en el sistema y no en efectivo. Si en el arqueo físico sí
-- sobró plata, avísame, porque eso ya no es un error del cálculo y se trata distinto.»
--
-- Por eso el ajuste se aplica SOLO a los recibos cuya caja (cash_sessions de la sucursal abierta a
-- la hora del pago) cerró con el efectivo contado igual a lo COBRADO (diferencia del arqueo de
-- cierre ≤ $ 1): ahí el sobrante existe solo en el libro.
--   Cumplen  (6 recibos, $ 91.000): RC-0001 (caja 26), RC-0007, RC-0008, RC-0009 (caja 30, arqueo
--            con $ 0,01 de redondeo), RC-0012 (caja 33) y RC-0020 (caja 44).
--   NO se ajustan (2 recibos, $ 13.000): RC-0018 y RC-0019 (caja 43). Su arqueo de cierre contó
--            $ 94.700 contra $ 44.600 esperados: SOBRARON $ 50.100 en efectivo físico (ya
--            contabilizados como sobrante de caja). Quedan para la decisión del Contador.
--
-- Un asiento por recibo, publicado, fecha de hoy, comprobante de nota contable (NA):
--   Dr 1305 (el mismo tercero de la 1305 del recibo) / Cr la cuenta de caja que debitó el recibo,
--   por la diferencia entre el crédito a la 1305 del recibo y el devengo de su factura
--   (accrual:sale:<venta>), que es lo que el libro registró de más.
--   source/source_id = el recibo (payments), fact_key vueltas_recaudo:<pago> (único: idempotente),
--   nota «Corrección vueltas registradas como recaudo · recibo RC-…».
-- No se editan los asientos originales ni los pagos.
--
-- Reversión: supabase/rollbacks/20261126020000_ajuste_vueltas_recaudo_org377_rollback.sql

DO $ajuste$
declare
  v_r record;
  v_t record;
  v_c record;
  v_memo text;
  v_entry integer;
  v_n integer := 0;
  v_total numeric := 0;
  v_retenidos text := '';
begin
  for v_r in
    with pagos as (
      select p.id, p.organization_id as org, p.branch_id, p.created_at, p.change_amount,
             coalesce(nullif(btrim(p.receipt_number), ''), p.id::text) as recibo,
             i.sale_id
        from public.payments p
        join public.invoice_sales i on i.id::text = p.source_id and p.source = 'invoice_sales'
       where p.organization_id = 377
         and p.method = 'cash'
         and p.status = 'completed'
         and coalesce(p.change_amount, 0) > 0
         and (select count(*) from public.payments q
               where q.source = 'invoice_sales' and q.source_id = p.source_id and q.status = 'completed') = 1
    ), libro as (
      select pg.*,
             (select sum(l.credit) - sum(l.debit) from public.journal_entries e
                join public.journal_lines l on l.journal_entry_id = e.id
               where e.organization_id = pg.org and e.fact_key = 'settlement:payment:' || pg.id::text
                 and l.account_code like '1305%') as cr_1305,
             (select min(l.account_code) from public.journal_entries e
                join public.journal_lines l on l.journal_entry_id = e.id
               where e.organization_id = pg.org and e.fact_key = 'settlement:payment:' || pg.id::text
                 and l.debit > 0) as cuenta_caja,
             (select sum(l.debit) - sum(l.credit) from public.journal_entries e
                join public.journal_lines l on l.journal_entry_id = e.id
               where e.organization_id = pg.org and e.fact_key = 'accrual:sale:' || pg.sale_id::text
                 and l.account_code like '1305%') as devengo_1305,
             (select s.id from public.cash_sessions s
               where s.organization_id = pg.org and s.branch_id = pg.branch_id
                 and pg.created_at >= s.opened_at and pg.created_at <= s.closed_at
               order by s.opened_at desc limit 1) as caja
        from pagos pg
    )
    select lb.*, lb.cr_1305 - lb.devengo_1305 as diferencia,
           (select c.difference from public.cash_counts c
             where c.cash_session_id = lb.caja and c.count_type = 'closing'
             order by c.created_at desc limit 1) as dif_arqueo
      from libro lb
     order by lb.created_at
  loop
    -- Lo que el libro registró de más tiene que ser las vueltas de ese recibo (redondeo ≤ 0,01).
    continue when v_r.diferencia is null or v_r.diferencia <= 0
              or abs(v_r.diferencia - v_r.change_amount) > 0.01
              or v_r.cuenta_caja is null or v_r.cuenta_caja not like '1105%';
    -- Ya ajustado (idempotente).
    continue when exists (select 1 from public.journal_entries a
                           where a.organization_id = v_r.org and a.fact_key = 'vueltas_recaudo:' || v_r.id::text);
    -- Arqueo: el efectivo contado cuadró con lo cobrado. Si no hay arqueo o sobró plata, no se ajusta.
    if v_r.caja is null or v_r.dif_arqueo is null or abs(v_r.dif_arqueo) > 1 then
      v_retenidos := v_retenidos || ' ' || v_r.recibo || ' (caja ' || coalesce(v_r.caja::text, 'sin caja')
                     || ', arqueo ' || coalesce(v_r.dif_arqueo::text, 'sin arqueo') || ')';
      continue;
    end if;

    -- El mismo tercero con el que el recibo acreditó la 1305.
    select l.tercero_nit as nit, l.tercero_nombre as nombre, l.account_code as cuenta into v_t
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_r.org and e.source = 'payments' and e.source_id = v_r.id::text
       and l.account_code like '1305%' and l.credit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id limit 1;
    if v_t.nit is null then
      select t.nit, t.nombre, '1305'::text as cuenta into v_t
        from public.fn_tercero_cartera_de_asiento('payments', v_r.id::text, v_r.org, '1305') t;
    end if;
    if v_t.nit is null then
      v_retenidos := v_retenidos || ' ' || v_r.recibo || ' (sin tercero)';
      continue;
    end if;

    v_memo := 'Corrección vueltas registradas como recaudo · recibo ' || v_r.recibo;
    select c.numero, c.prefijo into v_c
      from public.fn_tomar_consecutivo_comprobante(v_r.org, 'nota_contable', 'NA') c;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key,
      comprobante_tipo, comprobante_prefijo, comprobante_numero
    ) values (
      v_r.org, v_r.branch_id, now(), v_memo, 'payments', v_r.id::text, true, null,
      'vueltas_recaudo:' || v_r.id::text, 'nota_contable', v_c.prefijo, v_c.numero
    ) returning id into v_entry;

    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_t.cuenta, v_memo, v_r.diferencia, 0, v_t.nit, v_t.nombre);
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry, v_r.cuenta_caja, v_memo, 0, v_r.diferencia);

    v_n := v_n + 1;
    v_total := v_total + v_r.diferencia;
  end loop;

  raise notice 'Corrección de vueltas: % asientos por %. Sin ajustar (para el Contador):%',
    v_n, v_total, coalesce(nullif(v_retenidos, ''), ' ninguno');
end
$ajuste$;
