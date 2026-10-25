-- P1 (25-oct-2026): regla del contador «nunca dejar saldo colgado». NO aplicada.
-- Paso 3 de 3. Requiere 130500 y 130600 aplicadas. Para cada org y cuenta padre que ya tiene hijos
-- (3705, 6135, 4295, 530515, y 240805/240810 donde se abrieron los auxiliares de IVA):
--   1) si el padre tiene saldo PUBLICADO <> 0: asiento de reclasificación padre -> auxiliar (publicado,
--      fact_key 'p1_reclasif:<padre>', idempotente);
--   2) las líneas en BORRADOR que usan el padre se repuntan al auxiliar (aún no son contabilidad);
--   3) recién entonces el padre pasa a título (es_movimiento = false).
-- Si al padre todavía lo usa una regla o una clave de configuración, NO se titula (aviso) — es la red de
-- seguridad de «primero la cuenta y la regla, después el título».
-- Esperado al 25-oct (solo lectura):
--   3705: 19 orgs pasan a título directo (sin movimientos en ninguna org; 0 reclasificaciones a 37050502)
--   6135 -> 61350501: 108 a título; 3 con saldo publicado (140: 2.300; 144: 717.171,37; 199: 3.782);
--         6 solo con borradores (129, 131, 132, 135, 143, 145); 99 directo
--   4295 -> 42959501: 116 a título; 4 con saldo (140: -500; 142: -2.739; 144: -21.000; 199: -42.900);
--         3 solo borradores (132, 204, 328); 109 directo
--   530515 -> 53051501: 116 a título directo (sin movimientos)
--   240805: 100 a título directo (+149, creada ya de título por tener hijos); 14 con líneas quedan de movimiento
--   240810: 110 a título directo; 6 con movimientos (2, 113, 140, 144, 149, 331) quedan de movimiento
-- Rollback: supabase/rollbacks/20261025130700_p1_reclasificar_y_titular_rollback.sql

do $$
declare
  r record;
  v_saldo numeric;
  v_entry integer;
  v_branch integer;
  v_n integer;
  v_tit integer := 0;
  v_rec integer := 0;
begin
  for r in
    select c.organization_id as org, t.padre, t.aux
      from (values ('3705','37050502'), ('6135','61350501'), ('4295','42959501'),
                   ('530515','53051501'), ('240805','24080501'), ('240810','24081001')) t(padre, aux)
      join public.chart_of_accounts c on c.account_code = t.padre and c.es_movimiento is true
     where c.organization_id in (select distinct organization_id from public.accounting_rules
                                  where source_type = 'inventory' and event_type = 'opening')
       and exists (select 1 from public.chart_of_accounts h
                    where h.organization_id = c.organization_id and h.parent_code = t.padre)
     order by 1, 2
  loop
    if exists (select 1 from public.accounting_rules ar where ar.organization_id = r.org and ar.is_active
                 and r.padre in (ar.debit_account_code, ar.credit_account_code, ar.tax_account_code))
       or exists (select 1 from public.configuracion_contable cc
                   where cc.organization_id = r.org and cc.account_code = r.padre) then
      raise notice '130700: org % cuenta % sigue en una regla/clave; NO se titula', r.org, r.padre;
      continue;
    end if;

    select coalesce(sum(l.debit - l.credit), 0) into v_saldo
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.posted
     where l.organization_id = r.org and l.account_code = r.padre;

    if v_saldo <> 0 then
      if not exists (select 1 from public.chart_of_accounts
                      where organization_id = r.org and account_code = r.aux and es_movimiento is true) then
        raise notice '130700: org % cuenta % tiene saldo % pero no existe el auxiliar %; NO se titula',
          r.org, r.padre, v_saldo, r.aux;
        continue;
      end if;
      if not exists (select 1 from public.journal_entries
                      where organization_id = r.org and fact_key = 'p1_reclasif:' || r.padre) then
        select b.id into v_branch from public.branches b
         where b.organization_id = r.org order by b.is_main desc nulls last, b.id limit 1;
        insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source,
                                            source_id, fact_key, created_at, updated_at)
        values (r.org, v_branch, now(),
                'Reclasificación ' || r.padre || ' -> ' || r.aux || ' antes de pasar ' || r.padre
                  || ' a título (P1 25-oct-2026, regla del contador)',
                true, 'reclasificacion_titulo', r.padre, 'p1_reclasif:' || r.padre, now(), now())
        returning id into v_entry;
        insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                          organization_id, debit_base, credit_base)
        values
          (v_entry, r.aux,   'Reclasificación desde ' || r.padre,
           greatest(v_saldo, 0), greatest(-v_saldo, 0), r.org, greatest(v_saldo, 0), greatest(-v_saldo, 0)),
          (v_entry, r.padre, 'Reclasificación hacia ' || r.aux,
           greatest(-v_saldo, 0), greatest(v_saldo, 0), r.org, greatest(-v_saldo, 0), greatest(v_saldo, 0));
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('130700', r.org, 'asiento_reclasif', v_entry::text, r.padre, v_saldo::text, r.aux);
        v_rec := v_rec + 1;
      end if;
    end if;

    -- Borradores: se repuntan al auxiliar (si no existe, el padre no se titula).
    if exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                where l.organization_id = r.org and l.account_code = r.padre and not e.posted) then
      if not exists (select 1 from public.chart_of_accounts
                      where organization_id = r.org and account_code = r.aux and es_movimiento is true) then
        raise notice '130700: org % cuenta % tiene borradores y no existe %; NO se titula', r.org, r.padre, r.aux;
        continue;
      end if;
      with obj as (
        select l.id from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
         where l.organization_id = r.org and l.account_code = r.padre and not e.posted
      ), log as (
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        select '130700', r.org, 'linea_borrador', id::text, 'account_code', r.padre, r.aux from obj
      )
      update public.journal_lines l set account_code = r.aux, updated_at = now() from obj where l.id = obj.id;
    end if;

    update public.chart_of_accounts set es_movimiento = false, updated_at = now()
     where organization_id = r.org and account_code = r.padre and es_movimiento is true;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('130700', r.org, 'titulo', r.padre, 'es_movimiento', 'true', 'false');
      v_tit := v_tit + 1;
    end if;
  end loop;
  raise notice '130700: % reclasificaciones, % cuentas pasadas a título', v_rec, v_tit;
end $$;
