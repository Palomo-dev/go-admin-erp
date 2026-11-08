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
  creado_por uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tributario_iva_naturaleza_asiento_uno unique (organization_id, journal_entry_id),
  constraint tributario_iva_naturaleza_soporte_chk check (naturaleza = 'cierre' or (soporte is not null and soporte_fecha is not null)),
  constraint tributario_iva_naturaleza_devolucion_chk check (naturaleza <> 'devolucion_compra' or (
    num_nonnulls(invoice_purchase_id, support_document_id) = 1 and base is not null and iva is not null
    and lineas is not null and jsonb_array_length(lineas) > 0 and soporte_tipo is not null))
);
comment on table public.tributario_iva_naturaleza_asiento is
  'Naturaleza fiscal de un asiento que mueve la 2408 sin ser de un documento con líneas (P4 del Contador). La fija una persona; el borrador del IVA la usa para ubicarlo.';

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
--            corrige_declaracion_anterior? (true/false) }   ·   p_datos = null → quita el registro.
-- La corrección de error se puede guardar incompleta (para dejar constancia del avance), pero exige el tipo de soporte;
-- el borrador solo la aplica cuando está completa.
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
  -- Ronda 2: la naturaleza se registra con su soporte (salvo el cierre, que lo genera el propio cierre).
  if v_nat <> 'cierre' and (v_soporte is null or v_sop_fecha is null) then
    raise exception 'SOPORTE_REQUERIDO' using errcode = '22023';
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
    if char_length(coalesce(v_res_ref, '')) > 120 then
      raise exception 'TEXTO_LARGO' using errcode = '22023';
    end if;
  else
    v_res := null; v_res_ref := null; v_res_fecha := null; v_corrige := null;
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
    if abs(v_neto - v_iva) > 1 then
      raise exception 'DEVOLUCION_IVA_NO_CUADRA' using errcode = '22023';
    end if;
  else
    v_fc := null; v_ds := null; v_base := null; v_iva := null; v_lineas := null;
  end if;

  insert into public.tributario_iva_naturaleza_asiento (organization_id, journal_entry_id, naturaleza, soporte_tipo, soporte, soporte_fecha,
                                                        invoice_purchase_id, support_document_id, base, iva, lineas, nota,
                                                        doc_electronico_resolucion, doc_electronico_referencia, doc_electronico_fecha,
                                                        corrige_declaracion_anterior, creado_por)
  values (p_organization_id, p_journal_entry_id, v_nat, v_sop_tipo, v_soporte, v_sop_fecha, v_fc, v_ds, v_base, v_iva, v_lineas, v_nota,
          v_res, v_res_ref, v_res_fecha, v_corrige, auth.uid())
  on conflict (organization_id, journal_entry_id) do update
    set naturaleza = excluded.naturaleza, soporte_tipo = excluded.soporte_tipo, soporte = excluded.soporte,
        soporte_fecha = excluded.soporte_fecha, invoice_purchase_id = excluded.invoice_purchase_id,
        support_document_id = excluded.support_document_id, base = excluded.base, iva = excluded.iva,
        lineas = excluded.lineas, nota = excluded.nota,
        doc_electronico_resolucion = excluded.doc_electronico_resolucion, doc_electronico_referencia = excluded.doc_electronico_referencia,
        doc_electronico_fecha = excluded.doc_electronico_fecha, corrige_declaracion_anterior = excluded.corrige_declaracion_anterior,
        creado_por = excluded.creado_por, actualizado_en = now()
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$function$;

comment on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) is
  'Fija (o quita, con p_datos null) la naturaleza fiscal de un asiento que mueve la 2408, con su soporte; la devolución de compra exige la compra, sus líneas, base e IVA que cuadren con el asiento. Requiere finance.approve o admin.full_access.';
revoke all on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) from public, anon;
grant execute on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) to authenticated;

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
