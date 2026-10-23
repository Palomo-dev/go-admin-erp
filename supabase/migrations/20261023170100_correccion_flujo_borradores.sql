-- Borradores de reversión y reclasificación. No publica nada.
-- La org 149 no entra. La org 338 ya tiene reversos publicados del ajuste
-- masivo: no se duplican. El saldo inicial contra 3105 espera el conteo real.
-- Reversión: supabase/rollbacks/20261023170100_correccion_flujo_borradores_rollback.sql

set lock_timeout = '15s';
set statement_timeout = '300s';

create table if not exists public.correccion_flujo_linea_respaldo (
  id bigint generated always as identity primary key,
  accion text not null,
  journal_line_id integer,
  journal_entry_id integer,
  organization_id integer,
  account_code text,
  description text,
  debit numeric,
  credit numeric,
  debit_base numeric,
  credit_base numeric,
  aplicado_en timestamptz not null default now()
);

create unique index if not exists correccion_flujo_linea_respaldo_marca
  on public.correccion_flujo_linea_respaldo (accion)
  where journal_line_id is null;

create unique index if not exists correccion_flujo_linea_respaldo_linea
  on public.correccion_flujo_linea_respaldo (accion, journal_line_id)
  where journal_line_id is not null;

create table if not exists public.correccion_flujo_aviso (
  id bigint generated always as identity primary key,
  organization_id integer,
  clase text not null,
  journal_entry_id integer,
  monto numeric not null default 0,
  detalle jsonb,
  nota text
);

create index if not exists correccion_flujo_aviso_org_idx
  on public.correccion_flujo_aviso (organization_id, clase);

revoke all on public.correccion_flujo_linea_respaldo from public, anon, authenticated;
revoke all on public.correccion_flujo_aviso from public, anon, authenticated;
alter table public.correccion_flujo_linea_respaldo enable row level security;
alter table public.correccion_flujo_aviso enable row level security;

create or replace function public.fn_correccion_flujo_borradores()
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_editar integer := 0;
  v_org integer;
  v_grupo text;
  v_key text;
  v_entry integer;
  v_posted boolean;
  v_branch integer;
  v_tz text;
  v_fecha timestamptz;
  v_memo text;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  r record;
  v_solape numeric;
  v_debito numeric;
  v_linea integer;
  v_credito numeric;
  v_quitar numeric;
begin
  if auth.role() in ('anon', 'authenticated') then
    raise exception 'sin_permiso';
  end if;

  if not exists (
    select 1 from public.journal_entries
    where id = 811 and organization_id = 130 and source = 'invoice_sales'
      and memo = 'Venta HB-0012' and posted is true
  ) then
    raise exception 'el asiento 811 no es la factura anulada de la org 130';
  end if;

  if exists (
    select 1 from public.journal_entries
    where fact_key = 'reversal:811' and organization_id = 130 and posted is true
  ) then
    raise exception 'el asiento 811 ya tiene un reverso publicado';
  end if;

  if (
    select round(sum(case when account_code = '2405' then debit else 0 end), 2)
         + round(sum(case when account_code = '4105' then credit else 0 end), 2)
         + round(sum(case when account_code = '1305' then debit else 0 end), 2)
    from public.journal_lines
    where journal_entry_id = 811
  ) is distinct from 1000000.00 then
    raise exception 'las lineas del asiento 811 no coinciden con el comprobante a revertir';
  end if;

  drop table if exists pg_temp._corr_dobles;
  create temporary table _corr_dobles as
  select ia.organization_id, ia.id
  from public.inventory_adjustments ia
  where ia.organization_id <> 149
    and ia.type = 'gain'
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = ia.organization_id
        and je.source = 'inventory_adjustment'
        and je.source_id = ia.id::text
        and je.posted is true
    )
    and exists (
      select 1
      from public.stock_movements sm
      join public.journal_entries jes
        on jes.organization_id = sm.organization_id
       and jes.source = 'stock_movements'
       and jes.source_id = sm.id::text
       and jes.posted is true
      where sm.organization_id = ia.organization_id
        and sm.source = 'adjustment'
        and sm.source_id = ia.id::text
    );

  drop table if exists pg_temp._corr_solape;
  create temporary table _corr_solape as
  select d.organization_id, jl.account_code, sum(jl.debit) as monto
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
   and sm.direction = 'out'
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl
    on jl.journal_entry_id = je.id
   and jl.debit > 0
   and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
  group by d.organization_id, jl.account_code
  having sum(jl.debit) >= 0.01;

  with marca as (
    insert into public.correccion_flujo_linea_respaldo (accion)
    values ('edicion_borradores')
    on conflict (accion) where journal_line_id is null do nothing
    returning id
  )
  select count(*) into v_editar from marca;

  if v_editar = 1 then
    if exists (
      select 1
      from public.journal_entries je
      where je.posted is true
        and je.fact_key like 'regla_contable:%'
        and je.organization_id <> 149
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    ) then
      raise exception 'un comprobante regla_contable ya esta publicado';
    end if;

    for r in
      select je.id as entry_id, je.organization_id
      from public.journal_entries je
      where je.posted is false
        and je.organization_id <> 149
        and je.fact_key = 'regla_contable:' || je.organization_id::text
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    loop
      select coalesce(sum(jl.credit), 0) into v_quitar
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      select coalesce(sum(monto), 0) into v_solape
      from pg_temp._corr_solape
      where organization_id = r.organization_id;

      select count(*), coalesce(sum(debit), 0)
        into v_linea, v_debito
      from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit > 0;

      if v_linea <> 1 or v_debito + 0.02 < v_quitar + v_solape then
        raise exception 'la org % no puede absorber el credito de 5150 o el solape', r.organization_id;
      end if;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'debito_original', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and jl.account_code = '519595'
        and jl.debit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'quitar_5150', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      delete from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      for v_cuenta in
        select account_code from pg_temp._corr_solape where organization_id = r.organization_id
      loop
        select coalesce(sum(monto), 0) into v_solape
        from pg_temp._corr_solape
        where organization_id = r.organization_id
          and account_code = v_cuenta;

        select jl.id, jl.credit into v_linea, v_credito
        from public.journal_lines jl
        where jl.journal_entry_id = r.entry_id
          and jl.account_code = v_cuenta
          and jl.credit > 0
        order by jl.credit desc, jl.id
        limit 1;

        if v_linea is null or v_credito + 0.02 < v_solape then
          raise exception 'la org % no tiene credito suficiente en %', r.organization_id, v_cuenta;
        end if;

        insert into public.correccion_flujo_linea_respaldo (
          accion, journal_line_id, journal_entry_id, organization_id, account_code,
          description, debit, credit, debit_base, credit_base
        )
        select 'quitar_solape_6105', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
               jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
        from public.journal_lines jl
        where jl.id = v_linea
        on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

        if v_credito - v_solape <= 0.005 then
          delete from public.journal_lines where id = v_linea;
        else
          update public.journal_lines
             set credit = credit - v_solape,
                 credit_base = credit - v_solape,
                 updated_at = now()
           where id = v_linea;
        end if;
      end loop;

      update public.journal_lines
         set debit = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             debit_base = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             updated_at = now()
       where journal_entry_id = r.entry_id
         and account_code = '519595'
         and debit > 0;

      delete from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit <= 0.005
        and credit <= 0.005;
    end loop;
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d, coalesce(sum(credit), 0) as c
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where je.fact_key like 'regla_contable:%'
      and je.posted is false
      and l.d is distinct from l.c
  ) then
    raise exception 'el borrador regla_contable quedo descuadrado';
  end if;

  drop table if exists pg_temp._corr_cruda;
  create temporary table _corr_cruda (
    organization_id integer,
    grupo text,
    clase text,
    cuenta text,
    debito numeric,
    credito numeric
  );

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_masivo', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.stock_movements sm
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where sm.organization_id in (137, 338)
    and sm.organization_id <> 149
    and sm.source = 'adjustment'
    and sm.source_id is null
    and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    and not exists (
      select 1 from public.journal_entries rev
      where rev.organization_id = je.organization_id
        and rev.posted is true
        and rev.fact_key = 'reversal:' || je.id::text
    )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_sobrante', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where not exists (
    select 1 from public.journal_entries rev
    where rev.organization_id = je.organization_id
      and rev.posted is true
      and rev.fact_key = 'reversal:' || je.id::text
  )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reversion', 'reversion_factura_anulada', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.journal_lines jl
  where jl.journal_entry_id = 811
  group by jl.account_code;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2105', '2105', s.neto, 0
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2105', s.destino, 0, s.neto
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s;

  drop table if exists pg_temp._corr_2405;
  create temporary table _corr_2405 as
  with recursive caminata as (
    select je.id, je.organization_id, je.source, je.fact_key, je.source as raiz, 0 as nivel
    from public.journal_entries je
    where je.posted is true
      and je.organization_id <> 149
      and je.id <> 811
      and exists (
        select 1 from public.journal_lines jl
        where jl.journal_entry_id = je.id
          and jl.account_code = '2405'
      )
    union all
    select c.id, c.organization_id, c.source, padre.fact_key, padre.source, c.nivel + 1
    from caminata c
    join public.journal_entries padre
      on c.raiz = 'reversal'
     and padre.id::text = regexp_replace(coalesce(c.fact_key, ''), '^reversal:', '')
     and c.nivel < 4
  ),
  raices as (
    select distinct on (c.id) c.id, c.raiz
    from caminata c
    order by c.id, c.nivel desc
  )
  select je.organization_id, je.id as entry_id, je.source, ra.raiz, jl.debit, jl.credit
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join raices ra on ra.id = je.id
  where jl.account_code = '2405';

  if exists (
    select 1 from pg_temp._corr_2405
    where raiz not in (
      'invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable',
      'invoice_sales', 'sales', 'reservation', 'credit_note'
    )
  ) then
    raise exception 'hay 2405 sin clasificar';
  end if;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', '240810', s.neto, 0
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', '2405', 0, s.neto
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then '2405' else '240805' end,
         abs(s.neto), 0
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then '240805' else '2405' end,
         0, abs(s.neto)
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_5150', '5145', s.neto, 0
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_5150', s.account_code, 0, s.neto
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.account_code, s.monto, 0
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else '4295'
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null
  union all
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.destino, 0, s.monto
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else '4295'
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reclasificacion', 'reclas_4105', '4105', s.neto, 0
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1
  union all
  select 130, 'reclasificacion', 'reclas_4105', '4140', 0, s.neto
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.destino, s.residual, 0
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and c.account_code in ('6135', '6140')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then '6140' else '6135' end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto
             + coalesce(g.neto, 0)
             + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code
  union all
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.account_code, 0, s.residual
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and c.account_code in ('6135', '6140')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then '6140' else '6135' end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code;

  if not exists (
    select 1 from pg_temp._corr_cruda
    where organization_id = 137 and clase = 'reversion_masivo'
  ) then
    raise exception 'no se encontro el ajuste masivo pendiente de la org 137';
  end if;

  drop table if exists pg_temp._corr_neta;
  create temporary table _corr_neta as
  select organization_id, grupo, cuenta,
         case when round(sum(debito), 0) > round(sum(credito), 0)
              then round(sum(debito), 0) - round(sum(credito), 0) else 0 end as debito,
         case when round(sum(credito), 0) > round(sum(debito), 0)
              then round(sum(credito), 0) - round(sum(debito), 0) else 0 end as credito
  from pg_temp._corr_cruda
  group by organization_id, grupo, cuenta
  having abs(round(sum(debito), 0) - round(sum(credito), 0)) >= 1;

  drop table if exists pg_temp._corr_estado;
  create temporary table _corr_estado (
    organization_id integer,
    grupo text,
    nota text,
    journal_entry_id integer
  );

  for v_org, v_grupo in
    select distinct n.organization_id, n.grupo
    from pg_temp._corr_neta n
    where n.organization_id <> 149
    order by 1, 2
  loop
    v_key := case when v_grupo = 'reversion'
      then 'correccion_reversion:'
      else 'correccion_reclasificacion:'
    end || v_org::text;
    v_memo := case when v_grupo = 'reversion'
      then 'Reversión por corrección de regla contable'
      else 'Reclasificación por corrección de regla contable'
    end;

    select je.id, coalesce(je.posted, false)
      into v_entry, v_posted
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = v_key;
    if not found then
      v_entry := null;
      v_posted := false;
    end if;

    if v_posted then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'ya_publicado', v_entry);
      continue;
    end if;

    select b.id into v_branch
    from public.branches b
    where b.organization_id = v_org
      and b.is_main is true
      and b.is_active is true
    order by b.id
    limit 1;
    if v_branch is null then
      select min(b.id) into v_branch
      from public.branches b
      where b.organization_id = v_org;
    end if;
    if v_branch is null then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_sucursal', null);
      continue;
    end if;

    if exists (
      select 1
      from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and not exists (
          select 1 from public.chart_of_accounts c
          where c.organization_id = n.organization_id
            and c.account_code = n.cuenta
            and coalesce(c.is_active, true)
            and c.es_movimiento is distinct from false
        )
    ) then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_cuenta', null);
      continue;
    end if;

    select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
      into v_tz
    from public.organizations o
    where o.id = v_org;
    v_fecha := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;
    else
      delete from public.journal_lines where journal_entry_id = v_entry;
      update public.journal_entries
         set entry_date = v_fecha,
             memo = v_memo,
             posted = false,
             updated_at = now()
       where id = v_entry;
    end if;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    select v_entry, n.cuenta, v_memo, n.debito, n.credito, v_org, n.debito, n.credito
    from pg_temp._corr_neta n
    where n.organization_id = v_org
      and n.grupo = v_grupo;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;

    if v_d <> v_c then
      if abs(v_d - v_c) > 5 then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
      perform public.fn_redondear_asiento_pesos(v_entry);
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_d, v_c
      from public.journal_lines
      where journal_entry_id = v_entry;
      if v_d <> v_c then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
    end if;

    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);
  end loop;

  delete from public.journal_lines jl
  using public.journal_entries je
  where je.id = jl.journal_entry_id
    and je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.journal_entries je
  where je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.correccion_flujo_aviso;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select c.organization_id, c.clase, e.journal_entry_id, round(sum(c.debito), 0),
         jsonb_build_object('cuentas', jsonb_agg(distinct c.cuenta)),
         e.nota
  from pg_temp._corr_cruda c
  left join pg_temp._corr_estado e
    on e.organization_id = c.organization_id
   and e.grupo = c.grupo
  where c.clase <> 'reversion_masivo'
  group by c.organization_id, c.clase, e.journal_entry_id, e.nota
  having round(sum(c.debito), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select m.organization_id, 'reversion_masivo', e.journal_entry_id, m.pendiente,
         jsonb_build_object('pendiente', m.pendiente, 'ya_revertido', m.ya, 'asientos', m.asientos),
         case when m.pendiente = 0 and m.ya > 0 then 'ya_revertido' else e.nota end
  from (
    select je.organization_id,
           coalesce(round(sum(jl.debit) filter (
             where not exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as pendiente,
           coalesce(round(sum(jl.debit) filter (
             where exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as ya,
           count(distinct je.id) as asientos
    from public.stock_movements sm
    join public.journal_entries je
      on je.organization_id = sm.organization_id
     and je.source = 'stock_movements'
     and je.source_id = sm.id::text
     and je.posted is true
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where sm.organization_id in (137, 338)
      and sm.source = 'adjustment'
      and sm.source_id is null
      and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    group by je.organization_id
  ) m
  left join pg_temp._corr_estado e
    on e.organization_id = m.organization_id
   and e.grupo = 'reversion';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select ia.organization_id, 'reclas_4250_se_queda', round(sum(jl.credit), 0),
         jsonb_build_object('motivo', lower(btrim(coalesce(ia.reason, '')))),
         'se_queda'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.posted is true
    and je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit')
    and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
  group by ia.organization_id, lower(btrim(coalesce(ia.reason, '')))
  having round(sum(jl.credit), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select 204, 'pendiente_confirmacion', round(sum(jl.credit), 0),
         jsonb_build_object('codigos', 'AJ-0201 a AJ-0207', 'motivo', 'physical_count'),
         'en_espera_de_confirmacion'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where ia.organization_id = 204
    and je.posted is true
    and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$'
    and jl.credit > 0
    and jl.account_code = '4250';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select t.organization_id, 'reclas_2405_pendiente', t.monto,
         jsonb_build_object('debito_factura', t.monto),
         'pendiente'
  from (
    select organization_id, round(sum(debit), 0) as monto
    from pg_temp._corr_2405
    where source in ('invoice_sales', 'sales')
      and debit > 0
    group by organization_id
    having round(sum(debit), 0) >= 1
  ) t;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, 'reclas_6105_01', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         case
           when base.organization_id in (137, 338) then 'excluida_reversion_masiva'
           else 'saldo_credito'
         end
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is false
        and je.fact_key like 'regla_contable:%'
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) g
      on g.organization_id = p.organization_id and g.account_code = p.account_code
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
        and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where base.organization_id in (137, 338)
     or round(base.neto, 0) <= -1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, '6105_sin_mover', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         'sin_reclasificar'
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (
          jl.account_code = '6105'
          or (jl.account_code like '6105-%' and jl.account_code not like '6105-01' and jl.account_code not like '6105-01-%')
        )
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where abs(round(base.neto, 0)) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select nom.organization_id, 'renombre', 0,
         jsonb_build_object('cuenta', nom.account_code, 'nombre_anterior', nom.name),
         'sin_comprobante'
  from public.correccion_flujo_nombre_respaldo nom;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  values (null, 'renombre', 0, jsonb_build_object('cuenta', '2495'), 'sin_lineas_impuesto_consumo');

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d,
             coalesce(sum(credit), 0) as c,
             bool_or(debit <> round(debit, 0) or credit <> round(credit, 0)) as fraccion
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
      and (
        je.posted is true
        or je.organization_id = 149
        or l.d <> l.c
        or l.fraccion
      )
  ) then
    raise exception 'borrador de correccion descuadrado, publicado o de la org 149';
  end if;

  return jsonb_build_object(
    'borradores', (
      select count(*) from public.journal_entries
      where (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%')
        and posted is false
    ),
    'avisos', (select count(*) from public.correccion_flujo_aviso),
    'editados', v_editar
  );
end;
$fn$;

revoke all on function public.fn_correccion_flujo_borradores() from public, anon, authenticated;
grant execute on function public.fn_correccion_flujo_borradores() to service_role;

comment on function public.fn_correccion_flujo_borradores() is
  'Arma borradores de reversion y reclasificacion. No publica. Excluye la org 149.';

select public.fn_correccion_flujo_borradores();

drop table if exists public.correccion_flujo_sql_tmp;
