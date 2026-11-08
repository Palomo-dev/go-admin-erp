-- IVA · naturaleza de los «otros movimientos» de la 2408 (P4) y períodos de IVA ya declarados (operaciones
-- entre períodos). Respuestas del Contador del 2026-11-07: docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md
-- Explicación: docs/contador/IVA-CLASIFICACION-Y-FORMULARIO-300.md
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene, después de 20261108150000.
-- Reversión: supabase/rollbacks/20261108150500_iva_naturaleza_movimientos_y_declaraciones_rollback.sql
--
-- 1. tributario_iva_naturaleza_asiento: una persona dice de qué naturaleza es un asiento que mueve la 2408 y
--    no es de un documento con líneas (asiento manual, tesorería, reversa…). El borrador lo usa así:
--      pago_dian, traslado_auxiliares, cierre       → NO crean IVA generado ni descontable (no afectan).
--      devolucion_compra (con la factura de compra y la base) → casillas 56 (base) y 66 (IVA) SOLO si el IVA
--                                                      de esa compra se evaluó «descontable»; si no, pendiente.
--      ajuste_procedente (con soporte)              → «por diligenciar» con su valor (afecta; casilla según
--                                                      instructivo, la decide el Contador).
--      importacion, otro                            → pendiente de clasificar con su valor.
--    Sin registro, el borrador deduce SOLO lo inequívoco: cierre de ejercicio (origen del asiento), traslado
--    entre auxiliares (el neto en 2408 del asiento es cero) y pago desde tesorería (caja/banco) cuyas demás
--    líneas son todas de disponible (11…). Todo lo demás queda «pendiente» con su valor; nunca se omite.
--    GO Admin no tiene un documento «nota crédito de compra»: la devolución en compras se contabiliza hoy con
--    un asiento y se clasifica aquí.
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
    ('pago_dian', 'traslado_auxiliares', 'cierre', 'devolucion_compra', 'ajuste_procedente', 'importacion', 'otro')),
  invoice_purchase_id uuid references public.invoice_purchase(id) on delete set null,
  base numeric(18, 2) check (base >= 0),
  soporte text check (char_length(soporte) <= 500),
  nota text check (char_length(nota) <= 500),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tributario_iva_naturaleza_asiento_uno unique (organization_id, journal_entry_id),
  constraint tributario_iva_naturaleza_devolucion_chk check (naturaleza <> 'devolucion_compra' or (invoice_purchase_id is not null and base is not null)),
  constraint tributario_iva_naturaleza_ajuste_chk check (naturaleza <> 'ajuste_procedente' or soporte is not null)
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
-- p_datos: { naturaleza, invoice_purchase_id?, base?, soporte?, nota? }   ·   p_datos = null → quita el registro.
create or replace function public.fn_iva_naturaleza_asiento_guardar(p_organization_id integer, p_journal_entry_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nat text := nullif(btrim(coalesce(p_datos ->> 'naturaleza', '')), '');
  v_fc uuid := nullif(p_datos ->> 'invoice_purchase_id', '')::uuid;
  v_base numeric := nullif(p_datos ->> 'base', '')::numeric;
  v_soporte text := nullif(btrim(coalesce(p_datos ->> 'soporte', '')), '');
  v_nota text := nullif(btrim(coalesce(p_datos ->> 'nota', '')), '');
  v_fila public.tributario_iva_naturaleza_asiento;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (public.fn_tiene_permiso(p_organization_id, 'finance.approve')
          or public.fn_tiene_permiso(p_organization_id, 'admin.full_access')) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.journal_entries je
     join public.journal_lines l on l.journal_entry_id = je.id and l.account_code like '2408%'
     where je.id = p_journal_entry_id and je.organization_id = p_organization_id) then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if p_datos is null then
    delete from public.tributario_iva_naturaleza_asiento
     where organization_id = p_organization_id and journal_entry_id = p_journal_entry_id;
    return null;
  end if;

  if v_nat is null or v_nat not in ('pago_dian', 'traslado_auxiliares', 'cierre', 'devolucion_compra', 'ajuste_procedente', 'importacion', 'otro') then
    raise exception 'NATURALEZA_INVALIDA' using errcode = '22023';
  end if;
  if v_nat = 'devolucion_compra' then
    if v_fc is null or v_base is null or v_base < 0
       or not exists (select 1 from public.invoice_purchase p where p.id = v_fc and p.organization_id = p_organization_id) then
      raise exception 'DEVOLUCION_SIN_FACTURA' using errcode = '22023';
    end if;
  else
    v_fc := null; v_base := null;
  end if;
  if v_nat = 'ajuste_procedente' and v_soporte is null then
    raise exception 'SOPORTE_REQUERIDO' using errcode = '22023';
  end if;
  if char_length(coalesce(v_soporte, '')) > 500 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'TEXTO_LARGO' using errcode = '22023';
  end if;

  insert into public.tributario_iva_naturaleza_asiento (organization_id, journal_entry_id, naturaleza, invoice_purchase_id, base, soporte, nota, creado_por)
  values (p_organization_id, p_journal_entry_id, v_nat, v_fc, v_base, v_soporte, v_nota, auth.uid())
  on conflict (organization_id, journal_entry_id) do update
    set naturaleza = excluded.naturaleza, invoice_purchase_id = excluded.invoice_purchase_id, base = excluded.base,
        soporte = excluded.soporte, nota = excluded.nota, creado_por = excluded.creado_por, actualizado_en = now()
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$function$;

comment on function public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb) is
  'Fija (o quita, con p_datos null) la naturaleza fiscal de un asiento que mueve la 2408. Requiere finance.approve o admin.full_access.';
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
