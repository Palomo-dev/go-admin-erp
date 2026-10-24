-- Extensión compatible del cálculo y motor canónicos del certificado #265.
-- Las firmas originales conservan valores y alcance. Solo quien pide
-- contabilizados=true usa asientos publicados, corte de anulaciones y filtros.
-- No se reescriben certificados expedidos ni se hace backfill; los nuevos
-- guardan el alcance en totals._filtros_contables para foto e idempotencia.
-- Versión definitiva será la devuelta por apply_migration de Supabase MCP.

create or replace function public.fn_certificado_retenciones_acceso(p_organization_id integer, p_filtros jsonb)
returns boolean language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_branch integer := nullif(p_filtros ->> 'branch_id', '')::integer;
  v_centro uuid := nullif(p_filtros ->> 'cost_center_id', '')::uuid;
  v_centro_branch integer;
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from public.organization_members om where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active = true) then return false; end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (coalesce(public.check_user_permission(auth.uid(), p_organization_id, 'finance.view'), false)
       or coalesce(public.check_user_permission(auth.uid(), p_organization_id, 'reports.finance'), false)) then return false; end if;
  if v_branch is null then
    perform public.reporte_exigir_alcance_sucursal(p_organization_id::bigint, null::bigint);
  elsif not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_organization_id)
     or public.app_branch_access(v_branch) is distinct from true then return false;
  end if;
  if v_centro is not null then
    select cc.branch_id into v_centro_branch from public.cost_centers cc where cc.id = v_centro and cc.organization_id = p_organization_id;
    if not found then return false; end if;
    if v_branch is not null and v_centro_branch is not null and v_centro_branch <> v_branch then return false; end if;
    if v_centro_branch is not null and public.app_branch_access(v_centro_branch) is distinct from true then return false; end if;
  end if;
  return true;
exception when insufficient_privilege or invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;

create or replace function public.fn_retenciones_practicadas_filas(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer,
  p_supplier_id integer,
  p_filtros jsonb
)
returns table (
  invoice_id uuid,
  numero text,
  emision timestamptz,
  supplier_id integer,
  branch_id integer,
  concepto text,
  codigo text,
  clase text,
  cuenta text,
  base numeric,
  tarifa numeric,
  valor numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with filtros as (
    select coalesce((p_filtros ->> 'contabilizados')::boolean, false) as estricto,
           nullif(p_filtros ->> 'cost_center_id', '')::uuid as centro
  ), anulaciones as (
    select case when f.estricto then public.fn_informes_anulaciones(p_organization_id, p_hasta) else '[]'::jsonb end as filas
      from filtros f
  )
  select i.id,
         coalesce(nullif(btrim(i.number_ext), ''), i.id::text)::text,
         case when f.estricto then asiento.entry_date else i.issue_date::timestamptz end,
         i.supplier_id::integer,
         case when f.estricto then asiento.branch_id else i.branch_id::integer end,
         w.concept::text,
         w.tax_code::text,
         public.fn_clase_retencion(w.tax_code, w.concept),
         case when f.estricto then case when asiento.vinculos = 1 then asiento.account_code end else coalesce(asiento.account_code,
           public.fn_cuenta_retencion_compra(i.organization_id, w.tax_code, w.concept)) end::text,
         case when f.estricto then w.base * asiento.valor_base / w.amount else w.base end::numeric,
         w.rate::numeric,
         case when f.estricto then asiento.valor_base else w.amount end::numeric
    from invoice_purchase_withholdings w
    join invoice_purchase i on i.id = w.invoice_id and i.organization_id = w.organization_id
    cross join filtros f
    cross join anulaciones a
    left join lateral (
      select jl.account_code, e.entry_date, e.branch_id, jl.cost_center_id, count(*) over () as vinculos,
             case when nullif(upper(btrim(e.base_currency_code)), '') = upper(btrim(public.fn_moneda_base_organizacion(i.organization_id))) and jl.credit_base is not null then jl.credit_base
               when coalesce(nullif(upper(btrim(jl.currency_code)), ''), nullif(upper(btrim(e.currency_code)), '')) = upper(btrim(public.fn_moneda_base_organizacion(i.organization_id))) then jl.credit
               else null end as valor_base
        from journal_entries e
        join journal_lines jl on jl.journal_entry_id = e.id
       where e.organization_id = i.organization_id
         and e.source = 'invoice_purchase'
         and e.source_id = i.id::text
         and e.memo like 'Compra %'
         and jl.description = w.concept || ' - ' || e.memo
         and jl.credit = w.amount
         and (not f.estricto or (
           e.posted and jl.organization_id = i.organization_id
           and not exists (select 1 from public.journal_reversals fisico where fisico.organization_id = i.organization_id and (fisico.reversal_entry_id = e.id or fisico.restored_entry_id = e.id))
           and e.entry_date between p_desde and p_hasta
           and (p_branch_id is null or e.branch_id = p_branch_id)
           and not exists (
             select 1 from jsonb_array_elements(a.filas) x
              where ((x ->> 'original_entry_id')::integer = e.id or (x ->> 'reversal_entry_id')::integer = e.id)
                and (x ->> 'anulado_en')::timestamptz <= p_hasta
                and (x ->> 'restaurado_en' is null or p_hasta < (x ->> 'restaurado_en')::timestamptz)
           )
         ))
       order by jl.id
       limit 1
    ) asiento on true
   where w.organization_id = p_organization_id
     and w.amount > 0
     and (f.estricto or i.status not in ('draft', 'void', 'cancelled'))
     and (f.estricto or i.issue_date between p_desde and p_hasta)
     and (f.estricto or p_branch_id is null or i.branch_id = p_branch_id)
     and (not f.estricto or (asiento.vinculos = 1 and (f.centro is null or asiento.cost_center_id = f.centro)) or (coalesce(asiento.vinculos, 0) <> 1 and exists (
       select 1 from public.journal_entries ep
        where ep.organization_id = i.organization_id and ep.posted
          and not exists (select 1 from public.journal_reversals fisico where fisico.organization_id = i.organization_id and (fisico.reversal_entry_id = ep.id or fisico.restored_entry_id = ep.id))
          and ep.source = 'invoice_purchase' and ep.source_id = i.id::text
          and ep.memo like 'Compra %' and ep.entry_date between p_desde and p_hasta
          and (p_branch_id is null or ep.branch_id = p_branch_id)
          and (f.centro is null or exists (
            select 1 from public.journal_lines lp where lp.journal_entry_id = ep.id
             and lp.organization_id = i.organization_id and lp.cost_center_id = f.centro
             and lp.credit > 0 and replace(btrim(lp.account_code), '-', '') like '236%'
          ))
          and not exists (
            select 1 from jsonb_array_elements(a.filas) x
             where ((x ->> 'original_entry_id')::integer = ep.id or (x ->> 'reversal_entry_id')::integer = ep.id)
               and (x ->> 'anulado_en')::timestamptz <= p_hasta
               and (x ->> 'restaurado_en' is null or p_hasta < (x ->> 'restaurado_en')::timestamptz)
          )
     )))
     and (p_supplier_id is null or i.supplier_id = p_supplier_id);
$$;

create or replace function public.fn_retenciones_practicadas_filas(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer,
  p_supplier_id integer
)
returns table (
  invoice_id uuid,
  numero text,
  emision timestamptz,
  supplier_id integer,
  branch_id integer,
  concepto text,
  codigo text,
  clase text,
  cuenta text,
  base numeric,
  tarifa numeric,
  valor numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select * from public.fn_retenciones_practicadas_filas(p_organization_id, p_desde, p_hasta, p_branch_id, p_supplier_id, '{}'::jsonb);
$$;

create or replace function public.fn_certificado_retenciones_proveedor(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date,
  p_filtros jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_conceptos jsonb;
  v_facturas jsonb;
  v_totales jsonb;
  v_estricto boolean := coalesce((p_filtros ->> 'contabilizados')::boolean, false);
  v_branch integer := nullif(p_filtros ->> 'branch_id', '')::integer;
  v_centro uuid := nullif(p_filtros ->> 'cost_center_id', '')::uuid;
  v_avisos jsonb := '[]'::jsonb;
  v_manuales integer := 0;
  v_anulaciones jsonb := '[]'::jsonb;
begin
  if coalesce((p_filtros ->> 'contabilizados')::boolean, false) then
    if not public.fn_certificado_retenciones_acceso(p_organization_id, p_filtros) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
    if upper(btrim(public.fn_moneda_base_organizacion(p_organization_id))) <> 'COP' then
      raise exception 'CERTIFICADO_REQUIERE_MONEDA_BASE_COLOMBIANA' using errcode = '22023';
    end if;
  else
    perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view']);
    if not public.fn_certificado_retenciones_acceso(p_organization_id, '{}'::jsonb) then raise exception 'SIN_ALCANCE_CONSOLIDADO' using errcode = '42501'; end if;
  end if;

  if not exists (select 1 from suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id) then
    raise exception 'PROVEEDOR_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'PERIODO_INVALIDO' using errcode = '22023';
  end if;

  v_tz := coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota');
  v_desde := p_desde::timestamp at time zone v_tz;
  v_hasta := ((p_hasta + 1)::timestamp at time zone v_tz) - interval '1 microsecond';

  if v_estricto and exists (
    select 1 from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, v_branch, p_supplier_id, p_filtros) f
     where f.cuenta is null
  ) then
    raise exception 'RETENCION_SIN_VINCULO_CONTABLE' using errcode = '22023';
  end if;

  if v_estricto and exists (
    select 1 from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, v_branch, p_supplier_id, p_filtros) f
     where f.valor is null or f.base is null
  ) then
    raise exception 'RETENCION_SIN_CONVERSION_HISTORICA' using errcode = '22023';
  end if;

  if v_estricto then
    v_anulaciones := public.fn_informes_anulaciones(p_organization_id, v_hasta);
    select count(*) into v_manuales
      from public.journal_entries e
      join public.journal_lines jl on jl.journal_entry_id = e.id and jl.organization_id = e.organization_id
      join public.suppliers sp on sp.id = p_supplier_id and sp.organization_id = e.organization_id
     where e.organization_id = p_organization_id and e.posted
       and not exists (select 1 from public.journal_reversals fisico where fisico.organization_id = p_organization_id and (fisico.reversal_entry_id = e.id or fisico.restored_entry_id = e.id))
       and e.entry_date between v_desde and v_hasta
       and (v_branch is null or e.branch_id = v_branch)
       and (v_centro is null or jl.cost_center_id = v_centro)
       and jl.credit > 0
       and left(replace(btrim(jl.account_code), '-', ''), 4) in ('2365', '2367', '2368')
       and regexp_replace(coalesce(sp.nit, ''), '[^0-9]', '', 'g') <> ''
       and regexp_replace(coalesce(jl.tercero_nit, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(sp.nit, ''), '[^0-9]', '', 'g')
       and not exists (
         select 1 from jsonb_array_elements(v_anulaciones) x
          where ((x ->> 'original_entry_id')::integer = e.id or (x ->> 'reversal_entry_id')::integer = e.id)
            and (x ->> 'anulado_en')::timestamptz <= v_hasta
            and (x ->> 'restaurado_en' is null or v_hasta < (x ->> 'restaurado_en')::timestamptz)
       )
       and not exists (
         select 1 from public.invoice_purchase ip
         join public.invoice_purchase_withholdings iw on iw.invoice_id = ip.id and iw.organization_id = ip.organization_id
          where ip.organization_id = p_organization_id and ip.supplier_id = p_supplier_id
            and e.source = 'invoice_purchase' and e.source_id = ip.id::text
            and jl.credit = iw.amount and jl.description = iw.concept || ' - ' || e.memo
       );
    if v_manuales > 0 then
      v_avisos := jsonb_build_array('Hay retenciones contabilizadas por tercero sin una factura vinculable con base y tarifa históricas. Este borrador es parcial: revise esos movimientos antes de certificar. La expedición está bloqueada y no se estimaron bases ni tarifas.');
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'clase', t.clase,
           'concepto', t.concepto,
           'cuenta', t.cuenta,
           'tarifa', t.tarifa,
           'base', t.base,
           'valor', t.valor
         ) order by t.orden, t.concepto, t.tarifa), '[]'::jsonb)
    into v_conceptos
    from (
      select f.clase, f.concepto, f.cuenta, f.tarifa, sum(f.base) as base, sum(f.valor) as valor,
             case f.clase when 'retefuente' then 1 when 'reteiva' then 2 else 3 end as orden
        from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, v_branch, p_supplier_id, p_filtros) f
       group by f.clase, f.concepto, f.cuenta, f.tarifa
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.invoice_id,
           'numero', x.numero,
           'emision', x.emision,
           'dia', to_char(x.emision at time zone v_tz, 'YYYY-MM-DD'),
           'valor', x.valor
         ) order by x.emision, x.numero), '[]'::jsonb)
    into v_facturas
    from (
      select f.invoice_id, f.numero, f.emision, sum(f.valor) as valor
        from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, v_branch, p_supplier_id, p_filtros) f
       group by f.invoice_id, f.numero, f.emision
    ) x;

  select jsonb_build_object(
           'retenido', coalesce(sum(f.valor), 0),
           'retefuente', coalesce(sum(f.valor) filter (where f.clase = 'retefuente'), 0),
           'reteiva', coalesce(sum(f.valor) filter (where f.clase = 'reteiva'), 0),
           'reteica', coalesce(sum(f.valor) filter (where f.clase = 'reteica'), 0)
         )
    into v_totales
    from public.fn_retenciones_practicadas_filas(p_organization_id, v_desde, v_hasta, v_branch, p_supplier_id, p_filtros) f;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'conceptos', v_conceptos,
    'facturas', v_facturas,
    'totales', case when v_estricto then v_totales || jsonb_build_object('_filtros_contables', jsonb_strip_nulls(jsonb_build_object('contabilizados', true, 'branch_id', v_branch, 'cost_center_id', v_centro, 'moneda_base', public.fn_moneda_base_organizacion(p_organization_id)))) else v_totales end
  ) || case when v_estricto then jsonb_build_object('incompleto', v_manuales > 0, 'avisos', v_avisos) else '{}'::jsonb end;
end;
$$;

create or replace function public.fn_certificado_retenciones_proveedor(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.fn_certificado_retenciones_proveedor(p_organization_id, p_supplier_id, p_desde, p_hasta, '{}'::jsonb);
$$;

create or replace function public.fn_certificado_retenciones_expedir(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer,
  p_filtros jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_hoy date;
  v_hasta date;
  v_datos jsonb;
  v_anio integer;
  v_consecutivo integer;
  v_numero text;
  v_existente record;
  v_id uuid;
begin
  if coalesce((p_filtros ->> 'contabilizados')::boolean, false) and nullif(p_filtros ->> 'branch_id', '')::integer is distinct from p_branch_id then
    raise exception 'SUCURSAL_INCOHERENTE' using errcode = '22023';
  end if;

  -- Misma guarda que la lectura del certificado (pertenencia + finance.view).
  if coalesce((p_filtros ->> 'contabilizados')::boolean, false) then
    if not public.fn_certificado_retenciones_acceso(p_organization_id, p_filtros) then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
    if upper(btrim(public.fn_moneda_base_organizacion(p_organization_id))) <> 'COP' then
      raise exception 'CERTIFICADO_REQUIERE_MONEDA_BASE_COLOMBIANA' using errcode = '22023';
    end if;
  else
    perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view']);
    if not public.fn_certificado_retenciones_acceso(p_organization_id, '{}'::jsonb) then raise exception 'SIN_ALCANCE_CONSOLIDADO' using errcode = '42501'; end if;
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SUCURSAL_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  v_tz := coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  -- El periodo nunca pasa de hoy en la zona de la organización.
  v_hasta := least(p_hasta, v_hoy);

  -- Valida proveedor de la organización y periodo, y arma la foto.
  v_datos := public.fn_certificado_retenciones_proveedor(p_organization_id, p_supplier_id, p_desde, v_hasta, p_filtros);

  if coalesce((p_filtros ->> 'contabilizados')::boolean, false) and coalesce((v_datos ->> 'incompleto')::boolean, false) then
    raise exception 'RETENCIONES_MANUALES_SIN_BASE' using errcode = '22023';
  end if;

  v_anio := extract(year from v_hasta)::integer;
  perform pg_advisory_xact_lock(hashtextextended('certificado_retenciones:' || p_organization_id || ':' || v_anio, 0));

  select c.id, c.number into v_existente
    from public.withholding_certificates c
   where c.organization_id = p_organization_id
     and c.supplier_id = p_supplier_id
     and c.period_from = p_desde
     and c.period_to = v_hasta
     and c.branch_id is not distinct from p_branch_id
     and c.status = 'issued'
     and coalesce(c.totals -> '_filtros_contables', '{}'::jsonb) = coalesce(v_datos -> 'totales' -> '_filtros_contables', '{}'::jsonb)
     and c.concepts = coalesce(v_datos -> 'conceptos', '[]'::jsonb)
     and c.invoices = coalesce(v_datos -> 'facturas', '[]'::jsonb)
   order by c.issued_at desc
   limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.number, 'reexpedido', true);
  end if;

  select coalesce(max(c.consecutive), 0) + 1 into v_consecutivo
    from public.withholding_certificates c
   where c.organization_id = p_organization_id and c.series = 'CR' and c.year = v_anio;

  v_numero := 'CR-' || v_anio || '-' || case when v_consecutivo < 10000 then lpad(v_consecutivo::text, 4, '0') else v_consecutivo::text end;

  insert into public.withholding_certificates (
    organization_id, branch_id, supplier_id, series, year, consecutive, number,
    period_from, period_to, invoice_count, total_withheld, totals, concepts, invoices,
    status, issued_by
  ) values (
    p_organization_id, p_branch_id, p_supplier_id, 'CR', v_anio, v_consecutivo, v_numero,
    p_desde, v_hasta,
    jsonb_array_length(coalesce(v_datos -> 'facturas', '[]'::jsonb)),
    coalesce((v_datos -> 'totales' ->> 'retenido')::numeric, 0),
    coalesce(v_datos -> 'totales', '{}'::jsonb),
    coalesce(v_datos -> 'conceptos', '[]'::jsonb),
    coalesce(v_datos -> 'facturas', '[]'::jsonb),
    'issued', auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'reexpedido', false);
end;
$$;

create or replace function public.fn_certificado_retenciones_expedir(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null
)
returns jsonb
language sql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.fn_certificado_retenciones_expedir(p_organization_id, p_supplier_id, p_desde, p_hasta, p_branch_id, '{}'::jsonb);
$$;

revoke all on function public.fn_retenciones_practicadas_filas(integer,timestamptz,timestamptz,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.fn_retenciones_practicadas_filas(integer,timestamptz,timestamptz,integer,integer,jsonb) to service_role;
revoke all on function public.fn_certificado_retenciones_proveedor(integer,integer,date,date,jsonb) from public,anon;
grant execute on function public.fn_certificado_retenciones_proveedor(integer,integer,date,date,jsonb) to authenticated,service_role;
revoke all on function public.fn_certificado_retenciones_expedir(integer,integer,date,date,integer,jsonb) from public,anon;
grant execute on function public.fn_certificado_retenciones_expedir(integer,integer,date,date,integer,jsonb) to authenticated,service_role;

revoke all on function public.fn_certificado_retenciones_acceso(integer,jsonb) from public,anon;
grant execute on function public.fn_certificado_retenciones_acceso(integer,jsonb) to authenticated,service_role;
alter policy withholding_certificates_select on public.withholding_certificates
  using (public.fn_certificado_retenciones_acceso(organization_id, coalesce(totals -> '_filtros_contables', '{}'::jsonb)));
