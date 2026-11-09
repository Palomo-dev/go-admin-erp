-- Anticipos a proveedores · correcciones del Contador: P1, P6 y P7 (RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md), la
-- ronda 2 (RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md, «Anticipos»), la ronda 3 (RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md)
-- y la ronda 4 (RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «Anticipos»: AIU en dos regímenes, procedimiento de ReteICA
-- por municipio, devoluciones con soporte del hecho y por líneas, período de descuento por impuesto, conversión de la
-- financiación en pago o abono). Manda la ronda 4 sobre lo anterior.
--
-- ESTADO: SIN APLICAR (20261108170000). 20261108120000_anticipos_proveedores y 20261108130000 están APLICADAS y no se
-- editan: aquí se reemplazan sus funciones y se añaden columnas y tablas. Se aplica por el MCP (apply_migration)
-- cuando el dueño lo ordene, en este orden: 20261108120500 → 20261108121000 (consignación: crea
-- consignment_advance_crossings, que esta lee, y LLAMA a los criterios tributarios de esta) → 20261108140500 →
-- 20261108160000 → 20261108160500 (perfil con renta e IVA separados) → 20261108165000 (tarifa exacta) → esta.
-- 121000 y esta se aplican JUNTAS: mientras esta falte, las retenciones de consignación quedan todas pendientes
-- («criterios_tributarios_no_instalados»); si 121000 falta, esta funciona igual (los cruces no suman nada).
-- Reversión: supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql
-- Explicación para el Contador: docs/contador/ANTICIPOS-CORRECCIONES-P1-P6-P7.md y
--   docs/contador/ANTICIPOS-Y-CONSIGNACION-RONDA-4-2026-11-09.md
-- Pruebas en seco (begin … rollback, org 374): docs/contador/pruebas/11, 20 (integrada completa) y 21 (ronda 4).
--
-- Hoy hay 0 anticipos y 0 aplicaciones en la base: ningún saldo existente cambia.
--
-- Qué hace:
--   Cuenta      Solo la cuenta configurada con la clave «anticipos_proveedores»: auxiliar de detalle de OCHO dígitos
--               bajo 133005 (13300501…), o una cuenta de detalle con equivalencia APROBADA y nota. 1330 nunca. Sin ella
--               no se registra (pendiente contable visible). No se crean cuentas.
--   Naturaleza  Obligatoria. Financiación: no se retiene al girar; la retención se evalúa cuando el anticipo REALMENTE
--               se convierte en pago o abono del precio (fn_anticipo_proveedor_convertir_en_pago, con su soporte y
--               fecha), con o sin factura. Pago anticipado: se evalúa al girar, con la composición de la operación.
--   Criterios   UNA sola lógica tributaria para anticipos y consignación (ronda 4): fn_tributario_calidades_tercero,
--               fn_tributario_calidades_organizacion y fn_tributario_evaluar_retencion. Las calidades que EXCLUYEN
--               una retención deben estar acreditadas (supplier_tax_qualities, proveedores y clientes, con soporte y
--               vigencia): un O-15 sin resolución verificada y su alcance, o un O-47 sin acreditar, dejan la
--               retención PENDIENTE, no la excluyen. La calidad de agente de reteIVA no se limita a los códigos 09 y
--               13 del RUT (art. 437-2 E.T.): se acredita con su fundamento; sin él, pendiente.
--   AIU         Dos regímenes distintos (aiu_contratos), ambos detrás de «pendiente_validacion» hasta que el Contador
--               los valide: (a) servicios del art. 462-1 E.T. (aseo, vigilancia, temporales, cooperativas y
--               precooperativas de trabajo asociado, contrato sindical): base = A + I + U, nunca inferior al 10 % del
--               valor de la operación; (b) construcción de inmuebles (art. 1.3.1.7.9 del DUR 1625 de 2016): honorarios
--               del constructor o, si no se pactan, su utilidad, sin mínimo del 10 %. Fundamento estructurado:
--               operación, contrato (número, fecha, archivo, valor), norma, base y condiciones. Mantenimiento o
--               reparación no pasan a construcción (exige licencia de construcción y objeto «construccion_inmueble»).
--   ReteICA     Regla municipal (reteica_reglas) + procedimiento del MISMO municipio (reteica_procedimientos:
--               solicitud, pruebas, reintegro, certificado, regla del período de descuento y excedentes), validado.
--               Sin procedimiento validado del municipio, la reversión o el reintegro de reteICA quedan BLOQUEADOS
--               (reteica_sin_procedimiento_municipal). No se copia el de un municipio a otro.
--   Duplicado   Se evita AL RECONOCER la factura (vínculo en borrador + control en la causación). Si ya ocurrió, solo
--               con corrección documentada y pendiente para revisar los periodos afectados.
--   Devolución  Exige el SOPORTE DEL HECHO (la solicitud del proveedor sola no prueba anulación ni resolución). Causas:
--               anulación total (dinero + retenciones = saldo), resolución parcial y devolución parcial: estas dos por
--               las LÍNEAS afectadas de la operación; cada retención se revierte sobre lo que esa retención cubrió (su
--               base y su tarifa), no por prorrata del total. El período de descuento lo fija la regla de cada
--               impuesto (renta e IVA: el del hecho; reintegro por exceso: el del reintegro; ICA: el de su
--               procedimiento); lo que no alcance en ese período queda pendiente para los siguientes.
--   Anulación   Solo si el desembolso NO ocurrió (motivo, soporte, fecha del ajuste en periodo abierto). Con la caja ya
--               cerrada no se reabre ni se toca su arqueo: ajuste contable en periodo abierto y pendiente de revisión.
--   Pendientes  anticipo_pendientes: estado abierto/resuelto; solo se cierra con resolución y soporte (finance.approve).
--   Certificado fn_retenciones_practicadas_filas incluye las retenciones de anticipos (al girar o al convertirse) y sus
--               ajustes en su fecha, por impuesto, tercero y concepto.
--   Arqueo      pos_caja__esperado_calculo separa «egreso por anticipo» y «devolución de anticipo» de las ventas.
--   Consignación Los cruces de un anticipo con la obligación de un mandato (consignment_advance_crossings de
--               20261108121000, si está aplicada) cuentan como consumo del anticipo y llevan el NIT del proveedor.
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
  add column if not exists anulacion_caja_cerrada boolean not null default false,
  add column if not exists convertido numeric(16,2) not null default 0,
  add column if not exists aiu_contrato_id uuid;

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
  'financiacion (anticipo genuino: la retención se evalúa cuando realmente se convierte en pago o abono del precio, fn_anticipo_proveedor_convertir_en_pago) o pago_anticipado_precio (se evalúa al girar). Obligatoria desde 20261108170000.';
comment on column public.supplier_advances.convertido is
  'Ronda 4: parte girada de un anticipo de financiación que ya se convirtió en pago o abono del precio (suma de supplier_advance_conversions.girado_convertido).';
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

create table if not exists public.supplier_advance_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  hecho text not null check (hecho in ('pago', 'abono')),
  soporte text not null check (length(btrim(soporte)) >= 3),
  fecha date not null,
  componentes jsonb not null,
  bruto numeric(16,2) not null check (bruto > 0),
  retencion numeric(16,2) not null default 0 check (retencion >= 0),
  girado_convertido numeric(16,2) not null check (girado_convertido > 0),
  evaluacion jsonb not null,
  asiento_id integer,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint supplier_advance_conversions_cuadre check (bruto = girado_convertido + retencion),
  constraint supplier_advance_conversions_clave unique (organization_id, idempotency_key)
);
comment on table public.supplier_advance_conversions is
  'Ronda 4: un anticipo de financiación que REALMENTE se convierte en pago o abono del precio (con su soporte y fecha). Ahí se evalúan las retenciones sobre la composición del abono (bruto = girado convertido + retenciones).';
create index if not exists idx_supplier_advance_conversions_advance on public.supplier_advance_conversions (advance_id);

create table if not exists public.supplier_advance_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  conversion_id uuid references public.supplier_advance_conversions(id),
  fecha timestamptz not null default now(),
  -- Qué líneas de la operación cubrió esta retención y con qué base cada una: [{componente, base}] (reteIVA: el IVA de
  -- cada línea). De aquí sale la reversión de una resolución o devolución parcial, línea por línea (ronda 4).
  cobertura jsonb not null default '[]'::jsonb,
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
  constraint supplier_advance_withholdings_clase_unica unique nulls not distinct (advance_id, clase, conversion_id)
);
comment on table public.supplier_advance_withholdings is
  'Retención practicada al girar un pago anticipado o al convertirse una financiación en pago o abono (conversion_id), con su cobertura por línea. Escritura solo por fn_anticipo_proveedor_*.';
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
  causa text check (causa is null or causa in ('operacion_anulada', 'resolucion_parcial', 'retencion_excesiva', 'devolucion_parcial')),
  periodo_descuento text check (periodo_descuento is null or periodo_descuento ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Ronda 4: el período no es de libre elección; regla aplicada (renta/IVA: hecho; exceso: reintegro; ICA: procedimiento).
  regla_periodo text,
  hecho jsonb,
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
  -- Ronda 4: líneas de la operación afectadas [{componente, base, iva}] y el soporte del hecho {tipo, documento, fecha}.
  lineas jsonb,
  hecho jsonb,
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
  -- Ronda 4: el tercero puede ser un proveedor o un cliente (el comprador que retiene en una consignación).
  supplier_id integer references public.suppliers(id),
  customer_id uuid references public.customers(id),
  calidad text not null check (calidad in ('simple_acreditado', 'autorretenedor_renta', 'autorretencion_especial', 'responsable_iva', 'no_responsable_iva',
                                            'gran_contribuyente', 'no_sujeto_ica', 'agente_retencion_renta', 'no_agente_retencion_renta',
                                            'agente_retencion_iva', 'no_agente_retencion_iva', 'agente_retencion_ica')),
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
  constraint supplier_tax_qualities_tercero check (num_nonnulls(supplier_id, customer_id) = 1),
  constraint supplier_tax_qualities_unica unique (organization_id, supplier_id, calidad, vigente_desde),
  constraint supplier_tax_qualities_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint supplier_tax_qualities_autorretenedor check (calidad <> 'autorretenedor_renta' or cardinality(conceptos) > 0),
  -- Ronda 3: SIMPLE con el RUT actualizado (fecha y archivo); autorretenedor con RUT y resolución (número, fecha, alcance).
  constraint supplier_tax_qualities_rut check (calidad not in ('simple_acreditado', 'autorretenedor_renta')
                                               or (rut_fecha is not null and length(btrim(coalesce(rut_archivo, ''))) >= 3)),
  constraint supplier_tax_qualities_resolucion check (calidad <> 'autorretenedor_renta'
                                               or (length(btrim(coalesce(resolucion_numero, ''))) >= 1 and resolucion_fecha is not null
                                                   and length(btrim(coalesce(alcance, ''))) >= 3)),
  -- Ronda 4: la calidad de agente de reteIVA cita su fundamento (art. 437-2 E.T., numeral o acto que la designa).
  constraint supplier_tax_qualities_agente_iva check (calidad <> 'agente_retencion_iva' or length(btrim(coalesce(alcance, ''))) >= 3)
);
create unique index if not exists supplier_tax_qualities_unica_cliente
  on public.supplier_tax_qualities (organization_id, customer_id, calidad, vigente_desde) where customer_id is not null;
comment on table public.supplier_tax_qualities is
  'Calidades tributarias VERIFICADAS de un tercero (proveedor o cliente) con soporte y vigencia. simple_acreditado: RUT actualizado e inscripción vigente. autorretenedor_renta: RUT + resolución (número, fecha, alcance) y conceptos cubiertos. agente_retencion_iva: con su fundamento (art. 437-2). autorretencion_especial se registra pero NO excluye la retención por terceros. Los códigos del RUT sin verificar nunca excluyen una retención.';

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

-- Ronda 4: procedimiento de ReteICA por MUNICIPIO (no se traslada el de un municipio a otro). Sin uno validado, la
-- reversión o el reintegro de reteICA de ese municipio quedan bloqueados.
create table if not exists public.reteica_procedimientos (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id),
  norma text not null check (length(btrim(norma)) >= 3),
  solicitud text not null check (length(btrim(solicitud)) >= 10),
  pruebas text[] not null check (cardinality(pruebas) >= 1),
  reintegro text not null check (length(btrim(reintegro)) >= 10),
  certificado text not null check (length(btrim(certificado)) >= 10),
  periodo_descuento text not null check (periodo_descuento in ('periodo_del_reintegro', 'periodo_siguiente_al_reintegro', 'periodo_del_hecho')),
  excedentes text not null check (length(btrim(excedentes)) >= 10),
  estado text not null default 'pendiente_validacion' check (estado in ('pendiente_validacion', 'validado', 'rechazado')),
  vigente_desde date not null,
  vigente_hasta date,
  created_by uuid,
  created_at timestamptz not null default now(),
  validado_por uuid,
  validado_en timestamptz,
  validacion_concepto text,
  validacion_soporte text,
  constraint reteica_procedimientos_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint reteica_procedimientos_validado check (estado = 'pendiente_validacion' or (validado_por is not null and validado_en is not null
                                                     and length(btrim(coalesce(validacion_concepto, ''))) >= 20 and length(btrim(coalesce(validacion_soporte, ''))) >= 3)),
  constraint reteica_procedimientos_unico unique (organization_id, municipality_id, vigente_desde)
);
comment on table public.reteica_procedimientos is
  'Procedimiento municipal de ReteICA para revertir o reintegrar retenciones: solicitud, pruebas, reintegro, certificado, regla del período de descuento y tratamiento de excedentes. Solo opera «validado».';

-- Ronda 4: AIU en dos regímenes distintos, con fundamento estructurado y detrás de la validación del Contador.
create table if not exists public.aiu_contratos (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  supplier_id integer not null references public.suppliers(id),
  regimen text not null check (regimen in ('servicios_462_1', 'construccion_inmuebles')),
  operacion text not null check (length(btrim(operacion)) between 10 and 1000),
  -- 462-1: solo los servicios que la norma comprende. Construcción: null.
  servicio text check (servicio in ('aseo', 'vigilancia', 'temporales_empleo', 'cooperativas_trabajo_asociado',
                                    'precooperativas_trabajo_asociado', 'contrato_sindical')),
  contrato_numero text not null check (length(btrim(contrato_numero)) >= 1),
  contrato_fecha date not null,
  contrato_archivo text not null check (length(btrim(contrato_archivo)) >= 3),
  contrato_valor numeric(16,2) not null check (contrato_valor > 0),
  norma text not null check (length(btrim(norma)) >= 5),
  -- 462-1: {aiu_discriminado: true, requisitos_prestador: texto}. Construcción: {objeto: 'construccion_inmueble',
  -- licencia_construccion: número, honorarios_pactados: boolean}.
  condiciones jsonb not null check (jsonb_typeof(condiciones) = 'object'),
  -- Base de retefuente y de reteICA que el Contador valida para el contrato (la del IVA la fija la ley del régimen).
  base_retefuente text not null check (base_retefuente in ('base_especial', 'valor_total')),
  base_reteica text not null check (base_reteica in ('base_especial', 'valor_total')),
  estado text not null default 'pendiente_validacion' check (estado in ('pendiente_validacion', 'validado', 'rechazado')),
  vigente_desde date not null,
  vigente_hasta date,
  created_by uuid,
  created_at timestamptz not null default now(),
  validado_por uuid,
  validado_en timestamptz,
  validacion_concepto text,
  validacion_soporte text,
  constraint aiu_contratos_vigencia check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint aiu_contratos_servicio check ((regimen = 'servicios_462_1') = (servicio is not null)),
  constraint aiu_contratos_construccion check (regimen <> 'construccion_inmuebles'
    or (condiciones ->> 'objeto' = 'construccion_inmueble' and length(btrim(coalesce(condiciones ->> 'licencia_construccion', ''))) >= 3
        and jsonb_typeof(condiciones -> 'honorarios_pactados') = 'boolean')),
  constraint aiu_contratos_462_1 check (regimen <> 'servicios_462_1'
    or ((condiciones -> 'aiu_discriminado') = 'true'::jsonb and length(btrim(coalesce(condiciones ->> 'requisitos_prestador', ''))) >= 10)),
  constraint aiu_contratos_validado check (estado = 'pendiente_validacion' or (validado_por is not null and validado_en is not null
                                            and length(btrim(coalesce(validacion_concepto, ''))) >= 20 and length(btrim(coalesce(validacion_soporte, ''))) >= 3))
);
comment on table public.aiu_contratos is
  'Ronda 4 del Contador: contrato con AIU por régimen. servicios_462_1: base del IVA = A + I + U, nunca inferior al 10 % del valor de la operación, solo para los servicios comprendidos. construccion_inmuebles (DUR 1.3.1.7.9): honorarios del constructor o, si no se pactan, su utilidad, sin mínimo del 10 %. Ninguno opera sin «validado».';
create index if not exists idx_aiu_contratos_supplier on public.aiu_contratos (organization_id, supplier_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_advances_aiu_contrato_fk') then
    alter table public.supplier_advances add constraint supplier_advances_aiu_contrato_fk
      foreign key (aiu_contrato_id) references public.aiu_contratos(id);
  end if;
end $$;

create table if not exists public.anticipo_pendientes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  tipo text not null check (tipo in ('retencion_por_evaluar', 'retencion_duplicada', 'devolucion_retenciones_por_definir', 'anulacion_caja_cerrada',
                                     'correccion_declaracion', 'descuento_retencion_siguientes_periodos', 'retencion_revertida_otro_anio')),
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
                             'anticipos_cuenta_equivalencias', 'aiu_contratos', 'reteica_procedimientos', 'supplier_advance_conversions'] loop
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

-- INTERNA. Una sola validación para proveedores y clientes (ronda 4: el comprador de una consignación también acredita).
create or replace function public.fn_tercero_calidad_tributaria_guardar_int(
  p_organization_id integer, p_supplier integer, p_customer uuid, p_calidad text, p_soporte text, p_conceptos text[], p_vigente_desde date,
  p_vigente_hasta date, p_rut_fecha date, p_rut_archivo text, p_resolucion_numero text, p_resolucion_fecha date, p_alcance text)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if p_supplier is not null and not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = p_organization_id) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_customer is not null and not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_organization_id) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if num_nonnulls(p_supplier, p_customer) <> 1 then raise exception 'tercero_invalido' using errcode = '22023'; end if;
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  if p_calidad in ('simple_acreditado', 'autorretenedor_renta') and (p_rut_fecha is null or length(btrim(coalesce(p_rut_archivo, ''))) < 3) then
    raise exception 'rut_obligatorio' using errcode = '22023', hint = 'RUT actualizado: fecha y archivo.';
  end if;
  if p_calidad = 'autorretenedor_renta' and (length(btrim(coalesce(p_resolucion_numero, ''))) < 1 or p_resolucion_fecha is null
                                             or length(btrim(coalesce(p_alcance, ''))) < 3 or cardinality(coalesce(p_conceptos, '{}'::text[])) = 0) then
    raise exception 'resolucion_autorretencion_obligatoria' using errcode = '22023', hint = 'Número, fecha, alcance y conceptos de la resolución.';
  end if;
  if p_calidad = 'agente_retencion_iva' and length(btrim(coalesce(p_alcance, ''))) < 3 then
    raise exception 'fundamento_agente_reteiva_obligatorio' using errcode = '22023', hint = 'Cite el numeral del art. 437-2 E.T. o el acto que lo designa.';
  end if;
  if p_supplier is not null then
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
  else
    insert into public.supplier_tax_qualities (organization_id, customer_id, calidad, soporte, conceptos, vigente_desde, vigente_hasta, rut_fecha, rut_archivo,
                                               resolucion_numero, resolucion_fecha, alcance, verificado_por)
    values (p_organization_id, p_customer, p_calidad, btrim(coalesce(p_soporte, '')), coalesce(p_conceptos, '{}'::text[]), p_vigente_desde, p_vigente_hasta,
            p_rut_fecha, nullif(btrim(coalesce(p_rut_archivo, '')), ''), nullif(btrim(coalesce(p_resolucion_numero, '')), ''), p_resolucion_fecha,
            nullif(btrim(coalesce(p_alcance, '')), ''), auth.uid())
    on conflict (organization_id, customer_id, calidad, vigente_desde) where customer_id is not null do update
       set soporte = excluded.soporte, conceptos = excluded.conceptos, vigente_hasta = excluded.vigente_hasta, rut_fecha = excluded.rut_fecha,
           rut_archivo = excluded.rut_archivo, resolucion_numero = excluded.resolucion_numero, resolucion_fecha = excluded.resolucion_fecha,
           alcance = excluded.alcance, verificado_por = excluded.verificado_por, verificado_en = now()
    returning id into v_id;
  end if;
  return v_id;
end;
$function$;

create or replace function public.fn_proveedor_calidad_tributaria_guardar(
  p_organization_id integer, p_supplier integer, p_calidad text, p_soporte text, p_conceptos text[], p_vigente_desde date, p_vigente_hasta date default null,
  p_rut_fecha date default null, p_rut_archivo text default null, p_resolucion_numero text default null, p_resolucion_fecha date default null,
  p_alcance text default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_supplier is null then raise exception 'proveedor_no_encontrado' using errcode = 'P0002'; end if;
  return public.fn_tercero_calidad_tributaria_guardar_int(p_organization_id, p_supplier, null, p_calidad, p_soporte, p_conceptos, p_vigente_desde,
           p_vigente_hasta, p_rut_fecha, p_rut_archivo, p_resolucion_numero, p_resolucion_fecha, p_alcance);
end;
$function$;

-- Ronda 4: el cliente (comprador) acredita sus calidades con la misma regla (p. ej., agente de reteIVA con su fundamento).
create or replace function public.fn_cliente_calidad_tributaria_guardar(
  p_organization_id integer, p_customer uuid, p_calidad text, p_soporte text, p_conceptos text[], p_vigente_desde date, p_vigente_hasta date default null,
  p_rut_fecha date default null, p_rut_archivo text default null, p_resolucion_numero text default null, p_resolucion_fecha date default null,
  p_alcance text default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_customer is null then raise exception 'cliente_no_encontrado' using errcode = 'P0002'; end if;
  return public.fn_tercero_calidad_tributaria_guardar_int(p_organization_id, null, p_customer, p_calidad, p_soporte, p_conceptos, p_vigente_desde,
           p_vigente_hasta, p_rut_fecha, p_rut_archivo, p_resolucion_numero, p_resolucion_fecha, p_alcance);
end;
$function$;

-- Ronda 4: contrato con AIU por régimen, con fundamento estructurado. Nace «pendiente_validacion»: no se calcula nada
-- con él hasta que el Contador lo valide (fn_tributario_regla_validar).
-- p_contrato: {numero, fecha, archivo, valor}. p_condiciones: ver aiu_contratos.condiciones.
create or replace function public.fn_aiu_contrato_registrar(
  p_organization_id integer, p_supplier integer, p_regimen text, p_operacion text, p_servicio text, p_contrato jsonb, p_norma text,
  p_condiciones jsonb, p_base_retefuente text, p_base_reteica text, p_vigente_desde date, p_vigente_hasta date default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_c jsonb := coalesce(p_condiciones, '{}'::jsonb);
  v_valor numeric;
  v_fecha date;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = p_organization_id) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_regimen is null or p_regimen not in ('servicios_462_1', 'construccion_inmuebles') then
    raise exception 'aiu_regimen_invalido' using errcode = '22023', hint = 'Servicios del art. 462-1 E.T. o construcción de inmuebles (DUR 1.3.1.7.9).';
  end if;
  -- Mantenimiento o reparación no se vuelven construcción por escribir «AIU» en el contrato.
  if v_c ->> 'objeto' in ('mantenimiento', 'reparacion', 'adecuacion', 'remodelacion_menor') then
    raise exception 'aiu_mantenimiento_no_es_construccion' using errcode = '22023';
  end if;
  if p_regimen = 'construccion_inmuebles' and (v_c ->> 'objeto' is distinct from 'construccion_inmueble'
       or length(btrim(coalesce(v_c ->> 'licencia_construccion', ''))) < 3 or jsonb_typeof(v_c -> 'honorarios_pactados') is distinct from 'boolean') then
    raise exception 'aiu_condiciones_construccion' using errcode = '22023',
      hint = 'Objeto «construccion_inmueble», licencia de construcción y si se pactaron honorarios del constructor.';
  end if;
  if p_regimen = 'servicios_462_1' and (p_servicio is null or (v_c -> 'aiu_discriminado') is distinct from 'true'::jsonb
       or length(btrim(coalesce(v_c ->> 'requisitos_prestador', ''))) < 10) then
    raise exception 'aiu_condiciones_462_1' using errcode = '22023',
      hint = 'Servicio comprendido en el art. 462-1, AIU discriminado en el contrato y los requisitos legales del prestador.';
  end if;
  if p_regimen = 'construccion_inmuebles' and p_servicio is not null then raise exception 'aiu_regimen_invalido' using errcode = '22023'; end if;
  begin
    v_valor := (p_contrato ->> 'valor')::numeric;
    v_fecha := (p_contrato ->> 'fecha')::date;
  exception when others then
    raise exception 'aiu_contrato_incompleto' using errcode = '22023';
  end;
  if v_valor is null or v_valor <= 0 or v_fecha is null or length(btrim(coalesce(p_contrato ->> 'numero', ''))) < 1
     or length(btrim(coalesce(p_contrato ->> 'archivo', ''))) < 3 then
    raise exception 'aiu_contrato_incompleto' using errcode = '22023', hint = 'Número, fecha, archivo y valor del contrato.';
  end if;
  if p_operacion is null or length(btrim(p_operacion)) < 10 or p_norma is null or length(btrim(p_norma)) < 5 then
    raise exception 'aiu_fundamento_incompleto' using errcode = '22023', hint = 'Operación y norma aplicable.';
  end if;
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  insert into public.aiu_contratos (organization_id, supplier_id, regimen, operacion, servicio, contrato_numero, contrato_fecha, contrato_archivo,
                                    contrato_valor, norma, condiciones, base_retefuente, base_reteica, vigente_desde, vigente_hasta, created_by)
  values (p_organization_id, p_supplier, p_regimen, btrim(p_operacion), p_servicio, btrim(p_contrato ->> 'numero'), v_fecha, btrim(p_contrato ->> 'archivo'),
          v_valor, btrim(p_norma), v_c, p_base_retefuente, p_base_reteica, p_vigente_desde, p_vigente_hasta, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

-- Ronda 4: procedimiento de ReteICA de UN municipio. Nace «pendiente_validacion».
create or replace function public.fn_reteica_procedimiento_registrar(
  p_organization_id integer, p_municipio uuid, p_norma text, p_solicitud text, p_pruebas text[], p_reintegro text, p_certificado text,
  p_periodo_descuento text, p_excedentes text, p_vigente_desde date, p_vigente_hasta date default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.approve']);
  if not exists (select 1 from public.municipalities m where m.id = p_municipio) then raise exception 'municipio_invalido' using errcode = '22023'; end if;
  if p_vigente_desde is null then raise exception 'vigencia_invalida' using errcode = '22023'; end if;
  if cardinality(coalesce(p_pruebas, '{}'::text[])) = 0 or exists (select 1 from unnest(p_pruebas) x where length(btrim(coalesce(x, ''))) < 3) then
    raise exception 'procedimiento_ica_incompleto' using errcode = '22023', detail = 'pruebas';
  end if;
  begin
    insert into public.reteica_procedimientos (organization_id, municipality_id, norma, solicitud, pruebas, reintegro, certificado, periodo_descuento,
                                               excedentes, vigente_desde, vigente_hasta, created_by)
    values (p_organization_id, p_municipio, btrim(coalesce(p_norma, '')), btrim(coalesce(p_solicitud, '')), p_pruebas, btrim(coalesce(p_reintegro, '')),
            btrim(coalesce(p_certificado, '')), p_periodo_descuento, btrim(coalesce(p_excedentes, '')), p_vigente_desde, p_vigente_hasta, auth.uid())
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'procedimiento_ica_incompleto' using errcode = '22023',
      hint = 'Norma, solicitud, pruebas, reintegro, certificado, período de descuento y excedentes.';
  end;
  return v_id;
end;
$function$;

-- Ronda 4: la validación del Contador de un contrato AIU o de un procedimiento de ReteICA. Exige finance.approve, un
-- concepto (mínimo 20 caracteres) y su soporte, y que quien valida NO sea quien registró. Solo «validado» opera.
create or replace function public.fn_tributario_regla_validar(
  p_tipo text, p_id uuid, p_decision text, p_concepto text, p_soporte text, p_organization_id integer)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_autor uuid;
  v_estado text;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_tipo = 'aiu_contrato' then
    select organization_id, created_by, estado into v_org, v_autor, v_estado from public.aiu_contratos where id = p_id for update;
  elsif p_tipo = 'reteica_procedimiento' then
    select organization_id, created_by, estado into v_org, v_autor, v_estado from public.reteica_procedimientos where id = p_id for update;
  else
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_org is null or v_org <> p_organization_id then raise exception 'regla_no_encontrada' using errcode = 'P0002'; end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.approve']);
  if p_decision is null or p_decision not in ('validado', 'rechazado') then raise exception 'decision_invalida' using errcode = '22023'; end if;
  if v_estado <> 'pendiente_validacion' then raise exception 'regla_ya_decidida' using errcode = '22023'; end if;
  if v_autor = auth.uid() then
    raise exception 'validador_debe_ser_distinto' using errcode = '42501', hint = 'La validación la hace el Contador, no quien registró la regla.';
  end if;
  if p_concepto is null or length(btrim(p_concepto)) < 20 then raise exception 'concepto_obligatorio' using errcode = '22023'; end if;
  if p_soporte is null or length(btrim(p_soporte)) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  if p_tipo = 'aiu_contrato' then
    update public.aiu_contratos set estado = p_decision, validado_por = auth.uid(), validado_en = now(), validacion_concepto = btrim(p_concepto),
           validacion_soporte = btrim(p_soporte) where id = p_id;
  else
    update public.reteica_procedimientos set estado = p_decision, validado_por = auth.uid(), validado_en = now(), validacion_concepto = btrim(p_concepto),
           validacion_soporte = btrim(p_soporte) where id = p_id;
  end if;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, case when p_tipo = 'aiu_contrato' then 'aiu_contratos' else 'reteica_procedimientos' end, p_id::text, 'update', auth.uid(),
          jsonb_build_object('decision', p_decision, 'soporte', btrim(p_soporte)), btrim(p_concepto));
  return jsonb_build_object('id', p_id, 'estado', p_decision);
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
-- 5. Criterios tributarios COMPARTIDOS (ronda 4: anticipos y consignación usan esta misma lógica) y evaluación
--    de retenciones de un anticipo
-- ═════════════════════════════════════════════════════════════════════════════

-- Un concepto de retención configurado sobre una base (tarifa exacta de 20261108165000; cuenta de las compras).
create or replace function public.fn_tributario_retencion_practicar(p_org integer, p_clase text, p_tax uuid, p_base numeric)
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
-- ¿Tiene el tercero la responsabilidad del RUT? Acepta «O-13», «13», «O-07», «7».
create or replace function public.fn_rut_tiene(p_resp text[], p_codigo text)
 returns boolean language sql immutable set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from unnest(coalesce(p_resp, '{}'::text[])) r where regexp_replace(upper(btrim(r)), '^O-?0*', '') = p_codigo);
$function$;

-- La calidad VERIFICADA vigente de un tercero en una fecha (SIMPLE y autorretenedor: con el RUT y la resolución
-- anteriores a la fecha). Fila nula si no hay.
create or replace function public.fn_tributario_calidad_vigente(p_org integer, p_supplier integer, p_customer uuid, p_calidad text, p_fecha date)
 returns public.supplier_tax_qualities language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select q.* from public.supplier_tax_qualities q
   where q.organization_id = p_org and q.calidad = p_calidad
     and ((p_supplier is not null and q.supplier_id = p_supplier) or (p_customer is not null and q.customer_id = p_customer))
     and q.vigente_desde <= p_fecha and (q.vigente_hasta is null or q.vigente_hasta >= p_fecha)
     and (q.calidad not in ('simple_acreditado', 'autorretenedor_renta') or (q.rut_fecha is not null and q.rut_fecha <= p_fecha))
     and (q.calidad <> 'autorretenedor_renta' or (q.resolucion_fecha is not null and q.resolucion_fecha <= p_fecha))
   order by q.vigente_desde desc limit 1;
$function$;

-- Calidades tributarias de un tercero (proveedor o cliente) en una fecha. Regla de la ronda 4: lo VERIFICADO manda; un
-- código del RUT sirve para INCLUIR una obligación (agente según el RUT: 07 o 13 en renta; 09, 13 o 23 en IVA), nunca
-- para EXCLUIRLA (O-15 sin resolución verificada, O-47 sin acreditar: la retención queda pendiente). Sin calidad de
-- agente acreditada ni código que la indique, el agente queda «por acreditar» (null), no «no agente».
create or replace function public.fn_tributario_calidades_tercero(p_org integer, p_supplier integer, p_customer uuid, p_fecha date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resp text[];
  v_reg text := '';
  v_q public.supplier_tax_qualities;
  v_verificadas boolean;
  v_autorret text[];
  v_resp_iva boolean;
  v_ag_renta boolean;
  v_ag_iva boolean;
  v_ag_iva_fund text;
begin
  if p_supplier is not null then
    select coalesce(s.fiscal_responsibilities, '{}'::text[]), lower(coalesce(nullif(btrim(s.tax_regime), ''), '')) into v_resp, v_reg
      from public.suppliers s where s.id = p_supplier and s.organization_id = p_org;
    if not found then return jsonb_build_object('existe', false, 'con_datos', false, 'motivo', 'tercero_no_encontrado'); end if;
  elsif p_customer is not null then
    select coalesce(c.fiscal_responsibilities, '{}'::text[]) into v_resp from public.customers c where c.id = p_customer and c.organization_id = p_org;
    if not found then return jsonb_build_object('existe', false, 'con_datos', false, 'motivo', 'tercero_no_encontrado'); end if;
  else
    return jsonb_build_object('existe', false, 'con_datos', false, 'motivo', 'sin_tercero');
  end if;
  v_verificadas := exists (select 1 from public.supplier_tax_qualities q
                            where q.organization_id = p_org
                              and ((p_supplier is not null and q.supplier_id = p_supplier) or (p_customer is not null and q.customer_id = p_customer))
                              and q.vigente_desde <= p_fecha and (q.vigente_hasta is null or q.vigente_hasta >= p_fecha));
  v_q := public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'autorretenedor_renta', p_fecha);
  v_autorret := case when v_q.id is not null then v_q.conceptos end;
  v_resp_iva := case
    when (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'responsable_iva', p_fecha)).id is not null then true
    when (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'no_responsable_iva', p_fecha)).id is not null then false
    when public.fn_rut_tiene(v_resp, '49') or v_reg = 'no_responsable' then false
    when public.fn_rut_tiene(v_resp, '48') or v_reg in ('comun', 'gran_contribuyente') then true
    else null end;
  v_ag_renta := case
    when (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'agente_retencion_renta', p_fecha)).id is not null then true
    when (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'no_agente_retencion_renta', p_fecha)).id is not null then false
    when public.fn_rut_tiene(v_resp, '7') or public.fn_rut_tiene(v_resp, '13') then true
    else null end;
  v_q := public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'agente_retencion_iva', p_fecha);
  if v_q.id is not null then
    v_ag_iva := true;
    v_ag_iva_fund := v_q.alcance;
  elsif (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'no_agente_retencion_iva', p_fecha)).id is not null then
    v_ag_iva := false;
  elsif public.fn_rut_tiene(v_resp, '9') or public.fn_rut_tiene(v_resp, '13') or public.fn_rut_tiene(v_resp, '23') then
    v_ag_iva := true;
    v_ag_iva_fund := 'RUT';
  end if;
  return jsonb_build_object(
    'existe', true, 'tipo', case when p_supplier is not null then 'proveedor' else 'cliente' end, 'fecha', p_fecha,
    'responsabilidades', to_jsonb(v_resp), 'regimen', nullif(v_reg, ''),
    'con_datos', cardinality(v_resp) > 0 or v_reg <> '' or v_verificadas,
    'motivo', case when not (cardinality(v_resp) > 0 or v_reg <> '' or v_verificadas) then 'sin_datos_fiscales' end,
    'simple_acreditado', (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'simple_acreditado', p_fecha)).id is not null,
    'simple_declarado', public.fn_rut_tiene(v_resp, '47') or v_reg = 'simple',
    'autorretencion_conceptos', to_jsonb(v_autorret), 'autorretenedor_declarado', public.fn_rut_tiene(v_resp, '15'),
    'responsable_iva', v_resp_iva,
    'gran_contribuyente', public.fn_rut_tiene(v_resp, '13') or v_reg = 'gran_contribuyente'
                          or (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'gran_contribuyente', p_fecha)).id is not null,
    'no_sujeto_ica', (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'no_sujeto_ica', p_fecha)).id is not null,
    'agente_renta', v_ag_renta, 'agente_iva', v_ag_iva, 'agente_iva_fundamento', v_ag_iva_fund,
    'agente_ica', case when (public.fn_tributario_calidad_vigente(p_org, p_supplier, p_customer, 'agente_retencion_ica', p_fecha)).id is not null then true end);
end;
$function$;

-- Calidades de la propia organización en una fecha: su perfil tributario vigente (20261108160500). Sin perfil o con
-- «requiere_revision»: sin datos. La autorretención del perfil no trae alcance ni conceptos: no excluye nada (pendiente).
create or replace function public.fn_tributario_calidades_organizacion(p_org integer, p_fecha date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_p jsonb;
  v_resp text[];
  v_reg text;
  v_ag_iva boolean;
begin
  select to_jsonb(p) into v_p from public.organization_tax_profiles p
   where p.organization_id = p_org and p.vigente_desde <= p_fecha and (p.vigente_hasta is null or p.vigente_hasta >= p_fecha)
   order by p.vigente_desde desc limit 1;
  if v_p is null then
    return jsonb_build_object('existe', true, 'tipo', 'organizacion', 'con_datos', false, 'motivo', 'sin_perfil_tributario', 'fecha', p_fecha);
  end if;
  if coalesce((v_p ->> 'requiere_revision')::boolean, false) then
    return jsonb_build_object('existe', true, 'tipo', 'organizacion', 'con_datos', false, 'motivo', 'perfil_requiere_revision', 'fecha', p_fecha);
  end if;
  v_resp := coalesce(array(select jsonb_array_elements_text(coalesce(v_p -> 'responsabilidades', '[]'::jsonb))), '{}'::text[]);
  v_reg := coalesce(v_p ->> 'regimen_renta', v_p ->> 'regimen');
  if v_p ->> 'agente_retencion_iva' is null and v_p ->> 'gran_contribuyente' is null then
    v_ag_iva := public.fn_rut_tiene(v_resp, '13') or public.fn_rut_tiene(v_resp, '23');
  else
    v_ag_iva := coalesce((v_p ->> 'agente_retencion_iva')::boolean, false) or coalesce((v_p ->> 'gran_contribuyente')::boolean, false);
  end if;
  return jsonb_build_object(
    'existe', true, 'tipo', 'organizacion', 'con_datos', true, 'fecha', p_fecha, 'perfil_desde', v_p ->> 'vigente_desde',
    'responsabilidades', to_jsonb(v_resp), 'regimen', v_reg,
    'simple_acreditado', v_reg = 'simple', 'simple_declarado', v_reg = 'simple' or public.fn_rut_tiene(v_resp, '47'),
    'autorretencion_conceptos', null,
    'autorretenedor_declarado', coalesce((v_p ->> 'autorretenedor')::boolean, false) or public.fn_rut_tiene(v_resp, '15'),
    'responsable_iva', case v_p ->> 'condicion_iva' when 'responsable' then true when 'no_responsable' then false
                         else case when public.fn_rut_tiene(v_resp, '48') then true when public.fn_rut_tiene(v_resp, '49') then false end end,
    'gran_contribuyente', coalesce((v_p ->> 'gran_contribuyente')::boolean, public.fn_rut_tiene(v_resp, '13')),
    'no_sujeto_ica', false,
    'agente_renta', coalesce((v_p ->> 'agente_retencion')::boolean, false),
    'agente_iva', v_ag_iva, 'agente_iva_fundamento', 'perfil_tributario',
    -- Agente de ReteICA: la organización registró la regla municipal vigente (reteica_reglas).
    'agente_ica', exists (select 1 from public.reteica_reglas r where r.organization_id = p_org and r.vigente_desde <= p_fecha
                            and (r.vigente_hasta is null or r.vigente_hasta >= p_fecha)));
end;
$function$;

-- LA evaluación de una clase de retención entre un pagador y un beneficiario (ronda 4: la usan anticipos y
-- consignación). p_regla: organization_taxes (retefuente/reteIVA) o reteica_reglas (reteICA). Devuelve el estado
-- 'practicar' (con concepto, tarifa, base, valor y cuenta) | 'no_aplica' | 'pendiente', con su motivo. Nunca 0 ni
-- tarifa fija; nada se excluye por una calidad sin acreditar.
create or replace function public.fn_tributario_evaluar_retencion(
  p_org integer, p_clase text, p_pagador jsonb, p_beneficiario jsonb, p_regla uuid, p_base numeric, p_fecha date, p_territorial boolean default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base numeric := round(coalesce(p_base, 0), 2);
  v_pag_org boolean := coalesce(p_pagador ->> 'tipo', '') = 'organizacion';
  v_c record;
  v_r record;
  v_uvt numeric;
  v_conceptos text[];
  v_fila jsonb;
  v_cuenta text;
  v_valor numeric;
begin
  if p_clase is null or p_clase not in ('retefuente', 'reteiva', 'reteica') then raise exception 'clase_invalida' using errcode = '22023'; end if;
  if v_base <= 0 then
    return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', case when p_clase = 'reteiva' then 'operacion_sin_iva' else 'sin_base' end);
  end if;
  if not coalesce((p_pagador ->> 'con_datos')::boolean, false) then
    return jsonb_build_object('clase', p_clase, 'estado', 'pendiente',
      'motivo', case when v_pag_org then coalesce(p_pagador ->> 'motivo', 'sin_perfil_tributario') else 'calidad_pagador_sin_datos' end);
  end if;
  if p_clase <> 'reteica' and not coalesce((p_beneficiario ->> 'con_datos')::boolean, false) then
    return jsonb_build_object('clase', p_clase, 'estado', 'pendiente',
      'motivo', case when p_beneficiario ->> 'tipo' = 'organizacion' then coalesce(p_beneficiario ->> 'motivo', 'sin_perfil_tributario')
                     else 'beneficiario_sin_datos_fiscales' end);
  end if;

  if p_clase = 'retefuente' then
    if (p_pagador ->> 'agente_renta') is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'calidad_agente_retencion_por_acreditar');
    elsif not (p_pagador ->> 'agente_renta')::boolean then
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'pagador_no_agente_retencion');
    end if;
    if coalesce((p_beneficiario ->> 'simple_acreditado')::boolean, false) then
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'beneficiario_simple_acreditado');
    elsif coalesce((p_beneficiario ->> 'simple_declarado')::boolean, false) then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'simple_sin_acreditar');
    end if;
    if p_regla is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'sin_regla_configurada');
    end if;
    select ot.id, ot.name, tt.code, ot.min_base_uvt, coalesce(ot.is_active, false) as activa, public.fn_clase_retencion(tt.code, ot.name) as clase
      into v_c from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
     where ot.id = p_regla and ot.organization_id = p_org and ot.kind = 'withholding';
    if v_c.id is null or not v_c.activa or v_c.clase is distinct from 'retefuente' then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'regla_no_vigente');
    end if;
    if jsonb_typeof(p_beneficiario -> 'autorretencion_conceptos') = 'array' then
      v_conceptos := array(select jsonb_array_elements_text(p_beneficiario -> 'autorretencion_conceptos'));
      if v_c.code = any (v_conceptos) or p_regla::text = any (v_conceptos) then
        return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'autorretenedor_autorizado_concepto', 'concepto', v_c.name);
      end if;
      -- Resolución verificada que NO cubre este concepto: se retiene.
    elsif coalesce((p_beneficiario ->> 'autorretenedor_declarado')::boolean, false) then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'autorretencion_sin_verificar');
    end if;
    v_fila := public.fn_tributario_retencion_practicar(p_org, 'retefuente', p_regla, v_base);
    if v_c.min_base_uvt is not null then
      select u.value into v_uvt from public.fiscal_uvt u
       where u.country_code = (select coalesce(nullif(btrim(o.country_code), ''), 'COL') from public.organizations o where o.id = p_org)
         and u.year = extract(year from p_fecha)::integer;
      if v_uvt is null then
        return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'sin_uvt');
      elsif v_base < round(v_c.min_base_uvt * v_uvt, 0) then
        return v_fila || jsonb_build_object('estado', 'no_aplica', 'motivo', 'bajo_base_minima', 'valor', 0, 'base_minima', round(v_c.min_base_uvt * v_uvt, 0));
      end if;
    end if;
  elsif p_clase = 'reteiva' then
    if (p_beneficiario ->> 'responsable_iva') is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'calidad_iva_beneficiario_sin_datos');
    elsif not (p_beneficiario ->> 'responsable_iva')::boolean then
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'beneficiario_no_responsable_iva');
    end if;
    if (p_pagador ->> 'agente_iva') is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'calidad_agente_reteiva_por_acreditar');
    elsif not (p_pagador ->> 'agente_iva')::boolean then
      if (coalesce((p_beneficiario ->> 'simple_acreditado')::boolean, false) or coalesce((p_beneficiario ->> 'simple_declarado')::boolean, false))
         and coalesce((p_pagador ->> 'responsable_iva')::boolean, false) then
        return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'supuesto_compra_a_simple_por_confirmar');
      end if;
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'pagador_no_agente_reteiva');
    end if;
    if coalesce((p_pagador ->> 'gran_contribuyente')::boolean, false) and coalesce((p_beneficiario ->> 'gran_contribuyente')::boolean, false) then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'grandes_contribuyentes_por_verificar');
    end if;
    if p_regla is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'sin_regla_configurada');
    end if;
    if not exists (select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
                    where ot.id = p_regla and ot.organization_id = p_org and ot.kind = 'withholding' and coalesce(ot.is_active, false)
                      and public.fn_clase_retencion(tt.code, ot.name) = 'reteiva') then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'regla_no_vigente');
    end if;
    v_fila := public.fn_tributario_retencion_practicar(p_org, 'reteiva', p_regla, v_base);
  else
    if (p_pagador ->> 'agente_ica') is null or not (p_pagador ->> 'agente_ica')::boolean then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente',
        'motivo', case when v_pag_org then 'sin_regla_reteica_municipal' else 'calidad_agente_reteica_por_acreditar' end);
    end if;
    if p_regla is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'norma_municipal_sin_confirmar');
    end if;
    select r.*, m.name as municipio into v_r
      from public.reteica_reglas r join public.municipalities m on m.id = r.municipality_id
     where r.id = p_regla and r.organization_id = p_org and r.vigente_desde <= p_fecha and (r.vigente_hasta is null or r.vigente_hasta >= p_fecha);
    if v_r.id is null then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'regla_ica_no_vigente');
    elsif p_territorial is not true then
      return jsonb_build_object('clase', p_clase, 'estado', 'pendiente', 'motivo', 'territorialidad_sin_confirmar');
    elsif coalesce((p_beneficiario ->> 'no_sujeto_ica')::boolean, false) then
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'beneficiario_no_sujeto_ica');
    elsif v_r.base_minima is not null and v_base < v_r.base_minima then
      return jsonb_build_object('clase', p_clase, 'estado', 'no_aplica', 'motivo', 'bajo_base_minima');
    end if;
    v_cuenta := public.fn_cuenta_retencion_compra(p_org, 'RETEICA', 'ReteICA');
    v_valor := round(v_base * v_r.tarifa_por_mil / 1000, 0);
    v_fila := jsonb_build_object('clase', 'reteica', 'regla_ica_id', v_r.id, 'municipio_id', v_r.municipality_id,
                                 'concepto', 'ReteICA ' || v_r.municipio || ' · ' || v_r.actividad, 'tax_code', 'RETEICA', 'norma', v_r.norma,
                                 'tarifa', v_r.tarifa_por_mil / 10, 'tarifa_por_mil', v_r.tarifa_por_mil, 'base', v_base, 'valor', v_valor, 'cuenta', v_cuenta);
    if v_valor <= 0 then
      v_fila := v_fila || jsonb_build_object('estado', 'no_aplica', 'motivo', 'valor_cero');
    elsif not exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org and c.account_code = v_cuenta
                        and coalesce(c.is_active, true) and c.es_movimiento is not false)
          or public.fn_es_cuenta_de_titulo(p_org, v_cuenta) then
      v_fila := v_fila || jsonb_build_object('estado', 'pendiente', 'motivo', 'cuenta_retencion_no_valida');
    else
      v_fila := v_fila || jsonb_build_object('estado', 'practicar', 'motivo', null);
    end if;
  end if;
  -- La cuenta por pagar de la retención solo importa si la practica la organización; si la practica un tercero
  -- (consignación), lo que se estima es su valor.
  if not v_pag_org and v_fila ->> 'motivo' = 'cuenta_retencion_no_valida' then
    v_fila := v_fila || jsonb_build_object('estado', 'practicar', 'motivo', null, 'cuenta', null);
  end if;
  return v_fila;
end;
$function$;

-- Reparte la base de una clase entre las líneas de la operación que la forman (proporcional a su base; la última
-- absorbe el redondeo). p_lineas: [{componente, base}] solo con las líneas que forman esa base.
create or replace function public.fn_tributario_cobertura(p_lineas jsonb, p_total numeric)
 returns jsonb language plpgsql immutable set search_path to 'public', 'pg_temp'
as $function$
declare
  v_suma numeric;
  v_n integer;
  v_i integer := 0;
  v_acum numeric := 0;
  v_l jsonb;
  v_x numeric;
  v_out jsonb := '[]'::jsonb;
begin
  select coalesce(sum((l ->> 'base')::numeric), 0), count(*) into v_suma, v_n from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l;
  if v_suma <= 0 or coalesce(p_total, 0) <= 0 then return '[]'::jsonb; end if;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_x := case when v_i = v_n then round(p_total, 2) - v_acum else round(p_total * (v_l ->> 'base')::numeric / v_suma, 2) end;
    v_acum := v_acum + v_x;
    v_out := v_out || jsonb_build_object('componente', v_l ->> 'componente', 'base', v_x, 'base_linea', (v_l ->> 'base')::numeric);
  end loop;
  return v_out;
end;
$function$;

-- Evaluación de un anticipo (o de su conversión en pago o abono). p_componentes: [{descripcion, tratamiento, base,
-- tarifa_iva}] con tratamiento gravado · exento · excluido · no_sujeto o, en un contrato con AIU (p_aiu_contrato
-- registrado en aiu_contratos), aiu_costo_directo · aiu_administracion · aiu_imprevistos · aiu_utilidad ·
-- aiu_honorarios (el IVA del AIU lo fija el régimen del contrato con p_tarifa_iva). Sin componentes solo se admite una
-- suma homogénea con IVA incluido a la tarifa general (19 %, ET art. 468): base = monto / 1,19.
-- Las tres clases salen de fn_tributario_evaluar_retencion (pagador = la organización; beneficiario = el proveedor).
create or replace function public.fn_anticipo_proveedor_evaluar_retenciones(
  p_org integer, p_supplier integer, p_naturaleza text, p_monto numeric,
  p_tarifa_iva numeric default null, p_retefuente uuid default null, p_reteica uuid default null,
  p_componentes jsonb default null, p_ica_territorial boolean default null, p_aiu_contrato uuid default null, p_fecha date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  c_tarifa_general constant numeric := 19;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_hoy date;
  v_org_q jsonb;
  v_prov_q jsonb;
  v_comp jsonb := '[]'::jsonb;
  v_c jsonb;
  v_i integer := -1;
  v_trat text;
  v_cb numeric;
  v_ct numeric;
  v_ci numeric;
  v_base numeric;
  v_iva numeric;
  v_fuente jsonb;
  v_reteiva jsonb;
  v_ica jsonb;
  v_op_fuente jsonb;
  v_op_ica jsonb;
  v_reteiva_id uuid;
  v_aiu boolean := false;
  v_contrato public.aiu_contratos%rowtype;
  v_base_especial numeric;
  v_set_especial text[];
  v_iva_aiu numeric;
  v_min_aplicado boolean := false;
  v_base_fuente numeric;
  v_base_ica numeric;
  v_cob_fuente jsonb;
  v_cob_ica jsonb;
  v_cob_iva jsonb;
  v_aiu_estado text;
  v_clases jsonb;
  v_total numeric;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_naturaleza is null or p_naturaleza not in ('financiacion', 'pago_anticipado_precio') then
    raise exception 'naturaleza_obligatoria' using errcode = '22023';
  end if;
  if v_monto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = p_org) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  v_hoy := coalesce(p_fecha, (now() at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'))::date);
  v_org_q := public.fn_tributario_calidades_organizacion(p_org, v_hoy);
  v_prov_q := public.fn_tributario_calidades_tercero(p_org, p_supplier, null, v_hoy);

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
    -- Anticipo genuino: no se retiene al girar. La retención se evalúa cuando REALMENTE se convierte en pago o abono del
    -- precio (fn_anticipo_proveedor_convertir_en_pago), con o sin factura.
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
      v_comp := jsonb_build_array(jsonb_build_object('componente', '0', 'descripcion', 'Suma homogénea con IVA incluido a la tarifa general',
                                                     'tratamiento', 'gravado', 'base', v_cb, 'tarifa_iva', c_tarifa_general, 'iva', v_monto - v_cb));
    else
      for v_c in select * from jsonb_array_elements(p_componentes) loop
        v_i := v_i + 1;
        v_trat := v_c ->> 'tratamiento';
        v_cb := round(coalesce((v_c ->> 'base')::numeric, 0), 2);
        v_ct := coalesce((v_c ->> 'tarifa_iva')::numeric, 0);
        if v_trat is null or v_trat not in ('gravado', 'exento', 'excluido', 'no_sujeto', 'aiu_costo_directo', 'aiu_administracion', 'aiu_imprevistos',
                                            'aiu_utilidad', 'aiu_honorarios') or v_cb <= 0 then
          raise exception 'componente_invalido' using errcode = '22023', detail = v_c::text;
        end if;
        if v_trat = 'gravado' then
          if v_ct <= 0 or not exists (select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
                                       where ot.organization_id = p_org and ot.kind = 'tax' and coalesce(ot.is_active, false) and ot.rate = v_ct
                                         and (upper(coalesce(tt.code, '')) like 'IVA%' or upper(ot.name) like '%IVA%')) then
            raise exception 'tarifa_iva_invalida' using errcode = '22023', detail = v_c::text;
          end if;
          v_ci := round(v_cb * v_ct / 100, 2);
        else
          -- El IVA de un AIU no va en la línea: lo fija el régimen del contrato.
          if v_ct <> 0 then raise exception 'componente_invalido' using errcode = '22023', detail = v_c::text; end if;
          v_ci := 0;
        end if;
        v_comp := v_comp || jsonb_build_object('componente', v_i::text, 'descripcion', coalesce(nullif(btrim(v_c ->> 'descripcion'), ''), v_trat),
                                               'tratamiento', v_trat, 'base', v_cb, 'tarifa_iva', v_ct, 'iva', v_ci);
      end loop;
      v_aiu := exists (select 1 from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' like 'aiu\_%');
      if v_aiu then
        -- Ronda 4: AIU solo con un contrato registrado del MISMO proveedor; su régimen define la base del IVA.
        if exists (select 1 from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' not like 'aiu\_%') then
          raise exception 'aiu_componentes_mezclados' using errcode = '22023';
        end if;
        if p_aiu_contrato is null then
          raise exception 'aiu_contrato_obligatorio' using errcode = '22023',
            hint = 'Registre el contrato con AIU (operación, contrato, norma, base y condiciones) y elíjalo.';
        end if;
        select * into v_contrato from public.aiu_contratos a where a.id = p_aiu_contrato and a.organization_id = p_org and a.supplier_id = p_supplier;
        if v_contrato.id is null then raise exception 'aiu_contrato_invalido' using errcode = '22023'; end if;
        if p_tarifa_iva is null or p_tarifa_iva <= 0 or not exists (
             select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
              where ot.organization_id = p_org and ot.kind = 'tax' and coalesce(ot.is_active, false) and ot.rate = p_tarifa_iva
                and (upper(coalesce(tt.code, '')) like 'IVA%' or upper(ot.name) like '%IVA%')) then
          raise exception 'tarifa_iva_invalida' using errcode = '22023';
        end if;
        if v_contrato.regimen = 'servicios_462_1' then
          if exists (select 1 from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' = 'aiu_honorarios') then
            raise exception 'aiu_componentes_regimen' using errcode = '22023', detail = 'servicios_462_1 no lleva honorarios';
          end if;
          v_set_especial := array['aiu_administracion', 'aiu_imprevistos', 'aiu_utilidad'];
          select coalesce(sum((x ->> 'base')::numeric), 0) into v_base_especial from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' = any (v_set_especial);
          if v_base_especial <= 0 then raise exception 'aiu_componentes_regimen' using errcode = '22023', detail = 'falta A + I + U'; end if;
          -- Nunca inferior al 10 % del valor de la operación (art. 462-1 E.T.).
          select sum((x ->> 'base')::numeric) into v_cb from jsonb_array_elements(v_comp) x;
          if v_base_especial < round(v_cb * 0.10, 2) then
            v_base_especial := round(v_cb * 0.10, 2);
            v_min_aplicado := true;
            v_set_especial := array['aiu_costo_directo', 'aiu_administracion', 'aiu_imprevistos', 'aiu_utilidad'];
          end if;
        else
          -- Construcción (DUR 1.3.1.7.9): honorarios del constructor; si no se pactan, su utilidad. Sin mínimo del 10 %.
          v_set_especial := case when (v_contrato.condiciones ->> 'honorarios_pactados')::boolean then array['aiu_honorarios'] else array['aiu_utilidad'] end;
          select coalesce(sum((x ->> 'base')::numeric), 0) into v_base_especial from jsonb_array_elements(v_comp) x where x ->> 'tratamiento' = any (v_set_especial);
          if v_base_especial <= 0 then
            raise exception 'aiu_componentes_regimen' using errcode = '22023',
              detail = case when (v_contrato.condiciones ->> 'honorarios_pactados')::boolean then 'faltan honorarios' else 'falta utilidad' end;
          end if;
        end if;
        v_iva_aiu := round(v_base_especial * p_tarifa_iva / 100, 2);
        -- El IVA se reparte entre las líneas que forman la base especial (para la reversión línea por línea).
        select coalesce(jsonb_agg(case when x ->> 'tratamiento' = any (v_set_especial)
                                       then x || jsonb_build_object('iva', coalesce((select (cv ->> 'base')::numeric from jsonb_array_elements(
                                              public.fn_tributario_cobertura((select jsonb_agg(jsonb_build_object('componente', y ->> 'componente', 'base', y ->> 'base'))
                                                                                from jsonb_array_elements(v_comp) y where y ->> 'tratamiento' = any (v_set_especial)), v_iva_aiu)) cv
                                              where cv ->> 'componente' = x ->> 'componente'), 0), 'tarifa_iva', p_tarifa_iva)
                                       else x end), '[]'::jsonb)
          into v_comp from jsonb_array_elements(v_comp) x;
      end if;
      if abs((select sum((x ->> 'base')::numeric + (x ->> 'iva')::numeric) from jsonb_array_elements(v_comp) x) - v_monto) > 1 then
        raise exception 'componentes_no_suman' using errcode = '22023',
          detail = jsonb_build_object('monto', v_monto, 'componentes', (select sum((x ->> 'base')::numeric + (x ->> 'iva')::numeric) from jsonb_array_elements(v_comp) x))::text;
      end if;
    end if;
    select sum((x ->> 'base')::numeric), sum((x ->> 'iva')::numeric) into v_base, v_iva from jsonb_array_elements(v_comp) x;

    -- Bases por clase y qué líneas cubre cada una.
    v_base_fuente := v_base;
    v_base_ica := v_base;
    if v_aiu and v_contrato.base_retefuente = 'base_especial' then v_base_fuente := v_base_especial; end if;
    if v_aiu and v_contrato.base_reteica = 'base_especial' then v_base_ica := v_base_especial; end if;
    v_cob_fuente := public.fn_tributario_cobertura((select jsonb_agg(jsonb_build_object('componente', x ->> 'componente', 'base', x ->> 'base'))
                                                      from jsonb_array_elements(v_comp) x
                                                     where v_base_fuente = v_base or x ->> 'tratamiento' = any (v_set_especial)), v_base_fuente);
    v_cob_ica := public.fn_tributario_cobertura((select jsonb_agg(jsonb_build_object('componente', x ->> 'componente', 'base', x ->> 'base'))
                                                   from jsonb_array_elements(v_comp) x
                                                  where v_base_ica = v_base or x ->> 'tratamiento' = any (v_set_especial)), v_base_ica);
    v_cob_iva := coalesce((select jsonb_agg(jsonb_build_object('componente', x ->> 'componente', 'base', (x ->> 'iva')::numeric, 'base_linea', (x ->> 'base')::numeric))
                             from jsonb_array_elements(v_comp) x where (x ->> 'iva')::numeric > 0), '[]'::jsonb);

    if v_aiu then
      v_aiu_estado := case when v_contrato.estado = 'rechazado' then 'aiu_contrato_rechazado'
                           when v_contrato.estado <> 'validado' then 'aiu_contrato_pendiente_validacion'
                           when v_contrato.vigente_desde > v_hoy or (v_contrato.vigente_hasta is not null and v_contrato.vigente_hasta < v_hoy) then 'aiu_contrato_no_vigente'
                      end;
    end if;
    if v_aiu_estado is not null then
      -- Ronda 4: ningún régimen AIU opera sin la validación del Contador.
      v_fuente := jsonb_build_object('clase', 'retefuente', 'estado', 'pendiente', 'motivo', v_aiu_estado);
      v_reteiva := jsonb_build_object('clase', 'reteiva', 'estado', 'pendiente', 'motivo', v_aiu_estado);
      v_ica := jsonb_build_object('clase', 'reteica', 'estado', 'pendiente', 'motivo', v_aiu_estado);
    else
      v_fuente := public.fn_tributario_evaluar_retencion(p_org, 'retefuente', v_org_q, v_prov_q, p_retefuente, v_base_fuente, v_hoy);
      if v_fuente ->> 'motivo' = 'sin_regla_configurada' then
        v_fuente := v_fuente || jsonb_build_object('motivo', case when jsonb_array_length(v_op_fuente) = 0 then 'sin_regla_retefuente' else 'concepto_sin_elegir' end);
      end if;
      v_reteiva := public.fn_tributario_evaluar_retencion(p_org, 'reteiva', v_org_q, v_prov_q, v_reteiva_id, v_iva, v_hoy);
      if v_reteiva ->> 'motivo' = 'sin_regla_configurada' then v_reteiva := v_reteiva || jsonb_build_object('motivo', 'sin_regla_reteiva'); end if;
      v_ica := public.fn_tributario_evaluar_retencion(p_org, 'reteica', v_org_q, v_prov_q, p_reteica, v_base_ica, v_hoy, p_ica_territorial);
      if v_fuente ->> 'estado' = 'practicar' then v_fuente := v_fuente || jsonb_build_object('cobertura', v_cob_fuente); end if;
      if v_reteiva ->> 'estado' = 'practicar' then v_reteiva := v_reteiva || jsonb_build_object('cobertura', v_cob_iva); end if;
      if v_ica ->> 'estado' = 'practicar' then v_ica := v_ica || jsonb_build_object('cobertura', v_cob_ica); end if;
    end if;
  end if;

  if p_retefuente is not null and v_fuente ->> 'organization_tax_id' is null then
    perform public.fn_tributario_retencion_practicar(p_org, 'retefuente', p_retefuente, 0);
  end if;

  v_clases := jsonb_build_array(v_fuente, v_reteiva, v_ica);
  select coalesce(sum((c ->> 'valor')::numeric), 0) into v_total from jsonb_array_elements(v_clases) c where c ->> 'estado' = 'practicar';
  if v_total >= v_monto then raise exception 'retencion_excede_monto' using errcode = '22023'; end if;

  return jsonb_build_object(
    'naturaleza', p_naturaleza, 'monto', v_monto, 'tarifa_iva', p_tarifa_iva, 'componentes', v_comp,
    'base', v_base, 'iva', v_iva, 'fecha', v_hoy, 'base_retefuente', v_base_fuente, 'base_reteica', v_base_ica,
    'aiu', case when v_aiu then jsonb_build_object('contrato_id', v_contrato.id, 'regimen', v_contrato.regimen, 'estado', v_contrato.estado,
                                                   'base_iva', v_base_especial, 'minimo_10_aplicado', v_min_aplicado, 'iva', v_iva_aiu) end,
    'perfil', v_org_q, 'proveedor', v_prov_q,
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
  p_referencia text default null, p_notas text default null, p_componentes jsonb default null, p_ica_territorial boolean default null,
  p_aiu_contrato uuid default null)
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
                                                             p_componentes, p_ica_territorial, p_aiu_contrato);
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
    created_by, naturaleza, tarifa_iva, componentes, base_retencion, retencion_total, monto_girado, retencion_pendiente, retenciones_evaluacion, aiu_contrato_id)
  values (v_org, p_branch, p_supplier, v_monto, v_monto, 'active', v_moneda, v_cuenta_anticipo, v_grupo.id, coalesce(v_notas, 'Anticipo del comprobante ' || v_recibo),
    v_uid, p_naturaleza, p_tarifa_iva, v_eval -> 'componentes', (v_eval ->> 'base')::numeric, v_ret, v_girado,
    coalesce((v_eval ->> 'pendiente')::boolean, false), v_eval, p_aiu_contrato)
  returning id into v_anticipo;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_anticipo, 'debito', v_monto, 'credito', 0, 'descripcion', 'Anticipo a proveedor - ' || v_recibo),
    jsonb_build_object('cuenta', v_cuenta_dinero, 'debito', 0, 'credito', v_girado, 'descripcion', 'Anticipo a proveedor - ' || v_recibo));
  for v_c in select * from jsonb_array_elements(v_eval -> 'clases') loop
    continue when v_c ->> 'estado' <> 'practicar';
    insert into public.supplier_advance_withholdings (organization_id, advance_id, clase, organization_tax_id, regla_ica_id, concepto, tax_code, norma,
                                                      base, tarifa, valor, cuenta, cobertura, fecha)
    values (v_org, v_anticipo, v_c ->> 'clase', (v_c ->> 'organization_tax_id')::uuid, (v_c ->> 'regla_ica_id')::uuid, v_c ->> 'concepto', v_c ->> 'tax_code',
            v_c ->> 'norma', (v_c ->> 'base')::numeric, (v_c ->> 'tarifa')::numeric, (v_c ->> 'valor')::numeric, v_c ->> 'cuenta',
            coalesce(v_c -> 'cobertura', '[]'::jsonb), now());
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
-- 7b. Financiación que se convierte en pago o abono del precio (ronda 4: sin depender de «amortizar con factura»)
-- ═════════════════════════════════════════════════════════════════════════════

-- El hecho real (pago o abono, con su soporte y su fecha; con factura o sin ella) dispara la evaluación de retenciones
-- sobre la composición del abono, con los mismos criterios de siempre (fn_anticipo_proveedor_evaluar_retenciones).
-- bruto = girado que se convierte + retenciones practicadas. Asiento: D cuenta del anticipo / C retenciones por pagar
-- (lo que el proveedor tiene a favor sube por la retención que la organización consigna por él, igual que al girar
-- un pago anticipado). Lo que no se puede determinar queda pendiente («retencion_por_evaluar»), visible.
create or replace function public.fn_anticipo_proveedor_convertir_en_pago(
  p_anticipo uuid, p_hecho text, p_soporte text, p_fecha date, p_bruto numeric, p_clave_idempotencia text, p_organization_id integer default null,
  p_tarifa_iva numeric default null, p_retefuente uuid default null, p_reteica uuid default null, p_componentes jsonb default null,
  p_ica_territorial boolean default null, p_aiu_contrato uuid default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_conv public.supplier_advance_conversions%rowtype;
  v_id uuid := gen_random_uuid();
  v_bruto numeric := round(coalesce(p_bruto, 0), 2);
  v_eval jsonb;
  v_ret numeric;
  v_girado numeric;
  v_disponible numeric;
  v_tz text;
  v_hoy date;
  v_instante timestamptz;
  v_lineas jsonb;
  v_c jsonb;
  v_entry integer;
  v_soporte text := nullif(btrim(coalesce(p_soporte, '')), '');
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_hecho is null or p_hecho not in ('pago', 'abono') then raise exception 'hecho_invalido' using errcode = '22023'; end if;
  if v_soporte is null or length(v_soporte) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  if p_fecha is null then raise exception 'fecha_obligatoria' using errcode = '22023'; end if;
  if v_bruto <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then raise exception 'anticipo_no_encontrado' using errcode = 'P0002'; end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_convertir:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_conv from public.supplier_advance_conversions where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_conv.advance_id <> p_anticipo or v_conv.bruto <> v_bruto then raise exception 'clave_idempotencia_reutilizada' using errcode = '22023'; end if;
    return jsonb_build_object('conversion_id', v_conv.id, 'repetida', true, 'bruto', v_conv.bruto, 'retencion', v_conv.retencion,
                              'girado_convertido', v_conv.girado_convertido, 'evaluacion', v_conv.evaluacion);
  end if;

  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;
  if v_ant.naturaleza is distinct from 'financiacion' then
    raise exception 'anticipo_no_es_financiacion' using errcode = '22023', hint = 'Un pago anticipado del precio ya se evaluó al girarlo.';
  end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then raise exception 'anticipo_no_disponible' using errcode = '22023'; end if;
  if public.fn_cuenta_anticipo_motivo_invalida(v_org, v_ant.account_code) is not null then
    raise exception 'cuenta_anticipos_no_detalle' using errcode = 'P0002', detail = jsonb_build_object('cuenta', v_ant.account_code)::text;
  end if;
  v_tz := coalesce(public.fn_timezone_for(v_org, v_ant.branch_id), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  if p_fecha > v_hoy then raise exception 'fecha_futura' using errcode = '22023'; end if;
  if p_fecha < (v_ant.created_at at time zone v_tz)::date then raise exception 'fecha_anterior_al_anticipo' using errcode = '22023'; end if;
  if not public.fn_is_period_open(v_org, p_fecha) then raise exception 'periodo_cerrado' using errcode = '22023'; end if;
  v_instante := case when p_fecha = v_hoy then now() else (p_fecha::timestamp + time '12:00') at time zone v_tz end;

  -- Evaluada como pago del precio en la fecha del hecho, con la composición del abono.
  v_eval := public.fn_anticipo_proveedor_evaluar_retenciones(v_org, v_ant.supplier_id, 'pago_anticipado_precio', v_bruto, p_tarifa_iva, p_retefuente,
                                                             p_reteica, p_componentes, p_ica_territorial, p_aiu_contrato, p_fecha);
  if exists (select 1 from jsonb_array_elements(v_eval -> 'clases') c where c ->> 'motivo' = 'concepto_sin_elegir') then
    raise exception 'concepto_retefuente_obligatorio' using errcode = '22023';
  end if;
  -- Las líneas del abono se identifican con la conversión (para revertirlas después línea por línea).
  v_eval := jsonb_set(v_eval, '{componentes}', (select coalesce(jsonb_agg(x || jsonb_build_object('componente', v_id::text || ':' || (x ->> 'componente'))), '[]'::jsonb)
                                                   from jsonb_array_elements(v_eval -> 'componentes') x));
  v_eval := jsonb_set(v_eval, '{clases}', (select jsonb_agg(case when c ? 'cobertura'
                                                  then c || jsonb_build_object('cobertura', (select jsonb_agg(k || jsonb_build_object('componente', v_id::text || ':' || (k ->> 'componente')))
                                                                                              from jsonb_array_elements(c -> 'cobertura') k))
                                                  else c end) from jsonb_array_elements(v_eval -> 'clases') c));
  v_ret := coalesce((v_eval ->> 'total')::numeric, 0);
  v_girado := v_bruto - v_ret;
  v_disponible := least(coalesce(v_ant.monto_girado, v_ant.amount) - v_ant.convertido, v_ant.balance);
  if v_girado > v_disponible + 0.005 then
    raise exception 'conversion_excede_financiacion' using errcode = '22023',
      detail = jsonb_build_object('disponible', v_disponible, 'girado_convertido', v_girado, 'retencion', v_ret)::text;
  end if;

  insert into public.supplier_advance_conversions (id, organization_id, advance_id, hecho, soporte, fecha, componentes, bruto, retencion, girado_convertido,
                                                   evaluacion, idempotency_key, created_by)
  values (v_id, v_org, v_ant.id, p_hecho, v_soporte, p_fecha, v_eval -> 'componentes', v_bruto, v_ret, v_girado, v_eval, p_clave_idempotencia, v_uid)
  returning * into v_conv;

  v_lineas := '[]'::jsonb;
  for v_c in select * from jsonb_array_elements(v_eval -> 'clases') loop
    continue when v_c ->> 'estado' <> 'practicar';
    insert into public.supplier_advance_withholdings (organization_id, advance_id, conversion_id, clase, organization_tax_id, regla_ica_id, concepto, tax_code,
                                                      norma, base, tarifa, valor, cuenta, cobertura, fecha)
    values (v_org, v_ant.id, v_id, v_c ->> 'clase', (v_c ->> 'organization_tax_id')::uuid, (v_c ->> 'regla_ica_id')::uuid, v_c ->> 'concepto', v_c ->> 'tax_code',
            v_c ->> 'norma', (v_c ->> 'base')::numeric, (v_c ->> 'tarifa')::numeric, (v_c ->> 'valor')::numeric, v_c ->> 'cuenta',
            coalesce(v_c -> 'cobertura', '[]'::jsonb), v_instante);
    v_lineas := v_lineas || jsonb_build_object('cuenta', v_c ->> 'cuenta', 'debito', 0, 'credito', (v_c ->> 'valor')::numeric,
                                               'descripcion', coalesce(v_c ->> 'concepto', v_c ->> 'clase') || ' - abono del anticipo');
  end loop;
  if v_ret > 0 then
    v_entry := public.fn_anticipo_proveedor_asiento(v_org, v_ant.branch_id, v_instante, 'Retención al convertirse el anticipo en ' || p_hecho || ' del precio',
                 'supplier_advance_conversion', v_id::text, 'supplier_advance_conversion:' || v_id::text,
                 jsonb_build_array(jsonb_build_object('cuenta', v_ant.account_code, 'debito', v_ret, 'credito', 0,
                                                      'descripcion', 'Retención practicada al convertirse en ' || p_hecho)) || v_lineas, v_uid);
    update public.supplier_advance_conversions set asiento_id = v_entry where id = v_id;
  end if;

  update public.supplier_advances
     set amount = amount + v_ret, balance = balance + v_ret, retencion_total = retencion_total + v_ret, convertido = convertido + v_girado,
         retencion_pendiente = retencion_pendiente or coalesce((v_eval ->> 'pendiente')::boolean, false), updated_at = now()
   where id = v_ant.id;
  if coalesce((v_eval ->> 'pendiente')::boolean, false) then
    perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'retencion_por_evaluar',
      jsonb_build_object('conversion_id', v_id, 'hecho', p_hecho, 'fecha', p_fecha,
                         'clases', (select jsonb_agg(c) from jsonb_array_elements(v_eval -> 'clases') c where c ->> 'estado' = 'pendiente')), v_uid);
  end if;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'conversion_en_' || p_hecho, 'conversion_id', v_id, 'bruto', v_bruto, 'retencion', v_ret, 'girado_convertido', v_girado,
                             'fecha', p_fecha, 'asiento', v_entry), v_soporte);
  return jsonb_build_object('conversion_id', v_id, 'repetida', false, 'bruto', v_bruto, 'retencion', v_ret, 'girado_convertido', v_girado,
                            'asiento_id', v_entry, 'evaluacion', v_eval,
                            'saldo_disponible', (select balance from public.supplier_advances where id = v_ant.id));
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
-- 10. Devolver por procedimiento y causa (rondas 3 y 4): soporte del hecho, líneas afectadas y período por impuesto
-- ═════════════════════════════════════════════════════════════════════════════

-- Ronda 4. Líneas de la operación de un anticipo (las del giro y las de cada conversión en pago o abono) y lo que ya
-- se devolvió de cada una.
create or replace function public.fn_anticipo_componentes(p_anticipo uuid)
 returns table(componente text, tratamiento text, base numeric, iva numeric, devuelto_base numeric, devuelto_iva numeric)
 language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with c as (
    select coalesce(x ->> 'componente', (o.n - 1)::text) as componente, x ->> 'tratamiento' as tratamiento,
           (x ->> 'base')::numeric as base, coalesce((x ->> 'iva')::numeric, 0) as iva
      from public.supplier_advances a cross join lateral jsonb_array_elements(coalesce(a.componentes, '[]'::jsonb)) with ordinality o(x, n)
     where a.id = p_anticipo
    union all
    select x ->> 'componente', x ->> 'tratamiento', (x ->> 'base')::numeric, coalesce((x ->> 'iva')::numeric, 0)
      from public.supplier_advance_conversions v cross join lateral jsonb_array_elements(v.componentes) x
     where v.advance_id = p_anticipo
  ), d as (
    select l ->> 'componente' as componente, sum((l ->> 'base')::numeric) as base, sum(coalesce((l ->> 'iva')::numeric, 0)) as iva
      from public.supplier_advance_refunds r cross join lateral jsonb_array_elements(coalesce(r.lineas, '[]'::jsonb)) l
     where r.advance_id = p_anticipo group by 1
  )
  select c.componente, c.tratamiento, c.base, c.iva, coalesce(d.base, 0), coalesce(d.iva, 0) from c left join d on d.componente = c.componente;
$function$;

-- Ronda 4. Procedimiento de ReteICA del municipio de la regla con que se practicó, VALIDADO y vigente; y sus pruebas.
-- Sin él: bloqueado (no se traslada el de otro municipio).
create or replace function public.fn_reteica_procedimiento_exigir(p_org integer, p_regla_ica uuid, p_fecha date, p_soportes jsonb)
 returns public.reteica_procedimientos language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_p public.reteica_procedimientos;
  v_falta text[];
  v_ica jsonb := coalesce(p_soportes -> 'ica', '{}'::jsonb);
begin
  select p.* into v_p from public.reteica_procedimientos p join public.reteica_reglas r on r.id = p_regla_ica and r.municipality_id = p.municipality_id
   where p.organization_id = p_org and p.estado = 'validado' and p.vigente_desde <= p_fecha and (p.vigente_hasta is null or p.vigente_hasta >= p_fecha)
   order by p.vigente_desde desc limit 1;
  if v_p.id is null then
    raise exception 'reteica_sin_procedimiento_municipal' using errcode = '22023',
      hint = 'Registre y valide el procedimiento de ReteICA del municipio (solicitud, pruebas, reintegro, certificado, período y excedentes).';
  end if;
  select array_agg(k) into v_falta
    from unnest(array['solicitud', 'certificado'] || v_p.pruebas) k
   where length(btrim(coalesce(v_ica ->> k, ''))) < 3;
  if v_falta is not null then
    raise exception 'reteica_pruebas_incompletas' using errcode = '22023', detail = array_to_string(v_falta, ', ');
  end if;
  return v_p;
end;
$function$;

-- Ronda 4. El período en que se descuenta una reversión NO es de libre elección:
--   renta: anulación, rescisión o resolución → el período del hecho (DUR 1625 de 2016, art. 1.2.4.17); retención en
--          exceso → el período del reintegro (art. 1.2.4.16);
--   IVA:   el mismo criterio (por confirmar con el Contador el artículo del DUR para reteIVA);
--   ICA:   la regla del procedimiento municipal validado.
create or replace function public.fn_retencion_periodo_descuento(p_clase text, p_origen text, p_fecha_hecho date, p_hoy date, p_regla_ica text default null)
 returns jsonb language plpgsql immutable set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fecha date;
  v_regla text;
begin
  if p_clase = 'reteica' then
    v_regla := p_regla_ica;
    v_fecha := case p_regla_ica when 'periodo_del_hecho' then p_fecha_hecho when 'periodo_del_reintegro' then p_hoy
                                when 'periodo_siguiente_al_reintegro' then (date_trunc('month', p_hoy) + interval '1 month')::date end;
  elsif p_origen = 'exceso' then
    v_regla := case when p_clase = 'retefuente' then 'DUR 1.2.4.16: período del reintegro' else 'reteIVA: período del reintegro (por confirmar)' end;
    v_fecha := p_hoy;
  else
    v_regla := case when p_clase = 'retefuente' then 'DUR 1.2.4.17: período de la anulación, rescisión o resolución'
                    else 'reteIVA: período del hecho (por confirmar)' end;
    v_fecha := p_fecha_hecho;
  end if;
  if v_fecha is null then raise exception 'periodo_descuento_indeterminado' using errcode = '22023'; end if;
  return jsonb_build_object('periodo', to_char(v_fecha, 'YYYY-MM'), 'regla', v_regla, 'fecha', v_fecha);
end;
$function$;

-- Ronda 4. Neto de una clase de retención en un período (practicado − descuentos) en el certificado/reporte; si queda
-- negativo, lo que falta se descuenta en los períodos siguientes (pendiente visible).
create or replace function public.fn_retencion_neto_periodo(p_org integer, p_clase text, p_periodo text)
 returns numeric language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(f.valor), 0)
    from public.fn_retenciones_practicadas_filas(p_org,
           (to_date(p_periodo || '-01', 'YYYY-MM-DD')::timestamp) at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'),
           ((to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp - interval '1 microsecond')
             at time zone coalesce(public.fn_timezone_for(p_org, null), 'America/Bogota'), null, null) f
   where f.clase = p_clase;
$function$;

drop function if exists public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text);
-- p_monto = dinero que entra a caja o banco. p_procedimiento (ronda 4 del Contador):
--   {causa: 'operacion_anulada' | 'resolucion_parcial' | 'devolucion_parcial',
--    hecho: {tipo, documento, fecha}: el SOPORTE DEL HECHO. La solicitud del proveedor sola no prueba la anulación ni la
--           resolución (tipo 'solicitud_proveedor' se rechaza).
--    soportes: {calculo, certificado, ica: {solicitud, certificado, <pruebas del procedimiento municipal>}},
--    lineas: [{componente, base, iva}]: las líneas de la operación afectadas (resolución o devolución parcial),
--    requiere_correccion: boolean}
--   operacion_anulada: todas las retenciones vigentes; dinero + retenciones = saldo (la total es condición de la
--     cancelación total, pero no impide una resolución parcial: para eso está 'resolucion_parcial').
--   resolucion_parcial / devolucion_parcial: cada retención se revierte sobre lo que ELLA cubrió de las líneas afectadas
--     (su cobertura, su base y su tarifa); dinero = base + IVA de esas líneas − esas retenciones.
--   Período de descuento: lo fija fn_retencion_periodo_descuento por impuesto; si viene otro, se rechaza.
--   NULL = no se puede determinar: baja solo el dinero, las retenciones siguen en el anticipo y queda un pendiente.
--   La retención excesiva o indebida no es una devolución del proveedor: fn_anticipo_retencion_exceso_reintegrar.
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
  v_afectada numeric;
  v_ret numeric := 0;
  v_bruto numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_lineas_ret jsonb := '[]'::jsonb;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_det boolean := p_procedimiento is not null;
  v_causa text := p_procedimiento ->> 'causa';
  v_sop jsonb := coalesce(p_procedimiento -> 'soportes', '{}'::jsonb);
  v_hecho jsonb := p_procedimiento -> 'hecho';
  v_lineas jsonb := coalesce(p_procedimiento -> 'lineas', '[]'::jsonb);
  v_corr boolean := (p_procedimiento ->> 'requiere_correccion')::boolean;
  v_fecha_hecho date;
  v_tz text;
  v_hoy date;
  v_l jsonb;
  v_comp record;
  v_parte numeric := 0;
  v_proc public.reteica_procedimientos;
  v_per jsonb;
  v_d jsonb;
  v_neto numeric;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_dinero <= 0 then raise exception 'monto_invalido' using errcode = '22023'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if v_ref is null or length(v_ref) < 3 then raise exception 'soporte_obligatorio' using errcode = '22023'; end if;
  if v_det then
    if jsonb_typeof(p_procedimiento) <> 'object' or v_causa is null or v_causa not in ('operacion_anulada', 'resolucion_parcial', 'devolucion_parcial') then
      raise exception 'procedimiento_invalido' using errcode = '22023';
    end if;
    -- Ronda 4: el soporte del HECHO. La solicitud del proveedor sola no prueba la anulación ni la resolución.
    if v_hecho is null or jsonb_typeof(v_hecho) <> 'object' then
      raise exception 'soporte_del_hecho_obligatorio' using errcode = '22023';
    end if;
    if v_hecho ->> 'tipo' = 'solicitud_proveedor' then
      raise exception 'solicitud_no_prueba_el_hecho' using errcode = '22023',
        hint = 'La solicitud del proveedor no demuestra que la operación se anuló o resolvió: aporte el acto (resolución, resciliación, nota crédito, sentencia o acta).';
    end if;
    if coalesce(v_hecho ->> 'tipo', '') not in ('resolucion_mutuo_acuerdo', 'resciliacion', 'sentencia_o_laudo', 'nota_credito_proveedor',
                                               'anulacion_aceptada', 'acta_devolucion') then
      raise exception 'procedimiento_invalido' using errcode = '22023', detail = 'hecho.tipo';
    end if;
    if length(btrim(coalesce(v_hecho ->> 'documento', ''))) < 3 then
      raise exception 'soporte_del_hecho_obligatorio' using errcode = '22023', detail = 'hecho.documento';
    end if;
    begin
      v_fecha_hecho := (v_hecho ->> 'fecha')::date;
    exception when others then
      raise exception 'procedimiento_invalido' using errcode = '22023', detail = 'hecho.fecha';
    end;
    if v_fecha_hecho is null then raise exception 'soporte_del_hecho_obligatorio' using errcode = '22023', detail = 'hecho.fecha'; end if;
    if v_causa <> 'operacion_anulada' and (jsonb_typeof(v_lineas) <> 'array' or jsonb_array_length(v_lineas) = 0) then
      raise exception 'lineas_afectadas_obligatorias' using errcode = '22023';
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
  v_tz := coalesce(public.fn_timezone_for(v_org, v_ant.branch_id), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  if v_det and (v_fecha_hecho > v_hoy or v_fecha_hecho < (v_ant.created_at at time zone v_tz)::date) then
    raise exception 'fecha_del_hecho_invalida' using errcode = '22023';
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

  if v_det then
    -- Líneas afectadas: existen, no superan lo que queda de cada una, y su IVA es el de la línea.
    if v_causa <> 'operacion_anulada' then
      for v_l in select * from jsonb_array_elements(v_lineas) loop
        select * into v_comp from public.fn_anticipo_componentes(v_ant.id) c where c.componente = v_l ->> 'componente';
        if v_comp.componente is null then raise exception 'linea_no_encontrada' using errcode = '22023', detail = v_l::text; end if;
        if coalesce((v_l ->> 'base')::numeric, 0) <= 0 or (v_l ->> 'base')::numeric > v_comp.base - v_comp.devuelto_base + 0.005 then
          raise exception 'linea_excede_lo_pendiente' using errcode = '22023',
            detail = jsonb_build_object('componente', v_comp.componente, 'base', v_comp.base, 'devuelto', v_comp.devuelto_base)::text;
        end if;
        if abs(coalesce((v_l ->> 'iva')::numeric, 0) - case when v_comp.base > 0 then round(v_comp.iva * (v_l ->> 'base')::numeric / v_comp.base, 2) else 0 end) > 1 then
          raise exception 'linea_iva_no_cuadra' using errcode = '22023', detail = v_l::text;
        end if;
        v_parte := v_parte + (v_l ->> 'base')::numeric + coalesce((v_l ->> 'iva')::numeric, 0);
      end loop;
    end if;
    -- Cada retención se revierte sobre lo que ella cubrió (su cobertura), con su base y su tarifa.
    for v_w in select * from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido order by w.fecha, w.clase for update loop
      if v_causa = 'operacion_anulada' then
        v_r := v_w.valor - v_w.revertido;
        v_afectada := round(v_w.base * v_r / v_w.valor, 2);
      else
        select coalesce(sum((k ->> 'base')::numeric * (l ->> 'base')::numeric / nullif((k ->> 'base_linea')::numeric, 0)), 0) into v_afectada
          from jsonb_array_elements(v_w.cobertura) k join jsonb_array_elements(v_lineas) l on l ->> 'componente' = k ->> 'componente';
        v_afectada := round(v_afectada, 2);
        v_r := round(v_afectada * v_w.tarifa / 100, 0);
      end if;
      continue when v_r <= 0;
      if v_r > v_w.valor - v_w.revertido then
        raise exception 'retencion_devolucion_invalida' using errcode = '22023',
          detail = jsonb_build_object('clase', v_w.clase, 'calculada', v_r, 'vigente', v_w.valor - v_w.revertido)::text;
      end if;
      v_proc := null;
      if v_w.clase = 'reteica' then
        v_proc := public.fn_reteica_procedimiento_exigir(v_org, v_w.regla_ica_id, v_hoy, v_sop);
      end if;
      v_per := public.fn_retencion_periodo_descuento(v_w.clase, 'hecho', v_fecha_hecho, v_hoy, v_proc.periodo_descuento);
      if nullif(p_procedimiento ->> 'periodo_descuento', '') is not null and p_procedimiento ->> 'periodo_descuento' <> v_per ->> 'periodo' then
        raise exception 'periodo_descuento_no_es_de_libre_eleccion' using errcode = '22023', detail = v_per::text;
      end if;
      v_ret := v_ret + v_r;
      v_detalle := v_detalle || jsonb_build_object('withholding_id', v_w.id, 'clase', v_w.clase, 'cuenta', v_w.cuenta, 'revertido', v_r,
                                                   'base_afectada', v_afectada, 'tarifa', v_w.tarifa, 'causa', v_causa, 'periodo', v_per ->> 'periodo',
                                                   'regla_periodo', v_per ->> 'regla', 'fecha_periodo', v_per ->> 'fecha',
                                                   'anio_retencion', extract(year from v_w.fecha at time zone v_tz)::integer,
                                                   'procedimiento_ica', v_proc.id);
      v_lineas_ret := v_lineas_ret || jsonb_build_object('cuenta', v_w.cuenta, 'debito', v_r, 'credito', 0,
        'descripcion', 'Reversión de retención ' || v_w.clase || ' (' || replace(v_causa, '_', ' ') || ')');
      update public.supplier_advance_withholdings set revertido = revertido + v_r where id = v_w.id;
    end loop;
    if v_ret > 0 then
      if length(btrim(coalesce(v_sop ->> 'calculo', ''))) < 3 or length(btrim(coalesce(v_sop ->> 'certificado', ''))) < 3 then
        raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'calculo_y_certificado';
      end if;
      if v_corr is null then
        raise exception 'tratamiento_declaracion_obligatorio' using errcode = '22023', hint = 'Indique si la declaración requiere corrección.';
      end if;
    end if;
    if v_causa = 'operacion_anulada' and abs(v_dinero + v_ret - v_ant.balance) > 1 then
      raise exception 'anulacion_requiere_devolucion_total' using errcode = '22023',
        detail = jsonb_build_object('saldo', v_ant.balance, 'dinero', v_dinero, 'retenciones', v_ret)::text,
        hint = 'Si la resolución es parcial, regístrela como «resolución parcial» con las líneas afectadas.';
    end if;
    if v_causa <> 'operacion_anulada' and abs(v_dinero - (v_parte - v_ret)) > 1 then
      raise exception 'calculo_no_cuadra' using errcode = '22023',
        detail = jsonb_build_object('dinero', v_dinero, 'esperado', v_parte - v_ret, 'retenciones', v_ret)::text;
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
                                               retenciones_determinadas, procedimiento, soporte, motivo, asiento_id, created_by, lineas, hecho)
  values (v_org, v_ant.id, v_pago.id, v_bruto, v_dinero, v_bruto - v_dinero, v_detalle, v_det, p_procedimiento, v_ref, btrim(p_motivo), v_entry, v_uid,
          case when v_det and v_causa <> 'operacion_anulada' then v_lineas end, v_hecho);

  for v_d in select * from jsonb_array_elements(v_detalle) loop
    select * into v_w from public.supplier_advance_withholdings w where w.id = (v_d ->> 'withholding_id')::uuid;
    -- El ajuste se fecha en el período de descuento que fija la regla del impuesto (no en el que elija el usuario).
    insert into public.supplier_advance_withholding_ajustes (organization_id, advance_id, withholding_id, tipo, clase, concepto, tax_code, cuenta, tarifa,
                                                              base, valor, procedimiento, soporte, causa, periodo_descuento, regla_periodo, hecho,
                                                              requiere_correccion, soportes, fecha, asiento_id, created_by)
    values (v_org, v_ant.id, v_w.id, 'devolucion', v_w.clase, v_w.concepto, v_w.tax_code, v_w.cuenta, v_w.tarifa,
            -(v_d ->> 'base_afectada')::numeric, -(v_d ->> 'revertido')::numeric, v_causa, coalesce(v_sop ->> 'certificado', v_ref), v_causa,
            v_d ->> 'periodo', v_d ->> 'regla_periodo', v_hecho, v_corr, v_sop,
            case when (v_d ->> 'fecha_periodo')::date = v_hoy then now() else ((v_d ->> 'fecha_periodo')::date::timestamp + time '12:00') at time zone v_tz end,
            v_entry, v_uid);
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
      jsonb_build_object('payment_id', v_pago.id, 'causa', v_causa,
                         'periodos_a_revisar', (select jsonb_agg(distinct d ->> 'periodo') from jsonb_array_elements(v_detalle) d), 'detalle', v_detalle), v_uid);
  end if;
  -- Lo que no alcance a descontarse en el período (neto negativo de la clase) se descuenta en los siguientes.
  for v_d in select distinct on (d ->> 'clase', d ->> 'periodo') d from jsonb_array_elements(v_detalle) d loop
    v_neto := public.fn_retencion_neto_periodo(v_org, v_d ->> 'clase', v_d ->> 'periodo');
    if v_neto < 0 then
      perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'descuento_retencion_siguientes_periodos',
        jsonb_build_object('payment_id', v_pago.id, 'clase', v_d ->> 'clase', 'periodo', v_d ->> 'periodo', 'por_descontar', -v_neto,
                           'regla', v_d ->> 'regla_periodo'), v_uid);
    end if;
  end loop;
  -- Retención de un año revertida en otro: el certificado del año de la retención ya salió; revisión del Contador.
  for v_d in select * from jsonb_array_elements(v_detalle) d where (d ->> 'anio_retencion')::integer <> left(d ->> 'periodo', 4)::integer loop
    perform public.fn_anticipo_pendiente_abrir(v_org, v_ant.id, 'retencion_revertida_otro_anio',
      jsonb_build_object('payment_id', v_pago.id, 'clase', v_d ->> 'clase', 'anio_retencion', v_d ->> 'anio_retencion', 'periodo', v_d ->> 'periodo',
                         'revertido', v_d ->> 'revertido'), v_uid);
  end loop;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'devolucion_en_dinero', 'bruto', v_bruto, 'dinero', v_dinero, 'retencion_revertida', v_bruto - v_dinero,
                             'procedimiento', p_procedimiento, 'metodo', p_metodo, 'soporte', v_ref, 'payment_id', v_pago.id, 'asiento', v_entry), btrim(p_motivo));

  return jsonb_build_object('payment_id', v_pago.id, 'repetida', false, 'monto', v_bruto, 'dinero', v_dinero, 'retencion_revertida', v_bruto - v_dinero,
    'retenciones_determinadas', v_det, 'causa', v_causa, 'detalle', v_detalle, 'asiento_id', v_entry, 'caja_id', v_caja,
    'saldo_disponible', (select balance from public.supplier_advances where id = v_ant.id));
end;
$function$;

-- Retención excesiva o indebida (ronda 3, causa b; ronda 4): el cálculo correcto (base y tarifa) da el exceso; se
-- reintegra al proveedor (D retención por pagar / C caja o banco). El anticipo no cambia. Exige la solicitud escrita del
-- afectado con sus pruebas, el cálculo y el certificado corregido (DUR 1.2.4.16); reteICA: el procedimiento VALIDADO del
-- municipio y sus pruebas (sin él: bloqueado). El período de descuento no se elige: renta, el del reintegro; ICA, el de
-- su procedimiento (p_periodo_descuento, si llega, debe coincidir). p_retencion elige la retención cuando hay varias de
-- la misma clase (giro y conversiones).
create or replace function public.fn_anticipo_retencion_exceso_reintegrar(
  p_anticipo uuid, p_clase text, p_base_correcta numeric, p_tarifa_correcta numeric, p_metodo text, p_clave_idempotencia text,
  p_soportes jsonb, p_periodo_descuento text, p_requiere_correccion boolean, p_motivo text, p_organization_id integer default null,
  p_cuenta_bancaria integer default null, p_referencia text default null, p_retencion uuid default null)
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
  v_tz text;
  v_hoy date;
  v_proc public.reteica_procedimientos;
  v_per jsonb;
  v_n integer;
  v_neto numeric;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '42501'; end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then raise exception 'motivo_obligatorio' using errcode = '22023'; end if;
  if length(btrim(coalesce(v_sop ->> 'calculo', ''))) < 3 or length(btrim(coalesce(v_sop ->> 'certificado', ''))) < 3 then
    raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'calculo_y_certificado';
  end if;
  -- Ronda 4: requisitos del impuesto (DUR 1.2.4.16): solicitud escrita del afectado y pruebas.
  if length(btrim(coalesce(v_sop ->> 'solicitud', ''))) < 3 or length(btrim(coalesce(v_sop ->> 'pruebas', ''))) < 3 then
    raise exception 'soporte_procedimiento_obligatorio' using errcode = '22023', detail = 'solicitud_y_pruebas';
  end if;
  if p_requiere_correccion is null then raise exception 'tratamiento_declaracion_obligatorio' using errcode = '22023'; end if;
  if p_base_correcta is null or p_base_correcta < 0 or p_tarifa_correcta is null or p_tarifa_correcta < 0 then
    raise exception 'calculo_obligatorio' using errcode = '22023';
  end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.void']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then raise exception 'sin_acceso_sucursal' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('anticipo_retencion_exceso:' || v_ant.organization_id || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_ant.organization_id and idempotency_key = p_clave_idempotencia;
  if found then
    if v_pago.source <> 'supplier_advance_withholding_refund' or v_pago.source_id <> p_anticipo::text then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'reintegro', -v_pago.amount);
  end if;

  select count(*) into v_n from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.clase = p_clase and w.valor > w.revertido;
  select * into v_w from public.supplier_advance_withholdings w
   where w.advance_id = v_ant.id and w.clase = p_clase and (p_retencion is null or w.id = p_retencion) for update;
  if v_w.id is null then raise exception 'retencion_devolucion_invalida' using errcode = '22023'; end if;
  if p_retencion is null and v_n > 1 then raise exception 'retencion_ambigua' using errcode = '22023', hint = 'Indique cuál retención (giro o conversión).'; end if;
  v_tz := coalesce(public.fn_timezone_for(v_ant.organization_id, v_ant.branch_id), 'America/Bogota');
  v_hoy := (now() at time zone v_tz)::date;
  if p_clase = 'reteica' then
    v_proc := public.fn_reteica_procedimiento_exigir(v_ant.organization_id, v_w.regla_ica_id, v_hoy, v_sop);
  end if;
  v_per := public.fn_retencion_periodo_descuento(p_clase, 'exceso', v_hoy, v_hoy, v_proc.periodo_descuento);
  if nullif(btrim(coalesce(p_periodo_descuento, '')), '') is not null and p_periodo_descuento <> v_per ->> 'periodo' then
    raise exception 'periodo_descuento_no_es_de_libre_eleccion' using errcode = '22023', detail = v_per::text;
  end if;
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
                                                            base, valor, procedimiento, soporte, causa, periodo_descuento, regla_periodo, requiere_correccion,
                                                            soportes, fecha, asiento_id, created_by)
  values (v_ant.organization_id, v_ant.id, v_w.id, 'retencion_excesiva', v_w.clase, v_w.concepto, v_w.tax_code, v_w.cuenta, p_tarifa_correcta,
          round(p_base_correcta - v_w.base, 2), -v_exceso, 'retencion_excesiva', v_sop ->> 'certificado', 'retencion_excesiva', v_per ->> 'periodo',
          v_per ->> 'regla', p_requiere_correccion, v_sop,
          case when (v_per ->> 'fecha')::date = v_hoy then now() else ((v_per ->> 'fecha')::date::timestamp + time '12:00') at time zone v_tz end,
          v_entry, v_uid);
  if p_requiere_correccion then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'correccion_declaracion',
      jsonb_build_object('payment_id', v_pago.id, 'causa', 'retencion_excesiva', 'clase', p_clase, 'exceso', v_exceso,
                         'periodos_a_revisar', jsonb_build_array(v_per ->> 'periodo')), v_uid);
  end if;
  v_neto := public.fn_retencion_neto_periodo(v_ant.organization_id, p_clase, v_per ->> 'periodo');
  if v_neto < 0 then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'descuento_retencion_siguientes_periodos',
      jsonb_build_object('payment_id', v_pago.id, 'clase', p_clase, 'periodo', v_per ->> 'periodo', 'por_descontar', -v_neto, 'regla', v_per ->> 'regla'), v_uid);
  end if;
  if extract(year from v_w.fecha at time zone v_tz)::integer <> left(v_per ->> 'periodo', 4)::integer then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'retencion_revertida_otro_anio',
      jsonb_build_object('payment_id', v_pago.id, 'clase', p_clase, 'anio_retencion', extract(year from v_w.fecha at time zone v_tz)::integer,
                         'periodo', v_per ->> 'periodo', 'revertido', v_exceso), v_uid);
  end if;
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_ant.organization_id, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'reintegro_retencion_excesiva', 'clase', p_clase, 'exceso', v_exceso, 'correcta', v_correcta, 'soportes', v_sop,
                             'periodo', v_per ->> 'periodo', 'regla_periodo', v_per ->> 'regla', 'requiere_correccion', p_requiere_correccion,
                             'asiento', v_entry), btrim(p_motivo));
  return jsonb_build_object('payment_id', v_pago.id, 'repetida', false, 'reintegro', v_exceso, 'retencion_correcta', v_correcta, 'asiento_id', v_entry,
                            'caja_id', v_caja, 'periodo_descuento', v_per ->> 'periodo', 'regla_periodo', v_per ->> 'regla');
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
     or exists (select 1 from public.supplier_advance_refunds r where r.advance_id = v_ant.id)
     or exists (select 1 from public.supplier_advance_conversions c where c.advance_id = v_ant.id) then
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
  -- Ronda 4: retención de un año que se revierte con un ajuste de otro año (el certificado de aquel año ya salió).
  if exists (select 1 from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido
               and extract(year from w.fecha at time zone v_tz) <> extract(year from v_fecha)) then
    perform public.fn_anticipo_pendiente_abrir(v_ant.organization_id, v_ant.id, 'retencion_revertida_otro_anio',
      jsonb_build_object('fecha_ajuste', v_fecha, 'causa', 'anulacion_error',
                         'anios_retencion', (select jsonb_agg(distinct extract(year from w.fecha at time zone v_tz)::integer)
                                               from public.supplier_advance_withholdings w where w.advance_id = v_ant.id and w.valor > w.revertido)), v_uid);
  end if;
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
  select a.created_at, 'anticipo'::text, g.receipt_number, a.id::text, null::timestamptz, 0::numeric,
         a.amount - coalesce((select sum(c.retencion) from public.supplier_advance_conversions c where c.advance_id = a.id), 0)
    from public.supplier_advances a left join public.payment_groups g on g.id = a.payment_group_id
   where a.organization_id = p_org and a.supplier_id = p_supplier and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
  union all
  select c.created_at, 'conversion_anticipo'::text, c.soporte, c.id::text, null::timestamptz, 0::numeric, c.retencion
    from public.supplier_advance_conversions c join public.supplier_advances a on a.id = c.advance_id
   where c.organization_id = p_org and a.supplier_id = p_supplier and c.retencion > 0
     and (auth.uid() is null or a.branch_id is null or public.app_branch_access(a.branch_id))
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
             or e.fact_key in (select 'supplier_advance_conversion:' || c.id::text from public.supplier_advance_conversions c where c.advance_id = a.id)
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

-- Igual que antes (retenciones de facturas de compra) + retenciones practicadas en anticipos (en la fecha del giro o de
-- la conversión en pago o abono) + ajustes con signo (devolución, anulación por error, reintegro de exceso, corrección de
-- retención repetida en la factura) en la fecha de su período de descuento. La factura vinculada retiene solo la base restante, así que nada se cuenta dos veces.
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
  select a.id, ((case when w.conversion_id is null then 'Anticipo ' else 'Abono del anticipo ' end) || coalesce(g.receipt_number, ''))::text, w.fecha,
         a.supplier_id::integer, a.branch_id::integer, w.concepto, w.tax_code, w.clase, w.cuenta, w.base::numeric, w.tarifa::numeric, w.valor::numeric
    from public.supplier_advance_withholdings w
    join public.supplier_advances a on a.id = w.advance_id
    left join public.payment_groups g on g.id = a.payment_group_id
   where w.organization_id = p_organization_id
     and w.fecha >= p_desde and w.fecha <= p_hasta
     and (p_branch_id is null or a.branch_id = p_branch_id)
     and (p_supplier_id is null or a.supplier_id = p_supplier_id)
  union all
  select coalesce(j.invoice_id, j.advance_id),
         ((case j.tipo when 'devolucion' then 'Ajuste por devolución del anticipo ' when 'anulacion_error' then 'Ajuste por anulación del anticipo '
                       when 'retencion_excesiva' then 'Reintegro de retención en exceso · ' else 'Corrección de retención repetida · ' end)
           || coalesce(nullif(ip.number_ext, ''), g.receipt_number, ''))::text,
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

-- Igual que 20261108120000 + tres orígenes: 'supplier_advance_withholding_refund' (el pago del reintegro apunta al
-- anticipo), 'supplier_advance_conversion' (ronda 4) y 'consignment_advance_crossing' (el cruce de 20261108121000). Sin ellos, el asiento del
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
  elsif p_source = 'supplier_advance_conversion' then
    select c.advance_id into v_anticipo from public.supplier_advance_conversions c where c.id = p_source_id::uuid;
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
                                          'supplier_advance_withholding_refund', 'consignment_advance_crossing', 'supplier_advance_conversion') then
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
                     'supplier_advance_withholding_refund', 'consignment_advance_crossing', 'supplier_advance_conversion') then
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
revoke all on function public.fn_tributario_retencion_practicar(integer, text, uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_rut_tiene(text[], text) from public, anon, authenticated;
revoke all on function public.fn_tributario_calidad_vigente(integer, integer, uuid, text, date) from public, anon, authenticated;
revoke all on function public.fn_tributario_calidades_tercero(integer, integer, uuid, date) from public, anon, authenticated;
revoke all on function public.fn_tributario_calidades_organizacion(integer, date) from public, anon, authenticated;
revoke all on function public.fn_tributario_evaluar_retencion(integer, text, jsonb, jsonb, uuid, numeric, date, boolean) from public, anon, authenticated;
revoke all on function public.fn_tributario_cobertura(jsonb, numeric) from public, anon, authenticated;
revoke all on function public.fn_tercero_calidad_tributaria_guardar_int(integer, integer, uuid, text, text, text[], date, date, date, text, text, date, text) from public, anon, authenticated;
revoke all on function public.fn_anticipo_componentes(uuid) from public, anon, authenticated;
revoke all on function public.fn_reteica_procedimiento_exigir(integer, uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.fn_retencion_periodo_descuento(text, text, date, date, text) from public, anon, authenticated;
revoke all on function public.fn_retencion_neto_periodo(integer, text, text) from public, anon, authenticated;
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
revoke all on function public.fn_cliente_calidad_tributaria_guardar(integer, uuid, text, text, text[], date, date, date, text, text, date, text) from public, anon;
revoke all on function public.fn_aiu_contrato_registrar(integer, integer, text, text, text, jsonb, text, jsonb, text, text, date, date) from public, anon;
revoke all on function public.fn_reteica_procedimiento_registrar(integer, uuid, text, text, text[], text, text, text, text, date, date) from public, anon;
revoke all on function public.fn_tributario_regla_validar(text, uuid, text, text, text, integer) from public, anon;
revoke all on function public.fn_anticipo_retencion_exceso_reintegrar(uuid, text, numeric, numeric, text, text, jsonb, text, boolean, text, integer, integer, text, uuid) from public, anon;
revoke all on function public.fn_reteica_regla_guardar(integer, uuid, text, numeric, text, date, date, numeric) from public, anon;
revoke all on function public.fn_anticipo_pendiente_resolver(uuid, text, text, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid, jsonb, boolean, uuid, date) from public, anon;
revoke all on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text, jsonb, boolean, uuid) from public, anon;
revoke all on function public.fn_anticipo_proveedor_convertir_en_pago(uuid, text, text, date, numeric, text, integer, numeric, uuid, uuid, jsonb, boolean, uuid) from public, anon;
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
grant execute on function public.fn_cliente_calidad_tributaria_guardar(integer, uuid, text, text, text[], date, date, date, text, text, date, text) to authenticated;
grant execute on function public.fn_aiu_contrato_registrar(integer, integer, text, text, text, jsonb, text, jsonb, text, text, date, date) to authenticated;
grant execute on function public.fn_reteica_procedimiento_registrar(integer, uuid, text, text, text[], text, text, text, text, date, date) to authenticated;
grant execute on function public.fn_tributario_regla_validar(text, uuid, text, text, text, integer) to authenticated;
grant execute on function public.fn_anticipo_retencion_exceso_reintegrar(uuid, text, numeric, numeric, text, text, jsonb, text, boolean, text, integer, integer, text, uuid) to authenticated;
grant execute on function public.fn_reteica_regla_guardar(integer, uuid, text, numeric, text, date, date, numeric) to authenticated;
grant execute on function public.fn_anticipo_pendiente_resolver(uuid, text, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid, jsonb, boolean, uuid, date) to authenticated;
grant execute on function public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text, jsonb, boolean, uuid) to authenticated;
grant execute on function public.fn_anticipo_proveedor_convertir_en_pago(uuid, text, text, date, numeric, text, integer, numeric, uuid, uuid, jsonb, boolean, uuid) to authenticated;
grant execute on function public.fn_anticipo_proveedor_vincular_factura(uuid, uuid, numeric, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_desvincular_factura(uuid, uuid, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_aplicar_corrigiendo(uuid, uuid, numeric, text, text, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text, jsonb) to authenticated;
grant execute on function public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer) to authenticated;
grant execute on function public.fn_anticipos_proveedor_conciliacion(integer, integer) to authenticated;
