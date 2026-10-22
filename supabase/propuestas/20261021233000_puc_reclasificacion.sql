-- NO APLICAR.
--
-- Propuesta para reclasificar el plan de las organizaciones que ya existen
-- al PUC del Decreto 2650 de 1993. No está en supabase/migrations y no se
-- ejecutó. La parte 2 aborta sola: hay que borrar el raise exception para
-- correrla, y conviene hacerlo dentro de una transacción.
--
-- No modifica journal_lines ni journal_entries ya publicados. El saldo se
-- mueve con asientos nuevos de reclasificación. Si un asiento no se puede
-- armar, la función lo deja en journal_entry_failures y este script se detiene.
--
-- Equivalencias de USO de este ERP, no del decreto:
--   4105 se usó como ventas; en el decreto es agricultura. El saldo va a 4135.
--   4175 (débito) queda para devoluciones nuevas; este script no reescribe
--   las notas crédito ya hechas.
--   2405 se usó como IVA por pagar. El decreto lo lleva en 2408.
--   2105 se usó como proveedores. En el decreto 2105 son bancos nacionales
--   y los proveedores son 2205. Si alguna organización usó 2105 de verdad
--   como obligación financiera, no corras el tramo de 2105.
--   1405 se usó como mercancías. En el decreto es materias primas; la
--   mercancía es 1435.
--   6105 se usó como costo de ventas del comercio. En el decreto es el costo
--   de agricultura; el comercio es 6135.
--   1405-01 pasa a ser el auxiliar 14350501. 6105-01 pasa a 61350501.
--   El código con guion no se borra ni se le cambian las líneas: queda
--   inactivo al final.
--
-- Los nombres históricos no se cambian. 4105 puede seguir diciendo «Ventas»
-- aunque el saldo ya esté en 4135.

-- ---------------------------------------------------------------------------
-- Parte 1. Diagnóstico. Esta parte sí se puede ejecutar: solo lee.
-- ---------------------------------------------------------------------------

select count(distinct organization_id) as organizaciones
from chart_of_accounts;

select count(*) as cuentas_sin_padre
from chart_of_accounts
where parent_code is null
  and account_code ~ '^[0-9]{4}$';

select left(account_code, 4) as base, count(*) as con_guion
from chart_of_accounts
where account_code like '%-%'
group by 1
order by 1;

select account_code, count(distinct organization_id) as organizaciones
from chart_of_accounts
where account_code in ('4105', '4135', '2405', '2408', '2105', '2205', '1405', '1435', '6105', '6135')
group by 1
order by 1;

-- ---------------------------------------------------------------------------
-- Parte 2. NO APLICAR hasta borrar la primera línea del bloque.
-- ---------------------------------------------------------------------------

do $puc$
declare
  r record;
  m record;
  v_id integer;
  v_deb text;
  v_cred text;
  v_destino text;
  v_monto numeric;
  v_base_nueva text;
  v_seq integer;
  v_sub text;
  v_aux text;
  v_nombre text;
  v_tipo text;
  v_nat text;
begin
  raise exception 'NO APLICAR: revisa la parte 1 y borra esta línea para ejecutar la reclasificación';

  -- Cuentas de la plantilla que falten. No pisa nombre ni saldo de las que ya están.
  insert into chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description,
    naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
  )
  select o.id, p.codigo, p.nombre, p.tipo, p.padre, true, p.descripcion,
         p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo
  from organizations o
  cross join puc_plantilla p
  where not exists (
    select 1 from chart_of_accounts c
    where c.organization_id = o.id and c.account_code = p.codigo
  )
  order by o.id, length(p.codigo), p.codigo;

  create temp table puc_aux_sede (
    organization_id integer,
    branch_id integer,
    vieja text,
    nueva text
  ) on commit drop;

  -- Sedes con guion: 1405-01 → 143505 / 14350501, 6105-01 → 613505 / 61350501.
  for m in
    select organization_id, branch_id, base_account_code, sub_account_code
    from branch_account_mappings
    where base_account_code in ('1405', '6105')
      and sub_account_code ~ '^[0-9]{4}-[0-9]+$'
  loop
    v_base_nueva := case m.base_account_code when '1405' then '1435' else '6135' end;
    v_seq := split_part(m.sub_account_code, '-', 2)::int;
    if v_seq < 1 or v_seq > 99 then
      raise exception 'codigo_puc_invalido: la sede % no cabe en dos dígitos', m.sub_account_code;
    end if;
    v_sub := v_base_nueva || '05';
    v_aux := v_sub || lpad(v_seq::text, 2, '0');

    select name, type, naturaleza into v_nombre, v_tipo, v_nat
    from chart_of_accounts
    where organization_id = m.organization_id and account_code = v_base_nueva;

    insert into chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      m.organization_id, v_sub, coalesce(v_nombre, v_base_nueva) || ' por sede',
      coalesce(v_tipo, 'asset'), v_base_nueva, true,
      'Subcuenta de sedes. El movimiento va al auxiliar.',
      v_nat, false, false, left(v_base_nueva, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    select coalesce(name, v_aux) into v_nombre
    from chart_of_accounts
    where organization_id = m.organization_id and account_code = m.sub_account_code;

    insert into chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      m.organization_id, v_aux, coalesce(v_nombre, v_aux),
      coalesce(v_tipo, 'asset'), v_sub, true,
      'Auxiliar que reemplaza a ' || m.sub_account_code || ' sin reescribir sus líneas.',
      v_nat, true, false, left(v_base_nueva, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    insert into puc_aux_sede (organization_id, branch_id, vieja, nueva)
    values (m.organization_id, m.branch_id, m.sub_account_code, v_aux);

    insert into branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code)
    values (m.organization_id, m.branch_id, v_base_nueva, v_aux)
    on conflict (organization_id, branch_id, base_account_code)
    do update set sub_account_code = excluded.sub_account_code;

    update branch_account_mappings
       set sub_account_code = v_aux
     where organization_id = m.organization_id
       and branch_id = m.branch_id
       and base_account_code = m.base_account_code;
  end loop;

  -- Saldos de las cuentas de cuatro dígitos. 1405 y 6105 solo se van a 1435 y
  -- 6135 cuando la organización no tiene sedes con guion: si las tiene, el
  -- saldo de la cuenta pelada y el del guion van al auxiliar, para no dejar
  -- movimiento sobre un título.
  for r in
    select je.organization_id, je.branch_id, jl.account_code as vieja,
           case jl.account_code
             when '4105' then '4135'
             when '2405' then '2408'
             when '2105' then '2205'
             when '1405' then '1435'
             when '6105' then '6135'
           end as nueva,
           round(sum(jl.debit) - sum(jl.credit), 2) as neto
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and jl.account_code in ('4105', '2405', '2105', '1405', '6105')
    group by 1, 2, 3
    having abs(round(sum(jl.debit) - sum(jl.credit), 2)) >= 0.01
  loop
    v_destino := r.nueva;
    if r.vieja in ('1405', '6105') and exists (
      select 1 from puc_aux_sede s
      where s.organization_id = r.organization_id
        and left(s.vieja, 4) = r.vieja
    ) then
      select s.nueva into v_aux
      from puc_aux_sede s
      where s.organization_id = r.organization_id
        and s.branch_id = r.branch_id
        and left(s.vieja, 4) = r.vieja
      limit 1;
      -- Sin auxiliar para esa sede, el saldo se queda donde está.
      if v_aux is null then
        continue;
      end if;
      v_destino := v_aux;
    end if;

    if r.neto > 0 then
      v_deb := v_destino;
      v_cred := r.vieja;
      v_monto := r.neto;
    else
      v_deb := r.vieja;
      v_cred := v_destino;
      v_monto := -r.neto;
    end if;

    v_id := fn_create_journal_entry(
      p_organization_id := r.organization_id,
      p_branch_id := r.branch_id,
      p_entry_date := now(),
      p_memo := 'Reclasificacion PUC ' || r.vieja || ' a ' || v_destino,
      p_source := 'reclassification',
      p_source_id := 'puc2:' || r.organization_id || ':' || r.branch_id || ':' || r.vieja,
      p_debit_account := v_deb,
      p_credit_account := v_cred,
      p_amount := v_monto,
      p_fact_key := 'puc2:' || r.organization_id || ':' || r.branch_id || ':' || r.vieja || '>' || v_destino
    );
    if v_id is null then
      raise exception 'reclasificacion_fallida: % de la organizacion %', r.vieja, r.organization_id;
    end if;
  end loop;

  for r in
    select je.organization_id, je.branch_id, jl.account_code as vieja, s.nueva,
           round(sum(jl.debit) - sum(jl.credit), 2) as neto
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    join puc_aux_sede s
      on s.organization_id = je.organization_id
     and s.vieja = jl.account_code
    where je.posted is true
    group by 1, 2, 3, 4
    having abs(round(sum(jl.debit) - sum(jl.credit), 2)) >= 0.01
  loop
    if r.neto > 0 then
      v_deb := r.nueva;
      v_cred := r.vieja;
      v_monto := r.neto;
    else
      v_deb := r.vieja;
      v_cred := r.nueva;
      v_monto := -r.neto;
    end if;
    v_id := fn_create_journal_entry(
      p_organization_id := r.organization_id,
      p_branch_id := r.branch_id,
      p_entry_date := now(),
      p_memo := 'Reclasificacion PUC ' || r.vieja || ' a ' || r.nueva,
      p_source := 'reclassification',
      p_source_id := 'puc2:' || r.organization_id || ':' || r.branch_id || ':' || r.vieja,
      p_debit_account := v_deb,
      p_credit_account := v_cred,
      p_amount := v_monto,
      p_fact_key := 'puc2:' || r.organization_id || ':' || r.branch_id || ':' || r.vieja || '>' || r.nueva
    );
    if v_id is null then
      raise exception 'reclasificacion_fallida: % de la organizacion %', r.vieja, r.organization_id;
    end if;
  end loop;

  -- Reglas de documentos futuros. Los asientos ya hechos no se tocan.
  update accounting_rules
     set credit_account_code = '4135', updated_at = now()
   where credit_account_code = '4105'
     and source_type in ('sale', 'cash_movement', 'trip');

  update accounting_rules
     set debit_account_code = '4175', updated_at = now()
   where debit_account_code = '4105'
     and (
       (source_type = 'sale_credit_note' and event_type = 'created')
       or (source_type = 'sale' and event_type = 'voided')
       or (source_type = 'refund' and event_type = 'refunded')
     );

  update accounting_rules
     set tax_account_code = '2408', updated_at = now()
   where tax_account_code = '2405';

  update accounting_rules
     set credit_account_code = '2205', updated_at = now()
   where credit_account_code = '2105';

  update accounting_rules
     set debit_account_code = '2205', updated_at = now()
   where debit_account_code = '2105';

  update accounting_rules
     set debit_account_code = '1435', updated_at = now()
   where debit_account_code = '1405';

  update accounting_rules
     set credit_account_code = '1435', updated_at = now()
   where credit_account_code = '1405';

  update accounting_rules
     set debit_account_code = '6135', updated_at = now()
   where debit_account_code = '6105';

  update accounting_rules
     set credit_account_code = '6135', updated_at = now()
   where credit_account_code = '6105';

  update accounting_rules
     set credit_account_code = '4250', updated_at = now()
   where source_type = 'bank' and event_type = 'adjusted' and credit_account_code = '5105';

  update accounting_rules
     set debit_account_code = '1365', updated_at = now()
   where source_type = 'loan' and event_type = 'paid' and debit_account_code = '1305';

  update accounting_rules
     set credit_account_code = '1365', updated_at = now()
   where source_type = 'installment' and event_type = 'paid' and credit_account_code = '1305';

  -- Padre PUC: el de 2805 es 28, no 21. Solo códigos numéricos de nivel válido.
  update chart_of_accounts c
     set parent_code = left(c.account_code, case length(c.account_code)
           when 2 then 1
           when 4 then 2
           when 6 then 4
           when 8 then 6
           else length(c.account_code) - 2
         end),
         updated_at = now()
   where c.account_code ~ '^[0-9]+$'
     and length(c.account_code) > 1
     and (
       length(c.account_code) in (2, 4, 6, 8)
       or (length(c.account_code) >= 10 and length(c.account_code) % 2 = 0)
     )
     and exists (
       select 1 from chart_of_accounts p
       where p.organization_id = c.organization_id
         and p.account_code = left(c.account_code, case length(c.account_code)
           when 2 then 1
           when 4 then 2
           when 6 then 4
           when 8 then 6
           else length(c.account_code) - 2
         end)
     )
     and c.parent_code is distinct from left(c.account_code, case length(c.account_code)
           when 2 then 1
           when 4 then 2
           when 6 then 4
           when 8 then 6
           else length(c.account_code) - 2
         end);

  update chart_of_accounts c
     set naturaleza = p.naturaleza,
         requiere_tercero = p.requiere_tercero,
         requiere_centro_costo = p.requiere_centro_costo,
         updated_at = now()
    from puc_plantilla p
   where c.account_code = p.codigo
     and (
       c.naturaleza is null
       or c.requiere_tercero is distinct from p.requiere_tercero
       or c.requiere_centro_costo is distinct from p.requiere_centro_costo
     );

  -- El guion deja de usarse. Sus líneas siguen ahí.
  update chart_of_accounts
     set is_active = false,
         es_movimiento = false,
         updated_at = now()
   where account_code ~ '^(1405|6105)-[0-9]+$';
end
$puc$;
