-- Pruebas · Ronda 5 del Contador (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md), «IVA», respuestas
-- 1 a 5:
--   A. Casilla 47: documento según la modalidad, norma de exclusión citada, base = valor en aduana + aranceles,
--      «otro documento aduanero» con explicación y solo importación EXCLUIDA.
--   B. «Nunca transmitida»: verificación de la contingencia (aviso o soporte, o constancia de que no hay), consulta del
--      CUFE/CUDE sin resultado y regla de las 48 horas; sin soporte de contingencia, «tratada como no expedida»; cobro
--      devuelto con el soporte de la devolución.
--   C. Retirar la venta de un período declarado: vencimiento y firmeza registrados (arts. 589 y 714 ET), revisados al
--      decidir Y al calcular el borrador; nota crédito en el período de la nota.
--   D. Cierre: aprobación de un segundo usuario.
--   E. Cuenta por línea: tratamientos de IVA distintos, deducibilidad distinta y activos fijos con gastos o inventarios;
--      control positivo con cuenta de cabecera; y el ejemplo de la ronda 3 (34.200 al costo, 27.800 descontables) con
--      cuenta por línea.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140000 (H1), 20261108150000, 20261108150500, 20261108151000,
-- 20261108152000 y (ronda 6) 20261110150000. Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
-- Usuarios simulados: A = el miembro activo de la org 374; B = el dueño de la org 137, agregado como miembro de la 374
-- SOLO dentro de la transacción (el segundo usuario que aprueba el cierre).
--
-- RONDA 6 (2026-11-10, docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md): se vuelve a correr con las migraciones
-- reescritas y, además, 20261110150000 (reparto de la base del asiento por líneas), después de 20261108152000.
-- DATOS que cambian (sin cambiar lo que prueban):
--   · Q2 y Q3 registran el INICIO de la falla (la ronda 6 lo pide para saber si la falla cubre la fecha de la venta): la
--     de Q2 es de ayer (no cubre la venta, de hace 3 días); la de Q3 empezó 1 hora antes de la venta (la cubre);
--   · la declaración septiembre–octubre registra la solicitud de corrección ante la DIAN, aceptada (art. 589 ET, datos de
--     prueba), en la misma fila que corrige la firmeza a «no está en firme»;
--   · B aprueba los retiros de Q4, Q5 y R1 antes de calcular los borradores (tres filas nuevas, después de la 63).
-- Esperados que cambian, y por qué (respuestas del Contador):
--   · Q3 (respuesta 1, CAMBIO OBLIGATORIO): con una falla que cubre la venta, la factura se tiene por expedida en
--     contingencia: le falta la nota crédito electrónica, no se retira y la venta sigue en la 59 (tres filas);
--   · B ya puede aprobar el pago a la DIAN (respuesta 8): «aprobado» en lugar de APROBACION_SOLO_CIERRE;
--   · I7, importación EXENTA (respuesta 7): ya no es «no excluida, no va a la 47»; le faltan el artículo de la exención y
--     si viene de zona franca → «importacion_sin_soporte_aduanero» (la 47/48 de la exenta completa está en la prueba 27);
--   · FTR, FDX y FDD (respuesta 5): toda compra con IVA no descontable y más de una línea exige cuenta por línea; FDD deja
--     de ser el control positivo de la cuenta de cabecera (queda sin asiento) y la función de la cuenta única da el motivo
--     «más de una línea» para FDD también con la cabecera 152405 (cuatro filas);
--   · FCHL (hallazgo de la ronda 6): con 20261110150000 la base se reparte por la base antes de IVA: 100.000 / 215.200 /
--     119.000 (fila 103, antes el hallazgo 90.909 / 221.261 / 122.030); la fila 102 calcula la parte de la base de cada
--     cuenta con la base de su línea (antes, con su total con IVA).

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
insert into ctx values ('ua', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}');
insert into ctx select 'ub', json_build_object('sub', o.owner_user_id, 'role', 'authenticated')::text from public.organizations o where o.id = 137;
insert into public.organization_members (organization_id, user_id, role_id, is_active)
select 374, o.owner_user_id, 2, true from public.organizations o
 where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);

with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba R5', '900000055', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with p as (insert into public.products (organization_id, sku, name, product_type, track_stock)
           values (374, 'PRUEBA-R5-BIEN', 'Bien de prueba R5', 'product', false), (374, 'PRUEBA-R5-SERV', 'Servicio de prueba R5', 'service', false),
                  (374, 'PRUEBA-R5-INV', 'Bien inventariable R5', 'product', true)
           returning id, sku)
insert into ctx select lower(replace(sku, 'PRUEBA-R5-', 'p_')), id::text from p;
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
create function pg_temp.apr(p_k text, p_aprobar boolean) returns text language plpgsql as $$
declare v_m text; v_d text; v_r jsonb;
begin
  v_r := public.fn_iva_naturaleza_asiento_aprobar(374, (select v::int from ctx where k = p_k), p_aprobar, 'Revisado: no es un ajuste fiscal');
  return case when v_r ->> 'aprobado_por' is not null then 'aprobado' else 'sin aprobar' end;
exception when others then get stacked diagnostics v_m = message_text, v_d = pg_exception_detail; return pg_temp.err(v_m, v_d);
end $$;
create function pg_temp.faltan(p_k text) returns text language sql as $$
  select coalesce(public.fn_iva_correccion_expediente_faltantes(n)::text, 'SIN REGISTRO')
    from public.tributario_iva_naturaleza_asiento n where n.organization_id = 374 and n.journal_entry_id = (select v::int from ctx where k = p_k) $$;
grant execute on function pg_temp.err(text, text) to authenticated, anon;
grant execute on function pg_temp.cla(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.nat(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.natj(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.dec(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.decl(date, date, jsonb) to authenticated, anon;
grant execute on function pg_temp.apr(text, boolean) to authenticated, anon;
grant execute on function pg_temp.faltan(text) to authenticated, anon;

-- ═══ A y E · Compras (borradores con sus líneas) ═══
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           select 374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-R5-' || x.n, 'draft', 'COP', now()
             from (values ('FI1'), ('FI2'), ('FI3'), ('FI4'), ('FI5'), ('FI6'), ('FI7'), ('FI8'),
                          ('FTR'), ('FDX'), ('FDD'), ('FAS'), ('FAI'), ('FCHL')) x(n)
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-R5-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line, cuenta_contable)
select (select v::uuid from ctx where k = x.d), 'purchase', (select v::uuid from ctx where k = x.d), (select v::int from ctx where k = x.p), x.descr, 1, x.pr, x.t, x.c, x.tot, x.cta
  from (values ('fi1', 'p_bien', 'R5 I1 ordinaria completa', 300000, 0, null, 300000, null),
               ('fi2', 'p_bien', 'R5 I2 trafico postal con guia firmada', 50000, 0, null, 50000, null),
               ('fi3', 'p_bien', 'R5 I3 base distinta de valor en aduana mas aranceles', 100000, 0, null, 100000, null),
               ('fi4', 'p_bien', 'R5 I4 sin norma de exclusion', 60000, 0, null, 60000, null),
               ('fi5', 'p_bien', 'R5 I5 otro documento sin explicacion', 20000, 0, null, 20000, null),
               ('fi6', 'p_bien', 'R5 I6 otro documento con explicacion', 20000, 0, null, 20000, null),
               ('fi7', 'p_bien', 'R5 I7 importacion exenta', 40000, 0, null, 40000, null),
               ('fi8', 'p_bien', 'R5 I8 documento que no corresponde', 30000, 0, null, 30000, null),
               ('ftr', 'p_bien', 'R5 FTR bien gravado no descontable', 100000, 19, 'IVA_19', 119000, null),
               ('ftr', 'p_bien', 'R5 FTR bien excluido', 50000, 0, null, 50000, null),
               ('fdx', 'p_bien', 'R5 FDX bien no descontable', 100000, 19, 'IVA_19', 119000, null),
               ('fdx', 'p_bien', 'R5 FDX bien proporcional', 100000, 19, 'IVA_19', 119000, null),
               ('fdd', 'p_bien', 'R5 FDD bien no descontable 1', 100000, 19, 'IVA_19', 119000, null),
               ('fdd', 'p_bien', 'R5 FDD bien no descontable 2', 100000, 19, 'IVA_19', 119000, null),
               ('fas', 'p_serv', 'R5 FAS servicio no descontable', 100000, 19, 'IVA_19', 119000, null),
               ('fai', 'p_inv', 'R5 FAI bien inventariable no descontable', 100000, 19, 'IVA_19', 119000, null),
               ('fchl', null, 'R5 FCHL no descontable 19', 100000, 19, 'IVA_19', 119000, '519525'),
               ('fchl', null, 'R5 FCHL proporcional 19', 200000, 19, 'IVA_19', 238000, '513595'),
               ('fchl', null, 'R5 FCHL descontable 5', 100000, 5, 'IVA_5', 105000, '14350101')) x(d, p, descr, pr, t, c, tot, cta);

insert into ctx values ('adu', '{"tipo_documento":"declaracion_importacion","numero":"DI-R5","fecha":"2026-11-03","adjunto":"documentos/prueba/DI-R5.pdf","norma_exclusion":"ET art. 424 num. 1","fundamento_exclusion":"Bien excluido en la importación","modalidad":"importacion_ordinaria"}');

select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;

-- ── A · Validaciones del soporte aduanero (la RPC) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', x.v, x.e, x.o, x.o = x.e from (values
  ('Ordinaria con la guía de tráfico postal (declaración simplificada)', 'SOPORTE_ADUANERO_DOCUMENTO_NO_CORRESPONDE',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"tipo_documento":"declaracion_simplificada","modalidad":"importacion_ordinaria"}}')),
  ('Tráfico postal con declaración de importación', 'SOPORTE_ADUANERO_DOCUMENTO_NO_CORRESPONDE',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"tipo_documento":"declaracion_importacion","modalidad":"trafico_postal_envio_urgente"}}')),
  ('Franquicia con «otro documento aduanero»', 'SOPORTE_ADUANERO_DOCUMENTO_NO_CORRESPONDE',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"tipo_documento":"otro_documento_aduanero","modalidad":"franquicia"}}')),
  ('El tipo separado «guía de tráfico postal» de la ronda 4 ya no existe (es la declaración simplificada)', 'SOPORTE_ADUANERO_INVALIDO',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"tipo_documento":"guia_trafico_postal_envio_urgente"}}')),
  ('Norma de exclusión sin artículo', 'SOPORTE_ADUANERO_NORMA_INVALIDA',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"norma_exclusion":"Bien excluido"}}')),
  ('Valor distinto de valor en aduana + aranceles (90.000 + 5.000 ≠ 100.000)', 'SOPORTE_ADUANERO_BASE_NO_SUMA',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"valor_aduana":90000,"aranceles":5000,"valor":100000}}')),
  ('Aranceles negativos', 'SOPORTE_ADUANERO_INVALIDO',
   pg_temp.cla('R5 I4 sin norma de exclusion', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"aranceles":-1}}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Lo que le falta a un «otro documento aduanero» solo con tipo y modalidad (incluida la explicación)',
       '{numero,fecha,adjunto,valor_aduana,aranceles,norma_exclusion,fundamento_exclusion,explicacion}', x.o,
       x.o = '{numero,fecha,adjunto,valor_aduana,aranceles,norma_exclusion,fundamento_exclusion,explicacion}'
  from (select public.fn_iva_soporte_aduanero_faltantes('{"tipo_documento":"otro_documento_aduanero","modalidad":"otra_modalidad"}', null)::text o) x;

-- ── A · Clasificación de las importaciones (todas excluidas salvo I7) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', x.v, 'OK', x.o, x.o = 'OK' from (values
  ('I1: ordinaria, declaración de importación, 280.000 + 20.000 = 300.000',
   pg_temp.cla('R5 I1 ordinaria completa', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":280000,"aranceles":20000,"valor":300000}'))),
  ('I2: tráfico postal con la guía firmada (declaración simplificada), 45.000 + 5.000',
   pg_temp.cla('R5 I2 trafico postal con guia firmada', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"tipo_documento":"declaracion_simplificada","numero":"GUIA-R5-2","modalidad":"trafico_postal_envio_urgente","valor_aduana":45000,"aranceles":5000}'))),
  ('I3: base 100.000 con valor en aduana 90.000 + aranceles 5.000',
   pg_temp.cla('R5 I3 base distinta de valor en aduana mas aranceles', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":90000,"aranceles":5000}'))),
  ('I4: sin la norma de exclusión',
   pg_temp.cla('R5 I4 sin norma de exclusion', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido',
     'soporte_aduanero', ((select v::jsonb from ctx where k = 'adu') - 'norma_exclusion') || '{"valor_aduana":60000,"aranceles":0}'))),
  ('I5: otro documento aduanero (otra modalidad) sin explicación',
   pg_temp.cla('R5 I5 otro documento sin explicacion', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"tipo_documento":"otro_documento_aduanero","modalidad":"otra_modalidad","valor_aduana":20000,"aranceles":0}'))),
  ('I6: otro documento aduanero (otra modalidad) con explicación',
   pg_temp.cla('R5 I6 otro documento con explicacion', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"tipo_documento":"otro_documento_aduanero","modalidad":"otra_modalidad","valor_aduana":20000,"aranceles":0,"explicacion":"Documento de transporte con levante: modalidad especial de prueba"}'))),
  ('I7: importación EXENTA con el soporte completo',
   pg_temp.cla('R5 I7 importacion exenta', jsonb_build_object('tratamiento', 'exenta', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Exenta de prueba',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":40000,"aranceles":0}'))),
  ('I8: ordinaria completa (luego el dato se altera fuera de la RPC)',
   pg_temp.cla('R5 I8 documento que no corresponde', jsonb_build_object('tratamiento', 'excluida', 'tarifa', 0, 'tipo_operacion', 'importacion', 'fundamento', 'Bien excluido (art. 424 ET)',
     'soporte_aduanero', (select v::jsonb from ctx where k = 'adu') || '{"valor_aduana":30000,"aranceles":0}')))
) x(v, o);

-- ── E · Evaluación del IVA de las compras de cuenta por línea, ANTES de contabilizar ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'Clasificación de ' || x.descr, 'OK', pg_temp.cla(x.descr, x.d::jsonb), pg_temp.cla(x.descr, x.d::jsonb) = 'OK' from (values
  ('R5 FTR bien gravado no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FTR bien excluido', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"bienes","fundamento":"Bien excluido (art. 424 ET)"}'),
  ('R5 FDX bien no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FDX bien proporcional', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"proporcional","descontable_porcentaje":60,"descontable_motivo":"Art. 490: 60 % de ingresos gravados"}'),
  ('R5 FDD bien no descontable 1', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FDD bien no descontable 2', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FAS servicio no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas"}'),
  ('R5 FAI bien inventariable no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FCHL no descontable 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
  ('R5 FCHL proporcional 19', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"proporcional","descontable_porcentaje":60,"descontable_motivo":"Art. 490: 60 % de ingresos gravados"}'),
  ('R5 FCHL descontable 5', '{"tratamiento":"gravada","tarifa":5,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas (arts. 485 y 488)"}')
) x(descr, d);
reset role;

-- I8: el dato se altera directamente (como llegaría por otra vía): tráfico postal con declaración de importación.
update public.invoice_items set iva_soporte_aduanero = iva_soporte_aduanero || '{"modalidad":"trafico_postal_envio_urgente"}'
 where description = 'R5 I8 documento que no corresponde' and invoice_purchase_id = (select v::uuid from ctx where k = 'fi8');

-- Contabilización (al recibir). FAS y FAI no se contabilizan: solo se usan para la función de la cuenta única.
update public.invoice_purchase set status = 'received'
 where id in (select v::uuid from ctx where k in ('fi1', 'fi2', 'fi3', 'fi4', 'fi5', 'fi6', 'fi7', 'fi8', 'ftr', 'fdx', 'fdd', 'fchl'));

-- ═══ B y C · Ventas POS y sus reversas ═══
-- Q1…Q5 de hace 3 días (noviembre); R1 y R2 de octubre (bimestre septiembre–octubre); R25 de marzo de 2025.
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           select 374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, x.f, x.n
             from (values ('Q1', now() - interval '3 days'), ('Q2', now() - interval '3 days'), ('Q3', now() - interval '3 days'),
                          ('Q4', now() - interval '3 days'), ('Q5', now() - interval '3 days'),
                          ('R1', '2026-10-10 12:00-05'::timestamptz), ('R2', '2026-10-12 12:00-05'::timestamptz),
                          ('R25', '2025-03-10 12:00-05'::timestamptz)) x(n, f)
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = x.k), (select v::int from ctx where k = 'p_bien'), 1, 100000, 100000, 19000, 0
  from (values ('q1'), ('q2'), ('q3'), ('q4'), ('q5'), ('r1'), ('r2'), ('r25')) x(k);
set constraints trg_auto_journal_sale_pos immediate;
insert into ctx select 'je_' || x.k, (select min(id) from public.journal_entries where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = x.k))::text
  from (values ('q1'), ('q2'), ('q3'), ('q4'), ('q5'), ('r1'), ('r2'), ('r25')) x(k);
insert into ctx select 'je_' || x.k || '_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_' || x.k), 'anulacion_pago', 'prueba-r5-' || x.k, now(), null)::text
  from (values ('q1'), ('q2'), ('q3'), ('q4'), ('q5'), ('r1'), ('r2'), ('r25')) x(k);

-- ═══ D · Asientos sin documento con líneas: un cierre de ejercicio y un pago a la DIAN ═══
set constraints all deferred;
with e as (insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, fact_key)
           select 374, 585, now(), x.memo, true, x.src, 'prueba:r5:' || x.k
             from (values ('ce', 'Cierre de ejercicio (prueba R5)', 'cierre_ejercicio'), ('pg', 'Pago a la DIAN (prueba R5)', 'manual')) x(k, memo, src)
           returning id, fact_key)
insert into ctx select 'je_' || replace(fact_key, 'prueba:r5:', ''), id::text from e;
insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
select (select v::int from ctx where k = 'je_' || x.k), x.cta, x.descr, x.d, x.c
  from (values ('ce', '24080501', 'Cierre', 10000, 0), ('ce', '14350101', 'Cierre', 0, 10000),
               ('pg', '24080501', 'Pago IVA', 5000, 0), ('pg', '14350101', 'Pago IVA (prueba)', 0, 5000)) x(k, cta, descr, d, c);
set constraints all immediate;

-- Expediente base «nunca transmitida» SIN la verificación de la contingencia ni la consulta del CUFE/CUDE.
insert into ctx values ('exp', '{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta de revisión de caja R5","soporte_fecha":"2026-11-08","expediente_explicacion":"Venta registrada por error en la caja; no hubo cliente, mercancía ni dinero.","factura_referencia":"Venta POS de prueba R5","estado_electronico":"nunca_transmitida","entrega_prestacion":"no_hubo","entrega_soporte":"Kárdex sin salida","cobro":"no_hubo","cobro_soporte":"Arqueo de caja sin el recaudo","doc_electronico_resolucion":"constancia","doc_electronico_referencia":"CONST-R5-1","doc_electronico_fecha":"2026-11-08","corrige_declaracion_anterior":false}');
insert into ctx select 'cufe', jsonb_build_object('consulta_cufe_resultado', 'sin_resultado', 'consulta_cufe_en', now(),
                                                  'consulta_cufe_soporte', 'Consulta en el catálogo de la DIAN, sin resultado')::text;
insert into ctx values ('sinsop', '{"contingencia_soporte_tipo":"sin_soporte_contingencia","contingencia_nota":"Sin avisos de la DIAN ni del proveedor tecnológico ni registro de falla ese día"}');

select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;

-- ── B · «Nunca transmitida» ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, x.o, x.o = x.e from (values
  ('Q1: solo la marca «contingencia verificada» (ronda 4): se guarda', 'OK',
   pg_temp.nat('je_q1_rev', (select v::jsonb from ctx where k = 'exp') || '{"contingencia_verificada":true,"contingencia_nota":"Revisado"}')),
  ('Consulta que SÍ encuentra el CUFE/CUDE con «nunca transmitida»', 'DOCUMENTO_ENCONTRADO_EN_DIAN',
   pg_temp.nat('je_q2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || (select v::jsonb from ctx where k = 'cufe') || '{"consulta_cufe_resultado":"encontrado"}')),
  ('Consulta del CUFE/CUDE con fecha futura', 'CONSULTA_CUFE_INVALIDA',
   pg_temp.nat('je_q2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
     || (select v::jsonb from ctx where k = 'cufe') || jsonb_build_object('consulta_cufe_en', now() + interval '1 day'))),
  ('Soporte de contingencia que no existe', 'CONTINGENCIA_INVALIDA',
   pg_temp.nat('je_q2_rev', (select v::jsonb from ctx where k = 'exp') || '{"contingencia_soporte_tipo":"llamada_telefonica"}')),
  ('Q2: aviso del proveedor tecnológico; la falla terminó AYER y la consulta es de hoy', 'OK',
   pg_temp.nat('je_q2_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'cufe')
     || jsonb_build_object('contingencia_soporte_tipo', 'aviso_proveedor_tecnologico', 'contingencia_soporte_referencia', 'AVISO-PT-R5',
                           'contingencia_soporte_fecha', (now() - interval '1 day')::date, 'contingencia_fin_en', now() - interval '1 day',
                           -- Ronda 6: la falla empezó ayer (no cubre la venta, de hace 3 días).
                           'contingencia_inicio_en', now() - interval '1 day' - interval '2 hours'))),
  ('Q3: soporte de la falla del facturador; la falla terminó 1 hora después de la venta', 'OK',
   pg_temp.nat('je_q3_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'cufe')
     || jsonb_build_object('contingencia_soporte_tipo', 'soporte_falla_facturador', 'contingencia_soporte_referencia', 'INCIDENTE-R5-3',
                           'contingencia_soporte_fecha', (now() - interval '3 days')::date, 'contingencia_fin_en', now() - interval '3 days' + interval '1 hour',
                           -- Ronda 6: la falla empezó 1 hora antes de la venta: la cubre.
                           'contingencia_inicio_en', now() - interval '3 days' - interval '1 hour'))),
  ('Q5: hubo cobro devuelto, sin el soporte de la devolución', 'OK',
   pg_temp.nat('je_q5_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop') || (select v::jsonb from ctx where k = 'cufe')
     || '{"cobro":"hubo_devuelto","cobro_soporte":"Recibo de caja R5-5"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', 'Q4: constancia de que no hay soporte de contingencia → la factura se trata como NO EXPEDIDA', 'true',
       x.j ->> 'tratada_como_no_expedida', x.j ->> 'tratada_como_no_expedida' = 'true'
  from (select pg_temp.natj('je_q4_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop')
                                           || (select v::jsonb from ctx where k = 'cufe')) j) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, x.o, x.o = x.e from (values
  ('Q1: lo que le falta (contingencia y consulta del CUFE/CUDE)', '{contingencia,consulta_cufe}', pg_temp.faltan('je_q1_rev')),
  ('Q5: lo que le falta (soporte de la devolución del dinero)', '{devolucion_del_cobro}', pg_temp.faltan('je_q5_rev')),
  ('Q3 (ronda 6): la falla cubre la venta; le falta la nota crédito electrónica', '{nota_credito_electronica}', pg_temp.faltan('je_q3_rev'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, x.o, x.o = x.e from (values
  ('Q1: retirar la venta sin la contingencia verificada (la marca sola ya no basta)', 'EXPEDIENTE_INCOMPLETO [contingencia,consulta_cufe]',
   pg_temp.dec('je_q1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('Q2: retirar con la consulta hecha dentro de las 48 horas siguientes al fin de la falla', 'CONTINGENCIA_SIN_DESCARTAR [plazo_48_horas]',
   pg_temp.dec('je_q2_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('Q3 (ronda 6): la falla cubre la fecha de la venta: expedida en contingencia, no se retira (nota crédito)', 'EXPEDIENTE_INCOMPLETO [nota_credito_electronica]',
   pg_temp.dec('je_q3_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió; la contingencia se descartó"}')),
  ('Q4: constancia de que no hubo contingencia y consulta del CUFE/CUDE sin resultado (no expedida)', 'OK retirar_venta',
   pg_temp.dec('je_q4_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió; factura no expedida"}')),
  ('Q5: cobro devuelto sin su soporte', 'EXPEDIENTE_INCOMPLETO [devolucion_del_cobro]',
   pg_temp.dec('je_q5_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, x.o, x.o = x.e from (values
  ('Q5: se agrega el soporte de la devolución del dinero', 'OK',
   pg_temp.nat('je_q5_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop') || (select v::jsonb from ctx where k = 'cufe')
     || '{"cobro":"hubo_devuelto","cobro_soporte":"Recibo de caja R5-5","cobro_devolucion_soporte":"Transferencia de devolución R5-5","cobro_devolucion_fecha":"2026-11-08"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', 'Q5: con el soporte de la devolución se puede retirar', 'OK retirar_venta', x.o, x.o = 'OK retirar_venta'
  from (select pg_temp.dec('je_q5_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió; el dinero se devolvió"}') o) x;

-- ── C · Período declarado: vencimiento y firmeza ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', x.v, x.e, x.o, x.o = x.e from (values
  ('Declaración septiembre–octubre registrada solo con su presentación', 'OK',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R5","presentada_en":"2026-11-05"}')),
  ('Vencimiento igual al fin del período', 'VENCIMIENTO_INVALIDO',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"presentada_en":"2026-11-05","vencimiento_plazo":"2026-10-31"}')),
  ('Firmeza sin la nota de dónde se sabe', 'FIRMEZA_REQUIERE_NOTA',
   pg_temp.decl('2026-09-01', '2026-10-31', '{"presentada_en":"2026-11-05","en_firme":true}')),
  ('R1: expediente completo, sin soporte de contingencia, marcando la corrección de la declaración', 'OK',
   pg_temp.nat('je_r1_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop') || (select v::jsonb from ctx where k = 'cufe')
     || '{"corrige_declaracion_anterior":true}')),
  ('R2: factura validada por la DIAN con su nota crédito electrónica del 8 de noviembre', 'OK',
   pg_temp.nat('je_r2_rev', (select v::jsonb from ctx where k = 'exp')
     || '{"estado_electronico":"validada_dian","doc_electronico_resolucion":"nota_credito_electronica","doc_electronico_referencia":"NC-E-R5","doc_electronico_fecha":"2026-11-08"}')),
  ('R25: expediente completo de una venta de marzo de 2025, marcando la corrección', 'OK',
   pg_temp.nat('je_r25_rev', (select v::jsonb from ctx where k = 'exp') || (select v::jsonb from ctx where k = 'sinsop') || (select v::jsonb from ctx where k = 'cufe')
     || '{"corrige_declaracion_anterior":true}')),
  ('Declaración marzo–abril de 2025, vencida el 14-05-2025 y no en firme (datos de prueba)', 'OK',
   pg_temp.decl('2025-03-01', '2025-04-30', '{"numero_formulario":"PRUEBA-300-2025","presentada_en":"2025-05-10","vencimiento_plazo":"2025-05-14","en_firme":false,"firmeza_nota":"Dato de prueba"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'R1: retirar la venta sin el vencimiento de la declaración registrado', 'DECLARACION_SIN_VENCIMIENTO', x.o, x.o = 'DECLARACION_SIN_VENCIMIENTO'
  from (select pg_temp.dec('je_r1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Se registra el vencimiento (12-11-2026, dato de prueba), sin la firmeza', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R5","presentada_en":"2026-11-05","vencimiento_plazo":"2026-11-12"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'R1: retirar con el vencimiento pero sin la firmeza registrada', 'FIRMEZA_SIN_DETERMINAR', x.o, x.o = 'FIRMEZA_SIN_DETERMINAR'
  from (select pg_temp.dec('je_r1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Se registra que la declaración está EN FIRME (sin enviar el vencimiento)', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R5","presentada_en":"2026-11-05","en_firme":true,"firmeza_nota":"Dato de prueba: en firme"}') o) x;
-- (Se lee en otra sentencia: una sentencia no ve lo que escribe la función que llama.)
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'El vencimiento que no se envió se conservó, y la firmeza quedó registrada con su nota', '2026-11-12 · true · Dato de prueba: en firme',
       coalesce(d.vencimiento_plazo::text, 'NULL') || ' · ' || coalesce(d.en_firme::text, 'NULL') || ' · ' || coalesce(d.firmeza_nota, 'NULL'),
       d.vencimiento_plazo = '2026-11-12' and d.en_firme and d.firmeza_nota = 'Dato de prueba: en firme'
  from public.tributario_iva_declaraciones d where d.organization_id = 374 and d.desde = '2026-09-01' and d.hasta = '2026-10-31';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'R1: retirar con la declaración en firme (art. 714 ET)', 'DECLARACION_EN_FIRME', x.o, x.o = 'DECLARACION_EN_FIRME'
  from (select pg_temp.dec('je_r1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'R25: retirar pasado el año siguiente al vencimiento (art. 589 ET)', 'CORRECCION_FUERA_DE_TERMINO', x.o, x.o = 'CORRECCION_FUERA_DE_TERMINO'
  from (select pg_temp.dec('je_r25_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2025-03-01","periodo_hasta":"2025-04-30","fundamento":"La operación no existió"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Se corrige la firmeza: NO está en firme', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R5","presentada_en":"2026-11-05","en_firme":false,"firmeza_nota":"Dato de prueba: dentro del término","correccion_dian":{"numero":"SOL-589-PRUEBA-R5","fecha":"2026-11-06","resultado":"aceptada","resultado_fecha":"2026-11-09","soporte":"Dato de prueba: liquidación oficial de corrección"}}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'R1: retirar la venta en su bimestre declarado, todavía corregible', 'OK retirar_venta', x.o, x.o = 'OK retirar_venta'
  from (select pg_temp.dec('je_r1_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; se corrige la declaración de septiembre–octubre"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', x.v, x.e, x.o, x.o = x.e from (values
  ('R2: nota crédito decidida en septiembre–octubre (la nota es del 8 de noviembre)', 'PERIODO_NO_CORRESPONDE_A_LA_NOTA',
   pg_temp.dec('je_r2_rev', '{"tratamiento":"nota_credito","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"Factura validada: se trata con su nota crédito"}')),
  ('R2: nota crédito en el bimestre de la nota (noviembre–diciembre)', 'OK nota_credito',
   pg_temp.dec('je_r2_rev', '{"tratamiento":"nota_credito","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"Factura validada: la nota crédito baja el IVA en su bimestre (Oficio 902997 de 2021)"}'))
) x(v, e, o);

-- Ronda 6 (respuesta 8): los retiros (corrección de error «retirar_venta») los aprueba un segundo usuario.
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ub'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', 'Ronda 6: B (segundo usuario) aprueba el retiro de ' || upper(x.k), 'aprobado', x.o, x.o = 'aprobado'
  from (select k, pg_temp.apr('je_' || k || '_rev', true) o from (values ('q4'), ('q5'), ('r1')) v(k)) x;
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;

-- Borrador septiembre–octubre con R1 retirada y la declaración corregible.
insert into ctx values ('bso1', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);

-- ── D · Cierre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', x.v, x.e, x.o, x.o = x.e from (values
  ('A registra el cierre con soporte y explicación', 'OK',
   pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R5","soporte_fecha":"2026-11-08","nota":"Traslado de saldos por el cierre; no crea IVA generado ni descontable"}')),
  ('A registra el pago a la DIAN', 'OK',
   pg_temp.nat('je_pg', '{"naturaleza":"pago_dian","soporte_tipo":"recibo_pago_dian","soporte":"Recibo 490 R5","soporte_fecha":"2026-11-08"}')),
  ('A aprueba su propio cierre', 'APROBACION_MISMO_USUARIO', pg_temp.apr('je_ce', true))
) x(v, e, o);
insert into ctx values ('bc1', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ub'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', x.v, x.e, x.o, x.o = x.e from (values
  ('B aprueba el pago a la DIAN (ronda 6: también se aprueba, como todo lo que se propone «no afecta»)', 'aprobado', pg_temp.apr('je_pg', true)),
  ('B (segundo usuario) aprueba el cierre', 'aprobado', pg_temp.apr('je_ce', true))
) x(v, e, o);
insert into ctx values ('bc2', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
reset role;
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'A vuelve a guardar el cierre', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R5 (corregido)","soporte_fecha":"2026-11-08","nota":"Traslado de saldos por el cierre; no crea IVA generado ni descontable"}') o) x;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'Al volver a guardarlo, la aprobación del segundo usuario se borró', 'sin aprobar',
       case when n.aprobado_por is null then 'sin aprobar' else 'aprobado' end, n.aprobado_por is null
  from public.tributario_iva_naturaleza_asiento n where n.organization_id = 374 and n.journal_entry_id = (select v::int from ctx where k = 'je_ce');
insert into ctx values ('bc3', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', 'anon: aprobar un cierre', 'permission denied…', left(x.o, 40), x.o like 'permission denied%'
  from (select pg_temp.apr('je_ce', true) o) x;
reset role;

-- La declaración de septiembre–octubre pasa a EN FIRME después de decidir: la venta vuelve (se revisa al calcular).
select set_config('request.jwt.claims', (select v from ctx where k = 'ua'), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', 'Después de decidir, se registra que la declaración quedó en firme', 'OK', x.o, x.o = 'OK'
  from (select pg_temp.decl('2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-R5","presentada_en":"2026-11-05","en_firme":true,"firmeza_nota":"Dato de prueba: quedó en firme"}') o) x;
insert into ctx values ('bso2', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);
insert into ctx values ('bn2', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
reset role;

create temp view casilla as
select b.k as borrador, (c ->> 'casilla')::int as casilla, (c ->> 'valor')::numeric as valor, c
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'casillas') c where b.k in ('bc1', 'bc2', 'bc3', 'bso1', 'bso2', 'bn2');
create temp view casilla_59 as
select b.k as borrador, x ->> 'documento_id' as documento_id
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'casillas') c, jsonb_array_elements(c -> 'origenes') x
 where b.k in ('bc1', 'bc2', 'bc3', 'bso1', 'bso2', 'bn2') and (c ->> 'casilla')::int = 59;
create temp view otros as
select b.k as borrador, (o ->> 'asiento')::int as asiento, o
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'otros_movimientos') o where b.k in ('bc1', 'bc2', 'bc3', 'bso1', 'bso2', 'bn2');
create temp view pend as
select b.k as borrador, p ->> 'motivo' as motivo, x ->> 'documento_id' as documento_id, (x ->> 'base')::numeric as base
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'pendientes') p, jsonb_array_elements(p -> 'origenes') x where b.k in ('bc1', 'bc2', 'bc3', 'bso1', 'bso2', 'bn2');

-- ── A · Casilla 47 en el borrador de noviembre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', 'Casilla 47 = I1 300.000 + I2 50.000 + I6 20.000 (solo importación excluida con el soporte completo)', '370000',
       coalesce(round(valor)::text, 'NO ESTÁ'), valor = 370000
  from casilla where borrador = 'bc2' and casilla = 47;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'A', x.v, x.e, coalesce((select p.motivo || ' · base ' || round(p.base) from pend p where p.borrador = 'bc2' and p.documento_id = (select v from ctx where k = x.k) limit 1), 'NO ESTÁ PENDIENTE'),
       coalesce((select p.motivo || ' · base ' || round(p.base) from pend p where p.borrador = 'bc2' and p.documento_id = (select v from ctx where k = x.k) limit 1), '') = x.e
  from (values
    ('I3: base 100.000 ≠ 90.000 + 5.000', 'importacion_base_no_coincide · base 100000', 'fi3'),
    ('I4: sin la norma de exclusión citada', 'importacion_sin_soporte_aduanero · base 60000', 'fi4'),
    ('I5: otro documento aduanero sin explicación', 'importacion_sin_soporte_aduanero · base 20000', 'fi5'),
    ('I7: importación exenta sin el artículo de la exención ni la zona franca (ronda 6)', 'importacion_sin_soporte_aduanero · base 40000', 'fi7'),
    ('I8: tráfico postal con declaración de importación', 'importacion_documento_no_corresponde · base 30000', 'fi8')
  ) x(v, e, k);

-- ── B · El borrador de noviembre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', x.v, x.e, coalesce(y.o, 'NO ESTÁ'), y.o = x.e from (values
  ('Q1 (expediente incompleto): la venta sigue en la 59', 'en 59 · correccion_incompleta', 'q1'),
  ('Q2 (consulta dentro de las 48 horas, sin decisión): la venta sigue en la 59', 'en 59 · correccion_sin_decision', 'q2'),
  ('Q3 (ronda 6: falla que cubre la venta, expedida en contingencia): sigue en la 59', 'en 59 · correccion_incompleta', 'q3'),
  ('Q4 (no expedida): sale de la 59', 'no en 59 · no_afecta', 'q4'),
  ('Q5 (cobro devuelto con su soporte): sale de la 59', 'no en 59 · no_afecta', 'q5')
) x(v, e, k)
cross join lateral (select
  case when exists (select 1 from casilla_59 c where c.borrador = 'bc2' and c.documento_id = (select v from ctx where k = x.k)) then 'en 59' else 'no en 59' end
  || ' · ' || coalesce((select coalesce(o ->> 'motivo', o ->> 'destino') from otros where borrador = 'bc2' and asiento = (select v::int from ctx where k = 'je_' || x.k || '_rev')), 'SIN REVERSA') as o) y;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'B', 'Q4: el detalle de la corrección dice que la factura se trata como no expedida; Q3 no', 'Q4 true · Q3 false',
       'Q4 ' || coalesce((select o -> 'correccion' ->> 'tratada_como_no_expedida' from otros where borrador = 'bc2' and asiento = (select v::int from ctx where k = 'je_q4_rev')), 'NULL')
       || ' · Q3 ' || coalesce((select o -> 'correccion' ->> 'tratada_como_no_expedida' from otros where borrador = 'bc2' and asiento = (select v::int from ctx where k = 'je_q3_rev')), 'NULL'),
       (select o -> 'correccion' ->> 'tratada_como_no_expedida' from otros where borrador = 'bc2' and asiento = (select v::int from ctx where k = 'je_q4_rev')) = 'true'
       and (select o -> 'correccion' ->> 'tratada_como_no_expedida' from otros where borrador = 'bc2' and asiento = (select v::int from ctx where k = 'je_q3_rev')) = 'false';

-- ── C · Período declarado en el borrador ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'C', x.v, x.e, x.o, x.o = x.e from (values
  ('Septiembre–octubre, declaración corregible: R1 sale de la 59 de su bimestre', 'no en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bso1' and c.documento_id = (select v from ctx where k = 'r1')) then 'en 59' else 'no en 59' end),
  ('Septiembre–octubre, ya EN FIRME: R1 vuelve a la 59 aunque haya decisión', 'en 59',
   case when exists (select 1 from casilla_59 c where c.borrador = 'bso2' and c.documento_id = (select v from ctx where k = 'r1')) then 'en 59' else 'no en 59' end),
  ('Noviembre, ya en firme: la reversa de R1 queda pendiente «correccion_declaracion_no_corregible»', 'pendiente · correccion_declaracion_no_corregible',
   coalesce((select (o ->> 'destino') || ' · ' || coalesce(o ->> 'motivo', '—') from otros where borrador = 'bn2' and asiento = (select v::int from ctx where k = 'je_r1_rev')), 'NO ESTÁ')),
  ('Noviembre: la alerta de la corrección muestra el vencimiento y la firmeza registrados', '2026-11-12 · en firme true · no corregible true',
   coalesce((select (a -> 'periodo_declarado' ->> 'vencimiento_plazo') || ' · en firme ' || (a -> 'periodo_declarado' ->> 'en_firme')
                    || ' · no corregible ' || (a ->> 'declaracion_no_corregible')
               from ctx b, jsonb_array_elements(b.v::jsonb -> 'alertas' -> 'correcciones_declaracion_anterior') a
              where b.k = 'bn2' and (a ->> 'asiento')::int = (select v::int from ctx where k = 'je_r1_rev')), 'NO ESTÁ')),
  ('Noviembre: R2 tratada por nota crédito; la venta se queda y la reversa pendiente', 'pendiente · correccion_por_nota_credito',
   coalesce((select (o ->> 'destino') || ' · ' || coalesce(o ->> 'motivo', '—') from otros where borrador = 'bn2' and asiento = (select v::int from ctx where k = 'je_r2_rev')), 'NO ESTÁ')),
  ('Catálogo: la devolución de ventas va a la 42 (base) con su IVA en la 79', '42 base 79 · 79 iva 42',
   (select string_agg((c ->> 'casilla') || ' ' || (c ->> 'tipo') || ' ' || (c ->> 'par'), ' · ' order by (c ->> 'casilla')::int)
      from casilla where borrador = 'bn2' and casilla in (42, 79)))
) x(v, e, o);

-- ── D · El cierre en el borrador ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'D', x.v, x.e, coalesce(y.o, 'NO ESTÁ'), y.o = x.e from (values
  ('Registrado sin la aprobación del segundo usuario: pendiente', 'pendiente · cierre_sin_aprobacion · aprobado false', 'bc1'),
  ('Aprobado por el segundo usuario: no afecta', 'no_afecta · — · aprobado true', 'bc2'),
  ('Guardado otra vez (la aprobación se borró): pendiente', 'pendiente · cierre_sin_aprobacion · aprobado false', 'bc3')
) x(v, e, b)
cross join lateral (select (o ->> 'destino') || ' · ' || coalesce(o ->> 'motivo', '—') || ' · aprobado ' || coalesce(o ->> 'cierre_aprobado', 'NULL') as o
                      from otros where borrador = x.b and asiento = (select v::int from ctx where k = 'je_ce')) y;

-- ── E · Cuenta por línea ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', x.v, 'SIN ASIENTO · iva_no_descontable_por_corregir · ' || x.texto, y.o, y.o = 'SIN ASIENTO · iva_no_descontable_por_corregir · ' || x.texto
  from (values
    ('FTR: un bien gravado no descontable y uno excluido con cuenta de cabecera', 'más de una línea', 'ftr'),
    ('FDX: un bien no descontable y uno proporcional con cuenta de cabecera', 'más de una línea', 'fdx'),
    -- Ronda 6: FDD deja de ser el control positivo de la cabecera (dos líneas con IVA no descontable).
    ('FDD: dos bienes no descontables con cuenta de cabecera (ronda 6: más de una línea)', 'más de una línea', 'fdd')
  ) x(v, texto, k)
  cross join lateral (select case when exists (select 1 from public.journal_entries je where je.organization_id = 374 and je.source_id = (select v from ctx where k = x.k))
                                  then 'CON ASIENTO' else 'SIN ASIENTO' end
                             || ' · ' || coalesce((select max(f.reason) from public.journal_entry_failures f
                                                    where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                                                      and f.source_id = (select v from ctx where k = x.k)), 'SIN PENDIENTE')
                             || ' · ' || case when exists (select 1 from public.journal_entry_failures f
                                                            where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                                                              and f.source_id = (select v from ctx where k = x.k) and f.detail like '%' || x.texto || '%')
                                              then x.texto else 'otro motivo' end as o) y;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', x.v, x.e, coalesce(left(x.o, length(x.e)), 'NULL'), coalesce(left(x.o, length(x.e)), 'NULL') = x.e from (values
  ('Activo fijo (cabecera 152405) con un servicio', 'IVA no descontable en una compra que mezcla activos fijos',
   public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fas'), '152405')),
  ('Activo fijo (cabecera 152405) con un bien inventariable', 'IVA no descontable en una compra que mezcla activos fijos',
   public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fai'), '152405')),
  ('Activo fijo (cabecera 152405) con dos bienes no inventariables de igual tratamiento (ronda 6: exige cuenta por línea)', 'IVA no descontable en una compra de más de una línea',
   public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fdd'), '152405')),
  ('El servicio hacia una cuenta de gasto (519525): cuenta única', 'NULL',
   public.fn_iva_no_descontable_cuenta_unica_fallo((select v::uuid from ctx where k = 'fas'), '519525'))
) x(v, e, o);
-- El ejemplo de la ronda 3 con cuenta por línea: 34.200 al costo de sus líneas y 27.800 descontables.
create temp view lineas_fchl as
select l.account_code as cuenta, round(sum(l.debit)) as d, round(sum(l.credit)) as c
  from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
 where je.organization_id = 374 and je.source_id = (select v from ctx where k = 'fchl')
 group by l.account_code;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'FCHL (ejemplo de la ronda 3 con cuenta por línea): IVA descontable en la 2408', '24081001 D 22800 + 24081002 D 5000',
       coalesce(string_agg(cuenta || ' D ' || d, ' + ' order by cuenta) filter (where cuenta like '2408%'), 'SIN 2408'),
       coalesce(string_agg(cuenta || ' D ' || d, ' + ' order by cuenta) filter (where cuenta like '2408%'), '') = '24081001 D 22800 + 24081002 D 5000'
  from lineas_fchl;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'FCHL: cada cuenta recibe el IVA no descontable de SU línea (débito − base de esa línea)', '14350101 +0 · 513595 +15200 · 519525 +19000',
       string_agg(l.cuenta || ' +' || (l.d - b.base), ' · ' order by l.cuenta),
       string_agg(l.cuenta || ' +' || (l.d - b.base), ' · ' order by l.cuenta) = '14350101 +0 · 513595 +15200 · 519525 +19000'
  from lineas_fchl l join (values ('519525', 100000), ('513595', 200000), ('14350101', 100000)) b(cta, base) on b.cta = l.cuenta;
-- Ronda 6 (hallazgo corregido por 20261110150000): la base del documento (400.000) se reparte por la BASE ANTES DE IVA de
-- cada línea, no por su total con IVA. Antes: 90.909 / 221.261 / 122.030.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'E', 'Ronda 6: con tarifas distintas la base se reparte por la base antes de IVA de cada línea',
       '14350101 D 100000 · 513595 D 215200 · 519525 D 119000 · C 462000',
       string_agg(cuenta || ' D ' || d, ' · ' order by cuenta) filter (where cuenta in ('14350101', '513595', '519525')) || ' · C ' || sum(c),
       string_agg(cuenta || ' D ' || d, ' · ' order by cuenta) filter (where cuenta in ('14350101', '513595', '519525')) || ' · C ' || sum(c)
         = '14350101 D 100000 · 513595 D 215200 · 519525 D 119000 · C 462000'
  from lineas_fchl;

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
