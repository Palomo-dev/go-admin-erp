-- IVA · naturaleza de los «otros movimientos» de la 2408 (P4) y períodos de IVA ya declarados (operaciones
-- entre períodos). Respuestas del Contador del 2026-11-07: docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md
-- Explicación: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene, después de 20261108150000.
-- Reversión: supabase/rollbacks/20261108150500_iva_naturaleza_movimientos_y_declaraciones_rollback.sql
--
-- 1. tributario_iva_naturaleza_asiento: una persona dice de qué naturaleza es un asiento que mueve la 2408 y
--    no es de un documento con líneas (asiento manual, tesorería, reversa…), CON SU SOPORTE (tipo, número o
--    descripción y fecha; todas menos «cierre»). El borrador lo usa así (ronda 2 del Contador, 2026-11-07):
--      pago_dian, traslado_auxiliares, cierre       → NO crean IVA generado ni descontable (no afectan).
--      devolucion_compra                            → B4: exige soporte (nota crédito del proveedor o, si la compra
--                                                      fue con documento soporte, su NOTA DE AJUSTE), vínculo con la
--                                                      compra Y SUS LÍNEAS (base e IVA por línea), fecha, base e IVA,
--                                                      y que el IVA cuadre con el del asiento. Base → casilla 56
--                                                      siempre; IVA → 66 solo la parte de líneas cuyo IVA se evaluó
--                                                      descontable; el resto, pendiente.
--      ajuste_procedente                            → «por diligenciar» con su valor.
--      correccion_error (solo sobre una REVERSA)    → B6: la operación nunca existió. Ronda 3 (2026-11-08): elegir
--                                                      «corrección de error» NO basta. Para sacar la venta y su reversa
--                                                      de las casillas (si son del mismo período) hace falta TODO:
--                                                        · soporte que acredite el error (tipo, número y fecha);
--                                                        · el documento electrónico resuelto: nota crédito electrónica,
--                                                          anulación ante la DIAN o constancia (referencia y fecha);
--                                                        · la marca de si corresponde corregir una declaración anterior.
--                                                      Mientras falte algo, la venta sigue en sus casillas y la reversa
--                                                      pendiente («corrección de error incompleta»). Si el período de la
--                                                      venta ya se declaró, o la marca dice que sí, el borrador alerta.
--                                                      De otro período: pendiente.
--      importacion, otro                            → pendiente de clasificar con su valor.
--    Ronda 2 (P4): el borrador YA NO clasifica solo un pago a la DIAN por su contrapartida de banco ni un traslado
--    porque la 2408 sume cero: los muestra como «sugerido · por confirmar» y siguen pendientes hasta que una
--    persona registre la naturaleza con su soporte. Solo el cierre de ejercicio (lo genera el propio cierre) se
--    reconoce sin registro.
--    GO Admin no tiene un documento «nota crédito de compra»: la devolución en compras se contabiliza hoy con
--    un asiento y se documenta aquí con sus líneas.
-- 2. tributario_iva_declaraciones: el período de IVA que la empresa ya presentó (desde/hasta, número del
--    formulario, fecha). Lo registra una persona; el sistema nunca lo marca. Con él, el borrador señala los
--    documentos fechados en un período ya declarado que se grabaron después de declararlo.
-- Escritura solo por RPC (finance.approve o admin.full_access), con guarda de pertenencia; lectura por RLS a
-- miembros activos. Sin anon.
--
-- RONDA 4 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md), reescrita sin aplicar:
--   · IVA · 2 (devolución de compra): basta documentarla sobre el asiento existente si conserva la compra, sus líneas
--     y un soporte válido; no se exige otra nota crédito interna. El soporte es el del proveedor: en una compra, su
--     NOTA CRÉDITO (ya no se acepta un comprobante interno: DEVOLUCION_SOPORTE_INVALIDO); en documento soporte
--     electrónico, su NOTA DE AJUSTE. Para no duplicar: la misma nota del proveedor no se registra en dos asientos
--     (DEVOLUCION_DUPLICADA) y lo devuelto de una línea, sumando todos los registros, no supera su base ni su IVA
--     (DEVOLUCION_EXCEDE_LINEA). Base → casilla 56 y el impuesto recuperado → 66, por separado (borrador).
--   · IVA · 4 (operación inexistente): «corrección de error» es un EXPEDIENTE con la explicación del error y el
--     contraste de la factura, su estado electrónico (validada por la DIAN, rechazada en la VALIDACIÓN de la DIAN,
--     rechazo COMERCIAL del comprador —que no equivale a un rechazo de la DIAN—, nunca transmitida —que no descarta una
--     expedición válida en contingencia: hay que verificarlo— o expedida en contingencia), la entrega o prestación y el
--     cobro, cada uno con su soporte, y la nota crédito electrónica cuando corresponde (documento válido).
--     fn_iva_correccion_expediente_faltantes(fila) dice qué falta. COMPLETAR EL EXPEDIENTE NO RETIRA LA VENTA de las
--     casillas: hace falta una DECISIÓN explícita de tratamiento fiscal y período (fn_iva_correccion_error_decidir):
--       retirar_venta    la operación no existió y no hay documento válido: la venta sale de las casillas del período
--                        de la VENTA (que debe ser ese período fiscal: bimestre, cuatrimestre o año) y la reversa no
--                        afecta el suyo. Se impide si hay nota crédito (no se descuenta una nota y además se elimina la
--                        venta), si hubo entrega o un cobro sin devolver, si el documento es válido o si «nunca
--                        transmitida» no descartó la contingencia; si el período de la venta ya se declaró, el período
--                        decidido debe ser exactamente el declarado y se exige marcar la corrección de esa declaración.
--       nota_credito     el tratamiento es la nota crédito electrónica (devoluciones 42/79 en el período de la nota): la
--                        venta se queda en sus casillas; la reversa contable no la sustituye y queda pendiente.
--       mantener_venta   la operación sí existió: la venta se queda; la reversa queda pendiente.
--     Nunca se neutralizan dos períodos como uno: el período decidido es un período fiscal válido (no cruza años) y la
--     venta y su reversa se ubican cada una en el suyo. Si se vuelve a guardar el expediente, la decisión se borra
--     (información relevante cambió: se decide otra vez).
--   · IVA · 5 (límite que el Contador mantiene): un asiento llamado «cierre» NO se excluye solo. El cierre también se
--     registra con su soporte y una explicación de por qué ese movimiento de la 2408 no es un ajuste fiscal; mientras
--     tanto el borrador lo muestra «sugerido: cierre · por confirmar» y pendiente.
--
-- RONDA 5 DEL CONTADOR (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 2 a 4), reescrita
-- sin aplicar:
--   · «Nunca transmitida» (respuesta 2). Una marca «contingencia verificada» ya no basta (la columna se conserva, pero no
--     cuenta). El expediente pide:
--       - la CONSULTA DEL CUFE/CUDE sin resultado, con su fecha y hora (no futura) y su soporte (consulta_cufe_*). Si la
--         consulta encuentra el documento, no es «nunca transmitida» (DOCUMENTO_ENCONTRADO_EN_DIAN);
--       - la verificación de la contingencia (contingencia_soporte_tipo): el AVISO DE LA DIAN, el AVISO DEL PROVEEDOR
--         TECNOLÓGICO o el SOPORTE DE LA FALLA DEL FACTURADOR, con referencia, fecha y fin de la falla; o la constancia de
--         que no hay ninguno de esos soportes ('sin_soporte_contingencia', con la nota de lo revisado). Sin soporte de
--         contingencia, la factura se trata como NO EXPEDIDA (se informa: tratada_como_no_expedida).
--       - REGLA DE LAS 48 HORAS (Res. 227 de 2025, art. 1.5.1.5.7.1): con falla del facturador o de la DIAN la factura se
--         transmite dentro de las 48 horas siguientes. La contingencia solo se da por descartada si la consulta del
--         CUFE/CUDE se hizo después de vencidas esas 48 horas, contadas desde el fin de la falla o desde la venta, lo que
--         sea posterior (sin falla registrada, desde la venta). Antes, la decisión de retirar la venta se rechaza con
--         CONTINGENCIA_SIN_DESCARTAR (detalle «plazo_48_horas»). fn_iva_contingencia_descartada(fila, venta) lo calcula.
--   · Retirar la venta (respuesta 3):
--       - si el período de la venta ya se declaró, la corrección tiene que seguir siendo posible: la declaración registra
--         la FECHA DE VENCIMIENTO del plazo para declarar y si está EN FIRME (los registra una persona; el sistema no
--         tiene calendario ni calcula la firmeza). Sin vencimiento → DECLARACION_SIN_VENCIMIENTO; firmeza sin registrar →
--         FIRMEZA_SIN_DETERMINAR; en firme (art. 714 ET) → DECLARACION_EN_FIRME; vencido el año siguiente al vencimiento
--         (art. 589 ET) → CORRECCION_FUERA_DE_TERMINO;
--       - si hubo cobro, el SOPORTE DE LA DEVOLUCIÓN DEL DINERO y su fecha (cobro_devolucion_*);
--       - para una venta válida, la nota crédito baja el IVA en el BIMESTRE DE LA NOTA (Oficio DIAN 902997 de 2021; art.
--         484 ET): casillas 42 (base) y 79 (IVA) del borrador, como ya se hacía; la decisión «nota_credito» exige que el
--         período decidido contenga la fecha de la nota.
--   · Cierre (respuesta 4): además del soporte y la explicación, la APROBACIÓN DE UN SEGUNDO USUARIO
--     (fn_iva_naturaleza_asiento_aprobar: otra persona, distinta de quien lo registró, con finance.approve). Sin ella, el
--     cierre que mueve la 2408 queda pendiente («cierre_sin_aprobacion»). Volver a guardar el registro borra la
--     aprobación.
--
-- RONDA 6 DEL CONTADOR (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuestas 1 a 4 y 8),
-- reescrita sin aplicar:
--   · «Nunca transmitida» (respuesta 1, CAMBIO OBLIGATORIO). Si hay aviso de la DIAN, aviso del proveedor tecnológico o
--     soporte de la falla del facturador que CUBRE LA FECHA DE LA VENTA, la factura se tiene por EXPEDIDA EN CONTINGENCIA y
--     se trata con nota crédito: no se puede retirar como no expedida (DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO, detalle
--     «expedida_en_contingencia») y el expediente pide la nota crédito electrónica. Que el CUFE no aparezca pasadas las 48
--     horas no prueba que no se expidió: fue un incumplimiento de transmitir. La falla registra ahora su INICIO
--     (contingencia_inicio_en), además del fin; «cubre la fecha de la venta» = el día de la venta, en la zona horaria de la
--     organización, está entre el día del inicio y el del fin. fn_iva_contingencia_cubre_venta(fila, venta) lo calcula.
--     Solo se retira como no expedida con CONSTANCIA DE QUE NO HUBO CONTINGENCIA, con lo que se revisó
--     (contingencia_nota), Y la consulta del CUFE/CUDE sin resultado: con 'sin_soporte_contingencia', o con una falla
--     registrada que NO cubre la venta y la nota de lo revisado.
--   · 48 horas (respuesta 2, Res. 227 de 2025, art. 1.5.1.5.7.1): con falla registrada, desde que termina la falla; si la
--     venta es posterior al fin de la falla, desde la venta (greatest(fin, venta) + 48 h). SIN FALLA REGISTRADA LA REGLA NO
--     APLICA: la consulta vale desde la fecha y hora de la venta (antes: CONTINGENCIA_SIN_DESCARTAR, detalle
--     «consulta_antes_de_la_venta»). En la ronda 5 también se exigían 48 horas desde la venta sin falla: ya no.
--   · Firmeza (respuesta 3): se mantiene el registro manual con su nota. La declaración devuelve, como REFERENCIA que no
--     decide, el término general del art. 714 ET: tres años desde el vencimiento del plazo para declarar (o desde la
--     presentación, si fue extemporánea): firmeza_referencia_714. Hay términos especiales; el sistema no los calcula.
--   · Art. 589 (respuesta 4): retirar la venta de un período declarado exige registrar la SOLICITUD DE CORRECCIÓN
--     presentada ante la DIAN (número, fecha, resultado y su fecha, soporte) en la declaración (correccion_dian_*). Solo
--     la permiten «aceptada» (la DIAN practicó la liquidación oficial de corrección) y «vencido el término» (la DIAN no se
--     pronunció en los seis meses siguientes a la solicitud y el proyecto de corrección sustituyó la declaración inicial,
--     art. 589 inc. 2): en los dos casos la disminución ya produjo efecto. «En trámite» → CORRECCION_DIAN_SIN_RESULTADO;
--     «rechazada» → CORRECCION_DIAN_RECHAZADA; sin registro → CORRECCION_DIAN_SIN_REGISTRO. El término del art. 589 (un
--     año desde el vencimiento) se mide con la fecha de la SOLICITUD cuando está registrada (antes, con la de hoy).
--     «Vencido el término» exige que el resultado se registre al menos seis meses después de la solicitud
--     (CORRECCION_DIAN_TERMINO_NO_VENCIDO).
--   · Segundo usuario (respuesta 8): la aprobación de otra persona ya no es solo del cierre. La exige toda naturaleza que
--     mueve la 2408 y se propone «no afecta»: pago a la DIAN, traslado entre auxiliares, cierre y la corrección de error con
--     la decisión «retirar_venta» (su reversa y la venta salen de las casillas). Quien aprueba no es quien registró ni quien
--     decidió. Las demás naturalezas: APROBACION_NO_REQUERIDA (antes APROBACION_SOLO_CIERRE). Volver a guardar el registro,
--     decidir otra vez o quitar la decisión borra la aprobación.

-- ── 1. Naturaleza de un asiento con IVA ──────────────────────────────────────────
create table if not exists public.tributario_iva_naturaleza_asiento (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  journal_entry_id integer not null references public.journal_entries(id) on delete cascade,
  naturaleza text not null check (naturaleza in
    ('pago_dian', 'traslado_auxiliares', 'cierre', 'devolucion_compra', 'ajuste_procedente', 'correccion_error',
     'importacion', 'otro')),
  soporte_tipo text check (soporte_tipo in
    ('recibo_pago_dian', 'nota_credito_proveedor', 'nota_ajuste_documento_soporte', 'comprobante_interno', 'otro')),
  soporte text check (char_length(soporte) <= 500),
  soporte_fecha date,
  invoice_purchase_id uuid references public.invoice_purchase(id) on delete set null,
  support_document_id uuid references public.support_documents(id) on delete set null,
  base numeric(18, 2) check (base >= 0),
  iva numeric(18, 2) check (iva >= 0),
  -- Devolución de compra: [{ invoice_item_id, base, iva }] de las líneas devueltas.
  lineas jsonb check (lineas is null or jsonb_typeof(lineas) = 'array'),
  nota text check (char_length(nota) <= 500),
  -- Corrección de error (ronda 3): el documento electrónico resuelto y si corresponde corregir una declaración.
  doc_electronico_resolucion text check (doc_electronico_resolucion in ('nota_credito_electronica', 'anulacion_dian', 'constancia')),
  doc_electronico_referencia text check (char_length(doc_electronico_referencia) <= 120),
  doc_electronico_fecha date,
  corrige_declaracion_anterior boolean,
  -- Corrección de error (ronda 4): expediente estructurado.
  expediente_explicacion text check (char_length(expediente_explicacion) <= 2000),
  factura_referencia text check (char_length(factura_referencia) <= 120),
  estado_electronico text check (estado_electronico in
    ('validada_dian', 'rechazada_validacion_dian', 'rechazo_comercial_comprador', 'nunca_transmitida', 'expedida_contingencia')),
  contingencia_verificada boolean,
  contingencia_nota text check (char_length(contingencia_nota) <= 500),
  entrega_prestacion text check (entrega_prestacion in ('no_hubo', 'hubo', 'parcial')),
  entrega_soporte text check (char_length(entrega_soporte) <= 500),
  cobro text check (cobro in ('no_hubo', 'hubo_devuelto', 'hubo_sin_devolver')),
  cobro_soporte text check (char_length(cobro_soporte) <= 500),
  -- Corrección de error (ronda 5): verificación de la contingencia, consulta del CUFE/CUDE y devolución del cobro.
  contingencia_soporte_tipo text check (contingencia_soporte_tipo in
    ('aviso_dian', 'aviso_proveedor_tecnologico', 'soporte_falla_facturador', 'sin_soporte_contingencia')),
  contingencia_soporte_referencia text check (char_length(contingencia_soporte_referencia) <= 120),
  contingencia_soporte_fecha date,
  contingencia_fin_en timestamptz,
  -- Ronda 6: inicio de la falla, para saber si cubre la fecha de la venta.
  contingencia_inicio_en timestamptz,
  consulta_cufe_resultado text check (consulta_cufe_resultado in ('sin_resultado', 'encontrado')),
  consulta_cufe_en timestamptz,
  consulta_cufe_soporte text check (char_length(consulta_cufe_soporte) <= 500),
  cobro_devolucion_soporte text check (char_length(cobro_devolucion_soporte) <= 500),
  cobro_devolucion_fecha date,
  -- Cierre (ronda 5): aprobación de un segundo usuario (fn_iva_naturaleza_asiento_aprobar).
  aprobado_por uuid,
  aprobado_en timestamptz,
  aprobacion_nota text check (char_length(aprobacion_nota) <= 500),
  -- Corrección de error (ronda 4): decisión explícita de tratamiento fiscal y período (fn_iva_correccion_error_decidir).
  decision_tratamiento text check (decision_tratamiento in ('retirar_venta', 'nota_credito', 'mantener_venta')),
  decision_periodo_desde date,
  decision_periodo_hasta date,
  decision_fundamento text check (char_length(decision_fundamento) <= 2000),
  decidido_por uuid,
  decidido_en timestamptz,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tributario_iva_naturaleza_asiento_uno unique (organization_id, journal_entry_id),
  -- Ronda 4: también el cierre lleva soporte (y una explicación en «nota»): llamarlo «cierre» no basta.
  constraint tributario_iva_naturaleza_soporte_chk check (soporte is not null and soporte_fecha is not null),
  constraint tributario_iva_naturaleza_cierre_chk check (naturaleza <> 'cierre' or nota is not null),
  constraint tributario_iva_naturaleza_decision_chk check (decision_tratamiento is null or (
    naturaleza = 'correccion_error' and decision_periodo_desde is not null and decision_periodo_hasta >= decision_periodo_desde
    and decision_fundamento is not null and decidido_en is not null)),
  constraint tributario_iva_naturaleza_devolucion_chk check (naturaleza <> 'devolucion_compra' or (
    num_nonnulls(invoice_purchase_id, support_document_id) = 1 and base is not null and iva is not null
    and lineas is not null and jsonb_array_length(lineas) > 0 and soporte_tipo is not null))
);
alter table public.tributario_iva_naturaleza_asiento add column if not exists contingencia_inicio_en timestamptz;
comment on column public.tributario_iva_naturaleza_asiento.contingencia_inicio_en is
  'Ronda 6 del Contador: inicio de la falla (aviso de la DIAN o del proveedor tecnológico, o falla del facturador). Si la falla cubre la fecha de la venta, la factura se tiene por expedida en contingencia y va por nota crédito.';
comment on table public.tributario_iva_naturaleza_asiento is
  'Naturaleza fiscal de un asiento que mueve la 2408 sin ser de un documento con líneas (P4 del Contador). La fija una persona; el borrador del IVA la usa para ubicarlo. Corrección de error: expediente + decisión de tratamiento fiscal y período (ronda 4).';

-- Ronda 6: fecha y hora del asiento de la VENTA que revierte la reversa registrada (NULL si no es una reversa).
create or replace function public.fn_iva_correccion_venta_en(n public.tributario_iva_naturaleza_asiento)
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select ve.entry_date
    from public.journal_entries je
    join public.journal_entries ve on ve.id = substring(je.fact_key from 10)::integer and ve.organization_id = n.organization_id
   where je.id = n.journal_entry_id and je.organization_id = n.organization_id and je.fact_key ~ '^reversal:[0-9]+$';
$function$;

comment on function public.fn_iva_correccion_venta_en(public.tributario_iva_naturaleza_asiento) is
  'Ronda 6 del Contador: fecha y hora del asiento de la venta que revierte la reversa registrada como corrección de error.';
revoke all on function public.fn_iva_correccion_venta_en(public.tributario_iva_naturaleza_asiento) from public, anon;
grant execute on function public.fn_iva_correccion_venta_en(public.tributario_iva_naturaleza_asiento) to authenticated, service_role;

-- Ronda 6 (respuesta 1): ¿una falla registrada (aviso de la DIAN, del proveedor tecnológico o soporte de la falla del
-- facturador) cubre la FECHA de la venta? Día de la venta entre el día del inicio y el del fin, en la zona horaria de la
-- organización. Sin falla registrada, o con la falla incompleta: false. Si la cubre, la factura se tiene por expedida en
-- contingencia (nota crédito), aunque el CUFE no aparezca.
create or replace function public.fn_iva_contingencia_cubre_venta(n public.tributario_iva_naturaleza_asiento, p_venta_en timestamptz)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    n.estado_electronico = 'nunca_transmitida'
    and n.contingencia_soporte_tipo in ('aviso_dian', 'aviso_proveedor_tecnologico', 'soporte_falla_facturador')
    and n.contingencia_inicio_en is not null and n.contingencia_fin_en is not null and p_venta_en is not null
    and (p_venta_en at time zone z.tz)::date between (n.contingencia_inicio_en at time zone z.tz)::date
                                                 and (n.contingencia_fin_en at time zone z.tz)::date, false)
    from (select coalesce((select nullif(o.timezone, '') from public.organizations o where o.id = n.organization_id),
                          'America/Bogota') as tz) z;
$function$;

comment on function public.fn_iva_contingencia_cubre_venta(public.tributario_iva_naturaleza_asiento, timestamptz) is
  'Ronda 6 del Contador: la falla registrada cubre la fecha de la venta (día de la venta entre el del inicio y el del fin de la falla, en la zona de la organización): la factura se tiene por expedida en contingencia y se trata con nota crédito.';
revoke all on function public.fn_iva_contingencia_cubre_venta(public.tributario_iva_naturaleza_asiento, timestamptz) from public, anon;
grant execute on function public.fn_iva_contingencia_cubre_venta(public.tributario_iva_naturaleza_asiento, timestamptz) to authenticated, service_role;

-- Ronda 4: qué le falta al expediente de una corrección de error (vacío = completo). Lo usan la RPC de la decisión y
-- el borrador del 300; completar el expediente NO retira la venta: hace falta además la decisión.
create or replace function public.fn_iva_correccion_expediente_faltantes(n public.tributario_iva_naturaleza_asiento)
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select array_remove(array[
    case when n.soporte_tipo is null or n.soporte is null or n.soporte_fecha is null then 'soporte_del_error' end,
    case when char_length(btrim(coalesce(n.expediente_explicacion, ''))) < 20 then 'explicacion_del_error' end,
    case when n.factura_referencia is null then 'factura' end,
    case when n.estado_electronico is null then 'estado_electronico' end,
    -- Ronda 5: la contingencia se verifica con soporte (aviso de la DIAN o del proveedor tecnológico, o soporte de la
    -- falla del facturador, con referencia, fecha y fin de la falla) o con la constancia de que no hay ninguno (y la nota
    -- de lo revisado); y siempre con la consulta del CUFE/CUDE (resultado, fecha y hora, soporte).
    case when n.estado_electronico = 'nunca_transmitida' and (
              n.contingencia_soporte_tipo is null
           or (n.contingencia_soporte_tipo <> 'sin_soporte_contingencia' and (n.contingencia_soporte_referencia is null
                 or n.contingencia_soporte_fecha is null or n.contingencia_fin_en is null
                 -- Ronda 6: la falla registra su inicio (para saber si cubre la venta), anterior o igual a su fin.
                 or n.contingencia_inicio_en is null or n.contingencia_inicio_en > n.contingencia_fin_en))
           or (n.contingencia_soporte_tipo = 'sin_soporte_contingencia' and n.contingencia_nota is null))
         then 'contingencia' end,
    case when n.estado_electronico = 'nunca_transmitida'
              and (n.consulta_cufe_resultado is null or n.consulta_cufe_en is null or n.consulta_cufe_soporte is null)
         then 'consulta_cufe' end,
    case when n.entrega_prestacion is null or n.entrega_soporte is null then 'entrega_o_prestacion' end,
    case when n.cobro is null or n.cobro_soporte is null then 'cobro' end,
    -- Ronda 5: un cobro devuelto exige el soporte de la devolución del dinero.
    case when n.cobro = 'hubo_devuelto' and (n.cobro_devolucion_soporte is null or n.cobro_devolucion_fecha is null)
         then 'devolucion_del_cobro' end,
    case when (n.estado_electronico in ('validada_dian', 'rechazo_comercial_comprador', 'expedida_contingencia')
               -- Ronda 6: una falla que cubre la fecha de la venta la deja expedida en contingencia: nota crédito.
               or public.fn_iva_contingencia_cubre_venta(n, public.fn_iva_correccion_venta_en(n)))
              and n.doc_electronico_resolucion is distinct from 'nota_credito_electronica' then 'nota_credito_electronica' end,
    case when n.doc_electronico_resolucion is null or n.doc_electronico_referencia is null or n.doc_electronico_fecha is null
         then 'documento_electronico_resuelto' end,
    case when n.corrige_declaracion_anterior is null then 'corrige_declaracion_anterior' end
  ]::text[], null);
$function$;

comment on function public.fn_iva_correccion_expediente_faltantes(public.tributario_iva_naturaleza_asiento) is
  'Ronda 4 del Contador: datos que le faltan al expediente de una corrección de error (vacío = completo). Completo no retira la venta: hace falta la decisión de tratamiento fiscal y período.';
revoke all on function public.fn_iva_correccion_expediente_faltantes(public.tributario_iva_naturaleza_asiento) from public, anon;
grant execute on function public.fn_iva_correccion_expediente_faltantes(public.tributario_iva_naturaleza_asiento) to authenticated, service_role;

-- Ronda 5: ¿la contingencia de una factura «nunca transmitida» quedó descartada? Fuera de «nunca transmitida»: NULL.
-- Ronda 6 (respuestas 1 y 2): solo con CONSTANCIA DE QUE NO HUBO CONTINGENCIA y la consulta del CUFE/CUDE sin resultado:
--   · falla registrada que cubre la fecha de la venta → false (expedida en contingencia: nota crédito);
--   · 'sin_soporte_contingencia' (constancia con lo revisado): sin falla la regla de 48 horas no aplica; la consulta vale
--     desde la fecha y hora de la venta;
--   · falla registrada que NO cubre la venta: hace falta además la nota de lo revisado (contingencia_nota) y la consulta
--     hecha pasadas 48 horas desde el fin de la falla, o desde la venta si es posterior (Res. 227 de 2025, art.
--     1.5.1.5.7.1).
create or replace function public.fn_iva_contingencia_descartada(n public.tributario_iva_naturaleza_asiento, p_venta_en timestamptz)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case when n.estado_electronico is distinct from 'nunca_transmitida' then null else
    coalesce(
      not ('contingencia' = any (public.fn_iva_correccion_expediente_faltantes(n)))
      and not ('consulta_cufe' = any (public.fn_iva_correccion_expediente_faltantes(n)))
      and n.consulta_cufe_resultado = 'sin_resultado'
      and not public.fn_iva_contingencia_cubre_venta(n, p_venta_en)
      and case when n.contingencia_soporte_tipo = 'sin_soporte_contingencia'
               then n.consulta_cufe_en >= p_venta_en
               else n.contingencia_nota is not null
                    and n.consulta_cufe_en >= greatest(n.contingencia_fin_en, p_venta_en) + interval '48 hours' end, false)
  end;
$function$;

comment on function public.fn_iva_contingencia_descartada(public.tributario_iva_naturaleza_asiento, timestamptz) is
  'Rondas 5 y 6 del Contador: contingencia descartada en una factura nunca transmitida: constancia de que no hubo contingencia (con lo revisado) y consulta del CUFE/CUDE sin resultado; con falla registrada que no cubre la venta, consulta pasadas 48 horas desde el fin de la falla o desde la venta; sin falla, desde la venta. Una falla que cubre la venta nunca la descarta. NULL si el estado no es «nunca transmitida».';
revoke all on function public.fn_iva_contingencia_descartada(public.tributario_iva_naturaleza_asiento, timestamptz) from public, anon;
grant execute on function public.fn_iva_contingencia_descartada(public.tributario_iva_naturaleza_asiento, timestamptz) to authenticated, service_role;

-- ── 2. Períodos de IVA declarados ───────────────────────────────────────────────
create table if not exists public.tributario_iva_declaraciones (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  desde date not null,
  hasta date not null,
  numero_formulario text check (char_length(numero_formulario) <= 40),
  presentada_en date not null,
  nota text check (char_length(nota) <= 500),
  -- Ronda 5 (arts. 589 y 714 ET): vencimiento del plazo para declarar y firmeza, registrados por una persona. NULL = sin
  -- registrar: el sistema no los calcula ni los presume.
  vencimiento_plazo date,
  en_firme boolean,
  firmeza_nota text check (char_length(firmeza_nota) <= 500),
  firmeza_registrada_por uuid,
  firmeza_registrada_en timestamptz,
  registrada_por uuid,
  registrada_en timestamptz not null default now(),
  constraint tributario_iva_declaraciones_rango check (hasta >= desde and hasta - desde <= 366),
  constraint tributario_iva_declaraciones_vencimiento check (vencimiento_plazo is null or vencimiento_plazo > hasta),
  constraint tributario_iva_declaraciones_unica unique (organization_id, desde, hasta)
);
-- Ronda 6 (art. 589 ET): solicitud de corrección presentada ante la DIAN, con su número, fecha y resultado. Se agrega con
-- ALTER para que la migración siga siendo idempotente si la tabla ya existe.
alter table public.tributario_iva_declaraciones
  add column if not exists correccion_dian_numero text check (char_length(correccion_dian_numero) <= 60),
  add column if not exists correccion_dian_fecha date,
  add column if not exists correccion_dian_resultado text
    check (correccion_dian_resultado in ('en_tramite', 'aceptada', 'rechazada', 'vencido_termino')),
  add column if not exists correccion_dian_resultado_fecha date,
  add column if not exists correccion_dian_soporte text check (char_length(correccion_dian_soporte) <= 500),
  add column if not exists correccion_dian_registrada_por uuid,
  add column if not exists correccion_dian_registrada_en timestamptz;
alter table public.tributario_iva_declaraciones drop constraint if exists tributario_iva_declaraciones_correccion_dian;
alter table public.tributario_iva_declaraciones add constraint tributario_iva_declaraciones_correccion_dian check (
  correccion_dian_resultado is null or (
    correccion_dian_numero is not null and correccion_dian_fecha is not null and correccion_dian_soporte is not null
    and (correccion_dian_resultado = 'en_tramite' or correccion_dian_resultado_fecha >= correccion_dian_fecha)));
comment on column public.tributario_iva_declaraciones.correccion_dian_resultado is
  'Ronda 6 del Contador (art. 589 ET): resultado de la solicitud de corrección presentada ante la DIAN. Retirar una venta del período solo procede con «aceptada» o «vencido_termino» (la DIAN no se pronunció en seis meses y el proyecto sustituyó la declaración).';
comment on table public.tributario_iva_declaraciones is
  'Períodos de IVA ya presentados ante la DIAN (los registra una persona). El borrador señala documentos grabados después en esos períodos.';

alter table public.tributario_iva_naturaleza_asiento enable row level security;
alter table public.tributario_iva_declaraciones enable row level security;

drop policy if exists tributario_iva_naturaleza_asiento_select_miembros on public.tributario_iva_naturaleza_asiento;
create policy tributario_iva_naturaleza_asiento_select_miembros
  on public.tributario_iva_naturaleza_asiento for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists tributario_iva_declaraciones_select_miembros on public.tributario_iva_declaraciones;
create policy tributario_iva_declaraciones_select_miembros
  on public.tributario_iva_declaraciones for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

revoke all on public.tributario_iva_naturaleza_asiento from anon;
revoke all on public.tributario_iva_declaraciones from anon;
revoke insert, update, delete, truncate, references, trigger on public.tributario_iva_naturaleza_asiento from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.tributario_iva_declaraciones from authenticated;
grant select on public.tributario_iva_naturaleza_asiento to authenticated;
grant select on public.tributario_iva_declaraciones to authenticated;

-- ── 3. RPC: fijar o quitar la naturaleza de un asiento ──────────────────────────
-- p_datos: { naturaleza, soporte_tipo?, soporte, soporte_fecha, invoice_purchase_id? | support_document_id?,
--            base?, iva?, lineas?: [{ invoice_item_id, base, iva }], nota?,
--            corrección de error: doc_electronico_resolucion?, doc_electronico_referencia?, doc_electronico_fecha?,
--            corrige_declaracion_anterior? (true/false), expediente_explicacion?, factura_referencia?,
--            estado_electronico?, contingencia_verificada?, contingencia_nota?, entrega_prestacion?, entrega_soporte?,
--            cobro?, cobro_soporte? }   ·   p_datos = null → quita el registro.
-- La corrección de error se puede guardar incompleta (para dejar constancia del avance), pero exige el tipo de soporte.
-- Ronda 4: guardar el expediente NO retira la venta; la retira solo la decisión (fn_iva_correccion_error_decidir), y
-- volver a guardar el expediente borra la decisión anterior. El cierre exige soporte y explicación (nota).
create or replace function public.fn_iva_naturaleza_asiento_guardar(p_organization_id integer, p_journal_entry_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nat text := nullif(btrim(coalesce(p_datos ->> 'naturaleza', '')), '');
  v_sop_tipo text := nullif(btrim(coalesce(p_datos ->> 'soporte_tipo', '')), '');
  v_soporte text := nullif(btrim(coalesce(p_datos ->> 'soporte', '')), '');
  v_sop_fecha date := nullif(p_datos ->> 'soporte_fecha', '')::date;
  v_fc uuid := nullif(p_datos ->> 'invoice_purchase_id', '')::uuid;
  v_ds uuid := nullif(p_datos ->> 'support_document_id', '')::uuid;
  v_base numeric := nullif(p_datos ->> 'base', '')::numeric;
  v_iva numeric := nullif(p_datos ->> 'iva', '')::numeric;
  v_lineas jsonb := case when jsonb_typeof(p_datos -> 'lineas') = 'array' then p_datos -> 'lineas' end;
  v_nota text := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  v_res text := nullif(btrim(coalesce(p_datos ->> 'doc_electronico_resolucion', '')), '');
  v_res_ref text := nullif(btrim(coalesce(p_datos ->> 'doc_electronico_referencia', '')), '');
  v_res_fecha date := nullif(p_datos ->> 'doc_electronico_fecha', '')::date;
  v_corrige boolean := case jsonb_typeof(p_datos -> 'corrige_declaracion_anterior') when 'boolean' then (p_datos ->> 'corrige_declaracion_anterior')::boolean end;
  v_expl text := nullif(btrim(coalesce(p_datos ->> 'expediente_explicacion', '')), '');
  v_fac_ref text := nullif(btrim(coalesce(p_datos ->> 'factura_referencia', '')), '');
  v_estado text := nullif(btrim(coalesce(p_datos ->> 'estado_electronico', '')), '');
  v_cont_ver boolean := case jsonb_typeof(p_datos -> 'contingencia_verificada') when 'boolean' then (p_datos ->> 'contingencia_verificada')::boolean end;
  v_cont_nota text := nullif(btrim(coalesce(p_datos ->> 'contingencia_nota', '')), '');
  v_entrega text := nullif(btrim(coalesce(p_datos ->> 'entrega_prestacion', '')), '');
  v_entrega_sop text := nullif(btrim(coalesce(p_datos ->> 'entrega_soporte', '')), '');
  v_cobro text := nullif(btrim(coalesce(p_datos ->> 'cobro', '')), '');
  v_cobro_sop text := nullif(btrim(coalesce(p_datos ->> 'cobro_soporte', '')), '');
  -- Ronda 5: contingencia, consulta del CUFE/CUDE y devolución del cobro.
  v_cont_tipo text := nullif(btrim(coalesce(p_datos ->> 'contingencia_soporte_tipo', '')), '');
  v_cont_ref text := nullif(btrim(coalesce(p_datos ->> 'contingencia_soporte_referencia', '')), '');
  v_cont_fecha date := nullif(p_datos ->> 'contingencia_soporte_fecha', '')::date;
  v_cont_fin timestamptz := nullif(p_datos ->> 'contingencia_fin_en', '')::timestamptz;
  -- Ronda 6: inicio de la falla.
  v_cont_ini timestamptz := nullif(p_datos ->> 'contingencia_inicio_en', '')::timestamptz;
  v_cufe_res text := nullif(btrim(coalesce(p_datos ->> 'consulta_cufe_resultado', '')), '');
  v_cufe_en timestamptz := nullif(p_datos ->> 'consulta_cufe_en', '')::timestamptz;
  v_cufe_sop text := nullif(btrim(coalesce(p_datos ->> 'consulta_cufe_soporte', '')), '');
  v_dev_sop text := nullif(btrim(coalesce(p_datos ->> 'cobro_devolucion_soporte', '')), '');
  v_dev_fecha date := nullif(p_datos ->> 'cobro_devolucion_fecha', '')::date;
  v_neto numeric;
  v_fact_key text;
  v_sum_base numeric;
  v_sum_iva numeric;
  v_ajenas integer;
  v_fila public.tributario_iva_naturaleza_asiento;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  select sum(l.credit - l.debit), max(je.fact_key) into v_neto, v_fact_key
    from public.journal_entries je
    join public.journal_lines l on l.journal_entry_id = je.id and l.account_code like '2408%'
   where je.id = p_journal_entry_id and je.organization_id = p_organization_id;
  if v_neto is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if p_datos is null then
    delete from public.tributario_iva_naturaleza_asiento
     where organization_id = p_organization_id and journal_entry_id = p_journal_entry_id;
    return null;
  end if;

  if v_nat is null or v_nat not in ('pago_dian', 'traslado_auxiliares', 'cierre', 'devolucion_compra', 'ajuste_procedente',
                                    'correccion_error', 'importacion', 'otro') then
    raise exception 'NATURALEZA_INVALIDA' using errcode = '22023';
  end if;
  if v_sop_tipo is not null and v_sop_tipo not in ('recibo_pago_dian', 'nota_credito_proveedor', 'nota_ajuste_documento_soporte',
                                                   'comprobante_interno', 'otro') then
    raise exception 'SOPORTE_INVALIDO' using errcode = '22023';
  end if;
  -- Ronda 2: la naturaleza se registra con su soporte. Ronda 4: el cierre también (llamarlo «cierre» no basta), y además
  -- explica en «nota» por qué ese movimiento de la 2408 no es un ajuste fiscal.
  if v_soporte is null or v_sop_fecha is null then
    raise exception 'SOPORTE_REQUERIDO' using errcode = '22023';
  end if;
  if v_nat = 'cierre' and v_nota is null then
    raise exception 'CIERRE_REQUIERE_EXPLICACION' using errcode = '22023';
  end if;
  if char_length(coalesce(v_soporte, '')) > 500 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;
  if v_nat = 'correccion_error' and coalesce(v_fact_key, '') !~ '^reversal:[0-9]+$' then
    raise exception 'CORRECCION_SOLO_REVERSAS' using errcode = '22023';
  end if;
  if v_nat = 'correccion_error' then
    -- Ronda 3: el soporte que acredita el error lleva su tipo; la resolución del documento electrónico, uno de los tres.
    if v_sop_tipo is null then
      raise exception 'SOPORTE_REQUERIDO' using errcode = '22023';
    end if;
    if v_res is not null and v_res not in ('nota_credito_electronica', 'anulacion_dian', 'constancia') then
      raise exception 'RESOLUCION_INVALIDA' using errcode = '22023';
    end if;
    if char_length(coalesce(v_res_ref, '')) > 120 or char_length(coalesce(v_fac_ref, '')) > 120
       or char_length(coalesce(v_expl, '')) > 2000 or char_length(coalesce(v_cont_nota, '')) > 500
       or char_length(coalesce(v_entrega_sop, '')) > 500 or char_length(coalesce(v_cobro_sop, '')) > 500 then
      raise exception 'TEXTO_LARGO' using errcode = '22023';
    end if;
    -- Ronda 4: expediente con valores conocidos y sin contradicciones evidentes.
    if v_estado is not null and v_estado not in ('validada_dian', 'rechazada_validacion_dian', 'rechazo_comercial_comprador',
                                                 'nunca_transmitida', 'expedida_contingencia') then
      raise exception 'ESTADO_ELECTRONICO_INVALIDO' using errcode = '22023';
    end if;
    if v_entrega is not null and v_entrega not in ('no_hubo', 'hubo', 'parcial') then
      raise exception 'ENTREGA_INVALIDA' using errcode = '22023';
    end if;
    if v_cobro is not null and v_cobro not in ('no_hubo', 'hubo_devuelto', 'hubo_sin_devolver') then
      raise exception 'COBRO_INVALIDO' using errcode = '22023';
    end if;
    -- Un rechazo comercial del comprador no es un rechazo de validación de la DIAN, y un documento válido (validado o
    -- expedido en contingencia) no se «anula» ante la DIAN: se resuelve con nota crédito electrónica.
    if v_estado in ('rechazo_comercial_comprador', 'validada_dian', 'expedida_contingencia') and v_res = 'anulacion_dian' then
      raise exception 'DOCUMENTO_VALIDO_NO_SE_ANULA' using errcode = '22023';
    end if;
    -- Ronda 5: verificación de la contingencia y consulta del CUFE/CUDE.
    if v_cont_tipo is not null and v_cont_tipo not in ('aviso_dian', 'aviso_proveedor_tecnologico', 'soporte_falla_facturador',
                                                       'sin_soporte_contingencia') then
      raise exception 'CONTINGENCIA_INVALIDA' using errcode = '22023';
    end if;
    if v_cufe_res is not null and v_cufe_res not in ('sin_resultado', 'encontrado') then
      raise exception 'CONSULTA_CUFE_INVALIDA' using errcode = '22023';
    end if;
    if char_length(coalesce(v_cont_ref, '')) > 120 or char_length(coalesce(v_cufe_sop, '')) > 500
       or char_length(coalesce(v_dev_sop, '')) > 500 then
      raise exception 'TEXTO_LARGO' using errcode = '22023';
    end if;
    -- Ronda 6: la falla empieza antes de terminar.
    if v_cont_ini is not null and v_cont_fin is not null and v_cont_ini > v_cont_fin then
      raise exception 'CONTINGENCIA_INVALIDA' using errcode = '22023';
    end if;
    -- La consulta del CUFE/CUDE ya ocurrió: no puede tener fecha futura.
    if v_cufe_en is not null and v_cufe_en > now() + interval '5 minutes' then
      raise exception 'CONSULTA_CUFE_INVALIDA' using errcode = '22023';
    end if;
    -- Si la consulta encuentra el CUFE/CUDE, el documento sí llegó a la DIAN: no es «nunca transmitida».
    if v_estado = 'nunca_transmitida' and v_cufe_res = 'encontrado' then
      raise exception 'DOCUMENTO_ENCONTRADO_EN_DIAN' using errcode = '22023';
    end if;
    if v_estado is distinct from 'nunca_transmitida' then
      v_cont_ver := null; v_cont_nota := null;
      v_cont_tipo := null; v_cont_ref := null; v_cont_fecha := null; v_cont_fin := null; v_cont_ini := null;
      v_cufe_res := null; v_cufe_en := null; v_cufe_sop := null;
    elsif v_cont_tipo = 'sin_soporte_contingencia' then
      v_cont_ref := null; v_cont_fecha := null; v_cont_fin := null; v_cont_ini := null;
    end if;
    if v_cobro is distinct from 'hubo_devuelto' then
      v_dev_sop := null; v_dev_fecha := null;
    end if;
  else
    v_res := null; v_res_ref := null; v_res_fecha := null; v_corrige := null;
    v_expl := null; v_fac_ref := null; v_estado := null; v_cont_ver := null; v_cont_nota := null;
    v_entrega := null; v_entrega_sop := null; v_cobro := null; v_cobro_sop := null;
    v_cont_tipo := null; v_cont_ref := null; v_cont_fecha := null; v_cont_fin := null; v_cont_ini := null;
    v_cufe_res := null; v_cufe_en := null; v_cufe_sop := null; v_dev_sop := null; v_dev_fecha := null;
  end if;

  if v_nat = 'devolucion_compra' then
    -- B4: vínculo con la compra (o el documento soporte) y SUS líneas, fecha, base e IVA; con documento soporte, su
    -- nota de ajuste. El IVA declarado debe ser el que el asiento revierte en la 2408.
    if num_nonnulls(v_fc, v_ds) <> 1 or v_base is null or v_base < 0 or v_iva is null or v_iva < 0
       or v_lineas is null or jsonb_array_length(v_lineas) = 0 or v_sop_tipo is null then
      raise exception 'DEVOLUCION_INCOMPLETA' using errcode = '22023';
    end if;
    if v_fc is not null and not exists (select 1 from public.invoice_purchase p where p.id = v_fc and p.organization_id = p_organization_id) then
      raise exception 'DEVOLUCION_INCOMPLETA' using errcode = '22023';
    end if;
    if v_ds is not null and (v_sop_tipo <> 'nota_ajuste_documento_soporte'
       or not exists (select 1 from public.support_documents d where d.id = v_ds and d.organization_id = p_organization_id)) then
      raise exception 'DEVOLUCION_DS_SIN_NOTA_AJUSTE' using errcode = '22023';
    end if;
    -- Ronda 4: en una compra el soporte es la nota crédito del proveedor (no una nota interna que la duplique).
    if v_fc is not null and v_sop_tipo <> 'nota_credito_proveedor' then
      raise exception 'DEVOLUCION_SOPORTE_INVALIDO' using errcode = '22023';
    end if;
    -- Ronda 4: la misma nota del proveedor no se registra sobre dos asientos.
    if exists (select 1 from public.tributario_iva_naturaleza_asiento x
                where x.organization_id = p_organization_id and x.naturaleza = 'devolucion_compra'
                  and x.journal_entry_id <> p_journal_entry_id
                  and x.invoice_purchase_id is not distinct from v_fc and x.support_document_id is not distinct from v_ds
                  and lower(btrim(x.soporte)) = lower(v_soporte)) then
      raise exception 'DEVOLUCION_DUPLICADA' using errcode = '22023';
    end if;
    select count(*) filter (where it.id is null), coalesce(sum((x ->> 'base')::numeric), 0), coalesce(sum((x ->> 'iva')::numeric), 0)
      into v_ajenas, v_sum_base, v_sum_iva
      from jsonb_array_elements(v_lineas) x
      left join public.invoice_items it
        on it.id = nullif(x ->> 'invoice_item_id', '')::uuid
       and ((v_fc is not null and coalesce(it.invoice_purchase_id, case when it.invoice_type = 'purchase' then it.invoice_id end) = v_fc)
         or (v_ds is not null and it.support_document_id = v_ds and it.invoice_type = 'support_document'));
    if v_ajenas > 0 then
      raise exception 'DEVOLUCION_LINEAS_AJENAS' using errcode = '22023';
    end if;
    if abs(v_sum_base - v_base) > 1 or abs(v_sum_iva - v_iva) > 1 then
      raise exception 'DEVOLUCION_LINEAS_NO_SUMAN' using errcode = '22023';
    end if;
    -- Ronda 4: lo devuelto de cada línea, sumando todos los registros, no supera su base ni su IVA.
    if exists (
      select 1
        from (select nullif(x ->> 'invoice_item_id', '')::uuid as id, (x ->> 'base')::numeric as base, (x ->> 'iva')::numeric as iva
                from jsonb_array_elements(v_lineas) x
              union all
              select nullif(y ->> 'invoice_item_id', '')::uuid, (y ->> 'base')::numeric, (y ->> 'iva')::numeric
                from public.tributario_iva_naturaleza_asiento o
                cross join lateral jsonb_array_elements(coalesce(o.lineas, '[]'::jsonb)) y
               where o.organization_id = p_organization_id and o.naturaleza = 'devolucion_compra'
                 and o.journal_entry_id <> p_journal_entry_id) d
        join public.invoice_items it on it.id = d.id
        cross join lateral (select public.fn_iva_base_linea(it.qty, it.unit_price, it.discount_amount, it.tax_included, it.tax_rate) as base) b
       group by it.id, b.base, it.tax_rate
      having sum(d.base) > abs(b.base) + 1 or sum(d.iva) > abs(round(b.base * coalesce(it.tax_rate, 0) / 100, 2)) + 1) then
      raise exception 'DEVOLUCION_EXCEDE_LINEA' using errcode = '22023';
    end if;
    if abs(v_neto - v_iva) > 1 then
      raise exception 'DEVOLUCION_IVA_NO_CUADRA' using errcode = '22023';
    end if;
  else
    v_fc := null; v_ds := null; v_base := null; v_iva := null; v_lineas := null;
  end if;

  insert into public.tributario_iva_naturaleza_asiento (organization_id, journal_entry_id, naturaleza, soporte_tipo, soporte, soporte_fecha,
                                                        invoice_purchase_id, support_document_id, base, iva, lineas, nota,
                                                        doc_electronico_resolucion, doc_electronico_referencia, doc_electronico_fecha,
                                                        corrige_declaracion_anterior, expediente_explicacion, factura_referencia,
                                                        estado_electronico, contingencia_verificada, contingencia_nota,
                                                        entrega_prestacion, entrega_soporte, cobro, cobro_soporte,
                                                        contingencia_soporte_tipo, contingencia_soporte_referencia,
                                                        contingencia_soporte_fecha, contingencia_fin_en, consulta_cufe_resultado,
                                                        consulta_cufe_en, consulta_cufe_soporte, cobro_devolucion_soporte,
                                                        cobro_devolucion_fecha, contingencia_inicio_en, creado_por)
  values (p_organization_id, p_journal_entry_id, v_nat, v_sop_tipo, v_soporte, v_sop_fecha, v_fc, v_ds, v_base, v_iva, v_lineas, v_nota,
          v_res, v_res_ref, v_res_fecha, v_corrige, v_expl, v_fac_ref, v_estado, v_cont_ver, v_cont_nota,
          v_entrega, v_entrega_sop, v_cobro, v_cobro_sop,
          v_cont_tipo, v_cont_ref, v_cont_fecha, v_cont_fin, v_cufe_res, v_cufe_en, v_cufe_sop, v_dev_sop, v_dev_fecha,
          v_cont_ini, auth.uid())
  on conflict (organization_id, journal_entry_id) do update
    set naturaleza = excluded.naturaleza, soporte_tipo = excluded.soporte_tipo, soporte = excluded.soporte,
        soporte_fecha = excluded.soporte_fecha, invoice_purchase_id = excluded.invoice_purchase_id,
        support_document_id = excluded.support_document_id, base = excluded.base, iva = excluded.iva,
        lineas = excluded.lineas, nota = excluded.nota,
        doc_electronico_resolucion = excluded.doc_electronico_resolucion, doc_electronico_referencia = excluded.doc_electronico_referencia,
        doc_electronico_fecha = excluded.doc_electronico_fecha, corrige_declaracion_anterior = excluded.corrige_declaracion_anterior,
        expediente_explicacion = excluded.expediente_explicacion, factura_referencia = excluded.factura_referencia,
        estado_electronico = excluded.estado_electronico, contingencia_verificada = excluded.contingencia_verificada,
        contingencia_nota = excluded.contingencia_nota, entrega_prestacion = excluded.entrega_prestacion,
        entrega_soporte = excluded.entrega_soporte, cobro = excluded.cobro, cobro_soporte = excluded.cobro_soporte,
        contingencia_soporte_tipo = excluded.contingencia_soporte_tipo,
        contingencia_soporte_referencia = excluded.contingencia_soporte_referencia,
        contingencia_soporte_fecha = excluded.contingencia_soporte_fecha, contingencia_fin_en = excluded.contingencia_fin_en,
        consulta_cufe_resultado = excluded.consulta_cufe_resultado, consulta_cufe_en = excluded.consulta_cufe_en,
        consulta_cufe_soporte = excluded.consulta_cufe_soporte, cobro_devolucion_soporte = excluded.cobro_devolucion_soporte,
        cobro_devolucion_fecha = excluded.cobro_devolucion_fecha,
        contingencia_inicio_en = excluded.contingencia_inicio_en,
        -- Ronda 5: volver a guardar el registro borra la aprobación del segundo usuario (se aprueba otra vez).
        aprobado_por = null, aprobado_en = null, aprobacion_nota = null,
        -- Ronda 4: si el expediente cambia, la decisión anterior deja de valer (se decide otra vez).
        decision_tratamiento = null, decision_periodo_desde = null, decision_periodo_hasta = null,
        decision_fundamento = null, decidido_por = null, decidido_en = null,
        creado_por = excluded.creado_por, actualizado_en = now()
  returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('expediente_faltantes',
    case when v_fila.naturaleza = 'correccion_error' then to_jsonb(public.fn_iva_correccion_expediente_faltantes(v_fila)) end,
    -- Ronda 6: con una falla que cubre la venta, la factura se tiene por expedida en contingencia (nota crédito); se trata
    -- como no expedida solo con la constancia de que no hubo contingencia y la consulta del CUFE/CUDE sin resultado.
    'tenida_por_expedida_en_contingencia',
      public.fn_iva_contingencia_cubre_venta(v_fila, public.fn_iva_correccion_venta_en(v_fila)),
    'tratada_como_no_expedida',
      coalesce(public.fn_iva_contingencia_descartada(v_fila, public.fn_iva_correccion_venta_en(v_fila)), false),
    -- Ronda 6: segundo usuario para toda naturaleza que mueve la 2408 y se propone «no afecta» (la corrección de error, al
    -- decidir retirar la venta).
    'aprobacion_requerida', v_fila.naturaleza in ('pago_dian', 'traslado_auxiliares', 'cierre'));
end;
$function$;

comment on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) is
  'Fija (o quita, con p_datos null) la naturaleza fiscal de un asiento que mueve la 2408, con su soporte; la devolución de compra exige la compra, sus líneas, base e IVA que cuadren con el asiento. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) to authenticated;

-- ── 3a. RPC (ronda 5): aprobación por un segundo usuario ─────────────────────────
-- p_aprobar = true aprueba (con nota opcional); false quita la aprobación. Quien aprueba debe ser OTRA persona, distinta
-- de quien guardó el registro (y, en la corrección de error, de quien decidió), con finance.approve o admin.full_access.
-- Ronda 6 (respuesta 8): la exigen el pago a la DIAN, el traslado entre auxiliares, el cierre y la corrección de error con
-- la decisión «retirar_venta»: todo lo que mueve la 2408 y se propone «no afecta». Las demás: APROBACION_NO_REQUERIDA.
create or replace function public.fn_iva_naturaleza_asiento_aprobar(p_organization_id integer, p_journal_entry_id integer,
                                                                    p_aprobar boolean, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_fila public.tributario_iva_naturaleza_asiento;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  select * into v_fila from public.tributario_iva_naturaleza_asiento n
   where n.organization_id = p_organization_id and n.journal_entry_id = p_journal_entry_id
   for update;
  if v_fila.id is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not (v_fila.naturaleza in ('pago_dian', 'traslado_auxiliares', 'cierre')
          or (v_fila.naturaleza = 'correccion_error' and coalesce(v_fila.decision_tratamiento, '') = 'retirar_venta')) then
    raise exception 'APROBACION_NO_REQUERIDA' using errcode = '22023';
  end if;
  if char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;
  if coalesce(p_aprobar, false) then
    -- El segundo usuario no es quien registró (ni una sesión sin usuario) ni, en la corrección, quien decidió.
    if v_uid is null or v_uid is not distinct from v_fila.creado_por or v_uid is not distinct from v_fila.decidido_por then
      raise exception 'APROBACION_MISMO_USUARIO' using errcode = '42501';
    end if;
    update public.tributario_iva_naturaleza_asiento
       set aprobado_por = v_uid, aprobado_en = now(), aprobacion_nota = v_nota, actualizado_en = now()
     where id = v_fila.id
    returning * into v_fila;
  else
    update public.tributario_iva_naturaleza_asiento
       set aprobado_por = null, aprobado_en = null, aprobacion_nota = null, actualizado_en = now()
     where id = v_fila.id
    returning * into v_fila;
  end if;
  return to_jsonb(v_fila);
end;
$function$;

comment on function public.fn_iva_naturaleza_asiento_aprobar(integer, integer, boolean, text) is
  'Rondas 5 y 6 del Contador: aprobación (o retiro de la aprobación), por un segundo usuario distinto de quien lo registró o decidió, de un registro que mueve la 2408 y se propone «no afecta»: pago a la DIAN, traslado entre auxiliares, cierre y corrección de error con la decisión de retirar la venta. Sin ella queda pendiente en el borrador. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_naturaleza_asiento_aprobar(integer, integer, boolean, text) from public, anon;
grant execute on function public.fn_iva_naturaleza_asiento_aprobar(integer, integer, boolean, text) to authenticated;

-- ── 3b. RPC (ronda 4): decisión de tratamiento fiscal y período de una corrección de error ──
-- p_datos: { tratamiento: retirar_venta | nota_credito | mantener_venta, periodo_desde, periodo_hasta, fundamento }
--          p_datos = null → quita la decisión (el expediente se conserva).
-- Exige el expediente completo. El período es un período fiscal del IVA (bimestre, cuatrimestre o año, sin cruzar años).
create or replace function public.fn_iva_correccion_error_decidir(p_organization_id integer, p_journal_entry_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_trat text := nullif(btrim(coalesce(p_datos ->> 'tratamiento', '')), '');
  v_desde date := nullif(p_datos ->> 'periodo_desde', '')::date;
  v_hasta date := nullif(p_datos ->> 'periodo_hasta', '')::date;
  v_fund text := nullif(btrim(coalesce(p_datos ->> 'fundamento', '')), '');
  v_fila public.tributario_iva_naturaleza_asiento;
  v_faltan text[];
  v_tz text;
  v_rev record;
  v_venta record;
  v_dia_venta date;
  v_meses integer;
  v_decl record;
  v_hoy date;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  select * into v_fila from public.tributario_iva_naturaleza_asiento n
   where n.organization_id = p_organization_id and n.journal_entry_id = p_journal_entry_id and n.naturaleza = 'correccion_error';
  if v_fila.id is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if p_datos is null then
    update public.tributario_iva_naturaleza_asiento
       set decision_tratamiento = null, decision_periodo_desde = null, decision_periodo_hasta = null,
           decision_fundamento = null, decidido_por = null, decidido_en = null,
           -- Ronda 6: sin decisión no hay nada que aprobar.
           aprobado_por = null, aprobado_en = null, aprobacion_nota = null, actualizado_en = now()
     where id = v_fila.id
    returning * into v_fila;
    return to_jsonb(v_fila);
  end if;

  v_faltan := public.fn_iva_correccion_expediente_faltantes(v_fila);
  if cardinality(v_faltan) > 0 then
    raise exception 'EXPEDIENTE_INCOMPLETO' using errcode = '22023', detail = array_to_string(v_faltan, ',');
  end if;
  if v_trat is null or v_trat not in ('retirar_venta', 'nota_credito', 'mantener_venta') then
    raise exception 'TRATAMIENTO_INVALIDO' using errcode = '22023';
  end if;
  if v_fund is null or char_length(v_fund) < 10 or char_length(v_fund) > 2000 then
    raise exception 'FUNDAMENTO_REQUERIDO' using errcode = '22023';
  end if;
  -- El período decidido es UN período fiscal del IVA: bimestre, cuatrimestre o año, completo y sin cruzar años.
  if v_desde is null or v_hasta is null or v_hasta < v_desde then
    raise exception 'PERIODO_NO_FISCAL' using errcode = '22023';
  end if;
  v_meses := (extract(year from v_hasta)::int * 12 + extract(month from v_hasta)::int)
           - (extract(year from v_desde)::int * 12 + extract(month from v_desde)::int) + 1;
  if extract(day from v_desde) <> 1
     or v_hasta <> (date_trunc('month', v_hasta) + interval '1 month - 1 day')::date
     or extract(year from v_desde) <> extract(year from v_hasta)
     or not ((v_meses = 2 and extract(month from v_desde)::int in (1, 3, 5, 7, 9, 11))
          or (v_meses = 4 and extract(month from v_desde)::int in (1, 5, 9))
          or (v_meses = 12 and extract(month from v_desde)::int = 1)) then
    raise exception 'PERIODO_NO_FISCAL' using errcode = '22023';
  end if;

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = p_organization_id;
  select je.id, je.entry_date, je.fact_key into v_rev from public.journal_entries je
   where je.id = p_journal_entry_id and je.organization_id = p_organization_id;
  select je.id, je.entry_date, je.source, je.source_id into v_venta from public.journal_entries je
   where je.organization_id = p_organization_id and je.id = substring(v_rev.fact_key from 10)::integer;
  if v_venta.id is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  v_dia_venta := (v_venta.entry_date at time zone v_tz)::date;

  if v_trat = 'retirar_venta' then
    -- Un documento válido (validado, rechazado solo comercialmente o expedido en contingencia) no se retira: nota crédito.
    if v_fila.estado_electronico in ('validada_dian', 'rechazo_comercial_comprador', 'expedida_contingencia') then
      raise exception 'DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO' using errcode = '22023';
    end if;
    -- Ronda 6: con una falla que cubre la fecha de la venta, la factura se tiene por expedida en contingencia: nota crédito.
    if public.fn_iva_contingencia_cubre_venta(v_fila, v_venta.entry_date) then
      raise exception 'DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO' using errcode = '22023', detail = 'expedida_en_contingencia';
    end if;
    -- Ronda 5: «nunca transmitida» exige la contingencia descartada. Ronda 6: constancia de que no hubo contingencia y
    -- consulta sin resultado; las 48 horas solo con falla registrada (desde su fin, o desde la venta si es posterior).
    if v_fila.estado_electronico = 'nunca_transmitida'
       and public.fn_iva_contingencia_descartada(v_fila, v_venta.entry_date) is not true then
      raise exception 'CONTINGENCIA_SIN_DESCARTAR' using errcode = '22023',
        detail = case
          when v_fila.contingencia_soporte_tipo = 'sin_soporte_contingencia' and v_fila.consulta_cufe_en < v_venta.entry_date
            then 'consulta_antes_de_la_venta'
          when v_fila.contingencia_soporte_tipo <> 'sin_soporte_contingencia'
               and v_fila.consulta_cufe_en < greatest(v_fila.contingencia_fin_en, v_venta.entry_date) + interval '48 hours'
            then 'plazo_48_horas'
          when v_fila.contingencia_soporte_tipo <> 'sin_soporte_contingencia' and v_fila.contingencia_nota is null
            then 'constancia_sin_contingencia'
          else 'verificacion' end;
    end if;
    if v_fila.entrega_prestacion in ('hubo', 'parcial') then
      raise exception 'OPERACION_EXISTIO' using errcode = '22023';
    end if;
    if v_fila.cobro = 'hubo_sin_devolver' then
      raise exception 'COBRO_SIN_RESOLVER' using errcode = '22023';
    end if;
    -- No se descuenta una nota crédito y además se elimina la venta.
    if v_fila.doc_electronico_resolucion = 'nota_credito_electronica'
       or (v_venta.source = 'invoice_sales' and exists (
             select 1 from public.invoice_sales nc
              where nc.organization_id = p_organization_id and nc.document_type = 'credit_note'
                and nc.related_invoice_id::text = v_venta.source_id and coalesce(nc.status, '') <> 'draft')) then
      raise exception 'NOTA_CREDITO_Y_RETIRO' using errcode = '22023';
    end if;
    if v_dia_venta not between v_desde and v_hasta then
      raise exception 'PERIODO_NO_CORRESPONDE_A_LA_VENTA' using errcode = '22023';
    end if;
  elsif v_trat = 'nota_credito' then
    if v_fila.doc_electronico_resolucion is distinct from 'nota_credito_electronica' then
      raise exception 'NOTA_CREDITO_REQUERIDA' using errcode = '22023';
    end if;
    if v_fila.doc_electronico_fecha not between v_desde and v_hasta then
      raise exception 'PERIODO_NO_CORRESPONDE_A_LA_NOTA' using errcode = '22023';
    end if;
  else
    if v_dia_venta not between v_desde and v_hasta then
      raise exception 'PERIODO_NO_CORRESPONDE_A_LA_VENTA' using errcode = '22023';
    end if;
  end if;

  -- Un período ya declarado se toma tal como se declaró (no se mezcla con otro) y retirar una venta de él exige
  -- marcar la corrección de esa declaración.
  select d.desde, d.hasta into v_decl from public.tributario_iva_declaraciones d
   where d.organization_id = p_organization_id and d.desde <= v_hasta and d.hasta >= v_desde
     and not (d.desde = v_desde and d.hasta = v_hasta)
   limit 1;
  if v_decl.desde is not null then
    raise exception 'PERIODO_NO_COINCIDE_CON_DECLARADO' using errcode = '22023';
  end if;
  if v_trat = 'retirar_venta' and coalesce(v_fila.corrige_declaracion_anterior, false) = false
     and exists (select 1 from public.tributario_iva_declaraciones d
                  where d.organization_id = p_organization_id and v_dia_venta between d.desde and d.hasta) then
    raise exception 'DEBE_CORREGIR_DECLARACION' using errcode = '22023';
  end if;
  -- Ronda 5: si el período de la venta ya se declaró, la corrección tiene que seguir siendo posible. El sistema no
  -- inventa calendarios ni calcula la firmeza: usa la fecha de vencimiento y la firmeza que registró una persona.
  if v_trat = 'retirar_venta' then
    select d.vencimiento_plazo, d.en_firme, d.correccion_dian_fecha, d.correccion_dian_resultado into v_decl
      from public.tributario_iva_declaraciones d
     where d.organization_id = p_organization_id and v_dia_venta between d.desde and d.hasta
     limit 1;
    if found then
      if v_decl.vencimiento_plazo is null then
        raise exception 'DECLARACION_SIN_VENCIMIENTO' using errcode = '22023';
      end if;
      if v_decl.en_firme is null then
        raise exception 'FIRMEZA_SIN_DETERMINAR' using errcode = '22023';
      end if;
      -- Art. 714 ET: con la declaración en firme ya no se corrige.
      if v_decl.en_firme then
        raise exception 'DECLARACION_EN_FIRME' using errcode = '22023';
      end if;
      -- Art. 589 ET: la corrección que disminuye el impuesto se pide dentro del año siguiente al vencimiento del plazo.
      -- Ronda 6: si la solicitud ya se registró, cuenta su fecha; si no, la de hoy.
      v_hoy := (now() at time zone v_tz)::date;
      if coalesce(v_decl.correccion_dian_fecha, v_hoy) > (v_decl.vencimiento_plazo + interval '1 year')::date then
        raise exception 'CORRECCION_FUERA_DE_TERMINO' using errcode = '22023';
      end if;
      -- Ronda 6 (art. 589 ET): la solicitud de corrección presentada ante la DIAN, registrada con su resultado. Solo
      -- «aceptada» o «vencido el término» (el proyecto sustituyó la declaración) permiten retirar la venta.
      if v_decl.correccion_dian_resultado is null then
        raise exception 'CORRECCION_DIAN_SIN_REGISTRO' using errcode = '22023';
      end if;
      if v_decl.correccion_dian_resultado = 'en_tramite' then
        raise exception 'CORRECCION_DIAN_SIN_RESULTADO' using errcode = '22023';
      end if;
      if v_decl.correccion_dian_resultado = 'rechazada' then
        raise exception 'CORRECCION_DIAN_RECHAZADA' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.tributario_iva_naturaleza_asiento
     set decision_tratamiento = v_trat, decision_periodo_desde = v_desde, decision_periodo_hasta = v_hasta,
         decision_fundamento = v_fund, decidido_por = auth.uid(), decidido_en = now(),
         -- Ronda 6: una decisión nueva se aprueba otra vez (segundo usuario).
         aprobado_por = null, aprobado_en = null, aprobacion_nota = null, actualizado_en = now()
   where id = v_fila.id
  returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('aprobacion_requerida', v_trat = 'retirar_venta');
end;
$function$;

comment on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) is
  'Ronda 4 del Contador: decisión explícita de tratamiento fiscal (retirar la venta, nota crédito o mantenerla) y período de una corrección de error con el expediente completo. Solo «retirar_venta» saca la venta de las casillas. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) to authenticated;

-- ── 4. RPC: registrar o quitar un período declarado ─────────────────────────────
-- p_datos: { numero_formulario?, presentada_en, nota?, vencimiento_plazo?, en_firme? (true/false), firmeza_nota? }
--          p_datos = null → quita el registro.
-- Ronda 5: el vencimiento y la firmeza los registra una persona (el sistema no tiene calendario ni calcula la firmeza).
-- Una clave que no venga conserva lo registrado; «en_firme» exige su nota (de dónde se sabe).
-- Ronda 6: correccion_dian?: { numero, fecha, resultado: en_tramite | aceptada | rechazada | vencido_termino,
--          resultado_fecha?, soporte } (null = quitarla; ausente = se conserva). La respuesta trae, como referencia que
--          no decide, firmeza_referencia_714: tres años desde el vencimiento (o desde la presentación, si fue posterior).
create or replace function public.fn_tributario_iva_declaracion_guardar(p_organization_id integer, p_desde date, p_hasta date, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fecha date := nullif(p_datos ->> 'presentada_en', '')::date;
  v_num text := nullif(btrim(coalesce(p_datos ->> 'numero_formulario', '')), '');
  v_nota text := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  v_venc date := nullif(p_datos ->> 'vencimiento_plazo', '')::date;
  v_firme boolean := case jsonb_typeof(p_datos -> 'en_firme') when 'boolean' then (p_datos ->> 'en_firme')::boolean end;
  v_firme_nota text := nullif(btrim(coalesce(p_datos ->> 'firmeza_nota', '')), '');
  -- Ronda 6 (art. 589 ET): solicitud de corrección ante la DIAN.
  v_cd jsonb := case when jsonb_typeof(p_datos -> 'correccion_dian') = 'object' then p_datos -> 'correccion_dian' end;
  v_cd_num text;
  v_cd_fecha date;
  v_cd_res text;
  v_cd_res_fecha date;
  v_cd_sop text;
  v_hoy date;
  v_fila public.tributario_iva_declaraciones;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'PERIODO_INVALIDO' using errcode = '22023';
  end if;

  if p_datos is null then
    delete from public.tributario_iva_declaraciones where organization_id = p_organization_id and desde = p_desde and hasta = p_hasta;
    return null;
  end if;
  if v_fecha is null or v_fecha < p_hasta then
    raise exception 'FECHA_PRESENTACION_INVALIDA' using errcode = '22023';
  end if;
  if char_length(coalesce(v_num, '')) > 40 or char_length(coalesce(v_nota, '')) > 500 or char_length(coalesce(v_firme_nota, '')) > 500 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;
  if v_venc is not null and v_venc <= p_hasta then
    raise exception 'VENCIMIENTO_INVALIDO' using errcode = '22023';
  end if;
  if p_datos ? 'en_firme' and jsonb_typeof(p_datos -> 'en_firme') not in ('boolean', 'null') then
    raise exception 'FIRMEZA_INVALIDA' using errcode = '22023';
  end if;
  if v_firme is not null and v_firme_nota is null then
    raise exception 'FIRMEZA_REQUIERE_NOTA' using errcode = '22023';
  end if;
  if exists (select 1 from public.tributario_iva_declaraciones d
              where d.organization_id = p_organization_id and d.desde <= p_hasta and d.hasta >= p_desde
                and not (d.desde = p_desde and d.hasta = p_hasta)) then
    raise exception 'PERIODO_SOLAPADO' using errcode = '23P01';
  end if;
  -- Ronda 6 (art. 589 ET): la solicitud de corrección se registra completa: número, fecha (no anterior a la presentación
  -- ni futura), resultado y, si ya lo hay, su fecha (no anterior a la solicitud), con el soporte.
  if p_datos ? 'correccion_dian' and jsonb_typeof(p_datos -> 'correccion_dian') not in ('object', 'null') then
    raise exception 'CORRECCION_DIAN_INVALIDA' using errcode = '22023';
  end if;
  if v_cd is not null then
    v_cd_num := nullif(btrim(coalesce(v_cd ->> 'numero', '')), '');
    v_cd_res := nullif(btrim(coalesce(v_cd ->> 'resultado', '')), '');
    v_cd_sop := nullif(btrim(coalesce(v_cd ->> 'soporte', '')), '');
    begin
      v_cd_fecha := nullif(v_cd ->> 'fecha', '')::date;
      v_cd_res_fecha := nullif(v_cd ->> 'resultado_fecha', '')::date;
    exception when others then
      raise exception 'CORRECCION_DIAN_INVALIDA' using errcode = '22023';
    end;
    if v_cd_num is null or v_cd_fecha is null or v_cd_sop is null
       or v_cd_res is null or v_cd_res not in ('en_tramite', 'aceptada', 'rechazada', 'vencido_termino')
       or (v_cd_res <> 'en_tramite' and v_cd_res_fecha is null)
       or char_length(v_cd_num) > 60 or char_length(v_cd_sop) > 500 then
      raise exception 'CORRECCION_DIAN_INVALIDA' using errcode = '22023';
    end if;
    v_hoy := (now() at time zone coalesce((select nullif(o.timezone, '') from public.organizations o where o.id = p_organization_id),
                                         'America/Bogota'))::date;
    if v_cd_fecha < v_fecha or v_cd_fecha > v_hoy
       or (v_cd_res_fecha is not null and (v_cd_res_fecha < v_cd_fecha or v_cd_res_fecha > v_hoy)) then
      raise exception 'CORRECCION_DIAN_FECHA_INVALIDA' using errcode = '22023';
    end if;
    -- «Vencido el término»: la DIAN no se pronunció dentro de los seis meses siguientes a la solicitud (art. 589 ET).
    if v_cd_res = 'vencido_termino' and v_cd_res_fecha < (v_cd_fecha + interval '6 months')::date then
      raise exception 'CORRECCION_DIAN_TERMINO_NO_VENCIDO' using errcode = '22023';
    end if;
    if v_cd_res = 'en_tramite' then
      v_cd_res_fecha := null;
    end if;
  end if;

  insert into public.tributario_iva_declaraciones (organization_id, desde, hasta, numero_formulario, presentada_en, nota,
                                                   vencimiento_plazo, en_firme, firmeza_nota, firmeza_registrada_por,
                                                   firmeza_registrada_en, registrada_por)
  values (p_organization_id, p_desde, p_hasta, v_num, v_fecha, v_nota, v_venc, v_firme,
          case when v_firme is not null then v_firme_nota end,
          case when v_firme is not null then auth.uid() end, case when v_firme is not null then now() end, auth.uid())
  on conflict (organization_id, desde, hasta) do update
    set numero_formulario = excluded.numero_formulario, presentada_en = excluded.presentada_en, nota = excluded.nota,
        -- Ronda 5: lo que no viene se conserva.
        vencimiento_plazo = case when p_datos ? 'vencimiento_plazo' then excluded.vencimiento_plazo
                                 else tributario_iva_declaraciones.vencimiento_plazo end,
        en_firme = case when p_datos ? 'en_firme' then excluded.en_firme else tributario_iva_declaraciones.en_firme end,
        firmeza_nota = case when p_datos ? 'en_firme' then excluded.firmeza_nota else tributario_iva_declaraciones.firmeza_nota end,
        firmeza_registrada_por = case when p_datos ? 'en_firme' then excluded.firmeza_registrada_por
                                      else tributario_iva_declaraciones.firmeza_registrada_por end,
        firmeza_registrada_en = case when p_datos ? 'en_firme' then excluded.firmeza_registrada_en
                                     else tributario_iva_declaraciones.firmeza_registrada_en end
  returning * into v_fila;
  -- Ronda 6: la solicitud de corrección ante la DIAN (una clave ausente conserva lo registrado; null la quita).
  if p_datos ? 'correccion_dian' then
    update public.tributario_iva_declaraciones
       set correccion_dian_numero = v_cd_num, correccion_dian_fecha = v_cd_fecha, correccion_dian_resultado = v_cd_res,
           correccion_dian_resultado_fecha = v_cd_res_fecha, correccion_dian_soporte = v_cd_sop,
           correccion_dian_registrada_por = case when v_cd is not null then auth.uid() end,
           correccion_dian_registrada_en = case when v_cd is not null then now() end
     where id = v_fila.id
    returning * into v_fila;
  end if;
  -- Ronda 6: referencia del término general de firmeza (art. 714 ET: tres años desde el vencimiento del plazo, o desde la
  -- presentación si fue extemporánea). NO decide: hay términos especiales; la firmeza la registra una persona.
  return to_jsonb(v_fila) || jsonb_build_object(
    'firmeza_referencia_714', case when v_fila.vencimiento_plazo is not null
                                   then (greatest(v_fila.vencimiento_plazo, v_fila.presentada_en) + interval '3 years')::date end,
    'firmeza_referencia_nota', 'Referencia: término general del art. 714 ET (tres años). No decide la firmeza: hay términos especiales.');
end;
$function$;

comment on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) is
  'Registra (o quita, con p_datos null) un período de IVA ya presentado, con su vencimiento, firmeza y (ronda 6, art. 589 ET) la solicitud de corrección presentada ante la DIAN y su resultado. Lo hace una persona; el sistema nunca lo marca. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) from public, anon;
grant execute on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) to authenticated;
