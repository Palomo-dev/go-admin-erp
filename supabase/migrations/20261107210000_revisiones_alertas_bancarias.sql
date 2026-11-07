-- ============================================================================
-- Revisiones de alertas de cuentas de dinero (Finanzas, ronda 2 · pieza A1/A2)
-- ============================================================================
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (frente A). Sin ella, la
-- pestaña «Alertas» de Cuentas de dinero muestra las alertas y avisa que la
-- revisión aún no se puede guardar.
--
-- Por qué: «Resolver» de /finanzas/bancos/anomalias no guardaba nada
-- (`markAnomalyResolved` solo hacía `console.log`). Las alertas se calculan al
-- vuelo en `anomalyDetectionService` (duplicados, montos inusuales, patrones y
-- diferencias de saldo); no existe tabla de alertas. Esta tabla guarda la
-- REVISIÓN de cada una: quién, cuándo, qué encontró y qué hizo.
--
-- `alert_key` es la clave estable que arma el servicio con datos de la alerta
-- (`dup:12,15`, `unusual_amount:88`, `disc:3:40000.00`…; ver
-- `src/lib/services/integrations/openFinance/alertasBancarias.ts`). Si la alerta
-- cambia (aparece un tercer duplicado, la diferencia de saldo es otra), la clave
-- cambia y la alerta vuelve a quedar abierta.
--
-- Historial inmutable: sin políticas de UPDATE ni DELETE. «Es un duplicado» NO
-- borra nada: anula un movimiento con `fn_movimiento_banco_anular` (movimiento
-- contrario) y aquí queda `voided_bank_transaction_id`.
--
-- Aditiva: tabla nueva, sin tocar tablas con datos.
-- ============================================================================

create table if not exists public.bank_alert_reviews (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 300),
  alert_type text not null check (alert_type in (
    'duplicate',
    'unusual_amount',
    'unusual_time',
    'fragmentation',
    'weekend_high_amount',
    'balance_discrepancy'
  )),
  bank_account_id integer references public.bank_accounts(id) on delete set null,
  outcome text not null default 'revisada' check (outcome in ('revisada', 'duplicado_anulado')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  voided_bank_transaction_id integer references public.bank_transactions(id) on delete set null,
  reviewed_by uuid not null default auth.uid() references auth.users(id),
  reviewed_at timestamptz not null default now(),
  constraint bank_alert_reviews_org_key_uq unique (organization_id, alert_key),
  constraint bank_alert_reviews_anulado_ck check (
    outcome <> 'duplicado_anulado' or voided_bank_transaction_id is not null
  )
);

comment on table public.bank_alert_reviews is
  'Revisión de una alerta de cuentas de dinero (duplicado, monto inusual, patrón, diferencia de saldo): autor, fecha, motivo y resultado. Historial inmutable.';
comment on column public.bank_alert_reviews.alert_key is
  'Clave estable de la alerta que arma anomalyDetectionService; si la alerta cambia, cambia la clave.';
comment on column public.bank_alert_reviews.outcome is
  'revisada: no era un error. duplicado_anulado: se anuló uno de los movimientos (movimiento contrario, nunca borrado).';

create index if not exists bank_alert_reviews_cuenta_idx
  on public.bank_alert_reviews (bank_account_id)
  where bank_account_id is not null;

alter table public.bank_alert_reviews enable row level security;

drop policy if exists bank_alert_reviews_lectura on public.bank_alert_reviews;
create policy bank_alert_reviews_lectura on public.bank_alert_reviews
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists bank_alert_reviews_alta on public.bank_alert_reviews;
create policy bank_alert_reviews_alta on public.bank_alert_reviews
  for insert to authenticated
  with check (
    reviewed_by = (select auth.uid())
    and organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.create')
    )
  );

revoke all on table public.bank_alert_reviews from anon, public;
grant select, insert on table public.bank_alert_reviews to authenticated;
grant all on table public.bank_alert_reviews to service_role;
