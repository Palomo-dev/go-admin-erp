-- GO-contabilidad · Ajuste: vueltas registradas como recaudo en la caja 43 (org 377) — Contador 2026-11-25
--
-- Completa 20261126020000_ajuste_vueltas_recaudo_org377.sql, que dejó por fuera RC-0018 y RC-0019
-- (caja 43, $ 13.000 de vueltas) porque su arqueo de cierre tuvo un sobrante físico de $ 50.100.
--
-- Instrucción del Contador: «Ajusta también esos $13.000 con el mismo débito 1305 y crédito 1105. Es
-- el mismo error del sistema que en los otros seis y no hay que mezclarlo con el sobrante físico.
-- Antes de aplicarlo, revisa con qué se calcularon los $44.600 esperados del arqueo del 22 de
-- noviembre: si el esperado ya incluía esos $13.000 de más (…) registra la diferencia como más
-- sobrante (Dr 1105 / Cr 429581). Si el esperado no los incluía, el sobrante de $50.100 se queda como
-- está.»
--
-- REVISIÓN DEL ESPERADO (pos_caja__esperado_calculo, la misma función desde el cambio de proyecto del
-- 2026-11-03; ninguna migración posterior la redefinió):
--   esperado = base + (cobros en efectivo − vueltas) + abonos + entradas − salidas − compras − devoluciones
--            = 39.000 + (11.600 + 60.000 − 6.000 − 7.000) + 0 + 0 − 53.000 − 0 − 0
--            = 39.000 + 58.600 − 53.000 = 44.600
--   La función usa amount − change_amount (lo cobrado), no lo entregado: el esperado YA restaba las
--   vueltas. Recalculado hoy da 44.600, igual al guardado en el arqueo (cash_counts 10).
--   ⇒ El esperado NO incluía los $ 13.000: el sobrante físico de $ 50.100 se queda como está y NO se
--     registra sobrante adicional a 429581.
--   El bloque de abajo vuelve a comprobarlo antes de escribir y aborta si no se cumple.
--
-- Un asiento por recibo (igual que los otros seis), publicado, fecha de hoy, nota contable (NA):
--   Dr 1305 (el mismo tercero de la cartera del recibo) / Cr la cuenta de caja que debitó el recibo
--   (1105: la org 377 tiene una sola caja y una sola cuenta 1105), por lo que el libro registró de más
--   (crédito a la 1305 del recibo − devengo de su factura = las vueltas).
--   source/source_id = el recibo (payments), fact_key vueltas_recaudo:<pago> (único: idempotente),
--   nota «Corrección vueltas registradas como recaudo · recibo RC-…».
-- No se editan los asientos originales, ni los pagos, ni el asiento del cierre de la caja 43.
--
-- Reversión: supabase/rollbacks/20261126030000_ajuste_vueltas_recaudo_org377_caja43_rollback.sql

DO $ajuste$
declare
  v_calc jsonb;
  v_arqueo numeric;
  v_r record;
  v_t record;
  v_c record;
  v_memo text;
  v_entry integer;
  v_n integer := 0;
  v_total numeric := 0;
begin
  -- 1. El esperado del arqueo de la caja 43 ya restaba las vueltas (si no, se trata distinto).
  v_calc := public.pos_caja__esperado_calculo(43);
  select c.expected_amount into v_arqueo
    from public.cash_counts c
   where c.cash_session_id = 43 and c.organization_id = 377 and c.count_type = 'closing'
   order by c.created_at desc limit 1;
  if v_arqueo is distinct from 44600
     or (v_calc->>'efectivo_esperado')::numeric <> 44600
     or (v_calc->'detalle'->>'vuelto')::numeric <> 13000 then
    raise exception 'ESPERADO_DISTINTO: el arqueo de la caja 43 no coincide con el cálculo revisado (arqueo %, cálculo %). No se aplica.',
      v_arqueo, v_calc;
  end if;

  -- 2. Los dos recibos de la caja 43.
  for v_r in
    with pagos as (
      select p.id, p.organization_id as org, p.branch_id, p.created_at, p.change_amount,
             coalesce(nullif(btrim(p.receipt_number), ''), p.id::text) as recibo,
             i.sale_id
        from public.payments p
        join public.invoice_sales i on i.id::text = p.source_id and p.source = 'invoice_sales'
       where p.organization_id = 377
         and p.receipt_number in ('RC-0018', 'RC-0019')
         and p.method = 'cash'
         and p.status = 'completed'
         and coalesce(p.change_amount, 0) > 0
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
    select lb.*, lb.cr_1305 - lb.devengo_1305 as diferencia
      from libro lb
     order by lb.created_at
  loop
    if v_r.caja is distinct from 43 then
      raise exception 'CAJA_DISTINTA: el recibo % no es de la caja 43 (caja %).', v_r.recibo, v_r.caja;
    end if;
    -- Lo que el libro registró de más tiene que ser las vueltas de ese recibo (redondeo ≤ 0,01).
    if v_r.diferencia is null or v_r.diferencia <= 0
       or abs(v_r.diferencia - v_r.change_amount) > 0.01
       or v_r.cuenta_caja is null or v_r.cuenta_caja not like '1105%' then
      raise exception 'LIBRO_DISTINTO: el recibo % no muestra las vueltas en la 1305 (diferencia %, vueltas %, caja %).',
        v_r.recibo, v_r.diferencia, v_r.change_amount, v_r.cuenta_caja;
    end if;
    -- Ya ajustado (idempotente).
    continue when exists (select 1 from public.journal_entries a
                           where a.organization_id = v_r.org and a.fact_key = 'vueltas_recaudo:' || v_r.id::text);

    -- El mismo tercero con el que el recibo acreditó la 1305 (o el que resuelve la cartera del pago).
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
      raise exception 'SIN_TERCERO: el recibo % no resuelve tercero para la 1305.', v_r.recibo;
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

  raise notice 'Corrección de vueltas caja 43: % asientos por %. Sobrante del arqueo sin cambios (el esperado ya restaba las vueltas).',
    v_n, v_total;
end
$ajuste$;
