-- La cuenta 2805 en todos los planes contables (F-58, ADR-CC-008).
--
-- fn_create_customer_credit (saldo a favor) acredita 2805 «Anticipos y avances
-- recibidos», pero la cuenta existía en el plan de 1 organización de 85: en las
-- otras 84, fn_create_journal_entry rechaza el asiento (credit_account_missing,
-- queda en journal_entry_failures) y el saldo a favor nace sin contabilidad.
-- Medido al aplicar: 0 saldos a favor en credit_notes, así que no hay asientos
-- pendientes de crear.
--
-- · fn_asegurar_cuenta_anticipos(org): crea 2805 si no existe. Padre: 21 si el
--   plan lo tiene; si no (plan alterno de 4 dígitos), el padre de su cuenta por
--   pagar; si tampoco, sin padre.
-- · Relleno de las organizaciones existentes.
-- · Disparador AFTER INSERT en organizations, que corre después del que siembra
--   el plan por defecto (los disparadores del mismo evento van en orden
--   alfabético y este nombre ordena detrás de tr_auto_create_chart_of_accounts).

create or replace function public.fn_asegurar_cuenta_anticipos(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_parent text;
begin
  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2805') then
    return;
  end if;

  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '21') then
    v_parent := '21';
  else
    select parent_code into v_parent
    from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in ('2105', '2101', '2205', '2102')
      and parent_code is not null
    order by account_code
    limit 1;
  end if;

  insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
  values (p_organization_id, '2805', 'Anticipos y avances recibidos', 'liability', v_parent, true,
          'Saldos a favor de clientes: anticipos y notas crédito sobre facturas ya pagadas')
  on conflict (organization_id, account_code) do nothing;
end;
$$;

revoke all on function public.fn_asegurar_cuenta_anticipos(integer) from public, anon, authenticated;
grant execute on function public.fn_asegurar_cuenta_anticipos(integer) to service_role;

create or replace function public.trg_fn_asegurar_cuenta_anticipos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform fn_asegurar_cuenta_anticipos(NEW.id);
  return NEW;
exception when others then
  -- Nunca bloquear el alta de una organización por esta cuenta.
  raise warning 'No se pudo crear la cuenta 2805 para la organización %: %', NEW.id, SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists tr_auto_create_chart_of_accounts_zz_anticipos on public.organizations;
create trigger tr_auto_create_chart_of_accounts_zz_anticipos
  after insert on public.organizations
  for each row execute function public.trg_fn_asegurar_cuenta_anticipos();

select fn_asegurar_cuenta_anticipos(o.id) from organizations o;
