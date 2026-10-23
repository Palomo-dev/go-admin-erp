create or replace function public.fn_journal_linea_heredar_centro()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modo text;
  v_org integer;
  v_branch integer;
  v_source text;
  v_source_id text;
  v_centro uuid;
  v_slip text;
begin
  select e.organization_id, e.branch_id, e.source, e.source_id
    into v_org, v_branch, v_source, v_source_id
    from public.journal_entries e
   where e.id = new.journal_entry_id;

  if new.organization_id is null or new.organization_id = 0 then
    new.organization_id := coalesce(v_org, new.organization_id);
  end if;
  v_org := coalesce(nullif(new.organization_id, 0), v_org);

  v_modo := public.fn_modo_centro(v_org, new.account_code);
  if v_modo = 'no_aplica' then
    new.cost_center_id := null;
    return new;
  end if;
  if new.cost_center_id is not null then
    return new;
  end if;

  v_slip := split_part(coalesce(v_source_id, ''), ':', 1);
  if v_source = 'payroll_slips'
     and v_slip ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.cost_center_id into v_centro
      from public.payroll_slips s
      join public.employments e on e.id = s.employment_id
     where s.id = v_slip::uuid
       and (
         e.branch_id is null
         or exists (
           select 1 from public.branches b
            where b.id = e.branch_id and b.organization_id = v_org
         )
       );
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.cost_center_id into v_centro
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
    if v_centro is null then
      select case when count(distinct ii.cost_center_id) = 1 then min(ii.cost_center_id::text)::uuid end
        into v_centro
        from public.invoice_items ii
       where ii.invoice_purchase_id = v_source_id::uuid
         and ii.cost_center_id is not null;
    end if;
  end if;

  new.cost_center_id := coalesce(v_centro, public.fn_centro_defecto(v_org, v_branch));
  if new.cost_center_id is null then
    raise warning 'centro_costo_omitido: la cuenta % quedó sin centro', new.account_code;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_journal_linea_heredar_centro on public.journal_lines;
create trigger trg_journal_linea_heredar_centro
  before insert on public.journal_lines
  for each row execute function public.fn_journal_linea_heredar_centro();

-- ---------------------------------------------------------------------------
-- El centro elegido tiene que ser de la misma organización.
-- ---------------------------------------------------------------------------

create or replace function public.fn_centro_misma_org()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_org integer;
begin
  if new.cost_center_id is null then
    return new;
  end if;
  if tg_table_name = 'invoice_purchase' then
    v_org := new.organization_id;
  elsif tg_table_name = 'invoice_items' then
    if new.invoice_purchase_id is null then
      return new;
    end if;
    select ip.organization_id into v_org
      from public.invoice_purchase ip
     where ip.id = new.invoice_purchase_id;
  elsif tg_table_name = 'employments' then
    select b.organization_id into v_org
      from public.branches b
     where b.id = new.branch_id;
  end if;
  if v_org is not null and not exists (
    select 1 from public.cost_centers c
     where c.id = new.cost_center_id
       and c.organization_id = v_org
  ) then
    raise exception 'CENTRO_INVALIDO' using errcode = '22023';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_invoice_purchase_centro_org on public.invoice_purchase;
create trigger trg_invoice_purchase_centro_org
  before insert or update of cost_center_id, organization_id on public.invoice_purchase
  for each row execute function public.fn_centro_misma_org();

drop trigger if exists trg_invoice_items_centro_org on public.invoice_items;
create trigger trg_invoice_items_centro_org
  before insert or update of cost_center_id, invoice_purchase_id on public.invoice_items
  for each row execute function public.fn_centro_misma_org();

drop trigger if exists trg_employments_centro_org on public.employments;
create trigger trg_employments_centro_org
  before insert or update of cost_center_id, branch_id on public.employments
  for each row execute function public.fn_centro_misma_org();

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'invoice_purchase_cost_center_id_fkey'
       and conrelid = 'public.invoice_purchase'::regclass
  ) then
    alter table public.invoice_purchase
      add constraint invoice_purchase_cost_center_id_fkey
      foreign key (cost_center_id) references public.cost_centers(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'invoice_items_cost_center_id_fkey'
       and conrelid = 'public.invoice_items'::regclass
  ) then
    alter table public.invoice_items
      add constraint invoice_items_cost_center_id_fkey
      foreign key (cost_center_id) references public.cost_centers(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'employments_cost_center_id_fkey'
       and conrelid = 'public.employments'::regclass
  ) then
    alter table public.employments
      add constraint employments_cost_center_id_fkey
      foreign key (cost_center_id) references public.cost_centers(id) on delete set null;
  end if;
end
$fk$;

-- ---------------------------------------------------------------------------
