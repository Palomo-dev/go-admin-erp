-- Pruebas en seco · Consignación «Ronda 3 del Contador» (RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md): la comisión se
-- reconoce cuando se DEVENGA (al vender, u obligación posterior real documentada, con evidencia; nunca por la fecha de
-- liquidación) y las retenciones de la OPERACIÓN y de la REMUNERACIÓN se resuelven por separado con las reglas
-- configuradas. Repite además, de punta a punta, todo lo de la prueba 14. Fecha: 2026-11-08 · Proyecto
-- taqjemqjtumhwptchcxk · organizaciones 137 (sucursal 112) y 138 (sucursal 113).
--
-- NO DEJA DATOS: todo corre dentro de begin … rollback (el resultado sale en el mensaje de la excepción final, que además
-- revierte). Las migraciones 20261108120500_organization_links.sql y 20261108121000_consignaciones.sql están SIN
-- APLICAR: la corrida pega su contenido EXACTO, sin recortes, en los dos lugares marcados «MIGRACIÓN» (dentro de un
-- literal $mig$…$mig$ que se ejecuta con EXECUTE), y comprueba su md5 contra el del archivo del repositorio. Lo que las
-- organizaciones no tienen (cuentas 911520, 2815xx, 4135xx; perfil tributario; consignantes con su RUT; un comprador
-- agente de retención y su venta; productos, clientes, anticipos, existencias) se crea como administrador dentro de la
-- transacción. Las operaciones corren como el dueño de cada organización (rol «authenticated» con su sesión simulada por
-- request.jwt.claims). No hay identificadores de usuarios escritos aquí: se leen de organizations.owner_user_id.
-- Resultado: ver el .resultado.txt hermano.

begin;

-- ── Ayudas de la prueba (solo esta sesión) ──────────────────────────────────
create function pg_temp.log(m text) returns void language plpgsql as $$
begin
  perform set_config('dry.log', coalesce(current_setting('dry.log', true), '') || chr(10) || m, true);
end $$;
create function pg_temp.chk(caso text, esperado text, obtenido text) returns void language plpgsql as $$
declare ok boolean := coalesce(obtenido = esperado, false);
begin
  perform set_config('dry.total', (coalesce(nullif(current_setting('dry.total', true), ''), '0')::int + 1)::text, true);
  if ok then
    perform set_config('dry.ok', (coalesce(nullif(current_setting('dry.ok', true), ''), '0')::int + 1)::text, true);
  end if;
  -- Las OK solo con lo obtenido (igual a lo esperado), para que el registro completo quepa en la salida.
  perform pg_temp.log(case when ok then '[OK]    ' || caso || ' · ' || coalesce(obtenido, 'null')
                           else '[FALLA] ' || caso || ' · esperado ' || coalesce(esperado, 'null') || ' · obtenido ' || coalesce(obtenido, 'null') end);
end $$;
create function pg_temp.err(caso text, esperado text, q text) returns void language plpgsql as $$
begin
  execute q;
  perform pg_temp.chk(caso, esperado, 'sin error');
exception when others then
  perform pg_temp.chk(caso, esperado, case when sqlerrm like esperado || '%' then esperado else sqlerrm end);
end $$;
create function pg_temp.mover(o integer, b integer, p integer, d text, q numeric, s text, sid text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.fn_inv_int_mover(o, b, p, null, d, q, case when d = 'in' then 0 end, s, coalesce(sid, gen_random_uuid()::text), 'prueba en seco', auth.uid(), '{}'::jsonb);
end $$;
-- Resumen de las retenciones de una liquidación que NO son «no aplica»: ámbito.clase.grupo=estado[:valor].
create function pg_temp.ret(liq uuid) returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return (select string_agg(w.scope || '.' || w.class || '.' || w.payer_group || '=' || w.status || coalesce(':' || w.amount::text, ''), ', '
                            order by w.scope, w.class, w.payer_group)
            from public.consignment_settlement_withholdings w where w.settlement_id = liq and w.status <> 'no_aplica');
end $$;
grant execute on function pg_temp.log(text), pg_temp.chk(text, text, text), pg_temp.err(text, text, text) to authenticated;
grant execute on function pg_temp.mover(integer, integer, integer, text, numeric, text, text), pg_temp.ret(uuid) to authenticated;

-- ════ MIGRACIÓN 1: contenido exacto de supabase/migrations/20261108120500_organization_links.sql ════
do $x$
declare s text := $mig$<contenido exacto del archivo>$mig$;
begin
  perform pg_temp.chk('md5 de 20261108120500 igual al del repositorio', '6a5a3ead2fe311fdde4b7d5c0376c12b', md5(s));
  execute s;
end $x$;

-- ════ MIGRACIÓN 2: contenido exacto de supabase/migrations/20261108121000_consignaciones.sql ════
do $x$
declare s text := $mig$<contenido exacto del archivo>$mig$;
begin
  perform pg_temp.chk('md5 de 20261108121000 igual al del repositorio', 'db50d76130be3c2cd8810acdd29821d1', md5(s));
  execute s;
end $x$;

-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $f$
declare s1 int; s138 int; p1 int; p2 int; p3 int; p4 int; p5 int; c137 uuid; c138 uuid; cag uuid; vag uuid; a1 uuid; a2 uuid; a3 uuid;
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento) values
   (137, '911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   (137, '281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   (137, '28151001', 'Dueño consignante 1', 'liability', 'no_aplica', '281510', true),
   (137, '28151002', 'Dueño consignante 2', 'liability', 'no_aplica', '281510', true),
   (137, '413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   (137, '41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true);
  -- Perfil tributario del intermediario (137): ordinario, responsable de IVA, sin autorretención ni SIMPLE.
  insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades) values (137, '2026-01-01', 'ordinario', array['O-48']);
  -- Consignante con RUT: gran contribuyente (agente de retención) y responsable de IVA. El vinculado, sin datos fiscales.
  insert into suppliers (organization_id, name, supplier_type, fiscal_responsibilities) values (137, 'Consignante prueba seco', 'company', array['O-13', 'O-48']) returning id into s1;
  insert into suppliers (organization_id, name, supplier_type) values (137, 'Organización vinculada prueba seco', 'company') returning id into s138;
  insert into products (organization_id, sku, name) values (137, 'SECO-P1', 'Prueba seco 1') returning id into p1;
  insert into products (organization_id, sku, name) values (137, 'SECO-P2', 'Prueba seco 2') returning id into p2;
  insert into products (organization_id, sku, name) values (137, 'SECO-P3', 'Prueba seco propio') returning id into p3;
  insert into products (organization_id, sku, name) values (137, 'SECO-P5', 'Prueba seco vinculado') returning id into p5;
  insert into products (organization_id, sku, name) values (138, 'SECO-P4', 'Prueba seco del consignante') returning id into p4;
  insert into customers (organization_id, first_name, last_name) values (137, 'Cliente', 'Seco') returning id into c137;
  insert into customers (organization_id, first_name, last_name) values (138, 'Consignatario', 'Vinculado') returning id into c138;
  -- Comprador agente de retención (gran contribuyente) y su venta del POS, en borrador (no genera asientos propios).
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (137, 'Comprador', 'Agente', array['O-13']) returning id into cag;
  insert into sales (organization_id, branch_id, user_id, status, customer_id)
  values (137, 112, (select owner_user_id from organizations where id = 137), 'draft', cag) returning id into vag;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (137, 112, s1, 100000, 100000, 'COP', '1330') returning id into a1;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (137, 112, s138, 50000, 50000, 'COP', '1330') returning id into a2;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (137, 112, s1, 1000000, 1000000, 'COP', '1330') returning id into a3;
  perform fn_inv_int_mover(137, 112, p3, null, 'in', 5, 20000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  perform fn_inv_int_mover(138, 113, p4, null, 'in', 10, 30000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  perform set_config('dry.u137', json_build_object('sub', (select owner_user_id from organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('dry.u138', json_build_object('sub', (select owner_user_id from organizations where id = 138), 'role', 'authenticated')::text, true);
  perform set_config('dry.s1', s1::text, true); perform set_config('dry.s138', s138::text, true);
  perform set_config('dry.p1', p1::text, true); perform set_config('dry.p2', p2::text, true); perform set_config('dry.p3', p3::text, true);
  perform set_config('dry.p4', p4::text, true); perform set_config('dry.p5', p5::text, true);
  perform set_config('dry.p4uuid', (select uuid::text from products where id = p4), true);
  perform set_config('dry.c137', c137::text, true); perform set_config('dry.c138', c138::text, true); perform set_config('dry.vag', vag::text, true);
  perform set_config('dry.a1', a1::text, true); perform set_config('dry.a2', a2::text, true); perform set_config('dry.a3', a3::text, true);
  -- Reglas configuradas de la organización (las mismas de compras): retención por comisiones y de IVA.
  perform set_config('dry.rcom', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id
                                    where ot.organization_id = 137 and tt.code = 'RETE_11_COMISION'), true);
  perform set_config('dry.riva', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id
                                    where ot.organization_id = 137 and tt.code = 'RETEIVA_15'), true);
end $f$;

-- ── Organización 137: recibida (mandato) y entregada, como su dueño ──────────
select set_config('request.jwt.claims', current_setting('dry.u137'), true);
set local role authenticated;
do $t$
declare
  o int := 137; b int := 112;
  s1 int := current_setting('dry.s1')::int; p1 int := current_setting('dry.p1')::int; p2 int := current_setting('dry.p2')::int;
  p3 int := current_setting('dry.p3')::int; c137 uuid := current_setting('dry.c137')::uuid; vag text := current_setting('dry.vag');
  a1 uuid := current_setting('dry.a1')::uuid; a2 uuid := current_setting('dry.a2')::uuid; a3 uuid := current_setting('dry.a3')::uuid;
  rcom text := current_setting('dry.rcom'); riva text := current_setting('dry.riva');
  t jsonb; t2 jsonb; te jsonb; lin jsonb; r jsonb; n1 uuid; n2 uuid; l1 uuid; liq1 uuid; liq2 uuid; liq4 uuid; ne uuid; w uuid;
  q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',true,
    'obligacion_dueno','venta','riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001');
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000));

  -- Ronda 2, punto 1: contrapartida del grupo 94 DEFINIDA
  perform pg_temp.err('T1 recibir sin contrapartida 94 definida', 'sin_cuenta_contra_orden', format(q, s1, b, lin, t, 'k-t1', o));
  perform pg_temp.err('T2a contrapartida 9905', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9905', '41351201'));
  perform pg_temp.err('T2b contrapartida 9115 (no es del grupo 94)', 'cuenta_contra_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L)', o, '911520', '9115', '41351201'));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201');
  perform pg_temp.chk('T2c contrapartida definida', '9405', r->>'contra');
  -- Ronda 3, punto 2: la regla de cada ámbito se elige entre las configuradas; la de IVA no sirve como retefuente.
  perform pg_temp.err('T2d regla de otra clase', 'regla_retencion_invalida', format('select fn_consignacion_configurar_retenciones(%s,%L::jsonb)', o,
    jsonb_build_object('operacion', jsonb_build_object('retefuente', riva), 'remuneracion', '{}'::jsonb)));
  r := fn_consignacion_configurar_retenciones(o, jsonb_build_object('operacion', '{}'::jsonb, 'remuneracion', jsonb_build_object('retefuente', rcom)));
  perform pg_temp.chk('T2e regla de la remuneración: retención por comisiones; la operación sin regla', rcom || '/null',
    (r->'remuneracion'->>'retefuente') || '/' || coalesce(r->'operacion'->>'retefuente', 'null'));

  -- Ronda 2, punto 2 y Ronda 3, punto 1: contrato sin defaults
  perform pg_temp.err('T3a sin modalidad', 'clasificacion_obligatoria', format(q, s1, b, lin, t - 'contrato', 'k-t3a', o));
  perform pg_temp.err('T3b sin condición contable', 'condicion_contable_obligatoria', format(q, s1, b, lin, t - 'condicion', 'k-t3b', o));
  perform pg_temp.err('T3c sin valoración', 'valoracion_obligatoria', format(q, s1, b, lin, t - 'valoracion', 'k-t3c', o));
  perform pg_temp.err('T3d compra real', 'compra_real_usa_factura', format(q, s1, b, lin, t || '{"contrato":"compra"}', 'k-t3d', o));
  perform pg_temp.err('T3e estimatorio (sigue bloqueado)', 'estimatorio_bloqueado_438_455', format(q, s1, b, lin, t || '{"contrato":"estimatorio","condicion":"principal"}', 'k-t3e', o));
  perform pg_temp.err('T3f mandato como principal', 'terminos_invalidos', format(q, s1, b, lin, t || '{"condicion":"principal"}', 'k-t3f', o));
  perform pg_temp.err('T3g sin reconocimiento', 'terminos_invalidos', format(q, s1, b, lin, t - 'reconocimiento', 'k-t3g', o));
  perform pg_temp.err('T3h sin costo acreditado', 'costo_acreditado_obligatorio', format(q, s1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000)), t, 'k-t3h', o));
  perform pg_temp.err('T3i diferir la comisión a la liquidación (ya no existe)', 'terminos_invalidos', format(q, s1, b, lin, t || '{"reconocimiento":"al_liquidar"}', 'k-t3i', o));
  perform pg_temp.err('T3j obligación posterior sin documentar', 'obligacion_posterior_obligatoria', format(q, s1, b, lin, t || '{"reconocimiento":"obligacion_posterior"}', 'k-t3j', o));

  -- Recibir (custodia por costo acreditado y por valor convenido)
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null); n1 := r->>'nota_id';
  perform pg_temp.chk('T4a N1 custodia (10 × costo acreditado 40.000)', '400000.00', r->>'custodia');
  r := fn_consignacion_recibir(s1, b, lin, 15, t, 'k-n1', o, null);
  perform pg_temp.chk('T4b recibir repetido es idempotente', 'true', r->>'repetida');
  t2 := t || jsonb_build_object('valoracion','valor_convenido','remuneracion_modo','precio_liquidacion','reconocimiento','obligacion_posterior',
    'obligacion_posterior','Entregar e instalar el equipo en la sede del comprador','factura_remuneracion',false);
  r := fn_consignacion_recibir(s1, b, jsonb_build_array(jsonb_build_object('product_id',p2,'qty',5,'precio',50000,'precio_liquidacion',42000)), 0, t2, 'k-n2', o, null);
  n2 := r->>'nota_id';
  perform pg_temp.chk('T4c N2 custodia (5 × valor convenido 50.000)', '250000.00', r->>'custodia');

  -- Venta por el kardex: 2 a consumidor final (POS) y 1 a un comprador agente de retención (remuneración al vender)
  perform pg_temp.mover(o, b, p1, 'out', 2, 'sale');
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale', vag);
  select id into l1 from consignment_note_lines where note_id = n1;
  perform pg_temp.chk('T5 vendido en la línea', '3.000', (select qty_sold::text from consignment_note_lines where id = l1));
  perform pg_temp.chk('T5b remuneración reconocida al vender (3 porciones)', '27000.00',
    (select sum(remuneration_amount)::text from consignment_allocations where note_id = n1 and remuneration_recognized));

  -- Ronda 2, punto 7: faltante sin gasto
  perform pg_temp.err('T6a novedad sin evidencia', 'evidencia_obligatoria', format('select fn_consignacion_registrar_novedad(%L,%L,%L,1,%L,%L,null,%L,%s)', n1, l1, 'faltante', 'por_determinar', 'x', 'k-nv0', o));
  r := fn_consignacion_registrar_novedad(n1, l1, 'faltante', 1, 'por_determinar', 'Conteo físico: falta una unidad', 'Por definir con el dueño', 'k-nv1', o);
  perform pg_temp.chk('T6b faltante sale de custodia', '40000.00', r->>'custodia');

  -- Liquidar: sin asiento de remuneración; retenciones por separado
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq1', o); liq1 := r->>'liquidacion_id';
  perform set_config('dry.liq1', liq1::text, true);
  perform pg_temp.chk('T7 liq1 venta / remuneración / dueño', '180000.00/27000.00/153000.00', (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno'));
  perform pg_temp.chk('R1 liq1: 9 retenciones (3 clases × 2 grupos de compradores + 3 de la remuneración)', '9', jsonb_array_length(r->'retenciones')::text);
  perform pg_temp.chk('R2 liq1: lo que no es «no aplica», por ámbito', 'operacion.retefuente.agente=pendiente, operacion.reteica.agente=pendiente, '
    || 'remuneracion.retefuente.dueno=determinada:2970.00, remuneracion.reteica.dueno=pendiente, remuneracion.reteiva.dueno=pendiente', pg_temp.ret(liq1));
  perform pg_temp.chk('R3 operación: el comprador agente sin regla elegida queda pendiente (nunca 0)', 'pendiente/sin_regla_configurada/60000.00/null',
    (select status || '/' || reason || '/' || base::text || '/' || coalesce(amount::text, 'null') from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente'));
  perform pg_temp.chk('R4 operación: la venta a consumidor final no aplica', 'no_aplica/venta_a_consumidor_final/120000.00',
    (select status || '/' || reason || '/' || base::text from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'consumidor_final'));
  perform pg_temp.chk('R5 remuneración: 11 % de la regla configurada sobre 27.000, con la calidad del intermediario', 'determinada/11.0000/27000.00/2970.00',
    (select status || '/' || rate::text || '/' || base::text || '/' || amount::text from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'remuneracion' and class = 'retefuente'));
  perform pg_temp.chk('R6 remuneración: el IVA de la comisión se determina aparte', 'pendiente/iva_de_la_remuneracion_por_determinar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = liq1 and scope = 'remuneracion' and class = 'reteiva'));
  select id into w from consignment_settlement_withholdings where settlement_id = liq1 and scope = 'remuneracion' and class = 'retefuente';
  perform pg_temp.err('R7a conciliar sin soporte', 'soporte_obligatorio', format('select fn_consignacion_conciliar_retencion(%L,2970,%L,%s)', w, 'x', o));
  r := fn_consignacion_conciliar_retencion(w, 2970, 'Certificado de retención del dueño n.º 15', o);
  perform pg_temp.chk('R7b conciliada con el certificado', '2970.00', r->>'valor');

  -- Devolución de lo ya liquidado → derecho frente al dueño; nueva venta
  perform pg_temp.mover(o, b, p1, 'in', 1, 'return');
  perform pg_temp.mover(o, b, p1, 'out', 2, 'sale');
  perform pg_temp.err('T9a descontar derechos sin acuerdo', 'acuerdo_obligatorio', format('select fn_consignacion_recibida_liquidar(%L,null,true,null,%L,%s)', n1, 'k-liq2x', o));
  r := fn_consignacion_recibida_liquidar(n1, null, true, 'Acuerdo escrito con el dueño', 'k-liq2', o); liq2 := r->>'liquidacion_id';
  perform pg_temp.chk('T9b liq2 con acuerdo: venta / dueño / derechos', '60000.00/51000.00/60000.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));
  perform pg_temp.err('T9c anular liq1 (no es la última; orden seq)', 'liquidacion_no_es_la_ultima', format('select fn_consignacion_recibida_anular_liquidacion(%L,%L,%s)', liq1, 'Prueba de anulación', o));
  r := fn_consignacion_recibida_anular_liquidacion(liq2, 'Se pactó no descontar', o);
  perform pg_temp.chk('T9d anular liq2 (la última; la liquidación no tiene asiento de remuneración)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k-liq3', o);
  perform pg_temp.chk('T9e liq3 sin descontar: venta / dueño / derechos', '120000.00/102000.00/0.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));

  -- Ronda 3, punto 1: obligación posterior real; la liquidación no reconoce la comisión
  perform pg_temp.mover(o, b, p2, 'out', 2, 'sale');
  perform pg_temp.chk('T11 vendido con obligación posterior: remuneración sin reconocer', '16000.00/0',
    (select sum(remuneration_amount)::text from consignment_allocations where note_id = n2 and not remuneration_recognized) || '/'
    || (select count(*)::text from journal_entries e where e.created_at = now() and e.source = 'consignment_sale'
          and e.source_id in (select a.id::text from consignment_allocations a where a.note_id = n2) and e.fact_key like 'consignment_sale_rem:%'));
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq4', o); liq4 := r->>'liquidacion_id';
  perform pg_temp.chk('T11a liq4: venta / remuneración / dueño / remuneración por devengar', '100000.00/16000.00/84000.00/16000.00',
    (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno') || '/' || (r->>'remuneracion_por_devengar'));
  r := fn_consignacion_recibida_anular_liquidacion(liq4, 'Prueba de anulación', o);
  perform pg_temp.chk('T11b anular liq4: sin asiento de remuneración que reversar', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k-liq5', o);
  perform pg_temp.chk('T11c liq5: remuneración / dueño', '16000.00/84000.00', (r->>'remuneracion') || '/' || (r->>'dueno'));
  perform pg_temp.err('T11d reconocer sin evidencia', 'evidencia_obligatoria', format('select fn_consignacion_reconocer_remuneracion(%L,%L,%L,%s)', n2, 'corta', 'k-rec0', o));
  r := fn_consignacion_reconocer_remuneracion(n2, 'Acta de instalación firmada por el comprador el 8 nov', 'k-rec1', o);
  perform pg_temp.chk('T11e reconocida al cumplirse la obligación, con evidencia', '16000.00', r->>'monto');
  perform pg_temp.err('T11f nada más por reconocer', 'sin_remuneracion_por_devengar', format('select fn_consignacion_reconocer_remuneracion(%L,%L,%L,%s)', n2, 'Acta de instalación repetida', 'k-rec2', o));
  perform pg_temp.err('T11g reconocer en una nota que devenga al vender', 'reconocimiento_no_aplica', format('select fn_consignacion_reconocer_remuneracion(%L,%L,%L,%s)', n1, 'Acta que no corresponde', 'k-rec3', o));

  -- Ronda 2, punto 6: anticipo cruzado con la obligación real (281510)
  perform pg_temp.err('T10a anticipo de otro consignante', 'anticipo_no_encontrado', format('select fn_consignacion_cruzar_anticipo(%L,%L,1000,%L,%s)', n1, a2, 'k-cr0', o));
  perform pg_temp.err('T10b más que el saldo del anticipo', 'anticipo_sin_saldo', format('select fn_consignacion_cruzar_anticipo(%L,%L,200000,%L,%s)', n1, a1, 'k-cr1', o));
  perform pg_temp.err('T10c más que la obligación con el dueño', 'excede_obligacion_con_el_dueno', format('select fn_consignacion_cruzar_anticipo(%L,%L,900000,%L,%s)', n1, a3, 'k-cr2', o));
  r := fn_consignacion_cruzar_anticipo(n1, a1, 50000, 'k-cr3', o);
  perform pg_temp.chk('T10d cruce: monto / saldo del anticipo', '50000.00/50000.00', (r->>'monto') || '/' || (r->>'saldo_anticipo'));

  -- Ronda 2, punto 8: entregada sin 1465 ni asiento
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
  perform pg_temp.err('T12f operar la organización 138 con la sesión de la 137', 'Acceso denegado', format(q, s1, 113, lin, t, 'k-x', 138));
  perform pg_temp.err('T12g el hash del token no se puede leer', 'permission denied', 'select token_hash from public.organization_links');
end $t$;

-- ── Entre organizaciones: 138 entrega, 137 recibe y liquida ──────────────────
do $i$
declare
  u137 text := current_setting('dry.u137'); u138 text := current_setting('dry.u138');
  c138 uuid := current_setting('dry.c138')::uuid; s138 int := current_setting('dry.s138')::int;
  p4 int := current_setting('dry.p4')::int; p5 int := current_setting('dry.p5')::int; p4uuid text := current_setting('dry.p4uuid');
  r jsonb; tok text; doc uuid; doc2 uuid; n3 uuid; te2 jsonb;
begin
  perform set_config('request.jwt.claims', u138, true);
  r := fn_vinculo_invitar(138, array['consignacion'], null, c138, null, 7); tok := r->>'token';
  perform set_config('request.jwt.claims', u137, true);
  r := fn_vinculo_aceptar(tok, 137, s138, null);
  perform pg_temp.chk('I1 vínculo aceptado', 'activo', r->>'estado');
  perform set_config('request.jwt.claims', u138, true);
  te2 := jsonb_build_object('contrato','intermediacion','condicion','agente','precio_modo','fijo','remuneracion_modo','porcentaje',
    'base_comision','precio_venta','reconocimiento','al_vender','factura_remuneracion',false,'obligacion_dueno','venta',
    'riesgos',jsonb_build_object('devoluciones','consignatario','perdidas','consignatario','gastos','consignatario'));
  r := fn_consignacion_entregar(c138, 113, jsonb_build_array(jsonb_build_object('product_id',p4,'qty',4,'precio',70000)), 10, te2, 'k-ie1', 138, null, null);
  doc := r->>'documento_compartido_id';
  perform set_config('dry.ne138', r->>'nota_id', true);
  perform pg_temp.chk('I2 entregada de 138: costo / compartida', '120000.00/true', (r->>'costo') || '/' || (doc is not null)::text);
  perform pg_temp.chk('I2b RLS: 138 no ve notas de 137', '0', (select count(*)::text from consignment_notes where organization_id = 137));
  perform set_config('request.jwt.claims', u137, true);
  r := fn_consignacion_recibida_aceptar(doc, 112, jsonb_build_array(jsonb_build_object('producto_ref', p4uuid, 'product_id', p5)), '28151002', 'costo_acreditado', 'k-ia1', 137);
  n3 := r->>'nota_id';
  perform pg_temp.chk('I3 aceptada en 137: custodia / pactado / recaudo', '120000.00/280000.00/28151002', (r->>'custodia') || '/' || (r->>'pactado') || '/' || (r->'cuentas'->>'recaudo'));
  perform pg_temp.chk('I3b RLS: 137 no ve notas de 138', '0', (select count(*)::text from consignment_notes where organization_id = 138));
  perform pg_temp.mover(137, 112, p5, 'out', 1, 'sale');
  r := fn_consignacion_recibida_liquidar(n3, null, false, null, 'k-il1', 137);
  doc2 := r->>'documento_compartido_id';
  perform pg_temp.chk('I4 liquidación 137 → 138: venta / remuneración / dueño / compartida', '70000.00/7000.00/63000.00/true',
    (r->>'venta') || '/' || (r->>'remuneracion') || '/' || (r->>'dueno') || '/' || (doc2 is not null)::text);
  perform pg_temp.chk('I4b remuneración: el dueño vinculado no tiene datos fiscales → pendiente', 'pendiente/calidad_pagador_sin_datos',
    (select w.status || '/' || w.reason from consignment_settlement_withholdings w where w.settlement_id = (r->>'liquidacion_id')::uuid
       and w.scope = 'remuneracion' and w.class = 'retefuente'));
  perform pg_temp.chk('I4c la copia que recibe el dueño trae las retenciones separadas', '6',
    (select jsonb_array_length(d.payload->'retenciones')::text from organization_shared_documents d where d.id = doc2));
  perform pg_temp.err('I5 137 lee la liquidación como si fuera 138', 'Acceso denegado', format('select fn_consignacion_documento_recibido_preparar(%L,%s)', doc2, 138));
  perform set_config('request.jwt.claims', u138, true);
  r := fn_consignacion_documento_recibido_preparar(doc2, 138);
  perform pg_temp.chk('I6 138 prepara: el mandato del lado del dueño espera al Contador', 'true', ((r->'diferencias') @> '[{"tipo":"mandante_pendiente"}]')::text);
end $i$;

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
  perform pg_temp.chk('Z1 asientos de consignación', '22', (select count(*)::text from journal_entries e where e.created_at = now() and e.source like 'consign%'));
  perform pg_temp.chk('Z1b ninguna liquidación registra la remuneración', '0', (select count(*)::text from journal_entries e where e.created_at = now() and e.source = 'consignment_owner_settlement'));
  perform pg_temp.chk('Z2 asientos descuadrados (todos los de la transacción)', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z3 asientos de las entregadas', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and e.source_id in (current_setting('dry.ne'), current_setting('dry.ne138'))));
  perform pg_temp.chk('Z4 líneas en 1465', '0', (select count(*)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.created_at = now() and l.account_code like '1465%'));
  perform pg_temp.chk('Z5 kardex de la entregada propia', 'transfer_out out 2.000', (select string_agg(source || ' ' || direction || ' ' || qty::text, ', ') from stock_movements where source_id = 'consignacion:' || current_setting('dry.ne')));
  perform pg_temp.chk('Z6 obligación con el dueño en 28151001 tras el cruce', '298000.00', (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.organization_id = 137 and l.account_code = '28151001'));
  perform pg_temp.chk('Z7 saldo y estado del anticipo cruzado', '50000.00 active', (select balance::text || ' ' || status from supplier_advances where id = current_setting('dry.a1')::uuid));
  perform pg_temp.chk('Z8 ninguna retención pendiente o «no aplica» trae valor (nunca 0 presumido)', '0', (select count(*)::text from consignment_settlement_withholdings where status <> 'determinada' and amount is not null));
  perform pg_temp.chk('Z9 retenciones de las liquidaciones anuladas: pendientes cerrados', '0', (select count(*)::text from journal_entry_failures f
     where f.created_at = now() and f.resolved_at is null and f.source = 'consignment_owner_settlement'
       and split_part(f.source_id, ':', 1) in (select s.id::text from consignment_settlements s where s.status = 'anulada')));
  select string_agg(reason || '×' || n, ', ') into v from (select reason, count(*) n from journal_entry_failures where created_at = now() and organization_id in (137, 138) and resolved_at is null group by reason order by reason) s;
  perform pg_temp.log('PENDIENTES ABIERTOS: ' || coalesce(v, '-'));
  perform pg_temp.chk('Z10 pendientes abiertos por tipo', 'consignacion_derecho_frente_al_dueno×1, consignacion_devolucion_pos×1, consignacion_factura_remuneracion×2, '
    || 'consignacion_novedad×1, consignacion_retencion_pendiente×11, consignacion_retencion_por_conciliar×2', v);
  raise exception 'PRUEBA EN SECO (se revierte) · % de % comprobaciones OK%', current_setting('dry.ok', true), current_setting('dry.total'), current_setting('dry.log');
end $z$;
rollback;
