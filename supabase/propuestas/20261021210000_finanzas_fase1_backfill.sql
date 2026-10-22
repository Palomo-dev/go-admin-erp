-- NO APLICAR. Propuesta de backfill para Juan. Esta entrega no modifica datos
-- de producción: ni cuentas bancarias, ni tax_account_mapping, ni el plan,
-- ni los períodos, ni los asientos ya hechos.
--
-- Orden: primero se crean las cuentas que faltan y después se reescriben los
-- mapeos. El disparador trg_tax_account_mapping_validar (migración
-- 20261021210000) rechaza un código que no esté en el plan, así que 2408
-- tiene que existir antes del UPDATE.
--
-- Verificación hecha el 2026-10-21, solo lectura:
--   * 3 bank_accounts con account_code nulo.
--   * 288 tax_account_mapping activos (48 organizaciones) apuntan a
--     23170501, 23650501, 23650502, 24080501, 24080502 y 24080503, y esas
--     cuentas no están en el plan de cada organización. 2365 y 2368 sí.
--     2408 existe en 1 organización.
--   * 0 períodos mensuales con start_date/end_date distintos del mes de
--     year/month. El diciembre 30/11–30/12 era el render de un date en UTC.
--   * 1.053 cuentas de 4 dígitos sin padre. El balance ya las sube por
--     prefijo; este UPDATE solo persiste el enlace.

-- 1. PUC de las cuentas bancarias que no tienen (1110 Bancos, si existe
--    y no es de título). Si 1110 agrupa auxiliares, el disparador
--    trg_bank_accounts_exige_puc rechazaría el update: esas filas se dejan
--    para elegir el auxiliar en la ficha.
update public.bank_accounts b
   set account_code = '1110',
       updated_at = now()
 where b.account_code is null
   and exists (
     select 1 from public.chart_of_accounts c
      where c.organization_id = b.organization_id
        and c.account_code = '1110'
        and coalesce(c.is_active, true)
        and c.type = 'asset'
   )
   and not public.fn_es_cuenta_de_titulo(b.organization_id, '1110');

-- 2. IVA por pagar 2408 donde el mapeo lo necesita y el plan no lo tiene.
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active)
select '2408',
       o.organization_id,
       'IVA por pagar',
       'liability',
       case
         when exists (
           select 1 from public.chart_of_accounts p
            where p.organization_id = o.organization_id and p.account_code = '24'
         ) then '24'
         when exists (
           select 1 from public.chart_of_accounts p
            where p.organization_id = o.organization_id and p.account_code = '2'
         ) then '2'
         else null
       end,
       true
  from (
    select distinct m.organization_id
      from public.tax_account_mapping m
      join public.tax_templates tt on tt.id = m.tax_template_id
     where m.is_active is not false
       and tt.code like 'IVA%'
       and not exists (
         select 1 from public.chart_of_accounts c
          where c.organization_id = m.organization_id
            and c.account_code = m.account_code
       )
  ) o
 where not exists (
   select 1 from public.chart_of_accounts c
    where c.organization_id = o.organization_id
      and c.account_code = '2408'
 );

-- 3. Mapeos cuyo código no existe: IVA → 2408, retefuente → 2365, ICA → 2368.
update public.tax_account_mapping m
   set account_code = case
         when tt.code like 'IVA%' then '2408'
         when tt.code like 'ICA%' then '2368'
         when tt.code like 'RETE%' and tt.code like '%IVA%' then '2367'
         when tt.code like 'RETE%' then '2365'
         else left(m.account_code, 4)
       end,
       updated_at = now()
  from public.tax_templates tt
 where tt.id = m.tax_template_id
   and m.is_active is not false
   and not exists (
     select 1 from public.chart_of_accounts c
      where c.organization_id = m.organization_id
        and c.account_code = m.account_code
   )
   and exists (
     select 1 from public.chart_of_accounts c
      where c.organization_id = m.organization_id
        and c.account_code = case
          when tt.code like 'IVA%' then '2408'
          when tt.code like 'ICA%' then '2368'
          when tt.code like 'RETE%' and tt.code like '%IVA%' then '2367'
          when tt.code like 'RETE%' then '2365'
          else left(m.account_code, 4)
        end
        and coalesce(c.is_active, true)
        and not public.fn_es_cuenta_de_titulo(m.organization_id, c.account_code)
   );

-- 4. Períodos mensuales corridos (hoy no hay ninguno; deja el dato igual al mes).
update public.fiscal_periods
   set start_date = make_date(year, month, 1),
       end_date = (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date,
       updated_at = now()
 where period_type = 'monthly'
   and month between 1 and 12
   and (
     start_date is distinct from make_date(year, month, 1)
     or end_date is distinct from (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
   );

-- 5. Padre por prefijo cuando parent_code está vacío o apunta a un código que no existe.
update public.chart_of_accounts c
   set parent_code = (
         select p.account_code
           from public.chart_of_accounts p
          where p.organization_id = c.organization_id
            and p.account_code <> c.account_code
            and c.account_code like p.account_code || '%'
            and length(p.account_code) < length(c.account_code)
          order by length(p.account_code) desc
          limit 1
       ),
       updated_at = now()
 where (
         c.parent_code is null
         or not exists (
           select 1 from public.chart_of_accounts p
            where p.organization_id = c.organization_id
              and p.account_code = c.parent_code
         )
       )
   and exists (
         select 1 from public.chart_of_accounts p
          where p.organization_id = c.organization_id
            and p.account_code <> c.account_code
            and c.account_code like p.account_code || '%'
            and length(p.account_code) < length(c.account_code)
       );
