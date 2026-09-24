-- Cartera: plan de cuotas y recordatorios en la base (P1.9 y P11 del plan de ventas y CxC)
--
-- Antes: el detalle de la cuenta por cobrar escribía ar_installments desde el
-- navegador (insert/delete/update sueltos, cuentas-por-cobrar/id/service.ts:354-511)
-- y el «recordatorio» solo cambiaba accounts_receivable.last_reminder_date: el
-- envío era simulado y no quedaba historial.
--
-- 1. fn_cxc_crear_plan_cuotas(p_ar_id, p_cuotas) y fn_cxc_eliminar_plan_cuotas(p_ar_id):
--    mismo contrato que las de CxP (fn_cxp_crear_plan_cuotas): el capital debe
--    sumar el saldo; no se reemplaza un plan con abonos. Pagar una cuota es el
--    pago único (fn_registrar_pago con cuota_id), no esta función.
-- 2. ar_reminders: historial de recordatorios (canal, destino, estado, correo
--    enviado). RLS de lectura por pertenencia y sucursal; sin políticas de
--    escritura: solo fn_cxc_registrar_recordatorio escribe.
-- 3. fn_cxc_registrar_recordatorio: registra el envío (lo hace el servidor con el
--    correo del CRM) y, si salió, actualiza last_reminder_date (la única columna
--    de la cartera que se escribe fuera de los disparadores).
--
-- Aditiva: tabla nueva y funciones nuevas.

-- ── 1. Plan de cuotas ────────────────────────────────────────────────────────
create or replace function public.fn_cxc_crear_plan_cuotas(p_ar_id uuid, p_cuotas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ar public.accounts_receivable%rowtype;
  v_c jsonb;
  v_n integer := 0;
  v_capital numeric := 0;
begin
  select * into v_ar from public.accounts_receivable where id = p_ar_id for update;
  if not found then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ar.organization_id, array['finance.create']);
  if v_ar.branch_id is not null and not public.app_branch_access(v_ar.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ar.status in ('paid', 'cancelled') or coalesce(v_ar.balance, 0) <= 0 then
    raise exception 'cuenta_sin_saldo' using errcode = '22023';
  end if;
  if exists (select 1 from public.ar_installments i where i.account_receivable_id = p_ar_id and coalesce(i.paid_amount, 0) > 0) then
    raise exception 'plan_con_abonos' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cuotas) is distinct from 'array' or jsonb_array_length(p_cuotas) = 0 or jsonb_array_length(p_cuotas) > 120 then
    raise exception 'cuotas_invalidas' using errcode = '22023';
  end if;

  for v_c in select * from jsonb_array_elements(p_cuotas) loop
    if nullif(v_c->>'vence', '') is null or coalesce((v_c->>'capital')::numeric, -1) < 0
       or coalesce((v_c->>'interes')::numeric, 0) < 0 or coalesce((v_c->>'valor')::numeric, 0) <= 0 then
      raise exception 'cuotas_invalidas' using errcode = '22023';
    end if;
    v_capital := v_capital + round((v_c->>'capital')::numeric, 2);
  end loop;
  if abs(v_capital - round(v_ar.balance, 2)) > 0.01 then
    raise exception 'plan_no_cuadra' using errcode = '22023',
      detail = jsonb_build_object('capital', v_capital, 'saldo', v_ar.balance)::text;
  end if;

  delete from public.ar_installments where account_receivable_id = p_ar_id;
  for v_c in select * from jsonb_array_elements(p_cuotas) loop
    v_n := v_n + 1;
    insert into public.ar_installments (
      account_receivable_id, installment_number, due_date, amount, principal, interest, balance, status, paid_amount
    ) values (
      p_ar_id, v_n, (v_c->>'vence')::date, round((v_c->>'valor')::numeric, 2), round((v_c->>'capital')::numeric, 2),
      round(coalesce((v_c->>'interes')::numeric, 0), 2), round((v_c->>'valor')::numeric, 2), 'pending', 0
    );
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.fn_cxc_crear_plan_cuotas(uuid, jsonb) from public, anon;
grant execute on function public.fn_cxc_crear_plan_cuotas(uuid, jsonb) to authenticated, service_role;

create or replace function public.fn_cxc_eliminar_plan_cuotas(p_ar_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ar public.accounts_receivable%rowtype;
  v_n integer;
begin
  select * into v_ar from public.accounts_receivable where id = p_ar_id for update;
  if not found then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ar.organization_id, array['finance.create']);
  if v_ar.branch_id is not null and not public.app_branch_access(v_ar.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if exists (select 1 from public.ar_installments i where i.account_receivable_id = p_ar_id and coalesce(i.paid_amount, 0) > 0) then
    raise exception 'plan_con_abonos' using errcode = '22023';
  end if;
  delete from public.ar_installments where account_receivable_id = p_ar_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.fn_cxc_eliminar_plan_cuotas(uuid) from public, anon;
grant execute on function public.fn_cxc_eliminar_plan_cuotas(uuid) to authenticated, service_role;

-- ── 2. Historial de recordatorios ────────────────────────────────────────────
create table if not exists public.ar_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  account_receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  branch_id integer references public.branches(id),
  channel text not null check (channel in ('correo', 'whatsapp', 'sms', 'interno')),
  template text,
  status text not null check (status in ('enviado', 'fallido')),
  destination text,
  message text,
  email_message_id uuid,
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.ar_reminders is
  'Recordatorios de cobro enviados por cuenta por cobrar. Solo lo escribe fn_cxc_registrar_recordatorio (el envío lo hace el servidor con el correo del CRM).';

create index if not exists idx_ar_reminders_cuenta on public.ar_reminders (account_receivable_id, created_at desc);
create index if not exists idx_ar_reminders_org on public.ar_reminders (organization_id, created_at desc);

alter table public.ar_reminders enable row level security;

drop policy if exists ar_reminders_select on public.ar_reminders;
create policy ar_reminders_select on public.ar_reminders
  for select to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om
                         where om.user_id = (select auth.uid()) and om.is_active)
    and (branch_id is null or public.app_branch_access(branch_id))
  );

-- ── 3. Registrar un recordatorio ─────────────────────────────────────────────
create or replace function public.fn_cxc_registrar_recordatorio(
  p_ar_id uuid,
  p_canal text,
  p_estado text,
  p_destino text default null,
  p_mensaje text default null,
  p_email_message_id uuid default null,
  p_error text default null,
  p_plantilla text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ar public.accounts_receivable%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_ar from public.accounts_receivable where id = p_ar_id;
  if not found then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ar.organization_id, array['finance.create', 'pos.create']);
  if v_ar.branch_id is not null and not public.app_branch_access(v_ar.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if p_canal not in ('correo', 'whatsapp', 'sms', 'interno') or p_estado not in ('enviado', 'fallido') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  insert into public.ar_reminders (organization_id, account_receivable_id, customer_id, branch_id, channel, template,
                                   status, destination, message, email_message_id, error, created_by)
  values (v_ar.organization_id, v_ar.id, v_ar.customer_id, v_ar.branch_id, p_canal, nullif(btrim(coalesce(p_plantilla, '')), ''),
          p_estado, nullif(btrim(coalesce(p_destino, '')), ''), left(nullif(btrim(coalesce(p_mensaje, '')), ''), 4000),
          p_email_message_id, left(p_error, 1000), auth.uid())
  returning id into v_id;

  if p_estado = 'enviado' then
    update public.accounts_receivable set last_reminder_date = now() where id = v_ar.id;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.fn_cxc_registrar_recordatorio(uuid, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.fn_cxc_registrar_recordatorio(uuid, text, text, text, text, uuid, text, text) to authenticated, service_role;
