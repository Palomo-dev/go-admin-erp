-- Correctivo QA tanda 2 (68f9140c AMARILLO), 25-oct-2026. NO aplicada. Redefine fn_revertir_asiento_en_fecha:
--   MEDIO (2): cada línea del contra-asiento copia tercero_nit / tercero_nombre de su línea original
--              (source 'reversal' no lo rellena trg_tercero_linea_asiento), así la cartera por cliente cruza.
--   BAJO (3) (AJUSTADO por el contador, 25-oct-2026; sin cuenta puente): la reversa usa EXACTAMENTE la cuenta
--              de cada línea que reversa. DECISIÓN: el contra-asiento PARCIAL se publica con las líneas que SÍ tienen
--              cuenta (la anulación no se bloquea y lo demás se reversa normalmente); cada línea original SIN cuenta y
--              CON valor NO se reversa: queda en la cola journal_entry_failures, reason 'linea_sin_cuenta',
--              fact_key 'reversal:sin_cuenta:<línea>', amount = valor, debit_account/credit_account NULL, y el detalle
--              dice el lado (débito/crédito), el asiento original y el contra-asiento parcial. Por eso ese contra-asiento
--              queda descuadrado exactamente por la suma de esas líneas (se valida: cualquier otra diferencia aborta).
--              Al asignarle el auxiliar, contabilidad llama fn_reversar_linea_sin_cuenta(failure_id, cuenta), que
--              publica el espejo de esa línea con esa cuenta (fact_key 'reversal:linea:<línea>') y resuelve el pendiente;
--              contra-asiento parcial + complemento cuadran. NO existe cuenta puente/transitoria.
--              Líneas sin cuenta y sin valor se omiten. fn_auto_journal_void ya no registra el genérico
--              'void:sin_cuenta:<asiento>' (lo reemplaza el ítem por línea, para no duplicar el pendiente).
--   ALTO (1) (respuesta del Contador DIAN): si la venta YA tiene asiento publicado, la anulación SIEMPRE genera
--              el contra-asiento con la FECHA DE LA ANULACIÓN, aunque la factura nunca haya llegado a la DIAN o
--              esté rechazada. Se quita de fn_auto_journal_void la rama einvoice pending/processing/rejected/failed;
--              la única omisión es «no existe asiento de venta previo». (Borrador sigue descartándose.)
--              No corrige las facturas ya anuladas sin reversa: eso es corrección de datos aparte.
-- Rollback: supabase/rollbacks/20261025134160_reversa_tercero_linea_sin_cuenta_rollback.sql (vuelve a la de 134115).

create or replace function public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamptz,
  p_categoria text, p_lote text)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
  v_pend numeric := 0;
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

  -- Líneas sin cuenta y con valor: NO se reversan (no hay cuenta exacta); quedan en la cola, sin bloquear.
  for r in select jl.* from journal_lines jl
            where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is null
              and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
  loop
    v_pend := v_pend + coalesce(r.debit, 0) - coalesce(r.credit, 0);
    perform public.fn_log_journal_failure(
      v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
      'reversal', p_entry_id::text, 'reversal:sin_cuenta:' || r.id,
      null, null, abs(coalesce(r.debit, 0) - coalesce(r.credit, 0)), 'linea_sin_cuenta',
      'Reversión ' || p_lote || ': línea ' || r.id || ' SIN cuenta del asiento ' || p_entry_id
        || ' (original ' || case when coalesce(r.debit, 0) <> 0 then 'débito ' || r.debit else 'crédito ' || r.credit end
        || coalesce(', tercero ' || r.tercero_nit, '') || coalesce(', ' || r.description, '')
        || ') NO reversada; contra-asiento parcial ' || v_rev_id
        || '. Asignar cuenta y ejecutar fn_reversar_linea_sin_cuenta(id, cuenta)');
  end loop;

  -- El parcial solo puede descuadrar por las líneas sin cuenta pendientes (D_rev - C_rev = D - C de las líneas sin cuenta).
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if (v_d - v_c) is distinct from v_pend then
    raise exception 'El contra-asiento de % no cuadra (D % / C %, pendiente sin cuenta %)', p_entry_id, v_d, v_c, v_pend;
  end if;
  return v_rev_id;
end $$;
revoke all on function public.fn_revertir_asiento_en_fecha(integer, timestamptz, text, text) from public, anon, authenticated;

-- Publica la reversa pendiente de UNA línea sin cuenta, con la cuenta que contabilidad le asigna.
create or replace function public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuenta text)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  f journal_entry_failures%rowtype;
  l journal_lines%rowtype;
  o journal_entries%rowtype;
  v_line integer;
  v_id integer;
begin
  select * into f from journal_entry_failures where id = p_failure_id for update;
  if not found or f.reason <> 'linea_sin_cuenta' or f.fact_key not like 'reversal:sin_cuenta:%' then
    raise exception 'Pendiente % no es una reversa de línea sin cuenta', p_failure_id;
  end if;
  if f.resolved_at is not null then raise exception 'Pendiente % ya resuelto', p_failure_id; end if;
  if nullif(btrim(p_cuenta), '') is null then raise exception 'Cuenta obligatoria'; end if;
  v_line := substr(f.fact_key, length('reversal:sin_cuenta:') + 1)::integer;
  select * into l from journal_lines where id = v_line;
  if not found then raise exception 'Línea % no existe', v_line; end if;
  select * into o from journal_entries where id = l.journal_entry_id;
  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (o.organization_id, o.branch_id, now(),
          'REVERSION línea ' || v_line || ' (cuenta asignada ' || p_cuenta || ') | asiento ' || o.id || ' | ' || coalesce(o.memo, ''),
          'reversal', o.id::text, true, null, o.currency_code, o.exchange_rate, o.base_currency_code,
          'reversal:linea:' || v_line)
  returning id into v_id;
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, currency_code,
                             exchange_rate, debit_base, credit_base, cost_center_id, tercero_nit, tercero_nombre)
  values (v_id, p_cuenta, 'REVERSION ' || coalesce(l.description, ''), coalesce(l.credit, 0), coalesce(l.debit, 0),
          coalesce(l.organization_id, o.organization_id), l.currency_code, l.exchange_rate, l.credit_base, l.debit_base,
          l.cost_center_id, l.tercero_nit, l.tercero_nombre);
  update journal_entry_failures set resolved_at = now(), resolution = 'reversada_cuenta_' || p_cuenta where id = p_failure_id;
  return v_id;
end $$;
revoke all on function public.fn_reversar_linea_sin_cuenta(bigint, text) from public, anon, authenticated;

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
            -- (2) Líneas sin cuenta: el pendiente se registra por línea en fn_revertir_asiento_en_fecha.
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

