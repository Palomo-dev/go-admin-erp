-- Prueba aislada de los hallazgos 3 (conciliación) y 6 (pendientes contables).
-- Se ejecuta desde la raíz del repositorio contra un clúster local vacío:
--   psql -p <puerto> -U postgres -d <base> -v ON_ERROR_STOP=1 -f supabase/tests/contador/conciliacion_pendientes.sql
-- Nunca contra producción.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;
set lc_messages = 'C';

\i supabase/tests/contador/conciliacion_pendientes_base.sql

-- Las dos migraciones reales: idempotentes y reversibles.
\i supabase/migrations/20261107110000_conciliacion_cierre_con_partidas.sql
\i supabase/migrations/20261107111000_pendientes_contables_bandeja_y_reintento.sql
\i supabase/migrations/20261107110000_conciliacion_cierre_con_partidas.sql
\i supabase/migrations/20261107111000_pendientes_contables_bandeja_y_reintento.sql
\i supabase/rollbacks/20261107111000_pendientes_contables_bandeja_y_reintento_rollback.sql
\i supabase/rollbacks/20261107110000_conciliacion_cierre_con_partidas_rollback.sql
do $$ begin
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'fn_reintentar_fallos_asiento') <> '7dfd6e017958535e2f422382ea38f2ad' then
    raise exception 'La reversión no restauró fn_reintentar_fallos_asiento';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'fn_log_journal_failure') <> '446cfc00b668ab52c61049c5c9a22759' then
    raise exception 'La reversión no restauró fn_log_journal_failure';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'fn_reprocesar_fallos_stock_desde') <> 'b3701c24feb5f972b97f9245a01526c9' then
    raise exception 'La reversión no restauró fn_reprocesar_fallos_stock_desde';
  end if;
  if to_regclass('public.conciliacion_partidas') is not null then
    raise exception 'La reversión no quitó conciliacion_partidas';
  end if;
end $$;
\i supabase/migrations/20261107110000_conciliacion_cierre_con_partidas.sql
\i supabase/migrations/20261107111000_pendientes_contables_bandeja_y_reintento.sql
\i supabase/migrations/20261107112000_pendientes_redondeo_y_reversas.sql
\i supabase/rollbacks/20261107112000_pendientes_redondeo_y_reversas_rollback.sql
do $$ begin
  if to_regprocedure('public.fn_pendiente_valor(text,numeric,jsonb)') is not null then
    raise exception 'La reversión no quitó fn_pendiente_valor';
  end if;
end $$;
\i supabase/migrations/20261107112000_pendientes_redondeo_y_reversas.sql
\i supabase/migrations/20261107112000_pendientes_redondeo_y_reversas.sql

-- Ayudas de la prueba.
create table public.resultados (n serial, nombre text, ok boolean);
grant all on public.resultados, public.resultados_n_seq to authenticated, anon, service_role;

create function public.t(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin
  insert into public.resultados (nombre, ok) values (p_nombre, coalesce(p_ok, false));
  if not coalesce(p_ok, false) then
    raise exception 'FALLA: %', p_nombre;
  end if;
end $$;

-- Ejecuta p_sql y devuelve el mensaje de error, o 'ok'.
create function public.intenta(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create function public.como(p_uid text, p_rol text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('test.uid', coalesce(p_uid, ''), false);
  perform set_config('test.role', coalesce(p_rol, ''), false);
end $$;

create function public.cerrar(p_rec uuid, p_motivo text default null, p_org integer default 1)
returns jsonb language sql as $$
  select public.fn_conciliacion_cerrar(p_org, p_rec, p_motivo) $$;

grant execute on function public.t(text, boolean), public.intenta(text), public.como(text, text),
  public.cerrar(uuid, text, integer) to authenticated, anon, service_role;

-- Datos: dos empresas. a11 todo, a12 solo ver, a13 sin finanzas, b21 de la otra.
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000b1');
insert into public.profiles values
  ('00000000-0000-0000-0000-0000000000a1', 'contadora@ejemplo.test', 'Ana', 'Prueba'),
  ('00000000-0000-0000-0000-0000000000a2', 'auxiliar@ejemplo.test', null, null);
insert into public.organizations (id) values (1), (2), (3);
insert into public.organization_members (organization_id, user_id) values
  (1, '00000000-0000-0000-0000-0000000000a1'), (1, '00000000-0000-0000-0000-0000000000a2'),
  (1, '00000000-0000-0000-0000-0000000000a3'), (2, '00000000-0000-0000-0000-0000000000b1'),
  (3, '00000000-0000-0000-0000-0000000000a1');
insert into public.permisos_prueba values
  ('00000000-0000-0000-0000-0000000000a1', 1, 'finance.view'), ('00000000-0000-0000-0000-0000000000a1', 1, 'finance.create'),
  ('00000000-0000-0000-0000-0000000000a2', 1, 'finance.view'),
  ('00000000-0000-0000-0000-0000000000b1', 2, 'finance.view'), ('00000000-0000-0000-0000-0000000000b1', 2, 'finance.create'),
  ('00000000-0000-0000-0000-0000000000a1', 3, 'finance.view');
insert into public.branches values (1, 1, 'Sede de prueba', true, true), (2, 2, 'Sede ajena', true, true);
insert into public.bank_accounts (id, organization_id, branch_id, name) values (10, 1, 1, 'Corriente'), (11, 1, 1, 'Ahorros'), (20, 2, 2, 'Ajena');
insert into public.bank_transactions (id, organization_id, bank_account_id, amount, transaction_type) values
  (100, 1, 10, 300, 'deposit'), (101, 1, 10, -100, 'withdrawal'), (102, 1, 10, 240, 'deposit'),
  (103, 1, 10, 60, 'deposit'), (110, 1, 11, 50, 'deposit'), (200, 2, 20, 999, 'deposit');
insert into public.chart_of_accounts values (1, '110505', true), (1, '519595', true), (1, '143505', true), (1, '1105', false);
insert into public.fiscal_periods (organization_id, year, month, period_type, start_date, end_date, status) values
  (1, 2026, 9, 'monthly', '2026-09-01', '2026-09-30', 'closed'),
  (1, 2026, 10, 'monthly', '2026-10-01', '2026-10-31', 'closed'),
  (1, 2026, 11, 'monthly', '2026-11-01', '2026-11-30', 'open');

create temp table base_mayor as select (select count(*) from public.journal_entries) e, (select count(*) from public.journal_lines) l;
grant select on base_mayor to authenticated, anon, service_role;

-------------------------------------------------------------------------------
-- HALLAZGO 3: conciliación
-------------------------------------------------------------------------------
set role authenticated;
select public.como('00000000-0000-0000-0000-0000000000a1');

-- El error que hacía imposible crear una conciliación desde la pantalla.
select public.t('difference no se puede escribir (el INSERT de antes fallaba)',
  public.intenta($q$insert into public.bank_reconciliations (organization_id, bank_account_id, period_start, period_end, difference)
                    values (1, 10, '2026-01-01', '2026-01-31', 0)$q$) like '%non-DEFAULT%');
select public.t('crear sin difference funciona',
  public.intenta($q$insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance, closing_balance, statement_balance, status)
                    values ('10000000-0000-0000-0000-000000000001', 1, 10, '2026-08-01', '2026-08-31', 1000, 7777, 1200, 'draft')$q$) = 'ok');
select public.t('closing_balance lo escribe la base, no el cliente',
  (select closing_balance = 1000 from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000001'));

-- Signos: el extracto guarda abs(valor); el retiro de -100 no puede sumar.
insert into public.bank_reconciliation_items (reconciliation_id, bank_transaction_id, match_type, amount, is_matched) values
  ('10000000-0000-0000-0000-000000000001', 100, 'manual', 300, true),
  ('10000000-0000-0000-0000-000000000001', 101, 'manual', 100, true);
select public.t('un retiro conciliado resta: 1000 + 300 - 100 = 1200',
  (select closing_balance = 1200 from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000001'));
select public.t('diferencia 0 con libros = extracto',
  (select difference = 0 from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000001'));

-- Mapa del signo: libros - extracto.
insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance, statement_balance) values
  ('10000000-0000-0000-0000-0000000000a1', 1, 11, '2025-01-01', '2025-01-31', 100, 100),
  ('10000000-0000-0000-0000-0000000000a2', 1, 11, '2025-02-01', '2025-02-28', 120, 100),
  ('10000000-0000-0000-0000-0000000000a3', 1, 11, '2025-03-01', '2025-03-31', 100, 120);
select public.t('mapa: libros 100, extracto 100 = 0', (select difference =   0 from public.bank_reconciliations where id = '10000000-0000-0000-0000-0000000000a1'));
select public.t('mapa: libros 120, extracto 100 = +20', (select difference =  20 from public.bank_reconciliations where id = '10000000-0000-0000-0000-0000000000a2'));
select public.t('mapa: libros 100, extracto 120 = -20', (select difference = -20 from public.bank_reconciliations where id = '10000000-0000-0000-0000-0000000000a3'));
delete from public.bank_reconciliations where bank_account_id = 11;

-- Cierre.
select public.t('un UPDATE directo no cierra',
  public.intenta($q$update public.bank_reconciliations set status = 'closed' where id = '10000000-0000-0000-0000-000000000001'$q$) like '%cierre_solo_por_rpc%');
select public.t('un INSERT directo no nace cerrado',
  public.intenta($q$insert into public.bank_reconciliations (organization_id, bank_account_id, period_start, period_end, status) values (1, 10, '2026-02-01', '2026-02-28', 'closed')$q$) like '%cierre_solo_por_rpc%');

select public.t('sin diferencia cierra sin motivo',
  (public.cerrar('10000000-0000-0000-0000-000000000001') ->> 'diferencia')::numeric = 0);
select public.t('sin diferencia no deja partida',
  not exists (select 1 from public.conciliacion_partidas where reconciliation_id = '10000000-0000-0000-0000-000000000001'));
select public.t('registra quién cierra y cuándo',
  (select closed_by = '00000000-0000-0000-0000-0000000000a1' and closed_at is not null and status = 'closed'
     from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000001'));

-- Octubre: extracto mayor que libros, se cierra con motivo.
insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance, statement_balance) values
  ('10000000-0000-0000-0000-000000000002', 1, 10, '2026-10-01', '2026-10-31', 1000, 1240);
select public.t('diferencia negativa cuando el extracto es mayor',
  (select difference = -240 from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000002'));
select public.t('sin motivo se rechaza', public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000002')$q$) like '%motivo_obligatorio%');
select public.t('motivo en blanco se rechaza', public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000002', '    ')$q$) like '%motivo_obligatorio%');
select public.t('motivo de relleno se rechaza', public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000002', 'abc')$q$) like '%motivo_obligatorio%');
select public.t('el rechazo no cierra',
  (select status <> 'closed' from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000002'));
select public.t('cierre con motivo',
  (public.cerrar('10000000-0000-0000-0000-000000000002', 'Consignacion del 31 sin abonar') ->> 'diferencia')::numeric = -240);
select public.t('guarda el motivo',
  (select close_reason = 'Consignacion del 31 sin abonar' from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000002'));
select public.t('la diferencia queda como partida pendiente, con su signo',
  (select valor = -240 and estado = 'pendiente' and fecha = '2026-10-31' and bank_account_id = 10
     and created_by = '00000000-0000-0000-0000-0000000000a1'
     from public.conciliacion_partidas where reconciliation_id = '10000000-0000-0000-0000-000000000002'));
select public.t('no se cierra dos veces', public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000002', 'Otra vez el motivo')$q$) like '%conciliacion_ya_cerrada%');
select public.t('sigue habiendo una sola partida',
  (select count(*) = 1 from public.conciliacion_partidas where reconciliation_id = '10000000-0000-0000-0000-000000000002'));

-- Una conciliación cerrada no cambia.
select public.t('cerrada: no se edita', public.intenta($q$update public.bank_reconciliations set statement_balance = 1 where id = '10000000-0000-0000-0000-000000000002'$q$) like '%conciliacion_cerrada%');
select public.t('cerrada: no se borra', public.intenta($q$delete from public.bank_reconciliations where id = '10000000-0000-0000-0000-000000000002'$q$) like '%conciliacion_cerrada%');
select public.t('cerrada: no admite movimientos',
  public.intenta($q$insert into public.bank_reconciliation_items (reconciliation_id, bank_transaction_id, match_type, amount, is_matched) values ('10000000-0000-0000-0000-000000000002', 102, 'manual', 240, true)$q$) like '%conciliacion_cerrada%');
select public.t('cerrada: no se sueltan movimientos',
  public.intenta($q$delete from public.bank_reconciliation_items where reconciliation_id = '10000000-0000-0000-0000-000000000001'$q$) like '%conciliacion_cerrada%');

-- Partidas que pasan al periodo siguiente.
insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance, statement_balance) values
  ('10000000-0000-0000-0000-000000000003', 1, 10, '2026-11-01', '2026-11-30', 1000, 1240),
  ('10000000-0000-0000-0000-000000000004', 1, 10, '2026-12-01', '2026-12-31', 1000, 1300),
  ('10000000-0000-0000-0000-000000000005', 1, 10, '2027-01-01', '2027-01-31', 1300, 1300);
select public.t('la partida pasa a la conciliación siguiente',
  (public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000003') ->> 'traidas_pendientes')::numeric = -240
  and jsonb_array_length(public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000003') -> 'traidas') = 1
  and jsonb_array_length(public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000003') -> 'propias') = 0);
select public.t('la partida muestra quién la registró',
  public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000002') -> 'propias' -> 0 ->> 'registrada_por' = 'Ana Prueba');
select public.t('la cerrada informa quién cerró y por qué',
  public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000002') -> 'cierre' ->> 'cerrada_por' = 'Ana Prueba'
  and public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000002') -> 'cierre' ->> 'motivo' = 'Consignacion del 31 sin abonar');
select public.t('en orden: no se cierra si la anterior sigue abierta',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000004', 'Salto de periodo')$q$) like '%conciliacion_anterior_abierta%');

-- Noviembre: sigue igual. La traída explica toda la diferencia: no nace otra.
select public.t('la misma diferencia exige motivo aunque esté explicada',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000003')$q$) like '%motivo_obligatorio%');
select public.t('cierra sin partida nueva',
  (public.cerrar('10000000-0000-0000-0000-000000000003', 'Sigue sin abonar en el banco') ->> 'partida_nueva')::numeric = 0);
select public.t('no se duplica la partida traída',
  (select count(*) = 1 and sum(valor) = -240 from public.conciliacion_partidas where bank_account_id = 10 and estado = 'pendiente'));

-- Diciembre: libros 1000, extracto 1300. Diferencia -300: -240 traída y -60 nueva.
select public.t('solo nace lo que la traída no explica',
  (public.cerrar('10000000-0000-0000-0000-000000000004', 'Abono sin identificar') ->> 'partida_nueva')::numeric = -60);
select public.t('invariante: pendientes de la cuenta = diferencia del cierre',
  (select sum(valor) = -300 from public.conciliacion_partidas where bank_account_id = 10 and estado = 'pendiente'));

-- Enero: se resuelven las dos. Sin diferencia y sin pendientes.
select public.t('resolver exige la conciliación abierta correcta',
  public.intenta(format($q$select public.fn_conciliacion_partida_resolver(1, %L, '10000000-0000-0000-0000-000000000003', 102)$q$,
    (select id from public.conciliacion_partidas where valor = -240))) like '%conciliacion_cerrada%');
select public.t('resolver no acepta un movimiento de otra cuenta',
  public.intenta(format($q$select public.fn_conciliacion_partida_resolver(1, %L, '10000000-0000-0000-0000-000000000005', 110)$q$,
    (select id from public.conciliacion_partidas where valor = -240))) like '%movimiento_ajeno%');
select public.t('resolver no acepta un movimiento de otra empresa',
  public.intenta(format($q$select public.fn_conciliacion_partida_resolver(1, %L, '10000000-0000-0000-0000-000000000005', 200)$q$,
    (select id from public.conciliacion_partidas where valor = -240))) like '%movimiento_ajeno%');
select public.fn_conciliacion_partida_resolver(1, id, '10000000-0000-0000-0000-000000000005', 102) from public.conciliacion_partidas where valor = -240;
select public.t('la partida queda resuelta con su traza',
  (select estado = 'resuelta' and resolved_at is not null and resolved_by = '00000000-0000-0000-0000-0000000000a1'
     and resolved_reconciliation_id = '10000000-0000-0000-0000-000000000005' and bank_transaction_id = 102
     from public.conciliacion_partidas where valor = -240));
select public.t('no se resuelve dos veces',
  public.intenta(format($q$select public.fn_conciliacion_partida_resolver(1, %L, '10000000-0000-0000-0000-000000000005')$q$,
    (select id from public.conciliacion_partidas where valor = -240))) like '%partida_ya_resuelta%');
select public.t('la resuelta sigue a la vista en la conciliación que la resolvió',
  public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000005') -> 'traidas' @> '[{"estado": "resuelta", "resuelta_aqui": true}]'::jsonb);
select public.fn_conciliacion_partida_resolver(1, id, '10000000-0000-0000-0000-000000000005') from public.conciliacion_partidas where valor = -60;
select public.t('sin pendientes ni diferencia cierra sin motivo',
  (public.cerrar('10000000-0000-0000-0000-000000000005') ->> 'partida_nueva')::numeric = 0);

-- Saldo del extracto.
insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance) values
  ('10000000-0000-0000-0000-000000000006', 1, 10, '2027-02-01', '2027-02-28', 0);
select public.t('sin saldo del extracto no se cierra',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000006', 'Sin extracto todavia')$q$) like '%falta_saldo_extracto%');
update public.bank_reconciliations set statement_balance = 0 where id = '10000000-0000-0000-0000-000000000006';
select public.t('saldo del extracto en cero es un dato válido',
  (public.cerrar('10000000-0000-0000-0000-000000000006') ->> 'diferencia')::numeric = 0);

-- Sin asiento a resultados.
select public.t('el cierre no toca el mayor',
  (select count(*) from public.journal_entries) = (select e from base_mayor)
  and (select count(*) from public.journal_lines) = (select l from base_mayor));

-- Aislamiento entre empresas.
reset role;
insert into public.bank_reconciliations (id, organization_id, bank_account_id, period_start, period_end, opening_balance, statement_balance) values
  ('20000000-0000-0000-0000-000000000001', 2, 20, '2026-10-01', '2026-10-31', 100, 150);
set role authenticated;
select public.como('00000000-0000-0000-0000-0000000000b1');
select public.t('otra empresa no cierra: pide la organización ajena',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000003', 'Intento ajeno', 1)$q$) like '%Acceso denegado%');
select public.t('otra empresa no cierra: pide la suya con un id ajeno',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000003', 'Intento ajeno', 2)$q$) like '%conciliacion_no_encontrada%');
select public.t('otra empresa no lee las partidas por la tabla',
  (select count(*) = 0 from public.conciliacion_partidas));
select public.t('otra empresa no lee las partidas por la RPC',
  public.intenta($q$select public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000002')$q$) like '%Acceso denegado%');
select public.t('otra empresa no resuelve partidas ajenas',
  public.intenta(format($q$select public.fn_conciliacion_partida_resolver(2, '%s', '20000000-0000-0000-0000-000000000001')$q$, gen_random_uuid())) like '%partida_no_encontrada%');
select public.t('otra empresa cierra lo suyo', (public.cerrar('20000000-0000-0000-0000-000000000001', 'Cierre propio', 2) ->> 'diferencia')::numeric = -50);

select public.como('00000000-0000-0000-0000-0000000000a2');
select public.t('quien solo ve finanzas no cierra',
  public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000003', 'Sin permiso de registro')$q$) like '%sin_permiso%');
select public.como('00000000-0000-0000-0000-0000000000a3');
select public.t('sin permiso de finanzas no lee partidas',
  public.intenta($q$select public.fn_conciliacion_partidas(1, '10000000-0000-0000-0000-000000000002')$q$) like '%sin_permiso%');
select public.t('nadie escribe partidas por la tabla',
  public.intenta($q$insert into public.conciliacion_partidas (organization_id, bank_account_id, reconciliation_id, fecha, descripcion, valor, created_by)
                    values (1, 10, '10000000-0000-0000-0000-000000000006', '2026-01-01', 'manual', 1, '00000000-0000-0000-0000-0000000000a3')$q$) like '%permission denied%');
reset role;
set role anon;
select public.como(null, 'anon');
select public.t('anon no ejecuta el cierre', public.intenta($q$select public.cerrar('10000000-0000-0000-0000-000000000003', 'Anonimo intentando')$q$) like '%permission denied%');
select public.t('anon no lee partidas', public.intenta($q$select * from public.conciliacion_partidas$q$) like '%permission denied%');
reset role;

-------------------------------------------------------------------------------
-- HALLAZGO 6: pendientes contables
-------------------------------------------------------------------------------
select public.como(null, 'service_role');
insert into public.cash_sessions values (1, 1, 1, null);
insert into public.cash_movements (id, organization_id, cash_session_id, type, concept, amount, created_at) values
  (1, 1, 1, 'out', 'Gasto noviembre', 5000, '2026-11-02 15:00:00+00'),
  (2, 1, 1, 'out', 'Gasto octubre',   7000, '2026-10-15 15:00:00+00'),
  -- 8 p. m. del 31 de octubre en Bogotá: en UTC ya es noviembre.
  (3, 1, 1, 'out', 'Gasto de la noche', 1000, '2026-11-01 01:00:00+00'),
  (4, 1, 1, 'out', 'Sigue sin cuenta', 9000, '2026-11-03 15:00:00+00');
insert into public.stock_movements values (77, 1, 1);
insert into public.invoice_sales values ('30000000-0000-0000-0000-000000000001', 1, 'FV-1043', 3570000);
insert into public.invoice_sales values ('30000000-0000-0000-0000-000000000002', 2, 'AJENA-1', 100);

-- Rechazos por el camino normal, con una cuenta que no está en el plan.
delete from public.chart_of_accounts where organization_id = 1 and account_code = '519595';
select public.fn_create_journal_entry(1, 1, '2026-11-02 15:00:00+00', 'x', 'cash_movements', '1', '519595', '110505', 5000, p_fact_key := 'cash_move:1');
select public.fn_create_journal_entry(1, 1, '2026-11-02 15:00:00+00', 'x', 'cash_movements', '1', '519595', '110505', 5000, p_fact_key := 'cash_move:1');
select public.fn_create_journal_entry(1, 1, '2026-11-02 15:00:00+00', 'x', 'cash_movements', '1', '519595', '110505', 5000, p_fact_key := 'cash_move:1');
select public.t('el mismo rechazo no se repite', (select count(*) = 1 from public.journal_entry_failures where fact_key = 'cash_move:1'));
select public.t('el rechazo repetido deja la fecha del intento',
  (select last_attempt_at is not null from public.journal_entry_failures where fact_key = 'cash_move:1'));

insert into public.journal_entry_failures (organization_id, branch_id, entry_date, source, source_id, fact_key, debit_account, credit_account, amount, reason, detail, created_at) values
  (1, 1, '2026-10-15 15:00:00+00', 'cash_movements', '2', 'cash_move:2', '519595', '110505', 7000, 'sin_cuenta', 'Sin cuenta', now() - interval '12 days'),
  (1, 1, '2026-11-01 01:00:00+00', 'cash_movements', '3', 'cash_move:3', '519595', '110505', 1000, 'sin_cuenta', 'Sin cuenta', now() - interval '6 days'),
  (1, 1, '2026-11-03 15:00:00+00', 'cash_movements', '4', 'cash_move:4', '519595', '110505', 9000, 'sin_cuenta', 'Sin cuenta', now() - interval '3 days'),
  (1, 1, '2026-11-03 15:00:00+00', 'stock_movements', '77', 'stock_movement:77', '143505', '519595', 1000, 'cuenta_no_configurada', 'Falta configurar', now() - interval '2 days'),
  (1, 1, '2026-11-04 15:00:00+00', 'invoice_sales', '30000000-0000-0000-0000-000000000001', null, null, '413505', 3570000, 'no_rule', 'Sin regla', now() - interval '1 day'),
  (1, 1, '2026-11-04 15:00:00+00', 'bank_transfers', '555', 'bank_transfer:555', '111005', '112005', 80, 'sin_cuenta', 'Traslado', now()),
  (2, 2, '2026-11-04 15:00:00+00', 'invoice_sales', '30000000-0000-0000-0000-000000000002', 'accrual:sale:30000000-0000-0000-0000-000000000002', null, null, 100, 'no_rule', 'Ajeno', now());
insert into public.journal_entries (organization_id, branch_id, memo, source, fact_key, entry_date) values (1, 1, 'vacío del periodo cerrado', 'cash_movements', 'cash_move:2', '2026-10-15 15:00:00+00');

create temp table mayor2 as select (select count(*) from public.journal_entries) e, (select count(*) from public.journal_lines) l;
grant select on mayor2 to authenticated, anon, service_role;

set role authenticated;
select public.como('00000000-0000-0000-0000-0000000000a2');
create temp table lista on commit preserve rows as select public.fn_pendientes_contables(1) j;
select public.t('estado listo: lista los pendientes de la empresa', (select (j ->> 'pendientes')::int = 7 from lista));
select public.t('kpi: más antiguo en días', (select (j ->> 'mas_antiguo_dias')::int = 12 from lista));
select public.t('kpi: valor sin contabilizar', (select (j ->> 'valor')::numeric = 5000 + 7000 + 1000 + 9000 + 1000 + 3570000 + 80 from lista));
select public.t('kpi: bloquean el cierre del primer periodo abierto',
  (select (j ->> 'bloquean_cierre')::int = 5 and j ->> 'periodo_inicio' = '2026-11-01' from lista));
select public.t('orden: lo más antiguo primero', (select j -> 'filas' -> 0 ->> 'clave' = 'cash_move:2' from lista));
select public.t('muestra el número del documento',
  (select exists (select 1 from jsonb_array_elements(j -> 'filas') e where e ->> 'documento' = 'FV-1043') from lista));
select public.t('muestra la sede', (select j -> 'filas' -> 0 ->> 'sede' = 'Sede de prueba' from lista));
select public.t('marca el periodo cerrado', (select (j -> 'filas' -> 0 ->> 'periodo_cerrado')::boolean from lista));
select public.t('no mezcla documentos ajenos',
  (select not exists (select 1 from jsonb_array_elements(j -> 'filas') e where e ->> 'documento' like 'AJENA%') from lista));
select public.t('busca por documento', ((public.fn_pendientes_contables(1, 'fv-1043') ->> 'total_filtradas')::int = 1));
select public.t('buscar no cambia los KPI', ((public.fn_pendientes_contables(1, 'fv-1043') ->> 'pendientes')::int = 7));
select public.t('pagina', (jsonb_array_length(public.fn_pendientes_contables(1, null, 2, 0) -> 'filas') = 2
  and (public.fn_pendientes_contables(1, null, 2, 6) -> 'filas' -> 0 ->> 'origen') = 'bank_transfers'));
select public.t('consultar no escribe en el mayor',
  (select count(*) from public.journal_entries) = (select e from mayor2));

select public.como('00000000-0000-0000-0000-0000000000a1');
select public.t('estado vacío: una empresa sin pendientes da cero, no error',
  (public.fn_pendientes_contables(3) ->> 'pendientes')::int = 0
  and public.fn_pendientes_contables(3) ->> 'mas_antiguo_dias' is null
  and jsonb_array_length(public.fn_pendientes_contables(3) -> 'filas') = 0);

select public.como('00000000-0000-0000-0000-0000000000a3');
select public.t('estado de error: sin permiso la consulta falla, no devuelve cero',
  public.intenta($q$select public.fn_pendientes_contables(1)$q$) like '%sin_permiso%');

-- Aislamiento.
select public.como('00000000-0000-0000-0000-0000000000b1');
select public.t('otra empresa no ve los pendientes', public.intenta($q$select public.fn_pendientes_contables(1)$q$) like '%Acceso denegado%');
select public.t('otra empresa ve solo los suyos', (public.fn_pendientes_contables(2) ->> 'pendientes')::int = 1);
select public.t('otra empresa no reintenta: organización ajena',
  public.intenta(format($q$select public.fn_pendiente_reintentar(1, %s)$q$, (select min(id) from public.journal_entry_failures))) like '%Acceso denegado%');
reset role;
create temp table un_fallo as select id from public.journal_entry_failures where fact_key = 'cash_move:4';
grant select on un_fallo to authenticated;
set role authenticated;
select public.t('otra empresa no reintenta: id ajeno con su organización',
  public.intenta(format($q$select public.fn_pendiente_reintentar(2, %s)$q$, (select id from un_fallo))) like '%pendiente_no_encontrado%');

select public.como('00000000-0000-0000-0000-0000000000a2');
select public.t('quien solo ve finanzas no reintenta',
  public.intenta(format($q$select public.fn_pendiente_reintentar(1, %s)$q$, (select id from un_fallo))) like '%sin_permiso%');

select public.como('00000000-0000-0000-0000-0000000000a1');
select public.t('la función global no se abre a usuarios', public.intenta($q$select public.fn_reintentar_fallos_asiento()$q$) like '%permission denied%');
select public.t('el núcleo no se abre a usuarios', public.intenta($q$select public.fn_reintentar_fallos_nucleo(1, 1)$q$) like '%permission denied%');
reset role;
set role anon;
select public.como(null, 'anon');
select public.t('anon no reintenta', public.intenta($q$select public.fn_pendiente_reintentar(1, 1)$q$) like '%permission denied%');
select public.t('anon no consulta la bandeja', public.intenta($q$select public.fn_pendientes_contables(1)$q$) like '%permission denied%');
reset role;

-- Periodo cerrado.
set role authenticated;
select public.como('00000000-0000-0000-0000-0000000000a1');
reset role;
insert into public.chart_of_accounts values (1, '519595', true);
create temp table fallos_antes as select count(*) n from public.journal_entry_failures where organization_id = 1;
create temp table f2 as select id from public.journal_entry_failures where fact_key = 'cash_move:2';
create temp table f3 as select id from public.journal_entry_failures where fact_key = 'cash_move:3';
create temp table f4 as select id from public.journal_entry_failures where fact_key = 'cash_move:4';
create temp table f77 as select id from public.journal_entry_failures where fact_key = 'stock_movement:77';
create temp table fsin as select id from public.journal_entry_failures where fact_key is null;
create temp table fotro as select id from public.journal_entry_failures where source = 'bank_transfers';
grant select on fallos_antes, f2, f3, f4, f77, fsin, fotro to authenticated, service_role;
set role authenticated;

select public.t('periodo cerrado: no se reintenta',
  public.fn_pendiente_reintentar(1, (select id from f2)) ->> 'estado' = 'periodo_cerrado');
select public.t('periodo cerrado: la fecha se lee en la zona de la empresa',
  public.fn_pendiente_reintentar(1, (select id from f3)) ->> 'estado' = 'periodo_cerrado');
select public.t('periodo cerrado: sin asiento nuevo, sin fila nueva, sin borrar nada',
  (select count(*) from public.journal_entries) = (select e from mayor2)
  and (select count(*) from public.journal_entry_failures) = (select n from fallos_antes)
  and (select attempts = 1 from public.journal_entry_failures where id = (select id from f2)));

-- Reintento correcto y repetido.
select public.t('reintenta y contabiliza', public.fn_pendiente_reintentar(1, (select id from f4)) ->> 'estado' = 'resuelto');
select public.t('el asiento queda cuadrado',
  (select sum(debit) = 9000 and sum(credit) = 9000 and count(*) = 2
     from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id where e.fact_key = 'cash_move:4'));
select public.t('el asiento conserva la fecha original',
  (select entry_date = '2026-11-03 15:00:00+00' from public.journal_entries where fact_key = 'cash_move:4'));
select public.t('el pendiente queda resuelto con su asiento',
  (select resolved_at is not null and resolved_entry_id = (select id from public.journal_entries where fact_key = 'cash_move:4')
     from public.journal_entry_failures where id = (select id from f4)));
select public.t('repetir no hace nada', public.fn_pendiente_reintentar(1, (select id from f4)) ->> 'estado' = 'ya_resuelto');
select public.t('una sola vez el hecho en el mayor',
  (select count(*) = 1 from public.journal_entries where fact_key = 'cash_move:4'));

select public.t('inventario se reintenta desde la bandeja', public.fn_pendiente_reintentar(1, (select id from f77)) ->> 'estado' = 'resuelto');
select public.t('sin clave del hecho no se reintenta', public.fn_pendiente_reintentar(1, (select id from fsin)) ->> 'estado' = 'no_reintentable');
select public.t('sin ruta de reintento lo dice',
  public.fn_pendiente_reintentar(1, (select id from fotro)) ->> 'estado' = 'no_reintentable');

-- Las pasadas de service_role tampoco multiplican filas ni tocan periodos cerrados.
reset role;
-- cuenta_no_configurada es el caso que se duplicaba: la fila nueva también se reintenta.
update public.chart_of_accounts set es_movimiento = false where organization_id = 1 and account_code = '519595';
insert into public.cash_movements (id, organization_id, cash_session_id, type, concept, amount, created_at) values
  (5, 1, 1, 'out', 'Falla siempre', 4000, '2026-11-05 15:00:00+00');
insert into public.journal_entry_failures (organization_id, branch_id, entry_date, source, source_id, fact_key, debit_account, credit_account, amount, reason, detail) values
  (1, 1, '2026-11-05 15:00:00+00', 'cash_movements', '5', 'cash_move:5', '519595', '110505', 4000, 'cuenta_no_configurada', 'Sin configurar');
select public.como(null, 'service_role');
set role service_role;
select public.fn_reintentar_fallos_asiento();
select public.fn_reintentar_fallos_asiento();
select public.fn_reintentar_fallos_asiento();
select public.t('tres pasadas que fallan dejan una fila (la función anterior dejaba 8)',
  (select count(*) = 1 from public.journal_entry_failures where fact_key = 'cash_move:5' and resolved_at is null));
select public.t('un solo rechazo abierto por motivo',
  not exists (select 1 from public.journal_entry_failures where resolved_at is null and fact_key is not null
               group by organization_id, fact_key, reason having count(*) > 1));
select public.t('cuenta los intentos', (select attempts = 4 from public.journal_entry_failures where fact_key = 'cash_move:5'));
select public.t('la pasada respeta el periodo cerrado', (select attempts = 1 from public.journal_entry_failures where id = (select id from f2)));
reset role;

-- Reabrir el periodo sí deja contabilizar, con la fecha original.
update public.chart_of_accounts set es_movimiento = true where organization_id = 1 and account_code = '519595';
update public.fiscal_periods set status = 'open' where month = 10;
select public.como('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select public.t('con el periodo reabierto se contabiliza', public.fn_pendiente_reintentar(1, (select id from f2)) ->> 'estado' = 'resuelto');
select public.t('el asiento vacío del hecho no queda',
  not exists (select 1 from public.journal_entries e where e.fact_key = 'cash_move:2'
               and not exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id)));
select public.t('sin hechos duplicados en el mayor',
  not exists (select 1 from public.journal_entries where fact_key is not null group by organization_id, fact_key having count(*) > 1));
select public.t('todo asiento cuadrado',
  not exists (select 1 from public.journal_lines group by journal_entry_id having sum(debit) <> sum(credit)));
reset role;

-------------------------------------------------------------------------------
-- Redondeo y reversas en la bandeja: mismas funciones que /pendientes/[id]
-------------------------------------------------------------------------------
select public.como(null, 'service_role');
update public.fiscal_periods set status = 'closed' where month = 9;
update public.fiscal_periods set status = 'open' where month = 10;
insert into public.prueba_redondeo values (1, null);
insert into public.chart_of_accounts values (1, '421095', true) on conflict do nothing;
insert into public.journal_entry_failures (organization_id, branch_id, entry_date, source, source_id, fact_key, amount, reason, detail, asiento_propuesto) values
  (1, 1, '2026-11-04 15:00:00+00', 'cash_movements', 'r1', null, 1, 'redondeo_sin_cuenta', 'Falta la cuenta de redondeo',
   '{"memo": "Sin clave", "fecha": "2026-11-04T15:00:00+00:00", "branch_id": 1, "source": "cash_movements", "source_id": "r1", "clave": "redondeo", "diferencia": 1,
     "debitos_en_pesos": 1000, "creditos_en_pesos": 999, "exacto_debitos": 1000, "exacto_creditos": 999.6,
     "lineas": [{"cuenta": "110505", "debito": 1000, "credito": 0}, {"cuenta": "519595", "debito": 0, "credito": 999}]}'),
  (1, 1, '2026-11-04 15:00:00+00', 'cash_movements', 'r2', 'redondeo:con-clave', 1, 'redondeo_sin_cuenta', 'Falta la cuenta de redondeo',
   '{"memo": "Con clave", "fecha": "2026-11-04T15:00:00+00:00", "branch_id": 1, "source": "cash_movements", "source_id": "r2", "fact_key": "redondeo:con-clave", "clave": "redondeo", "diferencia": 1,
     "debitos_en_pesos": 500, "creditos_en_pesos": 499, "exacto_debitos": 500, "exacto_creditos": 499.6,
     "lineas": [{"cuenta": "110505", "debito": 500, "credito": 0}, {"cuenta": "519595", "debito": 0, "credito": 499}]}'),
  -- 8 p. m. del 30 de septiembre en Bogotá: en UTC ya es octubre, que está abierto.
  (1, 1, '2026-10-01 01:00:00+00', 'cash_movements', 'r3', null, 1, 'redondeo_sin_cuenta', 'Falta la cuenta de redondeo',
   '{"memo": "Septiembre", "fecha": "2026-10-01T01:00:00+00:00", "branch_id": 1, "source": "cash_movements", "source_id": "r3", "clave": "redondeo", "diferencia": 1,
     "debitos_en_pesos": 200, "creditos_en_pesos": 199, "exacto_debitos": 200, "exacto_creditos": 199.6,
     "lineas": [{"cuenta": "110505", "debito": 200, "credito": 0}, {"cuenta": "519595", "debito": 0, "credito": 199}]}');
create temp table r1 as select id from public.journal_entry_failures where source_id = 'r1';
create temp table r2 as select id from public.journal_entry_failures where source_id = 'r2';
create temp table r3 as select id from public.journal_entry_failures where source_id = 'r3';

-- Un asiento original con una línea que hoy es de título, y su reversa detenida.
insert into public.journal_entries (id, organization_id, branch_id, memo, source, entry_date) values (9000, 1, 1, 'Original', 'manual', '2026-09-15 15:00:00+00');
insert into public.journal_lines (journal_entry_id, account_code, debit, credit) values (9000, '1105', 300, 0), (9000, '519595', 0, 300);
insert into public.journal_reversa_pendiente (entry_id, organization_id, failure_fact_key, fecha_anulacion, categoria, lote) values
  (9000, 1, 'reversal:pendiente:9000', '2026-09-20 15:00:00+00', 'anulacion', 'lote');
insert into public.journal_entry_failures (organization_id, branch_id, entry_date, source, source_id, fact_key, amount, reason, detail) values
  (1, 1, '2026-09-20 15:00:00+00', 'reversal', '9000', 'reversal:pendiente:9000', 300, 'reversa_cuenta_titulo', 'Hay líneas en cuentas de título');
create temp table rv as select id from public.journal_entry_failures where source_id = '9000';
grant select on r1, r2, r3, rv to authenticated, service_role;
create temp table mayor3 as select (select count(*) from public.journal_entries) e;
grant select on mayor3 to authenticated, service_role;

set role authenticated;
select public.como('00000000-0000-0000-0000-0000000000a1');
create temp table lista3 on commit preserve rows as select public.fn_pendientes_contables(1, null, 200, 0) j;
select public.t('redondeo sin clave se puede reintentar',
  (select (e ->> 'reintentable')::boolean from lista3, jsonb_array_elements(j -> 'filas') e where e ->> 'origen_id' = 'r1'));
select public.t('el redondeo vale su asiento, no la diferencia',
  (select (e ->> 'importe')::numeric = 1000 from lista3, jsonb_array_elements(j -> 'filas') e where e ->> 'origen_id' = 'r1'));
select public.t('el periodo de la reversa no la bloquea',
  (select not (e ->> 'periodo_cerrado')::boolean from lista3, jsonb_array_elements(j -> 'filas') e where e ->> 'origen_id' = '9000'));

select public.t('redondeo sin cuenta sigue pendiente',
  public.fn_pendiente_reintentar(1, (select id from r1)) ->> 'estado' = 'sigue');
select public.t('redondeo sin cuenta no publica',
  (select count(*) from public.journal_entries) = (select e from mayor3));
select public.t('el intento fallido queda contado',
  (select attempts = 2 and last_attempt_at is not null from public.journal_entry_failures where id = (select id from r1)));

reset role;
update public.prueba_redondeo set cuenta = '421095';
set role authenticated;
select public.t('periodo cerrado en la zona de la empresa, aunque en UTC esté abierto',
  public.fn_pendiente_reintentar(1, (select id from r3)) ->> 'estado' = 'periodo_cerrado');
select public.t('ese redondeo no se publicó',
  not exists (select 1 from public.journal_entries where memo = 'Septiembre'));

select public.t('con la cuenta publica el asiento propuesto',
  public.fn_pendiente_reintentar(1, (select id from r1)) ->> 'estado' = 'resuelto');
select public.t('queda cuadrado, con su línea de redondeo',
  (select sum(l.debit) = sum(l.credit) and sum(l.debit) = 1000 and count(*) = 3
     from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id where e.memo = 'Sin clave'));
select public.t('repetir sin clave del hecho no duplica',
  public.fn_pendiente_reintentar(1, (select id from r1)) ->> 'estado' = 'ya_resuelto'
  and (select count(*) = 1 from public.journal_entries where memo = 'Sin clave'));
select public.t('el reintento de la página y el de la bandeja no duplican',
  public.fn_publicar_redondeo_pendiente((select id from r1)) is not null
  and (select count(*) = 1 from public.journal_entries where memo = 'Sin clave'));

reset role;
insert into public.journal_entries (organization_id, branch_id, memo, source, fact_key, entry_date) values (1, 1, 'Ya estaba', 'cash_movements', 'redondeo:con-clave', '2026-11-04 15:00:00+00');
insert into public.journal_lines (journal_entry_id, account_code, debit, credit)
  select id, '110505', 500, 0 from public.journal_entries where memo = 'Ya estaba'
  union all select id, '519595', 0, 500 from public.journal_entries where memo = 'Ya estaba';
set role authenticated;
select public.t('si el hecho ya está en el mayor lo reutiliza',
  public.fn_pendiente_reintentar(1, (select id from r2)) ->> 'estado' = 'resuelto'
  and (select count(*) = 1 from public.journal_entries where fact_key = 'redondeo:con-clave')
  and not exists (select 1 from public.journal_entries where memo = 'Con clave'));

-- Reversas.
select public.t('la reversa exige Revertir asientos, no solo Registrar',
  public.intenta(format($q$select public.fn_pendiente_reintentar(1, %s)$q$, (select id from rv))) like '%sin_permiso%');
reset role;
insert into public.permisos_prueba values ('00000000-0000-0000-0000-0000000000a1', 1, 'accounting.reverse');
set role authenticated;
select public.t('con líneas por resolver dice qué falta y no publica',
  public.fn_pendiente_reintentar(1, (select id from rv)) ->> 'estado' = 'faltan_cuentas'
  and not exists (select 1 from public.journal_entries where fact_key = 'reversal:9000'));
select public.t('una reversa no se publica a medias',
  (select resolved_at is null and attempts = 2 from public.journal_entry_failures where id = (select id from rv)));
reset role;
update public.chart_of_accounts set es_movimiento = true where organization_id = 1 and account_code = '1105';
set role authenticated;
select public.t('sin líneas por resolver publica la reversa completa',
  public.fn_pendiente_reintentar(1, (select id from rv)) ->> 'estado' = 'resuelto');
select public.t('la reversa es el espejo del original',
  (select sum(l.debit) = 300 and sum(l.credit) = 300 and count(*) = 2
     from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id where e.fact_key = 'reversal:9000'));
select public.t('repetir la reversa no duplica',
  public.fn_pendiente_reintentar(1, (select id from rv)) ->> 'estado' = 'ya_resuelto'
  and (select count(*) = 1 from public.journal_entries where fact_key = 'reversal:9000'));
select public.t('la página tampoco duplica',
  public.fn_reversar_linea_sin_cuenta((select id from rv), '{}'::jsonb) is not null
  and (select count(*) = 1 from public.journal_entries where fact_key = 'reversal:9000'));

select public.como('00000000-0000-0000-0000-0000000000b1');
select public.t('otra empresa no publica un redondeo ajeno',
  public.intenta(format($q$select public.fn_pendiente_reintentar(2, %s)$q$, (select id from r3))) like '%pendiente_no_encontrado%');
select public.como('00000000-0000-0000-0000-0000000000a1');
select public.t('sin hechos duplicados al final',
  not exists (select 1 from public.journal_entries where fact_key is not null group by organization_id, fact_key having count(*) > 1));
select public.t('todo asiento con líneas, cuadrado',
  not exists (select 1 from public.journal_lines group by journal_entry_id having sum(debit) <> sum(credit)));
reset role;

-------------------------------------------------------------------------------
select count(*) || ' pruebas, ' || count(*) filter (where not ok) || ' fallidas' as resultado from public.resultados;
