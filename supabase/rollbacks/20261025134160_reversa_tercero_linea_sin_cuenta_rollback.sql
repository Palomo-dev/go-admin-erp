-- Rollback 134160: vuelve fn_revertir_asiento_en_fecha a la versión de 134115 y fn_auto_journal_void a la previa; elimina fn_reversar_linea_sin_cuenta.
create or replace function public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamptz,
  p_categoria text, p_lote text)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
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
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is not null;
  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;
  return v_rev_id;
end $$;
revoke all on function public.fn_revertir_asiento_en_fecha(integer, timestamptz, text, text) from public, anon, authenticated;
delete from public.chart_of_accounts c where c.description = 'Pendiente de clasificar (QA 25-oct-2026)' and not exists (select 1 from public.journal_lines l where l.organization_id = c.organization_id and l.account_code like c.account_code || '%');
drop function if exists public.fn_reversar_linea_sin_cuenta(bigint, text);

-- fn_auto_journal_void de 134115 (con la excepción einvoice)
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

        -- (1) Excepción del contador: nunca llegó a la DIAN o fue rechazada → sin NC y sin contra-asiento.
        IF NEW.einvoice_status IN ('pending', 'processing', 'rejected', 'failed') THEN
            RETURN NEW;
        END IF;

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

