-- Anticipos a proveedores · correcciones del Contador (P1, P6 y P7 de
-- docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md y sus «Condiciones … Anticipos»).
--
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- ORDEN: después de 20261108140500 → 20261108160000 → 20261108160500 (perfil con renta e IVA separados). Lee las
-- columnas nuevas del perfil (agente_retencion_iva, gran_contribuyente, regimen_renta, condicion_iva,
-- requiere_revision) por to_jsonb, con respaldo a los códigos de responsabilidades si están en NULL, así que no
-- falla si se aplicara antes, pero el criterio del Contador (P5) solo se cumple con 160500 aplicada.
-- Reversión: supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql
-- Explicación para el Contador: docs/contador/ANTICIPOS-CORRECCIONES-P1-P6-P7.md
-- Pruebas en seco (begin … rollback, org 374): docs/contador/pruebas/11_anticipos_correcciones_contador.sql
--
-- La migración 20261108120000_anticipos_proveedores.sql YA está aplicada y no se edita: aquí se reemplazan
-- sus funciones (mismo contrato cuando se puede) y se añaden columnas y tablas. Hoy hay 0 anticipos y
-- 0 aplicaciones en la base (verificado por el MCP el 2026-11-07): ningún saldo existente cambia.
--
-- Qué corrige:
--   P6 cuenta  Nunca 1330 ni de respaldo. Solo la cuenta configurada con la clave «anticipos_proveedores»,
--              que debe existir, estar bajo 1330, tener más de seis dígitos y ser de detalle (sin hijas).
--              Sin ella, crear se BLOQUEA (cuenta_anticipos_no_configurada / cuenta_anticipos_no_detalle)
--              y la pantalla lo muestra como pendiente contable, con 13300501 como sugerencia si existe.
--              No se crean cuentas.
--   P6 aplicar Debita la cuenta por pagar del asiento de causación de ESA factura (la línea crédito del
--              proveedor), no la de la regla vigente. Cada aplicación guarda anticipo, CxP, cuenta y asiento
--              de causación. Conciliación por proveedor y por anticipo: fn_anticipos_proveedor_conciliacion.
--   P1 retenc. El anticipo nace con su NATURALEZA obligatoria (financiación · pago anticipado del precio).
--              Renta, reteIVA y reteICA se evalúan con el perfil tributario vigente de la organización, los
--              datos fiscales del proveedor y las retenciones configuradas (organization_taxes, fiscal_uvt,
--              fn_cuenta_retencion_compra: las mismas de las compras). Sin regla o sin norma municipal de ICA
--              queda «pendiente» (visible), nunca 0 ni una tarifa fija. La retención practicada se guarda por
--              anticipo (base y valor) y al aplicar a una factura que ya retuvo sobre esa base se descuenta.
--   P7 anular  Solo si se declara que el desembolso NO ocurrió (motivo, soporte y fecha del ajuste, en un
--              periodo abierto): fn_anticipo_proveedor_anular_por_error. La función vieja de anular queda
--              cerrada (anulacion_requiere_declaracion). Si el dinero salió, se registra la devolución real
--              (con soporte obligatorio) o se mantiene el derecho.
--   Estado     Creación, aplicación, devolución y anulación entran al estado de cuenta del proveedor
--              (fn_estado_cuenta_proveedor_movs); la historia de la CxP lee supplier_advance_applications.
--
-- Asientos (cuentas reales, sin remapeo; idempotentes por fact_key; publicados en periodo abierto):
--   crear     D anticipo (bruto)                 C caja/banco (girado) · C retenciones practicadas
--   aplicar   D CxP reconocida (aplicado − rete. ya practicada) · D retención de la factura (lo repetido)
--             C anticipo (aplicado)
--   devolver  D caja/banco (lo que entra) · D retención proporcional revertida   C anticipo (bruto devuelto)
--   anular    contra-asiento completo del de crear, con la fecha del ajuste documentado
--
-- Aditiva: columnas NULL-ables o con DEFAULT en tablas sin filas, tres tablas nuevas, funciones nuevas y
-- reemplazos de funciones. Escritura SOLO por las RPC (SECURITY DEFINER, guarda de organización, sucursal y
-- permiso); lectura por RLS de pertenencia; nada para anon.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas y tablas
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.supplier_advances
  add column if not exists naturaleza text,
  add column if not exists tarifa_iva numeric(5,2),
  add column if not exists base_retencion numeric(16,2),
  add column if not exists retencion_total numeric(16,2) not null default 0,
  add column if not exists monto_girado numeric(16,2),
  add column if not exists retencion_pendiente boolean not null default false,
  add column if not exists retenciones_evaluacion jsonb,
  add column if not exists anulacion_tipo text,
  add column if not exists anulacion_soporte text,
  add column if not exists anulacion_fecha date;

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
  'P1 del Contador: financiacion (anticipo verdadero de financiación) o pago_anticipado_precio. Obligatoria al crear desde 20261108170000.';
comment on column public.supplier_advances.amount is
  'Valor bruto del anticipo: lo que queda a favor frente al proveedor (girado + retenciones practicadas).';
comment on column public.supplier_advances.monto_girado is
  'Lo que salió de caja o banco: amount − retencion_total.';
comment on column public.supplier_advances.retencion_pendiente is
  'true si alguna retención quedó sin evaluar por falta de regla, perfil, datos del proveedor o norma municipal de ICA.';

alter table public.supplier_advance_applications
  add column if not exists consumo_anticipo numeric(16,2),
  add column if not exists retencion_descontada numeric(16,2) not null default 0,
  add column if not exists retencion_detalle jsonb,
  add column if not exists cuenta_por_pagar text,
  add column if not exists asiento_causacion integer,
  add column if not exists asiento_id integer;

comment on column public.supplier_advance_applications.amount is
  'Lo que baja la cuenta por pagar (regla única de saldo de compras): consumo_anticipo − retencion_descontada.';
comment on column public.supplier_advance_applications.consumo_anticipo is
  'Lo que baja el anticipo. NULL en filas anteriores a 20261108170000 (= amount).';
comment on column public.supplier_advance_applications.cuenta_por_pagar is
  'Cuenta debitada: la línea crédito del proveedor en el asiento de causación de la factura (asiento_causacion).';

create table if not exists public.supplier_advance_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  clase text not null check (clase in ('retefuente', 'reteiva', 'reteica')),
  organization_tax_id uuid references public.organization_taxes(id),
  concepto text not null,
  tax_code text,
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
  'Retención practicada al girar un anticipo a proveedor (base y valor por clase). Al aplicar no se repite sobre la misma base; al devolver se revierte la parte proporcional. Escritura solo por fn_anticipo_proveedor_*.';

create index if not exists idx_supplier_advance_withholdings_advance on public.supplier_advance_withholdings (advance_id);

create table if not exists public.supplier_advance_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  payment_id uuid not null references public.payments(id),
  monto numeric(16,2) not null check (monto > 0),
  dinero numeric(16,2) not null check (dinero > 0),
  retencion_revertida numeric(16,2) not null default 0 check (retencion_revertida >= 0),
  retencion_detalle jsonb,
  soporte text not null,
  motivo text not null,
  asiento_id integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint supplier_advance_refunds_cuadre check (monto = dinero + retencion_revertida),
  constraint supplier_advance_refunds_pago unique (payment_id)
);

comment on table public.supplier_advance_refunds is
  'Devolución real de un anticipo a proveedor (dinero que regresa con su soporte). monto = lo que baja el anticipo; dinero = lo que entra a caja o banco.';

create index if not exists idx_supplier_advance_refunds_advance on public.supplier_advance_refunds (advance_id);

alter table public.supplier_advance_withholdings enable row level security;
alter table public.supplier_advance_refunds enable row level security;

drop policy if exists supplier_advance_withholdings_select_miembros on public.supplier_advance_withholdings;
create policy supplier_advance_withholdings_select_miembros
  on public.supplier_advance_withholdings for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

drop policy if exists supplier_advance_refunds_select_miembros on public.supplier_advance_refunds;
create policy supplier_advance_refunds_select_miembros
  on public.supplier_advance_refunds for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

revoke all on public.supplier_advance_withholdings from anon;
revoke all on public.supplier_advance_refunds from anon;
revoke insert, update, delete, truncate, references, trigger on public.supplier_advance_withholdings from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.supplier_advance_refunds from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. P6 · Cuenta del anticipo: solo la de detalle configurada
-- ─────────────────────────────────────────────────────────────────────────────

-- La clave «anticipos_proveedores» no existía en la lista cerrada de configuracion_contable (verificado en
-- la prueba en seco del 2026-11-07: el INSERT fallaba con configuracion_contable_clave_chk), así que la
-- cuenta nunca se podía configurar y todo caía al respaldo 1330. Se añade la clave; las 32 de antes siguen.
alter table public.configuracion_contable drop constraint if exists configuracion_contable_clave_chk;
alter table public.configuracion_contable add constraint configuracion_contable_clave_chk check (clave = any (array[
  'caja', 'bancos', 'clientes', 'proveedores', 'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
  'costo_ventas', 'inventario', 'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica', 'propinas',
  'comisiones', 'anticipos', 'nomina', 'nomina_por_pagar', 'nomina_aportes', 'faltante_inventario',
  'gastos_extraordinarios', 'consumo_interno', 'manifiesto_por_pagar', 'manifiesto_transporte', 'saldo_inicial',
  'impuesto_consumo', 'redondeo', 'compra_servicio', 'ingresos_diversos', 'redondeo_en_contra',
  'anticipos_proveedores']::text[]));

-- Motivo por el que una cuenta NO sirve para anticipos a proveedores (null = sirve).
create or replace function public.fn_cuenta_anticipo_motivo_invalida(p_org integer, p_cuenta text)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when nullif(btrim(coalesce(p_cuenta, '')), '') is null then 'sin_configurar'
    when not exists (select 1 from public.chart_of_accounts c
                      where c.organization_id = p_org and c.account_code = p_cuenta and coalesce(c.is_active, true)) then 'no_existe'
    when left(p_cuenta, 4) <> '1330' then 'fuera_de_1330'
    -- 1330 y 133005 son títulos en el PUC de GO Admin; un auxiliar de detalle tiene más de seis dígitos.
    when length(p_cuenta) <= 6 then 'no_es_detalle'
    when exists (select 1 from public.chart_of_accounts c
                  where c.organization_id = p_org and c.account_code = p_cuenta and c.es_movimiento is false) then 'no_es_detalle'
    when public.fn_es_cuenta_de_titulo(p_org, p_cuenta) then 'no_es_detalle'
    else null
  end;
$function$;

-- Estado de la cuenta para la pantalla y las RPC: {estado, cuenta, configurada, sugerida}.
-- estado: ok · sin_configurar · no_existe · fuera_de_1330 · no_es_detalle. Lee la configuración contable
-- de la sede (o de la empresa); NO usa la propuesta del sector ni un respaldo.
create or replace function public.fn_cuenta_anticipo_proveedor_estado(p_org integer, p_branch integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cfg text;
  v_motivo text;
  v_sugerida text;
begin
  perform public.fn_assert_acceso_org(p_org);
  select nullif(btrim(c.account_code), '') into v_cfg
    from public.configuracion_contable c
   where c.organization_id = p_org and c.clave = 'anticipos_proveedores'
     and (c.branch_id = p_branch or c.branch_id is null)
     and nullif(btrim(c.account_code), '') is not null
   order by c.branch_id nulls last
   limit 1;
  -- Sugerencia de producto (Contador, P6): 13300501 bajo 133005, solo si ya existe y es de detalle.
  if public.fn_cuenta_anticipo_motivo_invalida(p_org, '13300501') is null then
    v_sugerida := '13300501';
  end if;
  v_motivo := public.fn_cuenta_anticipo_motivo_invalida(p_org, v_cfg);
  return jsonb_build_object(
    'estado', coalesce(v_motivo, 'ok'),
    'cuenta', case when v_motivo is null then v_cfg end,
    'configurada', v_cfg,
    'sugerida', v_sugerida);
end;
$function$;

-- Mismo contrato que antes (texto), sin respaldo: null si no hay cuenta de detalle válida.
create or replace function public.fn_cuenta_anticipo_proveedor(p_org integer, p_branch integer)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_cuenta_anticipo_proveedor_estado(p_org, p_branch) ->> 'cuenta';
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. P1 · Evaluación de retenciones del anticipo
-- ─────────────────────────────────────────────────────────────────────────────

-- Una retención configurada aplicada a una base: valor redondeado al peso y la cuenta de las compras.
create or replace function public.fn_anticipo_retencion_practicar(p_org integer, p_clase text, p_tax uuid, p_base numeric)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_t record;
  v_valor numeric;
  v_cuenta text;
  v_fila jsonb;
begin
  select ot.id, ot.name, ot.rate, ot.kind, coalesce(ot.is_active, false) as activo, tt.code,
         public.fn_clase_retencion(tt.code, ot.name) as clase
    into v_t
    from public.organization_taxes ot
    left join public.tax_templates tt on tt.id = ot.template_id
   where ot.id = p_tax and ot.organization_id = p_org;
  if not found or v_t.kind <> 'withholding' or not v_t.activo or v_t.clase <> p_clase then
    raise exception 'concepto_retencion_invalido' using errcode = '22023',
      detail = jsonb_build_object('clase', p_clase, 'id', p_tax)::text;
  end if;
  v_valor := round(coalesce(p_base, 0) * coalesce(v_t.rate, 0) / 100, 0);
  v_cuenta := public.fn_cuenta_retencion_compra(p_org, v_t.code, v_t.name);
  v_fila := jsonb_build_object('clase', p_clase, 'organization_tax_id', v_t.id, 'concepto', v_t.name,
                               'tax_code', v_t.code, 'tarifa', v_t.rate, 'base', round(p_base, 2), 'valor', v_valor,
                               'cuenta', v_cuenta);
  if v_valor <= 0 then
    return v_fila || jsonb_build_object('estado', 'no_aplica', 'motivo', 'valor_cero');
  end if;
  if not exists (select 1 from public.chart_of_accounts c
                  where c.organization_id = p_org and c.account_code = v_cuenta
                    and coalesce(c.is_active, true) and c.es_movimiento is not false)
     or public.fn_es_cuenta_de_titulo(p_org, v_cuenta) then
    return v_fila || jsonb_build_object('estado', 'pendiente', 'motivo', 'cuenta_retencion_no_valida');
  end if;
  return v_fila || jsonb_build_object('estado', 'practicar', 'motivo', null);
end;
$function$;

-- Evalúa renta (retefuente), reteIVA y reteICA de un anticipo SIN escribir nada. La usan la vista previa del
-- diálogo y fn_anticipo_proveedor_registrar. Reglas (para confirmar con el Contador, ver el documento):
--   financiación      → las tres «no_aplica»: se practican al causar con la factura.
--   pago anticipado   → base sin IVA = monto / (1 + tarifa IVA de la operación); IVA = monto − base.
--     sin perfil tributario vigente o vigencia «requiere_revision» → las tres «pendiente»
--     Perfil (20261108160500): agente_retencion (renta), agente_retencion_iva y gran_contribuyente propios; si estos
--     dos están en NULL se usan los códigos O-13/O-23 de responsabilidades. El campo combinado «regimen» no se lee.
--     retefuente: org no agente · proveedor autorretenedor (O-15) · proveedor SIMPLE (O-47) → «no_aplica»;
--                 proveedor sin datos fiscales · sin retención configurada · sin UVT del año → «pendiente»;
--                 sin concepto elegido habiendo conceptos → «pendiente/concepto_sin_elegir» (crear lo exige);
--                 base < base mínima en UVT del concepto → «no_aplica»; si no, la tarifa del concepto.
--     reteIVA:    operación sin IVA · org no agente de reteIVA (ni gran contribuyente) · proveedor no responsable (O-49) · ambos O-13
--                 → «no_aplica»; proveedor sin O-48 conocido · sin reteIVA configurada → «pendiente»;
--                 si no, tarifa configurada sobre el IVA del anticipo.
--     reteICA:    sin reteICA configurada → «pendiente» (sin regla municipal); sin concepto elegido →
--                 «pendiente» (norma municipal sin confirmar); con concepto → su tarifa sobre la base.
create or replace function public.fn_anticipo_proveedor_evaluar_retenciones(
  p_org integer,
  p_supplier integer,
  p_naturaleza text,
  p_monto numeric,
  p_tarifa_iva numeric default null,
  p_retefuente uuid default null,
  p_reteica uuid default null
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_prov public.suppliers%rowtype;
  -- jsonb y no %rowtype: lee las columnas de 20261108160500 (renta/IVA separados) si existen, sin depender de ellas.
  v_perfil jsonb;
  v_agente_renta boolean;
  v_agente_iva boolean;
  v_gc_org boolean;
  v_hoy date;
  v_pais text;
  v_uvt numeric;
  v_resp_prov text[];
  v_reg_prov text;
  v_resp_org text[];
  v_base numeric;
  v_iva numeric;
  v_fuente jsonb;
  v_reteiva jsonb;
  v_ica jsonb;
  v_t record;
  v_op_fuente jsonb;
  v_op_ica jsonb;
  v_reteiva_id uuid;
  v_min numeric;
  v_clases jsonb;
  v_total numeric;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_naturaleza is null or p_naturaleza not in ('financiacion', 'pago_anticipado_precio') then
    raise exception 'naturaleza_obligatoria' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  select * into v_prov from public.suppliers s where s.id = p_supplier and s.organization_id = p_org;
  if not found then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;

  v_hoy := (now() at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'))::date;
  select to_jsonb(p) into v_perfil from public.organization_tax_profiles p
   where p.organization_id = p_org and p.vigente_desde <= v_hoy and (p.vigente_hasta is null or p.vigente_hasta >= v_hoy)
   order by p.vigente_desde desc limit 1;
  v_resp_org := coalesce(array(select jsonb_array_elements_text(coalesce(v_perfil -> 'responsabilidades', '[]'::jsonb))), '{}'::text[]);
  v_agente_renta := coalesce((v_perfil ->> 'agente_retencion')::boolean, false);
  -- Columnas propias (20261108160500) primero; los códigos del documento electrónico solo si están en NULL.
  v_gc_org := coalesce((v_perfil ->> 'gran_contribuyente')::boolean, 'O-13' = any (v_resp_org));
  if v_perfil ->> 'agente_retencion_iva' is null and v_perfil ->> 'gran_contribuyente' is null then
    v_agente_iva := v_resp_org && array['O-13', 'O-23'];
  else
    v_agente_iva := coalesce((v_perfil ->> 'agente_retencion_iva')::boolean, false) or coalesce((v_perfil ->> 'gran_contribuyente')::boolean, false);
  end if;
  v_resp_prov := coalesce(v_prov.fiscal_responsibilities, '{}'::text[]);
  v_reg_prov := lower(coalesce(nullif(btrim(v_prov.tax_regime), ''), ''));

  select coalesce(jsonb_agg(jsonb_build_object('id', ot.id, 'nombre', ot.name, 'tarifa', ot.rate, 'codigo', tt.code,
                                               'base_minima_uvt', ot.min_base_uvt) order by ot.name), '[]'::jsonb)
    into v_op_fuente
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false)
     and public.fn_clase_retencion(tt.code, ot.name) = 'retefuente';
  select coalesce(jsonb_agg(jsonb_build_object('id', ot.id, 'nombre', ot.name, 'tarifa', ot.rate, 'codigo', tt.code) order by ot.name), '[]'::jsonb)
    into v_op_ica
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false)
     and public.fn_clase_retencion(tt.code, ot.name) = 'reteica';
  select ot.id into v_reteiva_id
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false)
     and public.fn_clase_retencion(tt.code, ot.name) = 'reteiva'
   order by ot.name, ot.id limit 1;

  if p_naturaleza = 'financiacion' then
    v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'financiacion_se_retiene_al_causar');
    v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'financiacion_se_retiene_al_causar');
    v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'no_aplica', 'motivo', 'financiacion_se_retiene_al_causar');
  else
    if p_tarifa_iva is null then
      raise exception 'tarifa_iva_obligatoria' using errcode = '22023';
    end if;
    if p_tarifa_iva < 0 or p_tarifa_iva >= 100 or (p_tarifa_iva <> 0 and not exists (
         select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
          where ot.organization_id = p_org and ot.kind = 'tax' and coalesce(ot.is_active, false)
            and ot.rate = p_tarifa_iva
            and (upper(coalesce(tt.code, '')) like 'IVA%' or upper(ot.name) like '%IVA%'))) then
      raise exception 'tarifa_iva_invalida' using errcode = '22023';
    end if;
    v_base := round(v_monto / (1 + p_tarifa_iva / 100), 2);
    v_iva := v_monto - v_base;

    if v_perfil is null or coalesce((v_perfil ->> 'requiere_revision')::boolean, false) then
      v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', case when v_perfil is null then 'sin_perfil_tributario' else 'perfil_requiere_revision' end);
      v_reteiva := v_fuente || jsonb_build_object('clase', 'reteiva');
      v_ica := v_fuente || jsonb_build_object('clase', 'reteica');
    else
      -- Renta.
      if not v_agente_renta then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'organizacion_no_agente_retencion');
      elsif 'O-15' = any (v_resp_prov) then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'proveedor_autorretenedor');
      elsif 'O-47' = any (v_resp_prov) or v_reg_prov = 'simple' then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'no_aplica', 'motivo', 'proveedor_regimen_simple');
      elsif cardinality(v_resp_prov) = 0 and v_reg_prov = '' then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'proveedor_sin_datos_fiscales');
      elsif jsonb_array_length(v_op_fuente) = 0 then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'sin_regla_retefuente');
      elsif p_retefuente is null then
        v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'concepto_sin_elegir');
      else
        select coalesce(nullif(btrim(o.country_code), ''), 'COL') into v_pais from public.organizations o where o.id = p_org;
        select u.value into v_uvt from public.fiscal_uvt u where u.country_code = v_pais and u.year = extract(year from v_hoy)::integer;
        select ot.min_base_uvt into v_min from public.organization_taxes ot where ot.id = p_retefuente and ot.organization_id = p_org;
        if v_uvt is null then
          v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', 'sin_uvt');
          perform public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, v_base); -- valida el concepto
        elsif v_min is not null and v_base < round(v_min * v_uvt, 0) then
          v_fuente := public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, v_base)
                      || jsonb_build_object('estado', 'no_aplica', 'motivo', 'bajo_base_minima', 'valor', 0,
                                            'base_minima', round(v_min * v_uvt, 0));
        else
          v_fuente := public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, v_base);
        end if;
      end if;

      -- IVA.
      if p_tarifa_iva = 0 then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'operacion_sin_iva');
      elsif not v_agente_iva then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'organizacion_no_agente_reteiva');
      elsif 'O-49' = any (v_resp_prov) or v_reg_prov = 'no_responsable' then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'proveedor_no_responsable_iva');
      elsif not ('O-48' = any (v_resp_prov) or v_reg_prov in ('comun', 'gran_contribuyente')) then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'proveedor_sin_datos_fiscales');
      elsif v_gc_org and ('O-13' = any (v_resp_prov) or v_reg_prov = 'gran_contribuyente') then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'no_aplica', 'motivo', 'ambos_grandes_contribuyentes');
      elsif v_reteiva_id is null then
        v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', 'sin_regla_reteiva');
      else
        v_reteiva := public.fn_anticipo_retencion_practicar(p_org, 'reteiva', v_reteiva_id, v_iva);
      end if;

      -- ICA: la regla municipal es la retención reteICA configurada que el usuario elige.
      if jsonb_array_length(v_op_ica) = 0 then
        v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'sin_regla_reteica_municipal');
      elsif p_reteica is null then
        v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', 'norma_municipal_sin_confirmar');
      else
        v_ica := public.fn_anticipo_retencion_practicar(p_org, 'reteica', p_reteica, v_base);
      end if;
    end if;
  end if;

  -- Un concepto elegido que no corresponde se rechaza aunque la clase no aplique (no se ignora en silencio).
  if p_retefuente is not null and v_fuente ->> 'organization_tax_id' is null then
    perform public.fn_anticipo_retencion_practicar(p_org, 'retefuente', p_retefuente, 0);
  end if;
  if p_reteica is not null and v_ica ->> 'organization_tax_id' is null then
    perform public.fn_anticipo_retencion_practicar(p_org, 'reteica', p_reteica, 0);
  end if;

  v_clases := jsonb_build_array(v_fuente, v_reteiva, v_ica);
  select coalesce(sum((c ->> 'valor')::numeric), 0) into v_total
    from jsonb_array_elements(v_clases) c where c ->> 'estado' = 'practicar';
  if v_total >= v_monto then
    raise exception 'retencion_excede_monto' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'naturaleza', p_naturaleza,
    'monto', v_monto,
    'tarifa_iva', p_tarifa_iva,
    'base', v_base,
    'iva', v_iva,
    'fecha', v_hoy,
    'perfil', case when v_perfil is null then null else jsonb_build_object(
                'vigente_desde', v_perfil ->> 'vigente_desde',
                'regimen_renta', coalesce(v_perfil ->> 'regimen_renta', v_perfil ->> 'regimen'),
                'condicion_iva', v_perfil ->> 'condicion_iva',
                'agente_retencion', v_agente_renta, 'agente_retencion_iva', v_agente_iva, 'gran_contribuyente', v_gc_org,
                'responsabilidades', to_jsonb(v_resp_org)) end,
    'proveedor', jsonb_build_object('regimen', nullif(v_reg_prov, ''), 'responsabilidades', to_jsonb(v_resp_prov)),
    'clases', v_clases,
    'total', v_total,
    'neto', v_monto - v_total,
    'pendiente', exists (select 1 from jsonb_array_elements(v_clases) c where c ->> 'estado' = 'pendiente'),
    'opciones', jsonb_build_object('retefuente', v_op_fuente, 'reteica', v_op_ica));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Asiento de varias líneas con las cuentas exactas (sin remapeo)
-- ─────────────────────────────────────────────────────────────────────────────

-- p_lineas: [{cuenta, debito, credito, descripcion}]. Idempotente por fact_key; exige periodo abierto el día
-- de la organización; cuadre comprobado antes de insertar (y otra vez por el disparador diferido).
create or replace function public.fn_anticipo_proveedor_asiento(
  p_org integer,
  p_branch integer,
  p_fecha timestamptz,
  p_memo text,
  p_source text,
  p_source_id text,
  p_fact_key text,
  p_lineas jsonb,
  p_user uuid
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
  if v_id is not null then
    return v_id;
  end if;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    select b.id into v_branch from public.branches b
     where b.organization_id = p_org and coalesce(b.is_active, true)
     order by b.is_main desc nulls last, b.id limit 1;
  end if;
  v_dia := (p_fecha at time zone coalesce(public.fn_timezone_for(p_org, v_branch), 'America/Bogota'))::date;
  if not public.fn_is_period_open(p_org, v_dia) then
    raise exception 'periodo_cerrado' using errcode = '22023';
  end if;

  select coalesce(sum(round(coalesce((l ->> 'debito')::numeric, 0), 2)), 0),
         coalesce(sum(round(coalesce((l ->> 'credito')::numeric, 0), 2)), 0)
    into v_d, v_c
    from jsonb_array_elements(p_lineas) l;
  if v_d <= 0 or v_d <> v_c then
    raise exception 'asiento_descuadrado' using errcode = 'P0001',
      detail = jsonb_build_object('debitos', v_d, 'creditos', v_c)::text;
  end if;
  select string_agg(l ->> 'cuenta', ', ') into v_falta
    from jsonb_array_elements(p_lineas) l
   where not exists (select 1 from public.chart_of_accounts c
                      where c.organization_id = p_org and c.account_code = l ->> 'cuenta' and coalesce(c.is_active, true)
                        and c.es_movimiento is not false);
  if v_falta is not null then
    raise exception 'cuenta_no_valida' using errcode = 'P0002',
      detail = jsonb_build_object('cuentas', v_falta)::text;
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (p_org, v_branch, p_fecha, p_memo, p_source, p_source_id, true, p_user, p_fact_key)
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    continue when round(coalesce((v_l ->> 'debito')::numeric, 0), 2) = 0 and round(coalesce((v_l ->> 'credito')::numeric, 0), 2) = 0;
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_id, v_l ->> 'cuenta', coalesce(nullif(v_l ->> 'descripcion', ''), p_memo),
            round(coalesce((v_l ->> 'debito')::numeric, 0), 2), round(coalesce((v_l ->> 'credito')::numeric, 0), 2),
            public.fn_centro_para_cuenta(p_org, v_branch, v_l ->> 'cuenta', null, null));
  end loop;
  return v_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. P6 · La cuenta por pagar realmente reconocida
-- ─────────────────────────────────────────────────────────────────────────────

-- La línea crédito del proveedor (22xx/23xx, sin retenciones) en el asiento de causación vigente de la factura
-- de la CxP (fact_key accrual:purchase:<id>, publicado y sin contra-asiento). Prefiere la línea por el neto
-- de la CxP. Sin factura o sin asiento: nulls (la aplicación se bloquea con cxp_sin_causacion).
create or replace function public.fn_cxp_cuenta_reconocida(p_org integer, p_ap uuid, out cuenta text, out asiento integer)
 returns record
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ap public.accounts_payable%rowtype;
begin
  cuenta := null;
  asiento := null;
  select * into v_ap from public.accounts_payable where id = p_ap and organization_id = p_org;
  if not found or v_ap.invoice_id is null then
    return;
  end if;
  select e.id into asiento
    from public.journal_entries e
   where e.organization_id = p_org and e.source = 'invoice_purchase' and e.source_id = v_ap.invoice_id::text
     and coalesce(e.posted, false)
     and not exists (select 1 from public.journal_entries r where r.organization_id = p_org and r.fact_key = 'reversal:' || e.id)
   order by (e.fact_key = 'accrual:purchase:' || v_ap.invoice_id::text) desc, e.id desc
   limit 1;
  if asiento is null then
    return;
  end if;
  select l.account_code into cuenta
    from public.journal_lines l
   where l.journal_entry_id = asiento and coalesce(l.credit, 0) > 0 and coalesce(l.debit, 0) = 0
     and left(l.account_code, 2) in ('22', '23') and left(l.account_code, 4) not in ('2365', '2367', '2368')
   order by (l.credit = v_ap.amount) desc, l.credit desc, l.id
   limit 1;
  if cuenta is null then
    asiento := null;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Registrar (crear) con naturaleza, retenciones y cuenta de detalle
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_registrar(
  p_supplier integer,
  p_branch integer,
  p_monto numeric,
  p_metodo text,
  p_naturaleza text,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_tarifa_iva numeric default null,
  p_retefuente uuid default null,
  p_reteica uuid default null,
  p_cuenta_bancaria integer default null,
  p_referencia text default null,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if p_naturaleza is null or p_naturaleza not in ('financiacion', 'pago_anticipado_precio') then
    raise exception 'naturaleza_obligatoria' using errcode = '22023';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  -- Idempotencia: mismo espacio de claves y candado que fn_registrar_pago.
  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_pago:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_grupo from public.payment_groups
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    select * into v_prev from public.supplier_advances a where a.payment_group_id = v_grupo.id limit 1;
    if coalesce(v_grupo.origin, '') <> 'anticipo_proveedor' or v_prev.id is null or v_prev.amount <> v_monto
       or v_grupo.supplier_id is distinct from p_supplier or v_prev.naturaleza is distinct from p_naturaleza then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'anticipo_id', v_prev.id, 'grupo_id', v_grupo.id, 'recibo', v_grupo.receipt_number, 'repetida', true,
      'caja_id', v_grupo.cash_session_id, 'monto', v_prev.amount, 'girado', v_prev.monto_girado,
      'retencion', v_prev.retencion_total, 'retencion_pendiente', v_prev.retencion_pendiente,
      'evaluacion', v_prev.retenciones_evaluacion);
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = v_org) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (
    select 1 from public.branches b where b.id = p_branch and b.organization_id = v_org and coalesce(b.is_active, true)
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- P6: sin cuenta de detalle configurada no se registra nada.
  v_estado_cuenta := public.fn_cuenta_anticipo_proveedor_estado(v_org, p_branch);
  if v_estado_cuenta ->> 'estado' <> 'ok' then
    if v_estado_cuenta ->> 'estado' = 'sin_configurar' then
      raise exception 'cuenta_anticipos_no_configurada' using errcode = 'P0002', detail = v_estado_cuenta::text,
        hint = 'Configure la clave «anticipos a proveedores» con un auxiliar de detalle bajo 1330 (sugerencia: 13300501 bajo 133005). 1330 es cuenta título.';
    end if;
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002', detail = v_estado_cuenta::text,
      hint = 'La cuenta configurada para anticipos a proveedores no es un auxiliar de detalle bajo 1330.';
  end if;
  v_cuenta_anticipo := v_estado_cuenta ->> 'cuenta';

  -- Método de la organización (nunca «crédito»: no mueve dinero).
  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm
      on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if coalesce(v_requiere_ref, false) and v_ref is null then
    raise exception 'referencia_obligatoria' using errcode = '22023';
  end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, p_branch, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o registre el anticipo con otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;

  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, p_branch, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;
  v_cuenta_dinero := public.fn_puc_cuenta_de_sede(v_org, p_branch, v_cuenta_dinero);

  -- P1: retenciones según naturaleza, operación y partes.
  v_eval := public.fn_anticipo_proveedor_evaluar_retenciones(v_org, p_supplier, p_naturaleza, v_monto, p_tarifa_iva, p_retefuente, p_reteica);
  if exists (select 1 from jsonb_array_elements(v_eval -> 'clases') c where c ->> 'motivo' = 'concepto_sin_elegir') then
    raise exception 'concepto_retefuente_obligatorio' using errcode = '22023',
      hint = 'Elija el concepto de retención en la fuente de la operación.';
  end if;
  v_ret := coalesce((v_eval ->> 'total')::numeric, 0);
  v_girado := v_monto - v_ret;

  v_moneda := upper(public.fn_moneda_base_organizacion(v_org));
  v_recibo := public.fn_recibo_siguiente_numero(v_org, 'CE');

  insert into public.payment_groups (
    organization_id, branch_id, direction, receipt_number, supplier_id, method, currency,
    total_applied, advance_amount, received_amount, change_amount, payment_date, reference,
    bank_account_id, notes, cash_session_id, origin, idempotency_key, created_by
  ) values (
    v_org, p_branch, 'pago', v_recibo, p_supplier, p_metodo, v_moneda,
    0, v_girado, null, 0, now(), v_ref,
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end,
    v_notas, v_caja, 'anticipo_proveedor', p_clave_idempotencia, v_uid
  ) returning * into v_grupo;

  insert into public.supplier_advances (
    organization_id, branch_id, supplier_id, amount, balance, status, currency, account_code,
    payment_group_id, notes, created_by, naturaleza, tarifa_iva, base_retencion, retencion_total,
    monto_girado, retencion_pendiente, retenciones_evaluacion
  ) values (
    v_org, p_branch, p_supplier, v_monto, v_monto, 'active', v_moneda, v_cuenta_anticipo,
    v_grupo.id, coalesce(v_notas, 'Anticipo del comprobante ' || v_recibo), v_uid, p_naturaleza,
    p_tarifa_iva, (v_eval ->> 'base')::numeric, v_ret, v_girado, coalesce((v_eval ->> 'pendiente')::boolean, false), v_eval
  ) returning id into v_anticipo;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_anticipo, 'debito', v_monto, 'credito', 0, 'descripcion', 'Anticipo a proveedor - ' || v_recibo),
    jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', 0, 'credito', v_girado, 'descripcion', 'Anticipo a proveedor - ' || v_recibo));
  for v_c in select * from jsonb_array_elements(v_eval -> 'clases') loop
    continue when v_c ->> 'estado' <> 'practicar';
    insert into public.supplier_advance_withholdings (organization_id, advance_id, clase, organization_tax_id, concepto, tax_code, base, tarifa, valor, cuenta)
    values (v_org, v_anticipo, v_c ->> 'clase', (v_c ->> 'organization_tax_id')::uuid, v_c ->> 'concepto', v_c ->> 'tax_code',
            (v_c ->> 'base')::numeric, (v_c ->> 'tarifa')::numeric, (v_c ->> 'valor')::numeric, v_c ->> 'cuenta');
    v_lineas := v_lineas || jsonb_build_object('cuenta', v_c ->> 'cuenta', 'debito', 0, 'credito', (v_c ->> 'valor')::numeric,
                                               'descripcion', coalesce(v_c ->> 'concepto', v_c ->> 'clase') || ' - anticipo ' || v_recibo);
  end loop;

  v_entry := public.fn_anticipo_proveedor_asiento(v_org, p_branch, now(), 'Anticipo a proveedor - ' || v_recibo,
               'supplier_advance', v_anticipo::text, 'supplier_advance:' || v_anticipo::text, v_lineas, v_uid);

  -- Sale lo girado: importe negativo (lo resta el arqueo, como customer_credit_refund).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, payment_group_id
  ) values (
    v_org, p_branch, 'supplier_advance', v_anticipo::text, p_metodo, -v_girado, v_moneda,
    coalesce(v_ref, v_recibo), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_grupo.id
  ) returning id into v_pago;

  return jsonb_build_object(
    'anticipo_id', v_anticipo, 'grupo_id', v_grupo.id, 'recibo', v_recibo, 'repetida', false,
    'caja_id', v_caja, 'payment_id', v_pago, 'monto', v_monto, 'girado', v_girado, 'retencion', v_ret,
    'retencion_pendiente', coalesce((v_eval ->> 'pendiente')::boolean, false), 'asiento_id', v_entry,
    'cuenta', v_cuenta_anticipo, 'evaluacion', v_eval);
end;
$function$;

-- La firma vieja de crear (sin naturaleza) queda cerrada: la naturaleza es obligatoria (P1).
create or replace function public.fn_anticipo_proveedor_crear(
  p_supplier integer,
  p_branch integer,
  p_monto numeric,
  p_metodo text,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_cuenta_bancaria integer default null,
  p_referencia text default null,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'naturaleza_obligatoria' using errcode = '22023',
    hint = 'Use fn_anticipo_proveedor_registrar: la naturaleza del anticipo es obligatoria.';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Aplicar: D CxP reconocida · C anticipo; sin repetir la retención ya practicada
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_aplicar(
  p_anticipo uuid,
  p_cuenta_por_pagar uuid,
  p_monto numeric,
  p_clave_idempotencia text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
  v_base_ant numeric;
  v_ret_ant numeric;
  v_ref numeric;
  v_prev_cov numeric;
  v_prev_dup numeric;
  v_ov numeric;
  v_dup numeric;
  v_dup_total numeric := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_lineas_ret jsonb := '[]'::jsonb;
  v_reduccion numeric;
  v_entry integer;
  v_memo text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_aplicar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_app from public.supplier_advance_applications
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_app.advance_id <> p_anticipo or v_app.account_payable_id <> p_cuenta_por_pagar
       or coalesce(v_app.consumo_anticipo, v_app.amount) <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'aplicacion_id', v_app.id, 'repetida', true, 'monto', coalesce(v_app.consumo_anticipo, v_app.amount),
      'reduccion_cuenta', v_app.amount, 'retencion_descontada', v_app.retencion_descontada,
      'saldo_disponible', (select balance from public.supplier_advances where id = v_app.advance_id),
      'saldo_cuenta', (select balance from public.accounts_payable where id = v_app.account_payable_id));
  end if;

  -- Primero el anticipo, luego la cuenta (mismo orden en todas las rutas: sin interbloqueos).
  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  if v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ant.balance)::text;
  end if;
  if public.fn_cuenta_anticipo_motivo_invalida(v_org, v_ant.account_code) is not null then
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002',
      detail = jsonb_build_object('cuenta', v_ant.account_code)::text;
  end if;

  select * into v_ap from public.accounts_payable where id = p_cuenta_por_pagar and organization_id = v_org for update;
  if not found then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  if v_ap.status in ('cancelled', 'void') then
    raise exception 'documento_anulado' using errcode = '22023';
  end if;
  if v_ap.invoice_id is not null then
    select * into v_ip from public.invoice_purchase where id = v_ap.invoice_id for update;
    if v_ip.status = 'draft' then
      raise exception 'documento_borrador' using errcode = '22023';
    end if;
    if v_ip.status in ('void', 'voided', 'cancelled') then
      raise exception 'documento_anulado' using errcode = '22023';
    end if;
    if upper(coalesce(v_ip.currency, v_ant.currency)) <> upper(v_ant.currency) then
      raise exception 'moneda_distinta' using errcode = '22023';
    end if;
  end if;
  if v_ap.supplier_id is distinct from v_ant.supplier_id then
    raise exception 'proveedor_distinto' using errcode = '22023';
  end if;
  if coalesce(v_ap.branch_id, v_ip.branch_id) is not null and not public.app_branch_access(coalesce(v_ap.branch_id, v_ip.branch_id)) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- P6: la cuenta por pagar realmente reconocida en la causación de esta factura.
  select * into v_rec from public.fn_cxp_cuenta_reconocida(v_org, v_ap.id);
  if v_rec.cuenta is null then
    raise exception 'cxp_sin_causacion' using errcode = 'P0002',
      hint = 'La cuenta por pagar no tiene un asiento de causación vigente con la línea del proveedor.';
  end if;

  -- P1: retención ya practicada en el anticipo que la factura volvió a practicar sobre la misma base.
  v_ratio := v_monto / v_ant.amount;
  if v_ip.id is not null then
    for v_w in
      select w.clase, sum(w.base) as base, sum(w.valor) as valor
        from public.supplier_advance_withholdings w where w.advance_id = v_ant.id
       group by w.clase order by w.clase
    loop
      select coalesce(sum(x.base), 0), coalesce(sum(x.amount), 0),
             (array_agg(public.fn_cuenta_retencion_compra(v_org, x.tax_code, x.concept) order by x.amount desc, x.id))[1]
        into v_inv_base, v_inv_ret, v_inv_cuenta
        from public.invoice_purchase_withholdings x
       where x.invoice_id = v_ip.id and x.amount > 0 and public.fn_clase_retencion(x.tax_code, x.concept) = v_w.clase;
      v_base_ant := round(v_w.base * v_ratio, 2);
      v_ret_ant := round(v_w.valor * v_ratio, 2);
      v_ref := case when v_w.clase = 'reteiva' then coalesce(v_ip.tax_total, 0) else coalesce(v_ip.subtotal, 0) end;
      select coalesce(sum((d ->> 'base_cubierta')::numeric), 0), coalesce(sum((d ->> 'descontado')::numeric), 0)
        into v_prev_cov, v_prev_dup
        from public.supplier_advance_applications a2
        cross join lateral jsonb_array_elements(coalesce(a2.retencion_detalle, '[]'::jsonb)) d
       where a2.organization_id = v_org and a2.invoice_id = v_ip.id and d ->> 'clase' = v_w.clase;
      -- Base que la factura ya retuvo y que este anticipo también cubre (lo acumulado menos lo de antes).
      v_ov := greatest(0, least(v_prev_cov + v_base_ant, v_inv_base + v_prev_cov + v_base_ant - v_ref))
            - greatest(0, least(v_prev_cov, v_inv_base + v_prev_cov - v_ref));
      v_dup := case when v_inv_base > 0 and v_inv_ret > 0
                    then greatest(0, least(round(v_ov * v_inv_ret / v_inv_base, 0), v_inv_ret - v_prev_dup))
                    else 0 end;
      v_detalle := v_detalle || jsonb_build_object(
        'clase', v_w.clase, 'base_cubierta', v_base_ant, 'retencion_anticipo', v_ret_ant,
        'base_factura', v_inv_base, 'retencion_factura', v_inv_ret, 'base_superpuesta', v_ov,
        'descontado', v_dup, 'cuenta', v_inv_cuenta);
      if v_dup > 0 then
        v_dup_total := v_dup_total + v_dup;
        v_lineas_ret := v_lineas_ret || jsonb_build_object('cuenta', v_inv_cuenta, 'debito', v_dup, 'credito', 0,
          'descripcion', 'Retención ' || v_w.clase || ' ya practicada en el anticipo (no se repite)');
      end if;
    end loop;
  end if;

  v_reduccion := v_monto - v_dup_total;
  if v_reduccion > coalesce(v_ap.balance, 0) then
    raise exception 'monto_excede_saldo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ap.balance, 'retencion_descontada', v_dup_total)::text;
  end if;

  -- El disparador recalcula la cuenta y la factura con la regla única (amount = lo que baja la CxP).
  insert into public.supplier_advance_applications (
    organization_id, advance_id, account_payable_id, invoice_id, amount, idempotency_key, created_by,
    consumo_anticipo, retencion_descontada, retencion_detalle, cuenta_por_pagar, asiento_causacion
  ) values (
    v_org, p_anticipo, v_ap.id, v_ap.invoice_id, v_reduccion, p_clave_idempotencia, v_uid,
    v_monto, v_dup_total, v_detalle, v_rec.cuenta, v_rec.asiento
  ) returning * into v_app;

  update public.supplier_advances
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = p_anticipo;

  v_memo := 'Aplicación de anticipo a proveedor' || coalesce(' - factura ' || nullif(v_ip.number_ext, ''), '');
  v_entry := public.fn_anticipo_proveedor_asiento(
    v_org, coalesce(v_ap.branch_id, v_ip.branch_id, v_ant.branch_id), now(), v_memo,
    'supplier_advance_application', v_app.id::text, 'supplier_advance_application:' || v_app.id::text,
    jsonb_build_array(jsonb_build_object('cuenta', v_rec.cuenta, 'debito', v_reduccion, 'credito', 0, 'descripcion', v_memo))
      || v_lineas_ret
      || jsonb_build_array(jsonb_build_object('cuenta', v_ant.account_code, 'debito', 0, 'credito', v_monto, 'descripcion', v_memo)),
    v_uid);

  update public.supplier_advance_applications set asiento_id = v_entry where id = v_app.id;

  return jsonb_build_object(
    'aplicacion_id', v_app.id, 'repetida', false, 'monto', v_monto, 'reduccion_cuenta', v_reduccion,
    'retencion_descontada', v_dup_total, 'cuenta_por_pagar', v_rec.cuenta, 'asiento_causacion', v_rec.asiento,
    'asiento_id', v_entry,
    'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo),
    'saldo_cuenta', (select balance from public.accounts_payable where id = v_ap.id),
    'estado_cuenta', (select status from public.accounts_payable where id = v_ap.id));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Devolver: dinero que regresa, con soporte; revierte la retención proporcional
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_devolver(
  p_anticipo uuid,
  p_monto numeric,
  p_metodo text,
  p_motivo text,
  p_clave_idempotencia text,
  p_organization_id integer default null,
  p_cuenta_bancaria integer default null,
  p_referencia text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago public.payments%rowtype;
  v_dev public.supplier_advance_refunds%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_entry integer;
  v_w record;
  v_r numeric;
  v_ret numeric := 0;
  v_dinero numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_lineas_ret jsonb := '[]'::jsonb;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  -- P7: una devolución real se registra con su soporte (consignación, recibo, transferencia).
  if v_ref is null or length(v_ref) < 3 then
    raise exception 'soporte_obligatorio' using errcode = '22023';
  end if;

  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.void']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_devolver:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    select * into v_dev from public.supplier_advance_refunds where payment_id = v_pago.id;
    if v_pago.source <> 'supplier_advance_refund' or v_pago.source_id <> p_anticipo::text
       or coalesce(v_dev.monto, v_pago.amount) <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'monto', v_monto,
      'dinero', v_pago.amount, 'retencion_revertida', coalesce(v_dev.retencion_revertida, 0),
      'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo));
  end if;

  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  if v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ant.balance)::text;
  end if;
  if public.fn_cuenta_anticipo_motivo_invalida(v_org, v_ant.account_code) is not null then
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002',
      detail = jsonb_build_object('cuenta', v_ant.account_code)::text;
  end if;

  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm
      on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, v_ant.branch_id, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o reciba el dinero por otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, v_ant.branch_id, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;
  v_cuenta_dinero := public.fn_puc_cuenta_de_sede(v_org, v_ant.branch_id, v_cuenta_dinero);

  -- Retención practicada sobre la parte que se devuelve: se revierte en la proporción del bruto devuelto
  -- (lo que el proveedor no recibió en dinero no lo puede devolver).
  for v_w in
    select * from public.supplier_advance_withholdings w
     where w.advance_id = v_ant.id and w.valor > w.revertido
     order by w.clase
       for update
  loop
    v_r := least(round(v_w.valor * v_monto / v_ant.amount, 0), v_w.valor - v_w.revertido);
    continue when v_r <= 0;
    v_ret := v_ret + v_r;
    v_detalle := v_detalle || jsonb_build_object('clase', v_w.clase, 'cuenta', v_w.cuenta, 'revertido', v_r);
    v_lineas_ret := v_lineas_ret || jsonb_build_object('cuenta', v_w.cuenta, 'debito', v_r, 'credito', 0,
      'descripcion', 'Reversión de retención ' || v_w.clase || ' por devolución del anticipo');
    update public.supplier_advance_withholdings set revertido = revertido + v_r where id = v_w.id;
  end loop;
  v_dinero := v_monto - v_ret;
  if v_dinero <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  -- El dinero entra: importe positivo (suma al arqueo si es efectivo).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, idempotency_key
  ) values (
    v_org, v_ant.branch_id, 'supplier_advance_refund', v_ant.id::text, p_metodo, v_dinero, v_ant.currency,
    v_ref, 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, p_clave_idempotencia
  ) returning * into v_pago;

  v_entry := public.fn_anticipo_proveedor_asiento(
    v_org, v_ant.branch_id, now(), 'Devolución de anticipo a proveedor - ' || v_ref,
    'supplier_advance_refund', v_pago.id::text, 'supplier_advance_refund:' || v_pago.id::text,
    jsonb_build_array(jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', v_dinero, 'credito', 0))
      || v_lineas_ret
      || jsonb_build_array(jsonb_build_object('cuenta', v_ant.account_code, 'debito', 0, 'credito', v_monto)),
    v_uid);

  insert into public.supplier_advance_refunds (organization_id, advance_id, payment_id, monto, dinero, retencion_revertida,
                                               retencion_detalle, soporte, motivo, asiento_id, created_by)
  values (v_org, v_ant.id, v_pago.id, v_monto, v_dinero, v_ret, v_detalle, v_ref, btrim(p_motivo), v_entry, v_uid);

  update public.supplier_advances
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = v_ant.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'devolucion_en_dinero', 'monto', v_monto, 'dinero', v_dinero, 'retencion_revertida', v_ret,
                             'metodo', p_metodo, 'soporte', v_ref, 'payment_id', v_pago.id, 'asiento', v_entry),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_pago.id, 'repetida', false, 'monto', v_monto, 'dinero', v_dinero, 'retencion_revertida', v_ret,
    'asiento_id', v_entry, 'caja_id', v_caja,
    'saldo_disponible', (select balance from public.supplier_advances where id = v_ant.id));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. P7 · Anular solo como corrección de un desembolso que no ocurrió
-- ─────────────────────────────────────────────────────────────────────────────

-- La firma vieja queda cerrada: anular exige declarar que el desembolso no ocurrió, con soporte y fecha.
create or replace function public.fn_anticipo_proveedor_anular(
  p_anticipo uuid,
  p_motivo text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'anulacion_requiere_declaracion' using errcode = '22023',
    hint = 'Use fn_anticipo_proveedor_anular_por_error (el desembolso no ocurrió, con soporte y fecha del ajuste) o registre la devolución.';
end;
$function$;

create or replace function public.fn_anticipo_proveedor_anular_por_error(
  p_anticipo uuid,
  p_motivo text,
  p_soporte text,
  p_fecha_ajuste date default null,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ant public.supplier_advances%rowtype;
  v_pago public.payments%rowtype;
  v_caja record;
  v_tz text;
  v_hoy date;
  v_fecha date;
  v_instante timestamptz;
  v_asiento integer;
  v_reverso integer;
  v_soporte text := nullif(btrim(coalesce(p_soporte, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if v_soporte is null or length(v_soporte) < 3 then
    raise exception 'soporte_obligatorio' using errcode = '22023';
  end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.void']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status = 'cancelled' then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  -- Solo sin usar: con aplicaciones o devoluciones se devuelve el saldo, no se anula.
  if v_ant.balance <> v_ant.amount
     or exists (select 1 from public.supplier_advance_applications a where a.advance_id = v_ant.id)
     or exists (select 1 from public.supplier_advance_refunds r where r.advance_id = v_ant.id) then
    raise exception 'anticipo_usado' using errcode = '22023';
  end if;

  -- Fecha del ajuste documentado: no futura, no anterior al anticipo, en periodo abierto (P7).
  v_tz := coalesce(public.fn_timezone_for(v_ant.organization_id, v_ant.branch_id), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  v_fecha := coalesce(p_fecha_ajuste, v_hoy);
  if v_fecha > v_hoy then
    raise exception 'fecha_ajuste_futura' using errcode = '22023';
  end if;
  if v_fecha < (v_ant.created_at at time zone v_tz)::date then
    raise exception 'fecha_ajuste_anterior_al_anticipo' using errcode = '22023';
  end if;
  if not public.fn_is_period_open(v_ant.organization_id, v_fecha) then
    raise exception 'periodo_cerrado' using errcode = '22023';
  end if;
  v_instante := case when v_fecha = v_hoy then now() else (v_fecha::timestamp + time '12:00') at time zone v_tz end;

  select * into v_pago from public.payments p
   where p.organization_id = v_ant.organization_id and p.source = 'supplier_advance'
     and p.source_id = v_ant.id::text and p.status = 'completed'
   order by p.created_at limit 1
   for update;

  if v_pago.id is not null and v_pago.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_pago.payment_group_id);
    if found and v_caja.status <> 'open' then
      raise exception 'pago_en_caja_cerrada' using errcode = '22023',
        hint = 'El anticipo salió de una caja ya cerrada: si el dinero regresó, registre la devolución.';
    end if;
  end if;

  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_ant.organization_id
     and je.fact_key = 'supplier_advance:' || v_ant.id::text
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is null then
    raise exception 'asiento_no_encontrado' using errcode = 'P0002';
  end if;
  v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_pago', 'anticipo-proveedor:' || v_ant.id::text, v_instante, v_uid);
  if v_reverso is null then
    raise exception 'contra_asiento_no_creado' using errcode = 'P0001',
      hint = 'El asiento del anticipo tiene líneas que hoy no se pueden revertir (cuenta de título o sin cuenta).';
  end if;

  if v_pago.id is not null then
    update public.payments
       set status = 'void', voided_at = now(), voided_by = v_uid,
           void_reason = btrim(p_motivo), updated_at = now()
     where id = v_pago.id;
  end if;
  if v_ant.payment_group_id is not null then
    update public.payment_groups set status = 'void' where id = v_ant.payment_group_id;
  end if;
  -- El contra-asiento completo también revierte las retenciones practicadas.
  update public.supplier_advance_withholdings set revertido = valor where advance_id = v_ant.id;

  update public.supplier_advances
     set status = 'cancelled', balance = 0, cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = btrim(p_motivo), anulacion_tipo = 'desembolso_no_ocurrio',
         anulacion_soporte = v_soporte, anulacion_fecha = v_fecha, updated_at = now()
   where id = v_ant.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_ant.organization_id, 'supplier_advances', v_ant.id::text, 'void', v_uid,
          jsonb_build_object('declaracion', 'desembolso_no_ocurrio', 'soporte', v_soporte, 'fecha_ajuste', v_fecha,
                             'monto', v_ant.amount, 'payment_id', v_pago.id, 'asiento', v_asiento, 'contra_asiento', v_reverso),
          btrim(p_motivo));

  return jsonb_build_object('anticipo_id', v_ant.id, 'payment_id', v_pago.id, 'fecha_ajuste', v_fecha,
                            'asiento_revertido', v_asiento, 'contra_asiento', v_reverso);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Estado de cuenta del proveedor: los cuatro movimientos del anticipo
-- ─────────────────────────────────────────────────────────────────────────────

-- Igual que antes + anticipos. El saldo pasa a ser la posición neta con el proveedor:
--   anticipo                abono  = bruto (sale a su favor el dinero girado y la retención practicada)
--   aplicación de anticipo  cargo  = retención que la factura había repetido (lo demás solo cambia de bolsillo)
--   devolución de anticipo  cargo  = bruto devuelto
--   anulación de anticipo   cargo  = bruto (corrige un desembolso que no ocurrió)
create or replace function public.fn_estado_cuenta_proveedor_movs(p_org integer, p_supplier integer)
 returns table(fecha timestamp with time zone, tipo text, documento text, ref_id text, vence timestamp with time zone, cargo numeric, abono numeric)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- Cargos: facturas confirmadas por su neto a pagar …
  select ip.issue_date, 'factura'::text, ip.number_ext, ip.id::text, ip.due_date,
         public.fn_invoice_purchase_neto(ip.id), 0::numeric
    from public.invoice_purchase ip
   where ip.organization_id = p_org and ip.supplier_id = p_supplier
     and ip.status not in ('draft', 'void', 'voided')
     and (auth.uid() is null or public.app_branch_access(ip.branch_id))
  union all
  -- … y cuentas por pagar sin factura.
  select ap.created_at, 'cuenta'::text, null::text, ap.id::text, ap.due_date, coalesce(ap.amount, 0), 0::numeric
    from public.accounts_payable ap
   where ap.organization_id = p_org and ap.supplier_id = p_supplier and ap.invoice_id is null
     and coalesce(ap.status, '') <> 'void'
     and (auth.uid() is null or public.app_branch_access(ap.branch_id))
  union all
  -- Abonos: pagos completados de los dos orígenes.
  select p.payment_date, 'pago'::text, coalesce(nullif(p.reference, ''), p.method), p.id::text, null::timestamptz,
         0::numeric, p.amount + coalesce(p.discount_amount, 0)
    from public.payments p
   where p.organization_id = p_org and p.status = 'completed'
     and (
       (p.source = 'invoice_purchase' and p.source_id in (
          select ip.id::text from public.invoice_purchase ip
           where ip.organization_id = p_org and ip.supplier_id = p_supplier and ip.status not in ('draft', 'void', 'voided')))
       or (p.source = 'account_payable' and p.source_id in (
          select ap.id::text from public.accounts_payable ap
            left join public.invoice_purchase ip on ip.id = ap.invoice_id
           where ap.organization_id = p_org and ap.supplier_id = p_supplier
             and (ip.id is null or ip.status not in ('draft', 'void', 'voided'))))
     )
     and (auth.uid() is null or public.app_branch_access(p.branch_id))
  union all
  -- Anticipos girados (también los anulados: la anulación va en su propia fila).
  select a.created_at, 'anticipo'::text, g.receipt_number, a.id::text, null::timestamptz, 0::numeric, a.amount
    from public.supplier_advances a
    left join public.payment_groups g on g.id = a.payment_group_id
   where a.organization_id = p_org and a.supplier_id = p_supplier
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select coalesce((a.anulacion_fecha::timestamp + time '12:00') at time zone coalesce(public.fn_timezone_for(p_org, a.branch_id), 'America/Bogota'),
                  a.cancelled_at),
         'anulacion_anticipo'::text, g.receipt_number, a.id::text || ':anulacion', null::timestamptz, a.amount, 0::numeric
    from public.supplier_advances a
    left join public.payment_groups g on g.id = a.payment_group_id
   where a.organization_id = p_org and a.supplier_id = p_supplier and a.status = 'cancelled'
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select x.created_at, 'aplicacion_anticipo'::text, coalesce(nullif(ip.number_ext, ''), g.receipt_number), x.id::text,
         null::timestamptz, coalesce(x.retencion_descontada, 0), 0::numeric
    from public.supplier_advance_applications x
    join public.supplier_advances a on a.id = x.advance_id
    left join public.payment_groups g on g.id = a.payment_group_id
    left join public.invoice_purchase ip on ip.id = x.invoice_id
   where x.organization_id = p_org and a.supplier_id = p_supplier
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select r.created_at, 'devolucion_anticipo'::text, r.soporte, r.id::text, null::timestamptz, r.monto, 0::numeric
    from public.supplier_advance_refunds r
    join public.supplier_advances a on a.id = r.advance_id
   where r.organization_id = p_org and a.supplier_id = p_supplier
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id));
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. P6 · Conciliación por anticipo y por proveedor
-- ─────────────────────────────────────────────────────────────────────────────

-- Por anticipo: valor, retención, girado, aplicado, retención descontada, devuelto, anulado, saldo de la tabla y
-- saldo en libros (líneas de SU cuenta en SUS asientos: crear, aplicar, devolver y el contra-asiento).
-- Por proveedor: las sumas y el auxiliar de las cuentas de anticipo por el NIT del proveedor.
create or replace function public.fn_anticipos_proveedor_conciliacion(p_org integer, p_supplier integer default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anticipos jsonb;
  v_proveedores jsonb;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);

  with base as (
    select a.id, a.supplier_id, s.name as proveedor, coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')) as nit,
           a.account_code as cuenta, a.status, a.naturaleza, a.created_at, g.receipt_number as recibo,
           a.amount as valor, a.retencion_total as retencion, coalesce(a.monto_girado, a.amount) as girado,
           coalesce(app.consumo, 0) as aplicado, coalesce(app.descontado, 0) as retencion_descontada,
           coalesce(ref.monto, 0) as devuelto,
           case when a.status = 'cancelled' then a.amount else 0 end as anulado,
           case when a.status = 'cancelled' then 0 else a.balance end as saldo,
           coalesce(lib.saldo, 0) as saldo_libros
      from public.supplier_advances a
      join public.suppliers s on s.id = a.supplier_id
      left join public.payment_groups g on g.id = a.payment_group_id
      left join lateral (select sum(coalesce(x.consumo_anticipo, x.amount)) as consumo, sum(x.retencion_descontada) as descontado
                           from public.supplier_advance_applications x where x.advance_id = a.id) app on true
      left join lateral (select sum(r.monto) as monto from public.supplier_advance_refunds r where r.advance_id = a.id) ref on true
      left join lateral (
        select sum(l.debit - l.credit) as saldo
          from public.journal_entries e
          join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = p_org and coalesce(e.posted, false) and l.account_code = a.account_code
           and (
             e.fact_key = 'supplier_advance:' || a.id::text
             or e.fact_key in (select 'supplier_advance_application:' || x.id::text
                                 from public.supplier_advance_applications x where x.advance_id = a.id)
             or e.fact_key in (select 'supplier_advance_refund:' || p.id::text
                                 from public.payments p where p.source = 'supplier_advance_refund' and p.source_id = a.id::text)
             or (e.source = 'reversal' and e.source_id in (select e2.id::text from public.journal_entries e2
                                                             where e2.organization_id = p_org
                                                               and e2.fact_key = 'supplier_advance:' || a.id::text))
           )) lib on true
     where a.organization_id = p_org and (p_supplier is null or a.supplier_id = p_supplier)
       and (a.branch_id is null or public.app_branch_access(a.branch_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'anticipo_id', b.id, 'proveedor_id', b.supplier_id, 'proveedor', b.proveedor, 'nit', b.nit, 'cuenta', b.cuenta,
           'estado', b.status, 'naturaleza', b.naturaleza, 'fecha', b.created_at, 'recibo', b.recibo,
           'valor', b.valor, 'retencion', b.retencion, 'girado', b.girado, 'aplicado', b.aplicado,
           'retencion_descontada', b.retencion_descontada, 'devuelto', b.devuelto, 'anulado', b.anulado,
           'saldo', b.saldo, 'saldo_libros', b.saldo_libros, 'diferencia', b.saldo_libros - b.saldo,
           'cuadra', b.valor - b.aplicado - b.devuelto - b.anulado = b.saldo and b.saldo_libros = b.saldo)
           order by b.proveedor, b.created_at), '[]'::jsonb),
         coalesce((
           select jsonb_agg(p order by p ->> 'proveedor')
             from (
               select jsonb_build_object(
                        'proveedor_id', b2.supplier_id, 'proveedor', min(b2.proveedor), 'nit', min(b2.nit),
                        'anticipos', count(*), 'valor', sum(b2.valor), 'retencion', sum(b2.retencion),
                        'aplicado', sum(b2.aplicado), 'devuelto', sum(b2.devuelto), 'anulado', sum(b2.anulado),
                        'saldo', sum(b2.saldo), 'saldo_libros', sum(b2.saldo_libros),
                        'auxiliar_nit', coalesce((
                          select sum(l.debit - l.credit)
                            from public.journal_lines l
                            join public.journal_entries e on e.id = l.journal_entry_id
                           where e.organization_id = p_org and coalesce(e.posted, false)
                             and l.tercero_nit = min(b2.nit)
                             and l.account_code in (select distinct b3.cuenta from base b3)), 0)) as p
                 from base b2
                group by b2.supplier_id
             ) q), '[]'::jsonb)
    into v_anticipos, v_proveedores
    from base b;

  return jsonb_build_object('anticipos', v_anticipos, 'proveedores', v_proveedores);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Permisos de ejecución
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_cuenta_anticipo_motivo_invalida(integer, text) from public, anon, authenticated;
revoke all on function public.fn_anticipo_retencion_practicar(integer, text, uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_anticipo_proveedor_asiento(integer, integer, timestamptz, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_cxp_cuenta_reconocida(integer, uuid) from public, anon, authenticated;

revoke all on function public.fn_cuenta_anticipo_proveedor_estado(integer, integer) from public, anon;
revoke all on function public.fn_cuenta_anticipo_proveedor(integer, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid) from public, anon;
revoke all on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer) from public, anon;
revoke all on function public.fn_anticipos_proveedor_conciliacion(integer, integer) from public, anon;

grant execute on function public.fn_cuenta_anticipo_proveedor_estado(integer, integer) to authenticated;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid) to authenticated;
grant execute on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer) to authenticated;
grant execute on function public.fn_anticipos_proveedor_conciliacion(integer, integer) to authenticated;
