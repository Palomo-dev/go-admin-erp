-- Devuelve fn_regla_contable_reclasificar al cuerpo de 20261023143080,
-- que inserta la cabecera aunque _regla_reclass no tenga filas.
-- No recrea los borradores vacíos que se borraron.

create or replace function public.fn_regla_contable_reclasificar()
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_org record;
  v_fila record;
  v_tz text;
  v_fecha timestamptz;
  v_branch integer;
  v_entry integer;
  v_key text;
  v_debito numeric;
  v_credito numeric;
  v_monto numeric;
  v_con integer := 0;
  v_vacios integer := 0;
  v_fallos integer := 0;
begin
  create temporary table if not exists _regla_reclass (
    organization_id integer,
    destino text,
    origen text,
    monto numeric
  ) on commit drop;
  truncate _regla_reclass;

  insert into _regla_reclass (organization_id, destino, origen, monto)
  select je.organization_id, '519595', jl.account_code, round(sum(jl.debit), 2)
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id = je.id
  join public.stock_movements sm
    on je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and sm.organization_id = je.organization_id
  join public.regla_contable_aviso a on a.organization_id = je.organization_id
  where je.posted is true
    and sm.source = 'adjustment'
    and sm.direction = 'out'
    and jl.debit > 0
    and left(jl.account_code, 1) = '6'
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 2) >= 0.01;

  insert into _regla_reclass (organization_id, destino, origen, monto)
  select je.organization_id,
         case
           when lower(coalesce(ia.motivo_ajuste, '')) in ('robo', 'siniestro')
             or lower(coalesce(ia.reason, '')) in ('robo', 'siniestro', 'theft')
           then '5315'
           else '519595'
         end,
         jl.account_code,
         round(sum(jl.debit), 2)
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id = je.id
  left join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  join public.regla_contable_aviso a on a.organization_id = je.organization_id
  where je.posted is true
    and je.source = 'inventory_adjustment'
    and jl.debit > 0
    and (left(jl.account_code, 4) = '5150' or left(jl.account_code, 1) = '6')
  group by 1, 2, 3
  having round(sum(jl.debit), 2) >= 0.01;

  for v_org in
    select organization_id from public.regla_contable_aviso order by organization_id
  loop
    begin
      v_key := 'regla_contable:' || v_org.organization_id::text;
      select je.id into v_entry
      from public.journal_entries je
      where je.organization_id = v_org.organization_id
        and je.fact_key = v_key
      limit 1;

      if v_entry is null then
        select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
          into v_tz
        from public.organizations o
        where o.id = v_org.organization_id;

        v_fecha := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

        select b.id into v_branch
        from public.branches b
        where b.organization_id = v_org.organization_id
          and b.is_main is true
          and b.is_active is true
        order by b.id
        limit 1;
        if v_branch is null then
          select min(b.id) into v_branch
          from public.branches b
          where b.organization_id = v_org.organization_id;
        end if;
        if v_branch is null then
          update public.regla_contable_aviso
             set nota = 'sin_sucursal'
           where organization_id = v_org.organization_id;
          v_fallos := v_fallos + 1;
          continue;
        end if;

        insert into public.journal_entries (
          organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
        ) values (
          v_org.organization_id, v_branch, v_fecha,
          'Reclasificación por corrección de regla contable',
          'manual', v_org.organization_id::text, false, v_key
        )
        returning id into v_entry;

        for v_fila in
          select destino, round(sum(monto), 2) as monto
          from _regla_reclass
          where organization_id = v_org.organization_id
          group by destino
          having round(sum(monto), 2) >= 0.01
        loop
          insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id)
          values (
            v_entry, v_fila.destino,
            'Reclasificación por corrección de regla contable',
            v_fila.monto, 0, v_org.organization_id
          );
        end loop;

        for v_fila in
          select origen, round(sum(monto), 2) as monto
          from _regla_reclass
          where organization_id = v_org.organization_id
          group by origen
          having round(sum(monto), 2) >= 0.01
        loop
          insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id)
          values (
            v_entry, v_fila.origen,
            'Reclasificación por corrección de regla contable',
            0, v_fila.monto, v_org.organization_id
          );
        end loop;
      end if;

      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_debito, v_credito
      from public.journal_lines
      where journal_entry_id = v_entry;

      if round(v_debito, 2) <> round(v_credito, 2) then
        raise exception 'descuadre % / %', v_debito, v_credito;
      end if;

      v_monto := round(v_debito, 2);
      update public.regla_contable_aviso
         set journal_entry_id = v_entry,
             monto = v_monto,
             nota = case when v_monto = 0 then 'sin_movimiento' else null end
       where organization_id = v_org.organization_id;

      if v_monto = 0 then
        v_vacios := v_vacios + 1;
      else
        v_con := v_con + 1;
      end if;
    exception when others then
      v_fallos := v_fallos + 1;
      update public.regla_contable_aviso
         set nota = left(sqlerrm, 200)
       where organization_id = v_org.organization_id;
    end;
  end loop;

  return jsonb_build_object(
    'orgs', (select count(*) from public.regla_contable_aviso),
    'con_monto', v_con,
    'sin_movimiento', v_vacios,
    'fallos', v_fallos,
    'monto', (select coalesce(sum(monto), 0) from public.regla_contable_aviso)
  );
end;
$fn$;

revoke all on function public.fn_regla_contable_reclasificar() from public, anon, authenticated;
grant execute on function public.fn_regla_contable_reclasificar() to service_role;
