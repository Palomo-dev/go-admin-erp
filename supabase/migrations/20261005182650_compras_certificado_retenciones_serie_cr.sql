-- Certificado de retenciones expedido: serie CR por organización (Figma 09
-- Documentos, «Certificado de retenciones (Nuevo · propuesta)», 1491:126182).
--
-- Hasta ahora el certificado se armaba al vuelo con un número determinista
-- (CR-<año>-<id del proveedor>). La propuesta lo vuelve un documento expedido:
-- número CR-<año>-<consecutivo de 4 cifras> por organización y año, estado
-- «Expedido» y una foto de lo certificado, para que reimprimirlo dé siempre
-- lo mismo aunque después se confirmen más facturas del periodo.
--
-- withholding_certificates: tabla nueva (aditiva). Se escribe SOLO por
-- fn_certificado_retenciones_expedir (SECURITY DEFINER). La sesión lee con
-- RLS por pertenencia activa a la organización. Sin políticas de escritura.
--
-- fn_certificado_retenciones_expedir: no recalcula nada. La foto sale de
-- fn_certificado_retenciones_proveedor (mismas filas que el reporte de
-- retenciones practicadas, misma guarda finance.view, la cuenta del asiento
-- de cada factura). Si ya hay un certificado expedido del mismo proveedor,
-- periodo y sucursal con exactamente los mismos conceptos y facturas, lo
-- devuelve (reexpedir no gasta número). El consecutivo se toma con un
-- candado de transacción por organización y año, y la unicidad la garantiza
-- además uq_withholding_certificates_org_serie.
--
-- La sucursal es solo la tarjeta del documento y la ciudad de la retención:
-- el agente retenedor es la organización y el certificado cubre todas las
-- sucursales. Si llega, debe ser de la organización.

create table if not exists public.withholding_certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer null references public.branches(id) on delete set null,
  supplier_id integer not null references public.suppliers(id) on delete restrict,
  series text not null default 'CR',
  year integer not null,
  consecutive integer not null,
  number text not null,
  period_from date not null,
  period_to date not null,
  invoice_count integer not null default 0,
  total_withheld numeric not null default 0,
  totals jsonb not null default '{}'::jsonb,
  concepts jsonb not null default '[]'::jsonb,
  invoices jsonb not null default '[]'::jsonb,
  status text not null default 'issued',
  issued_by uuid null default auth.uid(),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint withholding_certificates_status_chk check (status in ('issued', 'void')),
  constraint withholding_certificates_periodo_chk check (period_from <= period_to),
  constraint withholding_certificates_consecutivo_chk check (consecutive > 0)
);

comment on table public.withholding_certificates is
  'Certificados de retenciones expedidos a proveedores (art. 381 E.T.). Serie CR por organización y año. Solo los escribe fn_certificado_retenciones_expedir.';

create unique index if not exists uq_withholding_certificates_org_serie
  on public.withholding_certificates (organization_id, series, year, consecutive);
create unique index if not exists uq_withholding_certificates_org_numero
  on public.withholding_certificates (organization_id, number);
create index if not exists idx_withholding_certificates_proveedor
  on public.withholding_certificates (organization_id, supplier_id, issued_at desc);

alter table public.withholding_certificates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'withholding_certificates'
       and policyname = 'withholding_certificates_select'
  ) then
    create policy withholding_certificates_select on public.withholding_certificates
      for select to authenticated
      using (organization_id in (
        select om.organization_id from public.organization_members om
         where om.user_id = (select auth.uid()) and om.is_active
      ));
  end if;
end;
$$;

revoke all on table public.withholding_certificates from anon, authenticated, public;
grant select on table public.withholding_certificates to authenticated;
grant all on table public.withholding_certificates to service_role;

create or replace function public.fn_certificado_retenciones_expedir(
  p_organization_id integer,
  p_supplier_id integer,
  p_desde date,
  p_hasta date,
  p_branch_id integer default null
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
  -- Misma guarda que la lectura del certificado (pertenencia + finance.view).
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view']);

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
  v_datos := public.fn_certificado_retenciones_proveedor(p_organization_id, p_supplier_id, p_desde, v_hasta);

  select c.id, c.number into v_existente
    from public.withholding_certificates c
   where c.organization_id = p_organization_id
     and c.supplier_id = p_supplier_id
     and c.period_from = p_desde
     and c.period_to = v_hasta
     and c.branch_id is not distinct from p_branch_id
     and c.status = 'issued'
     and c.concepts = coalesce(v_datos -> 'conceptos', '[]'::jsonb)
     and c.invoices = coalesce(v_datos -> 'facturas', '[]'::jsonb)
   order by c.issued_at desc
   limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.number, 'reexpedido', true);
  end if;

  v_anio := extract(year from v_hasta)::integer;
  perform pg_advisory_xact_lock(hashtextextended('certificado_retenciones:' || p_organization_id || ':' || v_anio, 0));

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

revoke all on function public.fn_certificado_retenciones_expedir(integer, integer, date, date, integer) from public, anon;
grant execute on function public.fn_certificado_retenciones_expedir(integer, integer, date, date, integer) to authenticated, service_role;
