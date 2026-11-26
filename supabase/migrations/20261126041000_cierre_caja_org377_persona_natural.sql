-- GO-contabilidad · Cierre de la caja de la org 377 (base, retiros del propietario por legalizar y
-- sobrantes) — aprobado por el Contador el 2026-11-25, caso PERSONA NATURAL.
-- Reemplaza la propuesta docs/contabilidad/PROPUESTA_NO_APLICAR_20261126_cierre_caja_org377_v2.sql
-- (que usaba 133015 / 1325 y 2380). Va después de 20261126040000_cierre_caja_sobrantes_faltantes.sql.
-- Reversión: supabase/rollbacks/20261126041000_cierre_caja_org377_persona_natural_rollback.sql
--
-- APROBACIÓN DEL CONTADOR (2026-11-25), lo que aplica aquí:
--   «Si es persona natural (…) no puede tener una cuenta por cobrar ni por pagar contra sí misma.
--    La base de $150.000 va a débito 1105 y crédito 3130, capital de personas naturales. Las salidas
--    sin soporte van a débito 3130 y crédito 1105, con la nota "Retiro del propietario · por
--    legalizar". La entrada de $1.000 va a débito 1105 y crédito 3130. Los $372.450 de la posible
--    consignación siguen igual: si aparece el extracto, se reclasifican de la 3130 a la 1110. El
--    tercero es el mismo NIT de la organización y está bien así.»
--   «La base de $89.100: sí, acepto como soporte la nota del cajero, el cuadre exacto y que no hubo
--    movimientos entre ese cierre y esa apertura. Deja la nota del asiento citando el texto del
--    cajero y la sesión de caja.»
--   «Cruzar el sobrante del 10 de noviembre con la salida fue lo correcto.»
--
-- TIPO DE CONTRIBUYENTE (verificado en la BD, 2026-11-25): PERSONA NATURAL.
--   · La razón social (organizations.legal_name) son exactamente las 4 palabras del nombre completo
--     del dueño (coinciden con su perfil y con su ficha de HRM) y no lleva S.A.S., LTDA, S.A., E.U.
--     ni ninguna forma societaria (la Ley 1258 obliga a una S.A.S. a llevar la sigla en su nombre).
--   · NIT de 9 dígitos que empieza por 7, con DV válido (el calculado da el mismo DV guardado). La
--     DIAN numera las personas jurídicas en 800/830/860/890/900/901; un NIT fuera de ese rango es
--     el documento de una persona natural.
--   · Un solo miembro (el dueño), que abrió y cerró todas las sesiones de caja.
--   · Sin perfil tributario (organization_tax_profiles), sin responsabilidades RUT, sin facturación
--     electrónica configurada ni solicitada: nada indica lo contrario. El plan trae 3105 y 3115 porque
--     es la plantilla común de todas las organizaciones, sin movimientos: no prueba sociedad.
--   Confirmación pendiente fuera del sistema: RUT, casilla 24 «Tipo de contribuyente» = 2 (persona
--   natural). El bloque de abajo aborta si la razón social llega a tener forma societaria o el NIT
--   empieza por 8 o 9.
--
-- CUENTAS: 3130 «Capital de personas naturales» no existía: se crea con fn_puc_asegurar_cuenta (el
--   mecanismo del plan), de movimiento y con tercero obligatorio. No se crea 133015, no se usan 1325
--   ni 2380. 41359501 sale sin los dos sobrantes; nada va a 42958101 ni a 539595.
-- TERCERO de la 3130: el NIT de la organización (sin DV, como las demás líneas con tercero del
--   sistema) y su razón social.
--
-- LOS 9 ASIENTOS (nota contable NA, publicados, source cash_sessions / sesión, fact_key único
-- cierre_caja_v2:<hecho>:<sesión>[…] — el mismo de la propuesta: idempotente):
--   1  10-nov  base apertura sesión 25 ................ Dr 1105      / Cr 3130   150.000
--   2  10-nov  cruce sobrante sesión 25 ............... Dr 41359501  / Cr 3130   374.450
--   3  10-nov  posible consignación 25→26 ............. Dr 3130      / Cr 1105   372.450
--   4  10-nov  salida 25→26 ........................... Dr 3130      / Cr 1105     2.000
--   5  14-nov  salida 29→30 ........................... Dr 3130      / Cr 1105   521.800
--   6  21-nov  salida 39→43 (base 43 = 89.100) ........ Dr 3130      / Cr 1105   330.400
--   7  22-nov  base corregida sesión 43 ............... Dr 41359501  / Cr 1105    50.100
--   8  22-nov  entrada 43→44 .......................... Dr 1105      / Cr 3130     1.000
--   9  23-nov  salida 44→46 ........................... Dr 3130      / Cr 1105       200
--   Efecto: 1105 −1.125.950 (1.297.950 → 172.000, el último arqueo); 3130 saldo débito 701.400
--   (retiros 1.226.850 − aportes 150.000 − cruce 374.450 − entrada 1.000); 41359501 −424.550 de
--   crédito (queda solo lo facturado).
-- FECHAS: las de la propuesta (apertura de la 25 para la base; cierre de la sesión de la que salió
--   la plata para cada salida; cierre que registró el sobrante para el cruce y la corrección).

DO $cierre_377$
declare
  c_org constant integer := 377;
  v_org public.organizations%rowtype;
  v_nit text;
  v_nombre text;
  v_branch integer;
  v_s25 record; v_s26 record; v_s29 record; v_s30 record; v_s39 record; v_s43 record; v_s44 record; v_s46 record;
  v_abierta timestamptz;
  v_h record;
  v_c record;
  v_entry integer;
  v_n integer := 0;
  v_saldo numeric;
begin
  -- 0. Nada de las propuestas anteriores aplicado.
  if exists (select 1 from public.journal_entries e
              where e.organization_id = c_org and e.fact_key like 'salida_caja:%') then
    raise exception 'PROPUESTA_ANTERIOR_APLICADA: hay asientos salida_caja:%% en la org %; revisar antes.', c_org;
  end if;

  -- 1. Persona natural (ver encabezado). Si no, no se aplica: el caso sociedad usa 1325 y la cédula del socio.
  select * into v_org from public.organizations o where o.id = c_org;
  if coalesce(v_org.legal_name, '') ~* '(\ms\.?\s?a\.?\s?s(\M|\.|$)|\ms\.?\s?a\.?$|\mltda\M|\mlimitada\M|\me\.?\s?u\.?$|\ms\.?\s?en\s?c\M|\msociedad\M|\mcorporaci|\mfundaci|\masociaci|\mcooperativ)'
     or left(coalesce(v_org.nit, v_org.tax_id, ''), 1) in ('8', '9') then
    raise exception 'NO_ES_PERSONA_NATURAL: la org % tiene razón social o NIT de sociedad; usar el caso 1325.', c_org;
  end if;
  v_nit := nullif(btrim(coalesce(v_org.nit, v_org.tax_id)), '');
  v_nombre := coalesce(nullif(btrim(v_org.legal_name), ''), v_org.name);
  if v_nit is null then
    raise exception 'SIN_NIT: la org % no tiene NIT para el tercero de la 3130.', c_org;
  end if;

  -- 2. Las sesiones tienen que estar como se revisaron (si alguien las tocó, no se aplica).
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
     or btrim(coalesce(v_s43.notes, '')) <> 'ERRO AL ABRIR LA CAJA'
     or v_s44.initial_amount <> 95700 or v_s44.final_amount <> 172200
     or v_s46.initial_amount <> 172000 or v_s46.final_amount <> 172000 then
    raise exception 'SESIONES_DISTINTAS: las sesiones de caja de la org % no son las revisadas.', c_org;
  end if;
  -- El 89.100 sale del cuadre: base + (esperado − base) = contado.
  if (89100 + ((public.pos_caja__esperado_calculo(43)->>'efectivo_esperado')::numeric - 39000)) <> 94700 then
    raise exception 'BASE_43_NO_CUADRA: con base 89.100 el esperado de la sesión 43 ya no da 94.700.';
  end if;
  if exists (select 1 from public.cash_sessions s
              where s.organization_id = c_org and s.id in (25, 26, 29, 30, 39, 43, 44, 46)
                and (s.opened_by is distinct from v_org.owner_user_id or s.closed_by is distinct from v_org.owner_user_id)) then
    raise exception 'OTRO_CAJERO: alguna sesión la abrió o cerró alguien distinto al dueño.';
  end if;
  v_branch := v_s25.branch_id;

  -- 3. La 3130 «Capital de personas naturales», de movimiento y con tercero.
  if public.fn_puc_asegurar_cuenta(c_org, '3130', 'Capital de personas naturales', true) is null then
    raise exception 'CUENTA_3130: no se pudo asegurar la 3130 en la org %.', c_org;
  end if;
  update public.chart_of_accounts
     set requiere_tercero = true, updated_at = now()
   where organization_id = c_org and account_code = '3130' and requiere_tercero is distinct from true;
  if not exists (select 1 from public.chart_of_accounts
                  where organization_id = c_org and account_code = '3130'
                    and es_movimiento is true and is_active is true and type = 'equity' and naturaleza = 'credito') then
    raise exception 'CUENTA_3130: la 3130 de la org % no quedó de movimiento, patrimonio y naturaleza crédito.', c_org;
  end if;

  -- 4. Un asiento por hecho.
  for v_h in
    select * from (values
      -- (orden, fact_key, sesión enlazada, fecha, monto, débito, tercero_débito?, crédito, tercero_crédito?, nota)
      (1, 'cierre_caja_v2:base_apertura:25', 25, v_s25.opened_at, 150000::numeric,
          '1105', false, '3130', true,
          'Aporte del propietario: base de apertura de la caja · sesión 25 · 10-nov'),
      (2, 'cierre_caja_v2:sobrante_cruce:25', 25, v_s25.closed_at, 374450::numeric,
          '41359501', false, '3130', true,
          'Sobrante del cierre del 10-nov no es venta: es la misma plata de la posible consignación (372.450 + 2.000) · se cruza con el retiro del propietario por legalizar · sesión 25'),
      (3, 'cierre_caja_v2:salida:25:26:consignacion', 25, v_s25.closed_at, 372450::numeric,
          '3130', true, '1105', false,
          'Retiro del propietario · por legalizar · Posible consignación 10-nov · por legalizar · entre el cierre de la sesión 25 y la apertura de la 26 · si aparece el extracto se reclasifica de la 3130 a la 1110'),
      (4, 'cierre_caja_v2:salida:25:26:sin_soporte', 25, v_s25.closed_at, 2000::numeric,
          '3130', true, '1105', false,
          'Retiro del propietario · por legalizar · entre el cierre de la sesión 25 y la apertura de la 26'),
      (5, 'cierre_caja_v2:salida:29:30', 29, v_s29.closed_at, 521800::numeric,
          '3130', true, '1105', false,
          'Retiro del propietario · por legalizar · entre el cierre de la sesión 29 y la apertura de la 30'),
      (6, 'cierre_caja_v2:salida:39:43', 39, v_s39.closed_at, 330400::numeric,
          '3130', true, '1105', false,
          'Retiro del propietario · por legalizar · entre el cierre de la sesión 39 y la apertura de la 43 (base de la 43 corregida a 89.100)'),
      (7, 'cierre_caja_v2:base_corregida:43', 43, v_s43.closed_at, 50100::numeric,
          '41359501', false, '1105', false,
          'Corrección de la base de apertura de la sesión de caja 43: era 89.100, no 39.000 · no es sobrante · nota del cajero al cerrar la sesión 43: «ERRO AL ABRIR LA CAJA» · el Contador (2026-11-25) aceptó como soporte esa nota, el cuadre exacto (con base 89.100 el esperado da 94.700 = contado) y que no hubo movimientos entre el cierre de la sesión 39 y la apertura de la 43'),
      (8, 'cierre_caja_v2:entrada:43:44', 43, v_s43.closed_at, 1000::numeric,
          '1105', false, '3130', true,
          'Aporte del propietario · entrada a la caja sin soporte · por legalizar · entraron 1.000 entre el cierre de la sesión 43 y la apertura de la 44'),
      (9, 'cierre_caja_v2:salida:44:46', 44, v_s44.closed_at, 200::numeric,
          '3130', true, '1105', false,
          'Retiro del propietario · por legalizar · entre el cierre de la sesión 44 y la apertura de la 46')
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

  -- 5. La caja tiene que quedar igual al último arqueo (172.000). Si hay una sesión abierta, se
  --    excluye lo que ella opere (los ajustes de hoy y estos asientos sí cuentan).
  select s.opened_at into v_abierta from public.cash_sessions s
   where s.organization_id = c_org and s.status = 'open' order by s.opened_at limit 1;
  select coalesce(sum(l.debit - l.credit), 0) into v_saldo
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = c_org and e.posted is true and l.account_code = '1105'
     and (v_abierta is null or e.entry_date < v_abierta
          or e.fact_key like 'vueltas_recaudo:%' or e.fact_key like 'recaudo_1305_tercero:%'
          or e.fact_key like 'cierre_caja_v2:%');
  if v_saldo <> 172000 then
    raise exception 'CAJA_NO_CUADRA: la 1105 quedaría en % y el último arqueo es 172.000.', v_saldo;
  end if;
  -- 6. Ninguno de estos asientos toca 42958101 ni 539595*, ni 133015/1325/2380.
  if exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
              where e.organization_id = c_org and e.fact_key like 'cierre_caja_v2:%'
                and (l.account_code = '42958101' or l.account_code like '539595%'
                     or l.account_code in ('133015', '1325', '2380'))) then
    raise exception 'CUENTA_INDEBIDA: un asiento cierre_caja_v2 tocó 42958101, 539595, 133015, 1325 o 2380.';
  end if;

  raise notice 'Cierre de caja org % (persona natural): % asientos; 1105 = %.', c_org, v_n, v_saldo;
end
$cierre_377$;
