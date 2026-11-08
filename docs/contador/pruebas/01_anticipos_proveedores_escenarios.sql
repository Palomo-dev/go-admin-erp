-- Pruebas de escenario · Anticipos a proveedores (escenarios a–h)
-- Fecha: 2026-11-07 · Proyecto Supabase taqjemqjtumhwptchcxk · Organización de pruebas 374 (sucursal 585).
--
-- NO DEJA DATOS: todo corre dentro de begin … rollback. Lo que la org 374 no tiene (proveedores y una factura de
-- compra recibida) se crea dentro de la misma transacción y se revierte con ella.
-- Las operaciones del anticipo corren como un usuario miembro de la org 374 (rol «authenticated» con su sesión
-- simulada por request.jwt.claims), igual que desde la aplicación. Los datos de apoyo se crean como administrador
-- de la base, antes de cambiar de rol.
-- Resultado: tabla temporal r (escenario, verificación, esperado, obtenido, ok). Ver el .resultado.json hermano.

begin;

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated;
grant usage on sequence r_n_seq to authenticated;

-- ── Datos de apoyo (se revierten) ─────────────────────────────────────────────
with s as (
  insert into public.suppliers (organization_id, name, nit, supplier_type)
  values (374, 'Proveedor de prueba A', '900000001', 'company'),
         (374, 'Proveedor de prueba B', '900000002', 'company')
  returning id, nit)
insert into ctx select 'sup_' || right(nit, 1), id::text from s;

-- Factura de compra del proveedor A: 1.000.000 + IVA 19 % = 1.190.000 (borrador → recibida: genera su asiento y su CxP).
with f as (
  insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date, due_date)
  values (374, 585, (select v::int from ctx where k = 'sup_1'), 'PRUEBA-FC-001', 'draft', 'COP', now(), now() + interval '30 days')
  returning id)
insert into ctx select 'fc', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Mercancía de prueba', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc');
insert into ctx select 'ap', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc');
-- Último asiento antes de las operaciones del anticipo (el de la compra ya existe).
insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;

-- ── Sesión de un usuario miembro de la org 374 ────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_ap uuid := (select v::uuid from ctx where k = 'ap');
  v_fc uuid := (select v::uuid from ctx where k = 'fc');
  v_max_je int := (select v::int from ctx where k = 'max_je');
  v_res jsonb;
  v_res2 jsonb;
  v_a1 uuid;
  v_a2 uuid;
  v_b1 uuid;
  v_n int;
  v_n2 int;
  v_num numeric;
  v_num2 numeric;
  v_txt text;
  v_txt2 text;
  v_err text;
  v_ok boolean;
  v_ip_antes int;
  v_ap_antes int;
  v_app_antes int;
  v_je_antes int;
  v_e record;
begin
  -- ═══ a. Crear anticipo ═══════════════════════════════════════════════════════
  select count(*) into v_ip_antes from public.invoice_purchase where organization_id = 374;
  select count(*) into v_ap_antes from public.accounts_payable where organization_id = 374;
  v_res := public.fn_anticipo_proveedor_crear(v_a, 585, 1000000, 'transfer', 'prueba-anticipo-A1', 374, null, 'TRF-0001', 'Anticipo de prueba A1');
  v_a1 := (v_res ->> 'anticipo_id')::uuid;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('a', 'Respuesta de fn_anticipo_proveedor_crear', 'repetida=false, monto=1000000, recibo CE-…, con asiento',
     v_res::text, (v_res ->> 'repetida')::boolean = false and (v_res ->> 'monto')::numeric = 1000000 and v_res ->> 'recibo' like 'CE%' and v_res ->> 'asiento_id' is not null);

  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc),
         count(*) filter (where l.account_code = '1330' and l.debit = 1000000 and l.credit = 0),
         count(*) filter (where l.account_code = '1110' and l.credit = 1000000 and l.debit = 0)
    into v_txt, v_n, v_n2
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.fact_key = 'supplier_advance:' || v_a1;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('a', 'Asiento del anticipo', '1330 D 1.000.000 / 1110 (bancos) C 1.000.000, tercero 900000001', v_txt,
     v_n = 1 and v_n2 = 1 and v_txt like '%tercero 900000001%' and v_txt not like '%tercero -%');

  select coalesce(sum(balance), 0) into v_num from public.supplier_advances where organization_id = 374 and supplier_id = v_a;
  select amount || ' / ' || balance || ' / ' || status || ' / cuenta ' || account_code into v_txt from public.supplier_advances where id = v_a1;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('a', 'Saldo por proveedor A (supplier_advances)', 'monto / saldo / estado = 1000000 / 1000000 / active, cuenta 1330; saldo A = 1.000.000',
     v_txt || '; saldo A = ' || v_num, v_num = 1000000 and v_txt like '1000000.00 / 1000000.00 / active / cuenta 1330');

  select count(*) into v_n from public.payments where organization_id = 374 and source = 'supplier_advance' and source_id = v_a1::text and amount = -1000000 and status = 'completed';
  select count(*) into v_n2 from public.payments where organization_id = 374 and source in ('invoice_purchase', 'account_payable');
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('a', 'Movimiento de dinero', 'un pago «supplier_advance» por -1.000.000 (sale dinero); ningún pago a factura o CxP',
     'pagos supplier_advance=' || v_n || '; pagos a factura/CxP=' || v_n2, v_n = 1 and v_n2 = 0);

  select count(*) into v_n from public.invoice_purchase where organization_id = 374;
  select count(*) into v_n2 from public.accounts_payable where organization_id = 374;
  select count(*) into v_app_antes from public.supplier_advance_applications where organization_id = 374;
  select count(*) into v_je_antes
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.fact_key = 'supplier_advance:' || v_a1
     and (left(l.account_code, 1) in ('5', '6', '7') or left(l.account_code, 2) = '14' or l.account_code like '22%');
  select balance into v_num from public.accounts_payable where id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('a', 'No se convierte en compra ni gasto', 'facturas de compra y CxP sin cambio; 0 aplicaciones; 0 líneas en 5/6/7/14/22; la CxP sigue en 1.190.000',
     format('facturas %s→%s; CxP %s→%s; aplicaciones %s; líneas gasto/costo/inventario/proveedores %s; saldo CxP %s', v_ip_antes, v_n, v_ap_antes, v_n2, v_app_antes, v_je_antes, v_num),
     v_n = v_ip_antes and v_n2 = v_ap_antes and v_app_antes = 0 and v_je_antes = 0 and v_num = 1190000);

  -- ═══ b. Misma clave de idempotencia ═════════════════════════════════════════
  v_res2 := public.fn_anticipo_proveedor_crear(v_a, 585, 1000000, 'transfer', 'prueba-anticipo-A1', 374, null, 'TRF-0001', 'Anticipo de prueba A1');
  select count(*) into v_n from public.supplier_advances where organization_id = 374 and supplier_id = v_a;
  select count(*) into v_n2 from public.journal_entries where organization_id = 374 and fact_key = 'supplier_advance:' || v_a1;
  select count(*) into v_ip_antes from public.payments where organization_id = 374 and source = 'supplier_advance';
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('b', 'Repetir crear con la misma clave', 'repetida=true, mismo anticipo_id; 1 anticipo, 1 asiento, 1 pago',
     format('repetida=%s; mismo id=%s; anticipos A=%s; asientos=%s; pagos=%s', v_res2 ->> 'repetida', (v_res2 ->> 'anticipo_id')::uuid = v_a1, v_n, v_n2, v_ip_antes),
     (v_res2 ->> 'repetida')::boolean and (v_res2 ->> 'anticipo_id')::uuid = v_a1 and v_n = 1 and v_n2 = 1 and v_ip_antes = 1);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_crear(v_a, 585, 2000000, 'transfer', 'prueba-anticipo-A1', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('b', 'Misma clave con otro monto', 'rechaza: clave_idempotencia_reutilizada', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'clave_idempotencia_reutilizada');

  -- ═══ c. Aplicar parcialmente a la CxP de la factura ═════════════════════════
  v_res := public.fn_anticipo_proveedor_aplicar(v_a1, v_ap, 400000, 'prueba-aplicar-1', 374);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'Respuesta de fn_anticipo_proveedor_aplicar (400.000)', 'saldo_disponible=600000, saldo_cuenta=790000, estado_cuenta=partial',
     v_res::text, (v_res ->> 'saldo_disponible')::numeric = 600000 and (v_res ->> 'saldo_cuenta')::numeric = 790000 and v_res ->> 'estado_cuenta' = 'partial');

  select balance || ' / ' || status into v_txt from public.supplier_advances where id = v_a1;
  select ap.balance || ' / ' || ap.status, ip.balance::text into v_txt2, v_err
    from public.accounts_payable ap join public.invoice_purchase ip on ip.id = ap.invoice_id where ap.id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'Saldos tras aplicar', 'anticipo 600000 / active; CxP 790000 / partial; factura balance 790000',
     'anticipo ' || v_txt || '; CxP ' || v_txt2 || '; factura ' || v_err,
     v_txt = '600000.00 / active' and v_txt2 like '790000% / partial' and v_err::numeric = 790000);

  -- fn_invoice_purchase_paid y fn_cxp_recalcular son funciones internas: el usuario no las puede llamar
  -- directamente (las usan los disparadores y las RPC). Aquí se comprueba eso; su valor se mide al final,
  -- como administrador de la base (bloque «c (cierre)»).
  v_err := null;
  begin
    perform public.fn_invoice_purchase_paid(v_fc);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'El usuario no puede llamar fn_invoice_purchase_paid directamente', 'rechaza: permiso denegado',
     coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');
  v_err := null;
  begin
    perform public.fn_cxp_recalcular(v_ap);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'El usuario no puede llamar fn_cxp_recalcular directamente', 'rechaza: permiso denegado',
     coalesce(v_err, 'NO RECHAZÓ'), v_err like 'permission denied%');

  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc),
         count(*) filter (where l.account_code = '22050501' and l.debit = 400000),
         count(*) filter (where l.account_code = '1330' and l.credit = 400000)
    into v_txt, v_n, v_n2
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.id = (v_res ->> 'asiento_id')::int;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'Asiento de la aplicación', '22050501 (proveedores) D 400.000 / 1330 C 400.000, tercero 900000001', v_txt,
     v_n = 1 and v_n2 = 1 and v_txt not like '%tercero -%');

  v_res2 := public.fn_anticipo_proveedor_aplicar(v_a1, v_ap, 400000, 'prueba-aplicar-1', 374);
  select count(*) into v_n from public.supplier_advance_applications where organization_id = 374;
  select count(*) into v_n2 from public.journal_entries where organization_id = 374 and source = 'supplier_advance_application';
  select balance into v_num from public.accounts_payable where id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'Repetir la aplicación con la misma clave', 'repetida=true; 1 aplicación, 1 asiento; CxP sigue en 790000',
     format('repetida=%s; aplicaciones=%s; asientos=%s; CxP=%s', v_res2 ->> 'repetida', v_n, v_n2, v_num),
     (v_res2 ->> 'repetida')::boolean and v_n = 1 and v_n2 = 1 and v_num = 790000);

  -- ═══ d. Aplicar más que el saldo ════════════════════════════════════════════
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_a1, v_ap, 700000, 'prueba-aplicar-exceso', 374);
  exception when others then v_err := sqlerrm;
  end;
  select balance into v_num from public.supplier_advances where id = v_a1;
  select balance into v_num2 from public.accounts_payable where id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('d', 'Aplicar 700.000 con saldo de anticipo 600.000', 'rechaza: monto_excede_anticipo; nada cambia',
     coalesce(v_err, 'NO RECHAZÓ') || format('; anticipo %s; CxP %s', v_num, v_num2),
     v_err = 'monto_excede_anticipo' and v_num = 600000 and v_num2 = 790000);

  v_res := public.fn_anticipo_proveedor_crear(v_a, 585, 900000, 'transfer', 'prueba-anticipo-A2', 374, null, 'TRF-0002', 'Anticipo de prueba A2');
  v_a2 := (v_res ->> 'anticipo_id')::uuid;
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_a2, v_ap, 800000, 'prueba-aplicar-exceso-cxp', 374);
  exception when others then v_err := sqlerrm;
  end;
  select balance into v_num from public.supplier_advances where id = v_a2;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('d', 'Aplicar 800.000 a una CxP con saldo 790.000 (anticipo A2 de 900.000)', 'rechaza: monto_excede_saldo; A2 sigue en 900.000',
     coalesce(v_err, 'NO RECHAZÓ') || '; A2 ' || v_num, v_err = 'monto_excede_saldo' and v_num = 900000);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_a1, v_ap, 0, 'prueba-aplicar-cero', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('d', 'Aplicar 0', 'rechaza: monto_invalido', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'monto_invalido');

  -- ═══ g. Dos proveedores: los saldos no se mezclan ═══════════════════════════
  v_res := public.fn_anticipo_proveedor_crear(v_b, 585, 250000, 'transfer', 'prueba-anticipo-B1', 374, null, 'TRF-0003', 'Anticipo de prueba B1');
  v_b1 := (v_res ->> 'anticipo_id')::uuid;
  select coalesce(sum(balance) filter (where supplier_id = v_a), 0), coalesce(sum(balance) filter (where supplier_id = v_b), 0)
    into v_num, v_num2 from public.supplier_advances where organization_id = 374;
  select string_agg(t.nit || ' = ' || t.saldo, '; ' order by t.nit) into v_txt
    from (select l.tercero_nit as nit, round(sum(l.debit - l.credit)) as saldo
            from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
           where je.organization_id = 374 and je.posted and l.account_code = '1330'
           group by l.tercero_nit) t;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('g', 'Saldo por proveedor (tabla) y auxiliar 1330 por tercero', 'A = 1.500.000 (600.000 de A1 + 900.000 de A2); B = 250.000; el auxiliar 1330 por NIT dice lo mismo',
     format('tabla: A=%s, B=%s; auxiliar 1330: %s', v_num, v_num2, v_txt),
     v_num = 1500000 and v_num2 = 250000 and v_txt = '900000001 = 1500000; 900000002 = 250000');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_b1, v_ap, 100000, 'prueba-aplicar-otro-proveedor', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('g', 'Aplicar el anticipo de B a la CxP de A', 'rechaza: proveedor_distinto', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'proveedor_distinto');

  -- ═══ e. Devolver el disponible ══════════════════════════════════════════════
  v_res := public.fn_anticipo_proveedor_devolver(v_a1, 600000, 'transfer', 'El proveedor devolvió el saldo', 'prueba-devolver-1', 374, null, 'TRF-0004');
  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc),
         count(*) filter (where l.account_code = '1110' and l.debit = 600000),
         count(*) filter (where l.account_code = '1330' and l.credit = 600000)
    into v_txt, v_n, v_n2
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.id = (v_res ->> 'asiento_id')::int;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('e', 'Asiento de la devolución (600.000)', '1110 D 600.000 / 1330 C 600.000, tercero 900000001', v_txt,
     v_n = 1 and v_n2 = 1 and v_txt not like '%tercero -%');
  select balance || ' / ' || status into v_txt from public.supplier_advances where id = v_a1;
  select count(*) into v_n from public.payments where organization_id = 374 and source = 'supplier_advance_refund' and source_id = v_a1::text and amount = 600000 and status = 'completed';
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('e', 'Saldo del anticipo y pago de entrada', 'A1 0 / used; un pago «supplier_advance_refund» por +600.000',
     'A1 ' || v_txt || '; pagos de devolución=' || v_n, v_txt = '0.00 / used' and v_n = 1);

  v_res2 := public.fn_anticipo_proveedor_devolver(v_a1, 600000, 'transfer', 'El proveedor devolvió el saldo', 'prueba-devolver-1', 374, null, 'TRF-0004');
  select count(*) into v_n from public.journal_entries where organization_id = 374 and source = 'supplier_advance_refund';
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('e', 'Repetir la devolución con la misma clave', 'repetida=true; 1 asiento de devolución',
     format('repetida=%s; asientos=%s', v_res2 ->> 'repetida', v_n), (v_res2 ->> 'repetida')::boolean and v_n = 1);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver(v_a1, 1000, 'transfer', 'Otra devolución', 'prueba-devolver-2', 374, null, 'TRF-0005');
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('e', 'Devolver otra vez sobre un anticipo en 0', 'rechaza: anticipo_no_disponible', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_no_disponible');

  -- ═══ f. Anular ══════════════════════════════════════════════════════════════
  v_res := public.fn_anticipo_proveedor_anular(v_a2, 'Anticipo registrado por error', 374);
  select balance || ' / ' || status into v_txt from public.supplier_advances where id = v_a2;
  select status into v_txt2 from public.payments where organization_id = 374 and source = 'supplier_advance' and source_id = v_a2::text;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('f', 'Anular A2 (sin usar)', 'A2 0 / cancelled; su pago queda void; hay contra-asiento',
     v_res::text || '; A2 ' || v_txt || '; pago ' || v_txt2,
     v_txt = '0.00 / cancelled' and v_txt2 = 'void' and v_res ->> 'contra_asiento' is not null);
  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc),
         count(*) filter (where l.account_code = '1110' and l.debit = 900000),
         count(*) filter (where l.account_code = '1330' and l.credit = 900000)
    into v_txt, v_n, v_n2
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.id = (v_res ->> 'contra_asiento')::int;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('f', 'Contra-asiento de la anulación', '1110 D 900.000 / 1330 C 900.000 (inverso del original), tercero 900000001', coalesce(v_txt, 'SIN CONTRA-ASIENTO'),
     v_n = 1 and v_n2 = 1 and v_txt not like '%tercero -%');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular(v_a1, 'Intento de anular uno usado', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('f', 'Anular A1 (aplicado y devuelto)', 'rechaza: anticipo_usado', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_usado');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular(v_a2, 'Segunda anulación', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('f', 'Anular A2 por segunda vez', 'rechaza: anticipo_no_disponible', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_no_disponible');

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_a2, v_ap, 1000, 'prueba-aplicar-anulado', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('f', 'Aplicar un anticipo anulado', 'rechaza: anticipo_no_disponible', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_no_disponible');

  -- ═══ g (cierre). Saldos finales por proveedor ═══════════════════════════════
  select coalesce(sum(balance) filter (where supplier_id = v_a), 0), coalesce(sum(balance) filter (where supplier_id = v_b), 0)
    into v_num, v_num2 from public.supplier_advances where organization_id = 374;
  select string_agg(t.nit || ' = ' || t.saldo, '; ' order by t.nit) into v_txt
    from (select l.tercero_nit as nit, round(sum(l.debit - l.credit)) as saldo
            from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
           where je.organization_id = 374 and je.posted and l.account_code = '1330'
           group by l.tercero_nit) t;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('g', 'Saldos finales por proveedor', 'A = 0 (1.000.000 − 400.000 aplicado − 600.000 devuelto; A2 anulado); B = 250.000; auxiliar 1330 igual',
     format('tabla: A=%s, B=%s; auxiliar 1330: %s', v_num, v_num2, v_txt),
     v_num = 0 and v_num2 = 250000 and v_txt = '900000001 = 0; 900000002 = 250000');

  select balance || ' / ' || status into v_txt from public.accounts_payable where id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('g', 'CxP de la factura al final', '790000 / partial (solo bajó por la aplicación de 400.000)', v_txt, v_txt like '790000% / partial');

  -- ═══ h. Todos los asientos generados cuadran ════════════════════════════════
  for v_e in
    select je.id, je.source, je.memo, je.posted, round(sum(l.debit), 2) as d, round(sum(l.credit), 2) as c, count(l.id) as n,
           string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.id) as lineas
      from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
     where je.organization_id = 374 and je.id > v_max_je
     group by je.id, je.source, je.memo, je.posted
     order by je.id
  loop
    insert into r (escenario, verificacion, esperado, obtenido, ok) values
      ('h', format('Asiento %s · %s · %s', v_e.id, v_e.source, v_e.memo), 'Σ débitos = Σ créditos, publicado',
       format('D %s = C %s; %s líneas; %s', v_e.d, v_e.c, v_e.n, v_e.lineas), v_e.d = v_e.c and v_e.posted);
  end loop;
  select count(*) into v_n from public.journal_entries where organization_id = 374 and id > v_max_je;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('h', 'Número de asientos generados por las operaciones', '6: crear A1, aplicar, crear A2, crear B1, devolver, contra-asiento de A2',
     v_n::text, v_n = 6);
end
$$;

-- ── c (cierre): la regla única de saldo de compras, medida como administrador de la base ──
reset role;

do $$
declare
  v_ap uuid := (select v::uuid from ctx where k = 'ap');
  v_fc uuid := (select v::uuid from ctx where k = 'fc');
  v_num numeric;
  v_neto numeric;
  v_txt text;
begin
  v_num := public.fn_invoice_purchase_paid(v_fc);
  v_neto := public.fn_invoice_purchase_neto(v_fc);
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'fn_invoice_purchase_paid(factura) al final', '400000: lo aplicado del anticipo cuenta como pagado (la devolución no toca la factura); saldo 790000',
     v_num::text || format(' (neto a pagar %s, saldo %s)', v_neto, v_neto - v_num), v_num = 400000 and v_neto - v_num = 790000);
  perform public.fn_cxp_recalcular(v_ap);
  select balance || ' / ' || status into v_txt from public.accounts_payable where id = v_ap;
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'fn_cxp_recalcular(CxP) vuelto a correr', 'deja 790000 / partial (regla única, no duplica lo aplicado)',
     v_txt, v_txt like '790000% / partial');
  insert into r (escenario, verificacion, esperado, obtenido, ok) values
    ('c', 'Permiso de ejecución de las funciones internas', 'authenticated y anon sin EXECUTE en fn_invoice_purchase_paid y fn_cxp_recalcular',
     format('authenticated: %s / %s; anon: %s / %s',
       has_function_privilege('authenticated', 'public.fn_invoice_purchase_paid(uuid)', 'execute'),
       has_function_privilege('authenticated', 'public.fn_cxp_recalcular(uuid)', 'execute'),
       has_function_privilege('anon', 'public.fn_invoice_purchase_paid(uuid)', 'execute'),
       has_function_privilege('anon', 'public.fn_cxp_recalcular(uuid)', 'execute')),
     not has_function_privilege('authenticated', 'public.fn_invoice_purchase_paid(uuid)', 'execute')
       and not has_function_privilege('authenticated', 'public.fn_cxp_recalcular(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.fn_invoice_purchase_paid(uuid)', 'execute')
       and not has_function_privilege('anon', 'public.fn_cxp_recalcular(uuid)', 'execute'));
end
$$;

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
