-- Centros de costo por defecto, herencia en el INSERT y reportes.
-- Idempotente. No reescribe centros ya existentes (ON CONFLICT DO NOTHING).
-- La línea recibe el centro en el INSERT; no hay UPDATE posterior de cost_center_id.

-- ---------------------------------------------------------------------------
-- Respaldo del booleano anterior, para poder revertir el backfill del modo.
-- ---------------------------------------------------------------------------

create table if not exists public.centro_costo_modo_respaldo (
  organization_id integer not null,
  account_code text not null,
  requiere_centro_costo boolean not null,
  primary key (organization_id, account_code)
);

create table if not exists public.puc_centro_costo_respaldo (
  codigo text primary key,
  requiere_centro_costo boolean not null
);

insert into public.centro_costo_modo_respaldo (organization_id, account_code, requiere_centro_costo)
select a.organization_id, a.account_code, a.requiere_centro_costo
  from public.chart_of_accounts a
 where not exists (select 1 from public.centro_costo_modo_respaldo);

insert into public.puc_centro_costo_respaldo (codigo, requiere_centro_costo)
select p.codigo, p.requiere_centro_costo
  from public.puc_plantilla p
 where not exists (select 1 from public.puc_centro_costo_respaldo);

revoke all on table public.centro_costo_modo_respaldo from public, anon, authenticated;
revoke all on table public.puc_centro_costo_respaldo from public, anon, authenticated;

alter table public.cost_centers
  add column if not exists branch_id integer,
  add column if not exists level smallint,
  add column if not exists type text,
  add column if not exists template_key text,
  add column if not exists is_default boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'cost_centers_branch_id_fkey'
       and conrelid = 'public.cost_centers'::regclass
  ) then
    alter table public.cost_centers
      add constraint cost_centers_branch_id_fkey
      foreign key (branch_id) references public.branches(id) on delete set null;
  end if;
end $$;

create index if not exists idx_cost_centers_branch
  on public.cost_centers (organization_id, branch_id);

create unique index if not exists uq_cost_centers_un_defecto
  on public.cost_centers (organization_id)
  where is_default and is_active;

alter table public.branches
  add column if not exists default_cost_center_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'branches_default_cost_center_id_fkey'
       and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_default_cost_center_id_fkey
      foreign key (default_cost_center_id) references public.cost_centers(id) on delete set null;
  end if;
end $$;

alter table public.chart_of_accounts
  add column if not exists centro_costo_modo text;

alter table public.puc_plantilla
  add column if not exists centro_costo_modo text;

alter table public.invoice_purchase
  add column if not exists cost_center_id uuid,
  add column if not exists distribucion_id uuid;

alter table public.invoice_items
  add column if not exists cost_center_id uuid;

alter table public.employments
  add column if not exists cost_center_id uuid;

alter table public.cash_movements
  add column if not exists distribucion_id uuid;

alter table public.bank_transactions
  add column if not exists distribucion_id uuid;

-- Modo de las cuentas ANTES de tocar la plantilla.
-- Si el booleano de la cuenta difiere del de la plantilla, se respeta:
-- true sigue obligatorio y false queda opcional (puede recibir centro, no se exige).
-- Sin plantilla, un true en clases 1-3 u 8-9 se conserva como obligatorio
-- y un false en clases 4-7 queda opcional. El resto: 4-7 obligatorio, lo demás no aplica.

update public.chart_of_accounts a
   set centro_costo_modo = m.modo,
       requiere_centro_costo = (m.modo = 'obligatorio')
  from (
    select a2.organization_id,
           a2.account_code,
           case
             when p.codigo is not null
              and a2.requiere_centro_costo is distinct from p.requiere_centro_costo
               then case when a2.requiere_centro_costo then 'obligatorio' else 'opcional' end
             when p.codigo is null
              and left(a2.account_code, 1) in ('1', '2', '3', '8', '9')
              and a2.requiere_centro_costo
               then 'obligatorio'
             when p.codigo is null
              and left(a2.account_code, 1) in ('4', '5', '6', '7')
              and not a2.requiere_centro_costo
               then 'opcional'
             when left(a2.account_code, 1) in ('4', '5', '6', '7') then 'obligatorio'
             else 'no_aplica'
           end as modo
      from public.chart_of_accounts a2
      left join public.puc_plantilla p on p.codigo = a2.account_code
  ) m
 where a.organization_id = m.organization_id
   and a.account_code = m.account_code
   and (
     a.centro_costo_modo is distinct from m.modo
     or a.requiere_centro_costo is distinct from (m.modo = 'obligatorio')
   );

update public.puc_plantilla
   set centro_costo_modo = case
         when left(codigo, 1) in ('4', '5', '6', '7') then 'obligatorio'
         else 'no_aplica'
       end,
       requiere_centro_costo = left(codigo, 1) in ('4', '5', '6', '7')
 where centro_costo_modo is distinct from case
         when left(codigo, 1) in ('4', '5', '6', '7') then 'obligatorio'
         else 'no_aplica'
       end
    or requiere_centro_costo is distinct from (left(codigo, 1) in ('4', '5', '6', '7'));

alter table public.chart_of_accounts
  alter column centro_costo_modo set not null;

alter table public.puc_plantilla
  alter column centro_costo_modo set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'chart_of_accounts_centro_costo_modo_check'
       and conrelid = 'public.chart_of_accounts'::regclass
  ) then
    alter table public.chart_of_accounts
      add constraint chart_of_accounts_centro_costo_modo_check
      check (centro_costo_modo in ('obligatorio', 'opcional', 'no_aplica'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'puc_plantilla_centro_costo_modo_check'
       and conrelid = 'public.puc_plantilla'::regclass
  ) then
    alter table public.puc_plantilla
      add constraint puc_plantilla_centro_costo_modo_check
      check (centro_costo_modo in ('obligatorio', 'opcional', 'no_aplica'));
  end if;
end $$;
