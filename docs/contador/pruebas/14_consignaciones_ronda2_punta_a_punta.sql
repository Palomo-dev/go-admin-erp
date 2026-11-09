-- Pruebas en seco 14 · Consignación en dos sentidos, «Ronda 2 del Contador», de punta a punta, REEJECUTADA el 2026-11-09
-- con los archivos EXACTOS actuales (ronda 4). Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585): antes corría
-- en las organizaciones 137 y 138; la parte «entre organizaciones» (I1–I6) exige una segunda organización y NO se
-- ejecuta; 20261108120500 (vínculos) no cambió. Lo que cambió por criterio ya aceptado en las rondas 3 y 4 (se anota en el
-- resultado): «al liquidar» ya no existe (la nota 2 devenga al cumplirse una obligación posterior documentada); la
-- liquidación no registra remuneración (no hay contra-asiento al anularla); compensación pactada y cuenta por cobrar
-- al dueño obligatorias; los pendientes de impuestos «por determinar» de la ronda 2 son ahora retenciones por ámbito.
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- Resultado: 14_consignaciones_ronda2_punta_a_punta.resultado.txt

begin;

-- ════ AYUDAS (solo esta sesión) ════════════════════════════════════════════════════════════════════════════
create temp table r (n serial primary key, prueba text default current_setting('dry.prueba', true), caso text, verificacion text, esperado text,
                     obtenido text, ok boolean);
create temp table bitacora (n serial primary key, prueba text default current_setting('dry.prueba', true), linea text);
grant all on r, bitacora to authenticated;
grant usage on sequence r_n_seq, bitacora_n_seq to authenticated;
create function pg_temp.log(m text) returns void language sql as $$ insert into bitacora (linea) values (m) $$;
create function pg_temp.chk(caso text, esperado text, obtenido text) returns void language sql as $$
  insert into r (caso, verificacion, esperado, obtenido, ok) values (split_part(caso, ' ', 1), caso, esperado, obtenido, coalesce(obtenido = esperado, false))
$$;
-- Ejecuta q y espera un error cuyo mensaje empiece por «esperado».
create function pg_temp.err(caso text, esperado text, q text) returns void language plpgsql as $$
begin
  execute q;
  perform pg_temp.chk(caso, esperado, 'sin error');
exception when others then
  perform pg_temp.chk(caso, esperado, case when sqlerrm like esperado || '%' then esperado else sqlerrm end);
end $$;
create function pg_temp.mover(o integer, b integer, p integer, d text, q numeric, s text, sid text default null) returns jsonb language plpgsql
  security definer set search_path = public, pg_temp as $$
begin
  return public.fn_inv_int_mover(o, b, p, null, d, q, case when d = 'in' then 0 end, s, coalesce(sid, gen_random_uuid()::text), 'prueba en seco', auth.uid(), '{}'::jsonb);
end $$;
-- Retenciones de una liquidación que NO son «no aplica»: ámbito.clase.grupo=estado[:valor].
create function pg_temp.ret(liq uuid) returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return (select string_agg(w.scope || '.' || w.class || '.' || w.payer_group || '=' || w.status || coalesce(':' || coalesce(w.practiced_amount, w.amount)::text, ''),
                            ', ' order by w.scope, w.class, w.payer_group)
            from public.consignment_settlement_withholdings w where w.settlement_id = liq and w.status <> 'no_aplica');
end $$;
grant execute on function pg_temp.log(text), pg_temp.chk(text, text, text), pg_temp.err(text, text, text) to authenticated;
grant execute on function pg_temp.mover(integer, integer, integer, text, numeric, text, text), pg_temp.ret(uuid) to authenticated;

-- ════ CARGA: las migraciones SIN APLICAR, COMPLETAS y EXACTAS, en orden de versión ════════════════════════════
-- Cada archivo se subió antes, por trozos, a objetos grandes de Postgres (cada trozo verificado por md5 contra el archivo
-- local). Aquí se ubican por el md5 de cada trozo, se concatenan, se comprueba el md5 del archivo COMPLETO contra el del
-- repositorio y se ejecuta tal cual. Nada queda escrito: la corrida termina con una excepción (= rollback).
select set_config('dry.prueba', 'carga', true);
create temp table carga (n int, archivo text, md5 text, partes text[]);
insert into carga values
  (1, '20261108120500_organization_links', '6a5a3ead2fe311fdde4b7d5c0376c12b', array['5a3ad4f516169849e63ea85a06d6409d', '9663bf553ed7663c7dddd1bb69f7b066']),
  (2, '20261108121000_consignaciones', 'd2a58b49b6016488ba3287a48511d4d5', array['01d40736f59b0326331a5c87b5c9aaaf', '43d4449c092a8d952dbfc7baa691382c', '0b6ff32c6c2ac6700ffc185b653bf99b', '19c810fa6720bed9fbcd0946720e7db3', '01c2f9b75c3a609226b6bdee5c0bb7a7', '7e71e8c4e1bff5daf3784ae3c833ff37', '6be2815156fc03f855f47989b13aa5e8', '659a3939293d6235d15a78f8ca995413']),
  (3, '20261108140500_responsabilidades_fiscales_en', '4b00bf10bf99ff2a97e2e89ff0480811', array['4b00bf10bf99ff2a97e2e89ff0480811']),
  (4, '20261108160000_tributario_catalogo_rut_y_codigos_fe', '85fd17321a7e85d85a58916cb2f84c95', array['85fd17321a7e85d85a58916cb2f84c95']),
  (5, '20261108160500_tributario_perfil_renta_iva', 'c83b8a50b6342e65ee5bf3f993847b79', array['16de3178aa8a2cc01d9b2ed4be288c78', '282e5b104a758b88936d2a684742eed0']),
  (6, '20261108165000_tarifas_precision_exacta', '28e47f6353ee4102463b7b63dca057be', array['28e47f6353ee4102463b7b63dca057be']),
  (7, '20261108170000_anticipos_proveedores_contador', 'ca6171f8dfbc5cb11ec40a831ea589df', array['a2fce547e464f7bfe71175e40038af04', 'aa4c3b57a749d53c66506a7b4d7d6338', '05b9412ef8fb162a9566189e4313073b', 'cb2d8d5c9a890e919cdebac05283c89f', 'b58622a7c223bd115e1d404290cee1c7', '863d10ed9ec437aca7b4d06f785d0392', '073ea2e870c4320f8c7fb7b5a09317fd', '2d4e4c263c074261594198c9946abc2f', 'ebfd91b7b31edcf53d2b67585c26723b']);
do $carga$
declare m record; s text;
begin
  create temp table lo_md5 as select l.oid, md5(lo_get(l.oid)) as md5 from pg_largeobject_metadata l;
  for m in select * from carga order by n loop
    select convert_from(string_agg(lo_get((select x.oid from lo_md5 x where x.md5 = u.p order by x.oid limit 1)), ''::bytea order by u.i), 'UTF8') into s
      from unnest(m.partes) with ordinality u(p, i);
    perform pg_temp.chk('md5 ' || m.archivo, m.md5, md5(s));
    if s is null or md5(s) <> m.md5 then raise exception 'carga: md5 de % distinto', m.archivo; end if;
    execute s;
  end loop;
end $carga$;


-- ════ CUERPO: 14.sql ════
select set_config('dry.prueba', '14', true);
reset role;
-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $f$
declare s1 int; s138 int; p1 int; p2 int; p3 int; p4 int; p5 int; c137 uuid; c138 uuid; a1 uuid; a2 uuid; a3 uuid;
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento)
  select 374, x.* from (values
   ('911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   ('281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   ('28151001', 'Dueño consignante 1', 'liability', 'no_aplica', '281510', true),
   ('28151002', 'Dueño consignante 2', 'liability', 'no_aplica', '281510', true),
   ('413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   ('41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true),
   ('138095', 'Otras cuentas por cobrar', 'asset', 'no_aplica', '1380', false),
   ('13809501', 'Remuneración por cobrar a dueños consignantes', 'asset', 'no_aplica', '138095', true),
   ('133005', 'A proveedores', 'asset', 'no_aplica', '1330', false),
   ('13300501', 'Anticipos a proveedores nacionales', 'asset', 'no_aplica', '133005', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  -- Perfil tributario del intermediario (374): ordinario, responsable de IVA, sin autorretención ni SIMPLE.
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades) values (374, '2026-01-01', 'ordinario', array['O-48']);
  end if;  insert into suppliers (organization_id, name, supplier_type) values (374, 'Consignante prueba seco', 'company') returning id into s1;
  insert into suppliers (organization_id, name, supplier_type) values (374, 'Organización vinculada prueba seco', 'company') returning id into s138;
  insert into products (organization_id, sku, name) values (374, 'SECO-P1', 'Prueba seco 1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'SECO-P2', 'Prueba seco 2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'SECO-P3', 'Prueba seco propio') returning id into p3;
  insert into products (organization_id, sku, name) values (374, 'SECO-P5', 'Prueba seco vinculado') returning id into p5;
  insert into customers (organization_id, first_name, last_name) values (374, 'Cliente', 'Seco') returning id into c137;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 100000, 100000, 'COP', '13300501') returning id into a1;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s138, 50000, 50000, 'COP', '13300501') returning id into a2;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 1000000, 1000000, 'COP', '13300501') returning id into a3;
  perform fn_inv_int_mover(374, 585, p3, null, 'in', 5, 20000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  perform set_config('dry.u374', json_build_object('sub', (select owner_user_id from organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('dry.s1', s1::text, true); perform set_config('dry.s138', s138::text, true);
  perform set_config('dry.p1', p1::text, true); perform set_config('dry.p2', p2::text, true); perform set_config('dry.p3', p3::text, true);
  perform set_config('dry.p5', p5::text, true);
  perform set_config('dry.c137', c137::text, true);
  perform set_config('dry.a1', a1::text, true); perform set_config('dry.a2', a2::text, true); perform set_config('dry.a3', a3::text, true);
end $f$;

-- ── Organización 374: recibida (mandato) y entregada, como su dueño ──────────
select set_config('request.jwt.claims', current_setting('dry.u374'), true);
set local role authenticated;
do $t$
declare
  o int := 374; b int := 585;
  s1 int := current_setting('dry.s1')::int; p1 int := current_setting('dry.p1')::int; p2 int := current_setting('dry.p2')::int;
  p3 int := current_setting('dry.p3')::int; c137 uuid := current_setting('dry.c137')::uuid;
  a1 uuid := current_setting('dry.a1')::uuid; a2 uuid := current_setting('dry.a2')::uuid; a3 uuid := current_setting('dry.a3')::uuid;
  t jsonb; t2 jsonb; te jsonb; lin jsonb; r jsonb; n1 uuid; n2 uuid; l1 uuid; liq1 uuid; liq2 uuid; liq4 uuid; ne uuid;
  q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',true,
    'obligacion_dueno','venta','compensacion_remuneracion',true,'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001');
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000));

  -- Punto 1: contrapartida del grupo 94 DEFINIDA
  perform pg_temp.err('T1 recibir sin contrapartida 94 definida', 'sin_cuenta_contra_orden', format(q, s1, b, lin, t, 'k-t1', o));
  perform pg_temp.err('T2a contrapartida 9905', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9905', '41351201'));
  perform pg_temp.err('T2b contrapartida 9115 (no es del grupo 94)', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9115', '41351201'));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201');
  perform pg_temp.chk('T2c contrapartida definida', '9405', r->>'contra');
  -- Ronda 4: sin la cuenta por cobrar al dueño (comisión no compensable) no se recibe.
  perform pg_temp.err('T2c2 recibir sin cuenta por cobrar al dueño', 'sin_cuenta_cobro_remuneracion', format(q, s1, b, lin, t, 'k-t2c2', o));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501',
         '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  perform pg_temp.chk('T2c3 cuenta por cobrar al dueño y retención sufrida', '13809501/13551501', (r->>'cobro_remuneracion') || '/' || (r->'retenciones_sufridas'->>'retefuente'));
  perform pg_temp.err('T3k recibida en mandato sin pactar la compensación de la remuneración', 'terminos_invalidos', format(q, s1, b, lin, t - 'compensacion_remuneracion', 'k-t3k', o));

  -- Punto 2: contrato sin defaults
  perform pg_temp.err('T3a sin modalidad', 'clasificacion_obligatoria', format(q, s1, b, lin, t - 'contrato', 'k-t3a', o));
  perform pg_temp.err('T3b sin condición contable', 'condicion_contable_obligatoria', format(q, s1, b, lin, t - 'condicion', 'k-t3b', o));
  perform pg_temp.err('T3c sin valoración', 'valoracion_obligatoria', format(q, s1, b, lin, t - 'valoracion', 'k-t3c', o));
  perform pg_temp.err('T3d compra real', 'compra_real_usa_factura', format(q, s1, b, lin, t || '{"contrato":"compra"}', 'k-t3d', o));
  perform pg_temp.err('T3e estimatorio (punto 3)', 'estimatorio_bloqueado_438_455', format(q, s1, b, lin, t || '{"contrato":"estimatorio","condicion":"principal"}', 'k-t3e', o));
  perform pg_temp.err('T3f mandato como principal', 'terminos_invalidos', format(q, s1, b, lin, t || '{"condicion":"principal"}', 'k-t3f', o));
  perform pg_temp.err('T3g sin reconocimiento', 'terminos_invalidos', format(q, s1, b, lin, t - 'reconocimiento', 'k-t3g', o));
  perform pg_temp.err('T3h sin costo acreditado', 'costo_acreditado_obligatorio', format(q, s1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000)), t, 'k-t3h', o));

  -- Recibir (custodia por costo acreditado y por valor convenido)
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null); n1 := r->>'nota_id';
  perform pg_temp.chk('T4a N1 custodia (10 × costo acreditado 40.000)', '400000.00', r->>'custodia');
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null);
  perform pg_temp.chk('T4b recibir repetido es idempotente', 'true', r->>'repetida');
  t2 := t || jsonb_build_object('valoracion','valor_convenido','remuneracion_modo','precio_liquidacion','reconocimiento','obligacion_posterior','obligacion_posterior','Entregar e instalar el equipo en la sede del comprador','factura_remuneracion',false);
  r := fn_consignacion_recibir(s1, b, jsonb_build_array(jsonb_build_object('product_id',p2,'qty',5,'precio',50000,'precio_liquidacion',42000)), 0, t2, 'k-n2', o, null);
  n2 := r->>'nota_id';
  perform pg_temp.chk('T4c N2 custodia (5 × valor convenido 50.000)', '250000.00', r->>'custodia');

  -- Venta por el kardex (remuneración al vender)
  perform pg_temp.mover(o, b, p1, 'out', 3, 'sale');
  select id into l1 from consignment_note_lines where note_id = n1;
  perform pg_temp.chk('T5 vendido en la línea', '3.000', (select qty_sold::text from consignment_note_lines where id = l1));

  -- Punto 7: faltante sin gasto
  perform pg_temp.err('T6a novedad sin evidencia', 'evidencia_obligatoria', format('select fn_consignacion_registrar_novedad(%L,%L,%L,1,%L,%L,null,%L,%s)', n1, l1, 'faltante', 'por_determinar', 'x', 'k-nv0', o));
  r := fn_consignacion_registrar_novedad(n1, l1, 'faltante', 1, 'por_determinar', 'Conteo físico: falta una unidad', 'Por definir con el dueño', 'k-nv1', o);
  perform pg_temp.chk('T6b faltante sale de custodia', '40000.00', r->>'custodia');

  -- Liquidar
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq1', o); liq1 := r->>'liquidacion_id';
  perform pg_temp.chk('T7 liq1 venta / remuneración / dueño', '180000.00/27000.00/153000.00', (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno'));

  -- Devolución de lo ya liquidado → derecho frente al dueño; nueva venta
  perform pg_temp.mover(o, b, p1, 'in', 1, 'return');
  perform pg_temp.mover(o, b, p1, 'out', 2, 'sale');
  perform pg_temp.err('T9a descontar derechos sin acuerdo', 'acuerdo_obligatorio', format('select fn_consignacion_recibida_liquidar(%L,null,true,null,%L,%s)', n1, 'k-liq2x', o));
  r := fn_consignacion_recibida_liquidar(n1, null, true, 'Acuerdo escrito con el dueño', 'k-liq2', o); liq2 := r->>'liquidacion_id';
  perform pg_temp.chk('T9b liq2 con acuerdo: venta / dueño / derechos', '60000.00/51000.00/60000.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));
  perform pg_temp.err('T9c anular liq1 (no es la última; corrección seq)', 'liquidacion_no_es_la_ultima', format('select fn_consignacion_recibida_anular_liquidacion(%L,%L,%s)', liq1, 'Prueba de anulación', o));
  r := fn_consignacion_recibida_anular_liquidacion(liq2, 'Se pactó no descontar', o);
  perform pg_temp.chk('T9d anular liq2 (la última; remuneración al vender: sin asiento)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  perform pg_temp.chk('T9d2 anular no cierra los pendientes tributarios de esas ventas (ronda 4)', 'true', ((r->>'pendientes_vigentes')::int > 0)::text);
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq3', o);
  perform pg_temp.chk('T9e liq3 sin descontar: venta / dueño / derechos', '120000.00/102000.00/0.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));

  -- Ronda 3 (aceptada por el Contador): «al liquidar» ya no existe; la remuneración se devenga al cumplirse la obligación posterior.
  perform pg_temp.mover(o, b, p2, 'out', 2, 'sale');
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq4', o); liq4 := r->>'liquidacion_id';
  perform pg_temp.chk('T11a liq4 (precio de liquidación 42.000): venta / remuneración / dueño', '100000.00/16000.00/84000.00', (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno'));
  r := fn_consignacion_recibida_anular_liquidacion(liq4, 'Prueba de contra-asiento', o);
  perform pg_temp.chk('T11b anular liq4: la liquidación no registró remuneración, no hay contra-asiento (ronda 3)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq5', o);
  perform pg_temp.chk('T11c liq5: remuneración / dueño', '16000.00/84000.00', (r->>'remuneracion') || '/' || (r->>'dueno'));

  -- Punto 6: anticipo cruzado con la obligación real (281510)
  perform pg_temp.err('T10a anticipo de otro consignante', 'anticipo_no_encontrado', format('select fn_consignacion_cruzar_anticipo(%L,%L,1000,%L,%s)', n1, a2, 'k-cr0', o));
  perform pg_temp.err('T10b más que el saldo del anticipo', 'anticipo_sin_saldo', format('select fn_consignacion_cruzar_anticipo(%L,%L,200000,%L,%s)', n1, a1, 'k-cr1', o));
  perform pg_temp.err('T10c más que la obligación con el dueño', 'excede_obligacion_con_el_dueno', format('select fn_consignacion_cruzar_anticipo(%L,%L,900000,%L,%s)', n1, a3, 'k-cr2', o));
  r := fn_consignacion_cruzar_anticipo(n1, a1, 50000, 'k-cr3', o);
  perform pg_temp.chk('T10d cruce: monto / saldo del anticipo', '50000.00/50000.00', (r->>'monto') || '/' || (r->>'saldo_anticipo'));

  -- Punto 8: entregada sin 1465 ni asiento
  te := t - 'valoracion' - 'cuenta_recaudo';
  r := fn_consignacion_entregar(c137, b, jsonb_build_array(jsonb_build_object('product_id',p3,'qty',2,'precio',35000)), 10, te, 'k-e1', o, null, null);
  ne := r->>'nota_id';
  perform set_config('dry.ne', ne::text, true);
  perform pg_temp.chk('T12a entregada: costo identificado / ubicación', '40000.00/En poder de Cliente Seco', (r->>'costo') || '/' || (r->>'ubicacion'));
  perform pg_temp.err('T12b liquidar el mandato del lado del dueño', 'liquidacion_mandante_pendiente', format('select fn_consignacion_liquidar(%L,%L::jsonb,%L,%s)', ne,
    jsonb_build_array(jsonb_build_object('linea_id', (select id from consignment_note_lines where note_id = ne), 'vendido', 1, 'precio', 35000)), 'k-el1', o));
  perform pg_temp.err('T12c entregar estimatorio', 'estimatorio_bloqueado_438_455', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p3,'qty',1)), te || '{"contrato":"estimatorio","condicion":"principal"}', 'k-e2', o));
  perform pg_temp.err('T12d entregar producto ajeno', 'producto_ajeno', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p1,'qty',1)), te, 'k-e3', o));
  perform pg_temp.err('T12e entregar sin clasificación', 'clasificacion_obligatoria', format('select fn_consignacion_entregar(%L,%s,%L::jsonb,10,%L::jsonb,%L,%s)', c137, b,
    jsonb_build_array(jsonb_build_object('product_id',p3,'qty',1)), te - 'contrato', 'k-e4', o));
  perform pg_temp.err('T12f operar la organización 138 con la sesión de la 374', 'Acceso denegado', format(q, s1, 113, lin, t, 'k-x', 138));
  perform pg_temp.err('T12g el hash del token no se puede leer', 'permission denied', 'select token_hash from public.organization_links');
end $t$;

-- ── Cuadre final (administrador) y resultado ─────────────────────────────────
reset role;
do $z$
declare v text;
begin
  select string_agg(x, chr(10)) into v from (
    select e.source || ': ' || (select string_agg(l.account_code || case when l.debit > 0 then ' D ' else ' C ' end || (l.debit + l.credit)::numeric(16,0), ' | ' order by l.debit desc)
                                  from journal_lines l where l.journal_entry_id = e.id) x
      from journal_entries e where e.created_at = now() and e.source like 'consign%' order by e.id) s;
  perform pg_temp.log('ASIENTOS DE CONSIGNACIÓN:' || chr(10) || coalesce(v, '(ninguno)'));
  perform pg_temp.chk('Z1 asientos de consignación (21 de la corrida anterior − 4 de la parte entre organizaciones − 3 de la remuneración «al liquidar», que ya no existe)', '14', (select count(*)::text from journal_entries e where e.created_at = now() and e.source like 'consign%'));
  perform pg_temp.chk('Z2 asientos descuadrados (todos los de la transacción)', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z3 asientos de las entregadas', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and e.source_id in (current_setting('dry.ne'))));
  perform pg_temp.chk('Z4 líneas en 1465', '0', (select count(*)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.created_at = now() and l.account_code like '1465%'));
  perform pg_temp.chk('Z5 kardex de la entregada propia', 'transfer_out out 2.000', (select string_agg(source || ' ' || direction || ' ' || qty::text, ', ') from stock_movements where source_id = 'consignacion:' || current_setting('dry.ne')));
  perform pg_temp.chk('Z6 obligación con el dueño en 28151001 tras el cruce (la nota 2 aún no reconoce su remuneración: espera la obligación posterior)', '314000.00', (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.organization_id = 374 and l.account_code = '28151001'));
  perform pg_temp.chk('Z7 saldo y estado del anticipo cruzado', '50000.00 active', (select balance::text || ' ' || status from supplier_advances where id = current_setting('dry.a1')::uuid));
  perform pg_temp.chk('Z8 retenciones pendientes abiertas (reemplazan los «impuestos por determinar» de la ronda 2; el consignante no tiene datos fiscales)', '9', (select count(*)::text from journal_entry_failures where created_at = now() and organization_id = 374 and reason = 'consignacion_retencion_pendiente' and resolved_at is null));
  perform pg_temp.chk('Z9 ningún pendiente se cierra por anular el documento (ronda 4)', '0', (select count(*)::text from journal_entry_failures where created_at = now() and organization_id = 374 and resolution = 'liquidacion_anulada'));
  select string_agg(reason || '×' || n, ', ') into v from (select reason, count(*) n from journal_entry_failures where created_at = now() and organization_id = 374 and reason like 'consignacion%' and resolved_at is null group by reason order by reason) s;
  perform pg_temp.log('PENDIENTES ABIERTOS: ' || coalesce(v, '-'));
  perform pg_temp.chk('Z10 pendientes abiertos por tipo', 'consignacion_derecho_frente_al_dueno×1, consignacion_devolucion_pos×1, consignacion_factura_remuneracion×2, consignacion_novedad×1, consignacion_remuneracion_por_devengar×1, consignacion_retencion_pendiente×9', v);
end $z$;

-- ════ FINAL: el resultado sale en el mensaje de esta excepción, que además revierte todo ═══════════════════════════
reset role;
do $fin$
declare t text; v text; b text;
begin
  select string_agg(x.s, ' · ' order by x.p) into t
    from (select prueba p, format('%s: %s de %s ok', prueba, count(*) filter (where ok), count(*)) s from r group by prueba) x;
  select string_agg(format('%s | %s | %s | %s | %s', n, prueba, verificacion, coalesce(obtenido, 'null'),
                           case when ok then 'ok' else 'FALLA · esperado: ' || coalesce(esperado, 'null') end), chr(10) order by n) into v from r;
  select string_agg(prueba || ' › ' || linea, chr(10) order by n) into b from bitacora;
  raise exception '%', 'PRUEBA EN SECO (se revierte) · ' || coalesce(t, '-') || chr(10) || coalesce(v, '') || chr(10) || coalesce(b, '');
end $fin$;
