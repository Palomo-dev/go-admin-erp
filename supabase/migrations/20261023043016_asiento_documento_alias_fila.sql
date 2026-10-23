-- El asiento por líneas declaraba `r record` y a la vez usaba `r` como alias
-- de la regla (`fn_regla_devengo_compra(v_org) r` y las otras dos lecturas).
-- Postgres toma el alias como la variable, que todavía no está asignada, y
-- aborta con «record r is not assigned yet» antes del ciclo. Se renombra la
-- variable a v_fila. Los alias y el resto de la función quedan igual.
--
-- Revocar de nuevo: create or replace conserva los privilegios, y esta firma
-- no es security definer. La vista previa sí lo es y la llama como dueña.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

create or replace function public.fn_armar_asiento_documento(
  p_tipo text,
  p_id uuid,
  p_lineas jsonb default null
) returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_org integer;
  v_branch integer;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_neto numeric := 0;
  v_fecha timestamptz;
  v_memo text;
  v_source text;
  v_created_by uuid;
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_rol text;
  v_impuesto_al_credito boolean;
  v_lineas jsonb := '[]'::jsonb;
  v_pesos numeric := 0;
  v_asignado numeric := 0;
  v_parte numeric;
  v_cuenta text;
  v_fallo text;
  v_exige record;
  v_i integer := 0;
  v_n integer := 0;
  v_base numeric := 0;
  v_reparto jsonb := '[]'::jsonb;
  v_suma_debe numeric := 0;
  v_suma_haber numeric := 0;
  v_fila record;
begin
  if p_tipo = 'compra' then
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           'Compra ' || coalesce(i.number_ext, i.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_purchase i where i.id = p_id;
    v_source := 'invoice_purchase';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'documento_soporte' then
    select d.organization_id, d.branch_id, abs(coalesce(d.total, 0)), abs(coalesce(d.tax_total, 0)),
           coalesce(d.issue_date, now()), d.created_by,
           'Documento soporte ' || coalesce(d.number, d.reference_code, d.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.support_documents d where d.id = p_id;
    v_source := 'support_documents';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'nota_credito' and p_lineas is not null then
    select coalesce(sum(abs(coalesce((l->>'total_line')::numeric, 0))), 0)
      into v_total
      from jsonb_array_elements(p_lineas) l;
    select i.organization_id, i.branch_id, coalesce(i.issue_date, now()), i.created_by,
           abs(coalesce(i.tax_total, 0)), abs(coalesce(i.total, 0))
      into v_org, v_branch, v_fecha, v_created_by, v_tax, v_base
      from public.invoice_sales i where i.id = p_id;
    if v_base > 0 then
      v_tax := least(v_total, round(v_tax * v_total / v_base, 2));
    else
      v_tax := 0;
    end if;
    v_memo := 'Nota crédito';
    v_source := 'invoice_sales';
    v_impuesto_al_credito := false;
  else
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           case
             when i.document_type = 'credit_note' then 'Nota crédito ' || coalesce(i.number, i.id::text)
             when i.document_type = 'debit_note' then 'Nota débito ' || coalesce(i.number, i.id::text)
             else 'Venta ' || coalesce(i.number, i.id::text)
           end
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_sales i where i.id = p_id;
    v_source := 'invoice_sales';
    v_impuesto_al_credito := p_tipo is distinct from 'nota_credito';
  end if;

  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;

  if p_tipo in ('compra', 'documento_soporte') then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(v_org) r;
  elsif p_tipo = 'nota_credito' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = v_org
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(v_org) r;
  end if;

  if v_debito is null then
    return jsonb_build_object('ok', false, 'fallo', 'No hay regla contable activa para este documento', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      v_org, v_branch,
      case when p_tipo = 'nota_credito' then 'sale_credit_note' else v_source end,
      v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_cfg.fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  if not coalesce(v_usa_impuesto, false) then
    v_tax := 0;
  end if;
  v_total := round(coalesce(v_total, 0), 2);
  v_tax := round(coalesce(v_tax, 0), 2);
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := round(v_total - v_tax, 2);

  select t.nit, t.nombre into v_nit, v_nombre
    from public.fn_tercero_de_documento(
      case when p_tipo = 'nota_debito' then 'venta' else p_tipo end,
      p_id
    ) t;

  if p_lineas is not null and p_tipo = 'nota_credito' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over () as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(v_org, nullif(l->>'product_id', '')::integer, 'devolucion', l->>'cuenta_contable'),
                 v_cfg.debito
               ) as cuenta,
               abs(coalesce((l->>'total_line')::numeric, 0)) as monto,
               coalesce(nullif(btrim(l->>'descripcion'), ''), 'Nota crédito') as descripcion
          from jsonb_array_elements(p_lineas) l
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(
                   v_org,
                   ii.product_id,
                   case
                     when p_tipo in ('compra', 'documento_soporte') and coalesce(pr.track_stock, false) then 'inventario'
                     when p_tipo in ('compra', 'documento_soporte') then 'costo'
                     when p_tipo = 'nota_credito' then 'devolucion'
                     else 'ingreso'
                   end,
                   ii.cuenta_contable
                 ),
                 case when v_impuesto_al_credito then v_cfg.credito else v_cfg.debito end
               ) as cuenta,
               abs(coalesce(ii.total_line, 0)) as monto,
               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii
          left join public.products pr on pr.id = ii.product_id and pr.organization_id = v_org
         where case p_tipo
                 when 'compra' then ii.invoice_purchase_id = p_id
                 when 'documento_soporte' then ii.support_document_id = p_id
                 else ii.invoice_sales_id = p_id
               end
      ) s;
  end if;

  select coalesce(sum((e->>'monto')::numeric), 0), count(*)
    into v_pesos, v_n
    from jsonb_array_elements(v_reparto) e;
  v_asignado := 0;

  for v_fila in
    select (e->>'cuenta') as cuenta,
           (e->>'monto')::numeric as monto,
           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e
     order by (e->>'orden')::integer
  loop
    v_i := v_i + 1;
    if v_pesos = 0 then
      v_parte := case when v_i = 1 then v_neto else 0 end;
    elsif v_i = v_n then
      v_parte := round(v_neto - v_asignado, 2);
    else
      v_parte := round(v_neto * v_fila.monto / v_pesos, 2);
      v_asignado := v_asignado + v_parte;
    end if;
    if v_parte = 0 then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_fila.cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_fila.cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_fila.cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    if coalesce(v_exige.requiere_centro_costo, false) then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_fila.cuenta || ' exige un centro de costo', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_fila.cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end loop;

  if v_tax > 0 and v_cfg.impuesto is not null then
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cfg.impuesto);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cfg.impuesto);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cfg.impuesto || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cfg.impuesto,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_tax end,
      'credito', case when v_impuesto_al_credito then v_tax else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;

  v_cuenta := case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end;
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
  if v_fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;
  select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
  if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
    return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
    'cuenta', v_cuenta,
    'descripcion', v_memo,
    'debito', case when v_impuesto_al_credito then v_total else 0 end,
    'credito', case when v_impuesto_al_credito then 0 else v_total end,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre
  ));

  select coalesce(sum((l->>'debito')::numeric), 0), coalesce(sum((l->>'credito')::numeric), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(v_lineas) l;
  if round(v_suma_debe, 2) <> round(v_suma_haber, 2) or v_suma_debe = 0 then
    return jsonb_build_object(
      'ok', false,
      'fallo', 'El asiento no cuadra con las líneas del documento',
      'lineas', '[]'::jsonb,
      'organization_id', v_org
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'fallo', null,
    'organization_id', v_org,
    'branch_id', v_branch,
    'fecha', v_fecha,
    'memo', v_memo,
    'source', v_source,
    'source_id', p_id,
    'created_by', v_created_by,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre,
    'lineas', v_lineas,
    'debitos', v_total,
    'creditos', v_total,
    'cuadra', true
  );
end;
$fn$;

revoke all on function public.fn_armar_asiento_documento(text, uuid, jsonb) from public, anon, authenticated;

-- Una sola firma pública. La de tres argumentos no recibía lotes y la de
-- cuatro no tenía valores por defecto, así que una llamada resolvía una u
-- otra. Con p_lotes en null por defecto, las dos caen aquí y en la interna
-- de cinco argumentos. Los permisos y la organización siguen saliendo de la
-- sesión, no del cuerpo.
create or replace function public.fn_factura_compra_confirmar(
  p_id uuid,
  p_recepcionar boolean default true,
  p_generar_ds boolean default false,
  p_lotes jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select organization_id into v_org from public.invoice_purchase where id = p_id;
  if v_org is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if p_recepcionar then
    perform public.fn_finanzas_exigir_permiso(v_org, array['inventory.create']);
  end if;
  return public.fn_fc_confirmar_int(
    p_id,
    coalesce(p_recepcionar, true),
    coalesce(p_generar_ds, false),
    auth.uid(),
    p_lotes
  );
end;
$function$;

drop function if exists public.fn_factura_compra_confirmar(uuid, boolean, boolean);

revoke all on function public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb) from public, anon;
grant execute on function public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb) to authenticated;


-- La organización 140 ya tenía filas de configuración con las cuentas de la
-- propuesta de sector (2205, 2408, 4135). Esas cuentas exigen tercero y sus
-- documentos no traen NIT, así que el asiento nuevo se registraba como fallo
-- y no se publicaba. Sus reglas activas y los asientos ya publicados usan
-- 2105, 2405 y 4105, que no exigen tercero. Se dejan esas cuentas: el código
-- que resuelve la regla no cambia. El inventario se queda en 1435 porque
-- 1405 es cuenta de título. El resto de organizaciones no se toca.
update public.configuracion_contable
   set account_code = '2105'
 where organization_id = 140
   and branch_id is null
   and clave = 'proveedores'
   and account_code = '2205';

update public.configuracion_contable
   set account_code = '2405'
 where organization_id = 140
   and branch_id is null
   and clave = 'iva_descontable'
   and account_code = '2408';

update public.configuracion_contable
   set account_code = '2405'
 where organization_id = 140
   and branch_id is null
   and clave = 'iva_generado'
   and account_code = '2408';

update public.configuracion_contable
   set account_code = '4105'
 where organization_id = 140
   and branch_id is null
   and clave = 'ventas_productos'
   and account_code = '4135';


-- Quien no tiene ninguna fila recibe la cuenta de sus reglas activas, y solo
-- cuando todas las reglas que caen en la misma clave coinciden y la cuenta es
-- de movimiento. Sin fila, el asiento ya usaba ese código: sembrarlo no lo
-- cambia. Quien ya tiene filas no se toca.
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
select u.organization_id, null, u.clave, u.account_code
from (
  select d.organization_id, d.clave, min(d.account_code) as account_code
  from (
    select r.organization_id,
           public.fn_clave_cuenta_configurable(r.source_type, cuenta.lado, cuenta.codigo) as clave,
           cuenta.codigo as account_code
    from public.organizations o
    join public.accounting_rules r on r.organization_id = o.id and r.is_active
    cross join lateral (
      values ('debito', r.debit_account_code),
             ('credito', r.credit_account_code),
             ('impuesto', r.tax_account_code)
    ) as cuenta(lado, codigo)
    where not exists (
      select 1 from public.configuracion_contable c where c.organization_id = o.id
    )
      and nullif(btrim(cuenta.codigo), '') is not null
  ) d
  where d.clave is not null
  group by d.organization_id, d.clave
  having count(distinct d.account_code) = 1
) u
join public.chart_of_accounts a
  on a.organization_id = u.organization_id
 and a.account_code = u.account_code
 and a.es_movimiento is distinct from false
 and public.fn_es_cuenta_de_titulo(u.organization_id, u.account_code) is not true
on conflict on constraint configuracion_contable_unica do nothing;
