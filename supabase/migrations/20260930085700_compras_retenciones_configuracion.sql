-- Retenciones: configuración contable, base mínima en UVT y plantilla del país
-- (pantalla «config-retenciones» aprobada en Figma, D4 fase 3 del plan de compras).
--
-- 1. fiscal_uvt: la UVT de cada año por país. Catálogo global de solo lectura
--    (la escribe una migración cuando la DIAN publica la resolución del año).
-- 2. organization_taxes.min_base_uvt: base mínima de la retención en UVT. NULL
--    es «sin base mínima». No se siembran valores: las bases cambian por norma
--    y cada organización las fija según su régimen.
-- 3. fn_clase_retencion: la clase (retefuente / reteiva / reteica) sale de un
--    solo lugar. fn_cuenta_retencion_compra la usa para la cuenta por defecto
--    (2365 / 2367 / 2368) y la pantalla para la columna «Tipo».
-- 4. fn_cuenta_retencion_compra: el mapeo de la organización manda y ahora
--    también reconoce una retención propia sin plantilla por su nombre (el
--    formulario de la factura guarda ese nombre como concepto).
-- 5. fn_retenciones_configuracion / fn_retencion_configurar: leer y fijar la
--    cuenta contable y la base mínima de cada retención.
-- 6. fn_retenciones_cargar_plantilla: botón «Cargar plantilla de <país>», solo
--    las retenciones del país que falten (idempotente).
-- 7. tax_account_mapping: anon y authenticated tenían INSERT/UPDATE/DELETE y la
--    RLS dejaba escribir a cualquier miembro. Nadie escribe desde el cliente;
--    ahora solo se escribe por fn_retencion_configurar (con permiso).

-- 1 ── UVT ──────────────────────────────────────────────────────────────────────────
create table if not exists public.fiscal_uvt (
  country_code text not null,
  year integer not null check (year between 2000 and 2100),
  value numeric(14, 2) not null check (value > 0),
  norma text,
  created_at timestamptz not null default now(),
  primary key (country_code, year)
);

comment on table public.fiscal_uvt is
  'Unidad de Valor Tributario por país (ISO alfa-3, como organizations.country_code) y año. Catálogo global de solo lectura para las organizaciones.';
comment on column public.fiscal_uvt.norma is 'Resolución que fija el valor del año.';

alter table public.fiscal_uvt enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fiscal_uvt' and policyname = 'fiscal_uvt_lectura') then
    create policy fiscal_uvt_lectura on public.fiscal_uvt for select to authenticated using (true);
  end if;
end;
$$;

revoke all on table public.fiscal_uvt from public, anon, authenticated;
grant select on table public.fiscal_uvt to authenticated;

insert into public.fiscal_uvt (country_code, year, value, norma) values
  ('COL', 2024, 47065, 'Resolución DIAN 000187 de 2023'),
  ('COL', 2025, 49799, 'Resolución DIAN 000193 de 2024'),
  ('COL', 2026, 52374, 'Resolución DIAN 000238 de 2025')
on conflict (country_code, year) do nothing;

-- 2 ── Base mínima ──────────────────────────────────────────────────────────────────────────────
alter table public.organization_taxes add column if not exists min_base_uvt numeric(12, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_taxes_min_base_uvt_check') then
    alter table public.organization_taxes
      add constraint organization_taxes_min_base_uvt_check check (min_base_uvt is null or min_base_uvt >= 0);
  end if;
end;
$$;

comment on column public.organization_taxes.min_base_uvt is
  'Base mínima de la retención en UVT (solo kind = withholding). NULL: sin base mínima. Se compara con fiscal_uvt del año de la factura.';

-- 3 ── Clase de la retención ───────────────────────────────────────────────────────────────────
-- Primero el código y después el concepto; marcadores inequívocos antes que
-- palabras sueltas (así «ReteICA sobre base sin IVA» es ReteICA).
create or replace function public.fn_clase_retencion(p_tax_code text, p_concept text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_texto text;
begin
  foreach v_texto in array array[upper(coalesce(btrim(p_tax_code), '')), upper(coalesce(btrim(p_concept), ''))] loop
    continue when v_texto = '';
    if v_texto ~ 'RETE[ _-]?ICA|INDUSTRIA Y COMERCIO' then return 'reteica'; end if;
    if v_texto ~ 'RETE[ _-]?IVA|IMPUESTO A LAS VENTAS' then return 'reteiva'; end if;
    if v_texto ~ 'RETE[ _-]?FUENTE|EN LA FUENTE|(^|[^A-Z])RETE_[0-9]' then return 'retefuente'; end if;
    if v_texto ~ '(^|[^A-Z])ICA([^A-Z]|$)' then return 'reteica'; end if;
    if v_texto ~ '(^|[^A-Z])IVA([^A-Z]|$)' then return 'reteiva'; end if;
  end loop;
  return 'retefuente';
end;
$$;

revoke all on function public.fn_clase_retencion(text, text) from public, anon, authenticated;
grant execute on function public.fn_clase_retencion(text, text) to service_role;

-- 4 ── Cuenta de cada retención ────────────────────────────────────────────────────────────────────
create or replace function public.fn_cuenta_retencion_compra(p_organization_id integer, p_tax_code text, p_concept text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cuenta text;
  v_codigo text := upper(coalesce(btrim(p_tax_code), ''));
  v_concepto text := upper(coalesce(btrim(p_concept), ''));
begin
  if v_codigo <> '' or v_concepto <> '' then
    select m.account_code into v_cuenta
    from tax_account_mapping m
    left join tax_templates tt on tt.id = m.tax_template_id
    left join organization_taxes ot on ot.id = m.organization_tax_id and ot.organization_id = p_organization_id
    left join tax_templates tt2 on tt2.id = ot.template_id
    where m.organization_id = p_organization_id
      and m.is_active
      and ((v_codigo <> '' and v_codigo in (upper(tt.code), upper(tt2.code)))
           or (v_concepto <> '' and upper(btrim(ot.name)) = v_concepto))
      and exists (select 1 from chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = m.account_code)
    order by coalesce(v_concepto <> '' and upper(btrim(ot.name)) = v_concepto, false) desc,
             (m.organization_tax_id is not null) desc,
             m.created_at, m.id
    limit 1;

    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  return case public.fn_clase_retencion(p_tax_code, p_concept)
    when 'reteica' then '2368'
    when 'reteiva' then '2367'
    else '2365'
  end;
end;
$$;

revoke all on function public.fn_cuenta_retencion_compra(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_retencion_compra(integer, text, text) to service_role;

-- 5 ── Leer y fijar la configuración ───────────────────────────────────────────────────────────────
create or replace function public.fn_retenciones_configuracion(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pais text;
  v_pais_nombre text;
  v_anio integer;
  v_uvt jsonb;
  v_pendientes integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select coalesce(nullif(btrim(o.country_code), ''), 'COL') into v_pais
    from organizations o where o.id = p_organization_id;
  select c.name into v_pais_nombre from countries c where c.code = v_pais;

  v_anio := extract(year from now() at time zone coalesce(public.fn_timezone_for(p_organization_id, null), 'America/Bogota'))::integer;
  select jsonb_build_object('anio', u.year, 'valor', u.value, 'norma', u.norma) into v_uvt
    from fiscal_uvt u
   where u.country_code = v_pais and u.year <= v_anio
   order by u.year desc
   limit 1;

  select count(*) into v_pendientes
    from tax_templates tt
   where tt.country = v_pais and tt.kind = 'withholding'
     and (tt.valid_to is null or tt.valid_to > now())
     and not exists (select 1 from organization_taxes t
                      where t.organization_id = p_organization_id and t.template_id = tt.id);

  select coalesce(jsonb_agg(s.fila order by s.nombre, s.id), '[]'::jsonb) into v_filas
  from (
    select ot.id, ot.name as nombre,
           jsonb_build_object(
             'id', ot.id,
             'nombre', ot.name,
             'tarifa', ot.rate,
             'activo', ot.is_active,
             'descripcion', ot.description,
             'plantilla_id', ot.template_id,
             'codigo', tt.code,
             'clase', public.fn_clase_retencion(tt.code, ot.name),
             'base_minima_uvt', ot.min_base_uvt,
             'cuenta', r.cuenta,
             'cuenta_nombre', c.name,
             'cuenta_propia', exists (select 1 from tax_account_mapping m
                                       where m.organization_id = p_organization_id
                                         and m.organization_tax_id = ot.id and m.is_active)
           ) as fila
    from organization_taxes ot
    left join tax_templates tt on tt.id = ot.template_id
    cross join lateral (select public.fn_cuenta_retencion_compra(p_organization_id, tt.code, ot.name) as cuenta) r
    left join chart_of_accounts c on c.organization_id = p_organization_id and c.account_code = r.cuenta
    where ot.organization_id = p_organization_id and ot.kind = 'withholding'
  ) s;

  return jsonb_build_object(
    'pais', v_pais,
    'pais_nombre', v_pais_nombre,
    'uvt', v_uvt,
    'plantillas_pendientes', v_pendientes,
    'retenciones', v_filas
  );
end;
$$;

revoke all on function public.fn_retenciones_configuracion(integer) from public, anon;
grant execute on function public.fn_retenciones_configuracion(integer) to authenticated, service_role;

-- p_cuenta NULL o vacía: vuelve a la cuenta automática de su clase.
create or replace function public.fn_retencion_configurar(
  p_organization_id integer,
  p_id uuid,
  p_cuenta text,
  p_base_minima_uvt numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cuenta text := nullif(btrim(coalesce(p_cuenta, '')), '');
  v_ret record;
  v_tipo text;
  v_activa boolean;
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);

  select ot.id, ot.name, tt.code into v_ret
    from organization_taxes ot
    left join tax_templates tt on tt.id = ot.template_id
   where ot.id = p_id and ot.organization_id = p_organization_id and ot.kind = 'withholding';
  if v_ret.id is null then
    raise exception 'retencion_no_encontrada' using errcode = 'P0002';
  end if;

  if p_base_minima_uvt is not null and p_base_minima_uvt < 0 then
    raise exception 'base_minima_invalida' using errcode = '22023';
  end if;

  if v_cuenta is not null then
    select c.type, c.is_active into v_tipo, v_activa
      from chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_cuenta;
    if not found then
      raise exception 'cuenta_no_existe' using errcode = '22023';
    end if;
    if v_tipo is distinct from 'liability' then
      raise exception 'cuenta_no_es_pasivo' using errcode = '22023';
    end if;
    if not coalesce(v_activa, true) then
      raise exception 'cuenta_inactiva' using errcode = '22023';
    end if;

    insert into tax_account_mapping (organization_id, organization_tax_id, account_code, account_type, is_active)
    values (p_organization_id, p_id, v_cuenta, 'withholding_payable', true)
    on conflict (organization_id, organization_tax_id)
    do update set account_code = excluded.account_code,
                  account_type = excluded.account_type,
                  is_active = true,
                  updated_at = now();
  else
    update tax_account_mapping
       set is_active = false, updated_at = now()
     where organization_id = p_organization_id and organization_tax_id = p_id and is_active;
  end if;

  update organization_taxes
     set min_base_uvt = p_base_minima_uvt, updated_at = now()
   where id = p_id and organization_id = p_organization_id;

  return jsonb_build_object(
    'id', p_id,
    'cuenta', public.fn_cuenta_retencion_compra(p_organization_id, v_ret.code, v_ret.name),
    'base_minima_uvt', p_base_minima_uvt
  );
end;
$$;

revoke all on function public.fn_retencion_configurar(integer, uuid, text, numeric) from public, anon;
grant execute on function public.fn_retencion_configurar(integer, uuid, text, numeric) to authenticated, service_role;

-- 6 ── Plantilla del país ──────────────────────────────────────────────────────────────────────
-- Mismo criterio que initialize_organization_taxes, solo para retenciones:
-- no toca los impuestos ni recrea una retención que la organización ya tiene.
create or replace function public.fn_retenciones_cargar_plantilla(p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pais text;
  v_creadas integer;
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);

  select coalesce(nullif(btrim(o.country_code), ''), 'COL') into v_pais
    from organizations o where o.id = p_organization_id;
  if not found then
    raise exception 'organizacion_no_encontrada' using errcode = 'P0002';
  end if;

  insert into organization_taxes (organization_id, template_id, name, rate, description, is_default, is_active, kind)
  select p_organization_id, tt.id, tt.name, tt.rate, tt.description, false, true, 'withholding'
    from tax_templates tt
   where tt.country = v_pais and tt.kind = 'withholding'
     and (tt.valid_to is null or tt.valid_to > now())
     and not exists (select 1 from organization_taxes t
                      where t.organization_id = p_organization_id and t.template_id = tt.id);
  get diagnostics v_creadas = row_count;

  perform public.fn_asegurar_cuentas_retencion(p_organization_id);

  return jsonb_build_object('pais', v_pais, 'creadas', v_creadas);
end;
$$;

revoke all on function public.fn_retenciones_cargar_plantilla(integer) from public, anon;
grant execute on function public.fn_retenciones_cargar_plantilla(integer) to authenticated, service_role;

-- 7 ── tax_account_mapping: solo lectura para la sesión ───────────────────────────────────────────────────────
revoke insert, update, delete, truncate, references, trigger on table public.tax_account_mapping from anon, authenticated;
revoke select on table public.tax_account_mapping from anon;
