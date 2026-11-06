-- Hallazgo 5 (auditoría del Contador, 2026-11-06): una sola reversa, completa, atómica e idempotente.
--
-- Antes había cuatro implementaciones y divergían:
--   * fn_revertir_asiento y fn_revertir_asiento_en_fecha(5 args) no copiaban tercero_nit ni tercero_nombre.
--   * El disparador de centro le ponía el centro por defecto a una línea que no lo tenía, o le quitaba el
--     suyo si la cuenta hoy es `no_aplica`: la reversa no era copia del original.
--   * Una línea en una cuenta que hoy es de título tumbaba la anulación con cuenta_no_es_de_movimiento.
--   * Repetir la reversa daba error (o duplicaba el pendiente) en vez de devolver la misma.
--   * fn_reversar_linea_sin_cuenta no tenía guarda de organización ni permiso.
-- Ahora fn_revertir_asiento_nucleo es la única implementación; las variantes conservan su firma y delegan:
--   * Copia cuentas, tercero (nit y nombre), centro, sede y moneda (currency_code, exchange_rate,
--     debit_base, credit_base) con débito y crédito invertidos, más la traza de redondeo.
--   * Idempotente: la clave única es reversal:<id>. El original se bloquea FOR UPDATE, así que dos
--     reversas concurrentes hacen fila y la segunda devuelve el mismo contra-asiento.
--   * Atómica: si cualquier línea falla, no queda nada publicado.
--   * Una línea en cuenta de título NO se salta la regla ni se publica a medias: el contra-asiento COMPLETO
--     queda pendiente (journal_reversa_pendiente + journal_entry_failures, reason `reversa_cuenta_titulo`).
--     El Contador elige un auxiliar de movimiento de esa misma cuenta con fn_reversar_linea_sin_cuenta.
--     Nunca se escoge un auxiliar solo: eso es criterio contable.
-- Las migraciones anteriores siguen congeladas (134160 incluida); esto las reemplaza por delante.
-- Rollback: supabase/rollbacks/20261107121000_reversa_una_sola_implementacion_rollback.sql

alter table public.journal_reversa_pendiente add column if not exists motivo text;
alter table public.journal_reversa_pendiente add column if not exists created_by uuid;
comment on column public.journal_reversa_pendiente.motivo is
  'Motivo de una reversa manual: pasa a journal_reversals cuando se publica el contra-asiento.';
comment on column public.journal_reversa_pendiente.created_by is
  'Quién pidió la reversa. Será el autor del contra-asiento cuando se publique.';

-- Implementación única. Interna: se llega por las variantes o por fn_reversar_linea_sin_cuenta.
create or replace function public.fn_revertir_asiento_nucleo(
  p_entry_id integer,
  p_fecha timestamptz,
  p_categoria text,
  p_lote text,
  p_created_by uuid default null,
  p_cuentas jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_orig public.journal_entries%rowtype;
  v_fecha timestamptz := coalesce(p_fecha, now());
  v_autor uuid := coalesce(p_created_by, auth.uid());
  v_clave text := 'reversal:' || p_entry_id;
  v_clave_pendiente text := 'reversal:pendiente:' || p_entry_id;
  v_cuentas jsonb;
  v_rev integer;
  v_det text;
  v_monto numeric;
  v_sin_cuenta boolean;
  v_motivo text;
  v_n_o integer;
  v_n_r integer;
  v_od numeric; v_oc numeric; v_odb numeric; v_ocb numeric;
  v_rd numeric; v_rc numeric; v_rdb numeric; v_rcb numeric;
begin
  -- El bloqueo pone en fila las reversas concurrentes del mismo asiento.
  select * into v_orig from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not coalesce(v_orig.posted, false) then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;

  select e.id into v_rev
    from public.journal_entries e
   where e.organization_id = v_orig.organization_id and e.fact_key = v_clave;
  if v_rev is not null then
    return v_rev;
  end if;

  select p.cuentas into v_cuentas from public.journal_reversa_pendiente p where p.entry_id = p_entry_id;
  v_cuentas := coalesce(v_cuentas, '{}'::jsonb) || coalesce(p_cuentas, '{}'::jsonb);

  -- Líneas con valor que hoy no se pueden copiar: sin cuenta, o en una cuenta que pasó a ser de título.
  select string_agg(
           'línea ' || b.id || ' ' || coalesce(nullif(btrim(b.account_code), ''), 'sin cuenta') || ' '
             || case when coalesce(b.debit, 0) <> 0 then 'débito ' || b.debit else 'crédito ' || b.credit end
             || coalesce(' tercero ' || b.tercero_nit, '')
             || coalesce(' «' || b.description || '»', ''),
           '; ' order by b.id),
         sum(abs(coalesce(b.debit, 0) - coalesce(b.credit, 0))),
         bool_or(nullif(btrim(b.account_code), '') is null)
    into v_det, v_monto, v_sin_cuenta
    from (
      select jl.id, jl.account_code, jl.debit, jl.credit, jl.tercero_nit, jl.description
        from public.journal_lines jl
        left join public.chart_of_accounts c
          on c.organization_id = v_orig.organization_id and c.account_code = jl.account_code
       where jl.journal_entry_id = p_entry_id
         and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
         and (nullif(btrim(jl.account_code), '') is null or c.es_movimiento is false)
         and nullif(btrim(v_cuentas ->> jl.id::text), '') is null
    ) b;

  if v_det is not null then
    insert into public.journal_reversa_pendiente (
      entry_id, organization_id, failure_fact_key, fecha_anulacion, categoria, lote, created_by
    ) values (
      p_entry_id, v_orig.organization_id, v_clave_pendiente, v_fecha, p_categoria, p_lote, v_autor
    )
    on conflict (entry_id) do update
      set fecha_anulacion = excluded.fecha_anulacion, categoria = excluded.categoria,
          lote = excluded.lote, created_by = coalesce(excluded.created_by, public.journal_reversa_pendiente.created_by),
          resolved_at = null, reversal_entry_id = null;

    v_det := 'Reversión ' || coalesce(p_lote, '') || ': el contra-asiento COMPLETO del asiento ' || p_entry_id
      || ' queda pendiente, no se publica nada. '
      || case when v_sin_cuenta then 'Hay líneas sin cuenta' else 'Hay líneas en cuentas que hoy son de título' end
      || ' (' || v_det || '). Asigna un auxiliar de movimiento a cada una en Pendientes contables.';

    if exists (
      select 1 from public.journal_entry_failures f
       where f.organization_id = v_orig.organization_id
         and f.fact_key = v_clave_pendiente and f.resolved_at is null
    ) then
      update public.journal_entry_failures f
         set amount = v_monto, detail = v_det,
             reason = case when v_sin_cuenta then 'linea_sin_cuenta' else 'reversa_cuenta_titulo' end
       where f.organization_id = v_orig.organization_id
         and f.fact_key = v_clave_pendiente and f.resolved_at is null;
    else
      perform public.fn_log_journal_failure(
        v_orig.organization_id, v_orig.branch_id, v_fecha,
        'reversal', p_entry_id::text, v_clave_pendiente,
        null, null, v_monto,
        case when v_sin_cuenta then 'linea_sin_cuenta' else 'reversa_cuenta_titulo' end,
        v_det
      );
    end if;
    return null;
  end if;

  begin
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted,
      created_by, currency_code, exchange_rate, base_currency_code, fact_key
    ) values (
      v_orig.organization_id, v_orig.branch_id, v_fecha,
      'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
      'reversal', p_entry_id::text, true, v_autor,
      v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code, v_clave
    ) returning id into v_rev;
  exception when unique_violation then
    -- Red de seguridad: la clave única gana aunque el bloqueo no hubiera bastado.
    select e.id into v_rev
      from public.journal_entries e
     where e.organization_id = v_orig.organization_id and e.fact_key = v_clave;
    if v_rev is null then
      raise;
    end if;
    return v_rev;
  end;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, currency_code, exchange_rate, debit_base, credit_base,
    cost_center_id, tercero_nit, tercero_nombre, redondeo_traza
  )
  select v_rev,
         coalesce(o.asignada, jl.account_code),
         'REVERSION ' || coalesce(jl.description, ''),
         coalesce(jl.credit, 0), coalesce(jl.debit, 0),
         v_orig.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base,
         jl.cost_center_id, jl.tercero_nit, jl.tercero_nombre, jl.redondeo_traza
    from public.journal_lines jl
    left join public.chart_of_accounts c
      on c.organization_id = v_orig.organization_id and c.account_code = jl.account_code
    cross join lateral (
      select case when nullif(btrim(jl.account_code), '') is null or c.es_movimiento is false
                  then nullif(btrim(v_cuentas ->> jl.id::text), '') end as asignada
    ) o
   where jl.journal_entry_id = p_entry_id
     -- Una línea en cero sobre una cuenta que ya no la recibe no mueve nada: es la única que se omite.
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0
          or (nullif(btrim(jl.account_code), '') is not null and c.es_movimiento is distinct from false))
   order by jl.id;

  -- Completa: mismas líneas e importes invertidos, en moneda y en base.
  select count(*), coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0),
         coalesce(sum(jl.debit_base), 0), coalesce(sum(jl.credit_base), 0)
    into v_n_r, v_rd, v_rc, v_rdb, v_rcb
    from public.journal_lines jl where jl.journal_entry_id = v_rev;
  select count(*), coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0),
         coalesce(sum(jl.debit_base), 0), coalesce(sum(jl.credit_base), 0)
    into v_n_o, v_od, v_oc, v_odb, v_ocb
    from public.journal_lines jl
    left join public.chart_of_accounts c
      on c.organization_id = v_orig.organization_id and c.account_code = jl.account_code
   where jl.journal_entry_id = p_entry_id
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0
          or (nullif(btrim(jl.account_code), '') is not null and c.es_movimiento is distinct from false));

  if v_n_r <> v_n_o or v_rd <> v_oc or v_rc <> v_od or v_rdb <> v_ocb or v_rcb <> v_odb then
    raise exception 'El contra-asiento de % no copia el original (líneas % de %, D % / C %, base D % / C %)',
      p_entry_id, v_n_r, v_n_o, v_rd, v_rc, v_rdb, v_rcb;
  end if;
  if v_rd <> v_rc then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_rd, v_rc;
  end if;
  -- Original + contra-asiento = 0 por cuenta, salvo donde el Contador eligió un auxiliar.
  if v_cuentas = '{}'::jsonb and exists (
    select 1 from public.journal_lines jl
     where jl.journal_entry_id in (p_entry_id, v_rev)
     group by jl.account_code
    having sum(jl.debit) <> sum(jl.credit)
  ) then
    raise exception 'El contra-asiento de % no neutraliza alguna cuenta', p_entry_id;
  end if;

  select p.motivo into v_motivo from public.journal_reversa_pendiente p
   where p.entry_id = p_entry_id and p.resolved_at is null;
  if v_motivo is not null then
    insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
    values (v_orig.organization_id, coalesce(p_lote, p_entry_id::text), coalesce(p_categoria, 'manual'),
            p_entry_id, v_rev, v_motivo, v_autor);
  end if;
  update public.journal_reversa_pendiente
     set cuentas = v_cuentas, reversal_entry_id = v_rev, resolved_at = now()
   where entry_id = p_entry_id and resolved_at is null;
  update public.journal_entry_failures
     set resolved_at = now(), resolved_entry_id = v_rev, resolution = 'reversa_publicada:' || v_rev
   where organization_id = v_orig.organization_id and fact_key = v_clave_pendiente and resolved_at is null;

  return v_rev;
end;
$function$;

-- Las variantes conservan su firma: las usan fn_anular_pago, fn_propina_anular, comisiones y notas crédito.
create or replace function public.fn_revertir_asiento(p_entry_id integer, p_categoria text, p_lote text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fecha timestamptz;
begin
  select entry_date into v_fecha from public.journal_entries where id = p_entry_id;
  return public.fn_revertir_asiento_nucleo(p_entry_id, v_fecha, p_categoria, p_lote, null, '{}'::jsonb);
end;
$function$;

create or replace function public.fn_revertir_asiento_en_fecha(
  p_entry_id integer, p_categoria text, p_lote text, p_fecha timestamptz, p_created_by uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.fn_revertir_asiento_nucleo(p_entry_id, p_fecha, p_categoria, p_lote, p_created_by, '{}'::jsonb);
end;
$function$;

create or replace function public.fn_revertir_asiento_en_fecha(
  p_entry_id integer, p_fecha timestamptz, p_categoria text, p_lote text
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.fn_revertir_asiento_nucleo(p_entry_id, p_fecha, p_categoria, p_lote, null, '{}'::jsonb);
end;
$function$;

create or replace function public.fn_revertir_asiento_publicar(
  p_entry_id integer, p_fecha timestamptz, p_categoria text, p_lote text, p_cuentas jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.fn_revertir_asiento_nucleo(p_entry_id, p_fecha, p_categoria, p_lote, null, p_cuentas);
end;
$function$;

-- Contabilidad resuelve el pendiente: elige la cuenta de cada línea que no se pudo copiar.
create or replace function public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuentas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f public.journal_entry_failures%rowtype;
  p public.journal_reversa_pendiente%rowtype;
  v_entry integer;
  v_k text;
  v_cuenta text;
  v_actual text;
  v_titulo boolean;
  v_fallo text;
  v_faltan integer;
  v_fecha timestamptz;
begin
  select * into f from public.journal_entry_failures where id = p_failure_id;
  if not found or f.reason not in ('linea_sin_cuenta', 'reversa_cuenta_titulo')
     or f.fact_key not like 'reversal:pendiente:%' then
    raise exception 'Pendiente % no es un contra-asiento pendiente', p_failure_id using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(f.organization_id);
  if auth.uid() is not null and not public.fn_tiene_permiso(f.organization_id, 'accounting.reverse') then
    raise exception 'SIN_PERMISO: resolver una reversa requiere el permiso «Revertir asientos»' using errcode = '42501';
  end if;

  v_entry := substr(f.fact_key, length('reversal:pendiente:') + 1)::integer;
  -- Mismo orden de bloqueo que el núcleo: primero el asiento.
  perform 1 from public.journal_entries where id = v_entry for update;
  select * into f from public.journal_entry_failures where id = p_failure_id for update;
  if f.resolved_at is not null then
    return f.resolved_entry_id;
  end if;
  select * into p from public.journal_reversa_pendiente where entry_id = v_entry for update;
  if not found then
    raise exception 'Sin estado de reversa pendiente para %', f.fact_key;
  end if;
  if jsonb_typeof(coalesce(p_cuentas, '{}'::jsonb)) <> 'object' then
    raise exception 'p_cuentas debe ser {"<id_línea>":"<cuenta>"}' using errcode = '22023';
  end if;

  for v_k in select jsonb_object_keys(coalesce(p_cuentas, '{}'::jsonb)) loop
    v_cuenta := nullif(btrim(p_cuentas ->> v_k), '');
    if v_cuenta is null then
      raise exception 'Cuenta vacía para la línea %', v_k using errcode = '22023';
    end if;
    select jl.account_code, c.es_movimiento is false into v_actual, v_titulo
      from public.journal_lines jl
      left join public.chart_of_accounts c
        on c.organization_id = p.organization_id and c.account_code = jl.account_code
     where jl.id = v_k::integer and jl.journal_entry_id = p.entry_id;
    if not found or not (nullif(btrim(v_actual), '') is null or v_titulo) then
      raise exception 'La línea % no está pendiente de cuenta en el asiento %', v_k, p.entry_id using errcode = '22023';
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(p.organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception 'CUENTA_DE_TITULO: %', v_fallo using errcode = '22023';
    end if;
    -- Sigue siendo la misma cuenta: un auxiliar del título que tenía la línea, no otro destino.
    if v_titulo and left(v_cuenta, length(v_actual)) <> v_actual then
      raise exception 'CUENTA_NO_ES_DE_DETALLE: la cuenta % no es un auxiliar de %', v_cuenta, v_actual using errcode = '22023';
    end if;
  end loop;

  update public.journal_reversa_pendiente
     set cuentas = cuentas || coalesce(p_cuentas, '{}'::jsonb)
   where entry_id = p.entry_id
  returning * into p;

  select count(*) into v_faltan
    from public.journal_lines jl
    left join public.chart_of_accounts c
      on c.organization_id = p.organization_id and c.account_code = jl.account_code
   where jl.journal_entry_id = p.entry_id
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
     and (nullif(btrim(jl.account_code), '') is null or c.es_movimiento is false)
     and nullif(btrim(p.cuentas ->> jl.id::text), '') is null;
  if v_faltan > 0 then
    return null;
  end if;

  v_fecha := case when public.fn_is_period_open(p.organization_id, p.fecha_anulacion::date)
                  then p.fecha_anulacion else now() end;
  return public.fn_revertir_asiento_nucleo(
    p.entry_id, v_fecha, coalesce(p.categoria, 'anulacion'), coalesce(p.lote, p.entry_id::text),
    p.created_by, p.cuentas
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_manual(p_entry_id integer, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_je public.journal_entries%rowtype;
  v_tz text;
  v_fecha timestamptz;
  v_rev integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_je from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'ASIENTO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'accounting.reverse') then
    raise exception 'SIN_PERMISO: revertir asientos requiere el permiso «Revertir asientos»' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'MOTIVO_REQUERIDO: explique en al menos 5 caracteres por qué se revierte' using errcode = '22023';
  end if;
  if v_je.source = 'reversal' then
    raise exception 'ES_CONTRA_ASIENTO: un contra-asiento no se revierte; registre un asiento manual nuevo' using errcode = '22023';
  end if;
  if v_je.source is distinct from 'manual' then
    raise exception 'AUTOMATICO_SE_REVIERTE_ANULANDO_DOCUMENTO: el asiento % viene de % y se revierte anulando ese documento',
      p_entry_id, coalesce(v_je.source, 'un documento') using errcode = '22023';
  end if;
  if not coalesce(v_je.posted, false) then
    raise exception 'ES_BORRADOR: un borrador se descarta, no se revierte' using errcode = '22023';
  end if;

  -- Idempotente: una segunda reversa devuelve la misma, aunque el periodo ya esté cerrado.
  select r.id into v_rev
    from public.journal_entries r
   where r.organization_id = v_je.organization_id and r.fact_key = 'reversal:' || p_entry_id;
  if v_rev is not null then
    return v_rev;
  end if;

  v_tz := public.fn_timezone_for(v_je.organization_id, v_je.branch_id);
  if public.fn_is_period_open(v_je.organization_id, (v_je.entry_date at time zone v_tz)::date) then
    v_fecha := v_je.entry_date;
  elsif public.fn_is_period_open(v_je.organization_id, public.fn_today_for(v_je.organization_id, v_je.branch_id)) then
    v_fecha := now();
  else
    raise exception 'PERIODO_CERRADO: ni el periodo del asiento ni el actual están abiertos' using errcode = '22023';
  end if;

  v_rev := public.fn_revertir_asiento_en_fecha(p_entry_id, 'manual',
             'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), v_fecha, v_uid);

  -- Sin contra-asiento: quedó pendiente. El motivo espera allí y pasa a journal_reversals al publicarse.
  if v_rev is null then
    update public.journal_reversa_pendiente
       set motivo = trim(p_motivo), created_by = v_uid
     where entry_id = p_entry_id;
    return null;
  end if;

  insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
  values (v_je.organization_id, 'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), 'manual',
          p_entry_id, v_rev, trim(p_motivo), v_uid);

  return v_rev;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_journal_linea_heredar_centro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_modo text;
  v_org integer;
  v_branch integer;
  v_source text;
  v_source_id text;
  v_centro uuid;
  v_slip text;
  v_dist uuid;
  v_i integer := 0;
  v_parte record;
begin
  select e.organization_id, e.branch_id, e.source, e.source_id
    into v_org, v_branch, v_source, v_source_id
    from public.journal_entries e
   where e.id = new.journal_entry_id;

  if new.organization_id is null or new.organization_id = 0 then
    new.organization_id := coalesce(v_org, new.organization_id);
  end if;
  v_org := coalesce(nullif(new.organization_id, 0), v_org);

  -- La reversa es copia literal del original: ni se le pone centro por defecto ni se le quita el suyo.
  if v_source = 'reversal' then
    return new;
  end if;

  v_modo := public.fn_modo_centro(v_org, new.account_code);
  if v_modo = 'no_aplica' then
    new.cost_center_id := null;
    return new;
  end if;
  if new.cost_center_id is not null then
    return new;
  end if;

  if v_source = 'bank_transactions' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select b.distribucion_id into v_dist
      from public.bank_transactions b
     where b.id = v_source_id::integer
       and b.organization_id = v_org;
  elsif v_source = 'cash_movements' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select m.distribucion_id into v_dist
      from public.cash_movements m
     where m.id = v_source_id::integer
       and m.organization_id = v_org;
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.distribucion_id into v_dist
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
  end if;

  -- La línea de redondeo no se reparte entre centros: es una sola y va por el centro por defecto.
  if v_dist is not null and new.redondeo_traza is null then
    for v_parte in
      select *
        from public.fn_repartir_monto(
          v_org, v_branch, new.account_code, null::uuid, v_dist,
          coalesce(new.debit, 0), coalesce(new.credit, 0),
          coalesce(new.debit_base, 0), coalesce(new.credit_base, 0)
        )
    loop
      v_i := v_i + 1;
      if v_i = 1 then
        new.debit := v_parte.debito;
        new.credit := v_parte.credito;
        new.debit_base := v_parte.debito_base;
        new.credit_base := v_parte.credito_base;
        new.cost_center_id := v_parte.cost_center_id;
      else
        insert into public.journal_lines (
          journal_entry_id, account_code, description, debit, credit,
          organization_id, currency_code, exchange_rate, debit_base, credit_base,
          cost_center_id, tercero_nit, tercero_nombre
        ) values (
          new.journal_entry_id, new.account_code, new.description,
          v_parte.debito, v_parte.credito,
          coalesce(nullif(new.organization_id, 0), v_org),
          new.currency_code, new.exchange_rate,
          v_parte.debito_base, v_parte.credito_base,
          v_parte.cost_center_id, new.tercero_nit, new.tercero_nombre
        );
      end if;
    end loop;
    if v_i > 0 then
      return new;
    end if;
  end if;

  v_slip := split_part(coalesce(v_source_id, ''), ':', 1);
  if v_source = 'payroll_slips'
     and v_slip ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.cost_center_id into v_centro
      from public.payroll_slips s
      join public.employments e on e.id = s.employment_id
     where s.id = v_slip::uuid
       and (
         e.branch_id is null
         or exists (
           select 1 from public.branches b
            where b.id = e.branch_id and b.organization_id = v_org
         )
       );
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.cost_center_id into v_centro
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
    if v_centro is null then
      select case when count(distinct ii.cost_center_id) = 1 then min(ii.cost_center_id::text)::uuid end
        into v_centro
        from public.invoice_items ii
       where ii.invoice_purchase_id = v_source_id::uuid
         and ii.cost_center_id is not null;
    end if;
  end if;

  new.cost_center_id := coalesce(v_centro, public.fn_centro_defecto(v_org, v_branch));
  if new.cost_center_id is null then
    raise warning 'centro_costo_omitido: la cuenta % quedó sin centro', new.account_code;
  end if;
  return new;
end;
$function$;

-- Motivo de una reversa para la pantalla: journal_reversals no se lee desde el cliente.
create or replace function public.fn_asiento_motivo_reversa(p_reversal_entry_id integer)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select organization_id into v_org from public.journal_entries where id = p_reversal_entry_id;
  if v_org is null then
    return null;
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if not public.fn_tiene_permiso(v_org, 'finance.view') then
    return null;
  end if;
  return (
    select r.motivo from public.journal_reversals r
     where r.organization_id = v_org and r.reversal_entry_id = p_reversal_entry_id
     order by r.id desc limit 1
  );
end;
$function$;

revoke all on function public.fn_asiento_motivo_reversa(integer) from public, anon;
grant execute on function public.fn_asiento_motivo_reversa(integer) to authenticated, service_role;

revoke all on function public.fn_revertir_asiento_nucleo(integer, timestamptz, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_revertir_asiento_nucleo(integer, timestamptz, text, text, uuid, jsonb) to service_role;

-- Ya tiene guarda de organización y permiso: la pantalla de pendientes la llama con la sesión del usuario.
revoke all on function public.fn_reversar_linea_sin_cuenta(bigint, jsonb) from public, anon;
grant execute on function public.fn_reversar_linea_sin_cuenta(bigint, jsonb) to authenticated, service_role;
