-- PROPUESTA — NO APLICAR sin el visto bueno del Contador.
-- GO-contabilidad · Salidas de efectivo entre cierres y aperturas de la caja (org 377)
--
-- Instrucción del Contador (2026-11-25): «Los $1.275.950 que salieron entre cierres: no los registres
-- a ciegas. Necesito saber a dónde fue la plata: una consignación al banco, un traslado a otra caja o
-- un retiro del dueño. Con el soporte de cada salida, el asiento es crédito 1105 contra 1110 (bancos),
-- 1105 de la otra caja o 2380 (cuentas por pagar al socio), según el caso. Lo que no tenga soporte me
-- lo pasas en una lista por fecha y caja.»
--
-- La org 377 tiene una sola sucursal, una sola caja (sin cuenta propia: todo va a la 1105) y ninguna
-- cuenta bancaria registrada (bank_accounts, bank_transactions, bank_transfers y extractos vacíos).
-- cash_movements solo tiene la devolución 9 de la sesión 43 (ya contabilizada). No hay retiros,
-- consignaciones ni traslados registrados. El único soporte es una nota escrita en un cierre.
--
-- Diferencias entre el efectivo contado al cerrar y la base declarada al abrir la siguiente sesión:
--   Cierre sesión 25 (10-nov, 19:16 Bogotá) 524.450 → apertura sesión 26 (11-nov) 150.000 : sale   374.450
--   Cierre sesión 29 (14-nov, 18:34)        634.800 → apertura sesión 30 (15-nov) 113.000 : sale   521.800
--   Cierre sesión 39 (21-nov, 19:05)        419.500 → apertura sesión 43 (21-nov, 20:42) 39.000 : sale 380.500
--   Cierre sesión 43 (22-nov, 17:45)         94.700 → apertura sesión 44 (23-nov)  95.700 : ENTRA   1.000
--   Cierre sesión 44 (23-nov, 18:57)        172.200 → apertura sesión 46 (24-nov) 172.000 : sale       200
--   Neto que salió: 374.450 + 521.800 + 380.500 + 200 − 1.000 = 1.275.950.
--
-- CON SOPORTE (solo uno, y parcial):
--   Sesión 25 → 26: la nota del arqueo de cierre de la sesión 25 dice «se consignó en la cuenta
--   372.450». Asiento propuesto: Dr 1110 / Cr 1105 por 372.450, fecha del cierre de la sesión 25,
--   enlazado a la sesión 25 (source cash_sessions / 25). Los 2.000 restantes de esa salida no tienen
--   soporte. OJO: la nota es el único soporte; no hay consignación ni extracto en el sistema, y la org
--   no tiene la cuenta bancaria creada (va a la 1110 general). Pedir el comprobante de consignación.
--
-- SIN SOPORTE (para preguntar a Juan): 2.000 (s25→s26), 521.800 (s29→s30), 380.500 (s39→s43),
--   200 (s44→s46) y la entrada de 1.000 (s43→s44). Cuando Juan diga a dónde fue cada una, se agrega
--   una fila a «salidas» con la contrapartida (1110, 1105 o 2380 con el tercero del socio).
--
-- Resultado del seco (2026-11-25, BEGIN … ROLLBACK): 1 asiento NA, Dr 1110 372.450 / Cr 1105 372.450;
--   1105 pasaría de 1.297.950 a 925.500; 1110 de 479.200 a 851.650. Sin errores de período (noviembre
--   abierto), de cuenta de movimiento ni de tercero.
--
-- Idempotente: fact_key salida_caja:<sesión que cerró>:<sesión que abrió>:<cuenta>.
-- Reversión: al final del archivo (bloque comentado).

DO $salidas$
declare
  v_s record;
  v_c record;
  v_memo text;
  v_entry integer;
  v_n integer := 0;
  v_total numeric := 0;
begin
  for v_s in
    select x.*, c.branch_id, c.closed_at, c.final_amount, a.initial_amount
      from (values
        -- (sesión que cerró, sesión que abrió, monto, contrapartida, tercero_nit, tercero_nombre, soporte)
        (25, 26, 372450::numeric, '1110', null::text, null::text,
         'nota del arqueo de cierre de la sesión 25: «se consignó en la cuenta 372.450»')
        -- Pendientes de Juan (descomentar con la contrapartida que él indique):
        -- ,(25, 26,   2000::numeric, '????', null, null, '…')
        -- ,(29, 30, 521800::numeric, '????', null, null, '…')
        -- ,(39, 43, 380500::numeric, '????', null, null, '…')
        -- ,(44, 46,    200::numeric, '????', null, null, '…')
      ) as x(ses_cierre, ses_apertura, monto, contrapartida, nit, nombre, soporte)
      join public.cash_sessions c on c.id = x.ses_cierre and c.organization_id = 377 and c.status = 'closed'
      join public.cash_sessions a on a.id = x.ses_apertura and a.organization_id = 377
  loop
    -- La salida no puede superar lo que de verdad faltó entre el cierre y la apertura.
    if v_s.monto <= 0 or v_s.monto > v_s.final_amount - v_s.initial_amount then
      raise exception 'SALIDA_INVALIDA: % entre la sesión % y la % supera la diferencia (% − %).',
        v_s.monto, v_s.ses_cierre, v_s.ses_apertura, v_s.final_amount, v_s.initial_amount;
    end if;
    if v_s.contrapartida not in ('1110', '1105', '2380') and v_s.contrapartida not like '1110%'
       and v_s.contrapartida not like '1105%' and v_s.contrapartida not like '2380%' then
      raise exception 'CONTRAPARTIDA_INVALIDA: %', v_s.contrapartida;
    end if;
    continue when exists (
      select 1 from public.journal_entries e
       where e.organization_id = 377
         and e.fact_key = 'salida_caja:' || v_s.ses_cierre || ':' || v_s.ses_apertura || ':' || v_s.contrapartida);

    v_memo := case
      when v_s.contrapartida like '1110%' then 'Consignación del efectivo de la caja'
      when v_s.contrapartida like '2380%' then 'Retiro del socio del efectivo de la caja'
      else 'Traslado del efectivo a otra caja' end
      || ' · entre el cierre de la sesión ' || v_s.ses_cierre || ' y la apertura de la ' || v_s.ses_apertura
      || ' · soporte: ' || v_s.soporte;

    select c.numero, c.prefijo into v_c
      from public.fn_tomar_consecutivo_comprobante(377, 'nota_contable', 'NA') c;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key,
      comprobante_tipo, comprobante_prefijo, comprobante_numero
    ) values (
      377, v_s.branch_id, v_s.closed_at, left(v_memo, 500), 'cash_sessions', v_s.ses_cierre::text, true, null,
      'salida_caja:' || v_s.ses_cierre || ':' || v_s.ses_apertura || ':' || v_s.contrapartida,
      'nota_contable', v_c.prefijo, v_c.numero
    ) returning id into v_entry;

    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
    values (v_entry, v_s.contrapartida, left(v_memo, 500), v_s.monto, 0, v_s.nit, v_s.nombre);
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry, '1105', left(v_memo, 500), 0, v_s.monto);

    v_n := v_n + 1;
    v_total := v_total + v_s.monto;
  end loop;
  raise notice 'Salidas de caja registradas: % asientos por %.', v_n, v_total;
end
$salidas$;

-- ─── Reversión (no ejecutar salvo orden del Contador) ────────────────────────
-- DO $borrar$
-- begin
--   perform set_config('app.contabilidad_mantenimiento', 'on', true);
--   delete from public.journal_lines l using public.journal_entries e
--    where l.journal_entry_id = e.id and e.organization_id = 377 and e.fact_key like 'salida_caja:%';
--   delete from public.journal_entries e where e.organization_id = 377 and e.fact_key like 'salida_caja:%';
--   perform set_config('app.contabilidad_mantenimiento', '', true);
-- end
-- $borrar$;
