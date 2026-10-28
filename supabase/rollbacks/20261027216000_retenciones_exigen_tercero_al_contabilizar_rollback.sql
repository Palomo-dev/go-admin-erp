-- Restaura las versiones anteriores.
CREATE OR REPLACE FUNCTION public.fn_exigencias_cuenta(p_organization_id integer, p_cuenta text, OUT requiere_tercero boolean, OUT requiere_centro_costo boolean)
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(a.requiere_tercero, false),
    coalesce(a.centro_costo_modo, 'no_aplica') = 'obligatorio'
      and exists (
        select 1
          from public.cost_centers c
         where c.organization_id = p_organization_id
           and c.is_active
      )
  from public.chart_of_accounts a
  where a.organization_id = p_organization_id
    and a.account_code = nullif(btrim(p_cuenta), '');
$function$;

CREATE OR REPLACE FUNCTION public.fn_asiento_manual_crear(p_organization_id integer, p_branch_id integer, p_fecha timestamp with time zone, p_memo text, p_lineas jsonb, p_publicar boolean DEFAULT true, p_currency_code text DEFAULT 'COP'::text, p_exchange_rate numeric DEFAULT 1, p_base_currency_code text DEFAULT 'COP'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_entry_id integer;
  v_linea jsonb;
  v_debe numeric := 0;
  v_haber numeric := 0;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  v_tasa numeric := coalesce(nullif(p_exchange_rate, 0), 1);
  v_dia date;
  v_nit text;
  v_cc text;
  v_exige record;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: crear asientos manuales requiere el permiso finance.create' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'LINEAS_INSUFICIENTES: un asiento necesita al menos dos líneas' using errcode = '22023';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cuenta := v_linea->>'account_code';
    v_d := coalesce((v_linea->>'debit')::numeric, 0);
    v_c := coalesce((v_linea->>'credit')::numeric, 0);
    v_nit := nullif(btrim(v_linea->>'tercero_nit'), '');
    v_cc := nullif(v_linea->>'cost_center_id', '');
    if v_d < 0 or v_c < 0 or (v_d > 0 and v_c > 0) or (v_d = 0 and v_c = 0) then
      raise exception 'LINEA_INVALIDA: cada línea va al débito o al crédito, con importe positivo (cuenta %)', v_cuenta
        using errcode = '22023';
    end if;
    perform public.fn_exigir_cuenta_movimiento(p_organization_id, v_cuenta);
    select * into v_exige from public.fn_exigencias_cuenta(p_organization_id, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_linea->>'tercero_nombre'), '') is null then
      raise exception 'TERCERO_REQUERIDO: la cuenta % exige el nombre del tercero', v_cuenta
        using errcode = '22023';
    end if;
    if coalesce(v_exige.requiere_centro_costo, false) and v_cc is null then
      v_cc := public.fn_centro_defecto(p_organization_id, p_branch_id)::text;
      if v_cc is null then
        raise warning 'centro_costo_omitido: la cuenta % no tiene centro y la organización no tiene uno activo', v_cuenta;
      end if;
    end if;
    if v_cc is not null and not exists (
      select 1 from public.cost_centers cc
       where cc.id = v_cc::uuid and cc.organization_id = p_organization_id and cc.is_active
    ) then
      raise exception 'CENTRO_INVALIDO: el centro de costo no pertenece a la organización' using errcode = '22023';
    end if;
    v_debe := v_debe + v_d;
    v_haber := v_haber + v_c;
  end loop;

  if round(v_debe, 2) <> round(v_haber, 2) then
    raise exception 'ASIENTO_DESCUADRADO: débitos % y créditos %', v_debe, v_haber using errcode = '22023';
  end if;

  v_dia := (p_fecha at time zone public.fn_timezone_for(p_organization_id, p_branch_id))::date;
  if p_publicar and not public.fn_is_period_open(p_organization_id, v_dia) then
    raise exception 'PERIODO_CERRADO: el periodo del % está cerrado', v_dia using errcode = '22023';
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted,
    created_by, currency_code, exchange_rate, base_currency_code, fact_key
  ) values (
    p_organization_id, p_branch_id, p_fecha, nullif(trim(p_memo), ''), 'manual', null, p_publicar,
    v_uid, coalesce(p_currency_code, 'COP'), v_tasa, coalesce(p_base_currency_code, 'COP'),
    'manual:' || gen_random_uuid()
  ) returning id into v_entry_id;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, currency_code, exchange_rate, debit_base, credit_base,
    cost_center_id, tercero_nit, tercero_nombre
  )
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         r.debito, r.credito,
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         r.debito_base, r.credito_base,
         r.cost_center_id,
         nullif(btrim(l->>'tercero_nit'), ''),
         nullif(btrim(l->>'tercero_nombre'), '')
    from jsonb_array_elements(p_lineas) l
    cross join lateral public.fn_repartir_monto(
      p_organization_id,
      p_branch_id,
      l->>'account_code',
      nullif(l->>'cost_center_id', '')::uuid,
      nullif(l->>'distribucion_id', '')::uuid,
      coalesce((l->>'debit')::numeric, 0),
      coalesce((l->>'credit')::numeric, 0),
      coalesce((l->>'debit')::numeric, 0) * v_tasa,
      coalesce((l->>'credit')::numeric, 0) * v_tasa
    ) r;

  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_asiento_manual_publicar(p_entry_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_je public.journal_entries%rowtype;
  v_d numeric;
  v_c numeric;
  v_num integer;
  v_pref text;
begin
  select * into v_je from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'ASIENTO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_je.source is distinct from 'manual' then
    raise exception 'NO_ES_MANUAL' using errcode = '22023';
  end if;
  if coalesce(v_je.posted, false) then
    return;
  end if;
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = p_entry_id;
  if coalesce(v_d, 0) = 0 or round(v_d, 2) <> round(v_c, 2) then
    raise exception 'ASIENTO_DESCUADRADO' using errcode = '22023';
  end if;
  if not public.fn_is_period_open(
    v_je.organization_id,
    (v_je.entry_date at time zone public.fn_timezone_for(v_je.organization_id, v_je.branch_id))::date
  ) then
    raise exception 'PERIODO_CERRADO' using errcode = '22023';
  end if;

  if v_je.comprobante_numero is null then
    select c.numero, c.prefijo into v_num, v_pref
      from public.fn_tomar_consecutivo_comprobante(v_je.organization_id, 'nota_contable', 'NA') c;
  end if;

  update public.journal_entries
     set posted = true,
         comprobante_tipo = coalesce(comprobante_tipo, 'nota_contable'),
         comprobante_prefijo = coalesce(comprobante_prefijo, v_pref),
         comprobante_numero = coalesce(comprobante_numero, v_num),
         updated_at = now()
   where id = p_entry_id;
end;
$function$;

drop function if exists public.fn_cuenta_retencion_exige_nit(text);
delete from supabase_migrations.schema_migrations where version = '20261027216000';
