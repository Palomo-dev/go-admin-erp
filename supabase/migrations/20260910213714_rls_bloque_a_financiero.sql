-- ============================================================
-- Bloque A (financiero): cerrar las políticas abiertas
-- ============================================================
-- PROBLEMA: las 8 tablas de dinero tenían políticas con `USING (true)`, o con
-- `auth.role() = 'authenticated'`, que NO es una comprobación de tenant:
-- significa "cualquier usuario con sesión, de cualquier organización". Además
-- `anon` tenía SELECT e INSERT sobre las 8.
--
-- REGLA APLICADA (acordada con el dueño):
--   · LEER   → basta pertenecer a la organización.
--   · ESCRIBIR → pertenecer + tener el permiso según roles y cargos.
--
-- Por qué leer no exige permiso: hoy solo "Admin de organización" y 3 cargos
-- tienen permisos de finanzas. Exigirlo para leer dejaría sin métodos de pago a
-- los 39 "Empleado" y 1 "Manager" activos, que los usan al aplicar abonos en
-- cuentas por cobrar. Pasar de "lo ve todo el mundo" a "solo los de tu
-- organización" ya cierra la fuga entre tenants.
--
-- EL PERMISO SE CONSULTA, NO SE CABLEA: `check_user_permission()` mira primero
-- el checkbox del CARGO (`job_position_permissions`, pantalla de cargos) y, si
-- el cargo no define el permiso, cae al del ROL (`role_permissions`, pantalla
-- de roles). Escribir `role_id = 2` a mano habría ignorado esos checkboxes.
--
-- RENDIMIENTO: `check_user_permission` es VOLATILE, así que llamarla por fila
-- provocaría el mismo timeout que sufrió `product_images`. Por eso va DENTRO de
-- la subconsulta de `organization_members`: se evalúa una vez por organización
-- del usuario (5 como mucho), no una vez por fila. `auth.uid()` va envuelto en
-- `(select ...)` para que sea un InitPlan único.
--
-- COMBINACIÓN DE POLÍTICAS: las permisivas se unen con OR.
--   · SELECT  → aplica la de lectura Y la de escritura → basta pertenencia.
--   · INSERT/UPDATE/DELETE → solo aplica la de escritura → exige permiso.
--
-- NO AFECTA AL BACKEND: openFinanceService, cronJobs, payoutService y
-- commissionService usan `getSupabaseAdmin` (service_role), que ignora RLS.
-- ============================================================

begin;

set local lock_timeout = '3s';

-- ------------------------------------------------------------
-- open_finance_* : conexiones bancarias y movimientos.
-- Escritura con 'finance.create' (las crea el flujo de conexión).
-- ------------------------------------------------------------
drop policy if exists "Org can manage own accounts"      on public.open_finance_accounts;
drop policy if exists "Org can read own accounts"        on public.open_finance_accounts;
drop policy if exists "Org can manage own consents"      on public.open_finance_consents;
drop policy if exists "Org can read own consents"        on public.open_finance_consents;
drop policy if exists "Org can manage own links"         on public.open_finance_links;
drop policy if exists "Org can read own links"           on public.open_finance_links;
drop policy if exists "Org can manage own transactions"  on public.open_finance_transactions;
drop policy if exists "Org can read own transactions"    on public.open_finance_transactions;

create policy of_accounts_lectura on public.open_finance_accounts
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy of_accounts_escritura on public.open_finance_accounts
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.create')
    )
  );

create policy of_consents_lectura on public.open_finance_consents
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy of_consents_escritura on public.open_finance_consents
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.create')
    )
  );

create policy of_links_lectura on public.open_finance_links
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy of_links_escritura on public.open_finance_links
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.create')
    )
  );

create policy of_transactions_lectura on public.open_finance_transactions
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy of_transactions_escritura on public.open_finance_transactions
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.create')
    )
  );

-- ------------------------------------------------------------
-- Pagos y comisiones: mueven dinero. Escritura con 'finance.approve'.
-- Las políticas viejas usaban `auth.role() = 'authenticated'`.
-- ------------------------------------------------------------
drop policy if exists "Org can manage own payout accounts"   on public.organization_payout_accounts;
drop policy if exists "Admin can manage payouts"             on public.organization_payouts;
drop policy if exists "Org can read own payouts"             on public.organization_payouts;
drop policy if exists "Admin can manage commission rates"    on public.organization_commission_rates;
drop policy if exists "Org can read own commission rates"    on public.organization_commission_rates;

create policy payout_accounts_lectura on public.organization_payout_accounts
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy payout_accounts_escritura on public.organization_payout_accounts
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.approve')
    )
  );

create policy payouts_lectura on public.organization_payouts
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy payouts_escritura on public.organization_payouts
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.approve')
    )
  );

create policy commission_rates_lectura on public.organization_commission_rates
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy commission_rates_escritura on public.organization_commission_rates
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'finance.approve')
    )
  );

-- ------------------------------------------------------------
-- organization_payment_methods: 273 filas de 83 organizaciones, la ÚNICA de
-- las ocho con datos reales expuestos hoy. Ya tenía dos políticas correctas
-- por pertenencia; sobraba la abierta. Se reescriben además las dos correctas
-- para exigir `is_active` (un miembro dado de baja seguía viéndolos) y para
-- envolver `auth.uid()`, que sin `(select ...)` se evalúa por fila.
-- ------------------------------------------------------------
drop policy if exists "Allow anon select organization_payment_methods"      on public.organization_payment_methods;
drop policy if exists "Organizaciones pueden ver sus métodos de pago"       on public.organization_payment_methods;
drop policy if exists "Organizaciones pueden modificar sus métodos de pago" on public.organization_payment_methods;

create policy payment_methods_lectura on public.organization_payment_methods
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
create policy payment_methods_escritura on public.organization_payment_methods
  for all using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
        and public.check_user_permission((select auth.uid()), om.organization_id, 'billing_management')
    )
  );

-- ------------------------------------------------------------
-- Ninguna de las ocho se sirve a visitantes sin sesión.
-- ------------------------------------------------------------
revoke select, insert, update, delete on public.open_finance_accounts         from anon;
revoke select, insert, update, delete on public.open_finance_consents         from anon;
revoke select, insert, update, delete on public.open_finance_links            from anon;
revoke select, insert, update, delete on public.open_finance_transactions     from anon;
revoke select, insert, update, delete on public.organization_payout_accounts  from anon;
revoke select, insert, update, delete on public.organization_payouts          from anon;
revoke select, insert, update, delete on public.organization_commission_rates from anon;
revoke select, insert, update, delete on public.organization_payment_methods  from anon;

commit;
