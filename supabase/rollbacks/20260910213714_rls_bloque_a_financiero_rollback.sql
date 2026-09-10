-- ============================================================
-- ROLLBACK de 20260910210000_rls_bloque_a_financiero.sql
-- ============================================================
-- Restaura las políticas tal y como estaban, transcritas de `pg_policies`
-- antes de aplicar la migración (no de memoria).
--
-- ⚠️ ADVERTENCIA: volver atrás REABRE la fuga entre organizaciones. Las
-- políticas de abajo son las originales, con `USING (true)` y con
-- `auth.role() = 'authenticated'`, que permite a cualquier usuario con sesión
-- —de cualquier organización— gestionar pagos y comisiones ajenos. Y devuelve
-- a `anon` lectura y escritura sobre las ocho tablas.
--
-- Úsese solo si la migración deja fuera a alguien que sí debería entrar. En ese
-- caso lo correcto suele ser marcarle el permiso en la pantalla de cargos o de
-- roles, no revertir esto.
-- ============================================================

begin;

set local lock_timeout = '3s';

-- Quitar las políticas nuevas
drop policy if exists of_accounts_lectura        on public.open_finance_accounts;
drop policy if exists of_accounts_escritura      on public.open_finance_accounts;
drop policy if exists of_consents_lectura        on public.open_finance_consents;
drop policy if exists of_consents_escritura      on public.open_finance_consents;
drop policy if exists of_links_lectura           on public.open_finance_links;
drop policy if exists of_links_escritura         on public.open_finance_links;
drop policy if exists of_transactions_lectura    on public.open_finance_transactions;
drop policy if exists of_transactions_escritura  on public.open_finance_transactions;
drop policy if exists payout_accounts_lectura    on public.organization_payout_accounts;
drop policy if exists payout_accounts_escritura  on public.organization_payout_accounts;
drop policy if exists payouts_lectura            on public.organization_payouts;
drop policy if exists payouts_escritura          on public.organization_payouts;
drop policy if exists commission_rates_lectura   on public.organization_commission_rates;
drop policy if exists commission_rates_escritura on public.organization_commission_rates;
drop policy if exists payment_methods_lectura    on public.organization_payment_methods;
drop policy if exists payment_methods_escritura  on public.organization_payment_methods;

-- Restaurar las originales
create policy "Org can manage own accounts"     on public.open_finance_accounts     for all    using (true);
create policy "Org can read own accounts"       on public.open_finance_accounts     for select using (true);
create policy "Org can manage own consents"     on public.open_finance_consents     for all    using (true);
create policy "Org can read own consents"       on public.open_finance_consents     for select using (true);
create policy "Org can manage own links"        on public.open_finance_links        for all    using (true);
create policy "Org can read own links"          on public.open_finance_links        for select using (true);
create policy "Org can manage own transactions" on public.open_finance_transactions for all    using (true);
create policy "Org can read own transactions"   on public.open_finance_transactions for select using (true);

create policy "Org can manage own payout accounts" on public.organization_payout_accounts for all using (true);

create policy "Admin can manage payouts" on public.organization_payouts for all
  using (auth.role() = 'authenticated'::text);
create policy "Org can read own payouts" on public.organization_payouts for select using (true);

create policy "Admin can manage commission rates" on public.organization_commission_rates for all
  using (auth.role() = 'authenticated'::text);
create policy "Org can read own commission rates" on public.organization_commission_rates for select using (true);

create policy "Allow anon select organization_payment_methods" on public.organization_payment_methods
  for select using (true);
create policy "Organizaciones pueden ver sus métodos de pago" on public.organization_payment_methods
  for select using (
    organization_id in (select organization_members.organization_id
                        from organization_members
                        where organization_members.user_id = auth.uid())
  );
create policy "Organizaciones pueden modificar sus métodos de pago" on public.organization_payment_methods
  for all
  using (
    organization_id in (select organization_members.organization_id
                        from organization_members
                        where organization_members.user_id = auth.uid())
  )
  with check (
    organization_id in (select organization_members.organization_id
                        from organization_members
                        where organization_members.user_id = auth.uid())
  );

-- Devolver los privilegios de `anon`
grant select, insert, update, delete on public.open_finance_accounts         to anon;
grant select, insert, update, delete on public.open_finance_consents         to anon;
grant select, insert, update, delete on public.open_finance_links            to anon;
grant select, insert, update, delete on public.open_finance_transactions     to anon;
grant select, insert, update, delete on public.organization_payout_accounts  to anon;
grant select, insert, update, delete on public.organization_payouts          to anon;
grant select, insert, update, delete on public.organization_commission_rates to anon;
grant select, insert, update, delete on public.organization_payment_methods  to anon;

commit;
