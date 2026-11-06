-- Reversión de 20261107121000_reversa_una_sola_implementacion. Va antes que la de 20261107120000.
--
-- Restaura las variantes y el disparador de centro tal como estaban y borra el núcleo.
-- NO revierte datos: los contra-asientos publicados se quedan. Las columnas motivo y created_by de
-- journal_reversa_pendiente no se borran. Un pendiente abierto con reason `reversa_cuenta_titulo` deja de
-- resolverse con fn_reversar_linea_sin_cuenta, que vuelve a aceptar solo `linea_sin_cuenta`.

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento(p_entry_id integer, p_categoria text, p_lote text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not v_orig.posted then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'Asiento % ya tiene contra-asiento', p_entry_id;
  end if;

  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, v_orig.entry_date,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  -- Copia exacta con débito y crédito intercambiados: nunca la fórmula vigente.
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
  from journal_lines jl
  where jl.journal_entry_id = p_entry_id;

  -- Original + contra-asiento = 0 por cuenta.
  if exists (
    select 1 from journal_lines jl
    where jl.journal_entry_id in (p_entry_id, v_rev_id)
    group by jl.account_code
    having sum(jl.debit) <> sum(jl.credit)
  ) then
    raise exception 'El contra-asiento de % no neutraliza alguna cuenta', p_entry_id;
  end if;

  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_categoria text, p_lote text, p_fecha timestamp with time zone, p_created_by uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig public.journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not coalesce(v_orig.posted, false) then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from public.journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'ASIENTO_YA_REVERTIDO: el asiento % ya tiene contra-asiento', p_entry_id using errcode = '23505';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, p_fecha,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, p_created_by,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
    from public.journal_lines jl
   where jl.journal_entry_id = p_entry_id;

  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamp with time zone, p_categoria text, p_lote text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_publicar(p_entry_id integer, p_fecha timestamp with time zone, p_categoria text, p_lote text, p_cuentas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuentas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

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

  if v_dist is not null then
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

revoke execute on function public.fn_reversar_linea_sin_cuenta(bigint, jsonb) from authenticated;
drop function if exists public.fn_revertir_asiento_nucleo(integer, timestamptz, text, text, uuid, jsonb);
drop function if exists public.fn_asiento_motivo_reversa(integer);
