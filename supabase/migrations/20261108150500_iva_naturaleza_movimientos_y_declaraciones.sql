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
comment on table public.tributario_iva_naturaleza_asiento is
  'Naturaleza fiscal de un asiento que mueve la 2408 sin ser de un documento con líneas (P4 del Contador). La fija una persona; el borrador del IVA la usa para ubicarlo. Corrección de error: expediente + decisión de tratamiento fiscal y período (ronda 4).';

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
    case when n.estado_electronico = 'nunca_transmitida' and (n.contingencia_verificada is null or n.contingencia_nota is null)
         then 'contingencia' end,
    case when n.entrega_prestacion is null or n.entrega_soporte is null then 'entrega_o_prestacion' end,
    case when n.cobro is null or n.cobro_soporte is null then 'cobro' end,
    case when n.estado_electronico in ('validada_dian', 'rechazo_comercial_comprador', 'expedida_contingencia')
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

-- ── 2. Períodos de IVA declarados ───────────────────────────────────────────────
create table if not exists public.tributario_iva_declaraciones (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  desde date not null,
  hasta date not null,
  numero_formulario text check (char_length(numero_formulario) <= 40),
  presentada_en date not null,
  nota text check (char_length(nota) <= 500),
  registrada_por uuid,
  registrada_en timestamptz not null default now(),
  constraint tributario_iva_declaraciones_rango check (hasta >= desde and hasta - desde <= 366),
  constraint tributario_iva_declaraciones_unica unique (organization_id, desde, hasta)
);
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
    if v_estado is distinct from 'nunca_transmitida' then
      v_cont_ver := null; v_cont_nota := null;
    end if;
  else
    v_res := null; v_res_ref := null; v_res_fecha := null; v_corrige := null;
    v_expl := null; v_fac_ref := null; v_estado := null; v_cont_ver := null; v_cont_nota := null;
    v_entrega := null; v_entrega_sop := null; v_cobro := null; v_cobro_sop := null;
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
                                                        entrega_prestacion, entrega_soporte, cobro, cobro_soporte, creado_por)
  values (p_organization_id, p_journal_entry_id, v_nat, v_sop_tipo, v_soporte, v_sop_fecha, v_fc, v_ds, v_base, v_iva, v_lineas, v_nota,
          v_res, v_res_ref, v_res_fecha, v_corrige, v_expl, v_fac_ref, v_estado, v_cont_ver, v_cont_nota,
          v_entrega, v_entrega_sop, v_cobro, v_cobro_sop, auth.uid())
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
        -- Ronda 4: si el expediente cambia, la decisión anterior deja de valer (se decide otra vez).
        decision_tratamiento = null, decision_periodo_desde = null, decision_periodo_hasta = null,
        decision_fundamento = null, decidido_por = null, decidido_en = null,
        creado_por = excluded.creado_por, actualizado_en = now()
  returning * into v_fila;
  return to_jsonb(v_fila) || jsonb_build_object('expediente_faltantes',
    case when v_fila.naturaleza = 'correccion_error' then to_jsonb(public.fn_iva_correccion_expediente_faltantes(v_fila)) end);
end;
$function$;

comment on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) is
  'Fija (o quita, con p_datos null) la naturaleza fiscal de un asiento que mueve la 2408, con su soporte; la devolución de compra exige la compra, sus líneas, base e IVA que cuadren con el asiento. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) to authenticated;

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
           decision_fundamento = null, decidido_por = null, decidido_en = null, actualizado_en = now()
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
    if v_fila.estado_electronico = 'nunca_transmitida' and v_fila.contingencia_verificada is not true then
      raise exception 'CONTINGENCIA_SIN_DESCARTAR' using errcode = '22023';
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

  update public.tributario_iva_naturaleza_asiento
     set decision_tratamiento = v_trat, decision_periodo_desde = v_desde, decision_periodo_hasta = v_hasta,
         decision_fundamento = v_fund, decidido_por = auth.uid(), decidido_en = now(), actualizado_en = now()
   where id = v_fila.id
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$function$;

comment on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) is
  'Ronda 4 del Contador: decisión explícita de tratamiento fiscal (retirar la venta, nota crédito o mantenerla) y período de una corrección de error con el expediente completo. Solo «retirar_venta» saca la venta de las casillas. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_iva_correccion_error_decidir(integer, integer, jsonb) to authenticated;

-- ── 4. RPC: registrar o quitar un período declarado ─────────────────────────────
-- p_datos: { numero_formulario?, presentada_en, nota? }   ·   p_datos = null → quita el registro.
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
  if char_length(coalesce(v_num, '')) > 40 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;
  if exists (select 1 from public.tributario_iva_declaraciones d
              where d.organization_id = p_organization_id and d.desde <= p_hasta and d.hasta >= p_desde
                and not (d.desde = p_desde and d.hasta = p_hasta)) then
    raise exception 'PERIODO_SOLAPADO' using errcode = '23P01';
  end if;

  insert into public.tributario_iva_declaraciones (organization_id, desde, hasta, numero_formulario, presentada_en, nota, registrada_por)
  values (p_organization_id, p_desde, p_hasta, v_num, v_fecha, v_nota, auth.uid())
  on conflict (organization_id, desde, hasta) do update
    set numero_formulario = excluded.numero_formulario, presentada_en = excluded.presentada_en, nota = excluded.nota
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$function$;

comment on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) is
  'Registra (o quita, con p_datos null) un período de IVA ya presentado. Lo hace una persona; el sistema nunca lo marca. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) from public, anon;
grant execute on function public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb) to authenticated;
