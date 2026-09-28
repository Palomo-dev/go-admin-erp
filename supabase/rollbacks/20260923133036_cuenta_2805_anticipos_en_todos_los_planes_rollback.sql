-- Rollback de 20260923133036_cuenta_2805_anticipos_en_todos_los_planes.sql
--
-- Retira el disparador y las funciones. Borra la cuenta 2805 solo donde la creó
-- esta migración (nombre «Anticipos y avances recibidos») y nadie la ha usado:
-- una cuenta con líneas contables no se borra.
drop trigger if exists tr_auto_create_chart_of_accounts_zz_anticipos on public.organizations;
drop function if exists public.trg_fn_asegurar_cuenta_anticipos();
drop function if exists public.fn_asegurar_cuenta_anticipos(integer);

delete from public.chart_of_accounts c
where c.account_code = '2805'
  and c.name = 'Anticipos y avances recibidos'
  and not exists (select 1 from public.journal_lines jl
                  join public.journal_entries je on je.id = jl.journal_entry_id
                  where je.organization_id = c.organization_id and jl.account_code = '2805');
