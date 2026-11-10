-- Pruebas · Ronda 6 del Contador (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md), «IVA»: el
-- hallazgo del reparto de la base y las respuestas 1 a 5, 7 y 8.
--   H. Reparto de la base del asiento por líneas (20261110150000): la migración sola y su reversión (la definición vuelve
--      byte a byte, md5 a4e14cbc23142d9f46c25145faa49642); el ejemplo del Contador (100.000 / 215.200 / 119.000); el
--      ajuste de centavos en la última línea; el peso de una línea con IVA incluido y con INC.
--   W. «Nunca transmitida»: falla que cubre la fecha de la venta → expedida en contingencia (nota crédito); constancia de
--      que no hubo contingencia + consulta sin resultado → se retira; 48 horas desde el fin de la falla o desde la venta;
--      sin falla registrada la regla no aplica.
--   V. Período declarado: solicitud de corrección ante la DIAN (art. 589 ET) con su resultado; referencia del art. 714 ET.
--   E. Segundo usuario para todo lo que mueve la 2408 y se propone «no afecta» (pago a la DIAN, traslado, cierre y retiro
--      de la venta).
--   Z. Importación exenta: zona franca → 48; si no → 47; nunca 54; con el artículo de la exención.
--   G. Cuenta por línea: toda compra con IVA no descontable y más de una línea.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140000 (H1), 20261108150000, 20261108150500, 20261108151000,
-- 20261108152000 y 20261110150000. Se pegan donde dice «MIGRACIONES», dentro de la misma transacción. Además, ANTES, la
-- migración 20261110150000 sola y su reversión se pegan donde dicen «REPARTO SOLO» y «REVERSIÓN DEL REPARTO».
-- Usuarios simulados: A = el miembro activo de la org 374; B = el dueño de la org 137, miembro de la 374 SOLO dentro de la
-- transacción (el segundo usuario). Las fechas de las ventas y de las fallas son fijas (noviembre de 2026).

begin;
set local timezone to 'America/Bogota';

-- ═══ H0 · La migración del reparto sola, y su reversión ═══
create temp table h0 (k text primary key, v text);
insert into h0 select 'antes', md5(pg_get_functiondef('public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure));

-- ═══ REPARTO SOLO (20261110150000, sin las demás migraciones) ═══

insert into h0 select 'aplicada', md5(d) || ' · ' || (position('reparto_base_antes_de_iva_20261110' in d) > 0)
  from (select pg_get_functiondef('public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure) d) x;

-- ═══ REVERSIÓN DEL REPARTO (20261110150000_rollback) ═══

insert into h0 select 'revertida', md5(pg_get_functiondef('public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure));
insert into h0 select 'peso_borrada', (to_regprocedure('public.fn_asiento_peso_reparto_linea(public.invoice_items,boolean,boolean)') is null)::text;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', x.v, x.e, x.o, x.o = x.e from (values
  ('Antes: la definición aplicada de fn_armar_asiento_documento', 'a4e14cbc23142d9f46c25145faa49642', (select v from h0 where k = 'antes')),
  ('La migración sola cambia la función y deja su marca', 'cambió · true',
   case when split_part((select v from h0 where k = 'aplicada'), ' · ', 1) <> (select v from h0 where k = 'antes') then 'cambió' else 'igual' end
   || ' · ' || split_part((select v from h0 where k = 'aplicada'), ' · ', 2)),
  ('La reversión devuelve la definición byte a byte', 'a4e14cbc23142d9f46c25145faa49642', (select v from h0 where k = 'revertida')),
  ('La reversión borra la función del peso', 'true', (select v from h0 where k = 'peso_borrada'))
) x(v, e, o);

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
insert into ctx values ('ua', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}');
insert into ctx select 'ub', json_build_object('sub', o.owner_user_id, 'role', 'authenticated')::text from public.organizations o where o.id = 137;
insert into public.organization_members (organization_id, user_id, role_id, is_active)
select 374, o.owner_user_id, 2, true from public.organizations o
 where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);

with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba R6', '900000066', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with p as (insert into public.products (organization_id, sku, name, product_type, track_stock)
           values (374, 'PRUEBA-R6-BIEN', 'Bien de prueba R6', 'product', false), (374, 'PRUEBA-R6-SERV', 'Servicio de prueba R6', 'service', false)
           returning id, sku)
insert into ctx select lower(replace(sku, 'PRUEBA-R6-', 'p_')), id::text from p;
-- La org 374 solo tiene la título 1435: se crea el auxiliar dentro de la transacción (se revierte), como en la prueba 17.
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, false, c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('143501', 'Mercancías no fabricadas por la empresa', '1435', false), ('14350101', 'Mercancías de prueba', '143501', true)) x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '1435'
   and not exists (select 1 from public.chart_of_accounts e where e.organization_id = 374 and e.account_code = x.code);
update public.configuracion_contable set account_code = '14350101' where organization_id = 374 and clave = 'inventario';

-- Ayudantes (devuelven 'OK…' o el mensaje de error, con su detalle).
create function pg_temp.err(p_msg text, p_det text) returns text language sql as $$ select p_msg || coalesce(' [' || nullif(p_det, '') || ']', '') $$;
create function pg_temp.cla(p_desc text, p_d jsonb) returns text language plpgsql as $$
declare v_m text; v_d text;
begin
  perform public.fn_iva_clasificar_linea(374, 'invoice_items', (select it.id from public.invoice_items it where it.description = p_desc
                                                                  and it.invoice_purchase_id in (select v::uuid from ctx where k like 'f%')), p_d);
  return 'OK';
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.nat(p_k text, p_d jsonb) returns text language plpgsql as $$
declare v_m text; v_d text;
begin
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = p_k), p_d);
  return 'OK';
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.natj(p_k text, p_d jsonb) returns jsonb language plpgsql as $$
begin
  return public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = p_k), p_d);
exception when others then return jsonb_build_object('error', sqlerrm);
end $$;
create function pg_temp.dec(p_k text, p_d jsonb) returns text language plpgsql as $$
declare v_m text; v_d text;
begin
  return 'OK ' || (public.fn_iva_correccion_error_decidir(374, (select v::int from ctx where k = p_k), p_d) ->> 'decision_tratamiento');
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.decl(p_desde date, p_hasta date, p_d jsonb) returns text language plpgsql as $$
declare v_m text; v_d text;
begin
  perform public.fn_tributario_iva_declaracion_guardar(374, p_desde, p_hasta, p_d);
  return 'OK';
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.declj(p_desde date, p_hasta date, p_d jsonb) returns jsonb language plpgsql as $$
begin
  return public.fn_tributario_iva_declaracion_guardar(374, p_desde, p_hasta, p_d);
exception when others then return jsonb_build_object('error', sqlerrm);
end $$;
create function pg_temp.apr(p_k text, p_aprobar boolean) returns text language plpgsql as $$
declare v_m text; v_d text; v_r jsonb;
begin
  v_r := public.fn_iva_naturaleza_asiento_aprobar(374, (select v::int from ctx where k = p_k), p_aprobar, 'Revisado por el segundo usuario (R6)');
  return case when v_r ->> 'aprobado_por' is not null then 'aprobado' else 'sin aprobar' end;
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.faltan(p_k text) returns text language sql as $$
  select coalesce(public.fn_iva_correccion_expediente_faltantes(n)::text, 'SIN REGISTRO')
    from public.tributario_iva_naturaleza_asiento n where n.organization_id = 374 and n.journal_entry_id = (select v::int from ctx where k = p_k) $$;
create function pg_temp.aprobado(p_k text) returns text language sql as $$
  select case when n.aprobado_por is null then 'sin aprobar' else 'aprobado' end
    from public.tributario_iva_naturaleza_asiento n where n.organization_id = 374 and n.journal_entry_id = (select v::int from ctx where k = p_k) $$;
grant execute on function pg_temp.err(text, text) to authenticated, anon;
grant execute on function pg_temp.cla(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.nat(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.natj(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.dec(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.decl(date, date, jsonb) to authenticated, anon;
grant execute on function pg_temp.declj(date, date, jsonb) to authenticated, anon;
grant execute on function pg_temp.apr(text, boolean) to authenticated, anon;
grant execute on function pg_temp.faltan(text) to authenticated, anon;
grant execute on function pg_temp.aprobado(text) to authenticated, anon;

-- ═══ Compras ═══
--   FRB  el ejemplo del Contador con cuenta por línea: 100.000 al 19 % no descontable (519525), 200.000 al 19 %
--        proporcional 60 % (513595), 100.000 al 5 % descontable (14350101).
--   FRC  tres líneas de 100.000 con el IVA INCLUIDO (19 %, 5 % y exenta) y una cabecera con 1 centavo más de IVA que sus
--        líneas: los centavos del reparto (borrador; solo se arma, no se publica).
--   FRI  una línea con INC del 8 % (borrador): el peso de la línea.
--   FZ1…FZ5  importaciones de una línea (exentas y excluidas, con y sin zona franca).
--   FG1  una línea no descontable con cuenta de cabecera · FG2 dos líneas no descontables con cuenta de cabecera ·
--   FG3  tres líneas no descontables, dos con cuenta propia y una sin ella.
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           select 374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-R6-' || x.n, 'draft', 'COP', now()
             from (values ('FRB'), ('FRC'), ('FRI'), ('FZ1'), ('FZ2'), ('FZ3'), ('FZ4'), ('FZ5'), ('FG1'), ('FG2'), ('FG3')) x(n)
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-R6-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code,
                                  total_line, cuenta_contable, tax_included)
select (select v::uuid from ctx where k = x.d), 'purchase', (select v::uuid from ctx where k = x.d), (select v::int from ctx where k = x.p), x.descr,
       1, x.pr, x.t, x.c, x.tot, x.cta, x.inc
  from (values ('frb', null, 'R6 FRB no descontable 19', 100000, 19, 'IVA_19', 119000, '519525', false),
               ('frb', null, 'R6 FRB proporcional 19', 200000, 19, 'IVA_19', 238000, '513595', false),
               ('frb', null, 'R6 FRB descontable 5', 100000, 5, 'IVA_5', 105000, '14350101', false),
               ('frc', null, 'R6 FRC incluido 19', 100000, 19, 'IVA_19', 100000, '519525', true),
               ('frc', null, 'R6 FRC incluido 5', 100000, 5, 'IVA_5', 100000, '513595', true),
               ('frc', null, 'R6 FRC exenta', 100000, 0, null, 100000, '14350101', true),
               ('fri', null, 'R6 FRI con INC 8', 100000, 8, 'INC_8', 108000, '519525', false),
               ('fz1', 'p_bien', 'R6 FZ1 exenta de zona franca', 100000, 0, null, 100000, null, false),
               ('fz2', 'p_bien', 'R6 FZ2 exenta sin zona franca', 60000, 0, null, 60000, null, false),
               ('fz3', 'p_bien', 'R6 FZ3 exenta sin dato de zona franca', 30000, 0, null, 30000, null, false),
               ('fz4', 'p_bien', 'R6 FZ4 excluida de zona franca', 20000, 0, null, 20000, null, false),
               ('fz5', 'p_bien', 'R6 FZ5 excluida sin zona franca', 10000, 0, null, 10000, null, false),
               ('fg1', 'p_bien', 'R6 FG1 bien no descontable', 100000, 19, 'IVA_19', 119000, null, false),
               ('fg2', 'p_bien', 'R6 FG2 bien no descontable 1', 100000, 19, 'IVA_19', 119000, null, false),
               ('fg2', 'p_bien', 'R6 FG2 bien no descontable 2', 50000, 19, 'IVA_19', 59500, null, false),
               ('fg3', null, 'R6 FG3 con cuenta 1', 100000, 19, 'IVA_19', 119000, '519525', false),
               ('fg3', null, 'R6 FG3 con cuenta 2', 100000, 19, 'IVA_19', 119000, '513595', false),
               ('fg3', null, 'R6 FG3 sin cuenta', 100000, 19, 'IVA_19', 119000, null, false)) x(d, p, descr, pr, t, c, tot, cta, inc);
-- FRC: la cabecera del proveedor trae 1 centavo más de IVA que la suma de sus líneas (20.728,29 → 20.728,30).
update public.invoice_purchase set subtotal = 279271.70, tax_total = 20728.30, total = 300000 where id = (select v::uuid from ctx where k = 'frc');

insert into ctx values ('adu', '{"tipo_documento":"declaracion_importacion","numero":"DI-R6","fecha":"2026-11-03","adjunto":"documentos/prueba/DI-R6.pdf","modalidad":"importacion_ordinaria","aranceles":0}');

select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;

-- ── Z · Validaciones del soporte de la importación exenta ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'Z', x.v, x.e, x.o, x.o = x.e from (values
  ('Exenta con el artículo de la exención sin citar un artículo', 'SOPORTE_ADUANERO_NORMA_INVALIDA',
   pg_temp.cla('R6 FZ3 exenta sin dato de zona franca', '{"tratamiento":"exenta","tarifa":0,"tipo_operacion":"importacion","fundamento":"Exenta","soporte_aduanero":{"norma_exencion":"Bien exento"}}')),
  ('Zona franca que no es sí ni no', 'SOPORTE_ADUANERO_INVALIDO',
   pg_temp.cla('R6 FZ3 exenta sin dato de zona franca', '{"tratamiento":"exenta","tarifa":0,"tipo_operacion":"importacion","fundamento":"Exenta","soporte_aduanero":{"zona_franca":"si"}}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'Z', 'Lo que le falta a una importación EXENTA con solo los datos aduaneros (ni la norma ni el fundamento de la exclusión)',
       '{norma_exencion,zona_franca}', x.o, x.o = '{norma_exencion,zona_franca}'
  from (select public.fn_iva_soporte_aduanero_faltantes((select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":30000}', 30000, 'exenta')::text o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'Z', 'La misma, como EXCLUIDA, pide la norma y el fundamento de la exclusión (ronda 5)', '{norma_exclusion,fundamento_exclusion}', x.o,
       x.o = '{norma_exclusion,fundamento_exclusion}'
  from (select public.fn_iva_soporte_aduanero_faltantes((select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":30000}', 30000, 'excluida')::text o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'Z', 'Clasificación de ' || x.descr, 'OK', pg_temp.cla(x.descr, x.d), pg_temp.cla(x.descr, x.d) = 'OK' from (values
  ('R6 FZ1 exenta de zona franca', jsonb_build_object('tratamiento', 'exenta', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Exenta (art. 477 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":100000,"norma_exencion":"ET art. 477","zona_franca":true}')),
  ('R6 FZ2 exenta sin zona franca', jsonb_build_object('tratamiento', 'exenta', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Exenta (art. 477 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":60000,"norma_exencion":"ET art. 477","zona_franca":false}')),
  ('R6 FZ3 exenta sin dato de zona franca', jsonb_build_object('tratamiento', 'exenta', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Exenta (art. 477 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":30000,"norma_exencion":"ET art. 477"}')),
  ('R6 FZ4 excluida de zona franca', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":20000,"norma_exclusion":"ET art. 424 num. 1","fundamento_exclusion":"Bien excluido en la importación","zona_franca":true}')),
  ('R6 FZ5 excluida sin zona franca', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":10000,"norma_exclusion":"ET art. 424 num. 1","fundamento_exclusion":"Bien excluido en la importación"}'))
) x(descr, d);

-- ── H y G · Evaluación del IVA ANTES de contabilizar ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'Clasificación de ' || x.descr, 'OK', pg_temp.cla(x.descr, x.d::jsonb), pg_temp.cla(x.descr, x.d::jsonb) = 'OK' from (values
  ('R6 FRB no descontable 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R6 FRB proporcional 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"proporcional","descontable_porcentaje":60,"descontable_motivo":"Art. 490: 60 % de ingresos gravados"}'),
  ('R6 FRB descontable 5', '{"tratamiento":"gravada","tarifa":5,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas (arts. 485 y 488)"}'),
  ('R6 FG1 bien no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R6 FG2 bien no descontable 1', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R6 FG2 bien no descontable 2', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R6 FG3 con cuenta 1', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R6 FG3 con cuenta 2', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas"}'),
  ('R6 FG3 sin cuenta', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}')
) x(descr, d);
reset role;

-- Contabilización (al recibir). FRC y FRI quedan en borrador: solo se arman.
update public.invoice_purchase set status = 'received'
 where id in (select v::uuid from ctx where k in ('frb', 'fz1', 'fz2', 'fz3', 'fz4', 'fz5', 'fg1', 'fg2', 'fg3'));
insert into ctx select 'arm_frc', public.fn_armar_asiento_documento('compra', (select v::uuid from ctx where k = 'frc'), null)::text;
insert into ctx select 'arm_frb', public.fn_armar_asiento_documento('compra', (select v::uuid from ctx where k = 'frb'), null)::text;

-- ═══ Ventas POS y sus reversas (fechas fijas) ═══
--   W1…W6 del 7 de noviembre de 2026 a las 10:00; W7 del mismo día a las 9:00; V1 del 10 de octubre (bimestre
--   septiembre–octubre, declarado); V2 del 15 de marzo (bimestre marzo–abril, declarado).
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           select 374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, x.f, x.n
             from (values ('W1', '2026-11-07 10:00-05'::timestamptz), ('W2', '2026-11-07 10:00-05'::timestamptz), ('W3', '2026-11-07 10:00-05'::timestamptz),
                          ('W4', '2026-11-07 10:00-05'::timestamptz), ('W5', '2026-11-07 10:00-05'::timestamptz), ('W6', '2026-11-07 10:00-05'::timestamptz),
                          ('W7', '2026-11-07 09:00-05'::timestamptz), ('V1', '2026-10-10 12:00-05'::timestamptz), ('V2', '2026-03-15 12:00-05'::timestamptz)) x(n, f)
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = x.k), (select v::int from ctx where k = 'p_bien'), 1, 100000, 100000, 19000, 0
  from (values ('w1'), ('w2'), ('w3'), ('w4'), ('w5'), ('w6'), ('w7'), ('v1'), ('v2')) x(k);
set constraints trg_auto_journal_sale_pos immediate;
insert into ctx select 'je_' || x.k, (select min(id) from public.journal_entries where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = x.k))::text
  from (values ('w1'), ('w2'), ('w3'), ('w4'), ('w5'), ('w6'), ('w7'), ('v1'), ('v2')) x(k);
insert into ctx select 'je_' || x.k || '_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_' || x.k), 'anulacion_pago', 'prueba-r6-' || x.k, now(), null)::text
  from (values ('w1'), ('w2'), ('w3'), ('w4'), ('w5'), ('w6'), ('w7'), ('v1'), ('v2')) x(k);

-- ═══ Asientos sin documento con líneas: pago a la DIAN, traslado entre auxiliares, cierre y un ajuste ═══
set constraints all deferred;
with e as (insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, fact_key)
           select 374, 585, now(), x.memo, true, x.src, 'prueba:r6:' || x.k
             from (values ('pg', 'Pago a la DIAN (prueba R6)', 'manual'), ('tr', 'Traslado entre auxiliares (prueba R6)', 'manual'),
                          ('ce', 'Cierre de ejercicio (prueba R6)', 'cierre_ejercicio'), ('aj', 'Ajuste (prueba R6)', 'manual')) x(k, memo, src)
           returning id, fact_key)
insert into ctx select 'je_' || replace(fact_key, 'prueba:r6:', ''), id::text from e;
insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
select (select v::int from ctx where k = 'je_' || x.k), x.cta, x.descr, x.d, x.c
  from (values ('pg', '24080501', 'Pago IVA', 5000, 0), ('pg', '14350101', 'Pago IVA (prueba)', 0, 5000),
               ('tr', '24080501', 'Traslado', 3000, 0), ('tr', '24080502', 'Traslado', 0, 3000),
               ('ce', '24080501', 'Cierre', 2000, 0), ('ce', '14350101', 'Cierre', 0, 2000),
               ('aj', '24080501', 'Ajuste', 1000, 0), ('aj', '14350101', 'Ajuste', 0, 1000)) x(k, cta, descr, d, c);
set constraints all immediate;

-- Expediente base «nunca transmitida».
insert into ctx values ('exp', '{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta de revisión de caja R6","soporte_fecha":"2026-11-09","expediente_explicacion":"Venta registrada por error en la caja; no hubo cliente, mercancía ni dinero.","factura_referencia":"Venta POS de prueba R6","estado_electronico":"nunca_transmitida","entrega_prestacion":"no_hubo","entrega_soporte":"Kárdex sin salida","cobro":"no_hubo","cobro_soporte":"Arqueo de caja sin el recaudo","doc_electronico_resolucion":"constancia","doc_electronico_referencia":"CONST-R6-1","doc_electronico_fecha":"2026-11-09","corrige_declaracion_anterior":false,"consulta_cufe_resultado":"sin_resultado","consulta_cufe_soporte":"Consulta en el catálogo de la DIAN, sin resultado"}');
insert into ctx values ('sinsop', '{"contingencia_soporte_tipo":"sin_soporte_contingencia","contingencia_nota":"Revisados: avisos de la DIAN, del proveedor tecnológico y el registro de fallas del facturador; ninguno ese día"}');
insert into ctx values ('nc', '{"doc_electronico_resolucion":"nota_credito_electronica","doc_electronico_referencia":"NC-E-R6","doc_electronico_fecha":"2026-11-09"}');
insert into ctx values ('per_nov', '{"periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31"}');

select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;

-- ── W · «Nunca transmitida» (respuestas 1 y 2) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W1: aviso de la DIAN de una falla que CUBRE la venta (8:00 a 12:00; venta a las 10:00), consulta sin resultado de hoy', 'OK',
   pg_temp.nat('je_w1_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', now(),
     'contingencia_soporte_tipo', 'aviso_dian', 'contingencia_soporte_referencia', 'AVISO-DIAN-R6', 'contingencia_soporte_fecha', '2026-11-07',
     'contingencia_inicio_en', '2026-11-07 08:00-05', 'contingencia_fin_en', '2026-11-07 12:00-05'))),
  ('W6: falla con el inicio DESPUÉS del fin', 'CONTINGENCIA_INVALIDA',
   pg_temp.nat('je_w6_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-09 11:00-05',
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-6', 'contingencia_soporte_fecha', '2026-11-06',
     'contingencia_inicio_en', '2026-11-06 09:00-05', 'contingencia_fin_en', '2026-11-06 08:00-05'))),
  ('W7: falla del mismo día de la venta pero sin su inicio', 'OK',
   pg_temp.nat('je_w7_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', now(),
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-7', 'contingencia_soporte_fecha', '2026-11-07',
     'contingencia_fin_en', '2026-11-07 17:00-05')))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W7: sin el inicio de la falla el expediente no sabe si la cubre', '{contingencia}', pg_temp.faltan('je_w7_rev')),
  ('W1: la falla cubre la venta: expedida en contingencia; le falta la nota crédito electrónica', '{nota_credito_electronica}', pg_temp.faltan('je_w1_rev'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W7: falla de 15:00 a 17:00 del día de la venta (9:00): cubre la FECHA de la venta', 'OK',
   pg_temp.nat('je_w7_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', now(),
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-7', 'contingencia_soporte_fecha', '2026-11-07',
     'contingencia_inicio_en', '2026-11-07 15:00-05', 'contingencia_fin_en', '2026-11-07 17:00-05'))),
  ('W2: constancia de que no hubo contingencia (con lo revisado) y consulta 1 hora después de la venta', 'OK',
   pg_temp.nat('je_w2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || jsonb_build_object('consulta_cufe_en', '2026-11-07 11:00-05'))),
  ('W3: constancia de que no hubo contingencia, pero la consulta es ANTERIOR a la venta', 'OK',
   pg_temp.nat('je_w3_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || jsonb_build_object('consulta_cufe_en', '2026-11-07 09:00-05'))),
  ('W4: falla del día ANTERIOR a la venta (no la cubre), con la nota de lo revisado; consulta 24 horas después de la venta', 'OK',
   pg_temp.nat('je_w4_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-08 10:00-05',
     'contingencia_soporte_tipo', 'aviso_proveedor_tecnologico', 'contingencia_soporte_referencia', 'AVISO-PT-R6-4', 'contingencia_soporte_fecha', '2026-11-06',
     'contingencia_inicio_en', '2026-11-06 08:00-05', 'contingencia_fin_en', '2026-11-06 09:00-05',
     'contingencia_nota', 'La falla del proveedor fue del 6 de noviembre; la venta es del 7'))),
  ('W5: falla que empieza el día de la venta a las 20:00 (después de la venta) y termina el día siguiente', 'OK',
   pg_temp.nat('je_w5_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-08 11:00-05',
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-5', 'contingencia_soporte_fecha', '2026-11-08',
     'contingencia_inicio_en', '2026-11-07 20:00-05', 'contingencia_fin_en', '2026-11-08 09:00-05'))),
  ('W6: falla del día anterior (no la cubre) SIN la nota de lo revisado; consulta pasadas 48 horas desde la venta', 'OK',
   pg_temp.nat('je_w6_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-09 11:00-05',
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-6', 'contingencia_soporte_fecha', '2026-11-06',
     'contingencia_inicio_en', '2026-11-06 08:00-05', 'contingencia_fin_en', '2026-11-06 09:00-05')))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W7: con el inicio, la falla cubre la fecha de la venta (día de las dos): le falta la nota crédito', '{nota_credito_electronica}', pg_temp.faltan('je_w7_rev')),
  ('W5: la falla empezó el 7 a las 20:00: cubre la FECHA de la venta aunque empezó después de ella', '{nota_credito_electronica}', pg_temp.faltan('je_w5_rev')),
  ('W2: expediente completo', '{}', pg_temp.faltan('je_w2_rev')),
  ('W4: expediente completo', '{}', pg_temp.faltan('je_w4_rev'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', 'W1: la respuesta dice «tenida por expedida en contingencia» y no «tratada como no expedida»', 'true · false',
       (x.j ->> 'tenida_por_expedida_en_contingencia') || ' · ' || (x.j ->> 'tratada_como_no_expedida'),
       (x.j ->> 'tenida_por_expedida_en_contingencia') = 'true' and (x.j ->> 'tratada_como_no_expedida') = 'false'
  from (select pg_temp.natj('je_w1_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', now(),
          'contingencia_soporte_tipo', 'aviso_dian', 'contingencia_soporte_referencia', 'AVISO-DIAN-R6', 'contingencia_soporte_fecha', '2026-11-07',
          'contingencia_inicio_en', '2026-11-07 08:00-05', 'contingencia_fin_en', '2026-11-07 12:00-05')) j) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', 'W2: la respuesta dice «tratada como no expedida» (constancia y consulta sin resultado)', 'false · true',
       (x.j ->> 'tenida_por_expedida_en_contingencia') || ' · ' || (x.j ->> 'tratada_como_no_expedida'),
       (x.j ->> 'tenida_por_expedida_en_contingencia') = 'false' and (x.j ->> 'tratada_como_no_expedida') = 'true'
  from (select pg_temp.natj('je_w2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
          || jsonb_build_object('consulta_cufe_en', '2026-11-07 11:00-05')) j) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W1: retirar la venta (expedida en contingencia, sin la nota crédito)', 'EXPEDIENTE_INCOMPLETO [nota_credito_electronica]',
   pg_temp.dec('je_w1_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}')),
  ('W1: se agrega la nota crédito electrónica', 'OK',
   pg_temp.nat('je_w1_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'nc') || jsonb_build_object('consulta_cufe_en', now(),
     'contingencia_soporte_tipo', 'aviso_dian', 'contingencia_soporte_referencia', 'AVISO-DIAN-R6', 'contingencia_soporte_fecha', '2026-11-07',
     'contingencia_inicio_en', '2026-11-07 08:00-05', 'contingencia_fin_en', '2026-11-07 12:00-05'))),
  ('W1: retirar como no expedida con la nota crédito: no (la falla cubre la venta)', 'DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO [expedida_en_contingencia]',
   pg_temp.dec('je_w1_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}')),
  ('W1: tratarla con la nota crédito en el bimestre de la nota', 'OK nota_credito',
   pg_temp.dec('je_w1_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"nota_credito","fundamento":"Expedida en contingencia: se trata con su nota crédito"}')),
  ('W2: retirar (sin falla registrada la regla de 48 horas no aplica: la consulta vale desde la venta)', 'OK retirar_venta',
   pg_temp.dec('je_w2_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió; factura no expedida"}')),
  ('W3: retirar con la consulta anterior a la venta', 'CONTINGENCIA_SIN_DESCARTAR [consulta_antes_de_la_venta]',
   pg_temp.dec('je_w3_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}')),
  ('W4: venta posterior al fin de la falla: las 48 horas corren desde la VENTA (la consulta es de 24 horas después)', 'CONTINGENCIA_SIN_DESCARTAR [plazo_48_horas]',
   pg_temp.dec('je_w4_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}')),
  ('W6: falla que no cubre la venta, sin la nota de lo revisado (no hay constancia de que no hubo contingencia)', 'CONTINGENCIA_SIN_DESCARTAR [constancia_sin_contingencia]',
   pg_temp.dec('je_w6_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}')),
  ('W4: la consulta se repite pasadas 48 horas desde la venta', 'OK',
   pg_temp.nat('je_w4_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-09 11:00-05',
     'contingencia_soporte_tipo', 'aviso_proveedor_tecnologico', 'contingencia_soporte_referencia', 'AVISO-PT-R6-4', 'contingencia_soporte_fecha', '2026-11-06',
     'contingencia_inicio_en', '2026-11-06 08:00-05', 'contingencia_fin_en', '2026-11-06 09:00-05',
     'contingencia_nota', 'La falla del proveedor fue del 6 de noviembre; la venta es del 7'))),
  ('W4: ahora sí se retira', 'OK retirar_venta',
   pg_temp.dec('je_w4_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió; contingencia descartada"}'))
) x(v, e, o);
-- W3, segunda parte: las 48 horas desde el FIN de la falla cuando la venta es anterior. Falla del 8 de noviembre de 8:00 a
-- 9:00 (no cubre la venta del 7): la consulta del 9 a las 11:00 es posterior a 48 horas desde la venta, pero no desde el
-- fin de la falla.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, x.o, x.o = x.e from (values
  ('W3: se reemplaza por una falla del 8 de noviembre (8:00 a 9:00), con la nota, y la consulta del 9 a las 11:00', 'OK',
   pg_temp.nat('je_w3_rev', (select v::jsonb from ctx where k = 'exp') || jsonb_build_object('consulta_cufe_en', '2026-11-09 11:00-05',
     'contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'FALLA-R6-3', 'contingencia_soporte_fecha', '2026-11-08',
     'contingencia_inicio_en', '2026-11-08 08:00-05', 'contingencia_fin_en', '2026-11-08 09:00-05',
     'contingencia_nota', 'La falla del facturador fue del 8 de noviembre; la venta es del 7'))),
  ('W3: venta anterior al fin de la falla: las 48 horas corren desde el FIN de la falla', 'CONTINGENCIA_SIN_DESCARTAR [plazo_48_horas]',
   pg_temp.dec('je_w3_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió"}'))
) x(v, e, o);

-- ── E · Segundo usuario (respuesta 8): A registra; A no puede aprobar lo suyo ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', x.v, x.e, x.o, x.o = x.e from (values
  ('A registra el pago a la DIAN', 'OK', pg_temp.nat('je_pg', '{"naturaleza":"pago_dian","soporte_tipo":"recibo_pago_dian","soporte":"Recibo 490 R6","soporte_fecha":"2026-11-09"}')),
  ('A registra el traslado entre auxiliares', 'OK', pg_temp.nat('je_tr', '{"naturaleza":"traslado_auxiliares","soporte_tipo":"comprobante_interno","soporte":"Comprobante de traslado R6","soporte_fecha":"2026-11-09"}')),
  ('A registra el cierre', 'OK', pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R6","soporte_fecha":"2026-11-09","nota":"Traslado de saldos por el cierre; no crea IVA generado ni descontable"}')),
  ('A registra un ajuste procedente', 'OK', pg_temp.nat('je_aj', '{"naturaleza":"ajuste_procedente","soporte_tipo":"comprobante_interno","soporte":"Soporte del ajuste R6","soporte_fecha":"2026-11-09"}')),
  ('A aprueba su propio traslado', 'APROBACION_MISMO_USUARIO', pg_temp.apr('je_tr', true)),
  ('A aprueba el retiro de W2, que él registró y decidió', 'APROBACION_MISMO_USUARIO', pg_temp.apr('je_w2_rev', true))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'La respuesta de guardar el traslado pide la aprobación', 'true',
       (pg_temp.natj('je_tr', '{"naturaleza":"traslado_auxiliares","soporte_tipo":"comprobante_interno","soporte":"Comprobante de traslado R6","soporte_fecha":"2026-11-09"}') ->> 'aprobacion_requerida'),
       (pg_temp.natj('je_tr', '{"naturaleza":"traslado_auxiliares","soporte_tipo":"comprobante_interno","soporte":"Comprobante de traslado R6","soporte_fecha":"2026-11-09"}') ->> 'aprobacion_requerida') = 'true';

-- ── V · Períodos declarados: art. 589 (solicitud ante la DIAN) y referencia del art. 714 ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'V', x.v, x.e, x.o, x.o = x.e from (values
  ('V1 (octubre): expediente completo con constancia, marcando la corrección de la declaración', 'OK',
   pg_temp.nat('je_v1_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || jsonb_build_object('consulta_cufe_en', now(), 'corrige_declaracion_anterior', true))),
  ('V2 (marzo): expediente completo con constancia, marcando la corrección de la declaración', 'OK',
   pg_temp.nat('je_v2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || jsonb_build_object('consulta_cufe_en', now(), 'corrige_declaracion_anterior', true))),
  ('Septiembre–octubre declarado, con vencimiento (12-11-2026) y no en firme (datos de prueba)', 'OK',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","vencimiento_plazo":"2026-11-12","en_firme":false,"firmeza_nota":"Dato de prueba"}')),
  ('V1: retirar sin la solicitud de corrección ante la DIAN registrada', 'CORRECCION_DIAN_SIN_REGISTRO',
   pg_temp.dec('je_v1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; se corrige la declaración"}')),
  ('Solicitud sin el soporte', 'CORRECCION_DIAN_INVALIDA',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"en_tramite"}}')),
  ('Solicitud con un resultado que no existe', 'CORRECCION_DIAN_INVALIDA',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"archivada","resultado_fecha":"2026-11-09","soporte":"Radicado"}}')),
  ('Solicitud anterior a la presentación de la declaración', 'CORRECCION_DIAN_FECHA_INVALIDA',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-01","resultado":"en_tramite","soporte":"Radicado"}}')),
  ('Solicitud presentada, EN TRÁMITE', 'OK',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"en_tramite","soporte":"Radicado de la solicitud (dato de prueba)"}}')),
  ('V1: retirar con la solicitud en trámite', 'CORRECCION_DIAN_SIN_RESULTADO',
   pg_temp.dec('je_v1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; se corrige la declaración"}')),
  ('La DIAN la RECHAZA', 'OK',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"rechazada","resultado_fecha":"2026-11-09","soporte":"Auto de rechazo (dato de prueba)"}}')),
  ('V1: retirar con la solicitud rechazada', 'CORRECCION_DIAN_RECHAZADA',
   pg_temp.dec('je_v1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; se corrige la declaración"}')),
  ('La DIAN la ACEPTA (liquidación oficial de corrección)', 'OK',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"aceptada","resultado_fecha":"2026-11-09","soporte":"Liquidación oficial de corrección (dato de prueba)"}}')),
  ('V1: retirar con la solicitud aceptada', 'OK retirar_venta',
   pg_temp.dec('je_v1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; la DIAN aceptó la corrección"}')),
  ('Marzo–abril declarado (vence 12-05-2026), solicitud del 9 de mayo con «vencido el término» registrado el 1 de agosto (no van seis meses)', 'CORRECCION_DIAN_TERMINO_NO_VENCIDO',
   pg_temp.decl('2026-03-01', '2026-04-30', '{"numero_formulario":"PRUEBA-300-R6-MA","presentada_en":"2026-05-08","vencimiento_plazo":"2026-05-12","en_firme":false,"firmeza_nota":"Dato de prueba","correccion_dian":{"numero":"SOL-R6-2","fecha":"2026-05-09","resultado":"vencido_termino","resultado_fecha":"2026-08-01","soporte":"Radicado (dato de prueba)"}}')),
  ('Marzo–abril con «vencido el término» registrado el 9 de noviembre (seis meses después de la solicitud)', 'OK',
   pg_temp.decl('2026-03-01', '2026-04-30', '{"numero_formulario":"PRUEBA-300-R6-MA","presentada_en":"2026-05-08","vencimiento_plazo":"2026-05-12","en_firme":false,"firmeza_nota":"Dato de prueba","correccion_dian":{"numero":"SOL-R6-2","fecha":"2026-05-09","resultado":"vencido_termino","resultado_fecha":"2026-11-09","soporte":"Constancia de que la DIAN no se pronunció (dato de prueba)"}}')),
  ('V2: retirar con «vencido el término» (el proyecto de corrección sustituyó la declaración)', 'OK retirar_venta',
   pg_temp.dec('je_v2_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-03-01","periodo_hasta":"2026-04-30","fundamento":"La operación no existió; la corrección quedó en firme por silencio de la DIAN"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'V', x.v, x.e, x.o, x.o = x.e from (values
  ('Referencia del art. 714 ET: tres años desde el vencimiento (12-11-2026)', '2029-11-12 · Referencia: término general del art. 714 ET (tres años). No decide la firmeza: hay términos especiales.',
   (select (j ->> 'firmeza_referencia_714') || ' · ' || (j ->> 'firmeza_referencia_nota')
      from (select pg_temp.declj('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05"}') j) y)),
  ('Declaración extemporánea (vence 14-07, presentada 20-07): la referencia cuenta desde la presentación', '2029-07-20',
   (select j ->> 'firmeza_referencia_714'
      from (select pg_temp.declj('2026-05-01', '2026-06-30', '{"numero_formulario":"PRUEBA-300-R6-MJ","presentada_en":"2026-07-20","vencimiento_plazo":"2026-07-14"}') j) y)),
  ('La referencia no cambia la firmeza registrada (sigue «no en firme»)', 'false',
   (select coalesce(d.en_firme::text, 'NULL') from public.tributario_iva_declaraciones d where d.organization_id = 374 and d.desde = '2026-09-01'))
) x(v, e, o);

-- Borrador de noviembre ANTES de la aprobación del segundo usuario.
insert into ctx values ('bn1', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
insert into ctx values ('bso1', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);
reset role;

-- ── E · B (segundo usuario) ──
select set_config('request.jwt.claims', (select v from ctx where k = 'ub'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', x.v, x.e, x.o, x.o = x.e from (values
  ('B aprueba el pago a la DIAN', 'aprobado', pg_temp.apr('je_pg', true)),
  ('B aprueba el traslado entre auxiliares', 'aprobado', pg_temp.apr('je_tr', true)),
  ('B aprueba el cierre', 'aprobado', pg_temp.apr('je_ce', true)),
  ('B intenta aprobar el ajuste procedente (no se propone «no afecta»)', 'APROBACION_NO_REQUERIDA', pg_temp.apr('je_aj', true)),
  ('B intenta aprobar W1, tratada por nota crédito (no se propone «no afecta»)', 'APROBACION_NO_REQUERIDA', pg_temp.apr('je_w1_rev', true)),
  ('B intenta aprobar W6, sin decisión', 'APROBACION_NO_REQUERIDA', pg_temp.apr('je_w6_rev', true)),
  ('B decide otra vez el retiro de W2 (ahora B es quien decidió)', 'OK retirar_venta',
   pg_temp.dec('je_w2_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió; factura no expedida"}')),
  ('B aprueba el retiro que él mismo decidió', 'APROBACION_MISMO_USUARIO', pg_temp.apr('je_w2_rev', true)),
  ('B aprueba el retiro de W4', 'aprobado', pg_temp.apr('je_w4_rev', true)),
  ('B aprueba el retiro de V1 (septiembre–octubre)', 'aprobado', pg_temp.apr('je_v1_rev', true)),
  ('B aprueba el retiro de V2 (marzo–abril)', 'aprobado', pg_temp.apr('je_v2_rev', true))
) x(v, e, o);
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'A decide otra vez el retiro de W2', 'OK retirar_venta', x.o, x.o = 'OK retirar_venta'
  from (select pg_temp.dec('je_w2_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió; factura no expedida"}') o) x;
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ub'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'B aprueba el retiro de W2 (lo registró y lo decidió A)', 'aprobado', x.o, x.o = 'aprobado' from (select pg_temp.apr('je_w2_rev', true) o) x;
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;
insert into ctx select 'w2_redecidido', pg_temp.dec('je_w2_rev', (select v::jsonb from ctx where k = 'per_nov') || '{"tratamiento":"retirar_venta","fundamento":"La operación no existió; factura no expedida (revisado)"}');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'Decidir otra vez borra la aprobación', 'OK retirar_venta · sin aprobar', x.v || ' · ' || pg_temp.aprobado('je_w2_rev'),
       x.v || ' · ' || pg_temp.aprobado('je_w2_rev') = 'OK retirar_venta · sin aprobar'
  from ctx x where x.k = 'w2_redecidido';
insert into ctx values ('bn_w2', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ub'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'B aprueba otra vez el retiro de W2', 'aprobado', x.o, x.o = 'aprobado' from (select pg_temp.apr('je_w2_rev', true) o) x;
reset role;

-- Borradores después de las aprobaciones.
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;
insert into ctx values ('bn2', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
insert into ctx values ('bso2', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);
insert into ctx values ('bma2', public.fn_tributario_borrador_iva_300(374, '2026-03-01', '2026-04-30')::text);
-- La DIAN rechaza después la corrección de septiembre–octubre (se registra): la venta vuelve (se revisa al calcular).
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'V', 'Después del retiro se registra que la DIAN rechazó la corrección de septiembre–octubre', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R6-SO","presentada_en":"2026-11-05","correccion_dian":{"numero":"SOL-R6-1","fecha":"2026-11-06","resultado":"rechazada","resultado_fecha":"2026-11-09","soporte":"Revocatoria (dato de prueba)"}}') o) x;
insert into ctx values ('bn3', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
insert into ctx values ('bso3', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);
reset role;

-- ═══ Lectura de los borradores ═══
create temp view casilla as
select b.k as borrador, (c ->> 'casilla')::int as casilla, (c ->> 'valor')::numeric as valor, c
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'casillas') c where b.k in ('bn1', 'bn2', 'bn3', 'bn_w2', 'bso1', 'bso2', 'bso3', 'bma2');
create temp view casilla_59 as
select b.k as borrador, x ->> 'documento_id' as documento_id
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'casillas') c, jsonb_array_elements(c -> 'origenes') x
 where b.k in ('bn1', 'bn2', 'bn3', 'bn_w2', 'bso1', 'bso2', 'bso3', 'bma2') and (c ->> 'casilla')::int = 59;
create temp view otros as
select b.k as borrador, (o ->> 'asiento')::int as asiento, o
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'otros_movimientos') o where b.k in ('bn1', 'bn2', 'bn3', 'bn_w2', 'bso1', 'bso2', 'bso3', 'bma2');
create temp view pend as
select b.k as borrador, p ->> 'motivo' as motivo, x ->> 'documento_id' as documento_id, (x ->> 'base')::numeric as base
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'pendientes') p, jsonb_array_elements(p -> 'origenes') x
 where b.k in ('bn1', 'bn2', 'bn3', 'bn_w2', 'bso1', 'bso2', 'bso3', 'bma2');
create function pg_temp.estado(p_b text, p_venta text) returns text language sql as $$
  select case when exists (select 1 from casilla_59 c where c.borrador = p_b and c.documento_id = (select v from ctx where k = p_venta)) then 'en 59' else 'no en 59' end
         || ' · ' || coalesce((select coalesce(o ->> 'motivo', o ->> 'destino') from otros where borrador = p_b and asiento = (select v::int from ctx where k = 'je_' || p_venta || '_rev')), 'SIN REVERSA') $$;
create function pg_temp.otro(p_b text, p_k text) returns text language sql as $$
  select (o ->> 'destino') || ' · ' || coalesce(o ->> 'motivo', '—') || ' · aprobado ' || coalesce(o ->> 'aprobado', 'NULL')
    from otros where borrador = p_b and asiento = (select v::int from ctx where k = p_k) $$;

-- ── W en el borrador de noviembre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'W', x.v, x.e, coalesce(x.o, 'NO ESTÁ'), x.o = x.e from (values
  ('W1 tratada por nota crédito: la venta se queda; la reversa pendiente', 'en 59 · correccion_por_nota_credito', pg_temp.estado('bn2', 'w1')),
  ('W1: el detalle dice «tenida por expedida en contingencia»', 'true',
   (select o -> 'correccion' ->> 'tenida_por_expedida_en_contingencia' from otros where borrador = 'bn2' and asiento = (select v::int from ctx where k = 'je_w1_rev'))),
  ('W2 retirada y aprobada: sale de la 59', 'no en 59 · no_afecta', pg_temp.estado('bn2', 'w2')),
  ('W2: el detalle dice «tratada como no expedida» y aprobada', 'true · true',
   (select (o -> 'correccion' ->> 'tratada_como_no_expedida') || ' · ' || (o -> 'correccion' ->> 'aprobado') from otros where borrador = 'bn2' and asiento = (select v::int from ctx where k = 'je_w2_rev'))),
  ('W2 retirada ANTES de la aprobación: la venta se queda; la reversa pendiente', 'en 59 · correccion_sin_aprobacion', pg_temp.estado('bn1', 'w2')),
  ('W2 decidida otra vez (aprobación borrada): pendiente de nuevo', 'en 59 · correccion_sin_aprobacion', pg_temp.estado('bn_w2', 'w2')),
  ('W3 (48 horas desde el fin de la falla, sin decisión): sigue en la 59', 'en 59 · correccion_sin_decision', pg_temp.estado('bn2', 'w3')),
  ('W4 retirada y aprobada: sale de la 59', 'no en 59 · no_afecta', pg_temp.estado('bn2', 'w4')),
  ('W7 (la falla cubre la fecha): expediente incompleto (nota crédito), sigue en la 59', 'en 59 · correccion_incompleta', pg_temp.estado('bn2', 'w7'))
) x(v, e, o);

-- ── E en el borrador de noviembre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', x.v, x.e, coalesce(x.o, 'NO ESTÁ'), x.o = x.e from (values
  ('Pago a la DIAN registrado, sin aprobar: pendiente', 'pendiente · no_afecta_sin_aprobacion · aprobado false', pg_temp.otro('bn1', 'je_pg')),
  ('Traslado registrado, sin aprobar: pendiente', 'pendiente · no_afecta_sin_aprobacion · aprobado false', pg_temp.otro('bn1', 'je_tr')),
  ('Cierre registrado, sin aprobar: pendiente', 'pendiente · cierre_sin_aprobacion · aprobado false', pg_temp.otro('bn1', 'je_ce')),
  ('Pago a la DIAN aprobado por B: no afecta', 'no_afecta · — · aprobado true', pg_temp.otro('bn2', 'je_pg')),
  ('Traslado aprobado por B: no afecta', 'no_afecta · — · aprobado true', pg_temp.otro('bn2', 'je_tr')),
  ('Cierre aprobado por B: no afecta', 'no_afecta · — · aprobado true', pg_temp.otro('bn2', 'je_ce')),
  ('Ajuste procedente: por diligenciar, sin aprobación', 'por_diligenciar · — · aprobado NULL', pg_temp.otro('bn2', 'je_aj'))
) x(v, e, o);

-- ── V en los borradores ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'V', x.v, x.e, coalesce(x.o, 'NO ESTÁ'), x.o = x.e from (values
  ('Septiembre–octubre, retiro de V1 sin aprobar: V1 sigue en la 59', 'en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bso1' and c.documento_id = (select v from ctx where k = 'v1')) then 'en 59' else 'no en 59' end),
  ('Septiembre–octubre, corrección aceptada y retiro aprobado: V1 sale de la 59', 'no en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bso2' and c.documento_id = (select v from ctx where k = 'v1')) then 'en 59' else 'no en 59' end),
  ('Marzo–abril, «vencido el término» y retiro aprobado: V2 sale de la 59', 'no en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bma2' and c.documento_id = (select v from ctx where k = 'v2')) then 'en 59' else 'no en 59' end),
  ('Septiembre–octubre, la DIAN rechazó la corrección después: V1 vuelve a la 59', 'en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bso3' and c.documento_id = (select v from ctx where k = 'v1')) then 'en 59' else 'no en 59' end),
  ('Noviembre: la reversa de V1, con la corrección rechazada, queda pendiente', 'pendiente · correccion_dian_sin_efecto',
   (select (o ->> 'destino') || ' · ' || coalesce(o ->> 'motivo', '—') from otros where borrador = 'bn3' and asiento = (select v::int from ctx where k = 'je_v1_rev'))),
  ('Noviembre: la alerta trae la referencia del art. 714 y la solicitud ante la DIAN (aceptada)', '2029-11-12 · aceptada · SOL-R6-1',
   (select (a -> 'periodo_declarado' ->> 'firmeza_referencia_714') || ' · ' || (a -> 'periodo_declarado' -> 'correccion_dian' ->> 'resultado')
           || ' · ' || (a -> 'periodo_declarado' -> 'correccion_dian' ->> 'numero')
      from ctx b, jsonb_array_elements(b.v::jsonb -> 'alertas' -> 'correcciones_declaracion_anterior') a
     where b.k = 'bn2' and (a ->> 'asiento')::int = (select v::int from ctx where k = 'je_v1_rev'))),
  ('Noviembre, después del rechazo: la alerta lo muestra', 'rechazada · correccion_dian_pendiente true',
   (select (a -> 'periodo_declarado' -> 'correccion_dian' ->> 'resultado') || ' · correccion_dian_pendiente ' || (a ->> 'correccion_dian_pendiente')
      from ctx b, jsonb_array_elements(b.v::jsonb -> 'alertas' -> 'correcciones_declaracion_anterior') a
     where b.k = 'bn3' and (a ->> 'asiento')::int = (select v::int from ctx where k = 'je_v1_rev')))
) x(v, e, o);

-- ── Z en el borrador de noviembre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'Z', x.v, x.e, coalesce(x.o, 'NO ESTÁ'), x.o = x.e from (values
  ('Casilla 48 = FZ1, exenta de zona franca', '100000', (select round(valor)::text from casilla where borrador = 'bn2' and casilla = 48)),
  ('Casilla 48 en el catálogo del borrador', 'base · importaciones_zona_franca_no_gravadas · descontable',
   (select (c ->> 'tipo') || ' · ' || (c ->> 'concepto') || ' · ' || (c ->> 'lado') from casilla where borrador = 'bn2' and casilla = 48)),
  ('Casilla 47 = FZ2 exenta sin zona franca 60.000 + FZ5 excluida 10.000', '70000', (select round(valor)::text from casilla where borrador = 'bn2' and casilla = 47)),
  ('FZ3, exenta sin el dato de zona franca: pendiente', 'importacion_sin_soporte_aduanero · base 30000',
   (select p.motivo || ' · base ' || round(p.base) from pend p where p.borrador = 'bn2' and p.documento_id = (select v from ctx where k = 'fz3') limit 1)),
  ('FZ4, excluida de zona franca: pendiente (por confirmar con el Contador)', 'importacion_zona_franca_excluida_por_confirmar · base 20000',
   (select p.motivo || ' · base ' || round(p.base) from pend p where p.borrador = 'bn2' and p.documento_id = (select v from ctx where k = 'fz4') limit 1)),
  ('Ninguna importación va a la 54 (compras nacionales)', '0',
   (select count(*)::text from casilla k, jsonb_array_elements(k.c -> 'origenes') o
     where k.borrador = 'bn2' and k.casilla = 54 and o ->> 'documento_id' in (select v from ctx where k like 'fz%'))),
  ('Versión del borrador', '7', (select v::jsonb ->> 'version' from ctx where k = 'bn2'))
) x(v, e, o);

-- ── G · Cuenta por línea (respuesta 5) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'G', x.v, x.e, y.o, y.o = x.e from (values
  ('FG1: UNA línea no descontable con cuenta de cabecera: se contabiliza, el IVA va al costo', 'CON ASIENTO · 2408 0 · D 119000', 'fg1'),
  ('FG2: DOS líneas no descontables con cuenta de cabecera: pendiente de corregir', 'SIN ASIENTO · iva_no_descontable_por_corregir · más de una línea', 'fg2'),
  ('FG3: tres líneas, una sin cuenta propia: el asiento por líneas no se publica', 'SIN ASIENTO · cuenta_linea · cada línea debe tener su propia cuenta', 'fg3')
) x(v, e, k)
cross join lateral (select case
    when exists (select 1 from public.journal_entries je where je.organization_id = 374 and je.source_id = (select v from ctx where k = x.k))
      then 'CON ASIENTO · 2408 ' || coalesce((select round(sum(l.debit))::text from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
                                               where je.organization_id = 374 and je.source_id = (select v from ctx where k = x.k) and l.account_code like '2408%'), '0')
           || ' · D ' || (select round(sum(l.debit))::text from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
                           where je.organization_id = 374 and je.source_id = (select v from ctx where k = x.k) and l.account_code not like '2408%')
    else 'SIN ASIENTO · ' || coalesce((select max(f.reason) from public.journal_entry_failures f
                                        where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo') and f.source_id = (select v from ctx where k = x.k)), 'SIN PENDIENTE')
         || ' · ' || coalesce((select case when bool_or(f.detail like '%más de una línea%' and f.detail not like '%cada línea debe tener%') then 'más de una línea'
                                           when bool_or(f.detail like '%cada línea debe tener su propia cuenta%') then 'cada línea debe tener su propia cuenta'
                                           else 'otro motivo' end
                                 from public.journal_entry_failures f
                                where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo') and f.source_id = (select v from ctx where k = x.k)), 'SIN DETALLE')
  end as o) y;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'G', 'FG2 con una cabecera de activo fijo (152405): tampoco basta (más de una línea)', 'IVA no descontable en una compra de más de una línea',
       left(coalesce(public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fg2'), '152405'), 'NULL'), 52),
       left(coalesce(public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fg2'), '152405'), 'NULL'), 52) = 'IVA no descontable en una compra de más de una línea';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'G', 'FG1 (una línea) con la cabecera de inventarios (14350101): cuenta única', 'NULL',
       coalesce(public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fg1'), '14350101'), 'NULL'),
       public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fg1'), '14350101') is null;

-- ── H · Reparto de la base (hallazgo de la ronda 6) ──
create temp view lineas_frb as
select l.account_code as cuenta, round(sum(l.debit)) as d, round(sum(l.credit)) as c
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.source_id = (select v from ctx where k = 'frb')
 group by l.account_code;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRB publicado (el ejemplo del Contador): la base se reparte por la base antes de IVA', '14350101 D 100000 · 513595 D 215200 · 519525 D 119000 · C 462000',
       string_agg(cuenta || ' D ' || d, ' · ' order by cuenta) filter (where cuenta in ('14350101', '513595', '519525')) || ' · C ' || sum(c),
       string_agg(cuenta || ' D ' || d, ' · ' order by cuenta) filter (where cuenta in ('14350101', '513595', '519525')) || ' · C ' || sum(c)
         = '14350101 D 100000 · 513595 D 215200 · 519525 D 119000 · C 462000'
  from lineas_frb;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRB: la 2408 descontable y el IVA no descontable no cambian', '24081001 D 22800 + 24081002 D 5000',
       coalesce(string_agg(cuenta || ' D ' || d, ' + ' order by cuenta) filter (where cuenta like '2408%'), 'SIN 2408'),
       coalesce(string_agg(cuenta || ' D ' || d, ' + ' order by cuenta) filter (where cuenta like '2408%'), '') = '24081001 D 22800 + 24081002 D 5000'
  from lineas_frb;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRB armado (centavos): Σ de las cuentas de las líneas − IVA no descontable (34.200) = base del documento', '400000.00',
       (sum((l ->> 'debito')::numeric) - 34200)::text, sum((l ->> 'debito')::numeric) - 34200 = 400000
  from jsonb_array_elements((select v::jsonb -> 'lineas' from ctx where k = 'arm_frb')) l
 where l ->> 'cuenta' in ('14350101', '513595', '519525');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRC: peso de cada línea con el IVA incluido = su base (84.033,61 · 95.238,10 · 100.000)', 'R6 FRC exenta 100000.00 · R6 FRC incluido 19 84033.61 · R6 FRC incluido 5 95238.10',
       string_agg(ii.description || ' ' || public.fn_asiento_peso_reparto_linea(ii, false, true), ' · ' order by ii.description),
       string_agg(ii.description || ' ' || public.fn_asiento_peso_reparto_linea(ii, false, true), ' · ' order by ii.description)
         = 'R6 FRC exenta 100000.00 · R6 FRC incluido 19 84033.61 · R6 FRC incluido 5 95238.10'
  from public.invoice_items ii where ii.invoice_purchase_id = (select v::uuid from ctx where k = 'frc');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRC armado: la suma de las cuentas de las líneas es EXACTAMENTE la base del documento (300.000 − 20.728,30)', 'ok · 279271.70',
       (x.j ->> 'ok') || ' · ' || (select sum((l ->> 'debito')::numeric) from jsonb_array_elements(x.j -> 'lineas') l where l ->> 'descripcion' like 'R6 FRC%'),
       (x.j ->> 'ok') = 'true' and (select sum((l ->> 'debito')::numeric) from jsonb_array_elements(x.j -> 'lineas') l where l ->> 'descripcion' like 'R6 FRC%') = 279271.70
  from (select v::jsonb j from ctx where k = 'arm_frc') x;
-- Los centavos: cada línea, salvo la última del asiento (orden created_at, id), recibe round(neto × peso / Σ pesos, 2); la
-- última recibe lo que falta. Aquí Σ pesos = 279.271,71 y el neto 279.271,70: la última absorbe −0,01.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'FRC: el ajuste de centavos va a la ÚLTIMA línea del asiento; las demás llevan su parte redondeada', 'demás exactas · última −0.01',
       case when bool_and(a.monto = round(279271.70 * a.p / a.sp, 2)) filter (where a.o < a.n) then 'demás exactas' else 'demás distintas' end
         || ' · última ' || replace(to_char(max(a.monto - round(279271.70 * a.p / a.sp, 2)) filter (where a.o = a.n), 'FM990.00'), '-', '−'),
       bool_and(a.monto = round(279271.70 * a.p / a.sp, 2)) filter (where a.o < a.n)
         and max(a.monto - round(279271.70 * a.p / a.sp, 2)) filter (where a.o = a.n) = -0.01
  from (select l.description, l.o, l.n, l.p, sum(l.p) over () as sp,
               (select (x ->> 'debito')::numeric from jsonb_array_elements((select v::jsonb -> 'lineas' from ctx where k = 'arm_frc')) x
                 where x ->> 'descripcion' = l.description) as monto
          from (select ii.description, row_number() over (order by ii.created_at, ii.id) as o, count(*) over () as n,
                       public.fn_asiento_peso_reparto_linea(ii, false, true) as p
                  from public.invoice_items ii where ii.invoice_purchase_id = (select v::uuid from ctx where k = 'frc')) l) a;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'Peso con el impuesto dentro del neto (documento sin impuesto separado): base × (1 + tarifa)', '100000.00',
       public.fn_asiento_peso_reparto_linea(ii, true, true)::text, public.fn_asiento_peso_reparto_linea(ii, true, true) = 100000
  from public.invoice_items ii where ii.description = 'R6 FRC incluido 19' and ii.invoice_purchase_id = (select v::uuid from ctx where k = 'frc');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'H', 'Peso de una línea con INC del 8 %: en compras lleva su INC (va al costo); en ventas no', 'compra 108000.00 · venta 100000.00',
       'compra ' || public.fn_asiento_peso_reparto_linea(ii, false, true) || ' · venta ' || public.fn_asiento_peso_reparto_linea(ii, false, false),
       public.fn_asiento_peso_reparto_linea(ii, false, true) = 108000 and public.fn_asiento_peso_reparto_linea(ii, false, false) = 100000
  from public.invoice_items ii where ii.invoice_purchase_id = (select v::uuid from ctx where k = 'fri');

-- ── anon ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'anon: aprobar un traslado', 'permission denied…', left(x.o, 40), x.o like 'permission denied%'
  from (select pg_temp.apr('je_tr', true) o) x;
reset role;

-- ── Cuadre de todos los asientos nuevos e históricos intactos ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'cuadre', 'Asientos nuevos cuadrados (Σ D = Σ C)', 'todos', case when bool_and(d = c) then 'todos' else 'alguno no cuadra' end, bool_and(d = c)
  from (select je.id, sum(l.debit) d, sum(l.credit) c from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
         where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je') group by je.id) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'historicos', 'Asientos anteriores a la prueba intactos (ninguna línea nueva en asientos viejos)', '0', count(*)::text, count(*) = 0
  from public.journal_lines l join public.journal_entries je on je.id = l.journal_entry_id
 where je.organization_id = 374 and je.id <= (select v::int from ctx where k = 'max_je') and l.created_at >= now();

select n, escenario, verificacion, esperado, obtenido, ok from r order by n;

rollback;
