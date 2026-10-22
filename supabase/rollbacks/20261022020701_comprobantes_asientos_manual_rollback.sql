-- Reversa de 20261022020701_comprobantes_asientos_manual.
--
-- Restaura fn_asiento_manual_crear y fn_asiento_manual_publicar al cuerpo
-- medido el 2026-10-22, antes de exigir tercero, centro de costo y cuenta
-- de movimiento por la via nueva. Quita las funciones de plantilla, las
-- politicas y el RLS que esta migracion encendio.
--
-- Correrla despues de 20261022020752 y antes de 20261022020425.
-- No borra plantillas guardadas: la tabla cae al revertir 20261022020232.
-- No renumera comprobantes ya emitidos.

-- Cuerpos medidos antes de aplicar, sin tercero ni comprobante.

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
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: crear asientos manuales requiere el permiso finance.create' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b
                                         where b.id = p_branch_id and b.organization_id = p_organization_id) then
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
    if v_d < 0 or v_c < 0 or (v_d > 0 and v_c > 0) or (v_d = 0 and v_c = 0) then
      raise exception 'LINEA_INVALIDA: cada línea va al débito o al crédito, con importe positivo (cuenta %)', v_cuenta
        using errcode = '22023';
    end if;
    if not exists (select 1 from public.chart_of_accounts a
                    where a.organization_id = p_organization_id and a.account_code = v_cuenta
                      and coalesce(a.is_active, true)) then
      raise exception 'CUENTA_INEXISTENTE: %', v_cuenta using errcode = '22023';
    end if;
    if public.fn_es_cuenta_de_titulo(p_organization_id, v_cuenta) then
      raise exception 'CUENTA_DE_TITULO: % agrupa otras cuentas y no recibe movimientos', v_cuenta
        using errcode = '22023';
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

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (p_organization_id, p_branch_id, p_fecha, nullif(trim(p_memo), ''), 'manual', null, p_publicar,
          v_uid, coalesce(p_currency_code, 'COP'), v_tasa, coalesce(p_base_currency_code, 'COP'),
          'manual:' || gen_random_uuid())
  returning id into v_entry_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         coalesce((l->>'debit')::numeric, 0) * v_tasa, coalesce((l->>'credit')::numeric, 0) * v_tasa,
         nullif(l->>'cost_center_id', '')::uuid
    from jsonb_array_elements(p_lineas) l;

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
  if not public.fn_is_period_open(v_je.organization_id,
        (v_je.entry_date at time zone public.fn_timezone_for(v_je.organization_id, v_je.branch_id))::date) then
    raise exception 'PERIODO_CERRADO' using errcode = '22023';
  end if;
  update public.journal_entries set posted = true, updated_at = now() where id = p_entry_id;
end;
$function$;



drop function if exists public.fn_plantilla_asiento_archivar(uuid);
drop function if exists public.fn_plantilla_asiento_aplicar(uuid, integer, timestamptz, text);
drop function if exists public.fn_plantilla_asiento_guardar(integer, uuid, text, text, jsonb);

drop policy if exists plantillas_asiento_miembros on public.plantillas_asiento;
drop policy if exists plantillas_asiento_lineas_miembros on public.plantillas_asiento_lineas;
alter table public.plantillas_asiento disable row level security;
alter table public.plantillas_asiento_lineas disable row level security;
alter table public.comprobante_consecutivos disable row level security;
