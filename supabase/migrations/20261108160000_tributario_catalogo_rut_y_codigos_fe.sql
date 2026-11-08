-- P5 del Contador (docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md): separar el catálogo de responsabilidades
-- del RUT de los códigos que se usan en el documento electrónico. «Los siete códigos descritos no representan todo el
-- RUT» y «R-99-PN no equivale automáticamente a "no responsable de IVA"».
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- Reversión: supabase/rollbacks/20261108160000_tributario_catalogo_rut_y_codigos_fe_rollback.sql
-- Explicación para el Contador: docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md
--
-- Tres piezas, todas aditivas:
--   1. rut_responsabilidades: catálogo de la casilla 53 del RUT (código de dos dígitos y nombre). Dato de referencia de
--      la plataforma (sin organization_id): lectura para usuarios con sesión, escritura solo service_role.
--      Fuente de los nombres: listado público de códigos del RUT (Gerencie.com, «Códigos de responsabilidades en el
--      RUT», modificado el 2026-09-23, que cita el ET arts. 555-2 y 658-3 y el DUR 1625 de 2016 art. 1.2.6.6), cotejado
--      con la página de trámites de la DIAN para el código 05. NO es la transcripción del formulario oficial: por eso
--      cada fila nace «pendiente_validacion» hasta que el Contador la coteje con el RUT/MUISCA vigente.
--      Los códigos 11 y 12 (ventas régimen común/simplificado) se reemplazaron por 48 y 49 y se cargan como no
--      vigentes porque aún aparecen RUT con la numeración vieja.
--   2. dian_fiscal_responsibilities (la tabla que YA usan clientes, proveedores y el emisor en la FE) queda como la
--      tabla de CÓDIGOS DEL DOCUMENTO ELECTRÓNICO. Se le agregan columnas de validación; no se cambia ningún código ni
--      descripción, ni el payload de Factus. Según la DIAN (preguntas frecuentes de reglas de validación de FE, tabla de
--      responsabilidades fiscales del anexo técnico, Resolución 000042 de 2020) quedan vigentes cinco: O-13, O-15,
--      O-23, O-47 y R-99-PN. O-48 y O-49 no están entre ellas: se marcan «no_vigente_por_confirmar» (se conservan porque
--      hay terceros guardados con ellos). Toda la tabla queda «pendiente_validacion»: el Contador la valida antes de
--      aprobar (anexo 1.9, Resolución 000165 de 2023, por confirmar).
--   3. rut_fe_responsabilidad_mapeo: correspondencia explícita RUT ↔ código FE donde existe. R-99-PN NO tiene fila: su
--      nombre en el anexo es «No aplica – Otros» (por confirmar), no «no responsable de IVA».

-- 1 ─ Catálogo del RUT ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rut_responsabilidades (
  codigo text primary key check (codigo ~ '^[0-9]{2}$'),
  nombre text not null check (length(btrim(nombre)) > 0),
  vigente boolean not null default true,
  estado_validacion text not null default 'pendiente_validacion'
    check (estado_validacion in ('pendiente_validacion', 'validado')),
  fuente text not null check (length(btrim(fuente)) > 0),
  nota text,
  orden smallint not null,
  created_at timestamptz not null default now()
);

comment on table public.rut_responsabilidades is
  'Catálogo de responsabilidades, calidades y atributos del RUT (casilla 53). Distinto de los códigos del documento electrónico (dian_fiscal_responsibilities). Lo valida el Contador antes de aprobarse.';

alter table public.rut_responsabilidades enable row level security;
drop policy if exists rut_responsabilidades_select on public.rut_responsabilidades;
create policy rut_responsabilidades_select on public.rut_responsabilidades for select to authenticated using (true);
revoke all on public.rut_responsabilidades from anon;
revoke insert, update, delete, truncate, references, trigger on public.rut_responsabilidades from authenticated;
grant select on public.rut_responsabilidades to authenticated;

insert into public.rut_responsabilidades (codigo, nombre, vigente, fuente, nota, orden)
select v.codigo, v.nombre, v.vigente,
       'Listado público de códigos del RUT (Gerencie.com, mod. 2026-09-23); por cotejar con el formulario RUT/MUISCA vigente',
       v.nota, v.orden
  from (values
    ('01', 'Aporte especial para la administración de justicia', true, null, 1),
    ('02', 'Gravamen a los movimientos financieros', true, null, 2),
    ('03', 'Impuesto al patrimonio', true, null, 3),
    ('04', 'Impuesto sobre la renta y complementario, régimen tributario especial', true, null, 4),
    ('05', 'Impuesto sobre la renta y complementario, régimen ordinario', true, null, 5),
    ('06', 'Ingresos y patrimonio', true, null, 6),
    ('07', 'Retención en la fuente a título de renta', true, null, 7),
    ('08', 'Retención timbre nacional', true, null, 8),
    ('09', 'Retención en la fuente en el impuesto sobre las ventas', true, null, 9),
    ('10', 'Obligado aduanero', true, null, 10),
    ('11', 'Ventas régimen común', false, 'Reemplazado por 48 (Impuesto sobre las ventas – IVA). Aún aparece en RUT no actualizados.', 11),
    ('12', 'Ventas régimen simplificado', false, 'Reemplazado por 49 (No responsable de IVA). Aún aparece en RUT no actualizados.', 12),
    ('13', 'Gran contribuyente', true, null, 13),
    ('14', 'Informante de exógena', true, null, 14),
    ('15', 'Autorretenedor', true, null, 15),
    ('16', 'Obligación de facturar por ingresos de bienes y/o servicios excluidos', true, null, 16),
    ('17', 'Profesionales de compra y venta de divisas', true, null, 17),
    ('18', 'Precios de transferencia', true, null, 18),
    ('19', 'Productor y/o exportador de bienes exentos', true, null, 19),
    ('20', 'Obtención NIT', true, null, 20),
    ('21', 'Declarar el ingreso o salida del país de divisas o moneda legal colombiana', true, null, 21),
    ('22', 'Obligado a cumplir deberes formales a nombre de terceros', true, null, 22),
    ('23', 'Agente de retención en el impuesto sobre las ventas', true, null, 23),
    ('26', 'Declaración informativa individual de precios de transferencia', true, null, 26),
    ('32', 'Impuesto nacional a la gasolina y al ACPM', true, null, 32),
    ('33', 'Impuesto nacional al consumo', true, null, 33),
    ('36', 'Establecimiento permanente', true, null, 36),
    ('39', 'Proveedor de servicios tecnológicos PST', true, null, 39),
    ('41', 'Declaración anual de activos en el exterior', true, null, 41),
    ('42', 'Obligado a llevar contabilidad', true, null, 42),
    ('45', 'Autorretenedor de rendimientos financieros', true, null, 45),
    ('46', 'IVA prestadores de servicios desde el exterior', true, null, 46),
    ('47', 'Régimen simple de tributación – SIMPLE', true, null, 47),
    ('48', 'Impuesto sobre las ventas – IVA', true, null, 48),
    ('49', 'No responsable de IVA', true, null, 49),
    ('50', 'No responsable de consumo restaurantes y bares', true, null, 50),
    ('51', 'Agente de retención impoconsumo de bienes inmuebles', true, null, 51),
    ('52', 'Facturador electrónico', true, null, 52),
    ('53', 'Persona jurídica no responsable de IVA', true, null, 53),
    ('54', 'Intercambio automático de información CRS', true, null, 54),
    ('55', 'Informante de beneficiarios finales', true, null, 55),
    ('56', 'Impuesto al carbono', true, null, 56),
    ('58', 'Intercambio automático de información FATCA', true, null, 58),
    ('59', 'Autorretención especial renta', true, null, 59),
    ('60', 'Autorretención por intereses y rendimientos financieros de entidades vigiladas por la Superintendencia Financiera', true, null, 60),
    ('61', 'Autorretención por comisiones de entidades vigiladas por la Superintendencia Financiera', true, null, 61),
    ('62', 'Impuesto nacional sobre productos plásticos', true, null, 62),
    ('63', 'Impuesto a las bebidas ultraprocesadas', true, null, 63),
    ('64', 'Impuesto a los productos comestibles ultraprocesados', true, null, 64),
    ('65', 'Renta presencia económica significativa en Colombia – PES', true, null, 65),
    ('66', 'Intercambio automático de información DPI', true, null, 66)
  ) as v(codigo, nombre, vigente, nota, orden)
on conflict (codigo) do nothing;

-- 2 ─ Códigos del documento electrónico (tabla existente) ──────────────────────────────────────────────────────────
alter table public.dian_fiscal_responsibilities
  add column if not exists estado_validacion text not null default 'pendiente_validacion'
    check (estado_validacion in ('pendiente_validacion', 'validado', 'no_vigente_por_confirmar')),
  add column if not exists nombre_anexo text,
  add column if not exists fuente text,
  add column if not exists nota text;

comment on table public.dian_fiscal_responsibilities is
  'Códigos de responsabilidad fiscal del DOCUMENTO ELECTRÓNICO (anexo técnico de FE). No es el catálogo del RUT (rut_responsabilidades). Pendiente de validación del Contador.';

update public.dian_fiscal_responsibilities d
   set estado_validacion = case when d.code in ('O-48', 'O-49') then 'no_vigente_por_confirmar' else 'pendiente_validacion' end,
       nombre_anexo = case d.code when 'R-99-PN' then 'No aplica – Otros (por confirmar en el anexo vigente)' else d.nombre_anexo end,
       fuente = 'DIAN, preguntas frecuentes de reglas de validación de FE: cinco responsabilidades vigentes (O-13, O-15, O-23, O-47, R-99-PN), Resolución 000042 de 2020; anexo 1.9 (Resolución 000165 de 2023) por confirmar',
       nota = case d.code
                when 'R-99-PN' then 'Significa que no aplica ninguna de las otras responsabilidades del documento. NO equivale a «no responsable de IVA» (RUT 49 o 53).'
                when 'O-48' then 'No figura entre los cinco códigos vigentes del documento electrónico. La condición de responsable de IVA se lleva en el perfil (RUT 48).'
                when 'O-49' then 'No figura entre los cinco códigos vigentes del documento electrónico. La condición de no responsable de IVA se lleva en el perfil (RUT 49 o 53).'
                else null
              end
 where d.fuente is null;

-- 3 ─ Mapeo RUT ↔ código FE ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rut_fe_responsabilidad_mapeo (
  rut_codigo text not null references public.rut_responsabilidades(codigo),
  fe_codigo text not null references public.dian_fiscal_responsibilities(code),
  relacion text not null check (relacion in ('equivalente', 'por_confirmar')),
  estado_validacion text not null default 'pendiente_validacion' check (estado_validacion in ('pendiente_validacion', 'validado')),
  nota text,
  primary key (rut_codigo, fe_codigo)
);

comment on table public.rut_fe_responsabilidad_mapeo is
  'Correspondencia explícita entre una responsabilidad del RUT y un código del documento electrónico. Sin fila = sin equivalencia automática (p. ej. R-99-PN).';

alter table public.rut_fe_responsabilidad_mapeo enable row level security;
drop policy if exists rut_fe_responsabilidad_mapeo_select on public.rut_fe_responsabilidad_mapeo;
create policy rut_fe_responsabilidad_mapeo_select on public.rut_fe_responsabilidad_mapeo for select to authenticated using (true);
revoke all on public.rut_fe_responsabilidad_mapeo from anon;
revoke insert, update, delete, truncate, references, trigger on public.rut_fe_responsabilidad_mapeo from authenticated;
grant select on public.rut_fe_responsabilidad_mapeo to authenticated;

insert into public.rut_fe_responsabilidad_mapeo (rut_codigo, fe_codigo, relacion, nota)
values
  ('13', 'O-13', 'equivalente', null),
  ('15', 'O-15', 'equivalente', null),
  ('23', 'O-23', 'equivalente', null),
  ('47', 'O-47', 'equivalente', null),
  ('48', 'O-48', 'por_confirmar', 'O-48 no figura entre los códigos vigentes del documento electrónico.'),
  ('49', 'O-49', 'por_confirmar', 'O-49 no figura entre los códigos vigentes del documento electrónico. RUT 53 (persona jurídica no responsable) no tiene código FE propio.')
on conflict (rut_codigo, fe_codigo) do nothing;
