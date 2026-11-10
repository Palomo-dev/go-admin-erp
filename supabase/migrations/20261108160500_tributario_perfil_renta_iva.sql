-- P5 y P8 del Contador, rondas 1 y 2 (docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md y
-- RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md): en el perfil tributario por vigencia, el régimen de RENTA y la condición
-- frente al IVA son campos independientes; las calidades llevan su soporte (acto y vigencia); las combinaciones
-- contradictorias de una misma vigencia se bloquean al guardar; el cambio de periodicidad del IVA a mitad de año queda
-- PENDIENTE hasta documentar hecho, norma y fecha efectiva.
-- ESCRITA, NO APLICADA (reescrita en la ronda 2). Se aplica por el MCP cuando el dueño lo ordene, DESPUÉS de
-- 20261108140500 (H2) y 20261108160000 (catálogo RUT).
-- Reversión: supabase/rollbacks/20261108160500_tributario_perfil_renta_iva_rollback.sql
-- Reglas y fundamento: docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md. La lista de bloqueos de abajo es la misma de
-- src/lib/finanzas/tributario/combinaciones.ts (una prueba de jest compara los códigos de ambas).
--
-- Aditiva sobre organization_tax_profiles (aplicada en 20261108100000):
--   · regimen_renta: ordinario · simple · especial (RTE) · no_contribuyente_declarante (ET art. 23, declara ingresos y
--     patrimonio) · no_contribuyente_no_declarante (ET art. 22). NULL = sin definir («revisar perfil»).
--   · condicion_iva: responsable · no_responsable. NULL = sin definir.
--   · gran_contribuyente + acto (resolución) y fecha desde; autorretenedor (RUT 15, autorretención ordinaria) + acto y
--     fecha; autorretencion_especial (RUT 59, ET art. 365 par. 2 y DUR 1.2.6.6) aparte; agente_retencion_iva.
--   · inc_actividad: el hecho generador del INC que aplica (ET art. 512-1).
--   · rte_tipo y rte_ingresos_superan_160000_uvt: parámetros del régimen tributario especial.
--   · no_contribuyente_naturaleza: naturaleza jurídica que sustenta la clasificación (arts. 22 y 23).
--   · responsabilidades_rut: casilla 53 (rut_responsabilidades). responsabilidades (ya existía) = códigos FE.
--   · cambio de periodicidad: motivo, hecho, norma, fecha efectiva y estado (no_aplica · pendiente_soporte · documentado).
--   · advertencias_aceptadas, requiere_revision, regimen_origen.
--   · regimen (campo combinado viejo) deja de ser obligatorio: se llena derivado para lectores viejos; NULL cuando no
--     tiene equivalente. No se borra.
-- Migración de datos CONSERVADORA (hoy hay 0 vigencias): solo lo inequívoco; lo demás NULL y «requiere_revision».
-- fn_perfil_tributario_guardar_v2 reemplaza a fn_perfil_tributario_guardar, que deja de ser ejecutable por usuarios.
--
-- RONDA 4 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «Perfil»), reescrita sin
-- aplicar:
--   · Catálogo del RUT no exhaustivo: un código de dos dígitos que no esté en rut_responsabilidades ya no se rechaza;
--     se guarda y la vigencia queda «para aclaración» (aclaraciones 'rut_codigo_fuera_de_catalogo'). 11 y 12 se
--     conservan como evidencia histórica ('rut_codigo_no_vigente'), sin tratarlos como responsabilidades actuales.
--   · SIMPLE: sigue bloqueada la autorretención de renta sobre sus ingresos propios, ordinaria (15) y especial (59), que
--     no son equivalentes (cada calidad tiene su campo). Si el RUT trae 47 con 15 o 59, el RUT es contradictorio: queda
--     «para aclaración» ('rut_simple_con_autorretencion_para_aclaracion') y NO se exige borrar el código. Las
--     operaciones por mandato no entran en esta regla: se examinan aparte (consignación).
--   · Gran contribuyente: calificación ordinaria o excepcional y fecha del acto. Ordinaria → efectos desde el 1 de enero
--     siguiente a la resolución (primer bimestre enero–febrero); excepcional → la fecha expresa del acto
--     ('gran_contribuyente_fecha_efectos'). Una vigencia que se dice gran contribuyente no puede empezar antes de esos
--     efectos ('gran_contribuyente_antes_de_efectos'), y en ella la periodicidad bimestral ya es exigible: declarar
--     cuatrimestral se BLOQUEA, no se advierte ('gran_contribuyente_no_bimestral', Res. 227 art. 1.1.4.3).
--     Un acto excepcional con efectos que no caen al inicio de un bimestre deja la vigencia «para aclaración»
--     ('gran_contribuyente_transicion_por_resolver'): la transición del período se resuelve con una decisión sustentada
--     (20261108161000), sin que el sistema invente cortes ni solapes.
--   · Motivos de cambio de periodicidad: ninguno autoriza por sí solo. Se agregan «corrección de clasificación» y
--     «acto especial» solo como descripción; todos exigen hecho, norma y fecha. «Documentado» ≠ «procedente»: la
--     procedencia es un dato aparte (cambio_periodicidad_procedencia: por_evaluar · procedente · no_procedente) que
--     registra una persona con fundamento (fn_perfil_tributario_evaluar_cambio); guardar otra vez el cambio con datos
--     distintos la devuelve a «por_evaluar».
--
-- RONDA 5 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 6 y 7), reescrita
-- sin aplicar:
--   · Gran contribuyente a mitad de bimestre: la norma no regula el caso (Res. 227 de 2025, art. 1.1.4.3). La aclaración
--     'gran_contribuyente_transicion_por_resolver' se cierra solo con la decisión estructurada de 20261108161000
--     (fn_tributario_transicion_gc_registrar: resolución y fecha, fecha de efectos, períodos de IVA y de retención
--     afectados, tramo anterior y posterior, responsable y soporte). Al guardar la vigencia, la aclaración se omite si hay
--     una decisión de esa vigencia con la misma fecha de la resolución y la misma fecha de efectos; si cambian, vuelve.
--   · Formato 2532 (Res. 227 de 2025, art. 1.1.6.3): solo si la cooperativa RECIBIÓ donaciones o cooperación
--     internacional no reembolsable. Dos columnas nuevas: rte_donaciones_cooperacion (sí / no / NULL = por confirmar) y
--     rte_donaciones_constancia (la constancia; obligatoria cuando es «no»: CONSTANCIA_2532_REQUERIDA). Una clave que no
--     venga en los datos conserva lo guardado (la pantalla actual no las envía y no debe borrarlas).
--
-- RONDA 6 DEL CONTADOR (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuesta 6), reescrita sin
-- aplicar. El dato del 2532 va POR AÑO GRAVABLE, no por vigencia del perfil: si en ese año la cooperativa recibió
-- donaciones o cooperación internacional no reembolsable, se pide el 2532; si no, la constancia de que no aplica. Las dos
-- columnas de la ronda 5 en organization_tax_profiles SE QUITAN de esta migración (nunca se aplicaron) y el dato pasa a
-- la tabla tributario_rte_2532_anio (una fila por organización y año gravable), que escribe solo
-- fn_tributario_2532_registrar (finance.approve o admin.full_access; «no recibió» exige la constancia:
-- CONSTANCIA_2532_REQUERIDA). fn_perfil_tributario_guardar_v2 ya no lee esas claves (si llegan, se ignoran).

alter table public.organization_tax_profiles
  add column if not exists regimen_renta text
    check (regimen_renta in ('ordinario', 'simple', 'especial', 'no_contribuyente_declarante', 'no_contribuyente_no_declarante')),
  add column if not exists condicion_iva text check (condicion_iva in ('responsable', 'no_responsable')),
  add column if not exists gran_contribuyente boolean,
  add column if not exists gran_contribuyente_acto text,
  add column if not exists gran_contribuyente_desde date,
  add column if not exists autorretenedor boolean,
  add column if not exists autorretenedor_acto text,
  add column if not exists autorretenedor_acto_fecha date,
  add column if not exists autorretencion_especial boolean,
  add column if not exists agente_retencion_iva boolean,
  add column if not exists inc_actividad text
    check (inc_actividad in ('restaurantes_bares', 'telefonia_datos', 'vehiculos_y_bienes', 'bolsas_plasticas', 'cannabis', 'otra')),
  add column if not exists rte_tipo text check (rte_tipo in ('calificada_art19', 'cooperativa_art19_4', 'otra')),
  add column if not exists rte_ingresos_superan_160000_uvt boolean,
  add column if not exists no_contribuyente_naturaleza text,
  add column if not exists responsabilidades_rut text[] not null default '{}'::text[],
  add column if not exists motivo_cambio_periodicidad text
    check (motivo_cambio_periodicidad in ('inicio_actividades', 'ingreso_simple', 'salida_simple', 'designacion_gran_contribuyente',
                                          'correccion_clasificacion', 'acto_especial', 'otro')),
  add column if not exists cambio_periodicidad_hecho text,
  add column if not exists cambio_periodicidad_norma text,
  add column if not exists cambio_periodicidad_fecha date,
  add column if not exists cambio_periodicidad_estado text not null default 'no_aplica'
    check (cambio_periodicidad_estado in ('no_aplica', 'pendiente_soporte', 'documentado')),
  add column if not exists advertencias_aceptadas text[] not null default '{}'::text[],
  add column if not exists requiere_revision boolean not null default false,
  add column if not exists regimen_origen text,
  -- Ronda 4: gran contribuyente (calificación y fecha del acto), procedencia del cambio de periodicidad y aclaraciones.
  add column if not exists gran_contribuyente_calificacion text
    check (gran_contribuyente_calificacion in ('ordinaria', 'excepcional')),
  add column if not exists gran_contribuyente_acto_fecha date,
  add column if not exists cambio_periodicidad_procedencia text not null default 'por_evaluar'
    check (cambio_periodicidad_procedencia in ('por_evaluar', 'procedente', 'no_procedente')),
  add column if not exists cambio_periodicidad_evaluacion text,
  add column if not exists cambio_periodicidad_evaluado_por uuid,
  add column if not exists cambio_periodicidad_evaluado_en timestamptz,
  add column if not exists aclaraciones text[] not null default '{}'::text[];
  -- Ronda 6: el formato 2532 ya no es un dato de la vigencia (ver tributario_rte_2532_anio, al final).

alter table public.organization_tax_profiles alter column regimen drop not null;

comment on column public.organization_tax_profiles.regimen is
  'OBSOLETO (P5): campo combinado renta/IVA. Se llena derivado para lectores viejos; leer regimen_renta y condicion_iva.';
comment on column public.organization_tax_profiles.regimen_renta is
  'Régimen del impuesto sobre la renta de la vigencia. NULL = sin definir (revisar perfil).';
comment on column public.organization_tax_profiles.condicion_iva is
  'Condición frente al IVA (responsable / no responsable), independiente del régimen de renta. NULL = sin definir.';
comment on column public.organization_tax_profiles.responsabilidades is
  'Códigos de responsabilidad fiscal del DOCUMENTO ELECTRÓNICO (dian_fiscal_responsibilities). No es la casilla 53 del RUT.';
comment on column public.organization_tax_profiles.cambio_periodicidad_estado is
  'Cambio de periodicidad del IVA a mitad de año respecto de la vigencia anterior: pendiente_soporte hasta documentar hecho, norma y fecha efectiva (P8, ronda 2). «documentado» no es «procedente»: ver cambio_periodicidad_procedencia.';
comment on column public.organization_tax_profiles.cambio_periodicidad_procedencia is
  'Ronda 4: si el cambio de periodicidad documentado procede (lo registra una persona con fundamento). Ningún motivo lo autoriza por sí solo.';
comment on column public.organization_tax_profiles.gran_contribuyente_calificacion is
  'Ronda 4: ordinaria (efectos desde el 1 de enero siguiente a la resolución) o excepcional (fecha expresa del acto).';
comment on column public.organization_tax_profiles.aclaraciones is
  'Ronda 4: datos para aclaración (RUT contradictorio, código fuera del catálogo o histórico, transición por resolver). No se borran; la vigencia queda «revisar perfil».';

-- Migración de datos (idempotente: solo filas aún no migradas). Reglas:
--   'simple' → regimen_renta 'simple'; 'especial' → 'especial'; 'ordinario' y 'no_responsable_iva' → NULL (no inequívoco).
--   condicion_iva: 'no_responsable' si el campo viejo lo decía (salvo O-48: NULL); en los demás, 'responsable' solo con
--   O-48 sin O-49 y 'no_responsable' solo con O-49 sin O-48. R-99-PN no dice nada del IVA.
--   gran_contribuyente / autorretenedor / agente_retencion_iva: true si tenía O-13 / O-15 / O-23; si no, NULL. El acto
--   que los sustenta no existía: queda NULL y la vigencia, «requiere_revision».
update public.organization_tax_profiles p
   set regimen_origen = p.regimen,
       regimen_renta = case p.regimen when 'simple' then 'simple' when 'especial' then 'especial' else null end,
       condicion_iva = case
         when p.regimen = 'no_responsable_iva' then
           case when 'O-48' = any (p.responsabilidades) then null else 'no_responsable' end
         when 'O-48' = any (p.responsabilidades) and not ('O-49' = any (p.responsabilidades)) then 'responsable'
         when 'O-49' = any (p.responsabilidades) and not ('O-48' = any (p.responsabilidades)) then 'no_responsable'
         else null
       end,
       gran_contribuyente = case when 'O-13' = any (p.responsabilidades) then true else null end,
       autorretenedor = case when 'O-15' = any (p.responsabilidades) then true else null end,
       agente_retencion_iva = case when 'O-23' = any (p.responsabilidades) then true else null end,
       requiere_revision = true
 where p.regimen_origen is null
   and p.regimen is not null
   and p.regimen_renta is null
   and p.condicion_iva is null;

-- Combinaciones contradictorias de UNA vigencia (BLOQUEOS). `p_d` = los campos de la vigencia (claves en snake_case,
-- las mismas columnas). Solo lo claro; lo dudoso es advertencia (combinaciones.ts). Devuelve los códigos ordenados.
create or replace function public.fn_perfil_tributario_bloqueos(p_d jsonb)
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  with d as (
    select p_d ->> 'regimen_renta' as renta,
           p_d ->> 'condicion_iva' as iva,
           p_d ->> 'periodicidad_iva' as per,
           (p_d ->> 'gran_contribuyente')::boolean as gran,
           nullif(btrim(coalesce(p_d ->> 'gran_contribuyente_acto', '')), '') as gran_acto,
           (p_d ->> 'gran_contribuyente_desde')::date as gran_desde,
           p_d ->> 'gran_contribuyente_calificacion' as gran_calif,
           (p_d ->> 'gran_contribuyente_acto_fecha')::date as gran_acto_fecha,
           (p_d ->> 'vigente_desde')::date as vig_desde,
           (p_d ->> 'autorretenedor')::boolean as auto,
           nullif(btrim(coalesce(p_d ->> 'autorretenedor_acto', '')), '') as auto_acto,
           p_d ->> 'autorretenedor_acto_fecha' as auto_fecha,
           (p_d ->> 'autorretencion_especial')::boolean as auto_esp,
           (p_d ->> 'agente_retencion_iva')::boolean as ag_iva,
           (p_d ->> 'agente_retencion')::boolean as ag_renta,
           (p_d ->> 'responsable_inc')::boolean as inc,
           p_d ->> 'inc_actividad' as inc_act,
           p_d ->> 'rte_tipo' as rte_tipo,
           nullif(btrim(coalesce(p_d ->> 'no_contribuyente_naturaleza', '')), '') as nc_nat,
           p_d ->> 'motivo_cambio_periodicidad' as motivo,
           coalesce(array(select jsonb_array_elements_text(coalesce(p_d -> 'responsabilidades', '[]'::jsonb))), '{}'::text[]) as fe,
           coalesce(array(select jsonb_array_elements_text(coalesce(p_d -> 'responsabilidades_rut', '[]'::jsonb))), '{}'::text[]) as rut
  )
  select coalesce(array_agg(c order by c), '{}'::text[])
    from d, lateral (
      select 'falta_regimen_renta' as c where d.renta is null
      union all select 'falta_condicion_iva' where d.iva is null
      -- ET art. 437 par. 3: el no responsable no declara IVA. ET art. 600: el responsable declara por periodos.
      union all select 'no_responsable_con_periodicidad' where d.iva = 'no_responsable' and d.per <> 'no_aplica'
      union all select 'responsable_sin_periodicidad' where d.iva = 'responsable' and d.per = 'no_aplica'
      -- ET art. 600 (bimestral o cuatrimestral); la anual es la del SIMPLE (art. 915). Sin otro supuesto legal identificado.
      union all select 'periodicidad_anual_fuera_de_simple' where d.per = 'anual' and d.renta <> 'simple'
      union all select 'simple_responsable_no_anual' where d.renta = 'simple' and d.iva = 'responsable' and d.per in ('bimestral', 'cuatrimestral')
      -- Códigos del documento electrónico.
      union all select 'fe_codigo_no_validado' where 'O-48' = any (d.fe) or 'O-49' = any (d.fe)
      union all select 'fe_o47_sin_simple' where 'O-47' = any (d.fe) and d.renta <> 'simple'
      union all select 'fe_o13_sin_gran_contribuyente' where 'O-13' = any (d.fe) and d.gran is not true
      union all select 'fe_o15_sin_autorretenedor' where 'O-15' = any (d.fe) and d.auto is not true
      union all select 'fe_o23_sin_agente_iva' where 'O-23' = any (d.fe) and d.ag_iva is not true
      -- R-99-PN es residual: no corresponde ninguna otra responsabilidad.
      union all select 'fe_r99_con_otros' where 'R-99-PN' = any (d.fe) and cardinality(d.fe) > 1
      union all select 'fe_r99_con_calidades'
        where 'R-99-PN' = any (d.fe) and (d.renta = 'simple' or d.gran is true or d.auto is true or d.ag_iva is true)
      -- ET art. 911: el SIMPLE no practica retenciones ni autorretenciones (salvo pagos laborales). Ronda 4: ni la
      -- ordinaria (15) ni la especial (59) sobre sus ingresos propios; las dos se bloquean, cada una en su campo.
      union all select 'simple_con_autorretencion' where d.renta = 'simple' and (d.auto is true or d.auto_esp is true)
      -- Calidades que nacen de un acto administrativo (IN-CAC-0237 31.11 y 31.13): sin acto y fecha no se afirman.
      union all select 'gran_contribuyente_sin_acto'
        where d.gran is true and (d.gran_acto is null or d.gran_desde is null or d.gran_acto_fecha is null)
      -- Ronda 4: calificación ordinaria → efectos desde el 1 de enero siguiente a la resolución; excepcional → la fecha
      -- expresa del acto (nunca antes del acto). Res. 227 de 2025, art. 1.1.4.3.
      union all select 'gran_contribuyente_sin_calificacion' where d.gran is true and d.gran_calif is null
      union all select 'gran_contribuyente_fecha_efectos'
        where d.gran is true and d.gran_desde is not null and d.gran_acto_fecha is not null
          and ((d.gran_calif = 'ordinaria' and d.gran_desde <> make_date(extract(year from d.gran_acto_fecha)::int + 1, 1, 1))
            or (d.gran_calif = 'excepcional' and d.gran_desde < d.gran_acto_fecha))
      union all select 'gran_contribuyente_antes_de_efectos'
        where d.gran is true and d.gran_desde is not null and d.vig_desde is not null and d.vig_desde < d.gran_desde
      -- Ronda 4: ya exigible la bimestral, declarar cuatrimestral no se corrige con una advertencia. (La anual del
      -- SIMPLE no se toca aquí: sin deducir incompatibilidades automáticas, ronda 2.)
      union all select 'gran_contribuyente_no_bimestral'
        where d.gran is true and d.iva = 'responsable' and d.per = 'cuatrimestral'
      union all select 'autorretenedor_sin_acto' where d.auto is true and (d.auto_acto is null or d.auto_fecha is null)
      -- INC: depende de la actividad (ET art. 512-1).
      union all select 'inc_sin_actividad' where d.inc is true and d.inc_act is null
      -- No contribuyentes (arts. 22 y 23) y RTE: clasificación sustentada en la naturaleza jurídica.
      union all select 'no_contribuyente_sin_naturaleza' where d.renta like 'no_contribuyente%' and d.nc_nat is null
      union all select 'rte_sin_tipo' where d.renta = 'especial' and d.rte_tipo is null
      -- Gran contribuyente: ET art. 600 num. 1 (bimestral). No habilita otro cambio.
      union all select 'cambio_gran_contribuyente_no_bimestral' where d.motivo = 'designacion_gran_contribuyente' and d.per <> 'bimestral'
      -- Casilla 53 del RUT frente a los campos (IN-CAC-0237, numeral 31).
      union all select 'rut_47_y_05' where '47' = any (d.rut) and '05' = any (d.rut)
      union all select 'rut_53_sin_simple' where '53' = any (d.rut) and d.renta <> 'simple'
      union all select 'rut_iva_contradictorio'
        where ('48' = any (d.rut) and ('49' = any (d.rut) or '53' = any (d.rut)))
           or ('48' = any (d.rut) and d.iva = 'no_responsable')
           or (('49' = any (d.rut) or '53' = any (d.rut)) and d.iva = 'responsable')
      union all select 'rut_art22_con_renta'
        where d.renta = 'no_contribuyente_no_declarante' and ('04' = any (d.rut) or '05' = any (d.rut) or '06' = any (d.rut))
      union all select 'rut_13_sin_gran_contribuyente' where '13' = any (d.rut) and d.gran is not true
      -- Ronda 4: en el SIMPLE, un RUT con 15 o 59 es contradictorio: queda para aclaración (fn_perfil_tributario_aclaraciones),
      -- no se obliga a borrar el código ni a marcar una autorretención que el SIMPLE no admite.
      union all select 'rut_15_sin_autorretenedor' where '15' = any (d.rut) and d.auto is not true and d.renta is distinct from 'simple'
      union all select 'rut_59_sin_autorretencion_especial' where '59' = any (d.rut) and d.auto_esp is not true and d.renta is distinct from 'simple'
      union all select 'rut_23_sin_agente_iva' where '23' = any (d.rut) and d.ag_iva is not true
      union all select 'rut_07_sin_agente_retencion' where '07' = any (d.rut) and d.ag_renta is not true
      union all select 'rut_33_sin_inc' where '33' = any (d.rut) and d.inc is not true
    ) x;
$function$;

comment on function public.fn_perfil_tributario_bloqueos(jsonb) is
  'Combinaciones contradictorias de una vigencia del perfil tributario (P5, ronda 2). Misma lista que combinaciones.ts.';

revoke all on function public.fn_perfil_tributario_bloqueos(jsonb) from public, anon;
grant execute on function public.fn_perfil_tributario_bloqueos(jsonb) to authenticated, service_role;

-- Ronda 4: datos «para aclaración» de una vigencia. No bloquean ni se borran: la vigencia se guarda y queda «revisar
-- perfil» hasta que el Contador los aclare.
create or replace function public.fn_perfil_tributario_aclaraciones(p_d jsonb)
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with d as (
    select p_d ->> 'regimen_renta' as renta,
           (p_d ->> 'gran_contribuyente')::boolean as gran,
           p_d ->> 'gran_contribuyente_calificacion' as gran_calif,
           (p_d ->> 'gran_contribuyente_desde')::date as gran_desde,
           coalesce(array(select jsonb_array_elements_text(coalesce(p_d -> 'responsabilidades_rut', '[]'::jsonb))), '{}'::text[]) as rut
  )
  select coalesce(array_agg(c order by c), '{}'::text[])
    from d, lateral (
      -- RUT contradictorio con el SIMPLE (47 con 15 o 59): para aclaración, sin borrar.
      select 'rut_simple_con_autorretencion_para_aclaracion' as c
       where d.renta = 'simple' and ('15' = any (d.rut) or '59' = any (d.rut))
      -- 11 y 12: evidencia histórica, no responsabilidades actuales.
      union all select 'rut_codigo_no_vigente' where '11' = any (d.rut) or '12' = any (d.rut)
      -- El catálogo no es exhaustivo: un código que no conoce se conserva y se aclara.
      union all select 'rut_codigo_fuera_de_catalogo'
       where exists (select 1 from unnest(d.rut) r(codigo)
                      where not exists (select 1 from public.rut_responsabilidades x where x.codigo = r.codigo))
      -- Calificación excepcional con efectos a mitad de un bimestre: la transición se resuelve con una decisión del período.
      union all select 'gran_contribuyente_transicion_por_resolver'
       where d.gran is true and d.gran_calif = 'excepcional' and d.gran_desde is not null
         and not (extract(day from d.gran_desde) = 1 and extract(month from d.gran_desde)::int in (1, 3, 5, 7, 9, 11))
    ) x;
$function$;

comment on function public.fn_perfil_tributario_aclaraciones(jsonb) is
  'Ronda 4 del Contador: datos de una vigencia del perfil que quedan para aclaración (no bloquean ni se borran).';
revoke all on function public.fn_perfil_tributario_aclaraciones(jsonb) from public, anon;
grant execute on function public.fn_perfil_tributario_aclaraciones(jsonb) to authenticated, service_role;

-- Guardar una vigencia. Mismas reglas de fechas que fn_perfil_tributario_guardar (cierra la anterior, termina antes de la
-- siguiente, la fecha de inicio no cambia al editar), más:
--   · bloqueos → 22023 COMBINACION_CONTRADICTORIA (detail = códigos separados por coma);
--   · fecha efectiva del cambio de periodicidad distinta del inicio de la vigencia → bloqueo 'cambio_fecha_efectiva_distinta';
--   · cambio de periodicidad del IVA respecto de la vigencia anterior que no empieza el 1 de enero, entre dos
--     periodicidades declarables → cambio_periodicidad_estado 'pendiente_soporte' hasta que motivo, hecho, norma y
--     fecha efectiva estén completos ('documentado'). Se guarda, pero el Centro no lo da por bueno (P8, ronda 2).
--   · códigos del documento electrónico deben existir en su catálogo. Ronda 4: los del RUT solo deben tener la forma de
--     un código (dos dígitos); el catálogo no es exhaustivo y un código desconocido queda para aclaración.
create or replace function public.fn_perfil_tributario_guardar_v2(
  p_organization_id integer,
  p_id uuid,
  p_vigente_desde date,
  p_datos jsonb,
  p_ica jsonb,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_desde date;
  v_hasta date;
  v_siguiente date;
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_fe text[];
  v_rut text[];
  v_aceptadas text[];
  v_ica jsonb := coalesce(p_ica, '[]'::jsonb);
  v_item jsonb;
  v_bloqueos text[];
  v_anterior record;
  v_estado_cambio text := 'no_aplica';
  v_regimen_legacy text;
  v_tz text;
  v_hoy date;
  v_aclaraciones text[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.approve')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if jsonb_typeof(d) <> 'object' then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  if (d ->> 'periodicidad_iva') is null or (d ->> 'periodicidad_iva') not in ('bimestral', 'cuatrimestral', 'anual', 'no_aplica') then
    raise exception 'PERIODICIDAD_INVALIDA' using errcode = '22023';
  end if;
  v_fe := coalesce(array(select jsonb_array_elements_text(coalesce(d -> 'responsabilidades', '[]'::jsonb))), '{}'::text[]);
  v_rut := coalesce(array(select jsonb_array_elements_text(coalesce(d -> 'responsabilidades_rut', '[]'::jsonb))), '{}'::text[]);
  v_aceptadas := coalesce(array(select jsonb_array_elements_text(coalesce(d -> 'advertencias_aceptadas', '[]'::jsonb))), '{}'::text[]);
  if exists (select 1 from unnest(v_fe) r(codigo) where not exists (select 1 from public.dian_fiscal_responsibilities x where x.code = r.codigo)) then
    raise exception 'RESPONSABILIDAD_INVALIDA' using errcode = '22023';
  end if;
  -- Ronda 4: el catálogo del RUT no es exhaustivo; solo se exige la forma del código.
  if exists (select 1 from unnest(v_rut) r(codigo) where r.codigo !~ '^[0-9]{2}$') then
    raise exception 'RESPONSABILIDAD_RUT_INVALIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(v_ica) <> 'array' or jsonb_array_length(v_ica) > 50 then
    raise exception 'ICA_INVALIDO' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('organization_tax_profiles'), p_organization_id);

  if p_id is null then
    if p_vigente_desde is null then
      raise exception 'VIGENCIA_INVALIDA' using errcode = '22023';
    end if;
    v_desde := p_vigente_desde;
  else
    select vigente_desde into v_desde from public.organization_tax_profiles where id = p_id and organization_id = p_organization_id;
    if v_desde is null then
      raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
    end if;
  end if;

  -- Los CHECK de las columnas validan los valores de cada lista; aquí, las combinaciones (ronda 4: con el inicio de la
  -- vigencia, para saber si el gran contribuyente ya era exigible).
  v_bloqueos := public.fn_perfil_tributario_bloqueos(d || jsonb_build_object('vigente_desde', v_desde));
  v_aclaraciones := public.fn_perfil_tributario_aclaraciones(d);

  -- Ronda 5: la transición del gran contribuyente a mitad de bimestre se cierra con su decisión estructurada
  -- (20261108161000), si es de esta vigencia y con la misma resolución (fecha) y la misma fecha de efectos.
  if p_id is not null and 'gran_contribuyente_transicion_por_resolver' = any (v_aclaraciones)
     and to_regclass('public.tax_period_decisions') is not null then
    if exists (select 1 from public.tax_period_decisions x
                where x.organization_id = p_organization_id and x.vigencia_aplicada_id = p_id
                  and x.obligacion = 'transicion_gran_contribuyente'
                  and x.detalle ->> 'resolucion_fecha' = (d ->> 'gran_contribuyente_acto_fecha')
                  and x.detalle ->> 'fecha_efectos' = (d ->> 'gran_contribuyente_desde')) then
      v_aclaraciones := array_remove(v_aclaraciones, 'gran_contribuyente_transicion_por_resolver');
    end if;
  end if;

  if (d ->> 'cambio_periodicidad_fecha') is not null and (d ->> 'cambio_periodicidad_fecha')::date <> v_desde then
    v_bloqueos := array_append(v_bloqueos, 'cambio_fecha_efectiva_distinta');
  end if;

  -- Cambio de periodicidad a mitad de año respecto de la vigencia anterior: pendiente hasta documentarlo.
  select p.periodicidad_iva into v_anterior
    from public.organization_tax_profiles p
   where p.organization_id = p_organization_id and p.vigente_desde < v_desde and (p_id is null or p.id <> p_id)
   order by p.vigente_desde desc
   limit 1;
  if found
     and to_char(v_desde, 'MM-DD') <> '01-01'
     and v_anterior.periodicidad_iva in ('bimestral', 'cuatrimestral', 'anual')
     and (d ->> 'periodicidad_iva') in ('bimestral', 'cuatrimestral', 'anual')
     and v_anterior.periodicidad_iva <> (d ->> 'periodicidad_iva') then
    v_estado_cambio := case
      when (d ->> 'motivo_cambio_periodicidad') is not null
       and nullif(btrim(coalesce(d ->> 'cambio_periodicidad_hecho', '')), '') is not null
       and nullif(btrim(coalesce(d ->> 'cambio_periodicidad_norma', '')), '') is not null
       and (d ->> 'cambio_periodicidad_fecha') is not null
      then 'documentado' else 'pendiente_soporte' end;
  end if;

  if cardinality(v_bloqueos) > 0 then
    raise exception 'COMBINACION_CONTRADICTORIA' using errcode = '22023', detail = array_to_string(v_bloqueos, ',');
  end if;

  v_regimen_legacy := case
    when d ->> 'regimen_renta' = 'simple' then 'simple'
    when d ->> 'regimen_renta' = 'especial' then 'especial'
    when d ->> 'regimen_renta' = 'ordinario' and d ->> 'condicion_iva' = 'no_responsable' then 'no_responsable_iva'
    when d ->> 'regimen_renta' = 'ordinario' then 'ordinario'
    else null
  end;

  if p_id is null then
    if exists (select 1 from public.organization_tax_profiles where organization_id = p_organization_id and vigente_desde = v_desde) then
      raise exception 'VIGENCIA_DUPLICADA' using errcode = '23505';
    end if;
    select min(vigente_desde) into v_siguiente
      from public.organization_tax_profiles
     where organization_id = p_organization_id and vigente_desde > v_desde;
    v_hasta := case when v_siguiente is null then null else v_siguiente - 1 end;

    update public.organization_tax_profiles
       set vigente_hasta = v_desde - 1, updated_at = now(), updated_by = auth.uid()
     where organization_id = p_organization_id
       and vigente_desde < v_desde
       and (vigente_hasta is null or vigente_hasta >= v_desde);

    insert into public.organization_tax_profiles (organization_id, vigente_desde, vigente_hasta, periodicidad_iva, created_by, updated_by)
    values (p_organization_id, v_desde, v_hasta, d ->> 'periodicidad_iva', auth.uid(), auth.uid())
    returning id into v_id;
  else
    v_id := p_id;
  end if;

  update public.organization_tax_profiles
     set regimen = v_regimen_legacy,
         regimen_renta = d ->> 'regimen_renta',
         condicion_iva = d ->> 'condicion_iva',
         periodicidad_iva = d ->> 'periodicidad_iva',
         responsabilidades = v_fe,
         responsabilidades_rut = v_rut,
         gran_contribuyente = (d ->> 'gran_contribuyente')::boolean,
         gran_contribuyente_acto = nullif(left(btrim(coalesce(d ->> 'gran_contribuyente_acto', '')), 120), ''),
         gran_contribuyente_desde = (d ->> 'gran_contribuyente_desde')::date,
         gran_contribuyente_calificacion = case when (d ->> 'gran_contribuyente')::boolean then d ->> 'gran_contribuyente_calificacion' end,
         gran_contribuyente_acto_fecha = case when (d ->> 'gran_contribuyente')::boolean then (d ->> 'gran_contribuyente_acto_fecha')::date end,
         autorretenedor = (d ->> 'autorretenedor')::boolean,
         autorretenedor_acto = nullif(left(btrim(coalesce(d ->> 'autorretenedor_acto', '')), 120), ''),
         autorretenedor_acto_fecha = (d ->> 'autorretenedor_acto_fecha')::date,
         autorretencion_especial = (d ->> 'autorretencion_especial')::boolean,
         agente_retencion_iva = (d ->> 'agente_retencion_iva')::boolean,
         agente_retencion = coalesce((d ->> 'agente_retencion')::boolean, false),
         responsable_inc = coalesce((d ->> 'responsable_inc')::boolean, false),
         inc_actividad = d ->> 'inc_actividad',
         rte_tipo = d ->> 'rte_tipo',
         rte_ingresos_superan_160000_uvt = (d ->> 'rte_ingresos_superan_160000_uvt')::boolean,
         no_contribuyente_naturaleza = nullif(left(btrim(coalesce(d ->> 'no_contribuyente_naturaleza', '')), 300), ''),
         motivo_cambio_periodicidad = d ->> 'motivo_cambio_periodicidad',
         cambio_periodicidad_hecho = nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_hecho', '')), 1000), ''),
         cambio_periodicidad_norma = nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_norma', '')), 300), ''),
         cambio_periodicidad_fecha = (d ->> 'cambio_periodicidad_fecha')::date,
         cambio_periodicidad_estado = v_estado_cambio,
         -- Ronda 4: «documentado» no es «procedente». La procedencia registrada se conserva solo si el cambio no se tocó.
         cambio_periodicidad_procedencia = case
           when v_estado_cambio = 'no_aplica' then 'por_evaluar'
           when motivo_cambio_periodicidad is not distinct from (d ->> 'motivo_cambio_periodicidad')
            and cambio_periodicidad_hecho is not distinct from nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_hecho', '')), 1000), '')
            and cambio_periodicidad_norma is not distinct from nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_norma', '')), 300), '')
            and cambio_periodicidad_fecha is not distinct from (d ->> 'cambio_periodicidad_fecha')::date
            and periodicidad_iva is not distinct from (d ->> 'periodicidad_iva')
           then cambio_periodicidad_procedencia
           else 'por_evaluar' end,
         cambio_periodicidad_evaluacion = case
           when v_estado_cambio <> 'no_aplica'
            and motivo_cambio_periodicidad is not distinct from (d ->> 'motivo_cambio_periodicidad')
            and cambio_periodicidad_hecho is not distinct from nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_hecho', '')), 1000), '')
            and cambio_periodicidad_norma is not distinct from nullif(left(btrim(coalesce(d ->> 'cambio_periodicidad_norma', '')), 300), '')
            and cambio_periodicidad_fecha is not distinct from (d ->> 'cambio_periodicidad_fecha')::date
            and periodicidad_iva is not distinct from (d ->> 'periodicidad_iva')
           then cambio_periodicidad_evaluacion end,
         advertencias_aceptadas = v_aceptadas,
         aclaraciones = v_aclaraciones,
         requiere_revision = cardinality(v_aclaraciones) > 0,
         notas = nullif(left(btrim(coalesce(p_notas, '')), 1000), ''),
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_id and organization_id = p_organization_id
   returning id, vigente_desde, vigente_hasta into v_id, v_desde, v_hasta;

  delete from public.organization_tax_profile_ica where profile_id = v_id;
  for v_item in select * from jsonb_array_elements(v_ica) loop
    if not exists (select 1 from public.municipalities m where m.id = (v_item ->> 'municipality_id')::uuid) then
      raise exception 'MUNICIPIO_INVALIDO' using errcode = '22023';
    end if;
    insert into public.organization_tax_profile_ica (organization_id, profile_id, municipality_id, periodicidad, tarifa_por_mil, actividad)
    values (
      p_organization_id, v_id, (v_item ->> 'municipality_id')::uuid, v_item ->> 'periodicidad',
      nullif(v_item ->> 'tarifa_por_mil', '')::numeric, nullif(left(btrim(coalesce(v_item ->> 'actividad', '')), 200), '')
    );
  end loop;

  -- Si la vigencia guardada rige hoy, la ficha de la empresa queda con sus códigos del documento electrónico. Los
  -- documentos expedidos usan su instantánea (20261108161500); los demás, la vigencia de su fecha (H2).
  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  v_hoy := (now() at time zone v_tz)::date;
  if v_desde <= v_hoy and (v_hasta is null or v_hasta >= v_hoy) then
    update public.organizations set fiscal_responsibilities = v_fe, updated_at = now() where id = p_organization_id;
  end if;

  return v_id;
end;
$function$;

comment on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, jsonb, jsonb, text) is
  'Crea o corrige una vigencia del perfil tributario con renta e IVA separados, calidades con soporte y bloqueo de combinaciones contradictorias (P5/P8). finance.approve o admin.full_access.';

revoke all on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, jsonb, jsonb, text) from public, anon;
grant execute on function public.fn_perfil_tributario_guardar_v2(integer, uuid, date, jsonb, jsonb, text) to authenticated;

-- Ronda 4: la procedencia de un cambio de periodicidad DOCUMENTADO la registra una persona, con fundamento. Ningún
-- motivo lo autoriza por sí solo. p_procedencia: procedente | no_procedente | por_evaluar (deshace la evaluación).
create or replace function public.fn_perfil_tributario_evaluar_cambio(
  p_organization_id integer,
  p_id uuid,
  p_procedencia text,
  p_fundamento text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila public.organization_tax_profiles;
  v_fund text := nullif(btrim(coalesce(p_fundamento, '')), '');
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.approve')
    or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_procedencia is null or p_procedencia not in ('procedente', 'no_procedente', 'por_evaluar') then
    raise exception 'PROCEDENCIA_INVALIDA' using errcode = '22023';
  end if;
  select * into v_fila from public.organization_tax_profiles where id = p_id and organization_id = p_organization_id for update;
  if v_fila.id is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  -- «Documentado» es condición, no prueba: sin hecho, norma y fecha no se evalúa.
  if v_fila.cambio_periodicidad_estado <> 'documentado' then
    raise exception 'CAMBIO_NO_DOCUMENTADO' using errcode = '22023';
  end if;
  if p_procedencia <> 'por_evaluar' and (v_fund is null or char_length(v_fund) < 10 or char_length(v_fund) > 2000) then
    raise exception 'FUNDAMENTO_REQUERIDO' using errcode = '22023';
  end if;
  update public.organization_tax_profiles
     set cambio_periodicidad_procedencia = p_procedencia,
         cambio_periodicidad_evaluacion = case when p_procedencia = 'por_evaluar' then null else v_fund end,
         cambio_periodicidad_evaluado_por = case when p_procedencia = 'por_evaluar' then null else auth.uid() end,
         cambio_periodicidad_evaluado_en = case when p_procedencia = 'por_evaluar' then null else now() end,
         updated_at = now(), updated_by = auth.uid()
   where id = v_fila.id
  returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'procedencia', v_fila.cambio_periodicidad_procedencia,
                            'evaluado_en', v_fila.cambio_periodicidad_evaluado_en);
end;
$function$;

comment on function public.fn_perfil_tributario_evaluar_cambio(integer, uuid, text, text) is
  'Ronda 4 del Contador: registra si un cambio de periodicidad documentado procede (con fundamento). «Documentado» no es «procedente». finance.approve o admin.full_access.';
revoke all on function public.fn_perfil_tributario_evaluar_cambio(integer, uuid, text, text) from public, anon;
grant execute on function public.fn_perfil_tributario_evaluar_cambio(integer, uuid, text, text) to authenticated;

-- La vía vieja (campo combinado, sin validar combinaciones) deja de estar disponible para los usuarios.
revoke execute on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) from authenticated;

-- ── Ronda 6: formato 2532 por año gravable ─────────────────────────────────────
-- Una fila por organización y año gravable: si la cooperativa del RTE recibió ese año donaciones o cooperación
-- internacional no reembolsable (Res. 227 de 2025, art. 1.1.6.3). recibio = true → el 2532 aplica; false → no aplica y
-- se exige la constancia de lo verificado. Sin fila → «por confirmar». No depende de la vigencia del perfil.
create table if not exists public.tributario_rte_2532_anio (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  anio_gravable integer not null check (anio_gravable between 2000 and 2100),
  recibio boolean not null,
  constancia text check (char_length(constancia) <= 1000),
  registrado_por uuid,
  registrado_en timestamptz not null default now(),
  constraint tributario_rte_2532_anio_unico unique (organization_id, anio_gravable),
  constraint tributario_rte_2532_anio_constancia check (recibio or constancia is not null)
);
comment on table public.tributario_rte_2532_anio is
  'Ronda 6 del Contador: formato 2532 por AÑO GRAVABLE (no por vigencia del perfil). recibio: la cooperativa recibió ese año donaciones o cooperación internacional no reembolsable; si no, constancia de lo verificado. Sin fila = por confirmar.';
alter table public.tributario_rte_2532_anio enable row level security;
drop policy if exists tributario_rte_2532_anio_select_miembros on public.tributario_rte_2532_anio;
create policy tributario_rte_2532_anio_select_miembros
  on public.tributario_rte_2532_anio for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.tributario_rte_2532_anio from anon, authenticated;
grant select on public.tributario_rte_2532_anio to authenticated;

-- p_datos: { recibio: true | false, constancia? } (la constancia es obligatoria con false). p_datos = null → quita el dato
-- del año (vuelve a «por confirmar»).
create or replace function public.fn_tributario_2532_registrar(p_organization_id integer, p_anio_gravable integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_recibio boolean := case jsonb_typeof(p_datos -> 'recibio') when 'boolean' then (p_datos ->> 'recibio')::boolean end;
  v_constancia text := nullif(btrim(coalesce(p_datos ->> 'constancia', '')), '');
  v_fila public.tributario_rte_2532_anio;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_anio_gravable is null or p_anio_gravable not between 2000 and 2100 then
    raise exception 'ANIO_INVALIDO' using errcode = '22023';
  end if;
  if p_datos is null then
    delete from public.tributario_rte_2532_anio where organization_id = p_organization_id and anio_gravable = p_anio_gravable;
    return null;
  end if;
  if v_recibio is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  if not v_recibio and v_constancia is null then
    raise exception 'CONSTANCIA_2532_REQUERIDA' using errcode = '22023';
  end if;
  if char_length(coalesce(v_constancia, '')) > 1000 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;
  insert into public.tributario_rte_2532_anio (organization_id, anio_gravable, recibio, constancia, registrado_por)
  values (p_organization_id, p_anio_gravable, v_recibio, v_constancia, auth.uid())
  on conflict (organization_id, anio_gravable) do update
    set recibio = excluded.recibio, constancia = excluded.constancia,
        registrado_por = excluded.registrado_por, registrado_en = now()
  returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('formato_2532', case when v_fila.recibio then 'aplica' else 'no_aplica' end);
end;
$function$;

comment on function public.fn_tributario_2532_registrar(integer, integer, jsonb) is
  'Ronda 6 del Contador: registra (o quita) por año gravable si la cooperativa recibió donaciones o cooperación internacional no reembolsable (formato 2532); «no» exige la constancia. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_tributario_2532_registrar(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_tributario_2532_registrar(integer, integer, jsonb) to authenticated;
