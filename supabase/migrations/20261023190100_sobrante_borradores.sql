-- Borradores del sobrante. No publica.
-- Aplicada como sobrante_borradores (20261023171232). El select final ya corrió
-- y devolvió 48. No volver a ejecutarlo salvo para reconstruir borradores
-- que sigan sin publicar.
-- 1. Los 48 dobles: solo el asiento de stock_movements, Dr 6105-0X / Cr 1405-0X.
--    Esos ajustes no se reclasifican.
-- 2. El 4250 que no es de esos dobles: saldo inicial a 3105, compra sin orden
--    a 2205, sobrante real a 4295.
-- 3. La carga inicial en borrador deja de debitar 1405.

create table if not exists public.sobrante_linea_respaldo (
  id bigint generated always as identity primary key,
  journal_entry_id integer not null,
  line_id integer,
  account_code text not null,
  description text,
  debit numeric not null,
  credit numeric not null,
  debit_base numeric not null,
  credit_base numeric not null,
  organization_id integer not null,
  cost_center_id uuid
);

create unique index if not exists uq_sobrante_linea_respaldo
  on public.sobrante_linea_respaldo (journal_entry_id, line_id);

revoke all on public.sobrante_linea_respaldo from public, anon, authenticated;

create table if not exists public.sobrante_aviso (
  id bigint generated always as identity primary key,
  organization_id integer not null,
  clase text not null,
  monto numeric not null default 0,
  detalle jsonb,
  origen text not null default 'historico',
  creado_en timestamptz not null default now()
);

alter table public.sobrante_aviso enable row level security;
revoke all on public.sobrante_aviso from public, anon, authenticated;

create or replace function public.fn_sobrante_borradores()
returns integer
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_org integer;
  v_entry integer;
  v_posted boolean;
  v_memo text;
  v_branch integer;
  v_old_4250 numeric;
  v_old_3105 numeric;
  v_old_4295 numeric;
  v_residual numeric;
  v_compra numeric;
  v_saldo numeric;
  v_diversos numeric;
  v_nuevo numeric;
  v_d numeric;
  v_c numeric;
  v_centro_d uuid;
  v_centro_c uuid;
  v_centro uuid;
  g record;
  v_n integer;
begin
  drop table if exists pg_temp._sob_neto;
  create temp table _sob_neto as
  with pares as (
    select distinct ia.organization_id, ia.id as ajuste_id, je_sm.id as asiento_stock
    from public.inventory_adjustments ia
    join public.stock_movements sm
      on sm.organization_id = ia.organization_id
     and sm.source = 'adjustment'
     and sm.source_id = ia.id::text
    join public.journal_entries je_sm
      on je_sm.organization_id = sm.organization_id
     and je_sm.source = 'stock_movements'
     and je_sm.source_id = sm.id::text
     and je_sm.posted is true
    join public.journal_entries je_ia
      on je_ia.organization_id = ia.organization_id
     and je_ia.source = 'inventory_adjustment'
     and je_ia.source_id = ia.id::text
     and je_ia.posted is true
    where ia.organization_id <> 149
  )
  select p.organization_id,
         p.ajuste_id,
         round(sum(case when jl.account_code like '1405%' then jl.debit - jl.credit else 0 end), 2) as neto_1405,
         min(jl.account_code) filter (where jl.account_code like '1405%') as c1405,
         max(jl.account_code) filter (where jl.account_code like '1405%') as c1405b,
         min(jl.account_code) filter (where jl.account_code like '6105%') as c6105,
         max(jl.account_code) filter (where jl.account_code like '6105%') as c6105b
  from pares p
  join public.journal_lines jl on jl.journal_entry_id = p.asiento_stock
  group by p.organization_id, p.ajuste_id;

  if exists (
    select 1 from pg_temp._sob_neto
    where c1405 is distinct from c1405b or c6105 is distinct from c6105b
  ) then
    raise exception 'sobrante_cuentas_mixtas';
  end if;

  drop table if exists pg_temp._sob_doble;
  create temp table _sob_doble as
  select organization_id, ajuste_id, neto_1405, c1405, c6105
  from pg_temp._sob_neto
  where neto_1405 > 0;

  select count(*) into v_n from pg_temp._sob_doble;
  if v_n <> 48 then
    raise exception 'sobrante_doble_distinto: %', v_n;
  end if;

  delete from public.sobrante_aviso where origen = 'historico';

  for g in
    select organization_id, c1405, c6105, round(sum(neto_1405), 0) as monto, count(*) as ajustes
    from pg_temp._sob_doble
    group by organization_id, c1405, c6105
  loop
    if g.monto <= 0 or g.c1405 is null or g.c6105 is null or left(g.c1405, 4) <> '1405' or left(g.c6105, 4) <> '6105' then
      raise exception 'sobrante_reversion_incompleta org %', g.organization_id;
    end if;

    select je.id, je.posted, je.memo, je.branch_id
      into v_entry, v_posted, v_memo, v_branch
    from public.journal_entries je
    where je.organization_id = g.organization_id
      and je.fact_key = 'correccion_reversion:' || g.organization_id::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reversion_publicada org %', g.organization_id;
    end if;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    select jl.cost_center_id into v_centro_d
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '6105%'
    order by jl.id
    limit 1;
    select jl.cost_center_id into v_centro_c
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '1405%'
    order by jl.id
    limit 1;

    delete from public.journal_lines where journal_entry_id = v_entry;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base, cost_center_id
    ) values
      (v_entry, g.c6105, coalesce(v_memo, 'Reversión del doble de stock'), g.monto, 0, g.organization_id, g.monto, 0, v_centro_d),
      (v_entry, g.c1405, coalesce(v_memo, 'Reversión del doble de stock'), 0, g.monto, g.organization_id, 0, g.monto, v_centro_c);

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values (
      g.organization_id, 'reversion_doble', g.monto,
      jsonb_build_object('ajustes', g.ajustes, 'debito', g.c6105, 'credito', g.c1405, 'asiento', v_entry),
      'historico'
    );
  end loop;

  drop table if exists pg_temp._sob_dest;
  create temp table _sob_dest as
  select ia.organization_id,
         case
           when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
           when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
           else '4295'
         end as destino,
         round(sum(jl.credit), 0) as monto
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id and je.posted is true
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and not exists (
      select 1 from pg_temp._sob_doble d
      where d.organization_id = ia.organization_id
        and d.ajuste_id = ia.id
    )
  group by 1, 2
  having round(sum(jl.credit), 0) <> 0;

  for v_org in
    select distinct x.organization_id
    from (
      select organization_id from pg_temp._sob_dest
      union
      select je.organization_id
      from public.journal_entries je
      join public.journal_lines jl on jl.journal_entry_id = je.id
      where je.posted is false
        and je.fact_key = 'correccion_reclasificacion:' || je.organization_id::text
        and je.organization_id <> 149
        and (jl.account_code = '4250' or jl.account_code like '4250-%')
    ) x
  loop
    select je.id, je.posted, je.memo
      into v_entry, v_posted, v_memo
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = 'correccion_reclasificacion:' || v_org::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reclas_publicada org %', v_org;
    end if;

    select coalesce(sum(debit), 0) into v_old_4250
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '4250' or account_code like '4250-%');
    select coalesce(sum(credit), 0) into v_old_3105
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '3105' or account_code like '3105-%');
    select coalesce(sum(credit), 0) into v_old_4295
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '4295' or account_code like '4295-%');

    v_residual := round(v_old_4250 - v_old_3105 - v_old_4295, 0);
    select coalesce(sum(monto), 0) into v_compra from pg_temp._sob_dest where organization_id = v_org and destino = '2205';
    select coalesce(sum(monto), 0) into v_saldo from pg_temp._sob_dest where organization_id = v_org and destino = '3105';
    select coalesce(sum(monto), 0) into v_diversos from pg_temp._sob_dest where organization_id = v_org and destino = '4295';

    if v_residual < -1 or abs(v_residual - v_compra) > 1 then
      raise exception 'sobrante_residual_compra org % residual % compra %', v_org, v_residual, v_compra;
    end if;

    v_nuevo := round(v_saldo + v_diversos + v_residual, 0);

    select jl.cost_center_id into v_centro
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and jl.cost_center_id is not null
      and (
        jl.account_code in ('4250', '3105', '4295')
        or jl.account_code like '4250-%'
        or jl.account_code like '3105-%'
        or jl.account_code like '4295-%'
      )
    order by jl.id
    limit 1;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    delete from public.journal_lines
    where journal_entry_id = v_entry
      and (
        account_code in ('4250', '3105', '4295')
        or account_code like '4250-%'
        or account_code like '3105-%'
        or account_code like '4295-%'
      );

    if v_nuevo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '4250', coalesce(v_memo, 'Reclasificación de sobrantes'), v_nuevo, 0, v_org, v_nuevo, 0, v_centro
      );
    end if;
    if v_saldo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '3105', coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_saldo, v_org, 0, v_saldo, v_centro
      );
    end if;
    if v_diversos > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '4295', coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_diversos, v_org, 0, v_diversos, v_centro
      );
    end if;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;
    if v_d <> v_c then
      raise exception 'sobrante_descuadre org % debito % credito %', v_org, v_d, v_c;
    end if;

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values
      (v_org, 'reclas_4250', v_nuevo, jsonb_build_object('asiento', v_entry, 'saldo', v_saldo, 'diversos', v_diversos, 'compra', v_residual), 'historico');
  end loop;

  insert into public.sobrante_linea_respaldo (
    journal_entry_id, line_id, account_code, description, debit, credit,
    debit_base, credit_base, organization_id, cost_center_id
  )
  select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
         jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and je.organization_id <> 149
    and jl.account_code like '1405%'
    and jl.debit > 0
    and not exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
    );

  update public.journal_lines jl
     set account_code = aux.cuenta
    from public.journal_entries je
    join lateral (
      select public.fn_inventario_auxiliar_1435(je.organization_id, je.branch_id) as cuenta
    ) aux on true
   where jl.journal_entry_id = je.id
     and je.posted is false
     and je.fact_key like 'carga_inicial_borrador:%'
     and je.organization_id <> 149
     and jl.debit > 0
     and jl.account_code like '1405%'
     and aux.cuenta like '1435%';

  insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
  select je.organization_id, 'carga_1435', round(sum(jl.debit), 0),
         jsonb_build_object('asiento', je.id, 'cuenta', min(jl.account_code)),
         'historico'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and jl.debit > 0
    and jl.account_code like '1435%'
    and exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
        and r.account_code like '1405%'
    )
  group by je.organization_id, je.id;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.posted is false
      and je.fact_key like 'carga_inicial_borrador:%'
      and jl.debit > 0
      and jl.account_code like '1405%'
  ) then
    raise exception 'carga_inicial_sigue_en_1405';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.fact_key like 'correccion_reversion:%'
      and je.organization_id in (select distinct organization_id from pg_temp._sob_doble)
      and (
        je.posted is true
        or jl.account_code like '4250%'
        or jl.account_code like '4295%'
        or je.organization_id = 149
      )
  ) then
    raise exception 'sobrante_reversion_invalida';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    where je.posted is false
      and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%' or je.fact_key like 'carga_inicial_borrador:%')
      and je.organization_id <> 149
      and (
        select coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
        from public.journal_lines jl
        where jl.journal_entry_id = je.id
      ) <> 0
  ) then
    raise exception 'sobrante_borrador_descuadrado';
  end if;

  return v_n;
end;
$fn$;

revoke all on function public.fn_sobrante_borradores() from public, anon, authenticated;
grant execute on function public.fn_sobrante_borradores() to service_role;

select public.fn_sobrante_borradores();
