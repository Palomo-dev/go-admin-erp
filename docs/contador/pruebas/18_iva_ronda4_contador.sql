-- Pruebas · Ronda 4 del Contador (2026-11-09, docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md), «IVA»:
--   1. IVA no descontable inconsistente → documento pendiente de corregir (sin asiento); sin cuenta única de cabecera
--      cuando las líneas son de activos o gastos distintos (o servicios hacia inventarios).
--   2. Devolución de compra sobre el asiento existente: soporte del proveedor, sin duplicar la nota, sin exceder la
--      línea; base en la 56 y el IVA recuperado en la 66, por separado.
--   3. Casilla 47: soporte aduanero estructurado; un servicio del exterior no va a la 47.
--   4. Operación inexistente: expediente estructurado; completarlo NO retira la venta; la decisión explícita de
--      tratamiento y período sí; sin nota crédito + retiro; sin neutralizar períodos distintos como uno.
--   5. Límites: la tarifa del POS inferida queda señalada; un asiento de cierre no se excluye solo.
-- Proyecto taqjemqjtumhwptchcxk · Organización de pruebas 374 (sede 585). NO DEJA DATOS (begin … rollback).
-- Requiere, en este orden y SIN aplicar: 20261108140000 (H1), 20261108150000, 20261108150500, 20261108151000 y
-- 20261108152000. Se pegan donde dice «MIGRACIONES», dentro de la misma transacción.
-- Usuario simulado: el miembro activo de la org 374 (sesión con RLS y auth.uid()).
--
-- RONDA 5 (2026-11-09): se vuelve a correr con las migraciones reescritas. Para que siga probando lo de la ronda 4, sus
-- DATOS cumplen ahora los requisitos nuevos (los esperados no cambian, salvo los dos que se dicen abajo):
--   · la importación FIM2 lleva valor en aduana (280.000) + aranceles (20.000) = base 300.000 y la norma de exclusión;
--   · el expediente «nunca transmitida» lleva la constancia de que no hay soporte de contingencia y la consulta del
--     CUFE/CUDE sin resultado; las ventas PA…PI son de hace 3 días (la consulta, de hoy, queda pasadas las 48 horas) y la
--     de PE se hizo 1 hora después de la venta (dentro de las 48 horas: por eso no descarta la contingencia);
--   · el bimestre declarado septiembre–octubre registra su vencimiento (12-11-2026, dato de prueba) y que NO está en firme;
--   · el cierre registrado lo aprueba un segundo usuario (el dueño de la org 137, agregado como miembro DENTRO de la
--     transacción).
-- Esperados que cambian, y por qué: el borrador es ahora la versión 6 (tres filas); «PE» devuelve ahora también el detalle del rechazo ([plazo_48_horas]); y la compra de
-- control FCB (una línea no descontable y otra descontable, con cuenta de cabecera) queda pendiente de corregir, porque la
-- ronda 5 exige la cuenta por línea cuando el IVA tiene deducibilidad distinta (respuesta 5). El control positivo de la
-- cuenta de cabecera pasa a la prueba 23.
--
-- RONDA 6 (2026-11-10): se vuelve a correr con las migraciones reescritas. DATOS que cambian para que siga probando lo
-- de la ronda 4 (los esperados no cambian por ellos):
--   · el bimestre declarado septiembre–octubre registra la solicitud de corrección presentada ante la DIAN, aceptada
--     (número, fecha y resultado: datos de prueba), que la ronda 6 exige para retirar la venta PO de un período declarado
--     (art. 589 ET, respuesta 4);
--   · PE lleva el soporte de una falla del facturador que NO cubre la fecha de la venta (el día siguiente) y la consulta
--     del CUFE/CUDE hecha 1 hora después de la venta: sin la regla de 48 horas desde el fin de la falla, PE ya no probaría
--     «contingencia sin descartar», porque sin falla registrada la consulta vale desde la venta (respuesta 2);
--   · el segundo usuario aprueba también los retiros de PA y PO (respuesta 8): dos filas nuevas.
-- Esperados que cambian, y por qué: el borrador es la versión 7 (tres filas); FCM y FCB, compras de dos líneas con IVA no
-- descontable y cuenta de cabecera, siguen sin asiento y pendientes de corregir, pero el motivo es ahora el de la ronda 6
-- («compra de más de una línea»: toda compra con IVA no descontable y más de una línea exige cuenta por línea,
-- respuesta 5).

begin;

-- ═══ MIGRACIONES (solo en la prueba en seco, mientras no estén aplicadas) ═══

create temp table r (n serial primary key, escenario text, verificacion text, esperado text, obtenido text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;
insert into ctx select 'max_fallo', coalesce(max(id), 0)::text from public.journal_entry_failures where organization_id = 374;
with s as (insert into public.suppliers (organization_id, name, nit, supplier_type) values (374, 'Proveedor de prueba R4', '900000044', 'company') returning id)
insert into ctx select 'sup', id::text from s;
with p as (insert into public.products (organization_id, sku, name, product_type, track_stock)
           values (374, 'PRUEBA-R4-BIEN', 'Bien de prueba R4', 'product', false), (374, 'PRUEBA-R4-SERV', 'Servicio de prueba R4', 'service', false)
           returning id, sku)
insert into ctx select lower(replace(sku, 'PRUEBA-R4-', 'p_')), id::text from p;
-- La org 374 solo tiene la título 1435: se crea el auxiliar dentro de la transacción (se revierte), como en la prueba 17.
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, false, c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('143501', 'Mercancías no fabricadas por la empresa', '1435', false), ('14350101', 'Mercancías de prueba', '143501', true)) x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '1435'
   and not exists (select 1 from public.chart_of_accounts e where e.organization_id = 374 and e.account_code = x.code);
update public.configuracion_contable set account_code = '14350101' where organization_id = 374 and clave = 'inventario';

-- ═══ 1 · Compras: inconsistencia y cuenta única de cabecera (152000) ═══
with f as (insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date)
           select 374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-R4-' || x.n, 'draft', 'COP', now()
             from (values ('FCI'), ('FCM'), ('FCSV'), ('FCB'), ('FCR'), ('FIM1'), ('FIM2'), ('FIM3')) x(n)
           returning id, number_ext)
insert into ctx select lower(replace(number_ext, 'PRUEBA-R4-', '')), id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, product_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select (select v::uuid from ctx where k = x.d), 'purchase', (select v::uuid from ctx where k = x.d), (select v::int from ctx where k = x.p), x.descr, 1, x.pr, x.t, x.c, x.tot
  from (values ('fci', 'p_bien', 'Bien no descontable (cabecera inconsistente)', 100000, 19, 'IVA_19', 119000),
               ('fcm', 'p_bien', 'Bien no descontable', 100000, 19, 'IVA_19', 119000),
               ('fcm', 'p_serv', 'Servicio descontable', 100000, 19, 'IVA_19', 119000),
               ('fcsv', 'p_serv', 'Servicio no descontable', 100000, 19, 'IVA_19', 119000),
               ('fcb', 'p_bien', 'Bien no descontable control', 100000, 19, 'IVA_19', 119000),
               ('fcb', 'p_bien', 'Bien descontable control', 100000, 19, 'IVA_19', 119000),
               ('fcr', 'p_bien', 'Bien descontable devuelto', 500000, 19, 'IVA_19', 595000),
               ('fim1', 'p_bien', 'Importación sin soporte aduanero', 200000, 0, null, 200000),
               ('fim2', 'p_bien', 'Importación con soporte aduanero', 300000, 0, null, 300000),
               ('fim3', 'p_serv', 'Servicio del exterior', 80000, 0, null, 80000)) x(d, p, descr, pr, t, c, tot);
-- FCI: la cabecera dice IVA 10.000, pero la línea no descontable tiene 19.000 (inconsistencia).
update public.invoice_purchase set tax_total = 10000, total = 110000 where id = (select v::uuid from ctx where k = 'fci');
-- DSI: documento soporte (asiento por líneas) con IVA de cabecera 5.000 y línea no descontable de 19.000.
with d as (insert into public.support_documents (organization_id, branch_id, supplier_id, reference_code, provider, issue_date,
                                                 subtotal, tax_total, total, currency, status, tax_included)
           values (374, 585, (select v::int from ctx where k = 'sup'), 'PRUEBA-R4-DSI', '{"names":"Proveedor de prueba R4"}'::jsonb, now(),
                   100000, 5000, 105000, 'COP', 'draft', false) returning id)
insert into ctx select 'dsi', id::text from d;
insert into public.invoice_items (invoice_id, invoice_type, support_document_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'support_document', v::uuid, 'Servicio no descontable (cabecera inconsistente)', 1, 100000, 19, 'IVA_19', 119000 from ctx where k = 'dsi';

-- Evaluación y clasificación por un usuario miembro, ANTES de contabilizar.
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_err text;
begin
  perform public.fn_iva_clasificar_linea(374, 'invoice_items', it.id, x.datos::jsonb)
     from public.invoice_items it
     join (values
       ('Bien no descontable (cabecera inconsistente)', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
       ('Bien no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
       ('Servicio descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas"}'),
       ('Servicio no descontable', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Gasto no imputable a operaciones gravadas"}'),
       ('Bien no descontable control', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"no_descontable","descontable_motivo":"Destinado a una operación excluida (art. 488)"}'),
       ('Bien descontable control', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas"}'),
       ('Bien descontable devuelto', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","descontable":"descontable","descontable_motivo":"Destinado a operaciones gravadas"}'),
       ('Servicio no descontable (cabecera inconsistente)', '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"servicios","descontable":"no_descontable","descontable_motivo":"Compra a un no responsable"}'),
       ('Importación sin soporte aduanero', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"Bien excluido en la importación (art. 428 ET), según texto"}'),
       ('Importación con soporte aduanero', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"Bien excluido en la importación (art. 428 ET)","soporte_aduanero":{"tipo_documento":"declaracion_importacion","numero":"DI-PRUEBA-0001","fecha":"2026-11-03","adjunto":"documentos/prueba/DI-PRUEBA-0001.pdf","valor_aduana":280000,"aranceles":20000,"valor":300000,"norma_exclusion":"ET art. 428 lit. e)","fundamento_exclusion":"Art. 428 lit. e) ET","modalidad":"importacion_ordinaria"}}'),
       ('Servicio del exterior', '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"Servicio prestado desde el exterior","soporte_aduanero":{"tipo_documento":"otro_documento_aduanero","numero":"X-1","fecha":"2026-11-03","adjunto":"documentos/prueba/X-1.pdf","valor":80000,"fundamento_exclusion":"Texto de prueba","modalidad":"otra_modalidad"}}')
     ) x(descr, datos) on it.description = x.descr
    where it.invoice_purchase_id in (select v::uuid from ctx where k in ('fci', 'fcm', 'fcsv', 'fcb', 'fcr', 'fim1', 'fim2', 'fim3'))
       or it.support_document_id = (select v::uuid from ctx where k = 'dsi');

  -- Casilla 47 · validaciones del soporte aduanero.
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.description = 'Bien descontable devuelto' and it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcr')),
          '{"tratamiento":"gravada","tarifa":19,"tipo_operacion":"bienes","soporte_aduanero":{"numero":"DI-1"}}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, '3', 'Soporte aduanero en una línea que no es importación', 'rechaza: SOPORTE_ADUANERO_SOLO_IMPORTACION', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_ADUANERO_SOLO_IMPORTACION');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.description = 'Importación sin soporte aduanero'),
          '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"modalidad":"contrabando"}}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, '3', 'Modalidad de importación que no existe', 'rechaza: SOPORTE_ADUANERO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_ADUANERO_INVALIDO');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.description = 'Importación sin soporte aduanero'),
          '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":{"fecha":"2026-13-45"}}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, '3', 'Fecha del documento aduanero imposible', 'rechaza: SOPORTE_ADUANERO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_ADUANERO_INVALIDO');
  v_err := null;
  begin perform public.fn_iva_clasificar_linea(374, 'invoice_items',
          (select it.id from public.invoice_items it where it.description = 'Importación sin soporte aduanero'),
          '{"tratamiento":"excluida","tarifa":0,"tipo_operacion":"importacion","fundamento":"x","soporte_aduanero":"declaración de importación 123 (texto libre)"}');
  exception when others then v_err := sqlerrm; end;
  insert into r values (default, '3', 'Soporte aduanero como texto libre', 'rechaza: SOPORTE_ADUANERO_INVALIDO', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'SOPORTE_ADUANERO_INVALIDO');
end
$$;
reset role;

-- Contabilización (al recibir; documento soporte por líneas).
update public.invoice_purchase set status = 'received'
 where id in (select v::uuid from ctx where k in ('fci', 'fcm', 'fcsv', 'fcb', 'fcr', 'fim1', 'fim2', 'fim3'));
insert into ctx select 'je_dsi', coalesce(public.fn_asiento_documento_por_lineas((select v::uuid from ctx where k = 'dsi'), 'documento_soporte', 'prueba:r4:dsi')::text, 'NULL');

-- ═══ 4 y 5 · Ventas POS, reversas, cierre ═══
with s as (insert into public.sales (organization_id, branch_id, user_id, status, subtotal, tax_total, total, tax_included, sale_date, notes)
           select 374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 'paid', 100000, 19000, 119000, false, x.f, x.n
             from (values ('PA', now() - interval '3 days'), ('PB', now() - interval '3 days'), ('PC', now() - interval '3 days'),
                          ('PD', now() - interval '3 days'), ('PE', now() - interval '3 days'), ('PF', now() - interval '3 days'),
                          ('PG', now() - interval '3 days'), ('PI', now() - interval '3 days'),
                          ('PO', '2026-10-15 12:00-05'::timestamptz)) x(n, f)
           returning id, notes)
insert into ctx select lower(notes), id::text from s;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate)
select (select v::uuid from ctx where k = x.k), (select v::int from ctx where k = 'p_bien'), 1, 100000, 100000, 19000, 0
  from (values ('pa'), ('pb'), ('pc'), ('pd'), ('pe'), ('pf'), ('pg'), ('pi'), ('po')) x(k);
set constraints trg_auto_journal_sale_pos immediate;
insert into ctx select 'je_' || x.k, (select min(id) from public.journal_entries where organization_id = 374 and source = 'sales' and source_id = (select v from ctx where k = x.k))::text
  from (values ('pa'), ('pb'), ('pc'), ('pd'), ('pe'), ('pf'), ('pg'), ('pi'), ('po')) x(k);
insert into ctx select 'je_' || x.k || '_rev', public.fn_revertir_asiento_en_fecha((select v::int from ctx where k = 'je_' || x.k), 'anulacion_pago', 'prueba-r4-' || x.k, now(), null)::text
  from (values ('pa'), ('pb'), ('pc'), ('pd'), ('pe'), ('pf'), ('pg'), ('po')) x(k);

-- Asientos sin documento con líneas: devoluciones a proveedor (sobre el asiento existente) y un cierre de ejercicio.
set constraints all deferred;
with e as (insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, fact_key)
           select 374, 585, now(), x.memo, true, x.src, 'prueba:r4:' || x.k
             from (values ('ncr1', 'Devolución a proveedor R4 1', 'manual'), ('ncr2', 'Devolución a proveedor R4 2', 'manual'),
                          ('ncr3', 'Devolución a proveedor R4 3', 'manual'), ('ce', 'Cierre de ejercicio (prueba R4)', 'cierre_ejercicio')) x(k, memo, src)
           returning id, fact_key)
insert into ctx select 'je_' || replace(fact_key, 'prueba:r4:', ''), id::text from e;
insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
select (select v::int from ctx where k = 'je_' || x.k), x.cta, x.descr, x.d, x.c
  from (values ('ncr1', '22050501', 'Proveedor', 119000, 0), ('ncr1', '14350101', 'Inventario devuelto', 0, 100000), ('ncr1', '24081001', 'IVA devuelto', 0, 19000),
               ('ncr2', '22050501', 'Proveedor', 59500, 0), ('ncr2', '14350101', 'Inventario devuelto', 0, 50000), ('ncr2', '24081001', 'IVA devuelto', 0, 9500),
               ('ncr3', '22050501', 'Proveedor', 11900, 0), ('ncr3', '14350101', 'Inventario devuelto', 0, 10000), ('ncr3', '24081001', 'IVA devuelto', 0, 1900),
               ('ce', '24080501', 'Cierre', 10000, 0), ('ce', '14350101', 'Cierre', 0, 10000)) x(k, cta, descr, d, c);
set constraints all immediate;

-- Octubre (bimestre septiembre–octubre) se registra como DECLARADO; la venta PO es de octubre y su reversa de noviembre.
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
select public.fn_tributario_iva_declaracion_guardar(374, '2026-09-01', '2026-10-31', '{"numero_formulario":"PRUEBA-300-SEPOCT","presentada_en":"2026-11-05","vencimiento_plazo":"2026-11-12","en_firme":false,"firmeza_nota":"Dato de prueba: dentro del término de revisión","correccion_dian":{"numero":"SOL-589-PRUEBA-R4","fecha":"2026-11-06","resultado":"aceptada","resultado_fecha":"2026-11-09","soporte":"Dato de prueba: liquidación oficial de corrección"}}');

-- Ayudantes.
create function pg_temp.nat(p_k text, p_d jsonb) returns text language plpgsql as $$
begin
  perform public.fn_iva_naturaleza_asiento_guardar(374, (select v::int from ctx where k = p_k), p_d);
  return 'OK';
exception when others then return sqlerrm;
end $$;
create function pg_temp.dec(p_k text, p_d jsonb) returns text language plpgsql as $$
declare v_det text;
begin
  return 'OK ' || (public.fn_iva_correccion_error_decidir(374, (select v::int from ctx where k = p_k), p_d) ->> 'decision_tratamiento');
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlerrm || coalesce(' [' || nullif(v_det, '') || ']', '');
end $$;
grant execute on function pg_temp.nat(text, jsonb) to authenticated, anon;
grant execute on function pg_temp.dec(text, jsonb) to authenticated, anon;
insert into ctx values ('exp', ('{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta de revisión de caja R4","soporte_fecha":"2026-11-08","expediente_explicacion":"Venta registrada dos veces por error de la caja; no hubo cliente ni mercancía.","factura_referencia":"Venta POS de prueba","estado_electronico":"nunca_transmitida","contingencia_verificada":true,"contingencia_nota":"Sin documentos de contingencia ese día","entrega_prestacion":"no_hubo","entrega_soporte":"Kárdex sin salida","cobro":"no_hubo","cobro_soporte":"Arqueo de caja sin el recaudo","doc_electronico_resolucion":"constancia","doc_electronico_referencia":"CONST-R4-1","doc_electronico_fecha":"2026-11-08","corrige_declaracion_anterior":false,"contingencia_soporte_tipo":"sin_soporte_contingencia","consulta_cufe_resultado":"sin_resultado","consulta_cufe_soporte":"Consulta del CUFE en el catálogo de la DIAN, sin resultado"}'::jsonb
  || jsonb_build_object('consulta_cufe_en', now()))::text);

-- ── 2 · Devoluciones de compra ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '2', x.v, x.e, x.o, x.o = x.e from (values
  ('Devolución de una compra con un comprobante interno (no es la nota del proveedor)', 'DEVOLUCION_SOPORTE_INVALIDO',
   pg_temp.nat('je_ncr3', jsonb_build_object('naturaleza', 'devolucion_compra', 'soporte_tipo', 'comprobante_interno', 'soporte', 'CI-1', 'soporte_fecha', '2026-11-08',
     'invoice_purchase_id', (select v from ctx where k = 'fcr'), 'base', 10000, 'iva', 1900,
     'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id', (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcr')), 'base', 10000, 'iva', 1900))))),
  ('Devolución documentada sobre el asiento existente (nota crédito del proveedor NC-R4-1)', 'OK',
   pg_temp.nat('je_ncr1', jsonb_build_object('naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC-R4-1', 'soporte_fecha', '2026-11-08',
     'invoice_purchase_id', (select v from ctx where k = 'fcr'), 'base', 100000, 'iva', 19000,
     'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id', (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcr')), 'base', 100000, 'iva', 19000))))),
  ('La misma nota del proveedor sobre otro asiento', 'DEVOLUCION_DUPLICADA',
   pg_temp.nat('je_ncr2', jsonb_build_object('naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', ' nc-r4-1 ', 'soporte_fecha', '2026-11-08',
     'invoice_purchase_id', (select v from ctx where k = 'fcr'), 'base', 50000, 'iva', 9500,
     'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id', (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcr')), 'base', 50000, 'iva', 9500))))),
  ('Otra nota que, sumada a la primera, devuelve más que la base de la línea (100.000 + 450.000 > 500.000)', 'DEVOLUCION_EXCEDE_LINEA',
   pg_temp.nat('je_ncr2', jsonb_build_object('naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC-R4-2', 'soporte_fecha', '2026-11-08',
     'invoice_purchase_id', (select v from ctx where k = 'fcr'), 'base', 450000, 'iva', 9500,
     'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id', (select it.id from public.invoice_items it where it.invoice_purchase_id = (select v::uuid from ctx where k = 'fcr')), 'base', 450000, 'iva', 9500))))),
  ('Documento soporte con nota crédito (no con su nota de ajuste)', 'DEVOLUCION_DS_SIN_NOTA_AJUSTE',
   pg_temp.nat('je_ncr3', jsonb_build_object('naturaleza', 'devolucion_compra', 'soporte_tipo', 'nota_credito_proveedor', 'soporte', 'NC-DS', 'soporte_fecha', '2026-11-08',
     'support_document_id', (select v from ctx where k = 'dsi'), 'base', 10000, 'iva', 1900,
     'lineas', jsonb_build_array(jsonb_build_object('invoice_item_id', (select it.id from public.invoice_items it where it.support_document_id = (select v::uuid from ctx where k = 'dsi')), 'base', 10000, 'iva', 1900)))))
) x(v, e, o);

-- ── 4 · Expedientes de corrección de error (completar NO retira la venta) ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', x.v, x.e, x.o, x.o = x.e from (values
  ('PA: expediente completo («nunca transmitida», contingencia descartada, sin entrega ni cobro)', 'OK', pg_temp.nat('je_pa_rev', (select v::jsonb from ctx where k = 'exp'))),
  ('PB: expediente incompleto (solo el soporte)', 'OK', pg_temp.nat('je_pb_rev', '{"naturaleza":"correccion_error","soporte_tipo":"comprobante_interno","soporte":"Acta","soporte_fecha":"2026-11-08"}')),
  ('PC: factura validada por la DIAN, con su nota crédito electrónica', 'OK',
   pg_temp.nat('je_pc_rev', (select v::jsonb from ctx where k = 'exp') || '{"estado_electronico":"validada_dian","doc_electronico_resolucion":"nota_credito_electronica","doc_electronico_referencia":"NC-E-1","doc_electronico_fecha":"2026-11-08"}')),
  ('PD: rechazada en la validación de la DIAN, pero con una nota crédito registrada', 'OK',
   pg_temp.nat('je_pd_rev', (select v::jsonb from ctx where k = 'exp') || '{"estado_electronico":"rechazada_validacion_dian","doc_electronico_resolucion":"nota_credito_electronica","doc_electronico_referencia":"NC-E-2","doc_electronico_fecha":"2026-11-08"}')),
  ('PE: «nunca transmitida» sin descartar la contingencia', 'OK',
   pg_temp.nat('je_pe_rev', (select v::jsonb from ctx where k = 'exp') || '{"contingencia_verificada":false,"contingencia_nota":"La falla registrada es del día siguiente a la venta","contingencia_soporte_tipo":"soporte_falla_facturador","contingencia_soporte_referencia":"FALLA-R4-PE","contingencia_soporte_fecha":"2026-11-08"}'
     || jsonb_build_object('consulta_cufe_en', now() - interval '3 days' + interval '1 hour',
                           'contingencia_inicio_en', now() - interval '2 days', 'contingencia_fin_en', now() - interval '2 days' + interval '1 hour'))),
  ('PF: hubo entrega de la mercancía', 'OK', pg_temp.nat('je_pf_rev', (select v::jsonb from ctx where k = 'exp') || '{"entrega_prestacion":"hubo"}')),
  ('PG: rechazo COMERCIAL del comprador registrado como anulación ante la DIAN', 'DOCUMENTO_VALIDO_NO_SE_ANULA',
   pg_temp.nat('je_pg_rev', (select v::jsonb from ctx where k = 'exp') || '{"estado_electronico":"rechazo_comercial_comprador","doc_electronico_resolucion":"anulacion_dian"}')),
  ('PO (venta de octubre, reversa de noviembre): expediente completo, sin marcar la corrección de la declaración', 'OK',
   pg_temp.nat('je_po_rev', (select v::jsonb from ctx where k = 'exp'))),
  ('Corrección con un estado electrónico que no existe', 'ESTADO_ELECTRONICO_INVALIDO',
   pg_temp.nat('je_pg_rev', (select v::jsonb from ctx where k = 'exp') || '{"estado_electronico":"borrada"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'PB: lo que le falta al expediente', '{explicacion_del_error,factura,estado_electronico,entrega_o_prestacion,cobro,documento_electronico_resuelto,corrige_declaracion_anterior}',
       public.fn_iva_correccion_expediente_faltantes(n)::text,
       public.fn_iva_correccion_expediente_faltantes(n) = array['explicacion_del_error', 'factura', 'estado_electronico', 'entrega_o_prestacion', 'cobro', 'documento_electronico_resuelto', 'corrige_declaracion_anterior']
  from public.tributario_iva_naturaleza_asiento n where n.journal_entry_id = (select v::int from ctx where k = 'je_pb_rev');

-- ── 5 · Cierre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', x.v, x.e, x.o, x.o = x.e from (values
  ('Cierre sin soporte', 'SOPORTE_REQUERIDO', pg_temp.nat('je_ce', '{"naturaleza":"cierre"}')),
  ('Cierre con soporte y sin explicación', 'CIERRE_REQUIERE_EXPLICACION', pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R4","soporte_fecha":"2026-11-08"}'))
) x(v, e, o);

-- ═══ Borrador 1 (noviembre): expedientes guardados, SIN decisiones; cierre sin registrar ═══
insert into ctx values ('b1', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);

-- ── Decisiones de tratamiento y período ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', x.v, x.e, x.o, x.o = x.e from (values
  ('PB: decidir con el expediente incompleto', 'EXPEDIENTE_INCOMPLETO [explicacion_del_error,factura,estado_electronico,entrega_o_prestacion,cobro,documento_electronico_resuelto,corrige_declaracion_anterior]',
   pg_temp.dec('je_pb_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PA: tratamiento que no existe', 'TRATAMIENTO_INVALIDO', pg_temp.dec('je_pa_rev', '{"tratamiento":"borrar","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PA: sin fundamento', 'FUNDAMENTO_REQUERIDO', pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31"}')),
  ('PA: un mes (no es un período fiscal del IVA)', 'PERIODO_NO_FISCAL', pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-11-30","fundamento":"La operación no existió"}')),
  ('PA: rango que cruza el año (noviembre a febrero)', 'PERIODO_NO_FISCAL', pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2027-02-28","fundamento":"La operación no existió"}')),
  ('PA: período que no contiene la venta', 'PERIODO_NO_CORRESPONDE_A_LA_VENTA', pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2027-01-01","periodo_hasta":"2027-02-28","fundamento":"La operación no existió"}')),
  ('PA: «nota crédito» sin nota crédito electrónica en el expediente', 'NOTA_CREDITO_REQUERIDA', pg_temp.dec('je_pa_rev', '{"tratamiento":"nota_credito","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"Se trata con nota crédito"}')),
  ('PA: retirar la venta (noviembre–diciembre)', 'OK retirar_venta', pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió: expediente completo y sin documento válido"}')),
  ('PC: retirar una venta con factura validada', 'DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO', pg_temp.dec('je_pc_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PC: tratar por nota crédito (período de la nota)', 'OK nota_credito', pg_temp.dec('je_pc_rev', '{"tratamiento":"nota_credito","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"Factura validada: se trata con su nota crédito electrónica"}')),
  ('PD: retirar la venta y además descontar una nota crédito', 'NOTA_CREDITO_Y_RETIRO', pg_temp.dec('je_pd_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PE: «nunca transmitida» sin descartar la contingencia (consulta dentro de las 48 horas)', 'CONTINGENCIA_SIN_DESCARTAR [plazo_48_horas]', pg_temp.dec('je_pe_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PF: hubo entrega: la operación existió', 'OPERACION_EXISTIO', pg_temp.dec('je_pf_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PF: mantener la venta', 'OK mantener_venta', pg_temp.dec('je_pf_rev', '{"tratamiento":"mantener_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"Hubo entrega: la operación existió"}')),
  ('PO: retirar en noviembre–diciembre (la venta es de octubre)', 'PERIODO_NO_CORRESPONDE_A_LA_VENTA', pg_temp.dec('je_po_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PO: septiembre–diciembre mezcla el bimestre declarado con otro período', 'PERIODO_NO_COINCIDE_CON_DECLARADO', pg_temp.dec('je_po_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}')),
  ('PO: bimestre declarado sin marcar la corrección de esa declaración', 'DEBE_CORREGIR_DECLARACION', pg_temp.dec('je_po_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió"}'))
) x(v, e, o);
-- PO: se completa la marca de corrección (guardar el expediente borra cualquier decisión anterior) y se decide en su bimestre.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', x.v, x.e, x.o, x.o = x.e from (values
  ('PO: expediente con «sí corresponde corregir la declaración de septiembre–octubre»', 'OK',
   pg_temp.nat('je_po_rev', (select v::jsonb from ctx where k = 'exp') || '{"corrige_declaracion_anterior":true}')),
  ('PO: retirar la venta en SU bimestre (septiembre–octubre)', 'OK retirar_venta',
   pg_temp.dec('je_po_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-09-01","periodo_hasta":"2026-10-31","fundamento":"La operación no existió; se corrige la declaración de septiembre–octubre"}'))
) x(v, e, o);
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', 'Cierre con soporte y explicación', 'OK',
       pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R4","soporte_fecha":"2026-11-08","nota":"Traslado de saldos entre auxiliares por el cierre; no crea IVA generado ni descontable"}'),
       pg_temp.nat('je_ce', '{"naturaleza":"cierre","soporte_tipo":"comprobante_interno","soporte":"Comprobante de cierre R4","soporte_fecha":"2026-11-08","nota":"Traslado de saldos entre auxiliares por el cierre; no crea IVA generado ni descontable"}') = 'OK';
-- Ronda 5: el cierre lo aprueba un SEGUNDO usuario (el dueño de la org 137, miembro solo dentro de esta transacción).
reset role;
insert into public.organization_members (organization_id, user_id, role_id, is_active)
select 374, o.owner_user_id, 2, true from public.organizations o
 where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
select set_config('request.jwt.claims', (select json_build_object('sub', o.owner_user_id, 'role', 'authenticated')::text from public.organizations o where o.id = 137), true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', 'Ronda 5: el cierre lo aprueba un segundo usuario', 'aprobado', x.o, x.o = 'aprobado'
  from (select case when (public.fn_iva_naturaleza_asiento_aprobar(374, (select v::int from ctx where k = 'je_ce'), true, 'Revisado por el segundo usuario')
                          ->> 'aprobado_por') is not null then 'aprobado' else 'sin aprobar' end o) x;
-- Ronda 6 (respuesta 8): el retiro de la venta (corrección de error «retirar_venta») también lo aprueba el segundo usuario.
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'Ronda 6: el segundo usuario aprueba el retiro de ' || upper(x.k), 'aprobado', y.o, y.o = 'aprobado'
  from (values ('pa'), ('po')) x(k)
  cross join lateral (select case when (public.fn_iva_naturaleza_asiento_aprobar(374, (select v::int from ctx where k = 'je_' || x.k || '_rev'), true,
                                          'Revisado por el segundo usuario') ->> 'aprobado_por') is not null
                                  then 'aprobado' else 'sin aprobar' end o) y;
reset role;
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ Borrador 2 (noviembre) y borrador de septiembre–octubre, con las decisiones ═══
insert into ctx values ('b2', public.fn_tributario_borrador_iva_300(374, '2026-11-01', '2026-11-30')::text);
insert into ctx values ('bso', public.fn_tributario_borrador_iva_300(374, '2026-09-01', '2026-10-31')::text);
reset role;

-- Documento de cada asiento (para leer el borrador).
insert into ctx
select 'doc_' || je.id, coalesce((select upper(c.k) from ctx c where c.v = je.source_id and left(c.k, 3) <> 'je_' and left(c.k, 2) <> 'p_'),
                                 (select upper(replace(c.k, 'je_', '')) from ctx c where left(c.k, 3) = 'je_' and c.v = je.id::text), je.source)
  from public.journal_entries je where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
on conflict do nothing;
create temp view casilla_59 as
select b.k as borrador, x ->> 'documento_id' as documento_id, (x ->> 'tarifa_inferida')::boolean as inferida
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'casillas') c, jsonb_array_elements(c -> 'origenes') x
 where b.k in ('b1', 'b2', 'bso') and (c ->> 'casilla')::int = 59;
create temp view otros as
select b.k as borrador, (o ->> 'asiento')::int as asiento, o
  from ctx b, jsonb_array_elements(b.v::jsonb -> 'otros_movimientos') o
 where b.k in ('b1', 'b2', 'bso');

-- ── 1 · Resultado de la contabilización de compras ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '1', upper(x.doc) || ': ' || x.v, 'SIN ASIENTO · ' || x.motivo || ' · ' || x.prefijo || '…', y.o, y.o = 'SIN ASIENTO · ' || x.motivo || ' · ' || x.prefijo || '…'
  from (values
    ('fci', 'IVA no descontable (19.000) mayor que el IVA de cabecera (10.000): sin asiento, pendiente de corregir', 'iva_no_descontable_por_corregir',
     'IVA no descontable de las líneas (19000'),
    ('fcm', 'Cabecera con un bien y un servicio: sin cuenta única, pendiente de corregir', 'iva_no_descontable_por_corregir',
     'IVA no descontable en una compra de más de una línea'),
    ('fcsv', 'Servicio no descontable hacia la cuenta de inventarios: pendiente de corregir', 'iva_no_descontable_por_corregir',
     'IVA no descontable de servicios: la cuenta de cabecera de la compra es de inventarios'),
    ('dsi', 'Documento soporte por líneas con IVA no descontable mayor que su IVA: sin asiento', 'pendiente',
     'IVA no descontable de las líneas (19000')
  ) x(doc, v, motivo, prefijo)
  cross join lateral (select case when exists (select 1 from public.journal_entries je where je.organization_id = 374 and je.source_id = (select v from ctx where k = x.doc))
                                  then 'CON ASIENTO' else 'SIN ASIENTO' end
                             || ' · ' || coalesce((select string_agg(case when x.motivo = 'pendiente' then 'pendiente' else f.reason end
                                                                     || ' · ' || left(f.detail, length(x.prefijo)) || '…', ' | ')
                                                     from public.journal_entry_failures f
                                                    where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo')
                                                      and f.source_id = (select v from ctx where k = x.doc)), 'SIN PENDIENTE') as o) y;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '1', 'FCB (rondas 5 y 6): dos líneas con IVA no descontable y cuenta de cabecera: sin asiento, pendiente de corregir',
       'SIN ASIENTO · iva_no_descontable_por_corregir · más de una línea',
       format('%s · %s · %s', case when exists (select 1 from public.journal_entries je where je.organization_id = 374 and je.source_id = (select v from ctx where k = 'fcb'))
                                   then 'CON ASIENTO' else 'SIN ASIENTO' end,
              coalesce(max(f.reason), 'SIN PENDIENTE'),
              case when bool_or(f.detail like '%más de una línea%') then 'más de una línea' else 'otro motivo' end),
       not exists (select 1 from public.journal_entries je where je.organization_id = 374 and je.source_id = (select v from ctx where k = 'fcb'))
       and max(f.reason) = 'iva_no_descontable_por_corregir' and bool_or(f.detail like '%más de una línea%')
  from public.journal_entry_failures f
 where f.organization_id = 374 and f.id > (select v::int from ctx where k = 'max_fallo') and f.source_id = (select v from ctx where k = 'fcb');

-- ── 3 · Casilla 47 ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '3', x.v, x.e, coalesce(y.o, 'NO ESTÁ'), y.o = x.e from (values
  ('Casilla 47: solo la importación con soporte aduanero completo', '300000', 'c47'),
  ('FIM1 (solo texto en el fundamento): pendiente', 'importacion_sin_soporte_aduanero · base 200000', 'fim1'),
  ('FIM3 (servicio del exterior, aun con soporte): no va a la 47', 'importacion_servicio_no_va_47 · base 80000', 'fim3')
) x(v, e, k)
cross join lateral (select case x.k
  when 'c47' then (select round((c ->> 'valor')::numeric)::text from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'casillas') c where (c ->> 'casilla')::int = 47)
  else (select p ->> 'motivo' || ' · base ' || round((p ->> 'base')::numeric)
          from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'pendientes') p
         where exists (select 1 from jsonb_array_elements(p -> 'origenes') o where o ->> 'documento_id' = (select v from ctx where k = x.k)))
  end as o) y;

-- ── 2 · Devolución: base a la 56 y el IVA recuperado a la 66, por separado ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '2', 'NCR1 en el borrador: base 100.000 en la 56 y 19.000 en la 66', 'casilla · 56 100000 · 66 19000',
       (select o ->> 'destino' from otros where borrador = 'b2' and asiento = (select v::int from ctx where k = 'je_ncr1'))
         || ' · 56 ' || (select round((c ->> 'valor')::numeric) from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'casillas') c where (c ->> 'casilla')::int = 56)
         || ' · 66 ' || (select round((c ->> 'valor')::numeric) from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'casillas') c where (c ->> 'casilla')::int = 66),
       (select o ->> 'destino' from otros where borrador = 'b2' and asiento = (select v::int from ctx where k = 'je_ncr1')) = 'casilla'
         and (select (c ->> 'valor')::numeric from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'casillas') c where (c ->> 'casilla')::int = 56) = 100000
         and (select (c ->> 'valor')::numeric from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'casillas') c where (c ->> 'casilla')::int = 66) = 19000;

-- ── 4 · El borrador antes y después de decidir ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', x.v, x.e, coalesce(y.o, 'NO ESTÁ'), y.o = x.e from (values
  ('Borrador 1 · PA con expediente completo y sin decisión: la venta SIGUE en la 59', 'en 59 · correccion_sin_decision', 'b1', 'pa'),
  ('Borrador 1 · PO (venta de octubre): la reversa de noviembre sin decisión', 'no en 59 · correccion_sin_decision', 'b1', 'po'),
  ('Borrador 2 · PA con decisión «retirar_venta»: sale de la 59; venta y reversa no afectan', 'no en 59 · no_afecta', 'b2', 'pa'),
  ('Borrador 2 · PC tratada por nota crédito: la venta se queda; la reversa pendiente', 'en 59 · correccion_por_nota_credito', 'b2', 'pc'),
  ('Borrador 2 · PF «mantener la venta»: se queda; la reversa pendiente', 'en 59 · correccion_mantiene_venta', 'b2', 'pf'),
  ('Borrador 2 · PB incompleta: la venta se queda', 'en 59 · correccion_incompleta', 'b2', 'pb'),
  ('Borrador 2 · PD (nota crédito + retiro rechazado): la venta se queda', 'en 59 · correccion_sin_decision', 'b2', 'pd'),
  ('Borrador 2 · PO: la reversa de noviembre no afecta y NO resta en noviembre (la venta es de octubre)', 'no en 59 · no_afecta', 'b2', 'po')
) x(v, e, b, k)
cross join lateral (select
  case when exists (select 1 from casilla_59 c where c.borrador = x.b and c.documento_id = (select v from ctx where k = x.k)) then 'en 59' else 'no en 59' end
  || ' · ' || coalesce((select coalesce(o ->> 'motivo', o ->> 'destino') from otros where borrador = x.b and asiento = (select v::int from ctx where k = 'je_' || x.k || '_rev')), 'SIN REVERSA') as o) y;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'Borrador 2 · PA: la venta aparece en «otros» como corrección que no afecta', 'correccion_error / no_afecta',
       (select (o ->> 'naturaleza') || ' / ' || (o ->> 'destino') from otros where borrador = 'b2' and asiento = (select v::int from ctx where k = 'je_pa')),
       (select (o ->> 'naturaleza') || ' / ' || (o ->> 'destino') from otros where borrador = 'b2' and asiento = (select v::int from ctx where k = 'je_pa')) = 'correccion_error / no_afecta';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'Borrador 2 · PO: la reversa señala que su venta es de otro período y lleva la decisión de septiembre–octubre',
       'venta_en_otro_periodo true · retirar_venta 2026-09-01→2026-10-31',
       (o -> 'correccion' ->> 'venta_en_otro_periodo') || ' · ' || (o -> 'correccion' -> 'decision' ->> 'tratamiento') || ' '
         || (o -> 'correccion' -> 'decision' ->> 'periodo_desde') || '→' || (o -> 'correccion' -> 'decision' ->> 'periodo_hasta'),
       (o -> 'correccion' ->> 'venta_en_otro_periodo') = 'true' and (o -> 'correccion' -> 'decision' ->> 'periodo_desde') = '2026-09-01'
  from otros where borrador = 'b2' and asiento = (select v::int from ctx where k = 'je_po_rev');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'Septiembre–octubre · la venta PO sale de la 59 de SU bimestre y figura como corrección que no afecta', 'no en 59 · correccion_error / no_afecta',
       case when exists (select 1 from casilla_59 c where c.borrador = 'bso' and c.documento_id = (select v from ctx where k = 'po')) then 'en 59' else 'no en 59' end
         || ' · ' || coalesce((select (o ->> 'naturaleza') || ' / ' || (o ->> 'destino') from otros where borrador = 'bso' and asiento = (select v::int from ctx where k = 'je_po')), 'NO ESTÁ'),
       not exists (select 1 from casilla_59 c where c.borrador = 'bso' and c.documento_id = (select v from ctx where k = 'po'))
         and (select (o ->> 'naturaleza') || ' / ' || (o ->> 'destino') from otros where borrador = 'bso' and asiento = (select v::int from ctx where k = 'je_po')) = 'correccion_error / no_afecta';
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'Borrador 2 · alerta de corrección de una declaración anterior: PO (marcada y de un período declarado)', 'PO_REV · retirar_venta · Sep–Oct declarado',
       coalesce((select string_agg(coalesce((select c.v from ctx c where c.k = 'doc_' || (a ->> 'asiento')), a ->> 'asiento') || ' · ' || coalesce(a ->> 'decision', '—')
                                   || ' · ' || coalesce(a -> 'periodo_declarado' ->> 'numero_formulario', 'sin declarar'), ' | ')
                   from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'alertas' -> 'correcciones_declaracion_anterior') a), 'ninguna'),
       exists (select 1 from jsonb_array_elements((select v::jsonb from ctx where k = 'b2') -> 'alertas' -> 'correcciones_declaracion_anterior') a
                where (a ->> 'asiento')::int = (select v::int from ctx where k = 'je_po_rev') and a ->> 'decision' = 'retirar_venta'
                  and a -> 'periodo_declarado' ->> 'numero_formulario' = 'PRUEBA-300-SEPOCT');

-- ── 5 · Límites: tarifa inferida y cierre ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', 'Línea POS: origen de la clasificación «inferida» (no «sugerida»)', 'gravada / 19 / inferida',
       concat_ws(' / ', si.iva_tratamiento, round(si.iva_tarifa)::text, si.iva_clasificacion_origen),
       concat_ws(' / ', si.iva_tratamiento, round(si.iva_tarifa)::text, si.iva_clasificacion_origen) = 'gravada / 19 / inferida'
  from public.sale_items si where si.sale_id = (select v::uuid from ctx where k = 'pi');
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', 'Borrador 2 · PI en la 59 con la señal «tarifa_inferida» y la alerta que la cuenta', 'en 59 inferida · alerta ≥ 1 línea',
       case when exists (select 1 from casilla_59 c where c.borrador = 'b2' and c.documento_id = (select v from ctx where k = 'pi') and c.inferida) then 'en 59 inferida' else 'sin la señal' end
         || ' · alerta ' || coalesce(((select v::jsonb from ctx where k = 'b2') -> 'alertas' -> 'tarifas_inferidas' ->> 'lineas'), 'NO ESTÁ') || ' línea(s)',
       exists (select 1 from casilla_59 c where c.borrador = 'b2' and c.documento_id = (select v from ctx where k = 'pi') and c.inferida)
         and ((select v::jsonb from ctx where k = 'b2') -> 'alertas' -> 'tarifas_inferidas' ->> 'lineas')::int >= 1;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '5', x.v, x.e, coalesce(y.o, 'NO ESTÁ'), y.o = x.e from (values
  ('Borrador 1 · asiento de cierre sin registrar: señal, no exclusión', 'sin_registro / sugerida cierre / pendiente', 'b1'),
  ('Borrador 2 · cierre registrado con soporte y explicación', 'cierre / sugerida — / no_afecta', 'b2')
) x(v, e, b)
cross join lateral (select (o ->> 'naturaleza') || ' / sugerida ' || coalesce(o ->> 'sugerida', '—') || ' / ' || (o ->> 'destino') as o
                      from otros where borrador = x.b and asiento = (select v::int from ctx where k = 'je_ce')) y;

-- ── Conciliación y estado ──
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'R', 'Borrador ' || b.k || ': conciliado con la 2408 (diferencia ≤ 1), nunca aprobado fiscalmente', 'conciliado · diferencia 0 · aprobado false · versión 7',
       format('%s · diferencia %s · aprobado %s · versión %s', b.v::jsonb ->> 'estado', round((b.v::jsonb -> 'conciliacion' ->> 'diferencia')::numeric),
              b.v::jsonb ->> 'aprobado_fiscalmente', b.v::jsonb ->> 'version'),
       b.v::jsonb ->> 'estado' = 'conciliado' and abs((b.v::jsonb -> 'conciliacion' ->> 'diferencia')::numeric) <= 1
         and (b.v::jsonb ->> 'aprobado_fiscalmente') = 'false' and (b.v::jsonb ->> 'version') = '7'
  from ctx b where b.k in ('b1', 'b2', 'bso') order by b.k;

-- ── Guardar otra vez el expediente borra la decisión (se decide de nuevo) ──
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
-- (En dos sentencias: la lectura debe ver lo que escribió la función.)
insert into ctx select 'pa_reguardado', pg_temp.nat('je_pa_rev', (select v::jsonb from ctx where k = 'exp'));
insert into r (escenario, verificacion, esperado, obtenido, ok)
select '4', 'PA: al guardar otra vez el expediente, la decisión se borra', 'OK · sin decisión',
       x.v || ' · ' || coalesce((select n.decision_tratamiento from public.tributario_iva_naturaleza_asiento n where n.journal_entry_id = (select v::int from ctx where k = 'je_pa_rev')), 'sin decisión'),
       x.v = 'OK' and (select n.decision_tratamiento from public.tributario_iva_naturaleza_asiento n where n.journal_entry_id = (select v::int from ctx where k = 'je_pa_rev')) is null
  from ctx x where x.k = 'pa_reguardado';
reset role;

-- ── Permisos ──
update public.organization_members set is_super_admin = false, role_id = 4
 where organization_id = 374 and user_id = 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Decidir con rol Empleado (sin finance.approve)', 'SIN_PERMISO', x.o, x.o = 'SIN_PERMISO'
  from (select pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}') o) x;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'Decidir desde otra organización (no miembro)', 'Acceso denegado a la organización', x.o, x.o = 'Acceso denegado a la organización'
  from (select pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta","periodo_desde":"2026-11-01","periodo_hasta":"2026-12-31","fundamento":"La operación no existió"}') o) x;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into r (escenario, verificacion, esperado, obtenido, ok)
select 'P', 'anon: decidir', 'permission denied…', left(x.o, 40), x.o like 'permission denied%'
  from (select pg_temp.dec('je_pa_rev', '{"tratamiento":"retirar_venta"}') o) x;
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
