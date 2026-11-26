-- ═══ SUPERADA (2026-11-25) — NO EJECUTAR ═══════════════════════════════════════════════════════
-- El Contador aprobó estos asientos con el caso PERSONA NATURAL (la org 377 lo es: razón social =
-- nombre del dueño, NIT de persona natural). Se aplicaron con cuentas distintas a las de abajo:
-- 3130 en vez de 133015/1325 y 2380, y la nota «Retiro del propietario · por legalizar».
--   Aplicado:  supabase/migrations/20261126041000_cierre_caja_org377_persona_natural.sql (NA-641 a NA-649)
--   Reversión: supabase/rollbacks/20261126041000_cierre_caja_org377_persona_natural_rollback.sql
--   Cierre automático (sobrantes 42958102 / faltantes 53959502):
--              supabase/migrations/20261126040000_cierre_caja_sobrantes_faltantes.sql
-- Este archivo queda solo como antecedente de la revisión.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- PROPUESTA — NO APLICAR sin el visto bueno del Contador (él pidió ver los asientos antes).
-- GO-contabilidad · Cierre de la caja de la org 377, versión 2 (reemplaza la propuesta
-- PROPUESTA_NO_APLICAR_20261126_salidas_caja_org377.sql, que llevaba la consignación a la 1110).
-- Reversión: PROPUESTA_NO_APLICAR_20261126_cierre_caja_org377_v2_rollback.sql
--
-- DECISIÓN DEL CONTADOR (2026-11-25), resumida:
--   1. Base de $150.000: Dr 1105 / Cr 2380 al socio, fecha 10 de noviembre.
--   2. Consignación de $372.450 sin comprobante: no va a bancos. Con las salidas del punto 3 y la nota
--      «Posible consignación 10-nov · por legalizar». Si aparece el extracto, se reclasifica a la 1110.
--   3. Salidas sin soporte: a la 133015 (cuenta por cobrar a socios) con el dueño como tercero y la nota
--      «Salida de caja sin soporte · por legalizar». Si manejaba la caja otra persona: 136525 con ella.
--   4. Sobrantes fuera de la 41359501. El de $374.450 (10-nov) a la 42958101, salvo que sea la misma
--      plata de la consignación: entonces no es sobrante y se cruza con el punto 3. El de $50.100
--      (22-nov): si la base real era $89.100, se corrige la base y no hay sobrante; si no, 42958101.
--   Al final la caja (1105) debe quedar en $172.000, igual al último arqueo.
--
-- ─── HALLAZGOS (verificados en la BD, 2026-11-25) ──────────────────────────────────────────────
-- QUIÉN MANEJABA LA CAJA. Las 13 sesiones de la org 377 (25 a 46 y la 65, abierta hoy) las abrió y
--   las cerró el mismo usuario, que es organizations.owner_user_id y el único miembro de la
--   organización (Admin de organización). ⇒ Todo va a la cuenta del socio con el DUEÑO como tercero;
--   la 136525 (trabajadores) no se usa.
-- TERCERO DEL DUEÑO. No tiene documento en HRM (hr_people existe, hr_people_identification sin
--   doc_number) y el sistema no tiene ficha de «socio». Se usa la misma regla de fn_trg_tercero_linea_
--   asiento para las propinas: documento de HRM y, si no hay, el NIT de la organización. El NIT de la
--   org 377 es de persona natural (9 dígitos, no empieza por 8 ni 9; la razón social lleva el apellido
--   del dueño): es la cédula del dueño. Nombre: el de HRM.
-- CUENTAS EN EL PLAN DE LA ORG 377:
--   1105 Caja ............................ movimiento, saldo hoy 1.297.950
--   2380 Acreedores varios ............... movimiento, exige tercero, sin movimientos
--   41359501 Venta de mercancías ......... movimiento, saldo −1.748.415 (incluye los dos sobrantes)
--   42958101 «Ajuste al peso a favor» .... movimiento (padre 429581 «Ajuste al peso»), sin movimientos
--   133015 ............................... NO EXISTE. Su padre 1330 se llama «Anticipos y avances» (en
--                                          el PUC 133015 es «A trabajadores»). 1330 es de movimiento,
--                                          sin saldo ni movimientos.
--   1325 Cuentas por cobrar a socios y accionistas ... EXISTE, movimiento, exige tercero, sin uso.
--   136525 ............................... NO EXISTE (1365 sí); no hace falta: no hubo otro cajero.
--   Se crea 133015 debajo de 1330 igual que fn_plan_crear_cuenta_hija (la pantalla Plan de cuentas):
--   hereda naturaleza y exigencias, 1330 pasa a título y queda 1330 → 133015 en plan_cuentas_sucesoras.
--   Esa función exige sesión (auth.uid()), por eso aquí se replica con created_by nulo.
--   OJO: con 1330 de título, fn_cuenta_anticipo_proveedor (13300501 → 133005 → 1330) ya no encuentra
--   cuenta para un anticipo a proveedor de esta org (hoy no tiene ninguno), y el informe de cartera
--   (fn_cartera_edades_json) muestra la 1330 como «anticipos»: los 851.400 del dueño saldrían ahí.
--   Con v_cuenta_socio = '1325' no se crea nada y no hay ese efecto. → Pregunta al Contador.
--
-- PUNTO 2 · ¿El sobrante de 374.450 es la misma plata de la consignación? SÍ.
--   Sesión 25 (primera de la org): abre 10-nov 17:27 con base 150.000; cero ventas y cero pagos en el
--   sistema hasta el 11-nov (la primera venta es del 11-nov 17:12); esperado al cierre = 150.000;
--   contado = 524.450 (502.000 en billetes y 22.450 en monedas, según el arqueo); sobrante = contado −
--   esperado = 374.450, que el cierre llevó Dr 1105 / Cr 41359501 (asiento NA-432). Al abrir la sesión
--   26 (11-nov) la base fue 150.000: salieron exactamente 374.450 = 372.450 («se consignó en la
--   cuenta», nota del cierre) + 2.000. Es plata que apareció en el cajón sin venta y salió esa misma
--   noche: no es ingreso ni sobrante. Asiento: Dr 41359501 / Cr cuenta del socio 374.450 (cruce), y
--   las dos salidas Dr cuenta del socio / Cr 1105 (372.450 con «Posible consignación…» y 2.000 con
--   «Salida…»). La cuenta del socio queda en cero por el 10-nov y la nota de la posible consignación
--   queda en el auxiliar: si aparece el extracto, Dr 1110 / Cr cuenta del socio 372.450 y lo que quede
--   a favor del dueño se lleva a la 2380 (plata suya que entró a la caja).
--
-- PUNTO 3 · ¿La base real de la sesión 43 era 89.100? Lo indica el sistema, no un documento.
--   Sesión 39 cierra 21-nov 19:05 con 419.500 contados (= esperado). Sesión 43 abre 21-nov 20:42 con
--   base 39.000; durante la sesión: cobros en efectivo 71.600 − vueltas 13.000 − reintegro de la
--   devolución 9 por 53.000 = +5.600; esperado 44.600; contado 94.700; sobrante 50.100; nota del cierre:
--   «ERRO AL ABRIR LA CAJA». Con base 89.100 el esperado da 94.700 = contado, al peso. No hay arqueo de
--   apertura (ninguna sesión del sistema lo tiene), ni movimientos de caja, ni pagos entre el cierre de
--   la 39 y la apertura de la 43. ⇒ Dos pruebas del sistema (la nota del propio cajero al cerrar y el
--   cuadre exacto) y ninguna en contra. Por defecto se toma como confirmada (v_base_43_confirmada =
--   true): la salida 39 → 43 es 330.400 (no 380.500) y el sobrante se reversa Dr 41359501 / Cr 1105.
--   La sesión no se edita (initial_amount sigue en 39.000): la corrección vive en el libro, con su nota
--   y enlace a la sesión. Si el Contador no lo acepta como soporte: v_base_43_confirmada = false →
--   salida 380.500 y sobrante Dr 41359501 / Cr 42958101. La caja da 172.000 en los dos casos.
--
-- FECHAS. Base: apertura de la sesión 25 (10-nov 17:27:41 Bogotá). Salidas: cierre de la sesión de la
--   que salió la plata. Reclasificaciones de sobrantes: también la fecha del cierre que los registró
--   (10-nov y 22-nov), no la de hoy: noviembre está abierto, el resultado del mes es el mismo con
--   cualquiera de las dos, y así el auxiliar de la cuenta del socio cruza el 10-nov el mismo día (sin un
--   saldo de 374.450 vivo entre el 10 y el 26) y los informes de ventas diarios de esos días quedan sin
--   el sobrante. (Las correcciones de vueltas usaron la fecha de hoy porque corrigen un error del
--   sistema detectado hoy; aquí se reconstruyen hechos de días concretos.)
--
-- CADA ASIENTO: publicado, nota contable (NA), source 'cash_sessions' / sesión, fact_key único
--   cierre_caja_v2:<hecho>:<sesión>[…] (idempotente), terceros explícitos en 2380 y cuenta del socio.
--
-- RESULTADO DEL SECO (2026-11-25, el bloque + una verificación que termina en excepción: todo
--   revertido; después 0 asientos cierre_caja_v2, sin 133015, 1330 sigue de movimiento, NA en 641):
--   Por defecto (133015, base 43 confirmada): 9 asientos NA-641 a NA-649.
--     1105 = 172.000 · 41359501 sin tercero (los dos cierres) = 0 · 133015 dueño = 851.400 (débito)
--     · 2380 dueño = 150.000 (crédito) · 42958101 = 0 · 41359501 total = −1.323.865 (solo facturas).
--   Variante (1325, base 43 no confirmada): 1105 = 172.000 · 41359501 sin tercero = 0
--     · 1325 dueño = 901.500 · 2380 dueño = 150.000 (crédito) · 42958101 = 50.100 (crédito).
--   Sin errores de período (noviembre abierto), de cuenta de movimiento, de tercero ni de cuadre.

DO $cierre_v2$
declare
  -- ── Parámetros para el Contador ──────────────────────────────────────────────
  v_cuenta_socio text := '133015';        -- o '1325' (ya existe: «Cuentas por cobrar a socios y accionistas»)
  v_base_43_confirmada boolean := true;   -- false: el 50.100 va a 42958101 y la salida 39 → 43 es 380.500
  -- ────────────────────────────────────────────────────────────────────────────
  c_org constant integer := 377;
  v_owner uuid;
  v_nit text;
  v_nombre text;
  v_branch integer;
  v_padre public.chart_of_accounts%rowtype;
  v_s25 record; v_s26 record; v_s29 record; v_s30 record; v_s39 record; v_s43 record; v_s44 record; v_s46 record;
  v_s65_abierta timestamptz;
  v_h record;
  v_c record;
  v_entry integer;
  v_n integer := 0;
  v_saldo numeric;
  v_salida_39_43 numeric;
begin
  -- 0. Nada de la propuesta anterior aplicado (llevaba la consignación a la 1110).
  if exists (select 1 from public.journal_entries e
              where e.organization_id = c_org and e.fact_key like 'salida_caja:%') then
    raise exception 'PROPUESTA_ANTERIOR_APLICADA: hay asientos salida_caja:% en la org %; revisar antes.', '%', c_org;
  end if;

  -- 1. Las sesiones tienen que estar como se revisaron (si alguien las tocó, no se aplica).
  select * into v_s25 from public.cash_sessions where id = 25 and organization_id = c_org;
  select * into v_s26 from public.cash_sessions where id = 26 and organization_id = c_org;
  select * into v_s29 from public.cash_sessions where id = 29 and organization_id = c_org;
  select * into v_s30 from public.cash_sessions where id = 30 and organization_id = c_org;
  select * into v_s39 from public.cash_sessions where id = 39 and organization_id = c_org;
  select * into v_s43 from public.cash_sessions where id = 43 and organization_id = c_org;
  select * into v_s44 from public.cash_sessions where id = 44 and organization_id = c_org;
  select * into v_s46 from public.cash_sessions where id = 46 and organization_id = c_org;
  if v_s25.initial_amount <> 150000 or v_s25.final_amount <> 524450 or v_s25.difference <> 374450
     or v_s26.initial_amount <> 150000
     or v_s29.final_amount <> 634800 or v_s30.initial_amount <> 113000
     or v_s39.final_amount <> 419500 or v_s43.initial_amount <> 39000
     or v_s43.final_amount <> 94700 or v_s43.difference <> 50100
     or v_s44.initial_amount <> 95700 or v_s44.final_amount <> 172200
     or v_s46.initial_amount <> 172000 or v_s46.final_amount <> 172000 then
    raise exception 'SESIONES_DISTINTAS: las sesiones de caja de la org % no son las revisadas.', c_org;
  end if;
  -- El 89.100 sale del cuadre: base + (esperado − base) = contado.
  if v_base_43_confirmada and (89100 + ((public.pos_caja__esperado_calculo(43)->>'efectivo_esperado')::numeric - 39000)) <> 94700 then
    raise exception 'BASE_43_NO_CUADRA: con base 89.100 el esperado de la sesión 43 ya no da 94.700.';
  end if;
  v_branch := v_s25.branch_id;

  -- 2. El dueño y su tercero (misma regla que las propinas: HRM, si no el NIT de la organización).
  select o.owner_user_id into v_owner from public.organizations o where o.id = c_org;
  if exists (select 1 from public.cash_sessions s
              where s.organization_id = c_org and s.id in (25, 26, 29, 30, 39, 43, 44, 46)
                and (s.opened_by is distinct from v_owner or s.closed_by is distinct from v_owner)) then
    raise exception 'OTRO_CAJERO: alguna sesión la abrió o cerró alguien distinto al dueño: va a la 136525 con esa persona.';
  end if;
  select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
    into v_nit, v_nombre
    from public.hr_people hp
    left join public.hr_people_identification i on i.person_id = hp.id
   where hp.organization_id = c_org and hp.user_id = v_owner
   order by (i.doc_number is null), hp.created_at
   limit 1;
  if v_nombre is null then
    select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nombre
      from public.profiles p where p.id = v_owner;
  end if;
  if v_nit is null then
    select nullif(btrim(coalesce(o.nit, o.tax_id)), ''), coalesce(v_nombre, nullif(btrim(o.legal_name), ''), o.name)
      into v_nit, v_nombre
      from public.organizations o where o.id = c_org;
  end if;
  if v_nit is null then
    raise exception 'SIN_TERCERO_DUENO: el dueño no tiene documento en HRM ni la organización NIT.';
  end if;

  -- 3. La cuenta del socio. 133015 no existe: se crea como fn_plan_crear_cuenta_hija.
  if not exists (select 1 from public.chart_of_accounts c
                  where c.organization_id = c_org and c.account_code = v_cuenta_socio) then
    if v_cuenta_socio <> '133015' then
      raise exception 'CUENTA_SOCIO_INEXISTENTE: %', v_cuenta_socio;
    end if;
    select * into v_padre from public.chart_of_accounts c
     where c.organization_id = c_org and c.account_code = '1330' for update;
    if not found or v_padre.is_active is false then
      raise exception 'PADRE_INVALIDO: 1330';
    end if;
    select coalesce(sum(l.debit - l.credit), 0) into v_saldo
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = c_org and e.posted is true and l.account_code = '1330';
    if v_saldo <> 0 then
      raise exception 'PADRE_CON_SALDO: 1330 tiene %', v_saldo;
    end if;
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, naturaleza, es_movimiento,
      requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif, concepto_exogena, created_by
    ) values (
      c_org, '133015', 'Cuentas por cobrar a socios (por legalizar)', v_padre.type, null, true,
      coalesce(v_padre.naturaleza, 'debito'), true,
      true, v_padre.requiere_centro_costo, v_padre.centro_costo_modo, v_padre.presentacion_niif,
      v_padre.concepto_exogena, null
    );
    update public.chart_of_accounts set parent_code = '1330', updated_at = now()
     where organization_id = c_org and account_code = '133015';
    if v_padre.es_movimiento is true then
      update public.chart_of_accounts set es_movimiento = false, updated_at = now()
       where organization_id = c_org and account_code = '1330';
      insert into public.plan_cuentas_sucesoras (organization_id, account_code, sucesora, created_by)
      values (c_org, '1330', '133015', null)
      on conflict (organization_id, account_code) do nothing;
    end if;
  end if;

  v_salida_39_43 := case when v_base_43_confirmada then 419500 - 89100 else 419500 - 39000 end;

  -- 4. Un asiento por hecho.
  for v_h in
    select * from (values
      -- (orden, fact_key, sesión enlazada, fecha, monto, débito, tercero_débito?, crédito, tercero_crédito?, nota)
      (1, 'cierre_caja_v2:base_apertura:25', 25, v_s25.opened_at, 150000::numeric,
          '1105', false, '2380', true,
          'Base de apertura de la caja aportada por el socio · sesión 25 · 10-nov'),
      (2, 'cierre_caja_v2:sobrante_cruce:25', 25, v_s25.closed_at, 374450::numeric,
          '41359501', false, v_cuenta_socio, true,
          'Sobrante del cierre del 10-nov no es venta: es la misma plata de la posible consignación (372.450 + 2.000) · se cruza con la salida por legalizar · sesión 25'),
      (3, 'cierre_caja_v2:salida:25:26:consignacion', 25, v_s25.closed_at, 372450::numeric,
          v_cuenta_socio, true, '1105', false,
          'Posible consignación 10-nov · por legalizar · entre el cierre de la sesión 25 y la apertura de la 26'),
      (4, 'cierre_caja_v2:salida:25:26:sin_soporte', 25, v_s25.closed_at, 2000::numeric,
          v_cuenta_socio, true, '1105', false,
          'Salida de caja sin soporte · por legalizar · entre el cierre de la sesión 25 y la apertura de la 26'),
      (5, 'cierre_caja_v2:salida:29:30', 29, v_s29.closed_at, 521800::numeric,
          v_cuenta_socio, true, '1105', false,
          'Salida de caja sin soporte · por legalizar · entre el cierre de la sesión 29 y la apertura de la 30'),
      (6, 'cierre_caja_v2:salida:39:43', 39, v_s39.closed_at, v_salida_39_43,
          v_cuenta_socio, true, '1105', false,
          'Salida de caja sin soporte · por legalizar · entre el cierre de la sesión 39 y la apertura de la 43'
            || case when v_base_43_confirmada then ' (base de la 43 corregida a 89.100)' else '' end),
      (7, case when v_base_43_confirmada then 'cierre_caja_v2:base_corregida:43' else 'cierre_caja_v2:sobrante:43' end,
          43, v_s43.closed_at, 50100::numeric,
          '41359501', false, case when v_base_43_confirmada then '1105' else '42958101' end, false,
          case when v_base_43_confirmada
               then 'Corrección de la base de apertura de la sesión 43: era 89.100, no 39.000 («ERRO AL ABRIR LA CAJA») · no es sobrante'
               else 'Sobrante de caja del cierre del 22-nov · sale de ventas (41359501) · sesión 43' end),
      (8, 'cierre_caja_v2:entrada:43:44', 43, v_s43.closed_at, 1000::numeric,
          '1105', false, v_cuenta_socio, true,
          'Salida de caja sin soporte · por legalizar · entraron 1.000 entre el cierre de la sesión 43 y la apertura de la 44'),
      (9, 'cierre_caja_v2:salida:44:46', 44, v_s44.closed_at, 200::numeric,
          v_cuenta_socio, true, '1105', false,
          'Salida de caja sin soporte · por legalizar · entre el cierre de la sesión 44 y la apertura de la 46')
    ) as x(orden, fact_key, sesion, fecha, monto, debito, t_debito, credito, t_credito, nota)
    order by orden
  loop
    continue when exists (select 1 from public.journal_entries e
                           where e.organization_id = c_org and e.fact_key = v_h.fact_key);
    select c.numero, c.prefijo into v_c
      from public.fn_tomar_consecutivo_comprobante(c_org, 'nota_contable', 'NA') c;
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key,
      comprobante_tipo, comprobante_prefijo, comprobante_numero
    ) values (
      c_org, v_branch, v_h.fecha, left(v_h.nota, 500), 'cash_sessions', v_h.sesion::text, true, null,
      v_h.fact_key, 'nota_contable', v_c.prefijo, v_c.numero
    ) returning id into v_entry;
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_h.debito, left(v_h.nota, 500), v_h.monto, 0,
            case when v_h.t_debito then v_nit end, case when v_h.t_debito then v_nombre end);
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_h.credito, left(v_h.nota, 500), 0, v_h.monto,
            case when v_h.t_credito then v_nit end, case when v_h.t_credito then v_nombre end);
    v_n := v_n + 1;
  end loop;

  -- 5. La caja tiene que quedar igual al último arqueo (24-nov, 172.000). Se excluye solo lo que
  --    opere la sesión abierta hoy (65); los ajustes de hoy (vueltas, tercero 1305) sí cuentan.
  select s.opened_at into v_s65_abierta from public.cash_sessions s
   where s.organization_id = c_org and s.status = 'open' order by s.opened_at limit 1;
  select coalesce(sum(l.debit - l.credit), 0) into v_saldo
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = c_org and e.posted is true and l.account_code = '1105'
     and (v_s65_abierta is null or e.entry_date < v_s65_abierta
          or e.fact_key like 'vueltas_recaudo:%' or e.fact_key like 'recaudo_1305_tercero:%'
          or e.fact_key like 'cierre_caja_v2:%');
  if v_saldo <> 172000 then
    raise exception 'CAJA_NO_CUADRA: la 1105 quedaría en % y el arqueo del 24-nov es 172.000.', v_saldo;
  end if;

  raise notice 'Cierre de caja v2 org %: % asientos; 1105 = %.', c_org, v_n, v_saldo;
end
$cierre_v2$;
