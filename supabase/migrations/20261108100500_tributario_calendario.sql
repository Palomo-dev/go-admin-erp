-- Finanzas ronda 4 · Frente R4-A · Calendario tributario nacional (Centro tributario, Figma 2335:136794).
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md).
--
-- Los vencimientos de la DIAN salen del decreto de cada año y dependen del último (o de los dos
-- últimos) dígitos del NIT. GO Admin NO los adivina: esta tabla guarda el calendario oficial tal como
-- lo carga la plataforma (consola go-admin-super, otra ronda) con la norma de la que sale. Mientras un
-- año no esté cargado, el Centro tributario dice «Calendario {año} sin cargar» en cada obligación.
-- El ICA es municipal y no va aquí: la pantalla lo marca «confirmar con el municipio».
--
-- Es un dato de referencia de la plataforma, no de una organización: no lleva organization_id.
-- Lectura para cualquier usuario con sesión; escritura solo con service_role. Sin acceso de anon.
-- Aditiva: tabla nueva, sin datos (se carga aparte, con la norma de cada año).

create table if not exists public.tax_calendar_dates (
  id bigint generated always as identity primary key,
  country_code text not null default 'CO',
  anio integer not null check (anio between 2000 and 2100),
  -- Obligación: iva_bimestral · iva_cuatrimestral · iva_anual · retencion_fuente · inc_bimestral ·
  -- renta_gran_contribuyente · renta_persona_juridica · renta_persona_natural · simple_anticipo ·
  -- simple_anual · exogena · conciliacion_fiscal.
  obligacion text not null check (obligacion ~ '^[a-z][a-z0-9_]{2,40}$'),
  -- Periodo dentro del año: 1..6 bimestres, 1..3 cuatrimestres, 1..12 meses, 1 anual.
  periodo smallint not null check (periodo between 1 and 12),
  -- Cuota (renta de grandes contribuyentes y personas jurídicas se paga en varias).
  cuota smallint not null default 1 check (cuota between 1 and 5),
  -- Dígitos del NIT (sin dígito de verificación) a los que aplica la fecha: los `cantidad_digitos`
  -- últimos, entre `digitos_desde` y `digitos_hasta` (p. ej. 1 dígito «7»-«7», o 2 dígitos «01»-«05»).
  cantidad_digitos smallint not null default 1 check (cantidad_digitos in (1, 2)),
  digitos_desde smallint not null check (digitos_desde between 0 and 99),
  digitos_hasta smallint not null check (digitos_hasta between 0 and 99),
  fecha_vencimiento date not null,
  norma text not null check (length(btrim(norma)) > 0),
  created_at timestamptz not null default now(),
  constraint tax_calendar_dates_digitos check (digitos_hasta >= digitos_desde),
  constraint tax_calendar_dates_unico unique (country_code, anio, obligacion, periodo, cuota, cantidad_digitos, digitos_desde)
);

comment on table public.tax_calendar_dates is
  'Calendario tributario oficial por año, obligación, periodo y dígitos del NIT. Lo carga la plataforma con su norma; nunca se infiere.';

create index if not exists idx_tax_calendar_dates_busqueda on public.tax_calendar_dates (country_code, anio, obligacion, periodo);

alter table public.tax_calendar_dates enable row level security;

drop policy if exists tax_calendar_dates_select on public.tax_calendar_dates;
create policy tax_calendar_dates_select
  on public.tax_calendar_dates
  for select
  to authenticated
  using (true);

revoke all on public.tax_calendar_dates from anon;
revoke insert, update, delete, truncate, references, trigger on public.tax_calendar_dates from authenticated;
grant select on public.tax_calendar_dates to authenticated;
