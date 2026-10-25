-- Correctivo QA tanda 2 (68f9140c AMARILLO), 25-oct-2026. NO aplicada.
--   MEDIO (2): cada línea del contra-asiento copia tercero_nit / tercero_nombre de su línea original
--              (source 'reversal' no lo rellena trg_tercero_linea_asiento), así la cartera por cliente cruza.
--   BAJO (3) (regla CORREGIDA del contador, 25-oct-2026: nunca se publica un asiento descuadrado; sin cuenta puente):
--              la reversa usa EXACTAMENTE la cuenta de cada línea. Si el asiento original tiene UNA O MÁS líneas SIN
--              cuenta y CON valor, el contra-asiento COMPLETO NO se publica (0 líneas): queda entero en pendientes,
--              1 ítem por asiento en journal_entry_failures (reason 'linea_sin_cuenta', fact_key
--              'reversal:pendiente:<asiento>', amount = suma de las líneas sin cuenta, detalle con id/lado/valor de
--              cada una) y su estado en journal_reversa_pendiente (fecha de anulación, lote, cuentas asignadas).
--              La FACTURA queda anulada igual (fn_revertir_asiento_en_fecha devuelve NULL, no lanza).
--              Contabilidad llama fn_reversar_linea_sin_cuenta(failure_id, '{"<id_línea>":"<cuenta>", ...}'): guarda
--              las cuentas; mientras falte alguna línea sigue pendiente (devuelve NULL); cuando TODAS tienen cuenta
--              publica el contra-asiento COMPLETO y CUADRADO (fact_key 'reversal:<asiento>') con fecha = fecha de la
--              anulación si su período sigue abierto, o la fecha de publicación si ya se cerró, y resuelve el pendiente.
--              Líneas sin cuenta y sin valor se omiten. No existe cuenta puente (28959501 eliminada).
--   ALTO (1) (respuesta del Contador DIAN): si la venta YA tiene asiento publicado, la anulación SIEMPRE genera
--              el contra-asiento con la FECHA DE LA ANULACIÓN, aunque la factura nunca haya llegado a la DIAN o
--              esté rechazada. La única omisión es «no existe asiento de venta previo». (Borrador sigue descartándose.)
--   VALIDACIÓN GENERAL (partida doble): constraint trigger DEFERRABLE INITIALLY DEFERRED trg_zz_asiento_cuadrado en
--              journal_entries (insert/update) y journal_lines (insert/update/delete), función fn_trg_asiento_cuadrado.
--              Es el ÚNICO punto común por donde pasan TODOS los flujos (fn_create_journal_entry, fn_auto_journal_*,
--              reversas, NC, hoteles, siembra, pedido web, inserts directos). Al COMMIT, todo asiento publicado
--              (posted) que se tocó en la transacción debe tener suma(debit) = suma(credit); si no, excepción
--              'asiento_descuadrado' (23514) y se revierte todo. Diferido como trg_asiento_exige_lineas, porque los
--              flujos insertan las líneas una a una después del encabezado. No revisa históricos no tocados.
-- Rollback: supabase/rollbacks/20261025134160_reversa_tercero_linea_sin_cuenta_rollback.sql.

drop function if exists public.fn_reversar_linea_sin_cuenta(bigint, text);

create table if not exists public.journal_reversa_pendiente (
  entry_id integer primary key,
  organization_id integer not null,
  failure_fact_key text not null,
  fecha_anulacion timestamptz not null,
  categoria text,
  lote text,
  cuentas jsonb not null default '{}'::jsonb,
  reversal_entry_id integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.journal_reversa_pendiente enable row level security;
revoke all on table public.journal_reversa_pendiente from public, anon, authenticated;

-- Validación general de partida doble.
create or replace function public.fn_trg_asiento_cuadrado()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id integer;
  v_d numeric;
  v_c numeric;
begin
  if tg_table_name = 'journal_entries' then v_id := new.id;
  elsif tg_op = 'DELETE' then v_id := old.journal_entry_id;
  else v_id := new.journal_entry_id; end if;
  if not exists (select 1 from public.journal_entries e where e.id = v_id and e.posted is true) then
    return null;
  end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_d, v_c
    from public.journal_lines where journal_entry_id = v_id;
  if v_d <> v_c then
    raise exception 'asiento_descuadrado: asiento % D % / C %', v_id, v_d, v_c using errcode = '23514';
  end if;
  return null;
end $$;
drop trigger if exists trg_zz_asiento_cuadrado on public.journal_entries;
create constraint trigger trg_zz_asiento_cuadrado after insert or update on public.journal_entries
  deferrable initially deferred for each row execute function public.fn_trg_asiento_cuadrado();
drop trigger if exists trg_zz_asiento_cuadrado on public.journal_lines;
create constraint trigger trg_zz_asiento_cuadrado after insert or update or delete on public.journal_lines
  deferrable initially deferred for each row execute function public.fn_trg_asiento_cuadrado();

-- Núcleo: publica el contra-asiento completo; p_cuentas da la cuenta de las líneas originales sin cuenta.
create or replace function public.fn_revertir_asiento_publicar(p_entry_id integer, p_fecha timestamptz,
  p_categoria text, p_lote text, p_cuentas jsonb)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id;
  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code, 'reversal:' || p_entry_id)
  returning id into v_rev_id;
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id,
                             tercero_nit, tercero_nombre)
  select v_rev_id, coalesce(nullif(btrim(jl.account_code), ''), coalesce(p_cuentas, '{}'::jsonb) ->> jl.id::text),
         'REVERSION ' || coalesce(jl.description, ''), coalesce(jl.credit, 0), coalesce(jl.debit, 0),
         coalesce(jl.organization_id, v_orig.organization_id), jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base,
         jl.cost_center_id, jl.tercero_nit, jl.tercero_nombre
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id
     and (nullif(btrim(jl.account_code), '') is not null or coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
   order by jl.id;
  if exists (select 1 from journal_lines where journal_entry_id = v_rev_id and nullif(btrim(account_code), '') is null) then
    raise exception 'Contra-asiento de % con líneas sin cuenta', p_entry_id;
  end if;
  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;
  return v_rev_id;
end $$;
revoke all on function public.fn_revertir_asiento_publicar(integer, timestamptz, text, text, jsonb) from public, anon, authenticated;

create or replace function public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamptz,
  p_categoria text, p_lote text)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_orig journal_entries%rowtype;
  v_det text;
  v_monto numeric;
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

  -- Líneas sin cuenta y con valor: el contra-asiento COMPLETO queda pendiente (no se publica nada).
  select string_agg('línea ' || jl.id || ' ' || case when coalesce(jl.debit, 0) <> 0 then 'débito ' || jl.debit
                    else 'crédito ' || jl.credit end || coalesce(' tercero ' || jl.tercero_nit, '')
                    || coalesce(' «' || jl.description || '»', ''), '; ' order by jl.id),
         sum(abs(coalesce(jl.debit, 0) - coalesce(jl.credit, 0)))
    into v_det, v_monto
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is null
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0);
  if v_det is not null then
    insert into journal_reversa_pendiente (entry_id, organization_id, failure_fact_key, fecha_anulacion, categoria, lote)
    values (p_entry_id, v_orig.organization_id, 'reversal:pendiente:' || p_entry_id, coalesce(p_fecha, now()), p_categoria, p_lote)
    on conflict (entry_id) do update set fecha_anulacion = excluded.fecha_anulacion, categoria = excluded.categoria,
      lote = excluded.lote, resolved_at = null, reversal_entry_id = null;
    perform public.fn_log_journal_failure(
      v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
      'reversal', p_entry_id::text, 'reversal:pendiente:' || p_entry_id,
      null, null, v_monto, 'linea_sin_cuenta',
      'Reversión ' || p_lote || ': contra-asiento COMPLETO del asiento ' || p_entry_id
        || ' pendiente por líneas sin cuenta (' || v_det
        || '). Asignar cuentas con fn_reversar_linea_sin_cuenta(id, {"<línea>":"<cuenta>"})');
    return null;
  end if;

  return public.fn_revertir_asiento_publicar(p_entry_id, p_fecha, p_categoria, p_lote, '{}'::jsonb);
end $$;
revoke all on function public.fn_revertir_asiento_en_fecha(integer, timestamptz, text, text) from public, anon, authenticated;

-- Asigna cuentas a las líneas sin cuenta de un contra-asiento pendiente; publica el COMPLETO cuando todas tienen cuenta.
create or replace function public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuentas jsonb)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  f journal_entry_failures%rowtype;
  p journal_reversa_pendiente%rowtype;
  v_k text;
  v_faltan integer;
  v_fecha timestamptz;
  v_rev integer;
begin
  select * into f from journal_entry_failures where id = p_failure_id for update;
  if not found or f.reason <> 'linea_sin_cuenta' or f.fact_key not like 'reversal:pendiente:%' then
    raise exception 'Pendiente % no es un contra-asiento pendiente por líneas sin cuenta', p_failure_id;
  end if;
  if f.resolved_at is not null then raise exception 'Pendiente % ya resuelto', p_failure_id; end if;
  select * into p from journal_reversa_pendiente
   where entry_id = substr(f.fact_key, length('reversal:pendiente:') + 1)::integer for update;
  if not found then raise exception 'Sin estado de reversa pendiente para %', f.fact_key; end if;
  if jsonb_typeof(coalesce(p_cuentas, '{}'::jsonb)) <> 'object' then
    raise exception 'p_cuentas debe ser {"<id_línea>":"<cuenta>"}';
  end if;
  for v_k in select jsonb_object_keys(coalesce(p_cuentas, '{}'::jsonb)) loop
    if not exists (select 1 from journal_lines jl where jl.id = v_k::integer and jl.journal_entry_id = p.entry_id
                     and nullif(btrim(jl.account_code), '') is null) then
      raise exception 'La línea % no es una línea sin cuenta del asiento %', v_k, p.entry_id;
    end if;
    if nullif(btrim(p_cuentas ->> v_k), '') is null then raise exception 'Cuenta vacía para la línea %', v_k; end if;
  end loop;
  update journal_reversa_pendiente set cuentas = cuentas || coalesce(p_cuentas, '{}'::jsonb)
   where entry_id = p.entry_id returning * into p;

  select count(*) into v_faltan from journal_lines jl
   where jl.journal_entry_id = p.entry_id and nullif(btrim(jl.account_code), '') is null
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
     and nullif(btrim(p.cuentas ->> jl.id::text), '') is null;
  if v_faltan > 0 then
    update journal_entry_failures set detail = detail || ' | asignadas: ' || p.cuentas::text || ', faltan ' || v_faltan
     where id = p_failure_id;
    return null;
  end if;

  v_fecha := case when fn_is_period_open(p.organization_id, p.fecha_anulacion::date) then p.fecha_anulacion else now() end;
  v_rev := public.fn_revertir_asiento_publicar(p.entry_id, v_fecha, coalesce(p.categoria, 'anulacion'),
                                              coalesce(p.lote, p.entry_id::text), p.cuentas);
  update journal_reversa_pendiente set reversal_entry_id = v_rev, resolved_at = now() where entry_id = p.entry_id;
  update journal_entry_failures set resolved_at = now(), resolution = 'reversa_publicada:' || v_rev where id = p_failure_id;
  return v_rev;
end $$;
revoke all on function public.fn_reversar_linea_sin_cuenta(bigint, jsonb) from public, anon, authenticated;

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

