-- P5 del Contador (rondas 1 y 2: docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md y RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md):
-- separar el catálogo de responsabilidades del RUT de los códigos del documento electrónico, cotejado con FUENTE OFICIAL.
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- Reversión: supabase/rollbacks/20261108160000_tributario_catalogo_rut_y_codigos_fe_rollback.sql
-- Explicación para el Contador: docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md («Ronda 2»).
--
-- Ronda 2 (reescrita, nunca aplicada): el catálogo ya no sale de una fuente secundaria. Cada código se cotejó con el
-- instructivo OFICIAL de la DIAN «IN-CAC-0237 · Instructivo de calidad del Registro Único Tributario RUT», versión 3
-- (PDF de dian.gov.co, archivo del 2026-03-04), numeral 31 «Casilla 53. Códigos»: nombre exacto, numeral, página y el
-- marco normativo que el propio instructivo cita. Son 48 códigos. Estado «cotejado_fuente_oficial»: coincide con la
-- fuente oficial, pero NO es el visto bueno del Contador («validado», que solo él asigna).
--   · 11 y 12 (ventas régimen común/simplificado) no figuran en el instructivo: se cargan como NO vigentes y
--     «pendiente_validacion» (la DIAN los reemplazó por 48 y 49 en 2019; aún aparecen en RUT sin actualizar).
--   · 51 (que traía la fuente secundaria) no figura en el instructivo oficial: no se carga.
-- dian_fiscal_responsibilities (la tabla que YA usan clientes, proveedores y el emisor en la FE) queda como la de CÓDIGOS
-- DEL DOCUMENTO ELECTRÓNICO; solo se le agregan columnas de validación (ningún código, descripción ni payload de Factus
-- cambia). O-13, O-15, O-23, O-47 y R-99-PN: identificados en la documentación oficial, cotejo íntegro del anexo vigente
-- pendiente. O-48 y O-49: «no_validado_como_fe» (no se validan como códigos de FE solo porque existan 48 y 49 en el RUT).
-- Mapeo RUT ↔ FE solo donde la equivalencia es directa: 13, 15, 23 y 47. Sin fila para 48/49 ni para R-99-PN.

-- 1 ─ Catálogo del RUT ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rut_responsabilidades (
  codigo text primary key check (codigo ~ '^[0-9]{2}$'),
  nombre text not null check (length(btrim(nombre)) > 0),
  vigente boolean not null default true,
  estado_validacion text not null default 'pendiente_validacion'
    check (estado_validacion in ('pendiente_validacion', 'cotejado_fuente_oficial', 'validado')),
  fuente text not null check (length(btrim(fuente)) > 0),
  fuente_numeral text,
  fuente_pagina smallint,
  marco_normativo text,
  nota text,
  orden smallint not null,
  created_at timestamptz not null default now()
);

comment on table public.rut_responsabilidades is
  'Responsabilidades, calidades y atributos del RUT (casilla 53), cotejadas con el instructivo oficial IN-CAC-0237 v3 de la DIAN. Distinto de los códigos del documento electrónico (dian_fiscal_responsibilities). «validado» solo lo asigna el Contador.';

alter table public.rut_responsabilidades enable row level security;
drop policy if exists rut_responsabilidades_select on public.rut_responsabilidades;
create policy rut_responsabilidades_select on public.rut_responsabilidades for select to authenticated using (true);
revoke all on public.rut_responsabilidades from anon;
revoke insert, update, delete, truncate, references, trigger on public.rut_responsabilidades from authenticated;
grant select on public.rut_responsabilidades to authenticated;

insert into public.rut_responsabilidades (codigo, nombre, vigente, fuente_numeral, fuente_pagina, marco_normativo, orden, fuente, estado_validacion)
select v.codigo, v.nombre, v.vigente, v.numeral, v.pagina, v.marco, v.orden,
       'DIAN, IN-CAC-0237 Instructivo de calidad del RUT, versión 3, numeral ' || v.numeral || ', página ' || v.pagina,
       'cotejado_fuente_oficial'
  from (values
    ('01', 'Aporte especial para la administración de justicia', true, '31.1', 45, 'Artículo 131 de la Constitución Política, Artículo 135 de la Ley 6 de 1992, Artículo 363 de la Ley 1819 de 2016, Decreto 1890 de 1999.', 1),
    ('02', 'Gravamen a los movimientos financieros', true, '31.2', 46, 'Artículos 870 a 881 del Estatuto Tributario.', 2),
    ('03', 'Impuesto al patrimonio', true, '31.3', 46, 'Artículos 292-3, 294-2, 295-2, 296-2, 298, 298-1, 298-2, 298-6 y 298-8 del Estatuto Tributario', 3),
    ('04', 'Impuesto sobre la renta y complementario régimen tributario especial', true, '31.4', 47, 'Artículos 19 a 19-5, 356, 356-1, 356-2, 356-3, 357, 358, 359, 361, 362,363, 334,364-1, 364-2, 364-3, 364-4, 364-5 y 364-6 del Estatuto Tributario, Artículos 1.2.1.5.1.3, al 1.2.1.5.1.19 del Decreto 1625 de 2016, Resolución DIAN 000019 de 2018.', 4),
    ('05', 'Impuesto sobre la renta y complementario régimen ordinario', true, '31.5', 48, 'Libro Primero del Estatuto Tributario', 5),
    ('06', 'Declaración de Ingresos y patrimonio', true, '31.6', 49, 'Artículos 23 y 598 del Estatuto Tributario', 6),
    ('07', 'Retención en la fuente a título de renta', true, '31.7', 50, 'Artículo 368, 368-2, 383, 392, 395, 401 y 406 del Estatuto Tributario, numeral 2.11 del concepto General unificado 912 de 2018.', 7),
    ('08', 'Retención Impuesto de timbre nacional', true, '31.8', 51, 'Libro Cuarto del Estatuto Tributario, Decreto 175 de 2025.', 8),
    ('09', 'Retención en la fuente en el impuesto sobre las ventas', true, '31.9', 51, 'Artículos 437-1, 437-2, 437-3, 437-4 y 437-5 del Estatuto Tributario', 9),
    ('10', 'Obligado aduanero', true, '31.10', 53, 'Parágrafo 1 del Artículo 1.6.1.2.1. del Decreto 1625 de 2016, Decreto 1165 de 2019.', 10),
    ('13', 'Gran contribuyente', true, '31.11', 54, 'Resolución DIAN 001253 de 2022, Resolución DIAN 000191 de 2024 y Artículo 562 del Estatuto Tributario.', 13),
    ('14', 'Informante de Exógena', true, '31.12', 54, 'Artículos 623, 623-1, 623-2, 623-2 (sic), 623-3, 624, 625, 626, 627, 628,629, 629-1, 630, 631, 631-1, 631-2, 631-3, 631-4, 631-5, 631-6 y 633 del Estatuto Tributario, Artículo 58 de la Ley 863 de 2003 y Artículo 23 de la Ley 1257 de 2008 DIAN 162 de 2023 y sus modificatorias. Resoluciones DIAN 180 de 2024 y 204 de 2025.', 14),
    ('15', 'Autoretenedor', true, '31.13', 55, 'Parágrafo 1 del artículo 368 del Estatuto Tributario, Resolución DIAN 005707 de 2019, Resolución DIAN 000026 de 2024, Resolución 211 de 15 de mayo de 2025 y Artículos 1.2.6.2, 1.2.6.6, 1.2.6.8 de Decreto Único Reglamentario 1625 de 2016.', 15),
    ('16', 'Obligación facturar por ingresos bienes y/o servicios excluidos', true, '31.14', 56, 'Artículos 424,439, 476 del Estatuto Tributario; Artículos 1.6.1.4.1, 1.6.1.4.2, 1.6.1.4.3, 1.3.1.12.24, 1.3.1.13.1 y 1.3.1.13.17 del Decreto 1625 de 2016.', 16),
    ('17', 'Profesionales de compra y venta de divisas', true, '31.15', 56, 'Resolución DIAN 210 de 2025, Resolución Externa 1 de 2018 de la Junta Directiva del Banco de la República.', 17),
    ('18', 'Precios de transferencia', true, '31.16', 57, 'Artículos 260-1, 260-2, 260-3, 260-4, 260-5, 260-6, 260-7, 260-8, 260-9, 260-10 y 260- 11 del Estatuto Tributario. Decreto 2120 de 2017.', 18),
    ('19', 'Productor de bienes y/o servicios exentos (incluye exportadores)', true, '31.17', 58, 'Artículos 477,478, 479 480 y 481 del Estatuto Tributario, Concepto DIAN 008660 int 987 de 2024.', 19),
    ('20', 'Obtención NIT', true, '31.18', 58, 'Artículos 177-2 y 771-2 del Estatuto Tributario, Artículos 1.6.1.4.3 y 1.6.1.4.12 numeral 7 Decreto 1625 de 2016, Resolución 167 de 2021 Artículo 1 y 4, Dto. 3050 de 1997 Artículo 3', 20),
    ('21', 'Declarar ingreso o salida del país de divisas o moneda legal', true, '31.19', 59, 'Artículo 1 Resolución DIAN 1767 de 2006, artículo 82 de la Resolución Externa Banco de la República número 8 de 2000, Resolución DIAN 000063 de 2016.', 21),
    ('22', 'Obligado a cumplir deberes formales a nombre de terceros', true, '31.20', 59, 'Artículo 2 Resolución 1767 de 2006, Artículo 572 del Estatuto Tributario.', 22),
    ('23', 'Agente de retención en ventas', true, '31.21', 60, 'Numeral 2 del Artículo 437-2, 437-4 y 437-5 del Estatuto Tributario, artículos 1.3.2.1.15, y 3.2.1.1 del Decreto Único Reglamentario 1625 de 2016, Resolución 000051 de 2019.', 23),
    ('26', 'Declaración Individual Precios de Transferencia', true, '31.22', 60, 'Artículo 1.2.2.1.2. del Decreto 1625 de 2016, Artículos 260-1, 260-2, 260-5, 260-7 y 260-9 del Estatuto Tributario.', 26),
    ('32', 'Impuesto Nacional a la gasolina y al ACPM', true, '31.23', 61, 'Artículos 174 y 175 de la Ley 1607 de 2012, Artículos 218 y 2019 de la Ley 1819 de 2016, Parágrafo del Artículo 1.5.2.4.1. del Decreto 1625 de 2016, Artículos 47 y 48 de la Ley 2277 de 2022, Resolución 000007de 2024.', 32),
    ('33', 'Impuesto Nacional al Consumo', true, '31.24', 61, 'Artículos 1.5.6.1.1 al 1.5.6.3.2. Título 6 del Decreto 1625 de 2016, Artículos 512-1, 512- 2, 512-3, 512-4, 512-5, 512-6, 512-7, 512-8, 512-9, 512-10, 512-11, 512-12, 512-13, 512-14, 512-5, 512-16, 512-17, 512-18, 512-19, 512-20 y 512- 21 del Estatuto Tributario.', 33),
    ('36', 'Establecimiento Permanente', true, '31.25', 62, 'Artículos 20-1 y 20-2 del Estatuto Tributario, Artículos 1.2.1.1.4, 1.2.1.1.5, 1.2.1.3.6, 1.2.1.3.7, 1.6.1.2.1 numeral 1, 1.6.1.2.5 numeral 1, 1.6.1.2.11 numeral 8.1 y 8.2 del Decreto único reglamentario 1625 de 2016.', 36),
    ('39', 'Proveedor de Servicios Tecnológicos PST', true, '31.26', 64, 'Artículos 616-4, 684-4 del Estatuto Tributario y Capítulo 4 del Título 1 de laParte 6 del Libro 1 del Decreto 1625 de 2016 Único Reglamentario en Materia Tributaria especialmente Artículos 1.6.1.4.1 numeral 10 y 1.6.1.4.24. Resoluciones DIAN 42 de 2020, 12 de 2021 y 165 de 2023, Resoluciones DIAN 165 de 2023, 0008 de 2024', 39),
    ('41', 'Declaración anual de activos en el exterior', true, '31.27', 65, 'Artículos 574 numeral 5 y 607 del Estatuto Tributario, Ley 1739 de 2014', 41),
    ('42', 'Obligado a llevar contabilidad', true, '31.28', 66, 'Artículos 10, 19, 20, 21, 23, 28 numeral 7 del Código de Comercio, Capítulo I, II y III del Título IV del Código de Comercio. Artículos 364, 654, 655, 772, 773, 774, 775, 776, 777, 780, 781 y 782 del Estatuto Tributario, Decreto 2500 de 1986, artículos 42 y 45 del Decreto 2150 de 1995, Decreto 1878 de 2008, Decreto Ley 0019 de 2012, Decreto 2649 de 1993, articulo 2.10.3.5.10 Decreto 1071 del 26 de mayo de 2015, Ley 1314 de 2009.', 42),
    ('45', 'Autorretenedor de rendimientos financieros', true, '31.29', 66, 'Resolución DIAN 55 de 2017, Artículos 365, 368-2, 369, 370, 371, 372, 395, 396, 397-1 del Estatuto Tributario y artículos 1.2.4.2.9 al 1.2.4.2.49 del Decreto 1625 de 2016.', 45),
    ('46', 'IVA Prestadores de Servicios desde el Exterior', true, '31.30', 67, 'Estatuto Tributario, Literal c) y parágrafo 3 Artículo 420, Parágrafo 2 Artículo 437, numerales 3 y 8 y parágrafo 3 del Artículo 437-2, Resolución 51 de 2018, numeral 3 del Artículo 1.6.1.2.1 y parágrafo 3 del Artículo .6.1.2.11 del Decreto número 1625 de 2016.', 46),
    ('47', 'Régimen Simple de Tributación - SIMPLE', true, '31.31', 68, 'Artículos 903 al 916 del Estatuto Tributario, Titulo 8 Artículo 1.5.8.1.1 y siguientes, artículos 1.5.8.4.1 al 1.5.8.4.6. y Parágrafo 3 del Artículo 1.6.1.2.10. del Decreto Único Reglamentario 1625 de 2016, Decreto 678 de 2022, Ley 2277 de 2022, Artículo 43 de la Ley 2155 de 2021, Título 8 del Decreto 1091 del 2020, Decreto 1847 de 2021, Resolución 097 de 2023, Decreto 1545 de 2024, Resolución 26 de 2021, Resolución 112 de 2020, Resolución 18 de 2020, Resolución 81 de 2019. Concepto DIAN 9741 de 2024, Concepto DIAN 10393 de 2024, Concepto Dian 100208192-24 de 2024, Corte Constitucional Sent...', 47),
    ('48', 'Impuesto sobre las ventas - IVA', true, '31.32', 70, 'Artículos 420 y siguientes del Estatuto Tributario, Capítulo I (Hecho Generador y Base Gravable) Capítulo II (Bienes y Servicios Gravados, Exentos y Excluidos) y Capítulo IV (Tarifas del Impuesto sobre las Ventas) del Decreto 1625 de 2016.', 48),
    ('49', 'No responsable de IVA', true, '31.33', 71, 'Artículo 437 del Estatuto Tributario especialmente Parágrafos 3, 4 y 5.', 49),
    ('50', 'No responsable de Consumo restaurantes y bares', true, '31.34', 72, 'Artículo 512-13 del Estatuto Tributario', 50),
    ('52', 'Facturador electrónico', true, '31.35', 72, 'Estatuto Tributario Artículos 511, 615, 616-1, 616-2, 617, 618, 652, 652-1 ,684-2, Ley 962 de 2005, en su artículo 26, Decreto Único Tributario 1625 de 2016, Sección 1 Factura Electrónica Artículos 1.6.1.4.1.1. hasta el 1.6.1.4.1.20. Resolución DIAN 000202 de 2025,Resolución DIAN 119 de 2024, Resolución DIAN 008 de 2024, Resolución DIAN 000189 de 2024, Resolución DIAN 165 de 2023. Decreto 442 de 2023, Resolución 85 de 2022, Resolución 000013 de 2021, Concepto 106 Unificado Obligación de facturar y sistema de facturación electrónica de agosto de 2022.', 52),
    ('53', 'Persona Jurídica No Responsable de IVA', true, '31.36', 73, 'Parágrafo 4 del Artículo 437 del Estatuto Tributario. Título III Impuesto Unificado bajo el Régimen Simple de Tributación Ley 2277 de 2022, Estatuto Tributario Artículos 903 ­ 916, Decreto 001091 de 2020, Decreto 1847 de 2021.', 53),
    ('54', 'Intercambio automático de Información CRS', true, '31.37', 73, 'Ley 1661 de 2013, Resolución 078 de 2020, Resolución 44 de 2021, Anexo I, II y III, Esquema XSD, Estándar para el Intercambio Automático de Información, Manual de Implementación, Jurisdicciones Participantes (MCAA - CRS).', 54),
    ('55', 'Informante de Beneficiarios Finales', true, '31.38', 73, 'Artículos 631-5 y 631-6 del Estatuto Tributario, Artículo 1.6.1.2.4 numeral 6, del Decreto 1625 de 2016, Artículo 16 y 17 de la Ley 2155 de 2021, Artículo 12 y 13 de la Ley 2195 de 2022, Resolución DIAN 6 de 2025, Resolución DIAN 164 de 2021 y anexo técnico, Resolución DIAN 037 de 2022, Resolución DIAN 001240 de 2022, Resolución DIAN 108 de 2023, Resolución DIAN 109 de 2024 y Resolución DIAN 196 de 2024.', 55),
    ('56', 'Impuesto Nacional al Carbono', true, '31.39', 74, 'Artículos 221, 222 y 223 de la Ley 1819 de 2016, Artículos 47, 48 y 49 de la Ley 2277 de 2022, Artículos 1.5.5.1. al 1.5.5.9. del Decreto Único Reglamentario 1625 de 2016. Resoluciones DIAN 08 de 2025 y 07 de 2024.', 56),
    ('58', 'Intercambio Automático de Información FATCA', true, '31.40', 74, 'Artículo 4 de la Ley 1666 de 2013, Artículo 631-4 del Estatuto Tributario, Resolución 60 de 2015, Anexo I y II, Resolución 0003 de 2016 y Resolución 086 de 2016.', 58),
    ('59', 'Autorretención especial renta', true, '31.41', 75, 'Parágrafo 2 del Artículo 365 del Estatuto Tributario y el Artículo 1.2.6.6.del Decreto 1625 de 2016, el Artículo 114-1 del Estatuto Tributario adicionado por el Artículo 65 de la Ley 1819 de 2016', 59),
    ('60', 'Autorretención por concepto de intereses y rendimientos financieros de entidades vigiladas por la Superintendencia Financiera de Colombia', true, '31.42', 76, 'Artículo 1.2.4.2.43, numeral 1 del Artículo 1.2.4.2.84. y parágrafo 2 del Artículo 1.2.4.2.85 del Decreto 1625 de 2016.', 60),
    ('61', 'Autorretención por concepto de comisiones de entidades vigiladas por la Superintendencia Financiera de Colombia', true, '31.43', 77, 'Artículo 1.2.4.3.3. del Decreto 1625 de 2016', 61),
    ('62', 'Impuesto nacional sobre productos plásticos de un solo uso utilizados para envasar, embalar o empacar bienes', true, '31.44', 77, 'Artículos 50, 51, 52 y 53 de la Ley 2277 de 2022.', 62),
    ('63', 'Impuesto a las bebidas ultraprocesadas azucaradas', true, '31.45', 77, 'Artículo 513-1, 513-2, 513-3, 513-4, 513-5 del Estatuto Tributario, Ley 2277 de 2022 Artículo 54, Resolución 158 del 25 de 2023, Resolución DIAN 11336 de 2023 Artículos 2 y 4. Concepto DIAN 019339 - interno 1124 de 2023.', 63),
    ('64', 'Impuesto a los productos comestibles ultraprocesados industrialmente y/o con alto contenido de azúcares añadidos, sodio o grasas saturadas', true, '31.46', 78, 'Artículos 513-6, 513-7, 513-8, 513-9, 513-10 del Estatuto Tributario, Ley 2277 de 2022 el Artículo 54 Capitulo II, Resolución 158 del 25 de 2023, Decreto 1625 de 2016 Artículo 1.6.1.13.2.55.', 64),
    ('65', 'Renta Presencia económica significativa en Colombia -PES', true, '31.47', 79, 'Ley 2277 de 2022 Artículo 57, Decreto 2039 de 2023, Artículo 20-3 del Estatuto Tributario, Decreto 1625 de 2016 sección 4 Artículos 1.2.1.28.4.1 al 1.2.1.28.4.11.', 65),
    ('66', 'Intercambio Automático de Información DPI', true, '31.48', 80, 'Ley 1661 de 2013, Artículo 15 de la Ley 2155 de 2021 y el Artículo 631-4 del Estatuto Tributario, Resolución DIAN 199 de 2024.', 66)
  ) as v(codigo, nombre, vigente, numeral, pagina, marco, orden)
on conflict (codigo) do nothing;

insert into public.rut_responsabilidades (codigo, nombre, vigente, estado_validacion, fuente, nota, orden)
values
  ('11', 'Ventas régimen común', false, 'pendiente_validacion', 'No figura en IN-CAC-0237 v3; código histórico',
   'Reemplazado por 48 (Ley 1943 de 2018, actualización masiva del RUT de 2019). Aún aparece en RUT no actualizados.', 11),
  ('12', 'Ventas régimen simplificado', false, 'pendiente_validacion', 'No figura en IN-CAC-0237 v3; código histórico',
   'Reemplazado por 49. Aún aparece en RUT no actualizados.', 12)
on conflict (codigo) do nothing;

-- 2 ─ Códigos del documento electrónico (tabla existente) ──────────────────────────────────────────────────────────
alter table public.dian_fiscal_responsibilities
  add column if not exists estado_validacion text not null default 'pendiente_validacion'
    check (estado_validacion in ('pendiente_validacion', 'validado', 'no_validado_como_fe')),
  add column if not exists nombre_anexo text,
  add column if not exists fuente text,
  add column if not exists nota text;

comment on table public.dian_fiscal_responsibilities is
  'Códigos de responsabilidad fiscal del DOCUMENTO ELECTRÓNICO (anexo técnico de FE). No es el catálogo del RUT (rut_responsabilidades). Pendiente de validación del Contador.';

update public.dian_fiscal_responsibilities d
   set estado_validacion = case when d.code in ('O-48', 'O-49') then 'no_validado_como_fe' else 'pendiente_validacion' end,
       nombre_anexo = case d.code when 'R-99-PN' then 'No aplica – Otros (por confirmar en el anexo vigente)' else d.nombre_anexo end,
       fuente = case when d.code in ('O-48', 'O-49')
                  then 'No figura entre las responsabilidades de FE identificadas por la DIAN; no se valida como código de FE por existir 48/49 en el RUT'
                  else 'DIAN, preguntas frecuentes de reglas de validación de FE (Resolución 000042 de 2020); cotejo íntegro del anexo vigente (1.9, Resolución 000165 de 2023) pendiente'
                end,
       nota = case d.code
                when 'R-99-PN' then 'Residual: aplica cuando no corresponde ninguna otra responsabilidad. No se combina con las demás y NO significa «no responsable de IVA».'
                when 'O-48' then 'No validado como código de FE. La condición de responsable de IVA se lleva en el perfil (RUT 48).'
                when 'O-49' then 'No validado como código de FE. La condición de no responsable de IVA se lleva en el perfil (RUT 49 o 53).'
                else null
              end
 where d.fuente is null;

-- 3 ─ Mapeo RUT ↔ código FE (solo equivalencias directas) ─────────────────────────────────────────────────────────
create table if not exists public.rut_fe_responsabilidad_mapeo (
  rut_codigo text not null references public.rut_responsabilidades(codigo),
  fe_codigo text not null references public.dian_fiscal_responsibilities(code),
  relacion text not null check (relacion in ('equivalente')),
  estado_validacion text not null default 'pendiente_validacion' check (estado_validacion in ('pendiente_validacion', 'validado')),
  nota text,
  primary key (rut_codigo, fe_codigo)
);

comment on table public.rut_fe_responsabilidad_mapeo is
  'Correspondencia explícita RUT ↔ código del documento electrónico. Sin fila = sin equivalencia (48/49 ↔ O-48/O-49 no se validan; R-99-PN es residual).';

alter table public.rut_fe_responsabilidad_mapeo enable row level security;
drop policy if exists rut_fe_responsabilidad_mapeo_select on public.rut_fe_responsabilidad_mapeo;
create policy rut_fe_responsabilidad_mapeo_select on public.rut_fe_responsabilidad_mapeo for select to authenticated using (true);
revoke all on public.rut_fe_responsabilidad_mapeo from anon;
revoke insert, update, delete, truncate, references, trigger on public.rut_fe_responsabilidad_mapeo from authenticated;
grant select on public.rut_fe_responsabilidad_mapeo to authenticated;

insert into public.rut_fe_responsabilidad_mapeo (rut_codigo, fe_codigo, relacion)
values ('13', 'O-13', 'equivalente'), ('15', 'O-15', 'equivalente'), ('23', 'O-23', 'equivalente'), ('47', 'O-47', 'equivalente')
on conflict (rut_codigo, fe_codigo) do nothing;
