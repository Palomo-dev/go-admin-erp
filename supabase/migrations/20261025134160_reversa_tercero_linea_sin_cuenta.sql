-- Correctivo QA tanda 2 (68f9140c AMARILLO), 25-oct-2026. NO aplicada. Redefine fn_revertir_asiento_en_fecha:
--   MEDIO (2): cada línea del contra-asiento copia tercero_nit / tercero_nombre de su línea original
--              (source 'reversal' no lo rellena trg_tercero_linea_asiento), así la cartera por cliente cruza.
--   BAJO (3):  una línea original SIN cuenta y CON valor ya no bloquea la anulación: su espejo va a la cuenta
--              transitoria 28959501 «Partidas pendientes de clasificar (reversión sin cuenta)» (se crea si falta,
--              bajo 2895 Diversos), el contra-asiento cuadra, y la línea queda en pendientes
--              (journal_entry_failures, reason 'linea_sin_cuenta', fact_key 'reversal:sin_cuenta:<línea>')
--              con el valor para que contabilidad la reclasifique. Líneas sin cuenta y sin valor se omiten.
--   ALTO (1) (respuesta del Contador DIAN): si la venta YA tiene asiento publicado, la anulación SIEMPRE genera
--              el contra-asiento con la FECHA DE LA ANULACIÓN, aunque la factura nunca haya llegado a la DIAN o
--              esté rechazada. Se quita de fn_auto_journal_void la rama einvoice pending/processing/rejected/failed;
--              la única omisión es «no existe asiento de venta previo». (Borrador sigue descartándose.)
--              No corrige las facturas ya anuladas sin reversa: eso es corrección de datos aparte.
-- Rollback: supabase/rollbacks/20261025134160_reversa_tercero_linea_sin_cuenta_rollback.sql (vuelve a la de 134115).

create or replace function public.fn_asegurar_cuenta_pendiente_clasificar(p_org integer)
returns text language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if exists (select 1 from public.chart_of_accounts where organization_id = p_org and account_code = '28959501') then
    return '28959501';
  end if;
  insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active,
    es_movimiento, naturaleza, description)
  select p_org, x.c, x.n, 'liability', x.p, true, x.m, 'credito', 'Pendiente de clasificar (QA 25-oct-2026)'
    from (values
      (1, '2',        'Pasivo', null, false),
      (2, '28',       'Otros pasivos', '2', false),
      (3, '2895',     'Diversos', '28', false),
      (4, '289595',   'Otros', '2895', false),
      (5, '28959501', 'Partidas pendientes de clasificar (reversión sin cuenta)', '289595', true)
    ) as x(o, c, n, p, m)
   order by x.o
  on conflict (organization_id, account_code) do nothing;
  return '28959501';
end $$;
revoke all on function public.fn_asegurar_cuenta_pendiente_clasificar(integer) from public, anon, authenticated;

create or replace function public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamptz,
  p_categoria text, p_lote text)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
  v_puente text;
  r record;
begin
  select * into v_orig from journal_entries where id = p_entry_id for update;
  if not found then raise exception 'Asiento % no existe', p_entry_id; end if;
  if not v_orig.posted then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from journal_entries
              where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'Asiento % ya tiene contra-asiento', p_entry_id;
  end if;
  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code, 'reversal:' || p_entry_id)
  returning id into v_rev_id;

  -- Líneas con cuenta: espejo con el MISMO tercero.
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id,
                             tercero_nit, tercero_nombre)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id,
         jl.tercero_nit, jl.tercero_nombre
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is not null;

  -- Líneas sin cuenta y con valor: espejo a la transitoria + pendiente, sin bloquear.
  for r in select jl.* from journal_lines jl
            where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is null
              and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
  loop
    v_puente := coalesce(v_puente, public.fn_asegurar_cuenta_pendiente_clasificar(v_orig.organization_id));
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                               organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id,
                               tercero_nit, tercero_nombre)
    values (v_rev_id, v_puente, 'REVERSION línea sin cuenta ' || r.id || ' (pendiente de clasificar) ' || coalesce(r.description, ''),
            coalesce(r.credit, 0), coalesce(r.debit, 0), coalesce(r.organization_id, v_orig.organization_id),
            r.currency_code, r.exchange_rate, r.credit_base, r.debit_base, r.cost_center_id,
            r.tercero_nit, r.tercero_nombre);
    perform public.fn_log_journal_failure(
      v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
      'reversal', p_entry_id::text, 'reversal:sin_cuenta:' || r.id,
      case when coalesce(r.credit, 0) <> 0 then v_puente end, case when coalesce(r.debit, 0) <> 0 then v_puente end,
      abs(coalesce(r.debit, 0) - coalesce(r.credit, 0)), 'linea_sin_cuenta',
      'Reversión ' || p_lote || ': línea ' || r.id || ' sin cuenta del asiento ' || p_entry_id
        || ' reversada a ' || v_puente || ' (contra-asiento ' || v_rev_id || '); reclasificar');
  end loop;

  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;
  return v_rev_id;
end $$;
revoke all on function public.fn_revertir_asiento_en_fecha(integer, timestamptz, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_je RECORD;
    v_vivos integer;
    v_fecha timestamptz := now();
    v_lote text;
BEGIN
    IF (NEW.status IN ('void','voided','cancelled'))
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND (OLD.status NOT IN ('void','voided','cancelled')) THEN

        IF NEW.document_type = 'credit_note' THEN
            RETURN NEW;
        END IF;

        -- Con NC: el asiento es el de la NC (con su fecha); aquí no se hace nada.
        IF EXISTS (
            SELECT 1 FROM invoice_sales cn
            WHERE cn.related_invoice_id = NEW.id
              AND cn.document_type = 'credit_note'
        ) THEN
            RETURN NEW;
        END IF;

        -- (1) Regla corregida del Contador DIAN (25-oct-2026): el estado DIAN (pending/processing/rejected/
        --     failed) ya NO omite el contra-asiento. Solo se omite si NO hay asiento de venta previo (v_vivos = 0).

        v_lote := COALESCE(NEW.number, NEW.id::text);

        SELECT count(*) INTO v_vivos
        FROM journal_entries je
        WHERE je.organization_id = NEW.organization_id
          AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
               OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%')
               OR (je.fact_key IS NULL AND je.source = 'invoice_sales' AND je.source_id = NEW.id::text))
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries r
              WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id);
        IF v_vivos = 0 THEN
            RETURN NEW;
        END IF;

        FOR v_je IN
            SELECT je.id, coalesce(je.posted, false) AS posted, je.branch_id
            FROM journal_entries je
            WHERE je.organization_id = NEW.organization_id
              AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
                   OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%')
                   OR (je.fact_key IS NULL AND je.source = 'invoice_sales' AND je.source_id = NEW.id::text))
              AND NOT EXISTS (
                  SELECT 1 FROM journal_entries r
                  WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id)
            ORDER BY je.id
        LOOP
            IF NOT v_je.posted THEN
                -- (3) Borrador: se descarta (no hay nada contabilizado que revertir).
                DELETE FROM journal_lines WHERE journal_entry_id = v_je.id;
                DELETE FROM journal_entries WHERE id = v_je.id AND posted IS NOT TRUE;
                PERFORM fn_log_journal_failure(
                    NEW.organization_id, NEW.branch_id, v_fecha,
                    'invoice_sales', NEW.id::text || ':void', 'void:draft:' || v_je.id,
                    NULL, NULL, ABS(COALESCE(NEW.total, 0)),
                    'borrador_descartado', 'Anulación ' || v_lote || ': borrador ' || v_je.id || ' descartado (no se revierte)');
                UPDATE journal_entry_failures SET resolved_at = now(), resolution = 'borrador_descartado'
                 WHERE organization_id = NEW.organization_id AND fact_key = 'void:draft:' || v_je.id AND resolved_at IS NULL;
                CONTINUE;
            END IF;
            -- (2) Líneas sin cuenta → pendientes, sin bloquear.
            IF EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id = v_je.id
                         AND nullif(btrim(jl.account_code), '') IS NULL) THEN
                PERFORM fn_log_journal_failure(
                    NEW.organization_id, NEW.branch_id, v_fecha,
                    'invoice_sales', NEW.id::text || ':void', 'void:sin_cuenta:' || v_je.id,
                    NULL, NULL, ABS(COALESCE(NEW.total, 0)),
                    'linea_sin_cuenta', 'Anulación ' || v_lote || ': línea sin cuenta en asiento ' || v_je.id);
            END IF;
            IF NOT fn_is_period_open(NEW.organization_id, v_fecha::date) THEN
                PERFORM fn_log_journal_failure(
                    NEW.organization_id, NEW.branch_id, v_fecha,
                    'invoice_sales', NEW.id::text || ':void', 'void:invoice:' || NEW.id::text || ':' || v_je.id,
                    NULL, NULL, ABS(COALESCE(NEW.total, 0)),
                    'periodo_cerrado', 'Anulación ' || v_lote || ': período de la fecha de anulación cerrado');
                CONTINUE;
            END IF;
            -- (1) Espejo línea por línea con la FECHA DE ANULACIÓN.
            PERFORM fn_revertir_asiento_en_fecha(v_je.id, v_fecha, 'anulacion-factura', v_lote);
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;

