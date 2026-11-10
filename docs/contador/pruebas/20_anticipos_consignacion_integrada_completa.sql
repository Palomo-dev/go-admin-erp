-- Pruebas en seco 20 · INTEGRADA anticipos ↔ consignación con los archivos COMPLETOS y EXACTOS (ronda 4 del Contador:
-- «una prueba integrada con los archivos completos y exactos de consignación y anticipos, que incluya retenciones,
-- certificados, devoluciones y anulaciones entre períodos y años»), REEJECUTADA para la ronda 5 (2026-11-09) con las
-- pruebas nuevas 25 (anticipos) y 26 (consignación). Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585).
--
-- Una sola transacción (termina con una excepción = rollback; nada queda escrito): CARGA ejecuta, completas y exactas
-- (md5 comprobado), TODAS las migraciones sin aplicar que necesitan estos archivos, en orden de versión: 20261108120500
-- → 121000 → 140500 → 160000 → 160500 → 165000 → 170000. Después corren, en la MISMA transacción y sobre el mismo estado,
-- los cuerpos completos de las pruebas 11 (anticipos, rondas 1-4), 21 (anticipos, ronda 4), 25 (anticipos, ronda 5),
-- 15 (consignación, ronda 3), 22 (consignación, ronda 4), 26 (consignación, ronda 5) y el cuerpo propio de esta: anticipo
-- al consignante cruzado con el mandato y devuelto por línea; certificado contra libros por NIT; anulaciones por error
-- dentro de un período (octubre) y entre años (diciembre de 2025 → enero de 2026); retenciones de consignación
-- practicadas en octubre y en diciembre de 2025 con el cobro de su factura (ronda 5), liquidaciones anuladas en
-- noviembre y reliquidadas. Los hechos anteriores se simulan fechando, como administrador, los anticipos, sus
-- retenciones, las porciones vendidas y los cobros.
-- Resultado: 20_anticipos_consignacion_integrada_completa.resultado.txt

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

-- ════ CUERPO: 21.sql ════
-- ════ 21 · Anticipos, ronda 4: AIU por régimen, procedimiento municipal de ReteICA, devoluciones por el hecho y por líneas,
--      período de descuento por impuesto (entre períodos y entre años) y conversión de la financiación en pago o abono ════
select set_config('dry.prueba', '21', true);
-- Si corre después de la 11 (prueba 20), esta dejó los controles de cuadre inmediatos: se vuelven a diferir como en una RPC.
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s21$
declare
  v_g int; v_h int; v_ica uuid;
begin
  insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
  select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov, c.requiere_centro_costo
    from public.chart_of_accounts c, (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true)) x(code, name, parent, mov)
   where c.organization_id = 374 and c.account_code = '1330'
     and not exists (select 1 from public.chart_of_accounts y where y.organization_id = 374 and y.account_code = x.code);
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select 374, null, 'anticipos_proveedores', '13300501'
   where not exists (select 1 from public.configuracion_contable where organization_id = 374 and clave = 'anticipos_proveedores');
  update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
  if exists (select 1 from public.organization_tax_profiles where organization_id = 374) then
    update public.organization_tax_profiles set requiere_revision = false, agente_retencion = true, agente_retencion_iva = null, gran_contribuyente = null,
           responsabilidades = array['O-13', 'O-48'] where organization_id = 374;
  else
    insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
    values (374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral');
  end if;
  -- Segundo miembro de la org 374 (el que valida como Contador: nunca quien registró la regla).
  insert into public.organization_members (organization_id, user_id, role_id, is_active)
  select 374, o.owner_user_id, 2, true from public.organizations o
   where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 21-G', '900000211', 'company', 'comun', array['O-48']) returning id into v_g;
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 21-H', '900000212', 'company', 'comun', array['O-48']) returning id into v_h;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Servicios (prueba 21)', 9.66, 'Acuerdo municipal de ReteICA (prueba 21)', date '2025-01-01')
  returning id into v_ica;
  perform set_config('d21.g', v_g::text, true);
  perform set_config('d21.h', v_h::text, true);
  perform set_config('d21.ica', v_ica::text, true);
  perform set_config('d21.r4', (select ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                                 where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d21.u', '{"sub":"bb11d6d2-f647-49f7-9b29-aa4c4438abf1","role":"authenticated"}', true);
  perform set_config('d21.u2', json_build_object('sub', (select owner_user_id from public.organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('d21.je0', (select coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374), true);
end $s21$;
select set_config('request.jwt.claims', current_setting('d21.u'), true);
set local role authenticated;

-- ── A · AIU: dos regímenes, fundamento estructurado, nada opera sin la validación del Contador ──────────────────────
do $a21$
declare
  g int := current_setting('d21.g')::int; h int := current_setting('d21.h')::int;
  r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  u text := current_setting('d21.u'); u2 text := current_setting('d21.u2');
  ct jsonb := '{"numero":"A-21","fecha":"2026-01-05","archivo":"contratos/a-21.pdf","valor":5000000}';
  c462 jsonb := '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de aseo con el AIU discriminado en el contrato"}';
  ccon jsonb := '{"objeto":"construccion_inmueble","licencia_construccion":"LC-11001-2026-0042","honorarios_pactados":false}';
  c1 uuid; c2 uuid; c3 uuid; e jsonb;
  q text := 'select public.fn_aiu_contrato_registrar(374, %s, %L, %L, %L, %L::jsonb, %L, %L::jsonb, %L, %L, %L::date)';
begin
  perform pg_temp.err('A1a 462-1 sin servicio comprendido', 'aiu_condiciones_462_1', format(q, g, 'servicios_462_1', 'Servicio de vigilancia de la sede', null, ct,
    'Estatuto Tributario, art. 462-1', c462, 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1b mantenimiento con «AIU» no pasa a construcción', 'aiu_mantenimiento_no_es_construccion', format(q, g, 'construccion_inmuebles',
    'Mantenimiento de la fachada con AIU', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', '{"objeto":"mantenimiento","honorarios_pactados":false}', 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1c construcción sin licencia de construcción', 'aiu_condiciones_construccion', format(q, g, 'construccion_inmuebles',
    'Construcción de la bodega nueva', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', '{"objeto":"construccion_inmueble","honorarios_pactados":false}', 'base_especial', 'valor_total', '2026-01-01'));
  perform pg_temp.err('A1d contrato sin archivo', 'aiu_contrato_incompleto', format(q, g, 'servicios_462_1', 'Servicio de aseo de la sede', 'aseo',
    '{"numero":"A-21","fecha":"2026-01-05","valor":5000000}', 'Estatuto Tributario, art. 462-1', c462, 'base_especial', 'valor_total', '2026-01-01'));
  c1 := public.fn_aiu_contrato_registrar(374, g, 'servicios_462_1', 'Servicio de aseo de la sede principal', 'aseo', ct, 'Estatuto Tributario, art. 462-1', c462,
                                         'base_especial', 'valor_total', date '2026-01-01');
  c2 := public.fn_aiu_contrato_registrar(374, g, 'construccion_inmuebles', 'Construcción de la bodega nueva', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9', ccon,
                                         'valor_total', 'valor_total', date '2026-01-01');
  c3 := public.fn_aiu_contrato_registrar(374, g, 'construccion_inmuebles', 'Construcción del local con honorarios', null, ct, 'DUR 1625 de 2016, art. 1.3.1.7.9',
                                         ccon || '{"honorarios_pactados":true}', 'valor_total', 'valor_total', date '2026-01-01');
  perform pg_temp.chk('A2a contratos registrados nacen pendientes de validación', 'pendiente_validacion,pendiente_validacion,pendiente_validacion',
    (select string_agg(estado, ',' order by created_at, id) from public.aiu_contratos where id in (c1, c2, c3)));
  perform pg_temp.err('A2b valida quien registró', 'validador_debe_ser_distinto',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'validado', 'Concepto del Contador sobre el contrato de aseo', 'Acta 1'));
  perform set_config('request.jwt.claims', u2, true);
  perform pg_temp.err('A2c concepto corto', 'concepto_obligatorio',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'validado', 'ok', 'Acta 1'));
  perform pg_temp.chk('A2d el Contador (otro usuario) valida el 462-1', 'validado',
    public.fn_tributario_regla_validar('aiu_contrato', c1, 'validado', 'Servicio de aseo comprendido en el art. 462-1; AIU discriminado; prestador habilitado', 'Concepto C-21-1', 374) ->> 'estado');
  perform pg_temp.err('A2e una regla ya decidida no se vuelve a decidir', 'regla_ya_decidida',
    format('select public.fn_tributario_regla_validar(%L, %L, %L, %L, %L, 374)', 'aiu_contrato', c1, 'rechazado', 'Intento de cambiar la decisión ya tomada', 'Acta 2'));
  perform public.fn_tributario_regla_validar('aiu_contrato', c2, 'validado', 'Construcción de inmueble con licencia; sin honorarios pactados: base la utilidad', 'Concepto C-21-2', 374);
  perform public.fn_tributario_regla_validar('aiu_contrato', c3, 'validado', 'Construcción de inmueble con licencia y honorarios pactados del constructor', 'Concepto C-21-3', 374);
  perform set_config('request.jwt.claims', u, true);

  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1038000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c1);
  perform pg_temp.chk('A3 462-1 validado: base A+I+U 200.000 (20 %), IVA 38.000; retefuente 4 % sobre la base especial; reteIVA 15 %; reteICA sobre el total',
    'iva 38000.00 · base IVA 200000.00 · rete 8000 · reteIVA 5700 · reteICA 9660 · mínimo false',
    format('iva %s · base IVA %s · rete %s · reteIVA %s · reteICA %s · mínimo %s', e ->> 'iva', e -> 'aiu' ->> 'base_iva', e -> 'clases' -> 0 ->> 'valor',
           e -> 'clases' -> 1 ->> 'valor', e -> 'clases' -> 2 ->> 'valor', e -> 'aiu' ->> 'minimo_10_aplicado'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":950000},{"tratamiento":"aiu_administracion","base":20000},{"tratamiento":"aiu_imprevistos","base":10000},{"tratamiento":"aiu_utilidad","base":20000}]', true, c1);
  perform pg_temp.chk('A4 462-1 con AIU de 50.000 (5 %): la base no baja del 10 % del valor (100.000)', 'base IVA 100000.00 · iva 19000.00 · mínimo true · rete 4000',
    format('base IVA %s · iva %s · mínimo %s · rete %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva', e -> 'aiu' ->> 'minimo_10_aplicado', e -> 'clases' -> 0 ->> 'valor'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1009500, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_administracion","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c2);
  perform pg_temp.chk('A5 construcción sin honorarios: IVA sobre la utilidad (50.000), SIN el mínimo del 10 %', 'base IVA 50000.00 · iva 9500.00 · mínimo false · reteIVA 1425',
    format('base IVA %s · iva %s · mínimo %s · reteIVA %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva', e -> 'aiu' ->> 'minimo_10_aplicado', e -> 'clases' -> 1 ->> 'valor'));
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_honorarios","base":100000}]', true, c3);
  perform pg_temp.chk('A6 construcción con honorarios pactados: IVA sobre los honorarios del constructor', 'base IVA 100000.00 · iva 19000.00',
    format('base IVA %s · iva %s', e -> 'aiu' ->> 'base_iva', e ->> 'iva'));
  perform pg_temp.err('A7 honorarios en un contrato del 462-1', 'aiu_componentes_regimen', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1019000, 19, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":900000},{"tratamiento":"aiu_honorarios","base":100000}]', c1));
  perform pg_temp.err('A8 AIU mezclado con una línea gravada', 'aiu_componentes_mezclados', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1309000, 19, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"gravado","base":100000,"tarifa_iva":19},{"tratamiento":"aiu_costo_directo","base":1000000},{"tratamiento":"aiu_utilidad","base":100000}]', c1));
  perform pg_temp.err('A9 contrato AIU de otro proveedor', 'aiu_contrato_invalido', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1038000, 19, %L, %L, %L::jsonb, true, %L)',
    h, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', c1));
  perform pg_temp.err('A10 AIU sin tarifa de IVA', 'tarifa_iva_invalida', format('select public.fn_anticipo_proveedor_evaluar_retenciones(374, %s, %L, 1038000, null, %L, %L, %L::jsonb, true, %L)',
    g, 'pago_anticipado_precio', r4, ica, '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', c1));
end $a21$;

-- ── B · ReteICA: procedimiento del MISMO municipio, validado; sin él, bloqueado ─────────────────────────────────────
do $b21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  u text := current_setting('d21.u'); u2 text := current_setting('d21.u2');
  x1 uuid; pb uuid; pm uuid; res jsonb;
  proc jsonb; sop jsonb := '{"calculo":"Cálculo de la línea devuelta","certificado":"Certificado corregido 21"}';
  hecho jsonb := jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 21-1', 'fecha', current_date);
  lin jsonb := '[{"componente":"0","base":100000,"iva":19000}]';
  q text := 'select public.fn_anticipo_proveedor_devolver(%L, 111184, %L, %L, %L, 374, null, %L, %L::jsonb)';
begin
  perform pg_temp.err('B1 procedimiento sin pruebas', 'procedimiento_ica_incompleto',
    format('select public.fn_reteica_procedimiento_registrar(374, %L, %L, %L, %L::text[], %L, %L, %L, %L, %L::date)', '6c5bba87-87af-4e41-9b2d-5381d7a3b04f',
           'Acuerdo municipal (prueba 21)', 'Solicitud escrita del afectado', '{}', 'Reintegro por transferencia al proveedor', 'Certificado corregido del bimestre',
           'periodo_siguiente_al_reintegro', 'Se descuentan en los bimestres siguientes', '2026-01-01'));
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p21-X1', 374, 19, r4, ica, null, 'TRF-21-X1', null, null, true);
  x1 := (res ->> 'anticipo_id')::uuid;
  perform set_config('d21.x1', x1::text, true);
  perform pg_temp.chk('B2a anticipo con reteICA municipal practicada al girar', '40000 · 9660 · 28500',
    (select string_agg(round(w.valor)::text, ' · ' order by w.clase) from public.supplier_advance_withholdings w where w.advance_id = x1));
  proc := jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false, 'hecho', hecho, 'lineas', lin, 'soportes', sop);
  perform pg_temp.err('B2b reversión de reteICA sin procedimiento del municipio: bloqueada', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B2b', 'Consignación 21-1', proc));
  pm := public.fn_reteica_procedimiento_registrar(374, '3c3b7d69-2711-4d3c-b116-c6113cf6b3b5', 'Norma de ReteICA de otro municipio (prueba)', 'Solicitud escrita ante el agente',
          array['prueba_pago'], 'Reintegro por transferencia al proveedor', 'Certificado corregido del bimestre', 'periodo_del_reintegro',
          'Se descuentan en los bimestres siguientes', date '2026-01-01');
  perform set_config('request.jwt.claims', u2, true);
  perform public.fn_tributario_regla_validar('reteica_procedimiento', pm, 'validado', 'Procedimiento del otro municipio revisado contra su norma', 'Concepto ICA-2', 374);
  perform set_config('request.jwt.claims', u, true);
  perform pg_temp.err('B3 el procedimiento validado de OTRO municipio no se traslada', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B3', 'Consignación 21-1', proc));
  pb := public.fn_reteica_procedimiento_registrar(374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Acuerdo municipal de ReteICA (prueba 21)',
          'Solicitud escrita del afectado ante el agente retenedor', array['prueba_pago', 'liquidacion_corregida'], 'Reintegro por transferencia al proveedor',
          'Certificado de ReteICA corregido del bimestre', 'periodo_siguiente_al_reintegro', 'Lo que no alcance se descuenta en los bimestres siguientes', date '2026-01-01');
  perform pg_temp.err('B4a procedimiento del municipio registrado pero sin validar: sigue bloqueado', 'reteica_sin_procedimiento_municipal',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B4a', 'Consignación 21-1', proc));
  perform set_config('request.jwt.claims', u2, true);
  perform public.fn_tributario_regla_validar('reteica_procedimiento', pb, 'validado', 'Procedimiento del municipio revisado contra el acuerdo municipal', 'Concepto ICA-1', 374);
  perform set_config('request.jwt.claims', u, true);
  perform pg_temp.err('B4b validado, pero sin las pruebas que el procedimiento exige', 'reteica_pruebas_incompletas',
    format(q, x1, 'transfer', 'Devolución parcial', 'p21-B4b', 'Consignación 21-1', proc));
  proc := jsonb_set(proc, '{soportes}', sop || jsonb_build_object('ica', jsonb_build_object('solicitud', 'Radicado 21-7', 'certificado', 'Certificado ICA 21-7',
                                                                                         'prueba_pago', 'Comprobante 21-7', 'liquidacion_corregida', 'Liquidación 21-7')));
  res := public.fn_anticipo_proveedor_devolver(x1, 111184, 'transfer', 'Devolución parcial', 'p21-B4c', 374, null, 'Consignación 21-1', proc);
  perform pg_temp.chk('B4c con el procedimiento del municipio y sus pruebas: retefuente 4.000 · reteIVA 2.850 · reteICA 966',
    '7816.00 · ' || to_char(current_date, 'YYYY-MM') || ' · ' || to_char(current_date + interval '1 month', 'YYYY-MM'),
    (res ->> 'retencion_revertida') || ' · '
    || (select periodo_descuento from public.supplier_advance_withholding_ajustes where advance_id = x1 and clase = 'retefuente' and tipo = 'devolucion') || ' · '
    || (select periodo_descuento from public.supplier_advance_withholding_ajustes where advance_id = x1 and clase = 'reteica' and tipo = 'devolucion'));
  -- Ronda 5: la anulación en renta es el art. 1.2.4.8 del DUR (la ronda 4 citaba un artículo que no trata devoluciones).
  perform pg_temp.chk('B4d la regla del período queda escrita por impuesto', 'retefuente:DUR 1.2.4.8 · reteica:periodo_siguiente_al_reintegro',
    (select string_agg(clase || ':' || split_part(regla_periodo, ':', 1), ' · ' order by clase) from public.supplier_advance_withholding_ajustes
      where advance_id = x1 and tipo = 'devolucion' and clase in ('retefuente', 'reteica')));
  -- Reintegro de reteICA en exceso: 9.660 − 966 = 8.694 vigente; la correcta era 4,14 ‰ sobre 900.000 = 3.726 → exceso 4.968.
  perform pg_temp.err('B5a exceso de retefuente sin la solicitud del afectado y sus pruebas', 'soporte_procedimiento_obligatorio',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 2.5, %L, %L, %L::jsonb, null, false, %L, 374)', x1, 'retefuente', 'transfer', 'p21-B5a',
           '{"calculo":"Cálculo","certificado":"Certificado"}', 'Tarifa equivocada'));
  perform pg_temp.err('B5b reteICA en exceso sin las pruebas del procedimiento', 'reteica_pruebas_incompletas',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 0.414, %L, %L, %L::jsonb, null, false, %L, 374)', x1, 'reteica', 'transfer', 'p21-B5b',
           '{"calculo":"Cálculo","certificado":"Certificado","solicitud":"Solicitud 9","pruebas":"Factura"}', 'Tarifa equivocada'));
  perform pg_temp.err('B5c el período de descuento no se elige', 'periodo_descuento_no_es_de_libre_eleccion',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 900000, 0.414, %L, %L, %L::jsonb, %L, false, %L, 374)', x1, 'reteica', 'transfer', 'p21-B5c',
           jsonb_build_object('calculo', 'Cálculo', 'certificado', 'Certificado', 'solicitud', 'Solicitud 9', 'pruebas', 'Factura',
                              'ica', jsonb_build_object('solicitud', 'Radicado 21-8', 'certificado', 'Certificado ICA 21-8', 'prueba_pago', 'Comprobante 21-8',
                                                        'liquidacion_corregida', 'Liquidación 21-8')), to_char(current_date, 'YYYY-MM'), 'Tarifa equivocada'));
  res := public.fn_anticipo_retencion_exceso_reintegrar(x1, 'reteica', 900000, 0.414, 'transfer', 'p21-B5d',
           jsonb_build_object('calculo', 'Tarifa de la actividad: 4,14 por mil', 'certificado', 'Certificado ICA corregido', 'solicitud', 'Solicitud 9', 'pruebas', 'Factura',
                              'ica', jsonb_build_object('solicitud', 'Radicado 21-8', 'certificado', 'Certificado ICA 21-8', 'prueba_pago', 'Comprobante 21-8',
                                                        'liquidacion_corregida', 'Liquidación 21-8')), null, false, 'Tarifa equivocada', 374);
  perform pg_temp.chk('B5d reintegro del exceso de reteICA en el período que fija el procedimiento', '4968.00 · ' || to_char(current_date + interval '1 month', 'YYYY-MM'),
    (res ->> 'reintegro') || ' · ' || (res ->> 'periodo_descuento'));
end $b21$;

-- ── C · Devoluciones: soporte del hecho, líneas afectadas, período por impuesto ─────────────────────────────────────
do $c21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  x2 uuid; res jsonb; base jsonb; q text;
  ica_sop jsonb := jsonb_build_object('solicitud', 'Radicado 21-9', 'certificado', 'Certificado ICA 21-9', 'prueba_pago', 'Comprobante 21-9', 'liquidacion_corregida', 'Liquidación 21-9');
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 795000, 'transfer', 'pago_anticipado_precio', 'p21-X2', 374, null, r4, ica, null, 'TRF-21-X2', null,
           '[{"descripcion":"Servicio gravado","tratamiento":"gravado","base":500000,"tarifa_iva":19},{"descripcion":"Bien excluido","tratamiento":"excluido","base":200000}]', true);
  x2 := (res ->> 'anticipo_id')::uuid;
  perform pg_temp.chk('C0 anticipo mixto: retefuente 28.000 · reteIVA 14.250 · reteICA 6.762', '28000 · 6762 · 14250',
    (select string_agg(round(w.valor)::text, ' · ' order by w.clase) from public.supplier_advance_withholdings w where w.advance_id = x2));
  base := jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
            'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 21-2', 'fecha', current_date),
            'lineas', '[{"componente":"1","base":200000,"iva":0}]'::jsonb,
            'soportes', jsonb_build_object('calculo', 'Línea excluida resuelta', 'certificado', 'Certificado corregido 21-2', 'ica', ica_sop));
  q := 'select public.fn_anticipo_proveedor_devolver(%L, 190068, %L, %L, %L, 374, null, %L, %L::jsonb)';
  perform pg_temp.err('C1a la solicitud del proveedor sola no prueba la resolución', 'solicitud_no_prueba_el_hecho',
    format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1a', 'Consignación 21-2',
           jsonb_set(base, '{hecho}', jsonb_build_object('tipo', 'solicitud_proveedor', 'documento', 'Carta del proveedor', 'fecha', current_date))));
  perform pg_temp.err('C1b sin soporte del hecho', 'soporte_del_hecho_obligatorio', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1b', 'Consignación 21-2', base - 'hecho'));
  perform pg_temp.err('C1c resolución parcial sin líneas afectadas', 'lineas_afectadas_obligatorias', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1c', 'Consignación 21-2', base - 'lineas'));
  perform pg_temp.err('C1d línea que excede lo que queda de ella', 'linea_excede_lo_pendiente', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1d', 'Consignación 21-2',
    jsonb_set(base, '{lineas}', '[{"componente":"1","base":250000,"iva":0}]')));
  perform pg_temp.err('C1e IVA de la línea que no es el de la operación', 'linea_iva_no_cuadra', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1e', 'Consignación 21-2',
    jsonb_set(base, '{lineas}', '[{"componente":"0","base":100000,"iva":0}]')));
  perform pg_temp.err('C1f el período de descuento no es de libre elección', 'periodo_descuento_no_es_de_libre_eleccion', format(q, x2, 'transfer', 'Resolución parcial', 'p21-C1f', 'Consignación 21-2',
    base || '{"periodo_descuento":"2026-01"}'));
  res := public.fn_anticipo_proveedor_devolver(x2, 190068, 'transfer', 'Resolución parcial: el bien excluido no se entregará', 'p21-C1g', 374, null, 'Consignación 21-2', base);
  perform pg_temp.chk('C1g resolución parcial de la línea excluida (sin agotar el anticipo): cada retención sobre lo que cubrió; reteIVA 0 (prorrata ciega daría 3.585)',
    'retefuente 8000 · reteica 1932 · total 9932.00 · saldo 595000.00',
    (select string_agg(d ->> 'clase' || ' ' || (d ->> 'revertido'), ' · ' order by d ->> 'clase') from jsonb_array_elements(res -> 'detalle') d)
      || ' · total ' || (res ->> 'retencion_revertida') || ' · saldo ' || (res ->> 'saldo_disponible'));
end $c21$;

-- Hecho de un mes anterior (el anticipo era de octubre) y retención de un año anterior (el anticipo era de diciembre de 2025):
-- se simula fechando el anticipo y su retención como administrador.
do $c21b$
declare res jsonb;
begin
  res := public.fn_anticipo_proveedor_registrar(current_setting('d21.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p21-X3', 374, 19,
           current_setting('d21.r4')::uuid, current_setting('d21.ica')::uuid, null, 'TRF-21-X3', null, null, true);
  perform set_config('d21.x3', res ->> 'anticipo_id', true);
  res := public.fn_anticipo_proveedor_registrar(current_setting('d21.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p21-X4', 374, 19,
           current_setting('d21.r4')::uuid, current_setting('d21.ica')::uuid, null, 'TRF-21-X4', null, null, true);
  perform set_config('d21.x4', res ->> 'anticipo_id', true);
end $c21b$;
reset role;
update public.supplier_advances set created_at = timestamptz '2026-10-01 10:00-05' where id = current_setting('d21.x3')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2026-10-01 10:00-05' where advance_id = current_setting('d21.x3')::uuid;
update public.supplier_advances set created_at = timestamptz '2025-12-15 10:00-05' where id = current_setting('d21.x4')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2025-12-15 10:00-05' where advance_id = current_setting('d21.x4')::uuid;
select set_config('request.jwt.claims', current_setting('d21.u'), true);
set local role authenticated;
do $c21c$
declare
  x3 uuid := current_setting('d21.x3')::uuid; x4 uuid := current_setting('d21.x4')::uuid; res jsonb;
  sop jsonb := jsonb_build_object('calculo', 'Retenciones practicadas al girar', 'certificado', 'Certificado anulado',
                                  'ica', jsonb_build_object('solicitud', 'Radicado 21-10', 'certificado', 'Certificado ICA 21-10', 'prueba_pago', 'Comprobante 21-10',
                                                            'liquidacion_corregida', 'Liquidación 21-10'));
begin
  res := public.fn_anticipo_proveedor_devolver(x3, 111184, 'transfer', 'Se resolvió el contrato en octubre', 'p21-C2', 374, null, 'Consignación 21-3',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', false, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'resciliacion', 'documento', 'Acta de resciliación 21-3', 'fecha', date '2026-10-20')));
  perform pg_temp.chk('C2 hecho de octubre registrado en noviembre: renta e IVA en el período del hecho; ICA según su procedimiento',
    'reteiva 2026-10 · reteica ' || to_char(current_date + interval '1 month', 'YYYY-MM') || ' · retefuente 2026-10 · fechas renta/IVA en 2026-10',
    (select string_agg(clase || ' ' || periodo_descuento, ' · ' order by clase desc) from public.supplier_advance_withholding_ajustes where advance_id = x3)
      || ' · fechas renta/IVA en ' || (select string_agg(distinct to_char(fecha at time zone 'America/Bogota', 'YYYY-MM'), ',')
                                        from public.supplier_advance_withholding_ajustes where advance_id = x3 and clase <> 'reteica'));
  perform pg_temp.chk('C2b octubre conserva neto no negativo (sin excedente); el reteICA de diciembre, sin retenciones practicadas, pasa a los siguientes', '0/1',
    (select count(*) filter (where detalle ->> 'periodo' = '2026-10')::text || '/' || count(*) filter (where detalle ->> 'clase' = 'reteica')::text
       from public.anticipo_pendientes where advance_id = x3 and tipo = 'descuento_retencion_siguientes_periodos'));
  res := public.fn_anticipo_proveedor_devolver(x4, 111184, 'transfer', 'Se resolvió en enero el contrato de diciembre de 2025', 'p21-C3', 374, null, 'Consignación 21-4',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', true, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'sentencia_o_laudo', 'documento', 'Laudo 21-4', 'fecha', date '2026-01-15')));
  perform pg_temp.chk('C3a retención de 2025 revertida por un hecho de enero de 2026: período 2026-01 (renta e IVA)', 'reteiva 2026-01 · retefuente 2026-01',
    (select string_agg(clase || ' ' || periodo_descuento, ' · ' order by clase desc) from public.supplier_advance_withholding_ajustes
      where advance_id = x4 and clase <> 'reteica'));
  perform pg_temp.chk('C3b pendientes: excedente para los períodos siguientes, otro año y corrección de la declaración', 'correccion_declaracion · descuento_retencion_siguientes_periodos · retencion_revertida_otro_anio',
    (select string_agg(distinct tipo, ' · ') from public.anticipo_pendientes where advance_id = x4));
  perform pg_temp.chk('C3c enero de 2026 queda con neto negativo en retefuente (−4.000): se descuenta en los siguientes', '-4000.00',
    (select (detalle ->> 'por_descontar') from public.anticipo_pendientes where advance_id = x4 and tipo = 'descuento_retencion_siguientes_periodos'
      and detalle ->> 'clase' = 'retefuente') :: numeric * -1 || '');
end $c21c$;

-- ── D · Financiación que se convierte en pago o abono del precio (sin depender de la factura) ─────────────────────────
do $d21$
declare
  g int := current_setting('d21.g')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid;
  f1 uuid; res jsonb; conv uuid; q text;
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 500000, 'transfer', 'financiacion', 'p21-F1', 374, null, null, null, null, 'TRF-21-F1', null, null, null);
  f1 := (res ->> 'anticipo_id')::uuid;
  perform pg_temp.chk('D1 financiación: no se retiene al girar', '0 · 500000.00', (res ->> 'retencion') || ' · ' || (res ->> 'girado'));
  q := 'select public.fn_anticipo_proveedor_convertir_en_pago(%L, %L, %L, current_date, %s, %L, 374, 19, %L, %L, null, true)';
  perform pg_temp.err('D2a convertir un pago anticipado (ya se evaluó al girar)', 'anticipo_no_es_financiacion', format(q, current_setting('d21.x1'), 'abono', 'Acta 21-5', 357000, 'p21-D2a', r4, ica));
  perform pg_temp.err('D2b sin soporte del hecho', 'soporte_obligatorio', format(q, f1, 'abono', '', 357000, 'p21-D2b', r4, ica));
  perform pg_temp.err('D2c más que lo financiado', 'conversion_excede_financiacion', format(q, f1, 'abono', 'Acta 21-5', 700000, 'p21-D2c', r4, ica));
  res := public.fn_anticipo_proveedor_convertir_en_pago(f1, 'abono', 'Acta de entrega parcial 21-5', current_date, 357000, 'p21-D2d', 374, 19, r4, ica, null, true);
  conv := (res ->> 'conversion_id')::uuid;
  perform set_config('d21.f1', f1::text, true);
  perform pg_temp.chk('D2d abono de 357.000 (base 300.000 + IVA 57.000): retefuente 12.000 · reteIVA 8.550 · reteICA 2.898; girado convertido 333.552',
    '23448 · 333552.00 · 523448.00',
    (res ->> 'retencion') || ' · ' || (res ->> 'girado_convertido') || ' · ' || (res ->> 'saldo_disponible'));
  perform pg_temp.chk('D2e asiento de la conversión: D anticipo / C retenciones, con el NIT del proveedor', '13300501 D 23448 · 23652501 C 12000 · 23670501 C 8550 · 23680501 C 2898 · NIT 900000211',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc, l.account_code)
       from public.journal_lines l where l.journal_entry_id = (res ->> 'asiento_id')::int)
    || ' · NIT ' || (select string_agg(distinct l.tercero_nit, ',') from public.journal_lines l where l.journal_entry_id = (res ->> 'asiento_id')::int));
  perform pg_temp.chk('D3 conversión repetida con la misma clave', 'true',
    (public.fn_anticipo_proveedor_convertir_en_pago(f1, 'abono', 'Acta de entrega parcial 21-5', current_date, 357000, 'p21-D2d', 374, 19, r4, ica, null, true) ->> 'repetida'));
  -- Resolución parcial de una línea del ABONO (la línea se identifica con la conversión).
  res := public.fn_anticipo_proveedor_devolver(f1, 111184, 'transfer', 'Se resolvió parte del abono', 'p21-D4', 374, null, 'Consignación 21-6',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
                              'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 21-6', 'fecha', current_date),
                              'lineas', jsonb_build_array(jsonb_build_object('componente', conv::text || ':0', 'base', 100000, 'iva', 19000)),
                              'soportes', jsonb_build_object('calculo', 'Parte del abono', 'certificado', 'Certificado corregido 21-6',
                                                             'ica', jsonb_build_object('solicitud', 'Radicado 21-11', 'certificado', 'Certificado ICA 21-11',
                                                                                       'prueba_pago', 'Comprobante 21-11', 'liquidacion_corregida', 'Liquidación 21-11'))));
  perform pg_temp.chk('D4 resolución parcial de una línea del abono convertido: 4.000 + 2.850 + 966', '7816.00 · 111184.00',
    (res ->> 'retencion_revertida') || ' · ' || (res ->> 'dinero'));
end $d21$;
reset role;
do $e21$
declare f1 uuid := current_setting('d21.f1')::uuid;
begin
  perform pg_temp.chk('E1 certificado: las retenciones de la conversión en su fecha, como «Abono del anticipo»', '3 · 23448.00',
    (select count(*)::text || ' · ' || sum(f.valor)::text from public.fn_retenciones_practicadas_filas(374, now() - interval '1 day', now() + interval '1 day', null,
       current_setting('d21.g')::int) f where f.numero like 'Abono del anticipo%'));
  perform pg_temp.chk('E2 conciliación del anticipo convertido: tabla = libros', 'true · 404448.00 · 404448.00',
    (select (a ->> 'cuadra') || ' · ' || (a ->> 'saldo') || ' · ' || (a ->> 'saldo_libros')
       from jsonb_array_elements(public.fn_anticipos_proveedor_conciliacion(374, current_setting('d21.g')::int) -> 'anticipos') a where a ->> 'anticipo_id' = f1::text));
  perform pg_temp.chk('E3 estado de cuenta: la conversión aparece con su retención', '23448.00',
    (select m.abono::text from public.fn_estado_cuenta_proveedor_movs(374, current_setting('d21.g')::int) m where m.tipo = 'conversion_anticipo'));
  perform pg_temp.chk('E4 asientos de la prueba 21: todos cuadran; ninguno en 1330', 'true · 0',
    (select bool_and(t.d = t.c)::text || ' · ' || sum(t.en_1330)::text from public.journal_entries je
       join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330 from public.journal_lines group by 1) t
         on t.journal_entry_id = je.id
      where je.organization_id = 374 and je.id > current_setting('d21.je0')::int));
end $e21$;

-- ════ CUERPO: 25.sql ════
-- ════ 25 · Anticipos, ronda 5: período de la reteIVA en reversiones (DUR 1.3.2.3.1: el de la anulación y el saldo en los
--      dos siguientes), citas corregidas (renta: 1.2.4.8 y 1.2.4.16), reteIVA en exceso con solicitud escrita y
--      manifestación de no imputación, excedente de reteICA sin límite de períodos con la solicitud guardada, y piso del
--      10 % del AIU por operación y acumulado del contrato ════
select set_config('dry.prueba', '25', true);
-- Si corre después de otras pruebas (integrada), los controles de cuadre se vuelven a diferir como en una RPC.
set constraints all deferred;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s25$
declare
  v_g int; v_ica uuid;
begin
  insert into public.chart_of_accounts (account_code, organization_id, name, type, parent_code, is_active, naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo)
  select x.code, 374, x.name, c.type, x.parent, true, c.naturaleza, x.mov, x.mov, c.requiere_centro_costo
    from public.chart_of_accounts c, (values ('133005', 'A proveedores', '1330', false), ('13300501', 'Anticipos a proveedores nacionales', '133005', true)) x(code, name, parent, mov)
   where c.organization_id = 374 and c.account_code = '1330'
     and not exists (select 1 from public.chart_of_accounts y where y.organization_id = 374 and y.account_code = x.code);
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select 374, null, 'anticipos_proveedores', '13300501'
   where not exists (select 1 from public.configuracion_contable where organization_id = 374 and clave = 'anticipos_proveedores');
  update public.configuracion_contable set account_code = '13300501' where organization_id = 374 and clave = 'anticipos_proveedores';
  if exists (select 1 from public.organization_tax_profiles where organization_id = 374) then
    update public.organization_tax_profiles set requiere_revision = false, agente_retencion = true, agente_retencion_iva = null, gran_contribuyente = null,
           responsabilidades = array['O-13', 'O-48'] where organization_id = 374;
  else
    insert into public.organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion, responsable_inc, periodicidad_iva)
    values (374, date '2026-01-01', 'ordinario', array['O-13', 'O-48'], true, false, 'bimestral');
  end if;
  -- Segundo miembro de la org 374 (el que valida como Contador: nunca quien registró la regla).
  insert into public.organization_members (organization_id, user_id, role_id, is_active)
  select 374, o.owner_user_id, 2, true from public.organizations o
   where o.id = 137 and not exists (select 1 from public.organization_members m where m.organization_id = 374 and m.user_id = o.owner_user_id);
  insert into public.suppliers (organization_id, name, nit, supplier_type, tax_regime, fiscal_responsibilities)
  values (374, 'Proveedor de prueba 25-G', '900000251', 'company', 'comun', array['O-48']) returning id into v_g;
  insert into public.reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Servicios (prueba 25)', 9.66, 'Acuerdo municipal de ReteICA (prueba 25)', date '2025-01-01')
  returning id into v_ica;
  perform set_config('d25.g', v_g::text, true);
  perform set_config('d25.ica', v_ica::text, true);
  perform set_config('d25.r4', (select ot.id::text from public.organization_taxes ot join public.tax_templates tt on tt.id = ot.template_id
                                 where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d25.u', json_build_object('sub', (select owner_user_id from public.organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('d25.u2', json_build_object('sub', (select owner_user_id from public.organizations where id = 137), 'role', 'authenticated')::text, true);
  perform set_config('d25.je0', (select coalesce(max(id), 0)::text from public.journal_entries where organization_id = 374), true);
end $s25$;
-- El acumulado AIU del contrato es interno (sin EXECUTE para authenticated): la prueba lo lee como administrador.
create function pg_temp.aiu_acum(c uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$ select public.fn_aiu_contrato_acumulado(c) $$;
grant execute on function pg_temp.aiu_acum(uuid) to authenticated;

-- ── P · Período de descuento por impuesto (ronda 5, respuesta 9 y primera cita que corrige) ─────────────────────────
do $p25$
declare r jsonb;
begin
  r := public.fn_retencion_periodo_descuento('retefuente', 'hecho', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P1 renta, anulación: DUR 1.2.4.8, período del hecho y el saldo en los siguientes, sin límite', 'DUR 1.2.4.8 · 2026-10 · siguientes_sin_limite',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  r := public.fn_retencion_periodo_descuento('retefuente', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P2 renta, exceso: DUR 1.2.4.16, período del reintegro', 'DUR 1.2.4.16 · 2026-11', split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo'));
  r := public.fn_retencion_periodo_descuento('reteiva', 'hecho', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P3 reteIVA, anulación: DUR 1.3.2.3.1, el período de la anulación y el saldo en los DOS siguientes',
    'DUR 1.3.2.3.1 · 2026-10 · dos_siguientes · ["2026-11", "2026-12"]',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo') || ' · ' || (r -> 'periodos_saldo')::text);
  r := public.fn_retencion_periodo_descuento('reteiva', 'hecho', date '2026-12-05', date '2026-12-10');
  perform pg_temp.chk('P4 reteIVA anulada en diciembre: los dos períodos siguientes cruzan de año', '2026-12 · ["2027-01", "2027-02"]',
    (r ->> 'periodo') || ' · ' || (r -> 'periodos_saldo')::text);
  r := public.fn_retencion_periodo_descuento('reteiva', 'exceso', date '2026-10-20', date '2026-11-09');
  perform pg_temp.chk('P5 reteIVA en exceso: período del reintegro; el saldo queda por confirmar con el Contador', 'DUR 1.3.2.3.1 · 2026-11 · por_confirmar',
    split_part(r ->> 'regla', ':', 1) || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  r := public.fn_retencion_periodo_descuento('reteica', 'hecho', date '2026-10-20', date '2026-11-09', 'periodo_siguiente_al_reintegro');
  perform pg_temp.chk('P6 ReteICA: la regla del procedimiento municipal; el saldo en los siguientes, sin límite de períodos',
    'periodo_siguiente_al_reintegro · 2026-12 · siguientes_sin_limite', (r ->> 'regla') || ' · ' || (r ->> 'periodo') || ' · ' || (r ->> 'saldo'));
  perform pg_temp.err('P7 una clase desconocida no recibe período', 'clase_retencion_invalida',
    'select public.fn_retencion_periodo_descuento(''reteinc'', ''hecho'', current_date, current_date)');
  -- La cita retirada se arma por partes para que esta prueba no la contenga.
  perform pg_temp.chk('P8 ninguna función cargada cita el artículo que la ronda 4 usaba para las devoluciones', '0',
    (select count(*)::text from pg_proc where prosrc like '%1.2.4.' || '17%'));
end $p25$;
-- Las reglas del período son internas (sin EXECUTE para authenticated): P corre como administrador; lo demás, como el usuario.
select set_config('request.jwt.claims', current_setting('d25.u'), true);
set local role authenticated;

-- ── E · reteIVA en exceso: solicitud escrita y manifestación escrita de no imputación (dos soportes obligatorios) ──
do $e25$
declare
  g int := current_setting('d25.g')::int; r4 uuid := current_setting('d25.r4')::uuid; ica uuid := current_setting('d25.ica')::uuid;
  x uuid; res jsonb; det text;
  sop jsonb := jsonb_build_object('calculo', 'La tarifa de reteIVA aplicable era 10 % del IVA', 'certificado', 'Certificado corregido 25-1',
                                  'solicitud', 'Solicitud escrita del proveedor 25-1', 'pruebas', 'Factura y RUT del proveedor');
begin
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1190000, 'transfer', 'pago_anticipado_precio', 'p25-X1', 374, 19, r4, ica, null, 'TRF-25-X1', null, null, true);
  x := (res ->> 'anticipo_id')::uuid;
  perform set_config('d25.x1', x::text, true);
  perform pg_temp.chk('E0 anticipo con reteIVA practicada al girar (15 % del IVA de 190.000)', '28500',
    (select round(w.valor)::text from public.supplier_advance_withholdings w where w.advance_id = x and w.clase = 'reteiva'));
  begin
    perform public.fn_anticipo_retencion_exceso_reintegrar(x, 'reteiva', 190000, 10, 'transfer', 'p25-E1', sop, null, false, 'Tarifa de reteIVA equivocada', 374);
    perform pg_temp.chk('E1 reteIVA en exceso sin la manifestación escrita de no imputación: bloqueado', 'soporte_procedimiento_obligatorio · manifestacion_no_imputacion', 'sin error');
  exception when others then
    get stacked diagnostics det = pg_exception_detail;
    perform pg_temp.chk('E1 reteIVA en exceso sin la manifestación escrita de no imputación: bloqueado', 'soporte_procedimiento_obligatorio · manifestacion_no_imputacion',
      sqlerrm || ' · ' || coalesce(det, ''));
  end;
  res := public.fn_anticipo_retencion_exceso_reintegrar(x, 'reteiva', 190000, 10, 'transfer', 'p25-E2',
           sop || jsonb_build_object('manifestacion_no_imputacion', 'Manifestación escrita del proveedor: no imputó la retención en su declaración de IVA'),
           null, false, 'Tarifa de reteIVA equivocada', 374);
  perform pg_temp.chk('E2 con los dos soportes: reintegro 28.500 − 19.000 = 9.500 en el período del reintegro (DUR 1.3.2.3.1)',
    '9500.00 · ' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM') || ' · DUR 1.3.2.3.1',
    (res ->> 'reintegro') || ' · ' || (res ->> 'periodo_descuento') || ' · ' || split_part(res ->> 'regla_periodo', ':', 1));
  perform pg_temp.chk('E3 el ajuste guarda la solicitud y la manifestación como soportes', 'true',
    (select (a.soportes ? 'solicitud' and a.soportes ? 'manifestacion_no_imputacion')::text from public.supplier_advance_withholding_ajustes a
      where a.advance_id = x and a.tipo = 'retencion_excesiva'));
  perform pg_temp.err('E4 renta en exceso sin solicitud ni pruebas: bloqueado (DUR 1.2.4.16)', 'soporte_procedimiento_obligatorio',
    format('select public.fn_anticipo_retencion_exceso_reintegrar(%L, %L, 1000000, 2.5, %L, %L, %L::jsonb, null, false, %L, 374)', x, 'retefuente', 'transfer', 'p25-E4',
           '{"calculo":"Cálculo","certificado":"Certificado"}', 'Tarifa equivocada'));
end $e25$;

-- ── D · Anulación de un hecho de un período sin retenciones: el saldo de cada impuesto, con su regla ───────────────
do $d25a$
declare res jsonb;
begin
  res := public.fn_anticipo_proveedor_registrar(current_setting('d25.g')::int, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p25-X2', 374, 19,
           current_setting('d25.r4')::uuid, current_setting('d25.ica')::uuid, null, 'TRF-25-X2', null, null, true);
  perform set_config('d25.x2', res ->> 'anticipo_id', true);
end $d25a$;
reset role;
-- El anticipo era de octubre de 2025 (se simula fechándolo como administrador); la resciliación es de noviembre de 2025.
update public.supplier_advances set created_at = timestamptz '2025-10-15 10:00-05' where id = current_setting('d25.x2')::uuid;
update public.supplier_advance_withholdings set fecha = timestamptz '2025-10-15 10:00-05' where advance_id = current_setting('d25.x2')::uuid;
select set_config('request.jwt.claims', current_setting('d25.u'), true);
set local role authenticated;
do $d25b$
declare
  x2 uuid := current_setting('d25.x2')::uuid; pb uuid; res jsonb;
  sop jsonb := jsonb_build_object('calculo', 'Retenciones practicadas al girar', 'certificado', 'Certificado anulado 25-2',
                                  'ica', jsonb_build_object('solicitud', 'Radicado 25-2', 'certificado', 'Certificado ICA 25-2', 'prueba_pago', 'Comprobante 25-2',
                                                            'liquidacion_corregida', 'Liquidación 25-2'));
begin
  -- Procedimiento de ReteICA del municipio, validado por otro usuario (si la prueba 21 ya lo dejó en esta transacción, se usa ese).
  if not exists (select 1 from public.reteica_procedimientos p where p.organization_id = 374 and p.municipality_id = '6c5bba87-87af-4e41-9b2d-5381d7a3b04f'
                    and p.estado = 'validado') then
    pb := public.fn_reteica_procedimiento_registrar(374, '6c5bba87-87af-4e41-9b2d-5381d7a3b04f', 'Acuerdo municipal de ReteICA (prueba 25)',
            'Solicitud escrita del afectado ante el agente retenedor', array['prueba_pago', 'liquidacion_corregida'], 'Reintegro por transferencia al proveedor',
            'Certificado de ReteICA corregido del bimestre', 'periodo_siguiente_al_reintegro', 'Lo que no alcance se descuenta en los períodos siguientes', date '2026-01-01');
    perform set_config('request.jwt.claims', current_setting('d25.u2'), true);
    perform public.fn_tributario_regla_validar('reteica_procedimiento', pb, 'validado', 'Procedimiento del municipio revisado contra el acuerdo municipal', 'Concepto ICA-25', 374);
    perform set_config('request.jwt.claims', current_setting('d25.u'), true);
  end if;
  res := public.fn_anticipo_proveedor_devolver(x2, 111184, 'transfer', 'Se rescindió por mutuo acuerdo el contrato de octubre de 2025', 'p25-D1', 374, null, 'Consignación 25-2',
           jsonb_build_object('causa', 'operacion_anulada', 'requiere_correccion', true, 'soportes', sop,
                              'hecho', jsonb_build_object('tipo', 'resciliacion', 'documento', 'Acta de resciliación 25-2', 'fecha', date '2025-11-20')));
  perform pg_temp.chk('D1 períodos: renta e IVA en el de la resciliación; ReteICA según su procedimiento',
    'reteiva 2025-11 · reteica ' || to_char(date_trunc('month', now() at time zone 'America/Bogota') + interval '1 month', 'YYYY-MM') || ' · retefuente 2025-11',
    (select string_agg(a.clase || ' ' || a.periodo_descuento, ' · ' order by a.clase desc) from public.supplier_advance_withholding_ajustes a where a.advance_id = x2));
  perform pg_temp.chk('D2 la regla del período queda escrita con su artículo', 'retefuente:DUR 1.2.4.8 · reteiva:DUR 1.3.2.3.1',
    (select string_agg(a.clase || ':' || split_part(a.regla_periodo, ':', 1), ' · ' order by a.clase) from public.supplier_advance_withholding_ajustes a
      where a.advance_id = x2 and a.clase in ('retefuente', 'reteiva')));
  perform pg_temp.chk('D3 reteIVA: el saldo solo en los DOS períodos siguientes', 'dos_siguientes · ["2025-12", "2026-01"] · 2 · 2850',
    (select (p.detalle ->> 'saldo') || ' · ' || (p.detalle -> 'periodos_saldo')::text || ' · ' || (p.detalle ->> 'limite_periodos') || ' · ' || round((p.detalle ->> 'por_descontar')::numeric)
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'reteiva'));
  perform pg_temp.chk('D4 renta: el saldo en los períodos siguientes, sin límite', 'siguientes_sin_limite · sin límite · 4000',
    (select (p.detalle ->> 'saldo') || ' · ' || coalesce(p.detalle ->> 'limite_periodos', 'sin límite') || ' · ' || round((p.detalle ->> 'por_descontar')::numeric)
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'retefuente'));
  perform pg_temp.chk('D5 ReteICA: el excedente pendiente en los siguientes, sin límite, con la solicitud escrita guardada', 'siguientes_sin_limite · sin límite · Radicado 25-2',
    (select (p.detalle ->> 'saldo') || ' · ' || coalesce(p.detalle ->> 'limite_periodos', 'sin límite') || ' · ' || coalesce(p.detalle ->> 'soporte_solicitud', '-')
       from public.anticipo_pendientes p where p.advance_id = x2 and p.tipo = 'descuento_retencion_siguientes_periodos' and p.detalle ->> 'clase' = 'reteica'));
  perform pg_temp.chk('D6 ningún pendiente de ReteICA sin la solicitud escrita', '0',
    (select count(*)::text from public.anticipo_pendientes p where p.organization_id = 374 and p.tipo = 'descuento_retencion_siguientes_periodos'
       and p.detalle ->> 'clase' = 'reteica' and coalesce(p.detalle ->> 'soporte_solicitud', '') = '' and p.creado_en = now()));
end $d25b$;

-- ── A · Piso del 10 % del AIU (art. 462-1) por operación y acumulado del contrato (respuesta 13) ────────────────────
do $a25$
declare
  g int := current_setting('d25.g')::int; r4 uuid := current_setting('d25.r4')::uuid; ica uuid := current_setting('d25.ica')::uuid;
  ct jsonb := '{"numero":"A-25","fecha":"2026-01-05","archivo":"contratos/a-25.pdf","valor":2000000}';
  c462 jsonb := '{"aiu_discriminado":true,"requisitos_prestador":"Empresa de aseo con el AIU discriminado en el contrato"}';
  c1 uuid; e jsonb; res jsonb; a1 uuid; q text;
  ica_sop jsonb := jsonb_build_object('solicitud', 'Radicado 25-3', 'certificado', 'Certificado ICA 25-3', 'prueba_pago', 'Comprobante 25-3', 'liquidacion_corregida', 'Liquidación 25-3');
begin
  c1 := public.fn_aiu_contrato_registrar(374, g, 'servicios_462_1', 'Servicio de aseo de la sede (prueba 25)', 'aseo', ct, 'Estatuto Tributario, art. 462-1', c462,
                                         'base_especial', 'valor_total', date '2026-01-01');
  perform set_config('request.jwt.claims', current_setting('d25.u2'), true);
  perform public.fn_tributario_regla_validar('aiu_contrato', c1, 'validado', 'Servicio de aseo comprendido en el art. 462-1; AIU discriminado; prestador habilitado', 'Concepto C-25-1', 374);
  perform set_config('request.jwt.claims', current_setting('d25.u'), true);
  -- Operación 1: A + I + U = 200.000 (20 % de 1.000.000).
  res := public.fn_anticipo_proveedor_registrar(g, 585, 1038000, 'transfer', 'pago_anticipado_precio', 'p25-A1', 374, 19, r4, ica, null, 'TRF-25-A1', null,
           '[{"tratamiento":"aiu_costo_directo","base":800000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]',
           true, c1);
  a1 := (res ->> 'anticipo_id')::uuid;
  e := (select retenciones_evaluacion from public.supplier_advances where id = a1);
  perform pg_temp.chk('A1 operación 1: base del IVA = A + I + U (20 %), sin piso; acumulado previo del contrato en cero',
    '200000.00 · false · false · 0', (e -> 'aiu' ->> 'base_iva') || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · ' || (e -> 'aiu' ->> 'minimo_10_contrato_aplicado')
      || ' · ' || (e -> 'aiu' -> 'acumulado_previo' ->> 'valor'));
  -- Operación 2 (evaluada): A + I + U = 90.000 (9 %): el piso de la operación sube la base a 100.000; el acumulado ya cumple.
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1019000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":910000},{"tratamiento":"aiu_administracion","base":30000},{"tratamiento":"aiu_imprevistos","base":30000},{"tratamiento":"aiu_utilidad","base":30000}]', true, c1);
  perform pg_temp.chk('A2 operación 2: piso del 10 % de la operación (90.000 → 100.000); el acumulado (1.000.000 · 200.000) ya cumple',
    '100000.00 · true · false · 90000 · 1000000 · 200000',
    (e -> 'aiu' ->> 'base_iva') || ' · ' || (e -> 'aiu' ->> 'minimo_10_aplicado') || ' · ' || (e -> 'aiu' ->> 'minimo_10_contrato_aplicado') || ' · '
      || round((e -> 'aiu' ->> 'aiu_declarado')::numeric) || ' · ' || round((e -> 'aiu' -> 'acumulado_previo' ->> 'valor')::numeric) || ' · '
      || round((e -> 'aiu' -> 'acumulado_previo' ->> 'base_iva')::numeric));
  -- Devolver SOLO las líneas de A, I y U de la operación 1 la dejaría con base del IVA 0 sobre 800.000: se rechaza.
  q := 'select public.fn_anticipo_proveedor_devolver(%L, %s, %L, %L, %L, 374, null, %L, %L::jsonb)';
  perform pg_temp.err('A3 una devolución que rompe el piso del 10 % de la operación se rechaza', 'aiu_minimo_10_operacion',
    format(q, a1, 222368, 'transfer', 'Resolución parcial del AIU', 'p25-A3', 'Consignación 25-3',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
             'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 25-3', 'fecha', (now() at time zone 'America/Bogota')::date),
             'lineas', '[{"componente":"1","base":100000,"iva":19000},{"componente":"2","base":50000,"iva":9500},{"componente":"3","base":50000,"iva":9500}]'::jsonb,
             'soportes', jsonb_build_object('calculo', 'Líneas de AIU resueltas', 'certificado', 'Certificado corregido 25-3', 'ica', ica_sop))));
  -- Devolver la mitad del costo directo mantiene la proporción (600.000 con base 200.000): procede.
  res := public.fn_anticipo_proveedor_devolver(a1, 396136, 'transfer', 'Resolución parcial del costo directo', 'p25-A4', 374, null, 'Consignación 25-4',
           jsonb_build_object('causa', 'resolucion_parcial', 'requiere_correccion', false,
             'hecho', jsonb_build_object('tipo', 'resolucion_mutuo_acuerdo', 'documento', 'Resolución parcial 25-4', 'fecha', (now() at time zone 'America/Bogota')::date),
             'lineas', '[{"componente":"0","base":400000,"iva":0}]'::jsonb,
             'soportes', jsonb_build_object('calculo', 'Mitad del costo directo resuelta', 'certificado', 'Certificado corregido 25-4', 'ica', ica_sop)));
  perform pg_temp.chk('A4 devolución del costo directo que mantiene el piso (por operación y acumulado): procede; acumulado 600.000 · 200.000',
    '3864.00 · 600000 · 200000', (res ->> 'retencion_revertida') || ' · ' || round((pg_temp.aiu_acum(c1) ->> 'valor')::numeric) || ' · '
      || round((pg_temp.aiu_acum(c1) ->> 'base_iva')::numeric));
  -- Una operación que lleva el acumulado por encima del valor del contrato (600.000 + 1.500.000 > 2.000.000) queda pendiente.
  e := public.fn_anticipo_proveedor_evaluar_retenciones(374, g, 'pago_anticipado_precio', 1538000, 19, r4, ica,
         '[{"tratamiento":"aiu_costo_directo","base":1300000},{"tratamiento":"aiu_administracion","base":100000},{"tratamiento":"aiu_imprevistos","base":50000},{"tratamiento":"aiu_utilidad","base":50000}]', true, c1);
  perform pg_temp.chk('A5 operación que supera el valor del contrato: las retenciones quedan pendientes (no se presume)', 'true · aiu_excede_valor_contrato',
    (e ->> 'pendiente') || ' · ' || (e -> 'clases' -> 0 ->> 'motivo'));
end $a25$;
reset role;
do $z25$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 25: todos cuadran; ninguno en 1330', 'true · 0',
    (select bool_and(t.d = t.c)::text || ' · ' || sum(t.en_1330)::text from public.journal_entries je
       join (select journal_entry_id, sum(debit) d, sum(credit) c, count(*) filter (where account_code = '1330') en_1330 from public.journal_lines group by 1) t
         on t.journal_entry_id = je.id
      where je.organization_id = 374 and je.id > current_setting('d25.je0')::int));
end $z25$;

-- ════ CUERPO: 15.sql ════
select set_config('dry.prueba', '15', true);
reset role;
-- ── Datos de apoyo (administrador; se revierten) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $f$
declare s1 int; s138 int; p1 int; p2 int; p3 int; p4 int; p5 int; c137 uuid; c138 uuid; cag uuid; vag uuid; a1 uuid; a2 uuid; a3 uuid;
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
  end if;
  -- Consignante con RUT: gran contribuyente (agente de retención) y responsable de IVA. El vinculado, sin datos fiscales.
  insert into suppliers (organization_id, name, supplier_type, fiscal_responsibilities) values (374, 'Consignante prueba seco', 'company', array['O-13', 'O-48']) returning id into s1;
  insert into suppliers (organization_id, name, supplier_type) values (374, 'Organización vinculada prueba seco', 'company') returning id into s138;
  insert into products (organization_id, sku, name) values (374, 'SECO-P1', 'Prueba seco 1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'SECO-P2', 'Prueba seco 2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'SECO-P3', 'Prueba seco propio') returning id into p3;
  insert into products (organization_id, sku, name) values (374, 'SECO-P5', 'Prueba seco vinculado') returning id into p5;
  insert into customers (organization_id, first_name, last_name) values (374, 'Cliente', 'Seco') returning id into c137;
  -- Comprador agente de retención (gran contribuyente) y su venta del POS, en borrador (no genera asientos propios).
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', 'Agente', array['O-13']) returning id into cag;
  insert into sales (organization_id, branch_id, user_id, status, customer_id)
  values (374, 585, (select owner_user_id from organizations where id = 374), 'draft', cag) returning id into vag;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 100000, 100000, 'COP', '13300501') returning id into a1;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s138, 50000, 50000, 'COP', '13300501') returning id into a2;
  insert into supplier_advances (organization_id, branch_id, supplier_id, amount, balance, currency, account_code) values (374, 585, s1, 1000000, 1000000, 'COP', '13300501') returning id into a3;
  perform fn_inv_int_mover(374, 585, p3, null, 'in', 5, 20000, 'initial', 'seco', 'seco', null, '{}'::jsonb);
  perform set_config('dry.u374', json_build_object('sub', (select owner_user_id from organizations where id = 374), 'role', 'authenticated')::text, true);
  perform set_config('dry.s1', s1::text, true); perform set_config('dry.s138', s138::text, true);
  perform set_config('dry.p1', p1::text, true); perform set_config('dry.p2', p2::text, true); perform set_config('dry.p3', p3::text, true);
  perform set_config('dry.p5', p5::text, true);
  perform set_config('dry.c137', c137::text, true); perform set_config('dry.vag', vag::text, true);
  perform set_config('dry.a1', a1::text, true); perform set_config('dry.a2', a2::text, true); perform set_config('dry.a3', a3::text, true);
  -- Reglas configuradas de la organización (las mismas de compras): retención por comisiones y de IVA.
  perform set_config('dry.rcom', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id
                                    where ot.organization_id = 374 and tt.code = 'RETE_11_COMISION'), true);
  perform set_config('dry.riva', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id
                                    where ot.organization_id = 374 and tt.code = 'RETEIVA_15'), true);
end $f$;

-- ── Organización 374: recibida (mandato) y entregada, como su dueño ──────────
select set_config('request.jwt.claims', current_setting('dry.u374'), true);
set local role authenticated;
do $t$
declare
  o int := 374; b int := 585;
  s1 int := current_setting('dry.s1')::int; p1 int := current_setting('dry.p1')::int; p2 int := current_setting('dry.p2')::int;
  p3 int := current_setting('dry.p3')::int; c137 uuid := current_setting('dry.c137')::uuid; vag text := current_setting('dry.vag');
  a1 uuid := current_setting('dry.a1')::uuid; a2 uuid := current_setting('dry.a2')::uuid; a3 uuid := current_setting('dry.a3')::uuid;
  rcom text := current_setting('dry.rcom'); riva text := current_setting('dry.riva');
  t jsonb; t2 jsonb; te jsonb; lin jsonb; r jsonb; n1 uuid; n2 uuid; l1 uuid; liq1 uuid; liq2 uuid; liq4 uuid; ne uuid; w uuid;
  q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',true,
    'obligacion_dueno','venta','compensacion_remuneracion',true,'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    -- Ronda 5 (C.Co. art. 1277): orden de aplicación y liquidación por escrito, términos obligatorios del contrato recibido.
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000));

  -- Ronda 2, punto 1: contrapartida del grupo 94 DEFINIDA
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
  perform pg_temp.chk('R2 liq1: lo que no es «no aplica», por ámbito', 'operacion.retefuente.agente=pendiente, operacion.reteica.por_acreditar=pendiente, '
    || 'remuneracion.retefuente.dueno=estimada:2970.00, remuneracion.reteica.dueno=pendiente, remuneracion.reteiva.dueno=pendiente', pg_temp.ret(liq1));
  perform pg_temp.chk('R3 operación: el comprador agente sin regla elegida queda pendiente (nunca 0)', 'pendiente/sin_regla_configurada/60000.00/null',
    (select status || '/' || reason || '/' || base::text || '/' || coalesce(amount::text, 'null') from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente'));
  perform pg_temp.chk('R4 operación: la venta a consumidor final no aplica', 'no_aplica/venta_a_consumidor_final/120000.00',
    (select status || '/' || reason || '/' || base::text from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'consumidor_final'));
  perform pg_temp.chk('R5 remuneración: 11 % de la regla configurada sobre 27.000, con la calidad del intermediario', 'estimada/11.0000/27000.00/2970.00',
    (select status || '/' || rate::text || '/' || base::text || '/' || amount::text from consignment_settlement_withholdings
      where settlement_id = liq1 and scope = 'remuneracion' and class = 'retefuente'));
  perform pg_temp.chk('R6 remuneración: el IVA de la comisión se determina aparte', 'pendiente/iva_de_la_remuneracion_por_determinar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = liq1 and scope = 'remuneracion' and class = 'reteiva'));
  select id into w from consignment_settlement_withholdings where settlement_id = liq1 and scope = 'remuneracion' and class = 'retefuente';
  perform pg_temp.err('R7a conciliar sin soporte', 'soporte_obligatorio', format('select fn_consignacion_conciliar_retencion(%L,2970,%L,%s)', w, 'x', o));
  -- Ronda 4: el certificado solo concilia; la retención que ya ocurrió se reconoce primero, con su asiento.
  perform pg_temp.err('R7b conciliar una estimada con valor (sin reconocer el hecho)', 'retencion_no_reconocida',
    format('select fn_consignacion_conciliar_retencion(%L,2970,%L,%s)', w, 'Certificado de retención del dueño n.º 15', o));
  r := fn_consignacion_retencion_practicada(w, 2970, 27000, current_date, 'Comprobante de pago del dueño n.º 15 con la retención', o);
  perform pg_temp.chk('R7c practicada: D retención sufrida / C 281510 del dueño (la comisión ya se compensó)', '2970.00/0.00/2970.00',
    (r->>'valor') || '/' || (r->>'por_cobrar_dueno') || '/' || (r->>'contra_281510'));
  r := fn_consignacion_conciliar_retencion(w, 2970, 'Certificado de retención del dueño n.º 15', o);
  perform pg_temp.chk('R7d conciliada con el certificado, sin diferencia', '2970.00/0.00', (r->>'valor') || '/' || (r->>'diferencia'));

  -- Devolución de lo ya liquidado → derecho frente al dueño; nueva venta
  perform pg_temp.mover(o, b, p1, 'in', 1, 'return');
  perform pg_temp.mover(o, b, p1, 'out', 2, 'sale');
  perform pg_temp.err('T9a descontar derechos sin acuerdo', 'acuerdo_obligatorio', format('select fn_consignacion_recibida_liquidar(%L,null,true,null,%L,%s)', n1, 'k-liq2x', o));
  r := fn_consignacion_recibida_liquidar(n1, null, true, 'Acuerdo escrito con el dueño', 'k-liq2', o); liq2 := r->>'liquidacion_id';
  perform pg_temp.chk('T9b liq2 con acuerdo: venta / dueño / derechos', '60000.00/51000.00/60000.00', (r->>'venta') || '/' || (r->>'dueno') || '/' || (r->>'derechos_descontados'));
  perform pg_temp.err('T9c anular liq1 (no es la última; orden seq)', 'liquidacion_no_es_la_ultima', format('select fn_consignacion_recibida_anular_liquidacion(%L,%L,%s)', liq1, 'Prueba de anulación', o));
  r := fn_consignacion_recibida_anular_liquidacion(liq2, 'Se pactó no descontar', o);
  perform pg_temp.chk('T9d anular liq2 (la última; la liquidación no tiene asiento de remuneración)', 'anulada/null', (r->>'estado') || '/' || coalesce(r->>'asiento_id', 'null'));
  perform pg_temp.chk('T9d2 anular no cierra los pendientes tributarios de esas ventas (ronda 4)', 'true', ((r->>'pendientes_vigentes')::int > 0)::text);
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
  te := t - 'valoracion' - 'cuenta_recaudo' - 'orden_aplicacion' - 'liquidacion_escrita';
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
  perform pg_temp.chk('Z1 asientos de consignación (18 de la corrida anterior sin los 4 de la parte entre organizaciones + 1 retención practicada)', '19', (select count(*)::text from journal_entries e where e.created_at = now() and e.source like 'consign%'));
  perform pg_temp.chk('Z1b ninguna liquidación registra la remuneración', '0', (select count(*)::text from journal_entries e where e.created_at = now() and e.source = 'consignment_owner_settlement'));
  perform pg_temp.chk('Z2 asientos descuadrados (todos los de la transacción)', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z3 asientos de las entregadas', '0', (select count(*)::text from journal_entries e where e.created_at = now()
     and e.source_id in (current_setting('dry.ne'))));
  perform pg_temp.chk('Z4 líneas en 1465', '0', (select count(*)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.created_at = now() and l.account_code like '1465%'));
  perform pg_temp.chk('Z5 kardex de la entregada propia', 'transfer_out out 2.000', (select string_agg(source || ' ' || direction || ' ' || qty::text, ', ') from stock_movements where source_id = 'consignacion:' || current_setting('dry.ne')));
  perform pg_temp.chk('Z6 obligación con el dueño en 28151001 tras el cruce (298.000 + 2.970 de la retención sufrida sobre la comisión ya compensada)', '300970.00', (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.organization_id = 374 and l.account_code = '28151001'));
  perform pg_temp.chk('Z7 saldo y estado del anticipo cruzado', '50000.00 active', (select balance::text || ' ' || status from supplier_advances where id = current_setting('dry.a1')::uuid));
  perform pg_temp.chk('Z8 ninguna retención pendiente o «no aplica» trae valor (nunca 0 presumido)', '0', (select count(*)::text from consignment_settlement_withholdings where status not in ('estimada', 'practicada') and amount is not null));
  perform pg_temp.chk('Z9 pendientes de las liquidaciones anuladas: cerrados SOLO porque otra liquidación cubrió sus ventas (reliquidada)', '0', (select count(*)::text from journal_entry_failures f
     where f.created_at = now() and f.resolved_at is null and f.source = 'consignment_owner_settlement'
       and split_part(f.source_id, ':', 1) in (select s.id::text from consignment_settlements s where s.status = 'anulada')));
  select string_agg(reason || '×' || n, ', ') into v from (select reason, count(*) n from journal_entry_failures where created_at = now() and organization_id = 374 and reason like 'consignacion%' and resolved_at is null group by reason order by reason) s;
  perform pg_temp.log('PENDIENTES ABIERTOS: ' || coalesce(v, '-'));
  perform pg_temp.chk('Z10 pendientes abiertos por tipo', 'consignacion_derecho_frente_al_dueno×1, consignacion_devolucion_pos×1, consignacion_factura_remuneracion×2, '
    || 'consignacion_novedad×1, consignacion_retencion_pendiente×8, consignacion_retencion_por_conciliar×2', v);
end $z$;

-- ════ CUERPO: 22.sql ════
-- ════ 22 · Consignación, ronda 4: retención practicada sin esperar el certificado; asiento al reconocerla y al conciliar;
--      anular no cierra pendientes vigentes; calidades acreditadas con los criterios de anticipos; comisión contra la
--      281510 solo compensable (si no, derecho por cobrar) ════
select set_config('dry.prueba', '22', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s22$
declare
  m1 int; m2 int; b1 uuid; b2 uuid; b3 uuid; p1 int; p2 int; p3 int; ica uuid; sa uuid; sc uuid; sn2 uuid; inv1 uuid; inv2 uuid; inv3 uuid;
  v_pg3 uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
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
   ('130505', 'Clientes nacionales', 'asset', 'no_aplica', '1305', false),
   ('13050501', 'Clientes nacionales (prueba)', 'asset', 'no_aplica', '130505', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  -- El intermediario (374): ordinario, responsable de IVA, no agente de retención, sin autorretención ni SIMPLE.
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion) values (374, '2026-01-01', 'ordinario', array['O-48'], false);
  end if;
  -- La sucursal vende en Bogotá (territorialidad del reteICA de la operación y de la remuneración).
  update branches set municipality_id = '47ae0b2d-e894-453e-9680-f519c1e3f118' where id = 585;
  insert into reteica_reglas (organization_id, municipality_id, actividad, tarifa_por_mil, norma, vigente_desde)
  values (374, '47ae0b2d-e894-453e-9680-f519c1e3f118', 'Comercio por cuenta de terceros (prueba 22)', 4.14, 'Acuerdo municipal de ReteICA (prueba 22)', '2026-01-01') returning id into ica;
  -- Mandantes: M1 gran contribuyente y responsable de IVA; M2 con O-15 en el RUT (autorretenedor SIN verificar).
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 22-1', '900000221', 'company', array['O-13', 'O-48']) returning id into m1;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 22-2', '900000222', 'company', array['O-15', 'O-48']) returning id into m2;
  -- Compradores: B1 agente según el RUT (O-13); B2 con datos pero sin calidad de agente; B3 agente de reteIVA ACREDITADO (art. 437-2).
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Uno', array['O-13']) returning id into b1;
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Dos', array['R-99-PN']) returning id into b2;
  insert into customers (organization_id, first_name, last_name, fiscal_responsibilities) values (374, 'Comprador', '22 Tres', array['O-48']) returning id into b3;
  insert into products (organization_id, sku, name) values (374, 'P22-1', 'Consignado 22-1') returning id into p1;
  insert into products (organization_id, sku, name) values (374, 'P22-2', 'Consignado 22-2') returning id into p2;
  insert into products (organization_id, sku, name) values (374, 'P22-3', 'Consignado 22-3') returning id into p3;
  -- Ventas del POS en borrador (solo para saber el comprador) y facturas en borrador con su línea.
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b1) returning id into sa;
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b2) returning id into sc;
  insert into sales (organization_id, branch_id, user_id, status, customer_id) values (374, 585, u, 'draft', b1) returning id into sn2;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv2;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b3) returning id into inv3;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (inv1, 'sale', inv1, 'Consignado 22-3', 1, 80000, 0, 80000, p3),
    (inv2, 'sale', inv2, 'Consignado 22-3', 1, 80000, 0, 80000, p3),
    (inv3, 'sale', inv3, 'Consignado 22-1', 1, 60000, 19, 71400, p1);
  -- Causación de las facturas por cuenta del dueño (se emula: la emisión real exige facturación electrónica): D cartera / C 281510.
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 22-1',
    p_source := 'invoice_sales', p_source_id := inv1::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 80000,
    p_created_by := u, p_fact_key := 'prueba22:inv1');
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 22-3',
    p_source := 'invoice_sales', p_source_id := inv3::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 60000,
    p_created_by := u, p_fact_key := 'prueba22:inv3');
  perform set_config('d22.m1', m1::text, true); perform set_config('d22.m2', m2::text, true);
  perform set_config('d22.b1', b1::text, true); perform set_config('d22.b2', b2::text, true); perform set_config('d22.b3', b3::text, true);
  perform set_config('d22.p1', p1::text, true); perform set_config('d22.p2', p2::text, true); perform set_config('d22.p3', p3::text, true);
  perform set_config('d22.sa', sa::text, true); perform set_config('d22.sc', sc::text, true); perform set_config('d22.sn2', sn2::text, true);
  perform set_config('d22.inv1', inv1::text, true); perform set_config('d22.inv2', inv2::text, true); perform set_config('d22.inv3', inv3::text, true);
  -- Ronda 5: el cobro de la factura 22-3 (el comprador paga 71.400 − reteIVA 1.710 = 69.690); la retención se registra con él.
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv3::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg3;
  perform set_config('d22.pg3', v_pg3::text, true);
  perform set_config('d22.ica', ica::text, true);
  perform set_config('d22.rete4', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETE_4'), true);
  perform set_config('d22.rcom', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETE_11_COMISION'), true);
  perform set_config('d22.riva', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'RETEIVA_15'), true);
  perform set_config('d22.icaot', (select ot.id::text from organization_taxes ot join tax_templates tt on tt.id = ot.template_id where ot.organization_id = 374 and tt.code = 'ICA_0.966'), true);
  perform set_config('d22.u', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('d22.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s22$;
-- Lo que el dueño debe por la comisión de una nota (función interna; la prueba la lee como administrador).
create function pg_temp.cxc(n uuid) returns numeric language sql security definer set search_path = public, pg_temp as $$ select public.fn_consignacion_cxc_dueno_saldo(n) $$;
grant execute on function pg_temp.cxc(uuid) to authenticated;
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;

do $k22$
declare
  o int := 374; b int := 585; m1 int := current_setting('d22.m1')::int; m2 int := current_setting('d22.m2')::int;
  p1 int := current_setting('d22.p1')::int; p2 int := current_setting('d22.p2')::int; p3 int := current_setting('d22.p3')::int;
  t jsonb; r jsonb; n1 uuid; n2 uuid; n3 uuid; q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,%s,%L::jsonb,%L,%s)';
begin
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',false,
    'obligacion_dueno','venta','compensacion_remuneracion',true,
    'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    -- Ronda 5 (C.Co. art. 1277): orden de aplicación y liquidación por escrito, términos obligatorios del contrato recibido.
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  -- K · Cuentas y reglas (ronda 4)
  perform fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201');
  perform pg_temp.err('K1 recibir sin cuenta por cobrar al dueño', 'sin_cuenta_cobro_remuneracion',
    format(q, m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t, 'k22-k1', o));
  perform pg_temp.err('K2 cuenta por cobrar de título', 'cuenta_cobro_remuneracion_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L,%L)', o, '911520', '9405', '41351201', '1380'));
  perform pg_temp.err('K3 retención sufrida fuera de 1355', 'cuenta_retencion_sufrida_invalida', format('select fn_consignacion_configurar_cuentas(%s,%L,%L,%L,%L,%L::jsonb)', o, '911520', '9405', '41351201', '13809501', '{"retefuente":"23652501"}'));
  r := fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501', '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  perform pg_temp.chk('K4 cuentas de la ronda 4', '13809501/13551501/13551701/13551801',
    (r->>'cobro_remuneracion') || '/' || (r->'retenciones_sufridas'->>'retefuente') || '/' || (r->'retenciones_sufridas'->>'reteiva') || '/' || (r->'retenciones_sufridas'->>'reteica'));
  perform pg_temp.err('K5 reteICA con un impuesto de compras en vez de la regla municipal', 'regla_retencion_invalida', format('select fn_consignacion_configurar_retenciones(%s,%L::jsonb)', o,
    jsonb_build_object('operacion', jsonb_build_object('reteica', current_setting('d22.icaot')), 'remuneracion', '{}'::jsonb)));
  r := fn_consignacion_configurar_retenciones(o, jsonb_build_object(
         'operacion', jsonb_build_object('retefuente', current_setting('d22.rete4'), 'reteiva', current_setting('d22.riva'), 'reteica', current_setting('d22.ica')),
         'remuneracion', jsonb_build_object('retefuente', current_setting('d22.rcom'), 'reteica', current_setting('d22.ica'))));
  perform pg_temp.chk('K6 reteICA de la operación: la regla municipal (la misma de anticipos)', current_setting('d22.ica'), r->'operacion'->>'reteica');
  perform pg_temp.err('K7 recibida en mandato sin pactar la compensación', 'terminos_invalidos',
    format(q, m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t - 'compensacion_remuneracion', 'k22-k7', o));
  r := fn_consignacion_recibir(m1, b, jsonb_build_array(jsonb_build_object('product_id',p1,'qty',10,'precio',60000,'costo_acreditado',40000)), 15, t, 'k22-n1', o, null);
  n1 := r->>'nota_id';
  r := fn_consignacion_recibir(m2, b, jsonb_build_array(jsonb_build_object('product_id',p2,'qty',5,'precio',50000,'costo_acreditado',30000)), 15,
         t || '{"compensacion_remuneracion":false,"cuenta_recaudo":"28151002"}', 'k22-n2', o, null);
  n2 := r->>'nota_id';
  r := fn_consignacion_recibir(m1, b, jsonb_build_array(jsonb_build_object('product_id',p3,'qty',5,'precio',80000,'costo_acreditado',50000)), 10,
         t || '{"obligacion_dueno":"cobro"}', 'k22-n3', o, null);
  n3 := r->>'nota_id';
  perform set_config('d22.n1', n1::text, true); perform set_config('d22.n2', n2::text, true); perform set_config('d22.n3', n3::text, true);
  perform pg_temp.chk('K8 notas con la compensación pactada (o no) y la cuenta por cobrar', 'true/13809501 · false/13809501 · true/13809501',
    (select string_agg(commission_offset_agreed::text || '/' || owner_receivable_account_code, ' · ' order by number) from consignment_notes where id in (n1, n2, n3)));
end $k22$;

-- ── Punto 5: la comisión contra la 281510 solo con obligación real y compensación pactada; si no, derecho por cobrar ─
do $c22$
declare
  o int := 374; b int := 585; p1 int := current_setting('d22.p1')::int; p2 int := current_setting('d22.p2')::int; p3 int := current_setting('d22.p3')::int;
  n1 uuid := current_setting('d22.n1')::uuid; n2 uuid := current_setting('d22.n2')::uuid; n3 uuid := current_setting('d22.n3')::uuid;
  r jsonb;
begin
  -- N1 (compensación pactada, obligación al vender): 4 ventas de 60.000 (B1, consumidor final, B2 y factura con IVA a B3).
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale', current_setting('d22.sa'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale');
  perform pg_temp.mover(o, b, p1, 'out', 1, 'sale', current_setting('d22.sc'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'invoice_sale', current_setting('d22.inv3'));
  perform pg_temp.chk('C1 N1: remuneración de 9.000 por venta contra la 281510 (compensación pactada y obligación nacida); nada por cobrar', '36000.00/0.00',
    (select sum(remuneration_amount)::text || '/' || sum(remuneration_receivable)::text from consignment_allocations where note_id = n1 and remuneration_recognized));
  -- N2 (compensación NO pactada): la comisión es un derecho por cobrar al dueño.
  perform pg_temp.mover(o, b, p2, 'out', 1, 'sale');
  perform pg_temp.chk('C2 N2 sin compensación pactada: D 13809501 / C 41351201 por 7.500 (no se debita la 281510)', '13809501 D 7500 · 41351201 C 7500',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.source = 'consignment_sale' and e.fact_key like 'consignment_sale_rem:%:cxc'
        and e.source_id in (select a.id::text from consignment_allocations a where a.note_id = n2)));
  perform pg_temp.err('C3 compensar en una nota sin compensación pactada', 'compensacion_no_pactada', format('select fn_consignacion_compensar_remuneracion(%L,7500,%L,%s)', n2, 'k22-c3', o));
  perform pg_temp.mover(o, b, p2, 'in', 1, 'return');
  perform pg_temp.chk('C4 devolución: la remuneración por cobrar se reversa contra la cuenta por cobrar (no contra la 281510)', '0.00',
    pg_temp.cxc(n2)::text);
  perform pg_temp.mover(o, b, p2, 'out', 1, 'sale', current_setting('d22.sn2'));
  -- N3 (compensación pactada, obligación AL COBRO): una factura anulada y otra sin cobrar.
  perform pg_temp.mover(o, b, p3, 'out', 1, 'invoice_sale', current_setting('d22.inv2'));
  perform pg_temp.chk('C5 factura sin cobrar con obligación al cobro: la comisión no es compensable todavía (por cobrar 8.000) y queda el pendiente de la venta', '8000.00/1',
    pg_temp.cxc(n3)::text || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
      and f.resolved_at is null and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3)));
  perform pg_temp.mover(o, b, p3, 'in', 1, 'invoice_void', current_setting('d22.inv2'));
  perform pg_temp.chk('C6 se anula la factura (el HECHO): su pendiente de venta se cierra y la remuneración por cobrar se reversa', '0.00/0/venta_revertida',
    pg_temp.cxc(n3)::text || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
      and f.resolved_at is null and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3))
    || '/' || (select max(f.resolution) from journal_entry_failures f where f.reason = 'consignacion_obligacion_al_cobro'
                and f.source_id in (select a.id::text from consignment_allocations a where a.note_id = n3)));
  perform pg_temp.mover(o, b, p3, 'out', 1, 'invoice_sale', current_setting('d22.inv1'));
  perform pg_temp.err('C7 compensar más que lo que el dueño debe por la comisión', 'excede_remuneracion_por_cobrar', format('select fn_consignacion_compensar_remuneracion(%L,9000,%L,%s)', n3, 'k22-c7', o));
  r := fn_consignacion_compensar_remuneracion(n3, 8000, 'k22-c8', o);
  perform pg_temp.chk('C8 compensación posterior, pactada, contra la obligación EXIGIBLE del mismo dueño (ventas ya nacidas): D 28151001 / C 13809501', '8000.00/0.00/13809501',
    (r->>'monto') || '/' || (r->>'por_cobrar_restante') || '/' ||
    (select l.account_code from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int and l.credit > 0));
  perform pg_temp.err('C9 lo facturado «al cobro» y no cobrado no se liquida al dueño', 'sin_ventas_por_liquidar',
    format('select fn_consignacion_recibida_liquidar(%L,null,false,null,%L,%s)', n3, 'k22-c9', o));
end $c22$;
-- ── Puntos 1, 2 y 7: retención practicada vs estimada; asientos; calidades acreditadas ──────────────────────────────
do $r22$
declare
  o int := 374; n1 uuid := current_setting('d22.n1')::uuid; n2 uuid := current_setting('d22.n2')::uuid; n3 uuid := current_setting('d22.n3')::uuid;
  r jsonb; l1 uuid; l1b uuid; l2 uuid; w uuid; wop uuid; abiertos int;
begin
  perform pg_temp.err('Q1 agente de reteIVA sin su fundamento (art. 437-2)', 'fundamento_agente_reteiva_obligatorio',
    format('select fn_cliente_calidad_tributaria_guardar(%s,%L,%L,%L,%L::text[],%L::date)', o, current_setting('d22.b3'), 'agente_retencion_iva', 'Resolución de designación', '{}', '2026-01-01'));
  perform fn_cliente_calidad_tributaria_guardar(o, current_setting('d22.b3')::uuid, 'agente_retencion_iva', 'Certificación de entidad pública', '{}', '2026-01-01', null,
                                                null, null, null, null, 'Art. 437-2 num. 1 E.T.: entidad estatal');
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k22-l1', o); l1 := r->>'liquidacion_id';
  perform set_config('d22.l1', l1::text, true);
  perform pg_temp.chk('Q2 L1 (operación, por comprador): B1 agente según su RUT; B2 y B3 sin calidad de agente de renta acreditada; B3 agente de reteIVA ACREDITADO (no es 09 ni 13)',
    'operacion.retefuente.agente=estimada:2400.00, operacion.retefuente.por_acreditar=pendiente, operacion.reteica.por_acreditar=pendiente, operacion.reteiva.agente=estimada:1710.00, '
    || 'remuneracion.retefuente.dueno=estimada:3960.00, remuneracion.reteica.dueno=pendiente, remuneracion.reteiva.dueno=pendiente', pg_temp.ret(l1));
  select id into w from consignment_settlement_withholdings where settlement_id = l1 and scope = 'remuneracion' and class = 'retefuente';
  select id into wop from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente';
  perform pg_temp.chk('Q3 lo estimado no se asienta', '0', (select count(*)::text from journal_entries e where e.source = 'consignment_withholding' and e.source_id in (w::text, wop::text)));
  perform pg_temp.err('R1 el certificado no crea el hecho: conciliar una estimada con valor', 'retencion_no_reconocida',
    format('select fn_consignacion_conciliar_retencion(%L,3960,%L,%s)', w, 'Certificado del mandante 22-1', o));
  perform pg_temp.err('R2 la retención de la operación se practica al pagar una factura de la liquidación', 'factura_de_la_liquidacion_obligatoria',
    format('select fn_consignacion_retencion_practicada(%L,2400,60000,current_date,%L,%s)', wop, 'Comprobante del pago del comprador', o));
  r := fn_consignacion_retencion_practicada(w, 3960, 36000, current_date, 'Comprobante de pago del mandante 22-1 con la retención en la fuente', o);
  perform pg_temp.chk('R3 practicada sobre la comisión (ya compensada): D 13551501 / C 28151001; sin esperar el certificado',
    '13551501 D 3960 · 28151001 C 3960 · por cobrar true',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int) || ' · por cobrar ' || ((r->>'por_cobrar_dueno')::numeric = 0)::text);
  perform pg_temp.chk('R4 queda por conciliar con el certificado', '1', (select count(*)::text from journal_entry_failures f
     where f.reason = 'consignacion_retencion_certificado_pendiente' and f.source_id = 'cert:' || w::text and f.resolved_at is null));
  -- Punto 3: anular la liquidación (el DOCUMENTO) no cierra los pendientes de las ventas ni de la comisión.
  select count(*) into abiertos from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
     and (f.source_id = l1::text or f.source_id like l1::text || ':%');
  r := fn_consignacion_recibida_anular_liquidacion(l1, 'Se rehace la liquidación', o);
  perform pg_temp.chk('A1 anular L1: siguen abiertos todos sus pendientes; la retención practicada y su asiento se conservan',
    abiertos::text || '/practicada/1', (r->>'pendientes_vigentes') || '/' || (select status from consignment_settlement_withholdings where id = w)
      || '/' || (select count(*)::text from journal_entries e where e.source = 'consignment_withholding' and e.source_id = w::text));
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k22-l1b', o); l1b := r->>'liquidacion_id';
  perform pg_temp.chk('A2 la nueva liquidación lleva la retención practicada (no la vuelve a estimar)', '1/practicada/' || l1::text,
    (select count(*)::text from consignment_settlement_withholdings where settlement_id = l1b and scope = 'remuneracion' and class = 'retefuente')
    || '/' || (select status || '/' || carried_from::text from consignment_settlement_withholdings where id = w and settlement_id = l1b));
  perform pg_temp.chk('A3 los pendientes de L1 se cierran al quedar sus ventas cubiertas por L1b', '0/' || abiertos::text,
    (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
       and (f.source_id = l1::text or f.source_id like l1::text || ':%')) || '/'
    || (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolution = 'reliquidada:' || l1b::text));
  r := fn_consignacion_conciliar_retencion(w, 3960, 'Certificado anual del mandante 22-1', o);
  perform pg_temp.chk('R5 conciliar la practicada con el certificado: sin diferencia y cierra el pendiente', '0.00/0',
    (r->>'diferencia') || '/' || (select count(*)::text from journal_entry_failures f where f.source_id = 'cert:' || w::text and f.resolved_at is null));
  -- Punto 7: el O-15 sin resolución verificada no excluye; con la resolución y el concepto cubierto, sí.
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k22-l2', o); l2 := r->>'liquidacion_id';
  perform pg_temp.chk('Q4 mandante con O-15 sin verificar: la retención de la operación queda pendiente (no se excluye)', 'pendiente/autorretencion_sin_verificar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = l2 and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente'));
  perform pg_temp.chk('Q5 el dueño sin calidad de agente de renta acreditada (sin 07 ni 13): la de la remuneración queda por acreditar', 'pendiente/calidad_agente_retencion_por_acreditar',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = l2 and scope = 'remuneracion' and class = 'retefuente'));
  perform fn_proveedor_calidad_tributaria_guardar(o, current_setting('d22.m2')::int, 'autorretenedor_renta', 'Resolución DIAN verificada', array['RETE_4'], '2026-01-01', null,
                                                  '2026-01-15', 'rut-mandante-22-2.pdf', '000123', '2025-12-01', 'Autorretención en la fuente por compras y servicios');
  perform fn_consignacion_recibida_anular_liquidacion(l2, 'Se verificó la autorretención', o);
  r := fn_consignacion_recibida_liquidar(n2, null, false, null, 'k22-l2b', o);
  perform pg_temp.chk('Q6 verificada la resolución y su alcance (concepto RETE_4): no aplica', 'no_aplica/autorretenedor_autorizado_concepto',
    (select status || '/' || reason from consignment_settlement_withholdings where settlement_id = (r->>'liquidacion_id')::uuid and scope = 'operacion'
       and class = 'retefuente' and payer_group = 'agente'));
  -- Puntos 1 y 2 en la operación: el comprador B3 (agente de reteIVA acreditado) retiene el IVA al pagar la factura 22-3.
  select id into wop from consignment_settlement_withholdings where settlement_id = l1b and scope = 'operacion' and class = 'reteiva' and payer_group = 'agente'
     and status = 'estimada';
  r := fn_consignacion_retencion_practicada(wop, 1710, 11400, current_date, 'Comprobante del pago de la factura 22-3 con reteIVA', o, current_setting('d22.inv3')::uuid,
                                            current_setting('d22.pg3')::uuid);
  perform pg_temp.chk('R6 retención del comprador sobre la venta por cuenta del dueño: D 28151001 / C cartera de la factura; la 1355 del intermediario no se toca',
    '28151001 D 1710 · 13050501 C 1710 · pendiente de cartera 1',
    (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r->>'asiento_id')::int)
    || ' · pendiente de cartera ' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = wop::text));
  perform pg_temp.err('R7 la misma retención con otro valor', 'retencion_ya_practicada',
    format('select fn_consignacion_retencion_practicada(%L,1500,11400,current_date,%L,%s,%L)', wop, 'Otro comprobante', o, current_setting('d22.inv3')));
  r := fn_consignacion_conciliar_retencion(wop, 1500, 'Certificado del comprador 22-3', o);
  perform pg_temp.chk('R8 el certificado difiere de lo practicado: queda la diferencia como pendiente (no se ajusta solo)', '-210.00/1',
    (r->>'diferencia') || '/' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_retencion_diferencia_certificado' and f.source_id = 'dif:' || wop::text));
end $r22$;

reset role;
do $z22$
begin
  perform pg_temp.chk('Z0 obligación exigible = libros − lo facturado «al cobro» sin cobrar (80.000)', '80000.00',
    ((select sum(l.credit - l.debit) from journal_lines l join journal_entries e on e.id = l.journal_entry_id
       where e.organization_id = 374 and l.account_code = '28151001') - fn_consignacion_saldo_dueno(374, '28151001'))::text);
  perform pg_temp.chk('Z1 obligación con el dueño 1 (28151001) por los movimientos de la prueba (sin las causaciones emuladas de las facturas): 3 recaudos POS 180.000 − comisión compensada 36.000 + retención sobre la comisión 3.960 − compensación 8.000 − reteIVA del comprador 1.710', '138250.00',
    (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and l.account_code = '28151001' and e.id > current_setting('d22.je0')::int));
  perform pg_temp.chk('Z2 retención sufrida del intermediario (13551501) = la practicada sobre su comisión', '3960.00',
    (select sum(l.debit - l.credit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and l.account_code = '13551501' and e.id > current_setting('d22.je0')::int));
  perform pg_temp.chk('Z3 ninguna retención pendiente o «no aplica» trae valor; ninguna estimada tiene asiento', '0/0',
    (select count(*)::text from consignment_settlement_withholdings where status in ('pendiente', 'no_aplica') and amount is not null) || '/'
    || (select count(*)::text from consignment_settlement_withholdings w where w.status = 'estimada' and w.journal_entry_id is not null));
  perform pg_temp.chk('Z4 asientos de la prueba 22 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d22.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
end $z22$;

-- ════ CUERPO: 26.sql ════
-- ════ 26 · Consignación, ronda 5: la retención de la operación se registra con el COBRO de la factura y su abono queda
--      en ese mismo momento (la cartera no queda inflada ni se abona de más; el certificado, pendiente de soporte); el
--      contrato recibido en mandato fija el orden de aplicación y la liquidación por escrito (C.Co. art. 1277) ════
select set_config('dry.prueba', '26', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s26$
declare
  m1 int; b1 uuid; p1 int; inv1 uuid; inv2 uuid; v_pg1 uuid; v_pg2 uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
begin
  insert into chart_of_accounts (organization_id, account_code, name, type, centro_costo_modo, parent_code, es_movimiento)
  select 374, x.* from (values
   ('911520', 'En consignación', 'order', 'no_aplica', '9115', true),
   ('281510', 'Venta por cuenta de terceros', 'liability', 'no_aplica', '2815', false),
   ('28151001', 'Dueño consignante 1', 'liability', 'no_aplica', '281510', true),
   ('413512', 'Venta a cambio de retribución', 'income', 'no_aplica', '4135', false),
   ('41351201', 'Remuneración por consignación', 'income', 'no_aplica', '413512', true),
   ('138095', 'Otras cuentas por cobrar', 'asset', 'no_aplica', '1380', false),
   ('13809501', 'Remuneración por cobrar a dueños consignantes', 'asset', 'no_aplica', '138095', true)) x(c, n, t, m, p, e)
   where not exists (select 1 from chart_of_accounts y where y.organization_id = 374 and y.account_code = x.c);
  if exists (select 1 from organization_tax_profiles where organization_id = 374) then
    update organization_tax_profiles set regimen = 'ordinario', responsabilidades = array['O-48'], requiere_revision = false, agente_retencion = false,
           agente_retencion_iva = null, gran_contribuyente = null where organization_id = 374;
  else
    insert into organization_tax_profiles (organization_id, vigente_desde, regimen, responsabilidades, agente_retencion) values (374, '2026-01-01', 'ordinario', array['O-48'], false);
  end if;
  insert into suppliers (organization_id, name, nit, supplier_type, fiscal_responsibilities) values (374, 'Mandante 26-1', '900000261', 'company', array['O-13', 'O-48']) returning id into m1;
  insert into customers (organization_id, first_name, last_name) values (374, 'Comprador', '26 Uno') returning id into b1;
  insert into products (organization_id, sku, name) values (374, 'P26-1', 'Consignado 26-1') returning id into p1;
  -- Dos facturas EMITIDAS (sus disparadores causan la venta y crean la cartera) y el cobro de cada una: el comprador paga
  -- 71.400 − reteIVA 1.710 = 69.690. El saldo de cada factura queda en 1.710, que es la retención por abonar.
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', b1) returning id into inv2;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (inv1, 'sale', inv1, 'Consignado 26-1', 1, 60000, 19, 71400, p1),
    (inv2, 'sale', inv2, 'Consignado 26-1', 1, 60000, 19, 71400, p1);
  update invoice_sales set status = 'issued' where id in (inv1, inv2);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv1::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg1;
  perform set_config('d26.pg1', v_pg1::text, true);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', inv2::text, 'transfer', 69690, 'COP', 'completed', u, now()) returning id into v_pg2;
  perform set_config('d26.pg2', v_pg2::text, true);
  perform set_config('d26.m1', m1::text, true); perform set_config('d26.p1', p1::text, true);
  perform set_config('d26.inv1', inv1::text, true); perform set_config('d26.inv2', inv2::text, true);
  perform set_config('d26.u', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('d26.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s26$;
select set_config('request.jwt.claims', current_setting('d26.u'), true);
set local role authenticated;

-- ── N · Contrato recibido en mandato: orden de aplicación y liquidación por escrito (respuesta 11) ─────────────────
do $n26$
declare
  o int := 374; b int := 585; m1 int := current_setting('d26.m1')::int; p1 int := current_setting('d26.p1')::int;
  t jsonb; r jsonb; n1 uuid; lin jsonb; q text := 'select fn_consignacion_recibir(%s,%s,%L::jsonb,15,%L::jsonb,%L,%s)';
begin
  perform fn_consignacion_configurar_cuentas(o, '911520', '9405', '41351201', '13809501',
    '{"retefuente":"13551501","reteiva":"13551701","reteica":"13551801"}'::jsonb);
  t := jsonb_build_object('contrato','intermediacion','condicion','agente','valoracion','costo_acreditado','precio_modo','minimo',
    'remuneracion_modo','porcentaje','base_comision','precio_pactado','reconocimiento','al_vender','factura_remuneracion',false,
    'obligacion_dueno','venta','compensacion_remuneracion',true,
    'riesgos',jsonb_build_object('devoluciones','dueno','perdidas','dueno','gastos','consignatario'),'cuenta_recaudo','28151001',
    'orden_aplicacion',jsonb_build_array('remuneracion','gastos_reembolsables','anticipos','derechos_frente_al_dueno'),
    'liquidacion_escrita',jsonb_build_object('medio','correo_electronico','plazo_dias',5));
  lin := jsonb_build_array(jsonb_build_object('product_id',p1,'qty',5,'precio',60000,'costo_acreditado',40000));
  perform pg_temp.err('N1 sin orden de aplicación', 'orden_aplicacion_obligatorio', format(q, m1, b, lin, t - 'orden_aplicacion', 'k26-n1', o));
  perform pg_temp.err('N2 orden con un concepto que no existe', 'terminos_invalidos', format(q, m1, b, lin, t || '{"orden_aplicacion":["remuneracion","intereses"]}', 'k26-n2', o));
  perform pg_temp.err('N3 orden con un concepto repetido', 'terminos_invalidos', format(q, m1, b, lin, t || '{"orden_aplicacion":["remuneracion","remuneracion"]}', 'k26-n3', o));
  perform pg_temp.err('N4 compensación pactada sin decir cuándo se aplica la remuneración', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"orden_aplicacion":["anticipos","gastos_reembolsables"]}', 'k26-n4', o));
  perform pg_temp.err('N5 sin liquidación por escrito', 'liquidacion_escrita_obligatoria', format(q, m1, b, lin, t - 'liquidacion_escrita', 'k26-n5', o));
  perform pg_temp.err('N6 medio de la liquidación que no es escrito', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"liquidacion_escrita":{"medio":"verbal","plazo_dias":5}}', 'k26-n6', o));
  perform pg_temp.err('N7 plazo de la liquidación por fuera de 1 a 90 días', 'terminos_invalidos',
    format(q, m1, b, lin, t || '{"liquidacion_escrita":{"medio":"correo_electronico","plazo_dias":0}}', 'k26-n7', o));
  r := fn_consignacion_recibir(m1, b, lin, 15, t, 'k26-n8', o, null); n1 := r ->> 'nota_id';
  perform set_config('d26.n1', n1::text, true);
  perform pg_temp.chk('N8 la nota guarda el orden de aplicación y la liquidación por escrito', '4 · remuneracion · correo_electronico/5',
    (select jsonb_array_length(settlement_terms -> 'orden_aplicacion')::text || ' · ' || (settlement_terms -> 'orden_aplicacion' ->> 0) || ' · '
            || (settlement_terms -> 'liquidacion_escrita' ->> 'medio') || '/' || (settlement_terms -> 'liquidacion_escrita' ->> 'plazo_dias')
       from consignment_notes where id = n1));
  perform pg_temp.chk('N9 la entregada (lado del mandante) no exige estos términos de la recibida', 'null',
    coalesce((fn_consignacion_terminos(t - 'valoracion' - 'cuenta_recaudo' - 'orden_aplicacion' - 'liquidacion_escrita', 'entregada') -> 'liquidacion_terminos')::text, 'null'));
  perform pg_temp.mover(o, b, p1, 'out', 1, 'invoice_sale', current_setting('d26.inv1'));
end $n26$;
reset role;
-- La venta (porción vendida) ocurrió hace dos días; se simula fechándola como administrador.
update consignment_allocations set created_at = now() - interval '2 days' where source_id = current_setting('d26.inv1');
select set_config('request.jwt.claims', current_setting('d26.u'), true);
set local role authenticated;

-- ── C · Retención de la operación: con el cobro, abono a la factura en ese momento (respuesta 10) ────────────────────
do $c26$
declare
  o int := 374; n1 uuid := current_setting('d26.n1')::uuid; inv1 uuid := current_setting('d26.inv1')::uuid; inv2 uuid := current_setting('d26.inv2')::uuid;
  pg1 uuid := current_setting('d26.pg1')::uuid; pg2 uuid := current_setting('d26.pg2')::uuid;
  hoy date := (now() at time zone 'America/Bogota')::date; r jsonb; l1 uuid; w uuid; w2 uuid;
  q text := 'select fn_consignacion_retencion_practicada(%L, %s, 11400, %L::date, %L, 374, %L, %L)';
begin
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k26-l1', o); l1 := r ->> 'liquidacion_id';
  perform pg_temp.chk('N10 la liquidación por escrito lleva el orden de aplicación y su forma', 'remuneracion · correo_electronico/5',
    (r -> 'terminos_liquidacion' -> 'orden_aplicacion' ->> 0) || ' · ' || (r -> 'terminos_liquidacion' -> 'liquidacion_escrita' ->> 'medio') || '/'
      || (r -> 'terminos_liquidacion' -> 'liquidacion_escrita' ->> 'plazo_dias'));
  select id into w from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteiva' order by payer_group limit 1;
  select id into w2 from consignment_settlement_withholdings where settlement_id = l1 and scope = 'operacion' and class = 'reteica' order by payer_group limit 1;
  perform pg_temp.chk('C0 saldo de la factura después del cobro (lo que queda es la retención)', '1710.00 · partial',
    (select balance::text || ' · ' || status from invoice_sales where id = inv1));
  perform pg_temp.err('C1 la retención de la operación sin el cobro en que se practicó', 'cobro_obligatorio',
    format('select fn_consignacion_retencion_practicada(%L, 1710, 11400, %L::date, %L, 374, %L)', w, hoy, 'Comprobante del pago de la factura 26-1', inv1));
  perform pg_temp.err('C2 con el cobro de OTRA factura', 'cobro_de_otra_factura', format(q, w, 1710, hoy, 'Comprobante del pago de la factura 26-1', inv1, pg2));
  perform pg_temp.err('C3 en una fecha distinta de la del cobro', 'fecha_distinta_del_cobro', format(q, w, 1710, hoy - 1, 'Comprobante del pago de la factura 26-1', inv1, pg1));
  perform pg_temp.err('C4 por más de lo que la factura todavía debe (abonaría de más la cartera)', 'retencion_excede_saldo_factura',
    format(q, w, 2000, hoy, 'Comprobante del pago de la factura 26-1', inv1, pg1));
  r := fn_consignacion_retencion_practicada(w, 1710, 11400, hoy, 'Comprobante del pago de la factura 26-1 con reteIVA', o, inv1, pg1);
  perform pg_temp.chk('C5 con su cobro: D 28151001 / C cartera de la factura (Concepto DIAN 13277 de 2025); abono por aplicar; saldo real exigible 0',
    '28151001 D 1710 · cartera de la factura C 1710 · por_aplicar · 1710.00 · 0.00 · pendiente_de_soporte',
    -- La cartera es la cuenta deudora con que se causó ESA factura (1305 o su auxiliar, según el plan de la organización).
    (select string_agg(case when l.debit > 0 then l.account_code || ' D ' || round(l.debit)
                            when l.account_code = (select jl.account_code from journal_entries e join journal_lines jl on jl.journal_entry_id = e.id
                                                    where e.source = 'invoice_sales' and e.source_id = inv1::text and jl.debit > 0 and jl.account_code like '13%'
                                                    order by jl.debit desc, jl.id limit 1)
                            then 'cartera de la factura C ' || round(l.credit) else l.account_code || ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
       from journal_lines l where l.journal_entry_id = (r ->> 'asiento_id')::int)
    || ' · ' || (r -> 'abono_factura' ->> 'estado') || ' · ' || (r -> 'abono_factura' ->> 'saldo_factura') || ' · ' || (r -> 'abono_factura' ->> 'saldo_real_exigible')
    || ' · ' || (r ->> 'certificado'));
  perform pg_temp.chk('C6 el abono queda ligado al cobro y a su fecha', '1 · 1710.00 · true · true',
    (select count(*)::text || ' · ' || max(x.amount)::text || ' · ' || bool_and(x.payment_id = pg1)::text || ' · ' || bool_and(x.applied_on = hoy)::text
       from consignment_withholding_receivable_applications x where x.withholding_id = w));
  perform pg_temp.chk('C7 saldo real exigible de la factura: saldo 1.710 − abono por aplicar 1.710 = 0', '1710.00 · 1710.00 · 0.00',
    (select c.saldo_factura::text || ' · ' || c.retenciones_por_aplicar::text || ' · ' || c.saldo_real_exigible::text
       from fn_consignacion_cartera_retenciones(374) c where c.invoice_id = inv1));
  perform pg_temp.chk('C8 la cartera operativa no se escribe a mano: sigue al saldo de la factura', '1710.00 · 1710.00',
    (select i.balance::text || ' · ' || (select ar.balance::text from accounts_receivable ar where ar.invoice_id = inv1 limit 1) from invoice_sales i where i.id = inv1));
  perform pg_temp.chk('C9 pendientes: la cartera por aplicar y el certificado pendiente de soporte', '1 · 1',
    (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_cartera_retencion_por_aplicar' and f.source_id = w::text and f.resolved_at is null)
    || ' · ' || (select count(*)::text from journal_entry_failures f where f.reason = 'consignacion_retencion_certificado_pendiente' and f.source_id = 'cert:' || w::text
                   and f.resolved_at is null and f.detail like '%pendiente de soporte%'));
  perform pg_temp.err('C10 otra retención sobre la misma factura que ya no tiene saldo (1.710 por aplicar + 100)', 'retencion_excede_saldo_factura',
    format(q, w2, 100, hoy, 'Comprobante del pago de la factura 26-1 con reteICA', inv1, pg1));
end $c26$;
reset role;
do $z26$
begin
  perform pg_temp.chk('Z1 asientos de la prueba 26 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d26.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z2 ningún abono por retención sin su cobro', '0',
    (select count(*)::text from consignment_withholding_receivable_applications x
      where not exists (select 1 from payments p where p.id = x.payment_id and p.status = 'completed')));
end $z26$;

-- ════ CUERPO: 20.sql ════
-- ════ 20 · Integración anticipos ↔ consignación con los archivos completos: retenciones, certificados, devoluciones y
--      anulaciones entre períodos y entre años. Corre DESPUÉS de 11, 15, 21 y 22 en la MISMA transacción (usa el mandante,
--      la nota, el comprador y las reglas que ellas dejaron). ════
select set_config('dry.prueba', '20', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $s20$
declare
  v_m1 int; v_n1 uuid; v_p1 int; v_inv4 uuid; v_inv5 uuid; v_pg4 uuid; v_pg5 uuid;
  u uuid := (select owner_user_id from organizations where id = 374);
begin
  -- Para el anticipo, la organización vuelve a ser agente de retención (renta e IVA), no gran contribuyente.
  update organization_tax_profiles set agente_retencion = true, agente_retencion_iva = true, gran_contribuyente = false, responsabilidades = array['O-48'],
         requiere_revision = false where organization_id = 374;
  select id into v_m1 from suppliers where organization_id = 374 and nit = '900000221';
  select id into v_n1 from consignment_notes where organization_id = 374 and idempotency_key = 'k22-n1';
  select product_id into v_p1 from consignment_note_lines where note_id = v_n1 limit 1;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', current_setting('d22.b1')::uuid) returning id into v_inv4;
  insert into invoice_sales (organization_id, branch_id, status, customer_id) values (374, 585, 'draft', current_setting('d22.b1')::uuid) returning id into v_inv5;
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line, product_id) values
    (v_inv4, 'sale', v_inv4, 'Consignado 22-1', 1, 60000, 0, 60000, v_p1),
    (v_inv5, 'sale', v_inv5, 'Consignado 22-1', 1, 60000, 0, 60000, v_p1);
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 20-4',
    p_source := 'invoice_sales', p_source_id := v_inv4::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 60000,
    p_created_by := u, p_fact_key := 'prueba20:inv4');
  perform fn_create_journal_entry(p_organization_id := 374, p_branch_id := 585, p_entry_date := now(), p_memo := 'Factura de prueba 20-5',
    p_source := 'invoice_sales', p_source_id := v_inv5::text, p_debit_account := '13050501', p_credit_account := '28151001', p_amount := 60000,
    p_created_by := u, p_fact_key := 'prueba20:inv5');
  perform set_config('d20.m1', v_m1::text, true); perform set_config('d20.n1', v_n1::text, true); perform set_config('d20.p1', v_p1::text, true);
  perform set_config('d20.inv4', v_inv4::text, true); perform set_config('d20.inv5', v_inv5::text, true);
  -- Ronda 5: los cobros de las facturas (60.000 − retefuente 2.400 = 57.600) en la fecha en que el comprador retuvo.
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', v_inv4::text, 'transfer', 57600, 'COP', 'completed', u, timestamptz '2026-10-20 10:00-05') returning id into v_pg4;
  perform set_config('d20.pg4', v_pg4::text, true);
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
    values (374, 585, 'invoice_sales', v_inv5::text, 'transfer', 57600, 'COP', 'completed', u, timestamptz '2025-12-20 10:00-05') returning id into v_pg5;
  perform set_config('d20.pg5', v_pg5::text, true);
  perform set_config('d20.je0', (select coalesce(max(id), 0)::text from journal_entries where organization_id = 374), true);
end $s20$;
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;

-- ── I · Anticipo al consignante, cruce con la obligación del mandato y devolución parcial por la línea ───────────────
do $i20$
declare
  m1 int := current_setting('d20.m1')::int; n1 uuid := current_setting('d20.n1')::uuid;
  r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid; res jsonb; ax uuid;
begin
  res := fn_anticipo_proveedor_registrar(m1, 585, 595000, 'transfer', 'pago_anticipado_precio', 'p20-AX', 374, 19, r4, ica, null, 'TRF-20-AX', null, null, true);
  ax := (res ->> 'anticipo_id')::uuid;
  perform set_config('d20.ax', ax::text, true);
  perform pg_temp.chk('I1 anticipo de 595.000 al consignante: retefuente 20.000 + reteIVA 14.250 + reteICA 4.830 (criterios compartidos)', '39080 · 555920.00',
    (res ->> 'retencion') || ' · ' || (res ->> 'girado'));
  res := fn_consignacion_cruzar_anticipo(n1, ax, 150000, 'k20-cruce', 374);
  perform pg_temp.chk('I2 cruce de 150.000 con la obligación EXIGIBLE del mandato (D 28151001 / C 13300501)', '150000.00 · 445000.00',
    (res ->> 'monto') || ' · ' || (res ->> 'saldo_anticipo'));
  res := fn_anticipo_proveedor_devolver(ax, 111184, 'transfer', 'Devolución parcial del consignante', 'p20-dev', 374, null, 'Consignación 20-1',
           jsonb_build_object('causa', 'devolucion_parcial', 'requiere_correccion', false,
             'hecho', jsonb_build_object('tipo', 'acta_devolucion', 'documento', 'Acta de devolución 20-1', 'fecha', current_date),
             'lineas', '[{"componente":"0","base":100000,"iva":19000}]'::jsonb,
             'soportes', jsonb_build_object('calculo', 'Línea devuelta', 'certificado', 'Certificado corregido 20-1',
               'ica', jsonb_build_object('solicitud', 'Radicado 20-1', 'certificado', 'Certificado ICA 20-1', 'prueba_pago', 'Comprobante 20-1',
                                         'liquidacion_corregida', 'Liquidación 20-1'))));
  perform pg_temp.chk('I3 devolución parcial por la línea: 4.000 + 2.850 + 966', '7816.00 · 326000.00', (res ->> 'retencion_revertida') || ' · ' || (res ->> 'saldo_disponible'));
end $i20$;
reset role;
do $j20$
declare m1 int := current_setting('d20.m1')::int; ax text := current_setting('d20.ax');
begin
  perform pg_temp.chk('I4 conciliación del anticipo: 595.000 − cruzado 150.000 − devuelto 119.000 = 326.000 = libros', 'true · 150000.00 · 119000.00 · 326000.00 · 326000.00',
    (select (a ->> 'cuadra') || ' · ' || (a ->> 'cruzado') || ' · ' || (a ->> 'devuelto') || ' · ' || (a ->> 'saldo') || ' · ' || (a ->> 'saldo_libros')
       from jsonb_array_elements(fn_anticipos_proveedor_conciliacion(374, m1) -> 'anticipos') a where a ->> 'anticipo_id' = ax));
  perform pg_temp.chk('I5 por proveedor: tabla = libros = auxiliar por NIT', '326000.00 · 326000.00 · 326000.00',
    (select (p ->> 'saldo') || ' · ' || (p ->> 'saldo_libros') || ' · ' || (p ->> 'auxiliar_nit')
       from jsonb_array_elements(fn_anticipos_proveedor_conciliacion(374, m1) -> 'proveedores') p));
  perform pg_temp.chk('I6 certificado del consignante (practicadas por la organización): 39.080 − 7.816; las retenciones que SUFRE en la consignación no entran', '31264.00 · 6',
    (select sum(f.valor)::text || ' · ' || count(*)::text from fn_retenciones_practicadas_filas(374, now() - interval '1 day', timestamptz '2026-12-31 23:59:59-05', null, m1) f));
  perform pg_temp.chk('I7 certificado = libros 236x del NIT del consignante', '31264.00',
    (select sum(l.credit - l.debit)::text from journal_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.organization_id = 374 and e.id > current_setting('d20.je0')::int and l.tercero_nit = '900000221' and left(l.account_code, 3) = '236'));
end $j20$;

-- ── A · Anulaciones por error entre períodos (octubre → octubre) y entre años (diciembre de 2025 → enero de 2026) ───
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;
do $a20$
declare m1 int := current_setting('d20.m1')::int; r4 uuid := current_setting('d21.r4')::uuid; ica uuid := current_setting('d21.ica')::uuid; res jsonb;
begin
  res := fn_anticipo_proveedor_registrar(m1, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p20-AY', 374, 19, r4, ica, null, 'TRF-20-AY', null, null, true);
  perform set_config('d20.ay', res ->> 'anticipo_id', true);
  res := fn_anticipo_proveedor_registrar(m1, 585, 119000, 'transfer', 'pago_anticipado_precio', 'p20-AZ', 374, 19, r4, ica, null, 'TRF-20-AZ', null, null, true);
  perform set_config('d20.az', res ->> 'anticipo_id', true);
end $a20$;
reset role;
update supplier_advances set created_at = timestamptz '2026-10-02 10:00-05' where id = current_setting('d20.ay')::uuid;
update supplier_advance_withholdings set fecha = timestamptz '2026-10-02 10:00-05' where advance_id = current_setting('d20.ay')::uuid;
update supplier_advances set created_at = timestamptz '2025-12-20 10:00-05' where id = current_setting('d20.az')::uuid;
update supplier_advance_withholdings set fecha = timestamptz '2025-12-20 10:00-05' where advance_id = current_setting('d20.az')::uuid;
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;
do $a20b$
declare res jsonb;
begin
  res := fn_anticipo_proveedor_anular_por_error(current_setting('d20.ay')::uuid, 'El banco rechazó la transferencia', 'Extracto de octubre con el rechazo', date '2026-10-25', 374);
  perform set_config('d20.ay_rev', res ->> 'contra_asiento', true);
  res := fn_anticipo_proveedor_anular_por_error(current_setting('d20.az')::uuid, 'El banco rechazó la transferencia', 'Extracto de enero con el rechazo', date '2026-01-05', 374);
  perform set_config('d20.az_rev', res ->> 'contra_asiento', true);
end $a20b$;
reset role;
do $a20c$
declare m1 int := current_setting('d20.m1')::int;
begin
  perform pg_temp.chk('A1 octubre: retención del 2 y su anulación del 25 en el mismo período (neto 0)', '6 · 0.00',
    (select count(*)::text || ' · ' || sum(f.valor)::text from fn_retenciones_practicadas_filas(374, timestamptz '2026-10-01 00:00-05', timestamptz '2026-10-31 23:59:59-05', null, m1) f));
  perform pg_temp.chk('A2 entre años: diciembre de 2025 conserva la retención (7.816); enero de 2026 lleva su reversión (−7.816)', '7816.00 / -7816.00',
    (select sum(f.valor)::text from fn_retenciones_practicadas_filas(374, timestamptz '2025-12-01 00:00-05', timestamptz '2025-12-31 23:59:59-05', null, m1) f) || ' / '
    || (select sum(f.valor)::text from fn_retenciones_practicadas_filas(374, timestamptz '2026-01-01 00:00-05', timestamptz '2026-01-31 23:59:59-05', null, m1) f));
  perform pg_temp.chk('A3 contra-asientos en la fecha del ajuste (2026-10-25 y 2026-01-05)', '2026-10-25 / 2026-01-05',
    (select to_char(entry_date at time zone 'America/Bogota', 'YYYY-MM-DD') from journal_entries where id = current_setting('d20.ay_rev')::int) || ' / '
    || (select to_char(entry_date at time zone 'America/Bogota', 'YYYY-MM-DD') from journal_entries where id = current_setting('d20.az_rev')::int));
  perform pg_temp.chk('A4 pendiente «retención revertida en otro año» solo para la de 2025', '0/1',
    (select count(*)::text from anticipo_pendientes where advance_id = current_setting('d20.ay')::uuid and tipo = 'retencion_revertida_otro_anio') || '/'
    || (select count(*)::text from anticipo_pendientes where advance_id = current_setting('d20.az')::uuid and tipo = 'retencion_revertida_otro_anio'));
end $a20c$;

-- ── C · Consignación: retención practicada en un período anterior y en otro año; anular y reliquidar después ─────────
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;
do $c20$
begin
  perform pg_temp.mover(374, 585, current_setting('d20.p1')::int, 'out', 1, 'invoice_sale', current_setting('d20.inv4'));
  perform pg_temp.mover(374, 585, current_setting('d20.p1')::int, 'out', 1, 'invoice_sale', current_setting('d20.inv5'));
end $c20$;
reset role;
update consignment_allocations set created_at = timestamptz '2026-10-15 10:00-05' where source_id = current_setting('d20.inv4');
update consignment_allocations set created_at = timestamptz '2025-12-15 10:00-05' where source_id = current_setting('d20.inv5');
select set_config('request.jwt.claims', current_setting('d22.u'), true);
set local role authenticated;
do $c20b$
declare
  n1 uuid := current_setting('d20.n1')::uuid; r jsonb; ldic uuid; loct uuid; lnov uuid; lfin uuid; w4 uuid; w5 uuid; wrem uuid; abiertos int;
begin
  r := fn_consignacion_recibida_liquidar(n1, date '2025-12-31', false, null, 'k20-ldic', 374); ldic := r ->> 'liquidacion_id';
  select id into w5 from consignment_settlement_withholdings where settlement_id = ldic and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente';
  r := fn_consignacion_retencion_practicada(w5, 2400, 60000, date '2025-12-20', 'Comprobante de pago de la factura 20-5 (diciembre de 2025)', 374, current_setting('d20.inv5')::uuid,
                                            current_setting('d20.pg5')::uuid);
  perform pg_temp.chk('C1 retención del comprador ocurrida en diciembre de 2025, reconocida en su fecha', '2025-12-20 · 28151001 D 2400 · 13050501 C 2400',
    (select to_char(entry_date at time zone 'America/Bogota', 'YYYY-MM-DD') from journal_entries where id = (r ->> 'asiento_id')::int) || ' · '
    || (select string_agg(l.account_code || case when l.debit > 0 then ' D ' || round(l.debit) else ' C ' || round(l.credit) end, ' · ' order by l.debit desc)
          from journal_lines l where l.journal_entry_id = (r ->> 'asiento_id')::int));
  r := fn_consignacion_recibida_liquidar(n1, date '2026-10-31', false, null, 'k20-loct', 374); loct := r ->> 'liquidacion_id';
  select id into w4 from consignment_settlement_withholdings where settlement_id = loct and scope = 'operacion' and class = 'retefuente' and payer_group = 'agente';
  select id into wrem from consignment_settlement_withholdings where settlement_id = loct and scope = 'remuneracion' and class = 'retefuente';
  perform pg_temp.err('C2 el hecho no puede ser anterior a la venta que se liquida', 'fecha_anterior_a_la_venta',
    format('select fn_consignacion_retencion_practicada(%L,660,6000,%L::date,%L,374)', wrem, '2026-10-01', 'Comprobante anterior a la venta'));
  r := fn_consignacion_retencion_practicada(w4, 2400, 60000, date '2026-10-20', 'Comprobante de pago de la factura 20-4 (octubre)', 374, current_setting('d20.inv4')::uuid,
                                            current_setting('d20.pg4')::uuid);
  perform pg_temp.chk('C3 retención de octubre reconocida en su fecha (registrada en noviembre)', '2026-10-20',
    (select to_char(entry_date at time zone 'America/Bogota', 'YYYY-MM-DD') from journal_entries where id = (r ->> 'asiento_id')::int));
  select count(*) into abiertos from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
     and (f.source_id like loct::text || ':%' or f.source_id like ldic::text || ':%');
  -- Anular en noviembre las liquidaciones de octubre y de diciembre de 2025 (la última primero) y reliquidar.
  r := fn_consignacion_recibida_anular_liquidacion(loct, 'Se rehace la liquidación de octubre', 374);
  r := fn_consignacion_recibida_anular_liquidacion(ldic, 'Se rehace la liquidación de diciembre de 2025', 374);
  perform pg_temp.chk('C4 anular las dos liquidaciones no cierra sus pendientes; las retenciones practicadas y sus asientos quedan', abiertos::text || ' · 2 · 2',
    (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
       and (f.source_id like loct::text || ':%' or f.source_id like ldic::text || ':%')) || ' · '
    || (select count(*)::text from consignment_settlement_withholdings where id in (w4, w5) and status = 'practicada') || ' · '
    || (select count(*)::text from journal_entries where source = 'consignment_withholding' and source_id in (w4::text, w5::text)));
  r := fn_consignacion_recibida_liquidar(n1, null, false, null, 'k20-lfin', 374); lfin := r ->> 'liquidacion_id';
  perform pg_temp.chk('C5 la nueva liquidación (noviembre) cubre las dos ventas y trae las dos retenciones practicadas con sus fechas', '120000.00 · 2 · 2025-12-20,2026-10-20',
    (r ->> 'venta') || ' · ' || (select count(*)::text from consignment_settlement_withholdings where settlement_id = lfin and status = 'practicada' and carried_from is not null)
    || ' · ' || (select string_agg(practiced_at::text, ',' order by practiced_at) from consignment_settlement_withholdings where settlement_id = lfin and status = 'practicada'));
  perform pg_temp.chk('C6 los pendientes de las anuladas se cierran como reliquidadas', '0',
    (select count(*)::text from journal_entry_failures f where f.source = 'consignment_owner_settlement' and f.resolved_at is null
       and (f.source_id like loct::text || ':%' or f.source_id like ldic::text || ':%')));
  r := fn_consignacion_conciliar_retencion(w5, 2400, 'Certificado anual 2025 del comprador', 374);
  perform pg_temp.chk('C7 el certificado de 2025 concilia en 2026 la retención practicada en 2025', '0.00', r ->> 'diferencia');
end $c20b$;
reset role;
do $z20$
begin
  perform pg_temp.chk('Z1 certificado de 2025 del consignante: solo el anticipo de diciembre (la retención que él sufrió en la consignación no entra)', '3 · 7816.00',
    (select count(*)::text || ' · ' || sum(f.valor)::text from fn_retenciones_practicadas_filas(374, timestamptz '2025-12-01 00:00-05', timestamptz '2025-12-31 23:59:59-05',
       null, current_setting('d20.m1')::int) f));
  perform pg_temp.chk('Z2 asientos de la prueba 20 descuadrados', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.id > current_setting('d20.je0')::int
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
  perform pg_temp.chk('Z3 toda la transacción: ningún asiento descuadrado', '0',
    (select count(*)::text from journal_entries e where e.organization_id = 374 and e.created_at = now()
       and (select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) from journal_lines l where l.journal_entry_id = e.id) <> 0));
end $z20$;

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
