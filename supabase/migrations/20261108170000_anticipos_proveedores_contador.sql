-- Anticipos a proveedores · correcciones del Contador: P1, P6 y P7 (RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md), la
-- ronda 2 (RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md, «Anticipos») y la ronda 3 (RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md,
-- «Respuestas sobre anticipos»: AIU desactivado sin regla con fundamento, devoluciones por procedimiento y causa,
-- verificación del SIMPLE y del autorretenedor).
--
-- ESTADO: 20261108120000_anticipos_proveedores está APLICADA; esta (20261108170000) está SIN APLICAR. Se aplica por
-- el MCP (apply_migration) cuando el dueño lo ordene, en este orden: 20261108120500 → 20261108121000 (consignación:
-- crea consignment_advance_crossings, que esta lee) → 20261108140500 → 20261108160000 → 20261108160500 (perfil con renta
-- e IVA separados) → 20261108165000 (tarifa exacta) → esta. Si 121000 no está aplicada, esta funciona igual (los cruces
-- con consignación no suman nada); el orden por número de versión ya deja 121000 antes.
-- Reversión: supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql
-- Explicación para el Contador: docs/contador/ANTICIPOS-CORRECCIONES-P1-P6-P7.md
-- Pruebas en seco (begin … rollback, org 374): docs/contador/pruebas/11_anticipos_correcciones_contador.sql
--
-- La 120000 no se edita: aquí se reemplazan sus funciones y se añaden columnas y tablas. Hoy hay 0 anticipos y 0
-- aplicaciones en la base: ningún saldo existente cambia.
--
-- Qué hace (ronda 1 + ronda 2):
--   Cuenta      Solo la cuenta configurada con la clave «anticipos_proveedores»: auxiliar de detalle de OCHO dígitos
--               bajo 133005 (13300501…), o una cuenta de detalle con equivalencia APROBADA y nota. 1330 nunca. Sin ella
--               no se registra (pendiente contable visible). No se crean cuentas.
--   Naturaleza  Obligatoria. Financiación: la retención se evalúa cuando el anticipo se convierte en pago o abono del
--               precio (al amortizarlo con la factura: queda «diferida», no «no aplica»). Pago anticipado: se evalúa al
--               girar, con la composición de la operación (componentes por tarifa; dividir entre 1+tarifa solo para
--               una suma homogénea a la tarifa general).
--   Partes      Calidades del proveedor VERIFICADAS (supplier_tax_qualities): SIMPLE acreditado, autorretenedor con su
--               autorización y los conceptos cubiertos, responsable o no de IVA, gran contribuyente, no sujeto de ICA.
--               Un código del RUT sin verificación deja la clase «pendiente», no la excluye.
--   ReteICA     Regla municipal registrada (municipio, actividad, tarifa por mil con precisión, norma, vigencia) +
--               territorialidad declarada + calidades + base. Si falta algo: «pendiente».
--   Duplicado   Se evita AL RECONOCER la factura: el anticipo se vincula a la factura en borrador y la causación se
--               bloquea si la factura retiene sobre la base ya retenida en el anticipo. Si ya ocurrió (sin vínculo), la
--               aplicación se rechaza salvo corrección documentada (motivo y soporte), que deja ajustes trazables y un
--               pendiente para revisar los periodos de retención afectados.
--   Devolución  Se identifica la parte devuelta y, por impuesto, la retención relacionada y su procedimiento; nada se
--               prorratea automáticamente. Lo no determinado queda en el anticipo y como pendiente.
--   Anulación   Solo si el desembolso NO ocurrió (motivo, soporte, fecha del ajuste en periodo abierto). Con la caja ya
--               cerrada no se reabre ni se toca su arqueo: ajuste contable en periodo abierto y pendiente de revisión.
--   Pendientes  anticipo_pendientes: estado abierto/resuelto; solo se cierra con resolución y soporte (finance.approve).
--   Certificado fn_retenciones_practicadas_filas (base del certificado y del reporte) incluye las retenciones de
--               anticipos y sus ajustes (devolución, anulación, corrección), por impuesto, tercero y concepto.
--   Arqueo      pos_caja__esperado_calculo separa «egreso por anticipo» y «devolución de anticipo» de las ventas.
--   Consignación Los cruces de un anticipo con la obligación de un mandato (consignment_advance_crossings de
--               20261108121000, si está aplicada) cuentan como consumo del anticipo en la conciliación y salen en
--               el estado del proveedor como «Cruce con consignación». Sin esa tabla, no se suma nada.
--               Las líneas del asiento del cruce y del reintegro de retención llevan el NIT del proveedor (disparador
--               de tercero), así el auxiliar por NIT concilia con los libros.
--
-- Escritura SOLO por las RPC (SECURITY DEFINER, guarda de organización, sucursal y permiso); lectura por RLS de
-- pertenencia; nada para anon. Aditiva: columnas NULL-ables o con DEFAULT, tablas nuevas, funciones nuevas o
-- reemplazadas (la reversión deja las de antes).

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Columnas y tablas
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.supplier_advances
  add column if not exists naturaleza text,
  add column if not exists tarifa_iva numeric(5,2),
  add column if not exists componentes jsonb,
  add column if not exists base_retencion numeric(16,2),
  add column if not exists retencion_total numeric(16,2) not null default 0,
  add column if not exists monto_girado numeric(16,2),
  add column if not exists retencion_pendiente boolean not null default false,
  add column if not exists retenciones_evaluacion jsonb,
  add column if not exists anulacion_tipo text,
  add column if not exists anulacion_soporte text,
  add column if not exists anulacion_fecha date,
  add column if not exists anulacion_caja_cerrada boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_advances_naturaleza_check') then
    alter table public.supplier_advances add constraint supplier_advances_naturaleza_check
      check (naturaleza is null or naturaleza in ('financiacion', 'pago_anticipado_precio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_advances_anulacion_tipo_check') then
    alter table public.supplier_advances add constraint supplier_advances_anulacion_tipo_check
      check (anulacion_tipo is null or anulacion_tipo = 'desembolso_no_ocurrio');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_advances_retencion_check') then
    alter table public.supplier_advances add constraint supplier_advances_retencion_check
      check (retencion_total >= 0 and retencion_total < amount);
  end if;
end $$;

comment on column public.supplier_advances.naturaleza is
  'financiacion (anticipo genuino: la retención se evalúa al convertirse en pago o abono del precio) o pago_anticipado_precio (se evalúa al girar). Obligatoria desde 20261108170000.';
comment on column public.supplier_advances.amount is
  'Valor bruto del anticipo: lo que queda a favor frente al proveedor (girado + retenciones practicadas).';
comment on column public.supplier_advances.componentes is
  'Composición de la operación usada para las bases: [{descripcion, tratamiento, base, tarifa_iva, iva}].';

alter table public.supplier_advance_applications
  add column if not exists consumo_anticipo numeric(16,2),
  add column if not exists retencion_descontada numeric(16,2) not null default 0,
  add column if not exists retencion_detalle jsonb,
  add column if not exists correccion_motivo text,
  add column if not exists correccion_soporte text,
  add column if not exists cuenta_por_pagar text,
  add column if not exists asiento_causacion integer,
  add column if not exists asiento_id integer;

comment on column public.supplier_advance_applications.amount is
  'Lo que baja la cuenta por pagar (regla única de saldo de compras). Igual al consumo salvo corrección documentada de retención duplicada.';
comment on column public.supplier_advance_applications.retencion_descontada is
  'Solo con corrección documentada (correccion_motivo/soporte): retención que la factura repitió sobre la base del anticipo.';

create table if not exists public.supplier_advance_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  clase text not null check (clase in ('retefuente', 'reteiva', 'reteica')),
  organization_tax_id uuid references public.organization_taxes(id),
  regla_ica_id uuid,
  concepto text not null,
  tax_code text,
  norma text,
  base numeric(16,2) not null check (base >= 0),
  tarifa numeric(9,4) not null check (tarifa >= 0),
  valor numeric(16,2) not null check (valor > 0),
  cuenta text not null,
  revertido numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint supplier_advance_withholdings_revertido check (revertido >= 0 and revertido <= valor),
  constraint supplier_advance_withholdings_clase_unica unique (advance_id, clase)
);
comment on table public.supplier_advance_withholdings is
  'Retención practicada al girar un anticipo (base y valor por impuesto). Escritura solo por fn_anticipo_proveedor_*.';
create index if not exists idx_supplier_advance_withholdings_advance on public.supplier_advance_withholdings (advance_id);

create table if not exists public.supplier_advance_withholding_ajustes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  withholding_id uuid references public.supplier_advance_withholdings(id),
  invoice_id uuid references public.invoice_purchase(id),
  tipo text not null check (tipo in ('devolucion', 'anulacion_error', 'duplicado_factura', 'retencion_excesiva')),
  clase text not null check (clase in ('retefuente', 'reteiva', 'reteica')),
  concepto text not null,
  tax_code text,
  cuenta text not null,
  tarifa numeric(9,4),
  base numeric(16,2) not null,
  valor numeric(16,2) not null check (valor <> 0),
  procedimiento text,
  soporte text,
  causa text check (causa is null or causa in ('operacion_anulada', 'retencion_excesiva', 'devolucion_parcial')),
  periodo_descuento text check (periodo_descuento is null or periodo_descuento ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  requiere_correccion boolean,
  soportes jsonb,
  fecha timestamptz not null default now(),
  asiento_id integer,
  created_by uuid,
  created_at timestamptz not null default now()
);
comment on table public.supplier_advance_withholding_ajustes is
  'Ajustes de retenciones de anticipos (valor con signo): devolución identificada, anulación por error y corrección de retención duplicada en la factura. Entran al certificado en su fecha.';
create index if not exists idx_supplier_advance_withholding_ajustes_advance on public.supplier_advance_withholding_ajustes (advance_id);

create table if not exists public.supplier_advance_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  payment_id uuid not null references public.payments(id),
  monto numeric(16,2) not null check (monto > 0),
  dinero numeric(16,2) not null check (dinero > 0),
  retencion_revertida numeric(16,2) not null default 0 check (retencion_revertida >= 0),
  retencion_detalle jsonb,
  retenciones_determinadas boolean not null default true,
  procedimiento jsonb,
  soporte text not null,
  motivo text not null,
  asiento_id integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint supplier_advance_refunds_cuadre check (monto = dinero + retencion_revertida),
  constraint supplier_advance_refunds_pago unique (payment_id)
);
comment on table public.supplier_advance_refunds is
  'Devolución real (dinero que regresa con soporte). monto = lo que baja el anticipo = dinero + retenciones identificadas y revertidas.';
create index if not exists idx_supplier_advance_refunds_advance on public.supplier_advance_refunds (advance_id);

create table if not exists public.supplier_advance_invoice_links (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  invoice_id uuid not null references public.invoice_purchase(id),
  monto numeric(16,2) not null check (monto > 0),
  retencion jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint supplier_advance_invoice_links_unico unique (advance_id, invoice_id)
);
comment on table public.supplier_advance_invoice_links is
  'Anticipo vinculado a una factura de compra en borrador: al causarla, la factura no puede retener sobre la base ya retenida en el anticipo (retencion = base y valor por impuesto).';
create index if not exists idx_supplier_advance_invoice_links_invoice on public.supplier_advance_invoice_links (invoice_id);

create table if not exists public.supplier_tax_qualities (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  supplier_id integer not null references public.suppliers(id),
  calidad text not null check (calidad in ('simple_acreditado', 'autorretenedor_renta', 'autorretencion_especial', 'responsable_iva', 'no_responsable_iva',
                                            'gran_contribuyente', 'no_sujeto_ica')),
  soporte text not null check (length(btrim(soporte)) >= 3),
  conceptos text[] not null default '{}'::text[],
  vigente_desde date not null,
  vigente_hasta date,
  rut_fecha date,
  rut_archivo text,
  resolucion_numero text,
  resolucion_fecha date,
  alcance text,
  verificado_por uuid,
  verificado_en timestamptz not null default now(),
  constraint supplier_tax_qualities_unica unique (organization_id, supplier_id, calidad, vigente_desde),
  constraint supplier_tax_qualities_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint supplier_tax_qualities_autorretenedor check (calidad <> 'autorretenedor_renta' or cardinality(conceptos) > 0),
  -- Ronda 3: SIMPLE con el RUT actualizado (fecha y archivo); autorretenedor con RUT y resolución (número, fecha, alcance).
  constraint supplier_tax_qualities_rut check (calidad not in ('simple_acreditado', 'autorretenedor_renta')
                                               or (rut_fecha is not null and length(btrim(coalesce(rut_archivo, ''))) >= 3)),
  constraint supplier_tax_qualities_resolucion check (calidad <> 'autorretenedor_renta'
                                               or (length(btrim(coalesce(resolucion_numero, ''))) >= 1 and resolucion_fecha is not null
                                                   and length(btrim(coalesce(alcance, ''))) >= 3))
);
comment on table public.supplier_tax_qualities is
  'Calidades tributarias del proveedor VERIFICADAS con soporte y vigencia (no una marca genérica). simple_acreditado: RUT actualizado (fecha, archivo) e inscripción vigente (vigente_desde/hasta) en la fecha de la operación. autorretenedor_renta: RUT + resolución de autorización (número, fecha, alcance) y conceptos cubiertos. autorretencion_especial se registra pero NO excluye la retención por terceros.';

create table if not exists public.reteica_reglas (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id),
  actividad text not null check (length(btrim(actividad)) >= 3),
  tarifa_por_mil numeric(9,4) not null check (tarifa_por_mil > 0 and tarifa_por_mil < 100),
  base_minima numeric(16,2),
  norma text not null check (length(btrim(norma)) >= 3),
  vigente_desde date not null,
  vigente_hasta date,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint reteica_reglas_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
comment on table public.reteica_reglas is
  'Regla municipal de ReteICA: municipio, actividad, tarifa por mil con precisión (9,66 = 0,966 %), base mínima, norma y vigencia.';

create table if not exists public.reteiva_aiu_reglas (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  base_iva text not null check (base_iva = 'utilidad'),
  fundamento text not null check (length(btrim(fundamento)) >= 10),
  vigente_desde date not null,
  vigente_hasta date,
  aprobado_por uuid,
  created_at timestamptz not null default now(),
  constraint reteiva_aiu_reglas_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
comment on table public.reteiva_aiu_reglas is
  'Ronda 3 del Contador: el reteIVA de una operación con AIU no se calcula hasta que la organización registra la regla aplicable con su fundamento legal (hoy solo «IVA sobre la utilidad»; otra base sigue pendiente).';

create table if not exists public.anticipo_pendientes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  tipo text not null check (tipo in ('retencion_por_evaluar', 'retencion_duplicada', 'devolucion_retenciones_por_definir', 'anulacion_caja_cerrada',
                                     'correccion_declaracion')),
  detalle jsonb not null default '{}'::jsonb,
  estado text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  creado_en timestamptz not null default now(),
  creado_por uuid,
  resuelto_en timestamptz,
  resuelto_por uuid,
  resolucion text,
  soporte text,
  constraint anticipo_pendientes_resuelto check (estado = 'abierto' or (resuelto_en is not null and length(btrim(coalesce(resolucion, ''))) >= 10 and length(btrim(coalesce(soporte, ''))) >= 3))
);
comment on table public.anticipo_pendientes is
  'Seguimiento contable de anticipos: no se cierra hasta resolverse con resolución y soporte (fn_anticipo_pendiente_resolver).';
create index if not exists idx_anticipo_pendientes_org_estado on public.anticipo_pendientes (organization_id, estado);

create table if not exists public.anticipos_cuenta_equivalencias (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  account_code text not null,
  nota text not null check (length(btrim(nota)) >= 10),
  aprobado_por uuid,
  aprobado_en timestamptz not null default now(),
  constraint anticipos_cuenta_equivalencias_unica unique (organization_id, account_code)
);
comment on table public.anticipos_cuenta_equivalencias is
  'Cuenta de anticipos a proveedores fuera de 133005xx aprobada como equivalente en el plan de la organización, con nota.';

do $$
declare
  v_t text;
begin
  foreach v_t in array array['supplier_advance_withholdings', 'supplier_advance_withholding_ajustes', 'supplier_advance_refunds',
                             'supplier_advance_invoice_links', 'supplier_tax_qualities', 'reteica_reglas', 'anticipo_pendientes',
                             'anticipos_cuenta_equivalencias', 'reteiva_aiu_reglas'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('drop policy if exists %I on public.%I', v_t || '_select_miembros', v_t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active))', v_t || '_select_miembros', v_t);
    execute format('revoke all on public.%I from anon', v_t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', v_t);
  end loop;
end $$;

-- La clave «anticipos_proveedores» no estaba en la lista cerrada de configuracion_contable: se añade.
alter table public.configuracion_contable drop constraint if exists configuracion_contable_clave_chk;
alter table public.configuracion_contable add constraint configuracion_contable_clave_chk check (clave = any (array[
  'caja', 'bancos', 'clientes', 'proveedores', 'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
  'costo_ventas', 'inventario', 'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica', 'propinas',
  'comisiones', 'anticipos', 'nomina', 'nomina_por_pagar', 'nomina_aportes', 'faltante_inventario',
  'gastos_extraordinarios', 'consumo_interno', 'manifiesto_por_pagar', 'manifiesto_transporte', 'saldo_inicial',
  'impuesto_consumo', 'redondeo', 'compra_servicio', 'ingresos_diversos', 'redondeo_en_contra',
  'anticipos_proveedores']::text[]));

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Cuenta del anticipo: 133005xx de detalle o equivalencia aprobada
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_cuenta_anticipo_motivo_invalida(p_org integer, p_cuenta text)
 returns text language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select case
    when nullif(btrim(coalesce(p_cuenta, '')), '') is null then 'sin_configurar'
    when not exists (select 1 from public.chart_of_accounts c
                      where c.organization_id = p_org and c.account_code = p_cuenta and coalesce(c.is_active, true)) then 'no_existe'
    when exists (select 1 from public.chart_of_accounts c
                  where c.organization_id = p_org and c.account_code = p_cuenta and c.es_movimiento is false)
      or public.fn_es_cuenta_de_titulo(p_org, p_cuenta) then 'no_es_detalle'
    when p_cuenta ~ '^133005[0-9]{2}$' then null
    when exists (select 1 from public.anticipos_cuenta_equivalencias q where q.organization_id = p_org and q.account_code = p_cuenta) then null
    else 'fuera_de_133005'
  end;
$function$;

create or replace function public.fn_cuenta_anticipo_proveedor_estado(p_org integer, p_branch integer)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cfg text;
  v_motivo text;
  v_sugerida text;
  v_nota text;
begin
  perform public.fn_assert_acceso_org(p_org);
  select nullif(btrim(c.account_code), '') into v_cfg
    from public.configuracion_contable c
   where c.organization_id = p_org and c.clave = 'anticipos_proveedores' and (c.branch_id = p_branch or c.branch_id is null)
     and nullif(btrim(c.account_code), '') is not null
   order by c.branch_id nulls last limit 1;
  if public.fn_cuenta_anticipo_motivo_invalida(p_org, '13300501') is null then
    v_sugerida := '13300501';
  end if;
  v_motivo := public.fn_cuenta_anticipo_motivo_invalida(p_org, v_cfg);
  select q.nota into v_nota from public.anticipos_cuenta_equivalencias q where q.organization_id = p_org and q.account_code = v_cfg;
  return jsonb_build_object('estado', coalesce(v_motivo, 'ok'), 'cuenta', case when v_motivo is null then v_cfg end,
    'configurada', v_cfg, 'sugerida', v_sugerida, 'equivalencia', v_nota);
end;
$function$;

create or replace function public.fn_cuenta_anticipo_proveedor(p_org integer, p_branch integer)
 returns text language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_cuenta_anticipo_proveedor_estado(p_org, p_branch) ->> 'cuenta';
$function$;

-- Otro plan: una cuenta de detalle del activo aprobada como equivalente, con nota (finance.approve).
create or replace function public.fn_anticipo_cuenta_equivalencia_aprobar(p_organization_id integer, p_cuenta text, p_nota text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if p_nota is null or length(btrim(p_nota)) < 10 then raise exception 'nota_obligatoria' using errcode = '22023'; end if;
  if left(coalesce(p_cuenta, ''), 1) <> '1'
     or not exists (select 1 from public.chart_of_accounts c where c.organization_id = p_organization_id and c.account_code = p_cuenta
                       and coalesce(c.is_active, true) and c.es_movimiento is not false)
     or public.fn_es_cuenta_de_titulo(p_organization_id, p_cuenta) then
    raise exception 'cuenta_no_valida' using errcode = '22023';
  end if;
  insert into public.anticipos_cuenta_equivalencias (organization_id, account_code, nota, aprobado_por)
  values (p_organization_id, p_cuenta, btrim(p_nota), auth.uid())
  on conflict (organization_id, account_code) do update set nota = excluded.nota, aprobado_por = excluded.aprobado_por, aprobado_en = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'cuenta', p_cuenta);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Calidades del proveedor y reglas de ReteICA (datos verificados, finance.approve)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_proveedor_calidad_tributaria_guardar(
  p_organization_id integer, p_supplier integer, p_calidad text, p_soporte text, p_conceptos text[], p_vigente_desde date, p_vigente_hasta date default null,
  p_rut_fecha date default null, p_rut_archivo text default null, p_resolucion_numero text default null, p_resolucion_fecha date default null,
  p_alcance text default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = p_organization_id) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  if p_calidad in ('simple_acreditado', 'autorretenedor_renta') and (p_rut_fecha is null or length(btrim(coalesce(p_rut_archivo, ''))) < 3) then
    raise exception 'rut_obligatorio' using errcode = '22023', hint = 'RUT actualizado: fecha y archivo.';
  end if;
  if p_calidad = 'autorretenedor_renta' and (length(btrim(coalesce(p_resolucion_numero, ''))) < 1 or p_resolucion_fecha is null
                                             or length(btrim(coalesce(p_alcance, ''))) < 3 or cardinality(coalesce(p_conceptos, '{}'::text[])) = 0) then
    raise exception 'resolucion_autorretencion_obligatoria' using errcode = '22023', hint = 'Número, fecha, alcance y conceptos de la resolución.';
  end if;
  insert into public.supplier_tax_qualities (organization_id, supplier_id, calidad, soporte, conceptos, vigente_desde, vigente_hasta, rut_fecha, rut_archivo,
                                             resolucion_numero, resolucion_fecha, alcance, verificado_por)
  values (p_organization_id, p_supplier, p_calidad, btrim(coalesce(p_soporte, '')), coalesce(p_conceptos, '{}'::text[]), p_vigente_desde, p_vigente_hasta,
          p_rut_fecha, nullif(btrim(coalesce(p_rut_archivo, '')), ''), nullif(btrim(coalesce(p_resolucion_numero, '')), ''), p_resolucion_fecha,
          nullif(btrim(coalesce(p_alcance, '')), ''), auth.uid())
  on conflict (organization_id, supplier_id, calidad, vigente_desde) do update
     set soporte = excluded.soporte, conceptos = excluded.conceptos, vigente_hasta = excluded.vigente_hasta, rut_fecha = excluded.rut_fecha,
         rut_archivo = excluded.rut_archivo, resolucion_numero = excluded.resolucion_numero, resolucion_fecha = excluded.resolucion_fecha,
         alcance = excluded.alcance, verificado_por = excluded.verificado_por, verificado_en = now()
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.fn_reteiva_aiu_regla_guardar(
  p_organization_id integer, p_fundamento text, p_vigente_desde date, p_vigente_hasta date default null, p_base_iva text default 'utilidad')
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if p_fundamento is null or length(btrim(p_fundamento)) < 10 then raise exception 'fundamento_obligatorio' using errcode = '22023'; end if;
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  insert into public.reteiva_aiu_reglas (organization_id, base_iva, fundamento, vigente_desde, vigente_hasta, aprobado_por)
  values (p_organization_id, p_base_iva, btrim(p_fundamento), p_vigente_desde, p_vigente_hasta, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.fn_reteica_regla_guardar(
  p_organization_id integer, p_municipio uuid, p_actividad text, p_tarifa_por_mil numeric, p_norma text,
  p_vigente_desde date, p_vigente_hasta date default null, p_base_minima numeric default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, base_minima, norma, vigente_desde, vigente_hasta, created_by)
  values (p_organization_id, p_municipio, btrim(coalesce(p_actividad, '')), p_tarifa_por_mil, p_base_minima, btrim(coalesce(p_norma, '')),
          p_vigente_desde, p_vigente_hasta, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Pendientes contables de anticipos
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_pendiente_abrir(p_org integer, p_anticipo uuid, p_tipo text, p_detalle jsonb, p_user uuid)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  insert into public.anticipo_pendientes (organization_id, advance_id, tipo, detalle, creado_por)
  values (p_org, p_anticipo, p_tipo, coalesce(p_detalle, '{}'::jsonb), p_user)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.fn_anticipo_pendiente_resolver(p_id uuid, p_resolucion text, p_soporte text, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_p public.anticipo_pendientes%rowtype;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  select * into v_p from public.anticipo_pendientes where id = p_id for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_p.organization_id) then
    raise exception 'pendiente_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_p.organization_id, array['finance.approve']);
  if v_p.estado <> 'abierto' then raise exception 'pendiente_ya_resuelto' using errcode = '22023'; end if;
  if p_resolucion is null or length(btrim(p_resolucion)) < 10 then raise exception 'resolucion_obligatoria' using errcode = '22023'; end if;
  if p_soporte is null or length(btrim(p_soporte)) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  update public.anticipo_pendientes
     set estado = 'resuelto', resuelto_en = now(), resuelto_por = auth.uid(), resolucion = btrim(p_resolucion), soporte = btrim(p_soporte)
   where id = p_id;
  if v_p.tipo = 'retencion_por_evaluar'
     and not exists (select 1 from public.anticipo_pendientes x where x.advance_id = v_p.advance_id and x.tipo = 'retencion_por_evaluar' and x.estado = 'abierto') then
    update public.supplier_advances set retencion_pendiente = false, updated_at = now() where id = v_p.advance_id;
  end if;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_p.organization_id, 'anticipo_pendientes', p_id::text, 'update', auth.uid(),
          jsonb_build_object('tipo', v_p.tipo, 'anticipo', v_p.advance_id, 'soporte', btrim(p_soporte)), btrim(p_resolucion));
  return jsonb_build_object('id', p_id, 'estado', 'resuelto');
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Evaluación de retenciones (P1 + ronda 2)
-- ═════════════════════════════════════════════════════════════════════════════

-- Un concepto de retención configurado sobre una base (tarifa exacta de 20261108165000; cuenta de las compras).
create or replace function public.fn_anticipo_retencion_practicar(p_org integer, p_clase text, p_tax uuid, p_base numeric)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_t record;
  v_tarifa numeric;
  v_valor numeric;
  v_cuenta text;
  v_fila jsonb;
begin
  select ot.id, ot.name, ot.kind, coalesce(ot.is_active, false) as activo, tt.code, public.fn_clase_retencion(tt.code, ot.name) as clase
    into v_t
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.id = p_tax and ot.organization_id = p_org;
  if not found or v_t.kind <> 'withholding' or not v_t.activo or v_t.clase <> p_clase then
    raise exception 'concepto_retencion_invalido' using errcode = '22023', detail = jsonb_build_object('clase', p_clase, 'id', p_tax)::text;
  end if;
  v_tarifa := public.fn_tarifa_exacta_impuesto(v_t.id);
  v_valor := round(coalesce(p_base, 0) * coalesce(v_tarifa, 0) / 100, 0);
  v_cuenta := public.fn_cuenta_retencion_compra(p_org, v_t.code, v_t.name);
  v_fila := jsonb_build_object('clase', p_clase, 'organization_tax_id', v_t.id, 'concepto', v_t.name, 'tax_code', v_t.code,
                               'tarifa', v_tarifa, 'base', round(p_base, 2), 'valor', v_valor, 'cuenta', v_cuenta);
  if v_valor <= 0 then
    return v_fila || jsonb_build_object('estado', 'no_aplica', 'motivo', 'valor_cero');
  end if;
  if not exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org and c.account_code = v_cuenta
                    and coalesce(c.is_active, true) and c.es_movimiento is not false)
     or public.fn_es_cuenta_de_titulo(p_org, v_cuenta) then
    return v_fila || jsonb_build_object('estado', 'pendiente', 'motivo', 'cuenta_retencion_no_valida');
  end if;
  return v_fila || jsonb_build_object('estado', 'practicar', 'motivo', null);
end;
$function$;

-- p_componentes: [{descripcion, tratamiento, base, tarifa_iva}] con tratamiento gravado · exento · excluido · no_sujeto ·
-- aiu_administracion · aiu_imprevistos · aiu_utilidad (el IVA del AIU va sobre la utilidad). Sin componentes solo se admite
-- una suma homogénea con IVA incluido a la tarifa general (19 %, ET art. 468): base = monto / 1,19.
-- p_reteica: regla municipal (reteica_reglas); p_ica_territorial: la actividad se realiza en ese municipio.
create or replace function public.fn_anticipo_proveedor_evaluar_retenciones(
  p_org integer, p_supplier integer, p_naturaleza text, p_monto numeric,
  p_tarifa_iva numeric default null, p_retefuente uuid default null, p_reteica uuid default null,
  p_componentes jsonb default null, p_ica_territorial boolean default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  c_tarifa_general constant numeric := 19;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_prov public.suppliers%rowtype;
  v_perfil jsonb;
  v_hoy date;
  v_pais text;
  v_uvt numeric;
  v_resp_prov text[];
  v_reg_prov text;
  v_resp_org text[];
  v_agente_renta boolean;
  v_agente_iva boolean;
  v_gc_org boolean;
  v_org_resp_iva boolean;
  v_simple_acr boolean;
  v_autorret text[];
  v_prov_resp_iva boolean;
  v_prov_gc boolean;
  v_no_sujeto_ica boolean;
  v_comp jsonb := '[]'::jsonb;
  v_c jsonb;
  v_trat text;
  v_cb numeric;
  v_ct numeric;
  v_ci numeric;
  v_base numeric;
  v_iva numeric;
  v_fuente jsonb;
  v_reteiva jsonb;
  v_ica jsonb;
  v_concepto record;
  v_regla record;
  v_op_fuente jsonb;
  v_op_ica jsonb;
  v_reteiva_id uuid;
  v_min numeric;
  v_aiu boolean := false;
  v_clases jsonb;
  v_total numeric;
  v_cuenta_ica text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_naturaleza is null or p_naturaleza not in ('financiacion', 'pago_anticipado_precio') then
    raise exception 'naturaleza_obligatoria' using errcode = '22023';
  end if;
  if v_monto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  select * into v_prov from public.suppliers s where s.id = p_supplier and s.organization_id = p_org;
  if not found then raise exception 'proveedor_no_encontrado' using errcode = 'P0002'; end if;

  v_hoy := (now() at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'))::date;

  -- Perfil de la organización (columnas de 20261108160500; respaldo a los códigos si están en NULL).
  select to_jsonb(p) into v_perfil from public.organization_tax_profiles p
   where p.organization_id = p_org and p.vigente_desde <= v_hoy and (p.vigente_hasta is null or p.vigente_hasta >= v_hoy)
   order by p.vigente_desde desc limit 1;
  v_resp_org := coalesce(array(select jsonb_array_elements_text(coalesce(v_perfil -> 'responsabilidades', '[]'::jsonb))), '{}'::text[]);
  v_agente_renta := coalesce((v_perfil ->> 'agente_retencion')::boolean, false);
  v_gc_org := coalesce((v_perfil ->> 'gran_contribuyente')::boolean, 'O-13' = any (v_resp_org));
  if v_perfil ->> 'agente_retencion_iva' is null and v_perfil ->> 'gran_contribuyente' is null then
    v_agente_iva := v_resp_org && array['O-13', 'O-23'];
  else
    v_agente_iva := coalesce((v_perfil ->> 'agente_retencion_iva')::boolean, false) or coalesce((v_perfil ->> 'gran_contribuyente')::boolean, false);
  end if;
  v_org_resp_iva := coalesce(v_perfil ->> 'condicion_iva' = 'responsable', 'O-48' = any (v_resp_org));

  -- Proveedor: calidades verificadas con soporte y vigencia; los códigos sin verificar no excluyen.
  v_resp_prov := coalesce(v_prov.fiscal_responsibilities, '{}'::text[]);
  v_reg_prov := lower(coalesce(nullif(btrim(v_prov.tax_regime), ''), ''));
  -- Ronda 3: la inscripción en el SIMPLE y la resolución de autorretención deben cubrir la fecha de la operación (hoy) y el
  -- RUT que las soporta ser anterior a ella. La autorretención especial no cuenta: no excluye la retención por terceros.
  v_simple_acr := exists (select 1 from public.supplier_tax_qualities q where q.organization_id = p_org and q.supplier_id = p_supplier
                            and q.calidad = 'simple_acreditado' and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy)
                            and q.rut_fecha is not null and q.rut_fecha <= v_hoy);
  select q.conceptos into v_autorret from public.supplier_tax_qualities q
   where q.organization_id = p_org and q.supplier_id = p_supplier and q.calidad = 'autorretenedor_renta'
     and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy)
     and q.rut_fecha is not null and q.rut_fecha <= v_hoy and q.resolucion_fecha is not null and q.resolucion_fecha <= v_hoy
   order by q.vigente_desde desc limit 1;
  v_prov_resp_iva := case
    when exists (select 1 from public.supplier_tax_qualities q where q.organization_id = p_org and q.supplier_id = p_supplier and q.calidad = 'responsable_iva'
                   and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy)) then true
    when exists (select 1 from public.supplier_tax_qualities q where q.organization_id = p_org and q.supplier_id = p_supplier and q.calidad = 'no_responsable_iva'
                   and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy)) then false
    when 'O-49' = any (v_resp_prov) or v_reg_prov = 'no_responsable' then false
    when 'O-48' = any (v_resp_prov) or v_reg_prov in ('comun', 'gran_contribuyente') then true
    else null end;
  v_prov_gc := 'O-13' = any (v_resp_prov) or v_reg_prov = 'gran_contribuyente'
    or exists (select 1 from public.supplier_tax_qualities q where q.organization_id = p_org and q.supplier_id = p_supplier and q.calidad = 'gran_contribuyente'
                 and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy));
  v_no_sujeto_ica := exists (select 1 from public.supplier_tax_qualities q where q.organization_id = p_org and q.supplier_id = p_supplier
                               and q.calidad = 'no_sujeto_ica' and q.vigente_desde <= v_hoy and (q.vigente_hasta is null or q.vigente_hasta >= v_hoy));

  select coalesce(jsonb_agg(jsonb_build_object('id', ot.id, 'nombre', ot.name, 'tarifa', public.fn_tarifa_exacta_impuesto(ot.id), 'codigo', tt.code,
                                               'base_minima_uvt', ot.min_base_uvt) order by ot.name), '[]'::jsonb)
    into v_op_fuente
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false) and public.fn_clase_retencion(tt.code, ot.name) = 'retefuente';
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', m.name || ' · ' || r.actividad, 'tarifa_por_mil', r.tarifa_por_mil, 'norma', r.norma)
                            order by m.name, r.actividad), '[]'::jsonb)
    into v_op_ica
    from public.reteica_reglas r join public.municipalities m on m.id = r.municipality_id
   where r.organization_id = p_org and r.vigente_desde <= v_hoy and (r.vigente_hasta is null or r.vigente_hasta >= v_hoy);
  select ot.id into v_reteiva_id
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false) and public.fn_clase_retencion(tt.code, ot.name) = 'reteiva'
   order by ot.name, ot.id limit 1;

  if p_reteica is not null and not exists (select 1 from public.reteica_reglas r where r.id = p_reteica and r.organization_id = p_org) then
    raise exception 'regla_ica_invalida' using errcode = '22023';
  end if;

  if p_naturaleza = 'financiacion' then
    -- Anticipo genuino: la retención se evalúa cuando se convierte en pago o abono del precio (al amortizarlo).
    v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'diferida', 'motivo', 'se_evalua_al_pago_o_abono');
    v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'diferida', 'motivo', 'se_evalua_al_pago_o_abono');
    v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'diferida', 'motivo', 'se_evalua_al_pago_o_abono');
  else
    -- Composición de la operación.
    if p_componentes is null or jsonb_typeof(p_componentes) <> 'array' or jsonb_array_length(p_componentes) = 0 then
      if p_tarifa_iva is null then raise exception 'tarifa_iva_obligatoria' using errcode = '22023'; end if;
      if p_tarifa_iva <> c_tarifa_general then
        raise exception 'componentes_obligatorios' using errcode = '22023',
          hint = 'Dividir entre 1 + tarifa solo vale para una suma homogénea a la tarifa general: detalle los componentes.';
      end if;
      if not exists (select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
                      where ot.organization_id = p_org and ot.kind = 'tax' and coalesce(ot.is_active, false) and ot.rate = c_tarifa_general
                        and (upper(coalesce(tt.code, '')) like 'IVA%' or upper(ot.name) like '%IVA%')) then
        raise exception 'tarifa_iva_invalida' using errcode = '22023';
      end if;
      v_cb := round(v_monto / (1 + c_tarifa_general / 100), 2);
      v_comp := jsonb_build_array(jsonb_build_object('descripcion', 'Suma homogénea con IVA incluido a la tarifa general', 'tratamiento', 'gravado',
                                                     'base', v_cb, 'tarifa_iva', c_tarifa_general, 'iva', v_monto - v_cb));
    else
      for v_c in select * from jsonb_array_elements(p_componentes) loop
        v_trat := v_c ->> 'tratamiento';
        v_cb := round(coalesce((v_c ->> 'base')::numeric, 0), 2);
        v_ct := coalesce((v_c ->> 'tarifa_iva')::numeric, 0);
        if v_trat is null or v_trat not in ('gravado', 'exento', 'excluido', 'no_sujeto', 'aiu_administracion', 'aiu_imprevistos', 'aiu_utilidad') or v_cb <= 0 then
          raise exception 'componente_invalido' using errcode = '22023', detail = v_c::text;
        end if;
        if v_trat in ('gravado', 'aiu_utilidad') then
          if v_ct <= 0 or not exists (select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
                                       where ot.organization_id = p_org and ot.kind = 'tax' and coalesce(ot.is_active, false) and ot.rate = v_ct
                                         and (upper(coalesce(tt.code, '')) like 'IVA%' or upper(ot.name) like '%IVA%')) then
            raise exception 'tarifa_iva_invalida' using errcode = '22023', detail = v_c::text;
          end if;
          v_ci := round(v_cb * v_ct / 100, 2);
        else
          if v_ct <> 0 then raise exception 'componente_invalido' using errcode = '22023', detail = v_c::text; end if;
          v_ci := 0;
        end if;
        v_comp := v_comp || jsonb_build_object('descripcion', coalesce(nullif(btrim(v_c ->> 'descripcion'), ''), v_trat), 'tratamiento', v_trat,
                                               'base', v_cb, 'tarifa_iva', v_ct, 'iva', v_ci);
      end loop;
      if abs((select sum((x ->> 'base')::numeric + (x ->> 'iva')::numeric) from jsonb_array_elements(v_comp) x) - v_monto) > 1 then
        raise exception 'componentes_no_suman' using errcode = '22023',
          detail = jsonb_build_object('monto', v_monto, 'componentes', (select sum((x ->> 'base')::numeric + (x ->> 'iva')::numeric) from jsonb_array_elements(v_comp) x))::text;
      end if;
    end if;
    select sum((x ->> 'base')::numeric), sum((x ->> 'iva')::numeric) into v_base, v_iva from jsonb_array_elements(v_comp) x;
    v_aiu := exists (select 1 from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' like 'aiu\_%');

    if v_perfil is null or coalesce((v_perfil ->> 'requiere_revision')::boolean, false) then
      v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', case when v_perfil is null then 'sin_perfil_tributario' else 'perfil_requiere_revision' end);
      v_reteiva := v_fuente || jsonb_build_object('clase', 'reteiva');
      v_ica := v_fuente || jsonb_build_object('clase', 'reteica');
    else
      -- Renta.
      if not v_agente_renta then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'organizacion_no_agente_retencion');
      elsif v_simple_acr then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'proveedor_simple_acreditado');
      elsif 'O-47' = any (v_resp_prov) or v_reg_prov = 'simple' then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'simple_sin_acreditar');
      elsif cardinality(v_resp_prov) = 0 and v_reg_prov = '' and v_prov_resp_iva is null and v_autorret is null then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'proveedor_sin_datos_fiscales');
      elsif jsonb_array_length(v_op_fuente) = 0 then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'sin_regla_retefuente');
      elsif p_retefuente is null then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'concepto_sin_elegir');
      else
        select ot.id, ot.name, tt.code, ot.min_base_uvt into v_concepto
          from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
         where ot.id = p_retefuente and ot.organization_id = p_org;
        if v_autorret is not null and (v_concepto.code = any (v_autorret) or p_retefuente::text = any (v_autorret)) then
          v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'autorretenedor_autorizado_concepto', 'concepto', v_concepto.name);
        elsif v_autorret is null and 'O-15' = any (v_resp_prov) then
          v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'autorretencion_sin_verificar');
        else
          select coalesce(nullif(btrim(o.country_code), ''), 'COL') into v_pais from public.organizations o where o.id = p_org;
          select u.value into v_uvt from public.fiscal_uvt u where u.country_code = v_pais and u.year = extract(year from v_hoy)::integer;
          v_min := v_concepto.min_base_uvt;
          if v_uvt is null then
            v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'sin_uvt');
          elsif v_min is not null and v_base < round(v_min * v_uvt, 0) then
            v_fuente := public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, v_base)
                        || jsonb_build_object('estado', 'no_aplica', 'motivo', 'bajo_base_minima', 'valor', 0, 'base_minima', round(v_min * v_uvt, 0));
          else
            v_fuente := public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, v_base);
          end if;
        end if;
      end if;

      -- IVA: base = IVA de los componentes gravados. AIU (ronda 3): sin regla registrada con su fundamento, pendiente.
      if v_aiu and not exists (select 1 from public.reteiva_aiu_reglas g where g.organization_id = p_org and g.base_iva = 'utilidad'
                                  and g.vigente_desde <= v_hoy and (g.vigente_hasta is null or g.vigente_hasta >= v_hoy)) then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'aiu_fundamento_por_validar');
      elsif v_iva = 0 then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'operacion_sin_iva');
      elsif v_prov_resp_iva is false then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'proveedor_no_responsable_iva');
      elsif v_prov_resp_iva is null then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'proveedor_sin_datos_fiscales');
      elsif not v_agente_iva then
        if (v_simple_acr or 'O-47' = any (v_resp_prov)) and v_org_resp_iva then
          v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'supuesto_compra_a_simple_por_confirmar');
        else
          v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'organizacion_no_agente_reteiva');
        end if;
      elsif v_gc_org and v_prov_gc then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'grandes_contribuyentes_por_verificar');
      elsif v_reteiva_id is null then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'sin_regla_reteiva');
      else
        v_reteiva := public.fn_anticipo_retencion_practicar(p_org, 'reteiva', v_reteiva_id, v_iva);
      end if;

      -- ICA: regla municipal + territorialidad + calidades + base.
      if jsonb_array_length(v_op_ica) = 0 then
        v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'sin_regla_reteica_municipal');
      elsif p_reteica is null then
        v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'norma_municipal_sin_confirmar');
      else
        select r.*, m.name as municipio into v_regla
          from public.reteica_reglas r join public.municipalities m on m.id = r.municipality_id
         where r.id = p_reteica and r.organization_id = p_org and r.vigente_desde <= v_hoy and (r.vigente_hasta is null or r.vigente_hasta >= v_hoy);
        if not found then
          v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'regla_ica_no_vigente');
        elsif p_ica_territorial is not true then
          v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'territorialidad_sin_confirmar');
        elsif v_no_sujeto_ica then
          v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'no_aplica', 'motivo', 'proveedor_no_sujeto_ica');
        elsif v_regla.base_minima is not null and v_base < v_regla.base_minima then
          v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'no_aplica', 'motivo', 'bajo_base_minima');
        else
          v_cuenta_ica := public.fn_cuenta_retencion_compra(p_org, 'RETEICA', 'ReteICA');
          v_ica := jsonb_build_object('clase', 'reteica', 'regla_ica_id', v_regla.id, 'concepto', 'ReteICA ' || v_regla.municipio || ' · ' || v_regla.actividad,
                                      'tax_code', 'RETEICA', 'norma', v_regla.norma, 'tarifa', v_regla.tarifa_por_mil / 10, 'tarifa_por_mil', v_regla.tarifa_por_mil,
                                      'base', round(v_base, 2), 'valor', round(v_base * v_regla.tarifa_por_mil / 1000, 0), 'cuenta', v_cuenta_ica);
          if not exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org and c.account_code = v_cuenta_ica
                            and coalesce(c.is_active, true) and c.es_movimiento is not false)
             or public.fn_es_cuenta_de_titulo(p_org, v_cuenta_ica) then
            v_ica := v_ica || jsonb_build_object('estado', 'pendiente', 'motivo', 'cuenta_retencion_no_valida');
          elsif (v_ica ->> 'valor')::numeric <= 0 then
            v_ica := v_ica || jsonb_build_object('estado', 'no_aplica', 'motivo', 'valor_cero');
          else
            v_ica := v_ica || jsonb_build_object('estado', 'practicar', 'motivo', null);
          end if;
        end if;
      end if;
    end if;
  end if;

  if p_retefuente is not null and v_fuente ->> 'organization_tax_id' is null then
    perform public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, 0);
  end if;

  v_clases := jsonb_build_array(v_fuente, v_reteiva, v_ica);
  select coalesce(sum((c ->> 'valor')::numeric), 0) into v_total from jsonb_array_elements(v_clases) c where c ->> 'estado' = 'practicar';
  if v_total >= v_monto then raise exception 'retencion_excede_monto' using errcode = '22023'; end if;

  return jsonb_build_object(
    'naturaleza', p_naturaleza, 'monto', v_monto, 'tarifa_iva', p_tarifa_iva, 'componentes', v_comp,
    'base', v_base, 'iva', v_iva, 'fecha', v_hoy,
    'perfil', case when v_perfil is null then null else jsonb_build_object(
                'vigente_desde', v_perfil ->> 'vigente_desde', 'regimen_renta', coalesce(v_perfil ->> 'regimen_renta', v_perfil ->> 'regimen'),
                'condicion_iva', v_perfil ->> 'condicion_iva', 'agente_retencion', v_agente_renta, 'agente_retencion_iva', v_agente_iva,
                'gran_contribuyente', v_gc_org) end,
    'proveedor', jsonb_build_object('regimen', nullif(v_reg_prov, ''), 'responsabilidades', to_jsonb(v_resp_prov), 'simple_acreditado', v_simple_acr,
                                    'autorretencion_conceptos', to_jsonb(v_autorret), 'responsable_iva', v_prov_resp_iva, 'no_sujeto_ica', v_no_sujeto_ica),
    'clases', v_clases, 'total', v_total, 'neto', v_monto - v_total,
    'pendiente', exists (select 1 from jsonb_array_elements(v_clases) c where c ->> 'estado' = 'pendiente'),
    'opciones', jsonb_build_object('retefuente', v_op_fuente, 'reteica', v_op_ica));
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Asiento de varias líneas con las cuentas exactas y cuenta por pagar reconocida
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_proveedor_asiento(
  p_org integer, p_branch integer, p_fecha timestamptz, p_memo text, p_source text, p_source_id text, p_fact_key text, p_lineas jsonb, p_user uuid)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id integer;
  v_branch integer := p_branch;
  v_dia date;
  v_d numeric;
  v_c numeric;
  v_l jsonb;
  v_falta text;
begin
  select e.id into v_id from public.journal_entries e where e.organization_id = p_org and e.fact_key = p_fact_key;
  if v_id is not null then return v_id; end if;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    select b.id into v_branch from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)
     order by b.is_main desc nulls last, b.id limit 1;
  end if;
  v_dia := (p_fecha at time zone coalesce(public.fn_timezone_for(p_org, v_branch), 'America/Bogota'))::date;
  if not public.fn_is_period_open(p_org, v_dia) then raise exception 'periodo_cerrado' using errcode = '22023'; end if;
  select coalesce(sum(round(coalesce((l ->> 'debito')::numeric, 0), 2)), 0), coalesce(sum(round(coalesce((l ->> 'credito')::numeric, 0), 2)), 0)
    into v_d, v_c from jsonb_array_elements(p_lineas) l;
  if v_d <= 0 or v_d <> v_c then
    raise exception 'asiento_descuadrado' using errcode = 'P0001', detail = jsonb_build_object('debitos', v_d, 'creditos', v_c)::text;
  end if;
  select string_agg(l ->> 'cuenta', ', ') into v_falta from jsonb_array_elements(p_lineas) l
   where not exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org and c.account_code = l ->> 'cuenta'
                        and coalesce(c.is_active, true) and c.es_movimiento is not false);
  if v_falta is not null then
    raise exception 'cuenta_no_valida' using errcode = 'P0002', detail = jsonb_build_object('cuentas', v_falta)::text;
  end if;
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (p_org, v_branch, p_fecha, p_memo, p_source, p_source_id, true, p_user, p_fact_key) returning id into v_id;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    continue when round(coalesce((v_l ->> 'debito')::numeric, 0), 2) = 0 and round(coalesce((v_l ->> 'credito')::numeric, 0), 2) = 0;
    -- tercero_nit / tercero_nombre opcionales por línea (si faltan, los pone el disparador de tercero según la fuente).
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
    values (v_id, v_l ->> 'cuenta', coalesce(nullif(v_l ->> 'descripcion', ''), p_memo),
            round(coalesce((v_l ->> 'debito')::numeric, 0), 2), round(coalesce((v_l ->> 'credito')::numeric, 0), 2),
            public.fn_centro_para_cuenta(p_org, v_branch, v_l ->> 'cuenta', null, null),
            nullif(v_l ->> 'tercero_nit', ''), nullif(v_l ->> 'tercero_nombre', ''));
  end loop;
  return v_id;
end;
$function$;

create or replace function public.fn_cxp_cuenta_reconocida(p_org integer, p_ap uuid, out cuenta text, out asiento integer)
 returns record language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ap public.accounts_payable%rowtype;
begin
  cuenta := null;
  asiento := null;
  select * into v_ap from public.accounts_payable where id = p_ap and organization_id = p_org;
  if not found or v_ap.invoice_id is null then return; end if;
  select e.id into asiento from public.journal_entries e
   where e.organization_id = p_org and e.source = 'invoice_purchase' and e.source_id = v_ap.invoice_id::text and coalesce(e.posted, false)
     and not exists (select 1 from public.journal_entries r where r.organization_id = p_org and r.fact_key = 'reversal:' || e.id)
   order by (e.fact_key = 'accrual:purchase:' || v_ap.invoice_id::text) desc, e.id desc limit 1;
  if asiento is null then return; end if;
  select l.account_code into cuenta from public.journal_lines l
   where l.journal_entry_id = asiento and coalesce(l.credit, 0) > 0 and coalesce(l.debit, 0) = 0
     and left(l.account_code, 2) in ('22', '23') and left(l.account_code, 4) not in ('2365', '2367', '2368')
   order by (l.credit = v_ap.amount) desc, l.credit desc, l.id limit 1;
  if cuenta is null then asiento := null; end if;
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Registrar (crear) · la firma vieja de crear queda cerrada
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_proveedor_registrar(
  p_supplier integer, p_branch integer, p_monto numeric, p_metodo text, p_naturaleza text, p_clave_idempotencia text, p_organization_id integer,
  p_tarifa_iva numeric default null, p_retefuente uuid default null, p_reteica uuid default null, p_cuenta_bancaria integer default null,
  p_referencia text default null, p_notas text default null, p_componentes jsonb default null, p_ica_territorial boolean default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_grupo public.payment_groups%rowtype;
  v_prev public.supplier_advances%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_estado_cuenta jsonb;
  v_cuenta_anticipo text;
  v_eval jsonb;
  v_ret numeric;
  v_girado numeric;
  v_moneda text;
  v_recibo text;
  v_anticipo uuid;
  v_pago uuid;
  v_entry integer;
  v_lineas jsonb;
  v_c jsonb;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if v_org is null then raise exception 'organizacion_no_permitida' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  if p_naturaleza is null or p_naturaleza not in ('financiacion', 'pago_anticipado_precio') then
    raise exception 'naturaleza_obligatoria' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_pago:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_grupo from public.payment_groups where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    select * into v_prev from public.supplier_advances a where a.payment_group_id = v_grupo.id limit 1;
    if coalesce(v_grupo.origin, '') <> 'anticipo_proveedor' or v_prev.id is null or v_prev.amount <> v_monto
       or v_grupo.supplier_id is distinct from p_supplier or v_prev.naturaleza is distinct from p_naturaleza then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('anticipo_id', v_prev.id, 'grupo_id', v_grupo.id, 'recibo', v_grupo.receipt_number, 'repetida', true,
      'caja_id', v_grupo.cash_session_id, 'monto', v_prev.amount, 'girado', v_prev.monto_girado, 'retencion', v_prev.retencion_total,
      'retencion_pendiente', v_prev.retencion_pendiente, 'evaluacion', v_prev.retenciones_evaluacion);
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = v_org) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = v_org and coalesce(b.is_active, true)) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;

  v_estado_cuenta := public.fn_cuenta_anticipo_proveedor_estado(v_org, p_branch);
  if v_estado_cuenta ->> 'estado' <> 'ok' then
    if v_estado_cuenta ->> 'estado' = 'sin_configurar' then
      raise exception 'cuenta_anticipos_no_configurada' using errcode = 'P0002', detail = v_estado_cuenta::text,
        hint = 'Configure la clave «anticipos a proveedores» con un auxiliar de detalle de ocho dígitos bajo 133005 (p. ej. 13300501).';
    end if;
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002', detail = v_estado_cuenta::text,
      hint = 'La cuenta configurada no es un auxiliar 133005xx de detalle ni tiene equivalencia aprobada.';
  end if;
  v_cuenta_anticipo := v_estado_cuenta ->> 'cuenta';

  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then raise exception 'metodo_invalido' using errcode = '22023'; end if;
  if coalesce(v_requiere_ref, false) and v_ref is null then raise exception 'referencia_obligatoria' using errcode = '22023'; end if;
  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, p_branch, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023', hint = 'Abra la caja de la sucursal o registre el anticipo con otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, p_branch, p_metodo, case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002'; end if;
  v_cuenta_dinero := public.fn_puc_cuenta_de_sede(v_org, p_branch, v_cuenta_dinero);

  v_eval := public.fn_anticipo_proveedor_evaluar_retenciones(v_org, p_supplier, p_naturaleza, v_monto, p_tarifa_iva, p_retefuente, p_reteica,
                                                             p_componentes, p_ica_territorial);
  if exists (select 1 from jsonb_array_elements(v_eval -> 'clases') c where c ->> 'motivo' = 'concepto_sin_elegir') then
    raise exception 'concepto_retefuente_obligatorio' using errcode = '22023', hint = 'Elija el concepto de retención en la fuente de la operación.';
  end if;
  v_ret := coalesce((v_eval ->> 'total')::numeric, 0);
  v_girado := v_monto - v_ret;
  v_moneda := upper(public.fn_moneda_base_organizacion(v_org));
  v_recibo := public.fn_recibo_siguiente_numero(v_org, 'CE');

  insert into public.payment_groups (organization_id, branch_id, direction, receipt_number, supplier_id, method, currency, total_applied, advance_amount,
    received_amount, change_amount, payment_date, reference, bank_account_id, notes, cash_session_id, origin, idempotency_key, created_by)
  values (v_org, p_branch, 'pago', v_recibo, p_supplier, p_metodo, v_moneda, 0, v_girado, null, 0, now(), v_ref,
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_notas, v_caja, 'anticipo_proveedor', p_clave_idempotencia, v_uid)
  returning * into v_grupo;

  insert into public.supplier_advances (organization_id, branch_id, supplier_id, amount, balance, status, currency, account_code, payment_group_id, notes,
    created_by, naturaleza, tarifa_iva, componentes, base_retencion, retencion_total, monto_girado, retencion_pendiente, retenciones_evaluacion)
  values (v_org, p_branch, p_supplier, v_monto, v_monto, 'active', v_moneda, v_cuenta_anticipo, v_grupo.id, coalesce(v_notas, 'Anticipo del comprobante ' || v_recibo),
    v_uid, p_naturaleza, p_tarifa_iva, v_eval -> 'componentes', (v_eval ->> 'base')::numeric, v_ret, v_girado,
    coalesce((v_eval ->> 'pendiente')::boolean, false), v_eval)
  returning id into v_anticipo;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_anticipo, 'debito', v_monto, 'credito', 0, 'descripcion', 'Anticipo a proveedor - ' || v_recibo),
    jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', 0, 'credito', v_girado, 'descripcion', 'Anticipo a proveedor - ' || v_recibo));
  for v_c in select * from jsonb_array_elements(v_eval -> 'clases') loop
    continue when v_c ->> 'estado' <> 'practicar';
    insert into public.supplier_advance_withholdings (organization_id, advance_id, clase, organization_tax_id, regla_ica_id, concepto, tax_code, norma,
                                                      base, tarifa, valor, cuenta)
    values (v_org, v_anticipo, v_c ->> 'clase', (v_c ->> 'organization_tax_id')::uuid, (v_c ->> 'regla_ica_id')::uuid, v_c ->> 'concepto', v_c ->> 'tax_code',
            v_c ->> 'norma', (v_c ->> 'base')::numeric, (v_c ->> 'tarifa')::numeric, (v_c ->> 'valor')::numeric, v_c ->> 'cuenta');
    v_lineas := v_lineas || jsonb_build_object('cuenta', v_c ->> 'cuenta', 'debito', 0, 'credito', (v_c ->> 'valor')::numeric,
                                               'descripcion', coalesce(v_c ->> 'concepto', v_c ->> 'clase') || ' - anticipo ' || v_recibo);
  end loop;

  v_entry := public.fn_anticipo_proveedor_asiento(v_org, p_branch, now(), 'Anticipo a proveedor - ' || v_recibo, 'supplier_advance', v_anticipo::text,
               'supplier_advance:' || v_anticipo::text, v_lineas, v_uid);

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency, reference, status, created_by, payment_date,
    bank_account_id, payment_group_id)
  values (v_org, p_branch, 'supplier_advance', v_anticipo::text, p_metodo, -v_girado, v_moneda, coalesce(v_ref, v_recibo), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_grupo.id)
  returning id into v_pago;

  if coalesce((v_eval ->> 'pendiente')::boolean, false) then
    perform public.fn_anticipo_pendiente_abrir(v_org, v_anticipo, 'retencion_por_evaluar',
      jsonb_build_object('clases', (select jsonb_agg(c) from jsonb_array_elements(v_eval -> 'clases') c where c ->> 'estado' = 'pendiente')), v_uid);
  end if;

  return jsonb_build_object('anticipo_id', v_anticipo, 'grupo_id', v_grupo.id, 'recibo', v_recibo, 'repetida', false, 'caja_id', v_caja,
    'payment_id', v_pago, 'monto', v_monto, 'girado', v_girado, 'retencion', v_ret,
    'retencion_pendiente', coalesce((v_eval ->> 'pendiente')::boolean, false), 'asiento_id', v_entry, 'cuenta', v_cuenta_anticipo, 'evaluacion', v_eval);
end;
$function$;

create or replace function public.fn_anticipo_proveedor_crear(
  p_supplier integer, p_branch integer, p_monto numeric, p_metodo text, p_clave_idempotencia text, p_organization_id integer,
  p_cuenta_bancaria integer default null, p_referencia text default null, p_notas text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'naturaleza_obligatoria' using errcode = '22023', hint = 'Use fn_anticipo_proveedor_registrar: la naturaleza del anticipo es obligatoria.';
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Retención duplicada: se evita al reconocer la factura (vínculo + control en la causación)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_proveedor_vincular_factura(p_anticipo uuid, p_factura uuid, p_monto numeric, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ant public.supplier_advances%rowtype;
  v_ip public.invoice_purchase%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_otros numeric;
  v_ret jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if v_monto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.create']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then raise exception 'anticipo_no_disponible' using errcode = '22023'; end if;
  select * into v_ip from public.invoice_purchase where id = p_factura and organization_id = v_ant.organization_id for update;
  if not found then raise exception 'factura_no_encontrada' using errcode = 'P0002'; end if;
  if v_ip.supplier_id is distinct from v_ant.supplier_id then raise exception 'proveedor_distinto' using errcode = '22023'; end if;
  if v_ip.status <> 'draft' then
    raise exception 'factura_no_borrador' using errcode = '22023', hint = 'El vínculo se hace antes de causar la factura.';
  end if;
  select coalesce(sum(l.monto), 0) into v_otros from public.supplier_advance_invoice_links l
   where l.advance_id = v_ant.id and l.invoice_id <> p_factura
     and exists (select 1 from public.invoice_purchase i where i.id = l.invoice_id and i.status = 'draft');
  if v_otros + v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023', detail = jsonb_build_object('saldo', v_ant.balance, 'vinculado', v_otros)::text;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('clase', w.clase, 'concepto', w.concepto, 'cuenta', w.cuenta,
                    'base', round(w.base * v_monto / v_ant.amount, 2), 'valor', round(w.valor * v_monto / v_ant.amount, 2)) order by w.clase), '[]'::jsonb)
    into v_ret
    from public.supplier_advance_withholdings w where w.advance_id = v_ant.id;
  insert into public.supplier_advance_invoice_links (organization_id, advance_id, invoice_id, monto, retencion, created_by)
  values (v_ant.organization_id, v_ant.id, p_factura, v_monto, v_ret, v_uid)
  on conflict (advance_id, invoice_id) do update set monto = excluded.monto, retencion = excluded.retencion, created_by = excluded.created_by, created_at = now()
  returning id into v_id;
  return jsonb_build_object('vinculo_id', v_id, 'monto', v_monto, 'retencion', v_ret);
end;
$function$;

create or replace function public.fn_anticipo_proveedor_desvincular_factura(p_anticipo uuid, p_factura uuid, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then raise exception 'anticipo_no_encontrado' using errcode = 'P0002'; end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if not exists (select 1 from public.invoice_purchase i where i.id = p_factura and i.organization_id = v_org and i.status = 'draft') then
    raise exception 'factura_no_borrador' using errcode = '22023';
  end if;
  delete from public.supplier_advance_invoice_links where advance_id = p_anticipo and invoice_id = p_factura;
  return jsonb_build_object('anticipo_id', p_anticipo, 'factura_id', p_factura);
end;
$function$;

-- Control en la causación: al salir del borrador, la factura no puede retener sobre la base ya retenida en los anticipos
-- vinculados (por impuesto: base retenida en la factura ≤ base de referencia − base ya retenida en anticipos).
create or replace function public.fn_trg_factura_compra_retencion_anticipo()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c record;
  v_ref numeric;
  v_inv_base numeric;
begin
  if new.status in ('draft', 'void', 'voided', 'cancelled') then return new; end if;
  for v_c in
    select r ->> 'clase' as clase, sum((r ->> 'base')::numeric) as base
      from public.supplier_advance_invoice_links l cross join lateral jsonb_array_elements(l.retencion) r
     where l.invoice_id = new.id
     group by r ->> 'clase'
  loop
    v_ref := case when v_c.clase = 'reteiva' then coalesce(new.tax_total, 0) else coalesce(new.subtotal, 0) end;
    select coalesce(sum(w.base), 0) into v_inv_base from public.invoice_purchase_withholdings w
     where w.invoice_id = new.id and w.amount > 0 and public.fn_clase_retencion(w.tax_code, w.concept) = v_c.clase;
    if v_inv_base > greatest(v_ref - v_c.base, 0) + 1 then
      raise exception 'retencion_duplicada_con_anticipo' using errcode = '22023',
        detail = jsonb_build_object('clase', v_c.clase, 'base_factura', v_inv_base, 'base_retenida_anticipos', v_c.base,
                                    'base_maxima', greatest(v_ref - v_c.base, 0))::text,
        hint = 'La factura retiene sobre una base ya retenida en el anticipo vinculado: retenga solo sobre la base restante.';
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_factura_compra_retencion_anticipo on public.invoice_purchase;
create trigger trg_factura_compra_retencion_anticipo
  before update of status on public.invoice_purchase
  for each row when (old.status = 'draft' and new.status is distinct from 'draft')
  execute function public.fn_trg_factura_compra_retencion_anticipo();

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Aplicar: D CxP reconocida · C anticipo. Duplicado ya ocurrido: solo con corrección documentada
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_proveedor_aplicar_int(
  p_anticipo uuid, p_cuenta_por_pagar uuid, p_monto numeric, p_clave_idempotencia text, p_organization_id integer, p_correccion jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_ap public.accounts_payable%rowtype;
  v_ip public.invoice_purchase%rowtype;
  v_app public.supplier_advance_applications%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_rec record;
  v_w record;
  v_ratio numeric;
  v_inv_base numeric;
  v_inv_ret numeric;
  v_inv_cuenta text;
  v_inv_concepto text;
  v_base_ant numeric;
  v_ref numeric;
  v_prev_cov numeric;
  v_prev_dup numeric;
  v_ov numeric;
  v_dup numeric;
  v_dup_total numeric := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_lineas_ret jsonb := '[]'::jsonb;
  v_vinculada boolean;
  v_reduccion numeric;
  v_entry integer;
  v_memo text;
  v_d jsonb;
  v_motivo text := nullif(btrim(coalesce(p_correccion ->> 'motivo', '')), '');
  v_soporte text := nullif(btrim(coalesce(p_correccion ->> 'soporte', '')), '');
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_aplicar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_app from public.supplier_advance_applications where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_app.advance_id <> p_anticipo or v_app.account_payable_id <> p_cuenta_por_pagar or coalesce(v_app.consumo_anticipo, v_app.amount) <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('aplicacion_id', v_app.id, 'repetida', true, 'monto', coalesce(v_app.consumo_anticipo, v_app.amount),
      'reduccion_cuenta', v_app.amount, 'retencion_descontada', v_app.retencion_descontada,
      'saldo_disponible', (select balance from public.supplier_advances where id = v_app.advance_id),
      'saldo_cuenta', (select balance from public.accounts_payable where id = v_app.account_payable_id));
  end if;

  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then raise exception 'anticipo_no_disponible' using errcode = '22023'; end if;
  if v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023', detail = jsonb_build_object('saldo', v_ant.balance)::text;
  end if;
  if public.fn_cuenta_anticipo_motivo_invalida(v_org, v_ant.account_code) is not null then
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002', detail = jsonb_build_object('cuenta', v_ant.account_code)::text;
  end if;

  select * into v_ap from public.accounts_payable where id = p_cuenta_por_pagar and organization_id = v_org for update;
  if not found then raise exception 'cuenta_no_encontrada' using errcode = 'P0002'; end if;
  if v_ap.status in ('cancelled', 'void') then raise exception 'documento_anulado' using errcode = '22023'; end if;
  if v_ap.invoice_id is not null then
    select * into v_ip from public.invoice_purchase where id = v_ap.invoice_id for update;
    if v_ip.status = 'draft' then raise exception 'documento_borrador' using errcode = '22023'; end if;
    if v_ip.status in ('void', 'voided', 'cancelled') then raise exception 'documento_anulado' using errcode = '22023'; end if;
    if upper(coalesce(v_ip.currency, v_ant.currency)) <> upper(v_ant.currency) then raise exception 'moneda_distinta' using errcode = '22023'; end if;
  end if;
  if v_ap.supplier_id is distinct from v_ant.supplier_id then raise exception 'proveedor_distinto' using errcode = '22023'; end if;
  if coalesce(v_ap.branch_id, v_ip.branch_id) is not null and not public.app_branch_access(coalesce(v_ap.branch_id, v_ip.branch_id)) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  select * into v_rec from public.fn_cxp_cuenta_reconocida(v_org, v_ap.id);
  if v_rec.cuenta is null then
    raise exception 'cxp_sin_causacion' using errcode = 'P0002', hint = 'La cuenta por pagar no tiene un asiento de causación vigente con la línea del proveedor.';
  end if;

  -- Retención repetida: solo puede pasar si el anticipo NO se vinculó a la factura antes de causarla.
  v_vinculada := v_ip.id is not null and exists (select 1 from public.supplier_advance_invoice_links l where l.advance_id = v_ant.id and l.invoice_id = v_ip.id);
  v_ratio := v_monto / v_ant.amount;
  if v_ip.id is not null and not v_vinculada then
    for v_w in
      select w.clase, sum(w.base) as base from public.supplier_advance_withholdings w where w.advance_id = v_ant.id group by w.clase order by w.clase
    loop
      select coalesce(sum(x.base), 0), coalesce(sum(x.amount), 0),
             (array_agg(public.fn_cuenta_retencion_compra(v_org, x.tax_code, x.concept) order by x.amount desc, x.id))[1],
             (array_agg(x.concept order by x.amount desc, x.id))[1]
        into v_inv_base, v_inv_ret, v_inv_cuenta, v_inv_concepto
        from public.invoice_purchase_withholdings x
       where x.invoice_id = v_ip.id and x.amount > 0 and public.fn_clase_retencion(x.tax_code, x.concept) = v_w.clase;
      v_base_ant := round(v_w.base * v_ratio, 2);
      v_ref := case when v_w.clase = 'reteiva' then coalesce(v_ip.tax_total, 0) else coalesce(v_ip.subtotal, 0) end;
      select coalesce(sum((d ->> 'base_cubierta')::numeric), 0), coalesce(sum((d ->> 'descontado')::numeric), 0) into v_prev_cov, v_prev_dup
        from public.supplier_advance_applications a2 cross join lateral jsonb_array_elements(coalesce(a2.retencion_detalle, '[]'::jsonb)) d
       where a2.organization_id = v_org and a2.invoice_id = v_ip.id and d ->> 'clase' = v_w.clase;
      v_ov := greatest(0, least(v_prev_cov + v_base_ant, v_inv_base + v_prev_cov + v_base_ant - v_ref))
            - greatest(0, least(v_prev_cov, v_inv_base + v_prev_cov - v_ref));
      v_dup := case when v_inv_base > 0 and v_inv_ret > 0
                    then greatest(0, least(round(v_ov * v_inv_ret / v_inv_base, 0), v_inv_ret - v_prev_dup)) else 0 end;
      v_detalle := v_detalle || jsonb_build_object('clase', v_w.clase, 'base_cubierta', v_base_ant, 'base_factura', v_inv_base, 'retencion_factura', v_inv_ret,
        'base_superpuesta', v_ov, 'descontado', v_dup, 'cuenta', v_inv_cuenta, 'concepto', v_inv_concepto,
        'tarifa', case when v_inv_base > 0 then round(v_inv_ret * 100 / v_inv_base, 4) end);
      if v_dup > 0 then
        v_dup_total := v_dup_total + v_dup;
        v_lineas_ret := v_lineas_ret || jsonb_build_object('cuenta', v_inv_cuenta, 'debito', v_dup, 'credito', 0,
          'descripcion', 'Corrección documentada: retención ' || v_w.clase || ' repetida en la factura sobre la base del anticipo');
      end if;
    end loop;
  end if;

  if v_dup_total > 0 and (v_motivo is null or length(v_motivo) < 3 or v_soporte is null or length(v_soporte) < 3) then
    raise exception 'retencion_duplicada' using errcode = '22023', detail = v_detalle::text,
      hint = 'La factura retuvo sobre la base ya retenida en el anticipo. Registre la corrección documentada (motivo y soporte) o corrija la factura.';
  end if;

  v_reduccion := v_monto - v_dup_total;
  if v_reduccion > coalesce(v_ap.balance, 0) then
    raise exception 'monto_excede_saldo' using errcode = '22023', detail = jsonb_build_object('saldo', v_ap.balance, 'retencion_descontada', v_dup_total)::text;
  end if;

  insert into public.supplier_advance_applications (organization_id, advance_id, account_payable_id, invoice_id, amount, idempotency_key, created_by,
    consumo_anticipo, retencion_descontada, retencion_detalle, correccion_motivo, correccion_soporte, cuenta_por_pagar, asiento_causacion)
  values (v_org, p_anticipo, v_ap.id, v_ap.invoice_id, v_reduccion, p_clave_idempotencia, v_uid, v_monto, v_dup_total,
    case when v_dup_total > 0 then v_detalle end, case when v_dup_total > 0 then v_motivo end, case when v_dup_total > 0 then v_soporte end,
    v_rec.cuenta, v_rec.asiento)
  returning * into v_app;

  update public.supplier_advances set balance = balance - v_monto, status = case when balance - v_monto <= 0 then 'used' else 'active' end, updated_at = now()
   where id = p_anticipo;

  v_memo := 'Aplicación de anticipo a proveedor' || coalesce(' - factura ' || nullif(v_ip.number_ext, ''), '');
  v_entry := public.fn_anticipo_proveedor_asiento(v_org, coalesce(v_ap.branch_id, v_ip.branch_id, v_ant.branch_id), now(), v_memo,
    'supplier_advance_application', v_app.id::text, 'supplier_advance_application:' || v_app.id::text,
    jsonb_build_array(jsonb_build_object('cuenta', v_rec.cuenta, 'debito', v_reduccion, 'credito', 0, 'descripcion', v_memo))
      || v_lineas_ret
      || jsonb_build_array(jsonb_build_object('cuenta', v_ant.account_code, 'debito', 0, 'credito', v_monto, 'descripcion', v_memo)),
    v_uid);
  update public.supplier_advance_applications set asiento_id = v_entry where id = v_app.id;

  if v_dup_total > 0 then
    for v_d in select * from jsonb_array_elements(v_detalle) loop
      continue when coalesce((v_d ->> 'descontado')::numeric, 0) <= 0;
      insert into public.supplier_advance_withholding_ajustes (organization_id, advance_id, invoice_id, tipo, clase, concepto, tax_code, cuenta, tarifa,
                                                                base, valor, procedimiento, soporte, asiento_id, created_by)
      values (v_org, v_ant.id, v_ip.id, 'duplicado_factura', v_d ->> 'clase', coalesce(v_d ->> 'concepto', v_d ->> 'clase'), null, v_d ->> 'cuenta',
              (v_d ->> 'tarifa')::numeric, -(v_d ->> 'base_superpuesta')::numeric, -(v_d ->> 'descontado')::numeric, v_motivo, v_soporte, v_entry, v_uid);
    end loop;
    perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'retencion_duplicada',
      jsonb_build_object('factura', v_ip.number_ext, 'factura_id', v_ip.id, 'aplicacion_id', v_app.id, 'retencion_corregida', v_dup_total,
                         'periodos_a_revisar', jsonb_build_array(to_char(v_ip.issue_date, 'YYYY-MM'), to_char(v_ant.created_at, 'YYYY-MM')),
                         'detalle', v_detalle), v_uid);
  end if;

  return jsonb_build_object('aplicacion_id', v_app.id, 'repetida', false, 'monto', v_monto, 'reduccion_cuenta', v_reduccion,
    'retencion_descontada', v_dup_total, 'vinculada', v_vinculada, 'cuenta_por_pagar', v_rec.cuenta, 'asiento_causacion', v_rec.asiento, 'asiento_id', v_entry,
    'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo),
    'saldo_cuenta', (select balance from public.accounts_payable where id = v_ap.id),
    'estado_cuenta', (select status from public.accounts_payable where id = v_ap.id));
end;
$function$;

create or replace function public.fn_anticipo_proveedor_aplicar(
  p_anticipo uuid, p_cuenta_por_pagar uuid, p_monto numeric, p_clave_idempotencia text, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  return public.fn_anticipo_proveedor_aplicar_int(p_anticipo, p_cuenta_por_pagar, p_monto, p_clave_idempotencia, p_organization_id, null);
end;
$function$;

create or replace function public.fn_anticipo_proveedor_aplicar_corrigiendo(
  p_anticipo uuid, p_cuenta_por_pagar uuid, p_monto numeric, p_clave_idempotencia text, p_motivo text, p_soporte text, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if p_soporte is null or length(btrim(p_soporte)) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  return public.fn_anticipo_proveedor_aplicar_int(p_anticipo, p_cuenta_por_pagar, p_monto, p_clave_idempotencia, p_organization_id,
                                                  jsonb_build_object('motivo', p_motivo, 'soporte', p_soporte));
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Devolver por procedimiento y causa (ronda 3): las retenciones afectadas salen del procedimiento
-- ═════════════════════════════════════════════════════════════════════════════

-- p_monto = dinero que entra a caja o banco. p_procedimiento (ronda 3 del Contador):
--   {causa, soportes: {documento, calculo, certificado, norma_ica}, periodo_descuento 'AAAA-MM', requiere_correccion,
--    base_devuelta, iva_devuelto}
--   causa «operacion_anulada» (anulada o resuelta): se revierten TODAS las retenciones vigentes y la devolución es por todo
--     el saldo (dinero + retenciones = saldo); documento = la anulación o resolución.
--   causa «devolucion_parcial»: el cálculo da la parte devuelta de la operación (base sin IVA y su IVA); cada retención sale
--     de su base y tarifa (renta e ICA sobre la base, reteIVA sobre el IVA); el dinero debe ser esa parte menos esas
--     retenciones. Documento = la solicitud o el acuerdo con el proveedor.
--   Con retenciones afectadas: cálculo, certificado (expedido, anulado o corregido), período en que se descuentan y si la
--   declaración requiere corrección (abre un pendiente «correccion_declaracion»); la reversión de ICA, la norma municipal.
--   NULL = no se puede determinar: baja solo el dinero, las retenciones siguen en el anticipo y queda un pendiente.
--   La retención excesiva o indebida no es una devolución del proveedor: fn_anticipo_retencion_exceso_reintegrar.
drop function if exists public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text);
create or replace function public.fn_anticipo_proveedor_devolver(
  p_anticipo uuid, p_monto numeric, p_metodo text, p_motivo text, p_clave_idempotencia text, p_organization_id integer default null,
  p_cuenta_bancaria integer default null, p_referencia text default null, p_procedimiento jsonb default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_dinero numeric := round(coalesce(p_monto, 0), 2);
  v_pago public.payments%rowtype;
  v_dev public.supplier_advance_refunds%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_entry integer;
  v_w public.supplier_advance_withholdings%rowtype;
  v_r numeric;
  v_ret numeric := 0;
  v_bruto numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_lineas_ret jsonb := '[]'::jsonb;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_det boolean := p_procedimiento is not null;
  v_causa text := p_procedimiento ->> 'causa';
  v_sop jsonb := coalesce(p_procedimiento -> 'soportes', '{}'::jsonb);
  v_periodo text := nullif(btrim(coalesce(p_procedimiento ->> 'periodo_descuento', '')), '');
  v_corr boolean := (p_procedimiento ->> 'requiere_correccion')::boolean;
  v_base_dev numeric := round(coalesce((p_procedimiento ->> 'base_devuelta')::numeric, 0), 2);
  v_iva_dev numeric := round(coalesce((p_procedimiento ->> 'iva_devuelto')::numeric, 0), 2);
  v_d jsonb;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_dinero <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if v_ref is null or length(v_ref) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  if v_det then
    if jsonb_typeof(p_procedimiento) <> 'object' or v_causa is null or v_causa not in ('operacion_anulada', 'devolucion_parcial') then
      raise exception 'procedimiento_invalido' using errcode = '22023';
    end if;
    if length(btrim(coalesce(v_sop ->> 'documento', ''))) < 3 then
      raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'documento';
    end if;
  end if;

  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then raise exception 'anticipo_no_encontrado' using errcode = 'P0002'; end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.void']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_devolver:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    select * into v_dev from public.supplier_advance_refunds where payment_id = v_pago.id;
    if v_pago.source <> 'supplier_advance_refund' or v_pago.source_id <> p_anticipo::text or v_pago.amount <> v_dinero then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'monto', v_dev.monto, 'dinero', v_pago.amount,
      'retencion_revertida', coalesce(v_dev.retencion_revertida, 0), 'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo));
  end if;

  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then raise exception 'anticipo_no_disponible' using errcode = '22023'; end if;
  if public.fn_cuenta_anticipo_motivo_invalida(v_org, v_ant.account_code) is not null then
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002', detail = jsonb_build_object('cuenta', v_ant.account_code)::text;
  end if;

  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then raise exception 'metodo_invalido' using errcode = '22023'; end if;
  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, v_ant.branch_id, v_uid);
    if v_caja is null then raise exception 'sin_caja_abierta' using errcode = '22023', hint = 'Abra la caja de la sucursal o reciba el dinero por otro método.'; end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, v_ant.branch_id, p_metodo, case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002'; end if;
  v_cuenta_dinero := public.fn_puc_cuenta_de_sede(v_org, v_ant.branch_id, v_cuenta_dinero);

  -- Las retenciones afectadas salen del procedimiento (no se eligen a mano).
  if v_det then
    if v_causa = 'devolucion_parcial' and (v_base_dev <= 0 or v_iva_dev < 0) then
      raise exception 'calculo_obligatorio' using errcode = '22023', hint = 'Base devuelta (sin IVA) e IVA devuelto de la parte de la operación.';
    end if;
    for v_w in select * from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido order by w.clase for update loop
      v_r := case when v_causa = 'operacion_anulada' then v_w.valor - v_w.revertido
                  when v_w.clase = 'reteiva' then round(v_iva_dev * v_w.tarifa / 100, 0)
                  else round(v_base_dev * v_w.tarifa / 100, 0) end;
      continue when v_r <= 0;
      if v_r > v_w.valor - v_w.revertido then
        raise exception 'retencion_devolucion_invalida' using errcode = '22023',
          detail = jsonb_build_object('clase', v_w.clase, 'calculada', v_r, 'vigente', v_w.valor - v_w.revertido)::text;
      end if;
      v_ret := v_ret + v_r;
      v_detalle := v_detalle || jsonb_build_object('clase', v_w.clase, 'cuenta', v_w.cuenta, 'revertido', v_r, 'causa', v_causa);
      v_lineas_ret := v_lineas_ret || jsonb_build_object('cuenta', v_w.cuenta, 'debito', v_r, 'credito', 0,
        'descripcion', 'Reversión de retención ' || v_w.clase || ' (' || replace(v_causa, '_', ' ') || ')');
      update public.supplier_advance_withholdings set revertido = revertido + v_r where id = v_w.id;
    end loop;
    if v_ret > 0 then
      if length(btrim(coalesce(v_sop ->> 'calculo', ''))) < 3 or length(btrim(coalesce(v_sop ->> 'certificado', ''))) < 3 then
        raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'calculo_y_certificado';
      end if;
      if exists (select 1 from jsonb_array_elements(v_detalle) d where d ->> 'clase' = 'reteica')
         and length(btrim(coalesce(v_sop ->> 'norma_ica', ''))) < 3 then
        raise exception 'reteica_requiere_norma' using errcode = '22023';
      end if;
      if v_periodo is null or v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or v_corr is null then
        raise exception 'tratamiento_declaracion_obligatorio' using errcode = '22023',
          hint = 'Período en que se descuenta la retención y si la declaración requiere corrección.';
      end if;
    end if;
    if v_causa = 'operacion_anulada' and abs(v_dinero + v_ret - v_ant.balance) > 1 then
      raise exception 'anulacion_requiere_devolucion_total' using errcode = '22023',
        detail = jsonb_build_object('saldo', v_ant.balance, 'dinero', v_dinero, 'retenciones', v_ret)::text;
    end if;
    if v_causa = 'devolucion_parcial' and abs(v_dinero - (v_base_dev + v_iva_dev - v_ret)) > 1 then
      raise exception 'calculo_no_cuadra' using errcode = '22023',
        detail = jsonb_build_object('dinero', v_dinero, 'esperado', v_base_dev + v_iva_dev - v_ret, 'retenciones', v_ret)::text;
    end if;
  end if;
  v_bruto := v_dinero + v_ret;
  if v_bruto > v_ant.balance + 1 then
    raise exception 'monto_excede_anticipo' using errcode = '22023', detail = jsonb_build_object('saldo', v_ant.balance, 'bruto', v_bruto)::text;
  end if;
  v_bruto := least(v_bruto, v_ant.balance);

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency, reference, status, created_by, payment_date,
    bank_account_id, idempotency_key)
  values (v_org, v_ant.branch_id, 'supplier_advance_refund', v_ant.id::text, p_metodo, v_dinero, v_ant.currency, v_ref, 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, p_clave_idempotencia)
  returning * into v_pago;

  v_entry := public.fn_anticipo_proveedor_asiento(v_org, v_ant.branch_id, now(), 'Devolución de anticipo a proveedor - ' || v_ref,
    'supplier_advance_refund', v_pago.id::text, 'supplier_advance_refund:' || v_pago.id::text,
    jsonb_build_array(jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', v_dinero, 'credito', 0))
      || v_lineas_ret
      || jsonb_build_array(jsonb_build_object('cuenta', v_ant.account_code, 'debito', 0, 'credito', v_bruto)),
    v_uid);

  insert into public.supplier_advance_refunds (organization_id, advance_id, payment_id, monto, dinero, retencion_revertida, retencion_detalle,
                                               retenciones_determinadas, procedimiento, soporte, motivo, asiento_id, created_by)
  values (v_org, v_ant.id, v_pago.id, v_bruto, v_dinero, v_bruto - v_dinero, v_detalle, v_det, p_procedimiento, v_ref, btrim(p_motivo), v_entry, v_uid);

  for v_d in select * from jsonb_array_elements(v_detalle) loop
    select * into v_w from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.clase = v_d ->> 'clase';
    insert into public.supplier_advance_withholding_ajustes (organization_id, advance_id, withholding_id, tipo, clase, concepto, tax_code, cuenta, tarifa,
                                                              base, valor, procedimiento, soporte, causa, periodo_descuento, requiere_correccion, soportes,
                                                              asiento_id, created_by)
    values (v_org, v_ant.id, v_w.id, 'devolucion', v_w.clase, v_w.concepto, v_w.tax_code, v_w.cuenta, v_w.tarifa,
            case when v_causa = 'operacion_anulada' then -round(v_w.base * (v_d ->> 'revertido')::numeric / v_w.valor, 2)
                 when v_w.clase = 'reteiva' then -v_iva_dev else -v_base_dev end,
            -(v_d ->> 'revertido')::numeric, v_causa, coalesce(v_sop ->> 'certificado', v_ref), v_causa, v_periodo, v_corr, v_sop, v_entry, v_uid);
  end loop;

  update public.supplier_advances set balance = balance - v_bruto, status = case when balance - v_bruto <= 0 then 'used' else 'active' end, updated_at = now()
   where id = v_ant.id;

  if not v_det and exists (select 1 from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido) then
    perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'devolucion_retenciones_por_definir',
      jsonb_build_object('payment_id', v_pago.id, 'dinero', v_dinero, 'soporte', v_ref,
        'retenciones_vigentes', (select jsonb_agg(jsonb_build_object('clase', w.clase, 'valor', w.valor - w.revertido))
                                   from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido)), v_uid);
  end if;
  if v_ret > 0 and v_corr then
    perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'correccion_declaracion',
      jsonb_build_object('payment_id', v_pago.id, 'causa', v_causa, 'periodos_a_revisar', jsonb_build_array(v_periodo), 'detalle', v_detalle), v_uid);
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'devolucion_en_dinero', 'bruto', v_bruto, 'dinero', v_dinero, 'retencion_revertida', v_bruto - v_dinero,
                             'procedimiento', p_procedimiento, 'metodo', p_metodo, 'soporte', v_ref, 'payment_id', v_pago.id, 'asiento', v_entry), btrim(p_motivo));

  return jsonb_build_object('payment_id', v_pago.id, 'repetida', false, 'monto', v_bruto, 'dinero', v_dinero, 'retencion_revertida', v_bruto - v_dinero,
    'retenciones_determinadas', v_det, 'causa', v_causa, 'detalle', v_detalle, 'asiento_id', v_entry, 'caja_id', v_caja,
    'saldo_disponible', (select balance from public.supplier_advances where id = v_ant.id));
end;
$function$;

-- Retención excesiva o indebida (ronda 3, causa b): el cálculo correcto (base y tarifa) da el exceso; se reintegra al
-- proveedor (D retención por pagar / C caja o banco). El anticipo no cambia: lo que el proveedor tiene a favor sigue igual.
-- Exige el cálculo y el certificado corregido, el período en que se descuenta y si la declaración requiere corrección.
create or replace function public.fn_anticipo_retencion_exceso_reintegrar(
  p_anticipo uuid, p_clase text, p_base_correcta numeric, p_tarifa_correcta numeric, p_metodo text, p_clave_idempotencia text,
  p_soportes jsonb, p_periodo_descuento text, p_requiere_correccion boolean, p_motivo text, p_organization_id integer default null,
  p_cuenta_bancaria integer default null, p_referencia text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ant public.supplier_advances%rowtype;
  v_w public.supplier_advance_withholdings%rowtype;
  v_pago public.payments%rowtype;
  v_correcta numeric;
  v_exceso numeric;
  v_caja integer;
  v_cuenta_dinero text;
  v_entry integer;
  v_sop jsonb := coalesce(p_soportes, '{}'::jsonb);
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_nit text;
  v_nombre text;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if length(btrim(coalesce(v_sop ->> 'calculo', ''))) < 3 or length(btrim(coalesce(v_sop ->> 'certificado', ''))) < 3 then
    raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'calculo_y_certificado';
  end if;
  if p_periodo_descuento is null or p_periodo_descuento !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_requiere_correccion is null then
    raise exception 'tratamiento_declaracion_obligatorio' using errcode = '22023';
  end if;
  if p_base_correcta is null or p_base_correcta < 0 or p_tarifa_correcta is null or p_tarifa_correcta < 0 then
    raise exception 'calculo_obligatorio' using errcode = '22023';
  end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.void']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if p_clase = 'reteica' and length(btrim(coalesce(v_sop ->> 'norma_ica', ''))) < 3 then raise exception 'reteica_requiere_norma' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('anticipo_retencion_exceso:' || v_ant.organization_id || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_ant.organization_id and idempotency_key = p_clave_idempotencia;
  if found then
    if v_pago.source <> 'supplier_advance_withholding_refund' or v_pago.source_id <> p_anticipo::text then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'reintegro', -v_pago.amount);
  end if;

  select * into v_w from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.clase = p_clase for update;
  if not found then raise exception 'retencion_devolucion_invalida' using errcode = '22023'; end if;
  select coalesce(nullif(btrim(sp.nit), ''), nullif(btrim(sp.tax_id), '')), sp.name into v_nit, v_nombre from public.suppliers sp where sp.id = v_ant.supplier_id;
  v_correcta := round(p_base_correcta * p_tarifa_correcta / 100, 0);
  v_exceso := v_w.valor - v_w.revertido - v_correcta;
  if v_exceso <= 0 then raise exception 'sin_exceso' using errcode = '22023', detail = jsonb_build_object('vigente', v_w.valor - v_w.revertido, 'correcta', v_correcta)::text; end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_ant.organization_id, v_ant.branch_id, v_uid);
    if v_caja is null then raise exception 'sin_caja_abierta' using errcode = '22023'; end if;
  end if;
  if not exists (select 1 from public.payment_methods pm join public.organization_payment_methods opm on opm.payment_method_code = pm.code
                  and opm.organization_id = v_ant.organization_id and coalesce(opm.is_active, true)
                  where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit') then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_ant.organization_id, v_ant.branch_id, p_metodo, case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002'; end if;
  v_cuenta_dinero := public.fn_puc_cuenta_de_sede(v_ant.organization_id, v_ant.branch_id, v_cuenta_dinero);

  insert into public.payments (organization_id, branch_id, source, source_id, method, amount, currency, reference, status, created_by, payment_date,
    bank_account_id, idempotency_key)
  values (v_ant.organization_id, v_ant.branch_id, 'supplier_advance_withholding_refund', v_ant.id::text, p_metodo, -v_exceso, v_ant.currency,
          coalesce(v_ref, v_sop ->> 'certificado'), 'completed', v_uid, now(), case when p_metodo = 'cash' then null else p_cuenta_bancaria end, p_clave_idempotencia)
  returning * into v_pago;

  v_entry := public.fn_anticipo_proveedor_asiento(v_ant.organization_id, v_ant.branch_id, now(), 'Reintegro de retención excesiva al proveedor',
    'supplier_advance_withholding_refund', v_pago.id::text, 'supplier_advance_withholding_refund:' || v_pago.id::text,
    jsonb_build_array(jsonb_build_object('cuenta', v_w.cuenta, 'debito', v_exceso, 'credito', 0, 'tercero_nit', v_nit, 'tercero_nombre', v_nombre),
                      jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', 0, 'credito', v_exceso, 'tercero_nit', v_nit, 'tercero_nombre', v_nombre)), v_uid);

  update public.supplier_advance_withholdings set revertido = revertido + v_exceso where id = v_w.id;
  update public.supplier_advances set retencion_total = retencion_total - v_exceso, monto_girado = coalesce(monto_girado, amount) + v_exceso, updated_at = now()
   where id = v_ant.id;
  insert into public.supplier_advance_withholding_ajustes (organization_id, advance_id, withholding_id, tipo, clase, concepto, tax_code, cuenta, tarifa,
                                                            base, valor, procedimiento, soporte, causa, periodo_descuento, requiere_correccion, soportes,
                                                            asiento_id, created_by)
  values (v_ant.organization_id, v_ant.id, v_w.id, 'retencion_excesiva', v_w.clase, v_w.concepto, v_w.tax_code, v_w.cuenta, p_tarifa_correcta,
          round(p_base_correcta - v_w.base, 2), -v_exceso, 'retencion_excesiva', v_sop ->> 'certificado', 'retencion_excesiva', p_periodo_descuento,
          p_requiere_correccion, v_sop, v_entry, v_uid);
  if p_requiere_correccion then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'correccion_declaracion',
      jsonb_build_object('payment_id', v_pago.id, 'causa', 'retencion_excesiva', 'clase', p_clase, 'exceso', v_exceso,
                         'periodos_a_revisar', jsonb_build_array(p_periodo_descuento)), v_uid);
  end if;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_ant.organization_id, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'reintegro_retencion_excesiva', 'clase', p_clase, 'exceso', v_exceso, 'correcta', v_correcta, 'soportes', v_sop,
                             'periodo', p_periodo_descuento, 'requiere_correccion', p_requiere_correccion, 'asiento', v_entry), btrim(p_motivo));
  return jsonb_build_object('payment_id', v_pago.id, 'repetida', false, 'reintegro', v_exceso, 'retencion_correcta', v_correcta, 'asiento_id', v_entry,
                            'caja_id', v_caja);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Anular: solo si el desembolso NO ocurrió. Caja cerrada: ajuste en periodo abierto, arqueo intacto
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipo_proveedor_anular(p_anticipo uuid, p_motivo text, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'anulacion_requiere_declaracion' using errcode = '22023',
    hint = 'Use fn_anticipo_proveedor_anular_por_error (el desembolso no ocurrió, con soporte y fecha del ajuste) o registre la devolución.';
end;
$function$;

create or replace function public.fn_anticipo_proveedor_anular_por_error(
  p_anticipo uuid, p_motivo text, p_soporte text, p_fecha_ajuste date default null, p_organization_id integer default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ant public.supplier_advances%rowtype;
  v_pago public.payments%rowtype;
  v_caja record;
  v_caja_cerrada boolean := false;
  v_tz text;
  v_hoy date;
  v_fecha date;
  v_instante timestamptz;
  v_asiento integer;
  v_reverso integer;
  v_soporte text := nullif(btrim(coalesce(p_soporte, '')), '');
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if v_soporte is null or length(v_soporte) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.void']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_ant.status = 'cancelled' then raise exception 'anticipo_no_disponible' using errcode = '22023'; end if;
  if v_ant.balance <> v_ant.amount
     or exists (select 1 from public.supplier_advance_applications a where a.advance_id = v_ant.id)
     or exists (select 1 from public.supplier_advance_refunds r where r.advance_id = v_ant.id) then
    raise exception 'anticipo_usado' using errcode = '22023';
  end if;

  v_tz := coalesce(public.fn_timezone_for(v_ant.organization_id, v_ant.branch_id), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  v_fecha := coalesce(p_fecha_ajuste, v_hoy);
  if v_fecha > v_hoy then raise exception 'fecha_ajuste_futura' using errcode = '22023'; end if;
  if v_fecha < (v_ant.created_at at time zone v_tz)::date then raise exception 'fecha_ajuste_anterior_al_anticipo' using errcode = '22023'; end if;
  if not public.fn_is_period_open(v_ant.organization_id, v_fecha) then raise exception 'periodo_cerrado' using errcode = '22023'; end if;
  v_instante := case when v_fecha = v_hoy then now() else (v_fecha::timestamp + time '12:00') at time zone v_tz end;

  select * into v_pago from public.payments p
   where p.organization_id = v_ant.organization_id and p.source = 'supplier_advance' and p.source_id = v_ant.id::text and p.status = 'completed'
   order by p.created_at limit 1 for update;
  if v_pago.id is not null and v_pago.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_pago.payment_group_id);
    v_caja_cerrada := found and v_caja.status <> 'open';
  end if;

  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_ant.organization_id and je.fact_key = 'supplier_advance:' || v_ant.id::text and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is null then raise exception 'asiento_no_encontrado' using errcode = 'P0002'; end if;
  v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_pago', 'anticipo-proveedor:' || v_ant.id::text, v_instante, v_uid);
  if v_reverso is null then
    raise exception 'contra_asiento_no_creado' using errcode = 'P0001',
      hint = 'El asiento del anticipo tiene líneas que hoy no se pueden revertir (cuenta de título o sin cuenta).';
  end if;

  -- Caja cerrada: no se reabre ni se cambia su arqueo (el pago queda como estaba); solo el ajuste contable documentado.
  if v_pago.id is not null and not v_caja_cerrada then
    update public.payments set status = 'void', voided_at = now(), voided_by = v_uid, void_reason = btrim(p_motivo), updated_at = now() where id = v_pago.id;
  end if;
  if v_ant.payment_group_id is not null and not v_caja_cerrada then
    update public.payment_groups set status = 'void' where id = v_ant.payment_group_id;
  end if;

  insert into public.supplier_advance_withholding_ajustes (organization_id, advance_id, withholding_id, tipo, clase, concepto, tax_code, cuenta, tarifa,
                                                            base, valor, procedimiento, soporte, fecha, asiento_id, created_by)
  select w.organization_id, w.advance_id, w.id, 'anulacion_error', w.clase, w.concepto, w.tax_code, w.cuenta, w.tarifa,
         -round(w.base * (w.valor - w.revertido) / w.valor, 2), -(w.valor - w.revertido), btrim(p_motivo), v_soporte, v_instante, v_reverso, v_uid
    from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido;
  update public.supplier_advance_withholdings set revertido = valor where advance_id = v_ant.id;

  update public.supplier_advances
     set status = 'cancelled', balance = 0, cancelled_at = now(), cancelled_by = v_uid, cancel_reason = btrim(p_motivo),
         anulacion_tipo = 'desembolso_no_ocurrio', anulacion_soporte = v_soporte, anulacion_fecha = v_fecha, anulacion_caja_cerrada = v_caja_cerrada,
         updated_at = now()
   where id = v_ant.id;

  if v_caja_cerrada then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'anulacion_caja_cerrada',
      jsonb_build_object('caja', v_caja.id, 'payment_id', v_pago.id, 'girado', -v_pago.amount, 'fecha_ajuste', v_fecha,
                         'nota', 'Arqueo original preservado: revisar la diferencia de la caja cerrada contra el ajuste.'), v_uid);
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_ant.organization_id, 'supplier_advances', v_ant.id::text, 'void', v_uid,
          jsonb_build_object('declaracion', 'desembolso_no_ocurrio', 'soporte', v_soporte, 'fecha_ajuste', v_fecha, 'caja_cerrada', v_caja_cerrada,
                             'monto', v_ant.amount, 'payment_id', v_pago.id, 'asiento', v_asiento, 'contra_asiento', v_reverso), btrim(p_motivo));

  return jsonb_build_object('anticipo_id', v_ant.id, 'payment_id', v_pago.id, 'fecha_ajuste', v_fecha, 'caja_cerrada', v_caja_cerrada,
                            'asiento_revertido', v_asiento, 'contra_asiento', v_reverso);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. Estado de cuenta del proveedor (posición neta)
-- ═════════════════════════════════════════════════════════════════════════════

-- Cruces de anticipos con la obligación de un mandato de consignación (fn_consignacion_cruzar_anticipo, migración
-- 20261108121000). Si esa migración no está aplicada, no devuelve filas (la tabla no existe todavía).
create or replace function public.fn_anticipo_cruces_consignacion(p_org integer, p_supplier integer default null)
 returns table(cruce_id uuid, advance_id uuid, nota text, monto numeric, fecha timestamptz, asiento integer)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if to_regclass('public.consignment_advance_crossings') is null or to_regclass('public.consignment_notes') is null then
    return;
  end if;
  return query
  select c.id, c.advance_id, n.number::text, c.amount::numeric, c.created_at, c.journal_entry_id
    from public.consignment_advance_crossings c
    join public.supplier_advances a on a.id = c.advance_id
    left join public.consignment_notes n on n.id = c.note_id
   where c.organization_id = p_org and (p_supplier is null or a.supplier_id = p_supplier);
end;
$function$;

create or replace function public.fn_estado_cuenta_proveedor_movs(p_org integer, p_supplier integer)
 returns table(fecha timestamp with time zone, tipo text, documento text, ref_id text, vence timestamp with time zone, cargo numeric, abono numeric)
 language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select ip.issue_date, 'factura'::text, ip.number_ext, ip.id::text, ip.due_date, public.fn_invoice_purchase_neto(ip.id), 0::numeric
    from public.invoice_purchase ip
   where ip.organization_id = p_org and ip.supplier_id = p_supplier and ip.status not in ('draft', 'void', 'voided')
     and (auth.uid() is null or public.app_branch_access(ip.branch_id))
  union all
  select ap.created_at, 'cuenta'::text, null::text, ap.id::text, ap.due_date, coalesce(ap.amount, 0), 0::numeric
    from public.accounts_payable ap
   where ap.organization_id = p_org and ap.supplier_id = p_supplier and ap.invoice_id is null and coalesce(ap.status, '') <> 'void'
     and (auth.uid() is null or public.app_branch_access(ap.branch_id))
  union all
  select p.payment_date, 'pago'::text, coalesce(nullif(p.reference, ''), p.method), p.id::text, null::timestamptz, 0::numeric, p.amount + coalesce(p.discount_amount, 0)
    from public.payments p
   where p.organization_id = p_org and p.status = 'completed'
     and ((p.source = 'invoice_purchase' and p.source_id in (
             select ip.id::text from public.invoice_purchase ip where ip.organization_id = p_org and ip.supplier_id = p_supplier and ip.status not in ('draft', 'void', 'voided')))
       or (p.source = 'account_payable' and p.source_id in (
             select ap.id::text from public.accounts_payable ap left join public.invoice_purchase ip on ip.id = ap.invoice_id
              where ap.organization_id = p_org and ap.supplier_id = p_supplier and (ip.id is null or ip.status not in ('draft', 'void', 'voided')))))
     and (auth.uid() is null or public.app_branch_access(p.branch_id))
  union all
  select a.created_at, 'anticipo'::text, g.receipt_number, a.id::text, null::timestamptz, 0::numeric, a.amount
    from public.supplier_advances a left join public.payment_groups g on g.id = a.payment_group_id
   where a.organization_id = p_org and a.supplier_id = p_supplier and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select coalesce((a.anulacion_fecha::timestamp + time '12:00') at time zone coalesce(public.fn_timezone_for(p_org, a.branch_id), 'America/Bogota'), a.cancelled_at),
         'anulacion_anticipo'::text, g.receipt_number, a.id::text || ':anulacion', null::timestamptz, a.amount, 0::numeric
    from public.supplier_advances a left join public.payment_groups g on g.id = a.payment_group_id
   where a.organization_id = p_org and a.supplier_id = p_supplier and a.status = 'cancelled'
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select x.created_at, case when x.retencion_descontada > 0 then 'correccion_retencion' else 'aplicacion_anticipo' end,
         coalesce(nullif(ip.number_ext, ''), g.receipt_number), x.id::text, null::timestamptz, coalesce(x.retencion_descontada, 0), 0::numeric
    from public.supplier_advance_applications x join public.supplier_advances a on a.id = x.advance_id
    left join public.payment_groups g on g.id = a.payment_group_id left join public.invoice_purchase ip on ip.id = x.invoice_id
   where x.organization_id = p_org and a.supplier_id = p_supplier and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select r.created_at, 'devolucion_anticipo'::text, r.soporte, r.id::text, null::timestamptz, r.monto, 0::numeric
    from public.supplier_advance_refunds r join public.supplier_advances a on a.id = r.advance_id
   where r.organization_id = p_org and a.supplier_id = p_supplier and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select x.fecha, 'cruce_consignacion'::text, x.nota, x.cruce_id::text, null::timestamptz, x.monto, 0::numeric
    from public.fn_anticipo_cruces_consignacion(p_org, p_supplier) x join public.supplier_advances a on a.id = x.advance_id
   where auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id);
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. Conciliación por anticipo y por proveedor (con pendientes abiertos)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_anticipos_proveedor_conciliacion(p_org integer, p_supplier integer default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anticipos jsonb;
  v_proveedores jsonb;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);
  with cruces as (select * from public.fn_anticipo_cruces_consignacion(p_org, p_supplier)),
  base as (
    select a.id, a.supplier_id, s.name as proveedor, coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')) as nit,
           a.account_code as cuenta, a.status, a.naturaleza, a.created_at, g.receipt_number as recibo,
           a.amount as valor, a.retencion_total as retencion, coalesce(a.monto_girado, a.amount) as girado,
           coalesce(app.consumo, 0) as aplicado, coalesce(app.descontado, 0) as retencion_descontada, coalesce(ref.monto, 0) as devuelto,
           coalesce((select sum(c.monto) from cruces c where c.advance_id = a.id), 0) as cruzado,
           case when a.status = 'cancelled' then a.amount else 0 end as anulado,
           case when a.status = 'cancelled' then 0 else a.balance end as saldo,
           coalesce(lib.saldo, 0) as saldo_libros,
           (select count(*) from public.anticipo_pendientes x where x.advance_id = a.id and x.estado = 'abierto') as pendientes_abiertos
      from public.supplier_advances a
      join public.suppliers s on s.id = a.supplier_id
      left join public.payment_groups g on g.id = a.payment_group_id
      left join lateral (select sum(coalesce(x.consumo_anticipo, x.amount)) as consumo, sum(x.retencion_descontada) as descontado
                           from public.supplier_advance_applications x where x.advance_id = a.id) app on true
      left join lateral (select sum(r.monto) as monto from public.supplier_advance_refunds r where r.advance_id = a.id) ref on true
      left join lateral (
        select sum(l.debit - l.credit) as saldo
          from public.journal_entries e join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = p_org and coalesce(e.posted, false) and l.account_code = a.account_code
           and (e.fact_key = 'supplier_advance:' || a.id::text
             or e.fact_key in (select 'supplier_advance_application:' || x.id::text from public.supplier_advance_applications x where x.advance_id = a.id)
             or e.fact_key in (select 'supplier_advance_refund:' || p.id::text from public.payments p where p.source = 'supplier_advance_refund' and p.source_id = a.id::text)
             or e.id in (select c.asiento from cruces c where c.advance_id = a.id and c.asiento is not null)
             or (e.source = 'reversal' and e.source_id in (select e2.id::text from public.journal_entries e2
                                                             where e2.organization_id = p_org and e2.fact_key = 'supplier_advance:' || a.id::text)))) lib on true
     where a.organization_id = p_org and (p_supplier is null or a.supplier_id = p_supplier)
       and (a.branch_id is null or public.app_branch_access(a.branch_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'anticipo_id', b.id, 'proveedor_id', b.supplier_id, 'proveedor', b.proveedor, 'nit', b.nit, 'cuenta', b.cuenta,
           'estado', b.status, 'naturaleza', b.naturaleza, 'fecha', b.created_at, 'recibo', b.recibo,
           'valor', b.valor, 'retencion', b.retencion, 'girado', b.girado, 'aplicado', b.aplicado,
           'retencion_descontada', b.retencion_descontada, 'devuelto', b.devuelto, 'anulado', b.anulado, 'cruzado', b.cruzado,
           'saldo', b.saldo, 'saldo_libros', b.saldo_libros, 'diferencia', b.saldo_libros - b.saldo, 'pendientes_abiertos', b.pendientes_abiertos,
           'cuadra', b.valor - b.aplicado - b.cruzado - b.devuelto - b.anulado = b.saldo and b.saldo_libros = b.saldo)
           order by b.proveedor, b.created_at), '[]'::jsonb),
         coalesce((
           select jsonb_agg(p order by p ->> 'proveedor')
             from (
               select jsonb_build_object(
                        'proveedor_id', b2.supplier_id, 'proveedor', min(b2.proveedor), 'nit', min(b2.nit),
                        'anticipos', count(*), 'valor', sum(b2.valor), 'retencion', sum(b2.retencion),
                        'aplicado', sum(b2.aplicado), 'cruzado', sum(b2.cruzado), 'devuelto', sum(b2.devuelto), 'anulado', sum(b2.anulado),
                        'saldo', sum(b2.saldo), 'saldo_libros', sum(b2.saldo_libros), 'pendientes_abiertos', sum(b2.pendientes_abiertos),
                        'auxiliar_nit', coalesce((
                          select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                           where e.organization_id = p_org and coalesce(e.posted, false) and l.tercero_nit = min(b2.nit)
                             and l.account_code in (select distinct b3.cuenta from base b3)), 0)) as p
                 from base b2 group by b2.supplier_id
             ) q), '[]'::jsonb)
    into v_anticipos, v_proveedores
    from base b;
  return jsonb_build_object('anticipos', v_anticipos, 'proveedores', v_proveedores);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 14. Certificados y reporte de retenciones: incluyen anticipos y sus ajustes
-- ═════════════════════════════════════════════════════════════════════════════

-- Igual que antes (retenciones de facturas de compra) + retenciones practicadas en anticipos (en la fecha del anticipo) +
-- ajustes con signo (devolución identificada, anulación por error, corrección de retención repetida en la factura) en su
-- fecha. La factura vinculada retiene solo la base restante, así que nada se cuenta dos veces.
create or replace function public.fn_retenciones_practicadas_filas(p_organization_id integer, p_desde timestamp with time zone,
  p_hasta timestamp with time zone, p_branch_id integer, p_supplier_id integer)
 returns table(invoice_id uuid, numero text, emision timestamp with time zone, supplier_id integer, branch_id integer, concepto text, codigo text,
               clase text, cuenta text, base numeric, tarifa numeric, valor numeric)
 language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select i.id,
         coalesce(nullif(btrim(i.number_ext), ''), i.id::text)::text,
         i.issue_date::timestamptz,
         i.supplier_id::integer,
         i.branch_id::integer,
         w.concept::text,
         w.tax_code::text,
         public.fn_clase_retencion(w.tax_code, w.concept),
         coalesce(
           (select jl.account_code
              from journal_entries e
              join journal_lines jl on jl.journal_entry_id = e.id
             where e.organization_id = i.organization_id
               and e.source = 'invoice_purchase'
               and e.source_id = i.id::text
               and e.memo like 'Compra %'
               and jl.description = w.concept || ' - ' || e.memo
               and jl.credit = w.amount
             order by jl.id
             limit 1),
           public.fn_cuenta_retencion_compra(i.organization_id, w.tax_code, w.concept)
         )::text,
         w.base::numeric,
         w.rate::numeric,
         w.amount::numeric
    from invoice_purchase_withholdings w
    join invoice_purchase i on i.id = w.invoice_id and i.organization_id = w.organization_id
   where w.organization_id = p_organization_id
     and w.amount > 0
     and i.status not in ('draft', 'void', 'cancelled')
     and i.issue_date >= p_desde
     and i.issue_date <= p_hasta
     and (p_branch_id is null or i.branch_id = p_branch_id)
     and (p_supplier_id is null or i.supplier_id = p_supplier_id)
  union all
  select a.id, ('Anticipo ' || coalesce(g.receipt_number, ''))::text, a.created_at, a.supplier_id::integer, a.branch_id::integer,
         w.concepto, w.tax_code, w.clase, w.cuenta, w.base::numeric, w.tarifa::numeric, w.valor::numeric
    from public.supplier_advance_withholdings w
    join public.supplier_advances a on a.id = w.advance_id
    left join public.payment_groups g on g.id = a.payment_group_id
   where w.organization_id = p_organization_id
     and a.created_at >= p_desde and a.created_at <= p_hasta
     and (p_branch_id is null or a.branch_id = p_branch_id)
     and (p_supplier_id is null or a.supplier_id = p_supplier_id)
  union all
  select coalesce(j.invoice_id, j.advance_id),
         ((case j.tipo when 'devolucion' then 'Ajuste por devolución del anticipo ' when 'anulacion_error' then 'Ajuste por anulación del anticipo '
                       else 'Corrección de retención repetida · ' end) || coalesce(nullif(ip.number_ext, ''), g.receipt_number, ''))::text,
         j.fecha, a.supplier_id::integer, a.branch_id::integer, j.concepto, j.tax_code, j.clase, j.cuenta, j.base::numeric, j.tarifa::numeric, j.valor::numeric
    from public.supplier_advance_withholding_ajustes j
    join public.supplier_advances a on a.id = j.advance_id
    left join public.payment_groups g on g.id = a.payment_group_id
    left join public.invoice_purchase ip on ip.id = j.invoice_id
   where j.organization_id = p_organization_id
     and j.fecha >= p_desde and j.fecha <= p_hasta
     and (p_branch_id is null or a.branch_id = p_branch_id)
     and (p_supplier_id is null or a.supplier_id = p_supplier_id);
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 15. Arqueo: el anticipo en efectivo es un egreso por anticipo, no una venta negativa
-- ═════════════════════════════════════════════════════════════════════════════

-- Igual que antes; los pagos supplier_advance (salen) y supplier_advance_refund (entran) salen de «ventas» y del desglose por
-- método y van a dos renglones propios. El efectivo esperado no cambia.
create or replace function public.pos_caja__esperado_calculo(p_session_id integer)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_anticipos_egreso numeric := 0;
  v_anticipos_devolucion numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable', 'supplier_advance', 'supplier_advance_refund', 'supplier_advance_withholding_refund')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable', 'supplier_advance', 'supplier_advance_refund', 'supplier_advance_withholding_refund')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(-sum(monto) filter (where metodo = 'cash' and origen in ('supplier_advance', 'supplier_advance_withholding_refund')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'supplier_advance_refund'), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable', 'supplier_advance', 'supplier_advance_refund',
                                                          'supplier_advance_withholding_refund')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_anticipos_egreso, v_anticipos_devolucion, v_por_metodo
    from p;

  -- Devoluciones heredadas (anteriores a procesar_devolucion): se restan como
  -- antes. Las nuevas en efectivo ya son una salida en cash_movements y las de
  -- saldo a favor no sacan efectivo.
  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_anticipos_egreso + v_anticipos_devolucion
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'anticipos_proveedor_egreso', v_anticipos_egreso,
      'anticipos_proveedor_devolucion', v_anticipos_devolucion,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 15b. Tercero de las líneas: reintegro de retención en exceso y cruce con consignación
-- ═════════════════════════════════════════════════════════════════════════════

-- Igual que 20261108120000 + dos orígenes: 'supplier_advance_withholding_refund' (el pago del reintegro apunta al
-- anticipo) y 'consignment_advance_crossing' (el cruce de 20261108121000 apunta al anticipo). Sin ellos, el asiento del
-- cruce queda sin NIT y el auxiliar por tercero del anticipo no concilia con los libros. La tabla del cruce se lee solo
-- si existe (to_regclass), así que esta migración no depende de que 121000 esté aplicada.
create or replace function public.fn_tercero_anticipo_proveedor(p_source text, p_source_id text, out nit text, out nombre text)
 returns record
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anticipo uuid;
begin
  nit := null;
  nombre := null;
  if p_source_id is null or p_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if p_source = 'supplier_advance' then
    v_anticipo := p_source_id::uuid;
  elsif p_source = 'supplier_advance_application' then
    select a.advance_id into v_anticipo from public.supplier_advance_applications a where a.id = p_source_id::uuid;
  elsif p_source in ('supplier_advance_refund', 'supplier_advance_withholding_refund') then
    select nullif(p.source_id, '')::uuid into v_anticipo from public.payments p
     where p.id = p_source_id::uuid and p.source = p_source;
  elsif p_source = 'consignment_advance_crossing' and to_regclass('public.consignment_advance_crossings') is not null then
    execute 'select c.advance_id from public.consignment_advance_crossings c where c.id = $1' into v_anticipo using p_source_id::uuid;
  end if;
  if v_anticipo is null then
    return;
  end if;
  select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')), nullif(btrim(s.name), '')
    into nit, nombre
    from public.supplier_advances a
    join public.suppliers s on s.id = a.supplier_id
   where a.id = v_anticipo;
end;
$function$;

revoke all on function public.fn_tercero_anticipo_proveedor(text, text) from public, anon;

-- Igual que 20261108120000 + los dos orígenes de arriba.
create or replace function public.fn_trg_tercero_linea_asiento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                                          'supplier_advance_withholding_refund', 'consignment_advance_crossing') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                     'supplier_advance_withholding_refund', 'consignment_advance_crossing') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16. Permisos de ejecución
-- ═════════════════════════════════════════════════════════════════════════════

revoke all on function public.fn_cuenta_anticipo_motivo_invalida(integer, text) from public, anon, authenticated;
revoke all on function public.fn_anticipo_retencion_practicar(integer, text, uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_anticipo_proveedor_asiento(integer, integer, timestamptz, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_cxp_cuenta_reconocida(integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_anticipo_pendiente_abrir(integer, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_anticipo_proveedor_aplicar_int(uuid, uuid, numeric, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_trg_factura_compra_retencion_anticipo() from public, anon, authenticated;
revoke all on function public.fn_anticipo_cruces_consignacion(integer, integer) from public, anon, authenticated;

revoke all on function public.fn_cuenta_anticipo_proveedor_estado(integer, integer) from public, anon;
revoke all on function public.fn_cuenta_anticipo_proveedor(integer, integer) from public, anon;
revoke all on function public.fn_anticipo_cuenta_equivalencia_aprobar(integer, text, text) from public, anon;
revoke all on function public.fn_proveedor_calidad_tributaria_guardar(integer, integer, text, text, text[], date, date, date, text, text, date, text) from public, anon;
revoke all on function public.fn_reteiva_aiu_regla_guardar(integer, text, date, date, text) from public, anon;
revoke all on function public.fn_anticipo_retencion_exceso_reintegrar(uuid, text, numeric, numeric, text, text, jsonb, text, boolean, text, integer, integer, text) from public, anon;
revoke all on function public.fn_reteica_regla_guardar(integer, uuid, text, numeric, text, date, date, numeric) from public, anon;
revoke all on function public.fn_anticipo_pendiente_resolver(uuid, text, text, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text, jsonb, boolean) from public, anon;
revoke all on function public.fn_anticipo_proveedor_vincular_factura(uuid, uuid, numeric, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_desvincular_factura(uuid, uuid, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_aplicar_corrigiendo(uuid, uuid, numeric, text, text, text, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text, jsonb) from public, anon;
revoke all on function public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer) from public, anon;
revoke all on function public.fn_anticipos_proveedor_conciliacion(integer, integer) from public, anon;

grant execute on function public.fn_cuenta_anticipo_proveedor_estado(integer, integer) to authenticated;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to authenticated;
grant execute on function public.fn_anticipo_cuenta_equivalencia_aprobar(integer, text, text) to authenticated;
grant execute on function public.fn_proveedor_calidad_tributaria_guardar(integer, integer, text, text, text[], date, date, date, text, text, date, text) to authenticated;
grant execute on function public.fn_reteiva_aiu_regla_guardar(integer, text, date, date, text) to authenticated;
grant execute on function public.fn_anticipo_retencion_exceso_reintegrar(uuid, text, numeric, numeric, text, text, jsonb, text, boolean, text, integer, integer, text) to authenticated;
grant execute on function public.fn_reteica_regla_guardar(integer, uuid, text, numeric, text, date, date, numeric) to authenticated;
grant execute on function public.fn_anticipo_pendiente_resolver(uuid, text, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text, jsonb, boolean) to authenticated;
grant execute on function public.fn_anticipo_proveedor_vincular_factura(uuid, uuid, numeric, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_desvincular_factura(uuid, uuid, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_aplicar_corrigiendo(uuid, uuid, numeric, text, text, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text, jsonb) to authenticated;
grant execute on function public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer) to authenticated;
grant execute on function public.fn_anticipos_proveedor_conciliacion(integer, integer) to authenticated;
