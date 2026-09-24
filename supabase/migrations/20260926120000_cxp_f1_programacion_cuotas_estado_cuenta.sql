-- ============================================================================
-- CxP F1.6 + F1.8 — programación y aprobación de pagos, plan de cuotas y
-- estado de cuenta del proveedor.
-- Plan: docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md (§4 F1.6, F1.8; D3, D7).
--
-- 1. `ap_payment_schedules` (D3): un pago programado NO es un pago. Antes se
--    insertaba en `payments` con `status='pending'` y la fecha programada dentro
--    de `reference`; al aprobar, el comentario del supervisor PISABA
--    `payments.reference` (bug conocido ACF:2905), un pago pendiente bloqueaba la
--    anulación y cualquiera aprobaba. Hoy hay 0 pagos pendientes de CxP: no hay
--    datos que mover. Solo SELECT para el cliente (organización + sucursal);
--    se escribe por RPC.
-- 2. `fn_programar_pago` (finance.create), `fn_aprobar_pago_programado`
--    (finance.approve; quien programó no aprueba salvo que sea el único
--    aprobador de la organización, D7), `fn_rechazar_pago_programado`
--    (finance.approve, motivo obligatorio) y `fn_cancelar_pago_programado`
--    (quien la pidió, o un aprobador). Aprobar registra el pago con el pago
--    único de la sesión de ventas (`fn_registrar_pago`, dirección `pago`, regla
--    7) con la referencia ORIGINAL y clave de idempotencia por programación; el
--    comentario va a `decision_comment`. Los saldos los recalculan los
--    disparadores de `payments`.
-- 3. Cuotas: `fn_cxp_crear_plan_cuotas` / `fn_cxp_eliminar_plan_cuotas` (sin
--    abonos previos; el capital suma el saldo). Pagar una cuota es el pago único
--    con `cuota_id` (una transacción: antes `pagarCuota` abonaba la cuota y si el
--    pago fallaba quedaba abonada). `trg_ap_installment_estado` deriva el estado
--    y la fecha de pago de la cuota de lo abonado, para cualquier camino.
-- 4. `fn_estado_cuenta_proveedor(org, proveedor, desde, hasta)` (finance.view):
--    saldo inicial, cargos (facturas confirmadas por su neto y CxP sin factura),
--    abonos (pagos completados de los dos orígenes), saldo corrido, vencido y
--    por vencer, con el día de la organización.
-- ============================================================================

-- ── 1. Tabla de programaciones ─────────────────────────────────────────────
create table if not exists public.ap_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer null references public.branches(id) on delete set null,
  account_payable_id uuid not null references public.accounts_payable(id) on delete cascade,
  installment_id uuid null references public.ap_installments(id) on delete set null,
  amount numeric not null check (amount > 0),
  scheduled_date date not null,
  method text null references public.payment_methods(code),
  bank_account_id integer null references public.bank_accounts(id),
  reference text null,
  notes text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid null references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by uuid null references auth.users(id),
  decided_at timestamptz null,
  decision_comment text null,
  payment_id uuid null references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ap_payment_schedules is
  'Pagos programados a proveedores pendientes de aprobación (D3). Aprobar crea el pago en payments; el comentario del supervisor va a decision_comment y nunca a payments.reference.';

create index if not exists idx_ap_payment_schedules_org_estado
  on public.ap_payment_schedules (organization_id, status, scheduled_date);
create index if not exists idx_ap_payment_schedules_cuenta
  on public.ap_payment_schedules (account_payable_id);

alter table public.ap_payment_schedules enable row level security;

drop policy if exists ap_payment_schedules_select on public.ap_payment_schedules;
create policy ap_payment_schedules_select on public.ap_payment_schedules
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists branch_access_restrictive on public.ap_payment_schedules;
create policy branch_access_restrictive on public.ap_payment_schedules
  as restrictive for all to authenticated
  using (public.app_branch_access(branch_id))
  with check (public.app_branch_access(branch_id));

revoke all on table public.ap_payment_schedules from anon, public;
revoke insert, update, delete on table public.ap_payment_schedules from authenticated;
grant select on table public.ap_payment_schedules to authenticated;

-- ── Auxiliares internas ────────────────────────────────────────────────────
-- Moneda de un pago a una CxP: la de su factura; si no, la base de la organización.
create or replace function public.fn_cxp_moneda(p_ap_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           nullif(btrim((select ip.currency from public.invoice_purchase ip where ip.id = ap.invoice_id)), ''),
           public.fn_moneda_base_organizacion(ap.organization_id))
    from public.accounts_payable ap
   where ap.id = p_ap_id;
$$;

-- Día elegido + hora de pared de la sucursal (o de la organización) → instante.
-- Mismo criterio que `instantForDayInTz` (src/lib/services/businessInstant.ts).
create or replace function public.fn_fc_instante(p_valor text, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_valor is null or btrim(p_valor) = '' then
    return null;
  end if;
  if btrim(p_valor) ~ '^\d{4}-\d{2}-\d{2}$' then
    return (btrim(p_valor)::date + (now() at time zone p_tz)::time) at time zone p_tz;
  end if;
  return btrim(p_valor)::timestamptz;
end;
$$;

-- ¿El usuario puede aprobar pagos en la organización? (misma regla que el permiso)
create or replace function public.fn_fc_es_aprobador(p_org integer, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_user)
      or exists (select 1 from public.organization_members om
                  where om.user_id = p_user and om.organization_id = p_org and om.is_active
                    and (om.is_super_admin or om.role_id in (1, 2)
                         or public.check_user_permission(p_user, p_org, 'finance.approve')));
$$;

-- Estado de una cuota derivado de lo abonado. El pago único (`fn_registrar_pago`,
-- sesión de ventas) abona la cuota con `paid_amount`/`balance`; el estado y la
-- fecha de pago salen de aquí, para cualquier camino que escriba la cuota.
create or replace function public.fn_ap_installment_estado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  if coalesce(new.paid_amount, 0) > 0 and round(coalesce(new.paid_amount, 0), 2) >= round(coalesce(new.amount, 0), 2) then
    new.status := 'paid';
    new.balance := 0;
    new.paid_at := coalesce(new.paid_at, now());
  elsif coalesce(new.paid_amount, 0) > 0 then
    new.status := 'partial';
    new.paid_at := null;
  elsif new.status in ('partial', 'paid') then
    new.status := 'pending';
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ap_installment_estado on public.ap_installments;
create trigger trg_ap_installment_estado
  before insert or update of paid_amount, amount, balance on public.ap_installments
  for each row execute function public.fn_ap_installment_estado();

revoke all on function public.fn_cxp_moneda(uuid) from public, anon, authenticated;
revoke all on function public.fn_fc_instante(text, text) from public, anon;
grant execute on function public.fn_fc_instante(text, text) to authenticated;
revoke all on function public.fn_fc_es_aprobador(integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_ap_installment_estado() from public, anon, authenticated;

-- ── 2. Programar, aprobar, rechazar, cancelar ──────────────────────────────
create or replace function public.fn_programar_pago(
  p_ap_id uuid,
  p_amount numeric,
  p_scheduled_date date,
  p_method text default 'transfer',
  p_bank_account_id integer default null,
  p_reference text default null,
  p_notes text default null,
  p_installment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ap public.accounts_payable%rowtype;
  v_pendiente numeric;
  v_hoy date;
  v_id uuid;
begin
  select * into v_ap from public.accounts_payable where id = p_ap_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ap.organization_id, array['finance.create']);
  perform public.fn_fc_acceso_sucursal(v_ap.branch_id);

  if v_ap.status in ('paid', 'void') or coalesce(v_ap.balance, 0) <= 0 then
    raise exception 'CUENTA_SIN_SALDO' using errcode = '22023';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'MONTO_INVALIDO' using errcode = '22023';
  end if;
  select coalesce(sum(s.amount), 0) into v_pendiente
    from public.ap_payment_schedules s
   where s.account_payable_id = p_ap_id and s.status = 'pending';
  if round(p_amount, 2) > round(v_ap.balance - v_pendiente, 2) then
    raise exception 'EXCEDE_SALDO_PROGRAMABLE' using errcode = '22023',
      detail = format('Saldo %s, ya programado %s', v_ap.balance, v_pendiente);
  end if;
  if p_scheduled_date is null then
    raise exception 'FECHA_REQUERIDA' using errcode = '22023';
  end if;
  v_hoy := (now() at time zone public.fn_timezone_for(v_ap.organization_id, v_ap.branch_id))::date;
  if p_scheduled_date < v_hoy then
    raise exception 'FECHA_PASADA' using errcode = '22023';
  end if;
  if p_bank_account_id is not null and not exists (
    select 1 from public.bank_accounts b where b.id = p_bank_account_id and b.organization_id = v_ap.organization_id
  ) then
    raise exception 'CUENTA_BANCARIA_INVALIDA' using errcode = '42501';
  end if;
  if p_installment_id is not null and not exists (
    select 1 from public.ap_installments i where i.id = p_installment_id and i.account_payable_id = p_ap_id
  ) then
    raise exception 'CUOTA_INVALIDA' using errcode = '22023';
  end if;

  insert into public.ap_payment_schedules (
    organization_id, branch_id, account_payable_id, installment_id, amount, scheduled_date,
    method, bank_account_id, reference, notes, status, requested_by
  ) values (
    v_ap.organization_id, v_ap.branch_id, p_ap_id, p_installment_id, round(p_amount, 2), p_scheduled_date,
    coalesce(nullif(btrim(p_method), ''), 'transfer'), p_bank_account_id,
    nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), 'pending', auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fn_aprobar_pago_programado(p_id uuid, p_comentario text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.ap_payment_schedules%rowtype;
  v_ap public.accounts_payable%rowtype;
  v_uid uuid := auth.uid();
  v_aprobadores integer;
  v_aviso text := null;
  v_pago uuid;
  v_res jsonb;
begin
  select * into v_s from public.ap_payment_schedules where id = p_id for update;
  if not found then
    raise exception 'PROGRAMACION_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_s.organization_id, array['finance.approve']);
  perform public.fn_fc_acceso_sucursal(v_s.branch_id);
  if v_s.status <> 'pending' then
    raise exception 'PROGRAMACION_NO_PENDIENTE' using errcode = '22023';
  end if;

  -- D7: quien programa no aprueba, salvo que sea el único aprobador.
  if v_uid is not null and v_s.requested_by = v_uid then
    select count(*) into v_aprobadores
      from public.organization_members om
     where om.organization_id = v_s.organization_id and om.is_active
       and public.fn_fc_es_aprobador(v_s.organization_id, om.user_id);
    if v_aprobadores > 1 then
      raise exception 'SEGREGACION_FUNCIONES' using errcode = '42501',
        detail = 'Quien programó el pago no puede aprobarlo: debe aprobarlo otra persona con el permiso finance.approve.';
    end if;
    v_aviso := 'unico_aprobador';
  end if;

  select * into v_ap from public.accounts_payable where id = v_s.account_payable_id;
  if v_ap.status in ('paid', 'void') or round(v_s.amount, 2) > round(coalesce(v_ap.balance, 0), 2) then
    raise exception 'EXCEDE_SALDO' using errcode = '22023';
  end if;

  -- El pago lo registra el pago único (regla 7): mismas validaciones, recibo,
  -- cuota en la misma transacción e idempotencia por programación. La
  -- referencia es la ORIGINAL de la programación.
  v_res := public.fn_registrar_pago(
    'pago',
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'documento', 'account_payable', 'id', v_ap.id, 'monto', v_s.amount, 'cuota_id', v_s.installment_id))),
    coalesce(v_s.method, 'transfer'),
    public.fn_cxp_moneda(v_ap.id),
    public.fn_today_for(v_s.organization_id, coalesce(v_s.branch_id, v_ap.branch_id)),
    v_s.reference,
    v_s.bank_account_id,
    null,
    0,
    'programacion_pago:' || v_s.id,
    v_s.notes,
    'programacion_pago',
    v_s.organization_id
  );
  v_pago := (v_res->'pagos'->0->>'payment_id')::uuid;

  update public.ap_payment_schedules
     set status = 'approved', decided_by = v_uid, decided_at = now(),
         decision_comment = nullif(btrim(p_comentario), ''), payment_id = v_pago, updated_at = now()
   where id = p_id;

  return jsonb_build_object('payment_id', v_pago, 'recibo', v_res->>'recibo', 'aviso', v_aviso);
end;
$$;

create or replace function public.fn_rechazar_pago_programado(p_id uuid, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.ap_payment_schedules%rowtype;
begin
  select * into v_s from public.ap_payment_schedules where id = p_id for update;
  if not found then
    raise exception 'PROGRAMACION_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_s.organization_id, array['finance.approve']);
  perform public.fn_fc_acceso_sucursal(v_s.branch_id);
  if v_s.status <> 'pending' then
    raise exception 'PROGRAMACION_NO_PENDIENTE' using errcode = '22023';
  end if;
  if p_comentario is null or btrim(p_comentario) = '' then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;
  update public.ap_payment_schedules
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         decision_comment = btrim(p_comentario), updated_at = now()
   where id = p_id;
end;
$$;

create or replace function public.fn_cancelar_pago_programado(p_id uuid, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.ap_payment_schedules%rowtype;
begin
  select * into v_s from public.ap_payment_schedules where id = p_id for update;
  if not found then
    raise exception 'PROGRAMACION_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_s.organization_id, array['finance.create']);
  perform public.fn_fc_acceso_sucursal(v_s.branch_id);
  if auth.uid() is not null and v_s.requested_by is distinct from auth.uid() then
    perform public.fn_finanzas_exigir_permiso(v_s.organization_id, array['finance.approve']);
  end if;
  if v_s.status <> 'pending' then
    raise exception 'PROGRAMACION_NO_PENDIENTE' using errcode = '22023';
  end if;
  update public.ap_payment_schedules
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
         decision_comment = nullif(btrim(p_comentario), ''), updated_at = now()
   where id = p_id;
end;
$$;

-- ── 3. Cuotas ──────────────────────────────────────────────────────────────
create or replace function public.fn_cxp_crear_plan_cuotas(p_ap_id uuid, p_cuotas jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ap public.accounts_payable%rowtype;
  v_c jsonb;
  v_n integer := 0;
  v_capital numeric := 0;
begin
  select * into v_ap from public.accounts_payable where id = p_ap_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ap.organization_id, array['finance.create']);
  perform public.fn_fc_acceso_sucursal(v_ap.branch_id);
  if v_ap.status in ('paid', 'void') or coalesce(v_ap.balance, 0) <= 0 then
    raise exception 'CUENTA_SIN_SALDO' using errcode = '22023';
  end if;
  if exists (select 1 from public.ap_installments i where i.account_payable_id = p_ap_id and coalesce(i.paid_amount, 0) > 0) then
    raise exception 'PLAN_CON_ABONOS' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cuotas) is distinct from 'array' then
    raise exception 'CUOTAS_INVALIDAS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cuotas) = 0 or jsonb_array_length(p_cuotas) > 120 then
    raise exception 'CUOTAS_INVALIDAS' using errcode = '22023';
  end if;

  for v_c in select * from jsonb_array_elements(p_cuotas) loop
    if nullif(v_c->>'vence', '') is null or coalesce((v_c->>'capital')::numeric, -1) < 0
       or coalesce((v_c->>'interes')::numeric, 0) < 0 or coalesce((v_c->>'valor')::numeric, 0) <= 0 then
      raise exception 'CUOTAS_INVALIDAS' using errcode = '22023';
    end if;
    v_capital := v_capital + round((v_c->>'capital')::numeric, 2);
  end loop;
  if abs(v_capital - round(v_ap.balance, 2)) > 0.01 then
    raise exception 'PLAN_NO_CUADRA' using errcode = '22023',
      detail = format('Capital %s, saldo %s', v_capital, v_ap.balance);
  end if;

  delete from public.ap_installments where account_payable_id = p_ap_id;
  for v_c in select * from jsonb_array_elements(p_cuotas) loop
    v_n := v_n + 1;
    insert into public.ap_installments (
      account_payable_id, installment_number, due_date, amount, principal, interest, balance, status, paid_amount, notes
    ) values (
      p_ap_id, v_n, (v_c->>'vence')::date, round((v_c->>'valor')::numeric, 2), round((v_c->>'capital')::numeric, 2),
      round(coalesce((v_c->>'interes')::numeric, 0), 2), round((v_c->>'valor')::numeric, 2), 'pending', 0,
      nullif(btrim(v_c->>'nota'), '')
    );
  end loop;
  return v_n;
end;
$$;

create or replace function public.fn_cxp_eliminar_plan_cuotas(p_ap_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ap public.accounts_payable%rowtype;
  v_n integer;
begin
  select * into v_ap from public.accounts_payable where id = p_ap_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ap.organization_id, array['finance.create']);
  perform public.fn_fc_acceso_sucursal(v_ap.branch_id);
  if exists (select 1 from public.ap_installments i where i.account_payable_id = p_ap_id and coalesce(i.paid_amount, 0) > 0) then
    raise exception 'PLAN_CON_ABONOS' using errcode = '22023';
  end if;
  delete from public.ap_installments where account_payable_id = p_ap_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── 4. Estado de cuenta del proveedor ──────────────────────────────────────
-- Movimientos crudos (interna). La visibilidad por sucursal se reproduce con
-- `app_branch_access` (las SECURITY DEFINER no heredan la política restrictiva);
-- el service role (sin usuario) lo ve todo.
create or replace function public.fn_estado_cuenta_proveedor_movs(p_org integer, p_supplier integer)
returns table (fecha timestamptz, tipo text, documento text, ref_id text, vence timestamptz, cargo numeric, abono numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
     and (auth.uid() is null or public.app_branch_access(p.branch_id));
$$;

revoke all on function public.fn_estado_cuenta_proveedor_movs(integer, integer) from public, anon, authenticated;

create or replace function public.fn_estado_cuenta_proveedor(
  p_org integer,
  p_supplier integer,
  p_desde date default null,
  p_hasta date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_hoy date;
  v_prov record;
  v_inicial numeric;
  v_movs jsonb;
  v_cargos numeric;
  v_abonos numeric;
  v_vencido numeric;
  v_por_vencer numeric;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);
  select s.id, s.name, s.nit, s.dv, s.email, s.phone, s.address, s.city into v_prov
    from public.suppliers s where s.id = p_supplier and s.organization_id = p_org;
  if v_prov.id is null then
    raise exception 'PROVEEDOR_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'RANGO_INVALIDO' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(p_org, null);
  v_hoy := (now() at time zone v_tz)::date;

  select coalesce(sum(m.cargo - m.abono), 0) into v_inicial
    from public.fn_estado_cuenta_proveedor_movs(p_org, p_supplier) m
   where p_desde is not null and (m.fecha at time zone v_tz)::date < p_desde;

  select coalesce(jsonb_agg(t.fila order by t.orden), '[]'::jsonb),
         coalesce(sum(t.cargo), 0), coalesce(sum(t.abono), 0)
    into v_movs, v_cargos, v_abonos
    from (
      select m.cargo, m.abono,
             row_number() over w as orden,
             jsonb_build_object(
               'fecha', m.fecha, 'dia', (m.fecha at time zone v_tz)::date, 'tipo', m.tipo,
               'documento', m.documento, 'ref_id', m.ref_id, 'vence', m.vence,
               'cargo', m.cargo, 'abono', m.abono,
               'saldo', v_inicial + sum(m.cargo - m.abono) over w) as fila
        from public.fn_estado_cuenta_proveedor_movs(p_org, p_supplier) m
       where (p_desde is null or (m.fecha at time zone v_tz)::date >= p_desde)
         and (p_hasta is null or (m.fecha at time zone v_tz)::date <= p_hasta)
      window w as (order by m.fecha, m.tipo desc, m.ref_id rows between unbounded preceding and current row)
    ) t;

  select coalesce(sum(case when (ap.due_date at time zone v_tz)::date < v_hoy then ap.balance else 0 end), 0),
         coalesce(sum(case when (ap.due_date at time zone v_tz)::date >= v_hoy then ap.balance else 0 end), 0)
    into v_vencido, v_por_vencer
    from public.accounts_payable ap
    left join public.invoice_purchase ip on ip.id = ap.invoice_id
   where ap.organization_id = p_org and ap.supplier_id = p_supplier
     and coalesce(ap.status, '') not in ('void', 'paid') and coalesce(ap.balance, 0) > 0
     and (ip.id is null or ip.status not in ('draft', 'void', 'voided'))
     and (auth.uid() is null or public.app_branch_access(ap.branch_id));

  return jsonb_build_object(
    'proveedor', jsonb_build_object('id', v_prov.id, 'nombre', v_prov.name, 'nit', v_prov.nit, 'dv', v_prov.dv,
                                    'email', v_prov.email, 'telefono', v_prov.phone, 'direccion', v_prov.address,
                                    'ciudad', v_prov.city),
    'desde', p_desde, 'hasta', p_hasta, 'hoy', v_hoy, 'zona', v_tz,
    'moneda', public.fn_moneda_base_organizacion(p_org),
    'saldo_inicial', v_inicial,
    'movimientos', v_movs,
    'total_cargos', v_cargos,
    'total_abonos', v_abonos,
    'saldo_final', v_inicial + v_cargos - v_abonos,
    'vencido', v_vencido,
    'por_vencer', v_por_vencer
  );
end;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────
revoke all on function public.fn_programar_pago(uuid, numeric, date, text, integer, text, text, uuid) from public, anon;
revoke all on function public.fn_aprobar_pago_programado(uuid, text) from public, anon;
revoke all on function public.fn_rechazar_pago_programado(uuid, text) from public, anon;
revoke all on function public.fn_cancelar_pago_programado(uuid, text) from public, anon;
revoke all on function public.fn_cxp_crear_plan_cuotas(uuid, jsonb) from public, anon;
revoke all on function public.fn_cxp_eliminar_plan_cuotas(uuid) from public, anon;
revoke all on function public.fn_estado_cuenta_proveedor(integer, integer, date, date) from public, anon;

grant execute on function public.fn_programar_pago(uuid, numeric, date, text, integer, text, text, uuid) to authenticated;
grant execute on function public.fn_aprobar_pago_programado(uuid, text) to authenticated;
grant execute on function public.fn_rechazar_pago_programado(uuid, text) to authenticated;
grant execute on function public.fn_cancelar_pago_programado(uuid, text) to authenticated;
grant execute on function public.fn_cxp_crear_plan_cuotas(uuid, jsonb) to authenticated;
grant execute on function public.fn_cxp_eliminar_plan_cuotas(uuid) to authenticated;
grant execute on function public.fn_estado_cuenta_proveedor(integer, integer, date, date) to authenticated;
