-- Pruebas en seco · Anticipos a proveedores: correcciones del Contador (P1, P6, P7), rondas 2, 3 y 4
-- (RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md, «Anticipos»). Reejecución del 2026-11-09 con los archivos EXACTOS actuales.
-- Proyecto taqjemqjtumhwptchcxk · org 374 (sucursal 585).
--
-- NO DEJA DATOS: todo corre en una sola transacción que termina con una excepción (= rollback); el resultado sale en el
-- mensaje de esa excepción. CARGA ejecuta, completas y exactas (md5 comprobado), las migraciones SIN APLICAR en orden de
-- versión: 20261108120500 → 121000 → 140500 → 160000 → 160500 → 165000 → 170000. Lo que la org 374 no tiene (proveedores,
-- facturas de compra, perfil tributario, caja abierta, auxiliar 13300501, procedimiento de ReteICA) se crea como
-- administrador dentro de la transacción. Las operaciones corren como el usuario miembro de la org 374 (rol
-- «authenticated», sesión simulada por request.jwt.claims). Cambios frente a la corrida del 2026-11-08 (ronda 4):
-- AIU por contrato y régimen; motivos de la evaluación compartida (pagador/beneficiario); devoluciones con soporte del
-- hecho, líneas afectadas y pruebas del procedimiento municipal de ReteICA; período de descuento fijado por la regla.
-- Resultado: 11_anticipos_correcciones_contador.resultado.txt

begin;
-- El día de la prueba es el de la organización (America/Bogota): current_date no depende de la hora UTC de la corrida.
set local timezone to 'America/Bogota';

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
  (1, '20261108120500_organization_links', '6a5a3ead2fe311fdde4b7d5c0376c12b', array['74b48fc99c0a3a3b010413db8031e675', '948d61028cb34db074d08c12eca2edaf', '6332a1eaafa850e04255cbe1d4c790db']),
  (2, '20261108121000_consignaciones', 'f52c0de6f53856fc9dd38bb5b3403809', array['d2aa4c6725204badc5f14793d54b0da0', 'a8b60ed8327e8bdf4a09a5749389bd0e', 'cb2daffb5506b6d1048c13cb0ef67cde', '2e060edf17d826a0260b29ebe268bb9c', '06c7eacadb8c897ab3d6c5e06763122a', '5f884aa2747373581edd9337f2f14b93', 'bbe2fedfe558459e35157acd8b4c26e9', 'ee0b275499b8c7e42d518f63a10cc084', 'ad04a330664bc68fa5729cf07f710a3d', '88fd3775f77f5c1fa74aa39768fee054', '0691b64cb50fdcf7c490b376aadfbb04', 'cecd90018184f26d34a949cb1cdcf644', '48cdef4e260198970fc32c7289e2e1c3', 'e12361f82a962fc091621ec670802cec', '7ef44ccb92192d743db7bec3bc3849e3']),
  (3, '20261108140500_responsabilidades_fiscales_en', '4b00bf10bf99ff2a97e2e89ff0480811', array['4b00bf10bf99ff2a97e2e89ff0480811']),
  (4, '20261108160000_tributario_catalogo_rut_y_codigos_fe', '85fd17321a7e85d85a58916cb2f84c95', array['a293fbc0aadf7b33b72d1c5d4d824fad', '3a0fbf1e5d8f8cace37a3ef193763cd9']),
  (5, '20261108160500_tributario_perfil_renta_iva', '1d80345bde9c6d9fd378bc10e8c43a5e', array['6b459b8cf3f78457b04c2786625a08ac', '6b925b7a8d549f72fa09598adee2d903', '80df677e5aa15aa7e4c27c91b322beb7']),
  (6, '20261108165000_tarifas_precision_exacta', '1ec6641bdf74dfc15163d0753982309f', array['1ec6641bdf74dfc15163d0753982309f']),
  (7, '20261108170000_anticipos_proveedores_contador', '0c5079355e6c5ab55dd6b14e1e484cea', array['63f6b0c4aca0275295b79fd9c41924f8', 'eb4a4e52a897e7c01209d3725650d0fb', 'd345b3fd61afb1cbdfbb05fc69fe9bac', 'ac7cfef25367cf788f2de7b5698e617f', '45ca6efa4c336768edce64fd6816428d', '651917641ef050acf2afdc2826885dea', '896232d306be97fa362590dbd56de655', '6e27c30d840c1dcdc6c84165526c334d', '8f13afc4f5934c7fd9f778f91a792d99', '521574537319cfb8c790a4af21099265', 'fecada69cc621c6c66475858378a7697', '03f599837ceb3cbaf18680c4781b0421', '8df4262b2efb2ba15458f77e87758b3d', '1f285ec7b28e57d8bbd1f39846705459', '4ca38155375d59428529d5dc111ed302', '0240018dc5742894c78d3cc94f65ccb4']);
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


-- ════ CUERPO: 11.sql ════
select set_config('dry.prueba', '11', true);
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
-- A, B: responsables de IVA (régimen común). C: sin datos fiscales. D: SIMPLE (O-47) responsable de IVA.
-- E: autorretenedor según el RUT (O-15). F: gran contribuyente.
with s as (
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba A', '900000001', 'company', 'comun', array['O-48']),
         (374, 'Proveedor de prueba B', '900000002', 'company', 'comun', array['O-48']),
         (374, 'Proveedor de prueba C', '900000003', 'company', null, null),
         (374, 'Proveedor de prueba D', '900000004', 'company', 'simple', array['O-47', 'O-48']),
         (374, 'Proveedor de prueba E', '900000005', 'company', 'comun', array['O-48', 'O-15']),
         (374, 'Proveedor de prueba F', '900000006', 'company', 'gran_contribuyente', array['O-13', 'O-48'])
  returning id, nit)
insert into ctx select 'sup_' || right(nit, 1), id::text from s;

insert into ctx select 'tax_rete4', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'RETE_4';
insert into ctx select 'tax_rete11', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'RETE_11';
insert into ctx select 'tax_ica', ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
 where ot.organization_id = 374 and tt.code = 'ICA_0.966';

-- Factura A (proveedor A): 1.000.000 + IVA 19 %, EN BORRADOR (el anticipo se vincula antes de causarla).
with f as (
  insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date, due_date)
  values (374, 585, (select v::int from ctx where k = 'sup_1'), 'PRUEBA-FC-A', 'draft', 'COP', now(), now() + interval '30 days')
  returning id)
insert into ctx select 'fc_a', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Servicio de prueba', 1, 1000000, 19, 'IVA_19', 1190000 from ctx where k = 'fc_a';

-- Factura B (proveedor B): 500.000 + IVA 19 % con retención 4 % (20.000), causada SIN vínculo con anticipos.
with f as (
  insert into public.invoice_purchase (organization_id, branch_id, supplier_id, number_ext, status, currency, issue_date, due_date)
  values (374, 585, (select v::int from ctx where k = 'sup_2'), 'PRUEBA-FC-B', 'draft', 'COP', now(), now() + interval '30 days')
  returning id)
insert into ctx select 'fc_b', id::text from f;
insert into public.invoice_items (invoice_id, invoice_type, invoice_purchase_id, description, qty, unit_price, tax_rate, tax_code, total_line)
select v::uuid, 'purchase', v::uuid, 'Servicio de prueba B', 1, 500000, 19, 'IVA_19', 595000 from ctx where k = 'fc_b';
insert into public.invoice_purchase_withholdings (organization_id, invoice_id, concept, base, rate, amount, tax_code)
select 374, v::uuid, 'Retención 4%', 500000, 4, 20000, 'RETE_4' from ctx where k = 'fc_b';
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc_b');
insert into ctx select 'ap_b', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc_b');

-- La regla vigente de «pago a proveedor» cambia DESPUÉS de causar: la aplicación usa la cuenta reconocida (22050501).
update public.accounting_rules set debit_account_code = '23359501'
 where organization_id = 374 and source_type = 'purchase_payment';

-- Caja abierta en la sucursal 585, abierta por el usuario de la prueba.
with c as (
  insert into public.cash_sessions (organization_id, branch_id, opened_by, initial_amount, status)
  values (374, 585, 'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', 2000000, 'open') returning id)
insert into ctx select 'caja', id::text from c;

insert into ctx select 'max_je', coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374;

-- ── Sesión del usuario miembro de la org 374 ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ R2-4 · Precisión de la tarifa: 9,66 ‰ = 0,966 % ═════════════════════════
do $$
declare
  v_t uuid := (select v::uuid from ctx where k = 'tax_ica');
  v_rate numeric;
begin
  select rate into v_rate from public.organization_taxes where id = v_t;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-4', 'Tarifa exacta de «ICA Bogotá» (plantilla ICA_0.966) tras 20261108165000',
     'rate sigue en 0,97 (no se toca); tarifa exacta 0,966; 1.000.000 × 0,966 % = 9.660 (con rate daría 9.700)',
     format('rate %s; exacta %s; valor %s', v_rate, public.fn_tarifa_exacta_impuesto(v_t), round(1000000 * public.fn_tarifa_exacta_impuesto(v_t) / 100)),
     v_rate = 0.97 and public.fn_tarifa_exacta_impuesto(v_t) = 0.966 and round(1000000 * public.fn_tarifa_exacta_impuesto(v_t) / 100) = 9660);
end $$;

-- ═══ P6 / R2-10 · Cuenta: auxiliar 133005xx de detalle o equivalencia aprobada ═
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', 'financiacion', 'p11-sin-cuenta', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Sin cuenta configurada (antes caía a 1330)', 'estado sin_configurar; registrar rechaza cuenta_anticipos_no_configurada; sin 1330 de respaldo',
     (v_e ->> 'estado') || '; ' || coalesce(v_err, 'NO RECHAZÓ') || '; cuenta ' || coalesce(public.fn_cuenta_anticipo_proveedor(374, 585), 'null'),
     v_e ->> 'estado' = 'sin_configurar' and v_err = 'cuenta_anticipos_no_configurada' and public.fn_cuenta_anticipo_proveedor(374, 585) is null);
end $$;

reset role;
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (374, null, 'anticipos_proveedores', '1330');
insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza,
                                      es_movimiento, requiere_tercero, requiere_centro_costo)
select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov, c.requiere_centro_costo
  from public.chart_of_accounts c,
       (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true),
               ('133095', 'Otros anticipos', '1330', false), ('13309501', 'Anticipos a proveedores (plan propio)', '133095', true))
         x(code, name, parent, mov)
 where c.organization_id = 374 and c.account_code = '1330';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
  v_err2 text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', 'financiacion', 'p11-1330', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Configurada 1330 (título)', 'estado no_es_detalle; registrar rechaza cuenta_anticipos_no_detalle',
     (v_e ->> 'estado') || '; ' || coalesce(v_err, 'NO RECHAZÓ'), v_e ->> 'estado' = 'no_es_detalle' and v_err = 'cuenta_anticipos_no_detalle');

  v_err := null;
  begin
    perform public.fn_anticipo_cuenta_equivalencia_aprobar(374, '13309501', 'corta');
  exception when others then v_err := sqlerrm;
  end;
  insert into ctx values ('eq_nota_corta', coalesce(v_err, 'NO RECHAZÓ'));
  begin
    perform public.fn_anticipo_cuenta_equivalencia_aprobar(374, '133095', 'Intento con una cuenta de título del activo.');
  exception when others then v_err2 := sqlerrm;
  end;
  insert into ctx values ('eq_titulo', coalesce(v_err2, 'NO RECHAZÓ'));
end $$;

-- La regla de la cuenta es interna (sin EXECUTE para authenticated): se lee como administrador, antes y después de
-- aprobar la equivalencia (que sí aprueba el usuario, con finance.approve).
reset role;
insert into ctx select 'motivo_13309501_antes', public.fn_cuenta_anticipo_motivo_invalida(374, '13309501');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
select public.fn_anticipo_cuenta_equivalencia_aprobar(374, '13309501', 'En el plan de la org 374 la 133095 cumple la función de 133005 (acta de aprobación 12).');
reset role;
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'R2-10', 'Regla de la cuenta: auxiliar de 8 dígitos bajo 133005; otra cuenta solo con equivalencia aprobada',
       '133005 no_es_detalle; 13309501 fuera_de_133005; nota corta rechazada (nota_obligatoria); aprobada con nota sirve; título no se aprueba (cuenta_no_valida); 13300501 sirve',
       format('133005 %s; 13309501 %s → %s tras aprobar; nota corta %s; título %s; 13300501 %s', public.fn_cuenta_anticipo_motivo_invalida(374, '133005'),
              (select v from ctx where k = 'motivo_13309501_antes'), coalesce(public.fn_cuenta_anticipo_motivo_invalida(374, '13309501'), 'sirve'),
              (select v from ctx where k = 'eq_nota_corta'), (select v from ctx where k = 'eq_titulo'),
              coalesce(public.fn_cuenta_anticipo_motivo_invalida(374, '13300501'), 'sirve')),
       public.fn_cuenta_anticipo_motivo_invalida(374, '133005') = 'no_es_detalle'
         and (select v from ctx where k = 'motivo_13309501_antes') = 'fuera_de_133005'
         and public.fn_cuenta_anticipo_motivo_invalida(374, '13309501') is null
         and (select v from ctx where k = 'eq_nota_corta') = 'nota_obligatoria' and (select v from ctx where k = 'eq_titulo') = 'cuenta_no_valida'
         and public.fn_cuenta_anticipo_motivo_invalida(374, '13300501') is null;

reset role;
update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ P1 · Naturaleza obligatoria; sin perfil todo queda pendiente ═════════════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_e jsonb;
  v_err text;
  v_err2 text;
begin
  v_e := public.fn_cuenta_anticipo_proveedor_estado(374, 585);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Configurada 13300501', 'estado ok, cuenta 13300501', v_e::text, v_e ->> 'estado' = 'ok' and v_e ->> 'cuenta' = '13300501');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_registrar(v_a, 585, 100000, 'transfer', null, 'p11-sin-naturaleza', 374);
  exception when others then v_err := sqlerrm;
  end;
  v_err2 := null;
  begin
    perform public.fn_anticipo_proveedor_crear(v_a, 585, 100000, 'transfer', 'p11-firma-vieja', 374);
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Naturaleza obligatoria, sin valor por defecto', 'registrar sin naturaleza y la firma vieja de crear: naturaleza_obligatoria',
     coalesce(v_err, 'NO RECHAZÓ') || ' / ' || coalesce(v_err2, 'NO RECHAZÓ'), v_err = 'naturaleza_obligatoria' and v_err2 = 'naturaleza_obligatoria');
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, (select v::uuid from ctx where k = 'tax_rete4'));
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Sin perfil tributario vigente', 'las tres clases pendiente/sin_perfil_tributario; total 0',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c),
     (select bool_and(c ->> 'estado' = 'pendiente' and c ->> 'motivo' = 'sin_perfil_tributario') from jsonb_array_elements(v_e -> 'clases') c)
       and (v_e ->> 'total')::numeric = 0);
end $$;

reset role;
insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
values (374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral');
-- Ronda 4: la reversión de reteICA exige el procedimiento VALIDADO del municipio de la regla. Aquí es un dato de apoyo
-- (validado directamente); el registro y la validación por el Contador se prueban en la 21.
insert into public.reteica_procedimientos (organization_id, municipality_id, norma, solicitud, pruebas, reintegro, certificado, periodo_descuento,
                                           excedentes, estado, vigente_desde, validado_por, validado_en, validacion_concepto, validacion_soporte)
values (374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Norma municipal de ReteICA (dato de prueba)', 'Solicitud escrita del afectado ante el agente retenedor',
        array['prueba_pago', 'acta'], 'Reintegro al proveedor por transferencia', 'Certificado de ReteICA corregido del período',
        'periodo_del_reintegro', 'Lo que no alcance se descuenta en los períodos siguientes', 'validado', date '2026-01-01',
        'bb11d6d2-f647-49f7-9b29-aa4c4438abf1', now(), 'Validado para la prueba en seco 11 (dato de apoyo)', 'Acta de prueba');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ R2-4 · Regla municipal de ReteICA con precisión ═════════════════════════
do $$
declare
  v_id uuid;
  v_err text;
begin
  v_err := null;
  begin
    perform public.fn_reteica_regla_guardar(374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Servicios de consultoría', 9.66, '', date '2026-01-01');
  exception when others then v_err := sqlerrm;
  end;
  v_id := public.fn_reteica_regla_guardar(374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Servicios de consultoría', 9.66,
                                          'Acuerdo municipal de ReteICA vigente (tarifa 9,66 por mil)', date '2026-01-01');
  insert into ctx values ('regla_ica', v_id::text);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-4', 'Guardar la regla de ReteICA (municipio, actividad, tarifa por mil, norma, vigencia)', 'sin norma: rechazo; con norma: guardada con 9,6600 por mil',
     coalesce(v_err, 'NO RECHAZÓ') || '; tarifa ' || (select tarifa_por_mil from public.reteica_reglas where id = v_id),
     v_err is not null and (select tarifa_por_mil from public.reteica_reglas where id = v_id) = 9.66);
end $$;

-- ═══ R2-1 · R2-3 · R2-4 · Evaluación de retenciones ══════════════════════════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_c int := (select v::int from ctx where k = 'sup_3');
  v_f int := (select v::int from ctx where k = 'sup_6');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_e jsonb;
  v_err text;
  v_txt text;
begin
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || ' base ' || coalesce(c ->> 'base', '-') || ' valor ' || coalesce(c ->> 'valor', '-'), '; ')
    into v_txt from jsonb_array_elements(v_e -> 'clases') c;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Pago anticipado 1.190.000, suma homogénea a la tarifa general (19 %)',
     'base 1.000.000, IVA 190.000; retefuente 40.000; reteIVA 15 % × 190.000 = 28.500; reteICA 9,66 ‰ = 9.660; total 78.160; neto 1.111.840',
     v_txt || '; total ' || (v_e ->> 'total') || '; neto ' || (v_e ->> 'neto'),
     (v_e ->> 'base')::numeric = 1000000 and (v_e ->> 'iva')::numeric = 190000 and (v_e ->> 'total')::numeric = 78160
       and (v_e ->> 'neto')::numeric = 1111840 and (v_e -> 'clases' -> 2 ->> 'valor')::numeric = 9660 and not (v_e ->> 'pendiente')::boolean);

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, null);
  v_txt := v_e -> 'clases' -> 2 ->> 'motivo';
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, null, null, true);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-4', 'ReteICA sin territorialidad confirmada / sin regla elegida', 'pendiente territorialidad_sin_confirmar / pendiente norma_municipal_sin_confirmar',
     v_txt || ' / ' || (v_e -> 'clases' -> 2 ->> 'motivo'),
     v_txt = 'territorialidad_sin_confirmar' and v_e -> 'clases' -> 2 ->> 'motivo' = 'norma_municipal_sin_confirmar' and (v_e ->> 'pendiente')::boolean);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1050000, 5, v_r4, v_ica, null, true);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Dividir entre 1+tarifa solo para la tarifa general', 'tarifa 5 % sin componentes: componentes_obligatorios',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'componentes_obligatorios');

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 795000, null, v_r4, v_ica,
           '[{"descripcion":"Servicio gravado","tratamiento":"gravado","base":500000,"tarifa_iva":19},{"descripcion":"Bien excluido","tratamiento":"excluido","base":200000}]'::jsonb, true);
  select string_agg((c ->> 'clase') || ' base ' || coalesce(c ->> 'base', '-') || ' valor ' || coalesce(c ->> 'valor', '-'), '; ') into v_txt
    from jsonb_array_elements(v_e -> 'clases') c;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Componentes por línea: 500.000 gravado 19 % + 200.000 excluido (795.000)',
     'base 700.000; reteIVA sobre el IVA del gravado (95.000 × 15 % = 14.250), el excluido no aporta IVA; retefuente 28.000; reteICA 6.762',
     v_txt,
     (v_e ->> 'base')::numeric = 700000 and (v_e ->> 'iva')::numeric = 95000 and (v_e -> 'clases' -> 1 ->> 'valor')::numeric = 14250
       and (v_e -> 'clases' -> 0 ->> 'valor')::numeric = 28000 and (v_e -> 'clases' -> 2 ->> 'valor')::numeric = 6762);

  -- Ronda 4: AIU sin contrato registrado se rechaza; con un contrato del art. 462-1 aún «pendiente_validacion», las tres
  -- clases quedan pendientes (no se calcula nada). El cálculo con el contrato validado está en la prueba 21.
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 238000, 19, v_r4, v_ica,
           '[{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]'::jsonb, true);
  exception when others then v_err := sqlerrm;
  end;
  insert into ctx select 'aiu_c11', public.fn_aiu_contrato_registrar(374, v_a, 'servicios_462_1', 'Servicio de aseo de la sede principal', 'aseo',
             '{"numero":"C-11","fecha":"2026-01-10","archivo":"contratos/c-11.pdf","valor":2380000}'::jsonb, 'Estatuto Tributario, art. 462-1',
             '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de aseo con el AIU discriminado en el contrato"}'::jsonb, 'base_especial', 'valor_total',
             date '2026-01-01')::text;
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 238000, 19, v_r4, v_ica,
           '[{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]'::jsonb, true,
           (select v::uuid from ctx where k = 'aiu_c11'));
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R4-AIU', 'AIU (adm 100.000, impr 50.000, util 50.000): sin contrato / con contrato del art. 462-1 pendiente de validación',
     'aiu_contrato_obligatorio; con contrato sin validar: IVA 38.000 sobre A+I+U (200.000) y las tres clases pendiente/aiu_contrato_pendiente_validacion',
     format('%s; iva %s; %s', coalesce(v_err, 'NO RECHAZÓ'), v_e ->> 'iva',
            (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c)),
     v_err = 'aiu_contrato_obligatorio' and (v_e ->> 'iva')::numeric = 38000
       and (select bool_and(c ->> 'estado' = 'pendiente' and c ->> 'motivo' = 'aiu_contrato_pendiente_validacion') from jsonb_array_elements(v_e -> 'clases') c));

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 800000, null, v_r4, v_ica,
              '[{"tratamiento":"gravado","base":500000,"tarifa_iva":19},{"tratamiento":"excluido","base":200000}]'::jsonb, true);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Componentes que no suman el monto (795.000 contra 800.000)', 'rechaza: componentes_no_suman', coalesce(v_err, 'NO RECHAZÓ'), v_err = 'componentes_no_suman');

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'financiacion', 1190000);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-1', 'Anticipo de financiación', 'las tres «diferida / se_evalua_al_pago_o_abono» (no «no aplica»); total 0; no abre pendiente',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c),
     (select bool_and(c ->> 'estado' = 'diferida' and c ->> 'motivo' = 'se_evalua_al_pago_o_abono') from jsonb_array_elements(v_e -> 'clases') c)
       and (v_e ->> 'total')::numeric = 0 and not (v_e ->> 'pendiente')::boolean);

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_c, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Proveedor sin datos fiscales', 'retefuente y reteIVA pendiente/beneficiario_sin_datos_fiscales',
     (select string_agg((c ->> 'clase') || ' ' || (c ->> 'estado') || '/' || (c ->> 'motivo'), '; ') from jsonb_array_elements(v_e -> 'clases') c),
     v_e -> 'clases' -> 0 ->> 'motivo' = 'beneficiario_sin_datos_fiscales' and v_e -> 'clases' -> 1 ->> 'motivo' = 'beneficiario_sin_datos_fiscales');

  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_f, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Org gran contribuyente comprando a gran contribuyente', 'reteIVA pendiente/grandes_contribuyentes_por_verificar (sin exclusión universal)',
     (v_e -> 'clases' -> 1)::text, v_e -> 'clases' -> 1 ->> 'motivo' = 'grandes_contribuyentes_por_verificar');
end $$;

-- ═══ R2-2 · SIMPLE acreditado y autorretenedores verificados ═════════════════
do $$
declare
  v_d int := (select v::int from ctx where k = 'sup_4');
  v_e5 int := (select v::int from ctx where k = 'sup_5');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_r11 uuid := (select v::uuid from ctx where k = 'tax_rete11');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_1 text;
  v_2 text;
  v_3 text;
  v_4 text;
  v_err text;
begin
  v_1 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_d, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 0 ->> 'motivo';
  v_err := null;
  begin
    perform public.fn_proveedor_calidad_tributaria_guardar(374, v_d, 'simple_acreditado', 'Consulta DIAN', '{}', date '2026-01-01');
  exception when others then v_err := sqlerrm;
  end;
  -- Inscripción que todavía no cubre la fecha de la operación (desde el 1 de diciembre): no excluye.
  perform public.fn_proveedor_calidad_tributaria_guardar(374, v_d, 'simple_acreditado', 'Consulta DIAN de la inscripción', '{}', date '2026-12-01', null,
                                                         date '2026-10-01', 'RUT-proveedor-D-2026-10.pdf');
  v_3 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_d, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 0 ->> 'motivo';
  perform public.fn_proveedor_calidad_tributaria_guardar(374, v_d, 'simple_acreditado', 'Consulta DIAN de la inscripción', '{}', date '2026-01-01', null,
                                                         date '2026-10-01', 'RUT-proveedor-D-2026-10.pdf');
  v_2 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_d, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 0 ->> 'motivo';
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-3', 'SIMPLE: sin RUT / inscripción que no cubre la fecha de la operación / RUT actualizado e inscripción vigente',
     'rut_obligatorio; sigue pendiente simple_sin_acreditar; acreditado → no_aplica beneficiario_simple_acreditado',
     format('%s; %s; %s → %s', coalesce(v_err, 'NO RECHAZÓ'), v_1, v_3, v_2),
     v_err = 'rut_obligatorio' and v_1 = 'simple_sin_acreditar' and v_3 = 'simple_sin_acreditar' and v_2 = 'beneficiario_simple_acreditado');

  v_1 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_e5, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 0 ->> 'motivo';
  v_err := null;
  begin
    perform public.fn_proveedor_calidad_tributaria_guardar(374, v_e5, 'autorretenedor_renta', 'Resolución DIAN de autorización', array['RETE_4'], date '2026-01-01', null,
                                                           date '2026-10-01', 'RUT-proveedor-E.pdf');
  exception when others then v_err := sqlerrm;
  end;
  perform public.fn_proveedor_calidad_tributaria_guardar(374, v_e5, 'autorretenedor_renta', 'Resolución DIAN de autorización 000123', array['RETE_4'], date '2026-01-01', null,
                                                         date '2026-10-01', 'RUT-proveedor-E.pdf', '000123', date '2025-12-15',
                                                         'Autorretención a título de renta por servicios generales');
  v_2 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_e5, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 0 ->> 'motivo';
  v_3 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_e5, 'pago_anticipado_precio', 1190000, 19, v_r11, v_ica, null, true) -> 'clases' -> 0 ->> 'valor';
  v_4 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_e5, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true) -> 'clases' -> 1 ->> 'valor';
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-3', 'Autorretenedor: O-15 sin verificar / sin resolución / RUT + resolución con concepto 4 % / concepto no cubierto (11 %) / reteIVA',
     'pendiente autorretencion_sin_verificar; sin resolución: resolucion_autorretencion_obligatoria; concepto cubierto no_aplica; honorarios 11 % se retiene 110.000; reteIVA sigue (28.500)',
     format('%s; %s; %s; 11 %% %s; reteIVA %s', v_1, coalesce(v_err, 'NO RECHAZÓ'), v_2, v_3, v_4),
     v_1 = 'autorretencion_sin_verificar' and v_err = 'resolucion_autorretencion_obligatoria' and v_2 = 'autorretenedor_autorizado_concepto'
       and v_3::numeric = 110000 and v_4::numeric = 28500);

  -- Autorretención especial (RUT 59) del proveedor B: se registra, pero NO excluye la retención por terceros.
  perform public.fn_proveedor_calidad_tributaria_guardar(374, (select v::int from ctx where k = 'sup_2'), 'autorretencion_especial',
                                                         'RUT con responsabilidad 59', '{}', date '2026-01-01', null, date '2026-10-01', 'RUT-proveedor-B.pdf');
  v_1 := public.fn_anticipo_proveedor_evaluar_retenciones(374, (select v::int from ctx where k = 'sup_2'), 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true)
           -> 'clases' -> 0 ->> 'valor';
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-3', 'Autorretención especial (59) registrada para el proveedor B', 'no excluye: retefuente 4 % sobre 1.000.000 = 40.000', coalesce(v_1, 'null'), v_1::numeric = 40000);
end $$;

-- ═══ Circuito en EFECTIVO con caja abierta + arqueo «Egreso por anticipo» ════
reset role;
insert into ctx select 'esp_antes', (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) ->> 'efectivo_esperado');
insert into ctx select 'ventas_antes', (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) -> 'detalle' ->> 'ventas_efectivo');
set local role authenticated;

do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_caja int := (select v::int from ctx where k = 'caja');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_res jsonb;
  v_res2 jsonb;
  v_ant uuid;
  v_txt text;
  v_n int;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_a, 585, 1190000, 'cash', 'pago_anticipado_precio', 'p11-efectivo-A1', 374, 19, v_r4, v_ica,
                                                  null, null, 'Anticipo en efectivo de prueba', null, true);
  v_ant := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx values ('ant_a1', v_ant::text);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Registrar anticipo en efectivo con caja abierta', 'caja abierta; monto 1.190.000; retención 78.160; girado 1.111.840; cuenta 13300501',
     format('caja %s; monto %s; retención %s; girado %s; cuenta %s', v_res ->> 'caja_id', v_res ->> 'monto', v_res ->> 'retencion', v_res ->> 'girado', v_res ->> 'cuenta'),
     (v_res ->> 'caja_id')::int = v_caja and (v_res ->> 'girado')::numeric = 1111840 and (v_res ->> 'retencion')::numeric = 78160 and v_res ->> 'cuenta' = '13300501');

  select string_agg(format('%s D %s C %s tercero %s', l.account_code, round(l.debit), round(l.credit), coalesce(l.tercero_nit, '-')), ' | ' order by l.debit desc, l.credit desc),
         count(*) filter (where l.account_code = '1330')
    into v_txt, v_n
    from public.journal_entries je join public.journal_lines l on l.journal_entry_id = je.id
   where je.organization_id = 374 and je.fact_key = 'supplier_advance:' || v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Asiento del anticipo en efectivo',
     'D 13300501 1.190.000 / C caja 1.111.840 / C retefuente 40.000 / C reteIVA 28.500 / C reteICA 9.660; NIT 900000001; nada en 1330',
     v_txt, v_n = 0 and v_txt like '13300501 D 1190000 C 0 tercero 900000001%' and v_txt like '%C 1111840 tercero 900000001%'
       and v_txt like '%C 40000 tercero 900000001%' and v_txt like '%C 28500 tercero 900000001%' and v_txt like '%C 9660 tercero 900000001%');

  v_res2 := public.fn_anticipo_proveedor_registrar(v_a, 585, 1190000, 'cash', 'pago_anticipado_precio', 'p11-efectivo-A1', 374, 19, v_r4, v_ica,
                                                   null, null, 'Anticipo en efectivo de prueba', null, true);
  select count(*) into v_n from public.journal_entries where organization_id = 374 and fact_key = 'supplier_advance:' || v_ant;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Efectivo', 'Repetir con la misma clave', 'repetida=true, mismo anticipo, un solo asiento',
     format('repetida %s; mismo %s; asientos %s', v_res2 ->> 'repetida', (v_res2 ->> 'anticipo_id')::uuid = v_ant, v_n),
     (v_res2 ->> 'repetida')::boolean and (v_res2 ->> 'anticipo_id')::uuid = v_ant and v_n = 1);

  -- B5: financiación en efectivo (se anulará con la caja ya cerrada).
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 119000, 'cash', 'financiacion', 'p11-efectivo-B5', 374);
  insert into ctx values ('ant_b5', v_res ->> 'anticipo_id');
end $$;

reset role;
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'R2-11', 'Arqueo: el anticipo es «Egreso por anticipo», no una venta negativa',
       'efectivo esperado baja 1.230.840 (1.111.840 + 119.000); renglón anticipos_proveedor_egreso 1.230.840; ventas en efectivo sin cambio',
       format('diferencia %s; egreso por anticipo %s; ventas antes %s después %s', d.e - a.v::numeric, d.egreso, vt.v, d.ventas),
       d.e - a.v::numeric = -1230840 and d.egreso = 1230840 and d.ventas = vt.v::numeric
  from ctx a, ctx vt,
       (select (x ->> 'efectivo_esperado')::numeric as e, (x -> 'detalle' ->> 'anticipos_proveedor_egreso')::numeric as egreso,
               (x -> 'detalle' ->> 'ventas_efectivo')::numeric as ventas
          from public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) x) d
 where a.k = 'esp_antes' and vt.k = 'ventas_antes';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ R2-5 · La retención repetida se evita al RECONOCER la factura ═══════════
do $$
declare
  v_ant uuid := (select v::uuid from ctx where k = 'ant_a1');
  v_fc uuid := (select v::uuid from ctx where k = 'fc_a');
  v_res jsonb;
begin
  v_res := public.fn_anticipo_proveedor_vincular_factura(v_ant, v_fc, 1190000, 374);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Vincular el anticipo A1 a la factura A en borrador', 'retención vinculada por impuesto: retefuente base 1.000.000, reteIVA 190.000, reteICA 1.000.000',
     (v_res -> 'retencion')::text,
     (select bool_and((x ->> 'base')::numeric in (1000000, 190000)) from jsonb_array_elements(v_res -> 'retencion') x) and jsonb_array_length(v_res -> 'retencion') = 3);
end $$;

reset role;
insert into public.invoice_purchase_withholdings (organization_id, invoice_id, concept, base, rate, amount, tax_code)
select 374, v::uuid, x.concept, x.base, x.rate, x.amount, x.code from ctx,
       (values ('Retención 4%', 1000000, 4, 40000, 'RETE_4'), ('Retención de IVA 15%', 190000, 15, 28500, 'RETEIVA_15')) x(concept, base, rate, amount, code)
 where k = 'fc_a';
do $$
declare
  v_err text;
  v_det text;
begin
  begin
    update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc_a');
  exception when others then
    get stacked diagnostics v_err = message_text, v_det = pg_exception_detail;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Causar la factura A reteniendo otra vez sobre la base del anticipo', 'la causación se bloquea: retencion_duplicada_con_anticipo (base máxima 0)',
     coalesce(v_err, 'NO RECHAZÓ') || ' ' || coalesce(v_det, ''), v_err = 'retencion_duplicada_con_anticipo'
       and (select status from public.invoice_purchase where id = (select v::uuid from ctx where k = 'fc_a')) = 'draft');
end $$;
delete from public.invoice_purchase_withholdings where invoice_id = (select v::uuid from ctx where k = 'fc_a');
update public.invoice_purchase set status = 'received' where id = (select v::uuid from ctx where k = 'fc_a');
insert into ctx select 'ap_a', id::text from public.accounts_payable where invoice_id = (select v::uuid from ctx where k = 'fc_a');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_ant uuid := (select v::uuid from ctx where k = 'ant_a1');
  v_ap uuid := (select v::uuid from ctx where k = 'ap_a');
  v_res jsonb;
  v_txt text;
  v_ok boolean;
begin
  v_res := public.fn_anticipo_proveedor_aplicar(v_ant, v_ap, 1190000, 'p11-aplicar-A1', 374);
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_id')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Aplicar A1 a la factura A causada sin repetir la retención',
     'CxP 1.190.000 (la factura no retuvo); vinculada; nada que corregir; D la cuenta del proveedor de SU causación (la factura A se causó con la regla ya cambiada: 23359501) · C 13300501; CxP 0',
     format('vinculada %s; descontada %s; cuenta %s; saldo CxP %s; ', v_res ->> 'vinculada', v_res ->> 'retencion_descontada', v_res ->> 'cuenta_por_pagar', v_res ->> 'saldo_cuenta') || v_txt,
     (v_res ->> 'vinculada')::boolean and (v_res ->> 'retencion_descontada')::numeric = 0
       and v_res ->> 'cuenta_por_pagar' = (select l.account_code from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_causacion')::int
                                             and l.credit = 1190000 limit 1)
       and (v_res ->> 'saldo_cuenta')::numeric = 0 and v_txt = (v_res ->> 'cuenta_por_pagar') || ' D 1190000 C 0 | 13300501 D 0 C 1190000');

  select string_agg(format('%s %s', l.account_code, sum_c), '; ' order by l.account_code), bool_and(sum_c in (40000, 28500, 9660))
    into v_txt, v_ok
    from (select l.account_code, sum(l.credit - l.debit) as sum_c
            from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
           where e.organization_id = 374 and l.tercero_nit = '900000001' and left(l.account_code, 3) = '236'
           group by l.account_code) l;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Retención neta por cuenta y NIT A', 'retefuente 40.000, reteIVA 28.500, reteICA 9.660: una sola vez', v_txt, v_ok);
end $$;

-- ═══ R2-1 · Financiación y R2-5 · duplicado ya ocurrido (corrección documentada) ═
do $$
declare
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_ap uuid := (select v::uuid from ctx where k = 'ap_b');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_res jsonb;
  v_ant uuid;
  v_b2 uuid;
  v_err text;
  v_txt text;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 300000, 'transfer', 'financiacion', 'p11-fin-B1', 374, null, null, null, null, 'TRF-B1');
  v_ant := (v_res ->> 'anticipo_id')::uuid;
  v_res := public.fn_anticipo_proveedor_aplicar(v_ant, v_ap, 300000, 'p11-aplicar-B1', 374);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-1', 'Financiación aplicada a la factura B (retuvo 20.000 al causar)',
     'sin retención en el anticipo, nada que descontar; CxP 575.000 → 275.000; D 22050501 (la de la causación de B, aunque la regla vigente ya dice 23359501)',
     format('descontada %s; CxP %s; cuenta %s', v_res ->> 'retencion_descontada', v_res ->> 'saldo_cuenta', v_res ->> 'cuenta_por_pagar'),
     (v_res ->> 'retencion_descontada')::numeric = 0 and (v_res ->> 'saldo_cuenta')::numeric = 275000 and v_res ->> 'cuenta_por_pagar' = '22050501');

  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 238000, 'transfer', 'pago_anticipado_precio', 'p11-B2', 374, 19, v_r4, v_ica, null, 'TRF-B2', null, null, true);
  v_b2 := (v_res ->> 'anticipo_id')::uuid;
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_aplicar(v_b2, v_ap, 238000, 'p11-aplicar-B2', 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Aplicar sin vínculo un anticipo con retención a una factura que retuvo toda la base', 'rechaza: retencion_duplicada (no se compensa en silencio)',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'retencion_duplicada');

  v_res := public.fn_anticipo_proveedor_aplicar_corrigiendo(v_b2, v_ap, 238000, 'p11-aplicar-B2', 'La factura PRUEBA-FC-B retuvo 4 % sobre toda la base',
                                                            'Nota interna 77 y certificado del proveedor', 374);
  select format('descontada %s; reducción %s; CxP %s; ajuste %s; pendiente %s', v_res ->> 'retencion_descontada', v_res ->> 'reduccion_cuenta', v_res ->> 'saldo_cuenta',
                (select string_agg(j.tipo || ' ' || j.clase || ' ' || j.valor, ', ') from public.supplier_advance_withholding_ajustes j where j.advance_id = v_b2),
                (select p.tipo || ' ' || p.estado || ' periodos ' || (p.detalle -> 'periodos_a_revisar')::text from public.anticipo_pendientes p where p.advance_id = v_b2))
    into v_txt;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-5', 'Corrección documentada (motivo y soporte)',
     'descuenta 8.000 (retefuente sobre 200.000); CxP baja 230.000 → 45.000; ajuste duplicado_factura −8.000; pendiente retencion_duplicada abierto con periodos a revisar',
     v_txt,
     (v_res ->> 'retencion_descontada')::numeric = 8000 and (v_res ->> 'saldo_cuenta')::numeric = 45000
       and v_txt like '%duplicado_factura retefuente -8000.00%' and v_txt like '%retencion_duplicada abierto periodos%');
end $$;

-- ═══ P7 · Anular solo por error; R2-6 · devolución con retenciones identificadas ═
do $$
declare
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_res jsonb;
  v_b3 uuid;
  v_b4 uuid;
  v_err text;
  v_err2 text;
  v_txt text;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 238000, 'transfer', 'pago_anticipado_precio', 'p11-B3', 374, 19, v_r4, v_ica, null, 'TRF-B3', null, null, true);
  v_b3 := (v_res ->> 'anticipo_id')::uuid;
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular(v_b3, 'Registrado por error', 374);
  exception when others then v_err := sqlerrm;
  end;
  v_err2 := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_b3, 'Transferencia rechazada', 'Extracto con el rechazo', current_date + 5, 374);
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Anulación sin declaración / con fecha futura', 'anulacion_requiere_declaracion / fecha_ajuste_futura',
     coalesce(v_err, 'NO RECHAZÓ') || ' / ' || coalesce(v_err2, 'NO RECHAZÓ'), v_err = 'anulacion_requiere_declaracion' and v_err2 = 'fecha_ajuste_futura');

  v_res := public.fn_anticipo_proveedor_anular_por_error(v_b3, 'Transferencia rechazada por el banco', 'Extracto bancario con el rechazo de TRF-B3', null, 374);
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc, l.credit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'contra_asiento')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Anular por error (el desembolso no ocurrió)',
     'contra-asiento: D banco 222.368 · D retefuente 8.000 · D reteIVA 5.700 · D reteICA 1.932 · C 13300501 238.000; pago void; ajustes anulacion_error por impuesto',
     v_txt || '; pago ' || (select p.status from public.payments p where p.source = 'supplier_advance' and p.source_id = v_b3::text)
       || '; ajustes ' || (select string_agg(j.clase || ' ' || j.valor, ', ' order by j.clase) from public.supplier_advance_withholding_ajustes j where j.advance_id = v_b3 and j.tipo = 'anulacion_error'),
     v_txt like '%D 222368 C 0%' and v_txt like '%D 8000 C 0%' and v_txt like '%D 5700 C 0%' and v_txt like '%D 1932 C 0%' and v_txt like '%13300501 D 0 C 238000%'
       and (select p.status from public.payments p where p.source = 'supplier_advance' and p.source_id = v_b3::text) = 'void'
       and (select count(*) from public.supplier_advance_withholding_ajustes j where j.advance_id = v_b3 and j.tipo = 'anulacion_error') = 3);

  -- B4: 119.000 → retefuente 4.000, reteIVA 2.850, reteICA 966 (total 7.816), girado 111.184.
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p11-B4', 374, 19, v_r4, v_ica, null, 'TRF-B4', null, null, true);
  v_b4 := (v_res ->> 'anticipo_id')::uuid;
  insert into ctx values ('ant_b4', v_b4::text);
  -- Ronda 4: el hecho con su soporte (acta de devolución), la línea afectada de la operación y las pruebas del procedimiento
  -- municipal de ReteICA. El período de descuento no se elige.
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver(v_b4, 55592, 'transfer', 'El proveedor devolvió la mitad', 'p11-dev-sin-pruebas', 374, null, 'Consignación 0042',
      jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false,
                         'hecho', jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 12', 'fecha', current_date),
                         'lineas', jsonb_build_array(jsonb_build_object('componente', '0', 'base', 50000, 'iva', 9500)),
                         'soportes', jsonb_build_object('calculo', 'Cálculo de la parte devuelta', 'certificado', 'Certificado corregido 7')));
  exception when others then v_err := sqlerrm;
  end;
  v_err2 := null;
  begin
    perform public.fn_anticipo_proveedor_devolver(v_b4, 55000, 'transfer', 'El proveedor devolvió la mitad', 'p11-dev-no-cuadra', 374, null, 'Consignación 0042',
      jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false,
                         'hecho', jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 12', 'fecha', current_date),
                         'lineas', jsonb_build_array(jsonb_build_object('componente', '0', 'base', 50000, 'iva', 9500)),
                         'soportes', jsonb_build_object('calculo', 'Cálculo', 'certificado', 'Certificado 7',
                                                        'ica', jsonb_build_object('solicitud', 'Solicitud 33', 'certificado', 'Certificado ICA 4',
                                                                                  'prueba_pago', 'Comprobante 9', 'acta', 'Acta 12'))));
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-2', 'Devolución parcial: reteICA afectada sin las pruebas del procedimiento municipal / dinero que no cuadra con las líneas',
     'reteica_pruebas_incompletas / calculo_no_cuadra', coalesce(v_err, 'NO RECHAZÓ') || ' / ' || coalesce(v_err2, 'NO RECHAZÓ'),
     v_err = 'reteica_pruebas_incompletas' and v_err2 = 'calculo_no_cuadra');

  v_res := public.fn_anticipo_proveedor_devolver(v_b4, 55592, 'transfer', 'El proveedor devolvió la mitad', 'p11-dev-B4', 374, null, 'Consignación 0042',
    jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false,
                       'hecho', jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 12', 'fecha', current_date),
                       'lineas', jsonb_build_array(jsonb_build_object('componente', '0', 'base', 50000, 'iva', 9500)),
                       'soportes', jsonb_build_object('calculo', 'Cálculo de la parte devuelta: 50.000 + IVA 9.500', 'certificado', 'Certificado corregido 7',
                                                      'ica', jsonb_build_object('solicitud', 'Solicitud radicada 33', 'certificado', 'Certificado ICA corregido 4',
                                                                                'prueba_pago', 'Comprobante de pago 9', 'acta', 'Acta de devolución 12'))));
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc, l.credit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_id')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-2', 'Devolución parcial por la línea afectada (base 50.000 + IVA 9.500): cada retención sobre lo que cubrió; $55.592 al banco y $3.908 de retenciones',
     'D banco 55.592 · D retefuente 2.000 · D reteIVA 1.425 · D reteICA 483 · C 13300501 59.500; saldo 59.500; 3 ajustes «devolucion» con período y regla del período',
     format('dinero %s; retenciones %s; saldo %s; ', v_res ->> 'dinero', v_res ->> 'retencion_revertida', v_res ->> 'saldo_disponible') || v_txt,
     (v_res ->> 'dinero')::numeric = 55592 and (v_res ->> 'retencion_revertida')::numeric = 3908 and (v_res ->> 'saldo_disponible')::numeric = 59500
       and v_txt like '%D 55592 C 0%' and v_txt like '%D 1425 C 0%' and v_txt like '%13300501 D 0 C 59500%'
       and (select count(*) from public.supplier_advance_withholding_ajustes j where j.advance_id = v_b4 and j.tipo = 'devolucion'
              and j.causa = 'devolucion_parcial' and j.periodo_descuento is not null and j.regla_periodo is not null and j.requiere_correccion is false) = 3);

  v_res := public.fn_anticipo_proveedor_devolver(v_b4, 10000, 'transfer', 'Segundo reintegro sin detalle de retenciones', 'p11-dev-B4-2', 374, null, 'Consignación 0043');
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-6', 'Devolución sin poder determinar las retenciones', 'baja solo el dinero (10.000; saldo 49.500); no se prorratea; pendiente devolucion_retenciones_por_definir',
     format('retenciones %s; saldo %s; pendiente %s', v_res ->> 'retencion_revertida', v_res ->> 'saldo_disponible',
            (select string_agg(p.tipo || ' ' || p.estado, ', ') from public.anticipo_pendientes p where p.advance_id = v_b4)),
     (v_res ->> 'retencion_revertida')::numeric = 0 and (v_res ->> 'saldo_disponible')::numeric = 49500
       and exists (select 1 from public.anticipo_pendientes p where p.advance_id = v_b4 and p.tipo = 'devolucion_retenciones_por_definir' and p.estado = 'abierto'));

  -- Causa (b): retención excesiva. Retefuente vigente 2.000; la correcta era 2,5 % sobre 50.000 = 1.250: se reintegran 750.
  v_res := public.fn_anticipo_retencion_exceso_reintegrar(v_b4, 'retefuente', 50000, 2.5, 'transfer', 'p11-exceso-B4',
             '{"calculo":"Tarifa de servicios 2,5 % sobre la base vigente","certificado":"Certificado corregido 8","solicitud":"Solicitud escrita del proveedor 5","pruebas":"Factura y cálculo"}'::jsonb,
             to_char(now(), 'YYYY-MM'), true,
             'Se aplicó 4 % en vez de 2,5 %', 374);
  select string_agg(format('%s D %s C %s', l.account_code, round(l.debit), round(l.credit)), ' | ' order by l.debit desc) into v_txt
    from public.journal_lines l where l.journal_entry_id = (v_res ->> 'asiento_id')::int;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-2', 'Retención excesiva: el exceso sale del cálculo correcto y se reintegra al proveedor',
     'reintegro 750 (2.000 − 1.250); D 23652501 750 / C banco 750; saldo del anticipo sin cambio (49.500); pendiente correccion_declaracion',
     format('reintegro %s; saldo %s; ', v_res ->> 'reintegro', (select balance from public.supplier_advances where id = v_b4)) || v_txt
       || '; pendiente ' || coalesce((select string_agg(p.tipo, ', ') from public.anticipo_pendientes p where p.advance_id = v_b4 and p.tipo = 'correccion_declaracion'), '-'),
     (v_res ->> 'reintegro')::numeric = 750 and (select balance from public.supplier_advances where id = v_b4) = 49500
       and v_txt like '23652501 D 750 C 0%' and v_txt like '%D 0 C 750'
       and exists (select 1 from public.anticipo_pendientes p where p.advance_id = v_b4 and p.tipo = 'correccion_declaracion' and p.estado = 'abierto'));

  -- Causa (a): operación anulada. B6 de 119.000 (retenciones 7.816): se devuelve todo el saldo y se revierten todas.
  v_res := public.fn_anticipo_proveedor_registrar(v_b, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p11-B6', 374, 19, v_r4, v_ica, null, 'TRF-B6', null, null, true);
  insert into ctx values ('ant_b6', v_res ->> 'anticipo_id');
  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_devolver((select v::uuid from ctx where k = 'ant_b6'), 100000, 'transfer', 'Se resolvió el contrato', 'p11-dev-B6-x', 374, null,
      'Consignación 0050', jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', false,
        'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución del contrato 3', 'fecha', current_date),
        'soportes', jsonb_build_object('calculo', 'Cálculo', 'certificado', 'Certificado anulado 9',
                                       'ica', jsonb_build_object('solicitud', 'Solicitud 34', 'certificado', 'Certificado ICA 5', 'prueba_pago', 'Comprobante 10', 'acta', 'Resolución 3'))));
  exception when others then v_err := sqlerrm;
  end;
  v_res := public.fn_anticipo_proveedor_devolver((select v::uuid from ctx where k = 'ant_b6'), 111184, 'transfer', 'Se resolvió el contrato', 'p11-dev-B6', 374, null,
    'Consignación 0050', jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', false,
      'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución del contrato 3', 'fecha', current_date),
      'soportes', jsonb_build_object('calculo', 'Retenciones practicadas al girar', 'certificado', 'Certificado anulado 9',
                                     'ica', jsonb_build_object('solicitud', 'Solicitud 34', 'certificado', 'Certificado ICA 5', 'prueba_pago', 'Comprobante 10', 'acta', 'Resolución 3'))));
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R3-2', 'Operación anulada: dinero que no cubre el saldo / devolución total',
     'anulacion_requiere_devolucion_total; con 111.184: se revierten las tres (7.816) y el anticipo queda en 0',
     format('%s; dinero %s; retenciones %s; saldo %s', coalesce(v_err, 'NO RECHAZÓ'), v_res ->> 'dinero', v_res ->> 'retencion_revertida', v_res ->> 'saldo_disponible'),
     v_err = 'anulacion_requiere_devolucion_total' and (v_res ->> 'retencion_revertida')::numeric = 7816 and (v_res ->> 'saldo_disponible')::numeric = 0);

  v_err := null;
  begin
    perform public.fn_anticipo_proveedor_anular_por_error(v_b4, 'Intento de anular', 'Soporte cualquiera', null, 374);
  exception when others then v_err := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P7', 'Anular uno cuyo dinero salió y regresó en parte', 'rechaza: anticipo_usado (el saldo sigue siendo un derecho)',
     coalesce(v_err, 'NO RECHAZÓ'), v_err = 'anticipo_usado');
end $$;

-- ═══ R2-8 · Anulación por error con la caja ya cerrada ═══════════════════════
reset role;
update public.cash_sessions set status = 'closed', closed_at = now() where id = (select v::int from ctx where k = 'caja');
insert into ctx select 'esp_cerrada', (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) ->> 'efectivo_esperado');
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_b5 uuid := (select v::uuid from ctx where k = 'ant_b5');
  v_res jsonb;
begin
  v_res := public.fn_anticipo_proveedor_anular_por_error(v_b5, 'El efectivo nunca se entregó al proveedor', 'Acta de arqueo y declaración del cajero', null, 374);
  insert into ctx values ('b5_contra', v_res ->> 'contra_asiento');
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-8', 'Anular por error un anticipo en efectivo de una caja ya cerrada',
     'no se reabre la caja ni se anula su pago (arqueo intacto); contra-asiento en periodo abierto; pendiente anulacion_caja_cerrada',
     format('caja_cerrada %s; pago %s; contra-asiento %s; pendiente %s', v_res ->> 'caja_cerrada',
            (select p.status from public.payments p where p.source = 'supplier_advance' and p.source_id = v_b5::text), v_res ->> 'contra_asiento',
            (select string_agg(p.tipo || ' ' || p.estado, ', ') from public.anticipo_pendientes p where p.advance_id = v_b5)),
     (v_res ->> 'caja_cerrada')::boolean and v_res ->> 'contra_asiento' is not null
       and (select p.status from public.payments p where p.source = 'supplier_advance' and p.source_id = v_b5::text) = 'completed'
       and exists (select 1 from public.anticipo_pendientes p where p.advance_id = v_b5 and p.tipo = 'anulacion_caja_cerrada' and p.estado = 'abierto'));
end $$;
reset role;
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'R2-8', 'Arqueo de la caja cerrada tras la anulación', 'el efectivo esperado no cambia', format('antes %s, después %s', a.v, d.e), d.e = a.v::numeric
  from ctx a, (select (public.pos_caja__esperado_calculo((select v::int from ctx where k = 'caja')) ->> 'efectivo_esperado')::numeric as e) d
 where a.k = 'esp_cerrada';
select set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
set local role authenticated;

-- ═══ R2-9 · Pendientes contables visibles que no se cierran sin resolución ════
do $$
declare
  v_c int := (select v::int from ctx where k = 'sup_3');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_res jsonb;
  v_ant uuid;
  v_p uuid;
  v_err text;
  v_err2 text;
begin
  v_res := public.fn_anticipo_proveedor_registrar(v_c, 585, 100000, 'transfer', 'pago_anticipado_precio', 'p11-C1', 374, 19, v_r4, null, null, 'TRF-C1', null, null, true);
  v_ant := (v_res ->> 'anticipo_id')::uuid;
  select id into v_p from public.anticipo_pendientes where advance_id = v_ant and tipo = 'retencion_por_evaluar';
  v_err := null;
  begin
    perform public.fn_anticipo_pendiente_resolver(v_p, 'ok', 'x', 374);
  exception when others then v_err := sqlerrm;
  end;
  perform public.fn_anticipo_pendiente_resolver(v_p, 'Proveedor sin RUT; se obtuvo y no correspondía retener por cuantía', 'RUT del proveedor', 374);
  v_err2 := null;
  begin
    perform public.fn_anticipo_pendiente_resolver(v_p, 'Segundo intento de resolver lo ya resuelto', 'Soporte', 374);
  exception when others then v_err2 := sqlerrm;
  end;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-9', 'Anticipo con retención por evaluar: pendiente abierto; resolver exige resolución y soporte; no se reabre',
     'retencion_pendiente=true al registrar; resolución corta rechazada; resuelto → retencion_pendiente=false; segundo intento pendiente_ya_resuelto',
     format('al registrar %s; %s; estado %s; anticipo pendiente %s; %s', v_res ->> 'retencion_pendiente', coalesce(v_err, 'NO RECHAZÓ'),
            (select estado from public.anticipo_pendientes where id = v_p), (select retencion_pendiente from public.supplier_advances where id = v_ant), coalesce(v_err2, 'NO RECHAZÓ')),
     (v_res ->> 'retencion_pendiente')::boolean and v_err = 'resolucion_obligatoria' and (select estado from public.anticipo_pendientes where id = v_p) = 'resuelto'
       and not (select retencion_pendiente from public.supplier_advances where id = v_ant) and v_err2 = 'pendiente_ya_resuelto');
end $$;

-- ═══ Estado de cuenta del proveedor y conciliación ═══════════════════════════
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_b int := (select v::int from ctx where k = 'sup_2');
  v_e jsonb;
  v_c jsonb;
  v_txt text;
begin
  v_e := public.fn_estado_cuenta_proveedor(374, v_a, null, null);
  select string_agg(format('%s C %s A %s', m ->> 'tipo', m ->> 'cargo', m ->> 'abono'), ' | ') into v_txt from jsonb_array_elements(v_e -> 'movimientos') m;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Estado de cuenta del proveedor A', 'factura 1.190.000 · anticipo abono 1.190.000 · aplicación sin cargo · saldo final 0',
     v_txt || '; saldo final ' || (v_e ->> 'saldo_final'), (v_e ->> 'saldo_final')::numeric = 0 and v_txt like '%anticipo C 0 A 1190000%');

  v_e := public.fn_estado_cuenta_proveedor(374, v_b, null, null);
  select string_agg(format('%s C %s A %s', m ->> 'tipo', m ->> 'cargo', m ->> 'abono'), ' | ') into v_txt from jsonb_array_elements(v_e -> 'movimientos') m;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('Estado', 'Estado de cuenta del proveedor B',
     'saldo final −4.500 = CxP 45.000 − anticipo vivo 49.500 (B6 entra y sale completo); aparecen correccion_retencion 8.000, anulacion_anticipo y devolucion_anticipo',
     v_txt || '; saldo final ' || (v_e ->> 'saldo_final'),
     (v_e ->> 'saldo_final')::numeric = -4500 and v_txt like '%correccion_retencion C 8000%' and v_txt like '%anulacion_anticipo C 238000%'
       and v_txt like '%devolucion_anticipo C 59500%');

  v_c := public.fn_certificado_retenciones_proveedor(374, v_b, current_date - 1, current_date + 1);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-7', 'Certificado del proveedor B como lo pide la pantalla (fn_certificado_retenciones_proveedor)',
     'totales: retenido 30.790 (retefuente 21.250 tras el reintegro de 750, reteIVA 7.125, reteICA 2.415; B6 entra y se revierte); documentos con anticipos y ajustes',
     (v_c -> 'totales')::text || '; documentos ' || (select string_agg(f ->> 'numero', ', ') from jsonb_array_elements(v_c -> 'facturas') f),
     (v_c -> 'totales' ->> 'retenido')::numeric = 30790 and (v_c -> 'totales' ->> 'retefuente')::numeric = 21250);

  v_c := public.fn_anticipos_proveedor_conciliacion(374, null);
  select string_agg(format('%s %s: valor %s apl %s dev %s anul %s saldo %s libros %s pend %s', a ->> 'proveedor', a ->> 'naturaleza', a ->> 'valor', a ->> 'aplicado',
                           a ->> 'devuelto', a ->> 'anulado', a ->> 'saldo', a ->> 'saldo_libros', a ->> 'pendientes_abiertos'), ' | ') into v_txt
    from jsonb_array_elements(v_c -> 'anticipos') a;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Conciliación por anticipo', '8 anticipos; en cada uno valor − aplicado − cruzado con consignación − devuelto − anulado = saldo = saldo en libros',
     v_txt, jsonb_array_length(v_c -> 'anticipos') = 8 and (select bool_and((a ->> 'cuadra')::boolean) from jsonb_array_elements(v_c -> 'anticipos') a));
  select string_agg(format('%s: saldo %s libros %s auxiliar %s pendientes %s', p ->> 'proveedor', p ->> 'saldo', p ->> 'saldo_libros', p ->> 'auxiliar_nit', p ->> 'pendientes_abiertos'), ' | ')
    into v_txt from jsonb_array_elements(v_c -> 'proveedores') p;
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P6', 'Conciliación por proveedor', 'saldo = libros = auxiliar por NIT; B: 49.500 con 4 pendientes abiertos',
     v_txt, (select bool_and((p ->> 'saldo')::numeric = (p ->> 'saldo_libros')::numeric and (p ->> 'saldo')::numeric = (p ->> 'auxiliar_nit')::numeric)
               from jsonb_array_elements(v_c -> 'proveedores') p)
            and exists (select 1 from jsonb_array_elements(v_c -> 'proveedores') p
                         where p ->> 'proveedor' = 'Proveedor de prueba B' and (p ->> 'saldo')::numeric = 49500 and (p ->> 'pendientes_abiertos')::int = 4));
end $$;

reset role;

-- Cruces con consignación (20261108121000, sin aplicar en esta corrida): la función no devuelve filas y nada falla.
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'Consignación', 'Cruces con consignación (20261108121000) sin esa migración aplicada', 'fn_anticipo_cruces_consignacion devuelve 0 filas; la tabla no existe',
       format('filas %s; tabla %s', (select count(*) from public.fn_anticipo_cruces_consignacion(374, null)),
              coalesce(to_regclass('public.consignment_advance_crossings')::text, 'no existe')),
       (select count(*) from public.fn_anticipo_cruces_consignacion(374, null)) = 0;

-- ═══ R2-7 · Certificado: retenciones de anticipos y sus ajustes, sin repetir ══
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'R2-7', 'Filas del certificado del proveedor B (fn_retenciones_practicadas_filas) contra libros por NIT',
       'retefuente 21.250 (factura 20.000 + anticipos − corrección − anulación − devoluciones − reintegro 750), reteIVA 7.125, reteICA 2.415 = 30.790 = libros 236x NIT 900000002',
       format('%s; total %s; libros %s', c.txt, c.total, l.libros), c.total = 30790 and l.libros = 30790 and c.ok
  from (select string_agg(x.clase || ' ' || x.v, ', ' order by x.clase) as txt, sum(x.v) as total,
               bool_and((x.clase = 'retefuente' and x.v = 21250) or (x.clase = 'reteiva' and x.v = 7125) or (x.clase = 'reteica' and x.v = 2415)) as ok
          from (select f.clase, sum(f.valor) as v
                  from public.fn_retenciones_practicadas_filas(374, now() - interval '1 day', now() + interval '1 day', null, (select v::int from ctx where k = 'sup_2')) f
                 group by f.clase) x) c,
       (select sum(l.credit - l.debit) as libros
          from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
         where e.organization_id = 374 and l.tercero_nit = '900000002' and left(l.account_code, 3) = '236') l;
insert into r (caso, verificacion, esperado, obtenido, ok)
select 'R2-7', 'Certificado del proveedor A', 'solo las del anticipo (la factura vinculada no retuvo): 40.000 + 28.500 + 9.660, una vez cada una',
       string_agg(f.numero || ' ' || f.clase || ' ' || f.valor, ', ' order by f.clase), count(*) = 3 and sum(f.valor) = 78160
  from public.fn_retenciones_practicadas_filas(374, now() - interval '1 day', now() + interval '1 day', null, (select v::int from ctx where k = 'sup_1')) f;

-- ═══ Perfil con renta e IVA separados (20261108160500) y supuesto de compra a SIMPLE ═
update public.organization_tax_profiles set gran_contribuyente = false, agente_retencion_iva = false where organization_id = 374;
do $$
declare
  v_a int := (select v::int from ctx where k = 'sup_1');
  v_d int := (select v::int from ctx where k = 'sup_4');
  v_r4 uuid := (select v::uuid from ctx where k = 'tax_rete4');
  v_ica uuid := (select v::uuid from ctx where k = 'regla_ica');
  v_e jsonb;
  v_ed jsonb;
  v_e2 jsonb;
  v_e3 jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
  v_e := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  v_ed := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_d, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  update public.organization_tax_profiles set agente_retencion_iva = true where organization_id = 374;
  v_e2 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  update public.organization_tax_profiles set requiere_revision = true where organization_id = 374;
  v_e3 := public.fn_anticipo_proveedor_evaluar_retenciones(374, v_a, 'pago_anticipado_precio', 1190000, 19, v_r4, v_ica, null, true);
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('P1', 'Perfil 160500: agente de reteIVA y gran contribuyente propios mandan sobre O-13',
     'ambos false: reteIVA no_aplica/pagador_no_agente_reteiva; agente_retencion_iva true: 28.500; requiere_revision: pendiente',
     format('%s / %s / %s', v_e -> 'clases' -> 1 ->> 'motivo', v_e2 -> 'clases' -> 1 ->> 'valor', v_e3 -> 'clases' -> 0 ->> 'motivo'),
     v_e -> 'clases' -> 1 ->> 'motivo' = 'pagador_no_agente_reteiva' and (v_e2 -> 'clases' -> 1 ->> 'valor')::numeric = 28500
       and v_e3 -> 'clases' -> 0 ->> 'motivo' = 'perfil_requiere_revision');
  insert into r (caso, verificacion, esperado, obtenido, ok) values
    ('R2-3', 'Otros supuestos de reteIVA: org responsable de IVA (no agente) comprando a un SIMPLE responsable', 'reteIVA pendiente/supuesto_compra_a_simple_por_confirmar',
     (v_ed -> 'clases' -> 1)::text, v_ed -> 'clases' -> 1 ->> 'motivo' = 'supuesto_compra_a_simple_por_confirmar');
end $$;

-- El control de cuadre de la base corre aquí, sobre todos los asientos de la transacción.
set constraints all immediate;

insert into r (caso, verificacion, esperado, obtenido, ok)
select 'Cuadre', 'Asientos de la prueba (cuadre de la base + suma)', 'todos cuadran; ninguna línea en 1330',
       format('%s asientos (%s); cuadran %s; líneas en 1330: %s', count(*), string_agg(distinct je.source, ', '), bool_and(t.d = t.c), sum(t.en_1330)),
       bool_and(t.d = t.c) and sum(t.en_1330) = 0
  from public.journal_entries je
  join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330
          from public.journal_lines group by 1) t on t.journal_entry_id = je.id
 where je.organization_id = 374 and je.id > (select v::int from ctx where k = 'max_je')
   and je.source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund', 'supplier_advance_withholding_refund', 'reversal');

reset role;

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
