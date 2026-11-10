-- Pruebas en seco 31 · Cartera: un pago a una factura de venta con nota crédito ya no le devuelve el valor de la nota al
-- saldo (migración 20261110160000_saldo_factura_pago_resta_notas_credito, ESCRITA, NO APLICADA).
--   El error: fn_recalc_invoice_balance_from_payments (disparador de payments) calculaba total − pagado sin restar las
--   notas crédito; fn_factura_venta_recalcular_saldo (la de las notas) sí las resta. La migración hace que la rama de
--   ventas delegue en esta última; la rama de compras queda igual.
--   Se construyen las MISMAS facturas de control dos veces en la misma transacción: mundo A con la función aplicada hoy
--   y mundo B con la migración. Luego se ejecuta la reversión, se comprueba el md5 de hoy y se construye el mundo A2,
--   que debe ser idéntico al A (salvo C8, donde la función de hoy no es determinista: ver R3). Facturas de control: C1 sin pagos, C2 pago parcial, C3 pago total, C4 nota crédito y
--   luego pago, C4b nota, pago y el pago falla, C4c nota y luego abono por cartera, C5 pago y luego nota, C6 anulada
--   (con un pago que falla después), C7 borrador con pago, C8 venta POS: factura y nota de devolución con el mismo
--   sale_id y luego pago de origen «sale». Solo deben cambiar los casos «nota crédito y luego pago» (C4, C4b, C4c, C8).
-- Fecha: 2026-11-10 · Proyecto taqjemqjtumhwptchcxk · SOLO org 374 (sucursal 585). De las demás organizaciones solo LEE
-- las facturas (saldo frente a total − pagado − notas).
--
-- NO DEJA DATOS: una sola transacción que termina con una excepción (= rollback); el resultado sale en su mensaje.
-- CARGA, completas y exactas, las migraciones SIN APLICAR en orden de versión (la misma cadena de la prueba 30, más
-- 20261110150000) y después la de esta prueba:
--   · las ya versionadas se leen del repositorio público en el commit 75e301ff7c8578ecbc3a45258e0cfdd2e0ebd1f0 (extensión
--     http, lectura sin estado) y se comprueba su md5 contra el del archivo en disco antes de ejecutarlas;
--   · la migración 20261110160000 y su reversión van COMPLETAS dentro de este archivo (no están en el repositorio remoto)
--     y se comprueba su md5 contra el del disco antes de usarlas.
-- Resultado: 31_cartera_pago_tras_nota_credito.resultado.txt

begin;
-- El día de la prueba es el de la organización (America/Bogota): current_date no depende de la hora UTC de la corrida.
set local timezone to 'America/Bogota';

-- ════ AYUDAS (solo esta sesión) ════════════════════════════════════════════════════════════════════════════
create temp table r (n serial primary key, prueba text default current_setting('dry.prueba', true), caso text, verificacion text, esperado text,
                     obtenido text, ok boolean);
create temp table bitacora (n serial primary key, prueba text default current_setting('dry.prueba', true), linea text);
create function pg_temp.log(m text) returns void language sql as $$ insert into bitacora (linea) values (m) $$;
create function pg_temp.chk(caso text, esperado text, obtenido text) returns void language sql as $$
  insert into r (caso, verificacion, esperado, obtenido, ok) values (split_part(caso, ' ', 1), caso, esperado, obtenido, coalesce(obtenido = esperado, false))
$$;
create function pg_temp.fmt(x numeric) returns text language sql immutable as $$ select coalesce(round(x, 2)::text, 'null') $$;
create function pg_temp.def_md5(f text) returns text language sql as $$ select md5(pg_get_functiondef(f::regprocedure)) $$;
-- La rama de compras de la función del disparador: desde «IF r.src IN ('invoice_purchase'…» hasta su «CONTINUE; END IF;».
create function pg_temp.rama_compras() returns text language sql as $$
  select substring(d from position('IF r.src IN (''invoice_purchase'', ''account_payable'') THEN' in d)
                   for position(E'      CONTINUE;\n    END IF;' in d) - position('IF r.src IN (''invoice_purchase'', ''account_payable'') THEN' in d) + 27)
    from pg_get_functiondef('public.fn_recalc_invoice_balance_from_payments()'::regprocedure) d $$;

-- ════ CARGA: las migraciones SIN APLICAR, COMPLETAS y EXACTAS, en orden de versión ════════════════════════════
select set_config('dry.prueba', 'carga', true);
create temp table carga (n int primary key, archivo text, md5 text, ejecutar boolean, texto text);
insert into carga (n, archivo, md5, ejecutar) values
  (1, '20261108120500_organization_links', '6a5a3ead2fe311fdde4b7d5c0376c12b', true),
  (2, '20261108121000_consignaciones', '9179856af861a2a886152c1ebbb4f2fd', true),
  (3, '20261108140500_responsabilidades_fiscales_en', '4b00bf10bf99ff2a97e2e89ff0480811', true),
  (4, '20261108160000_tributario_catalogo_rut_y_codigos_fe', '85fd17321a7e85d85a58916cb2f84c95', true),
  (5, '20261108160500_tributario_perfil_renta_iva', 'a3e330a9cf7b01c6da242b7d3f3a2b8c', true),
  (6, '20261108165000_tarifas_precision_exacta', '1ec6641bdf74dfc15163d0753982309f', true),
  (7, '20261108170000_anticipos_proveedores_contador', '3fe4535a0afe9dc1fa58ece1dea5363d', true),
  (8, '20261110100000_cartera_abono_retencion_consignacion', '9f4ade93850013b4cacd3c795ef8d823', true),
  (9, '20261110150000_asiento_por_lineas_reparto_por_base', 'f19d51b97cea4c56a57ae96279a49a7d', true);
-- La migración de esta prueba y su reversión, completas (se ejecutan más abajo, en su momento).
insert into carga (n, archivo, md5, ejecutar, texto) values
  (10, '20261110160000_saldo_factura_pago_resta_notas_credito', '8570b3034c07e8c260cb5fd5494eb108', false, $archivo31$-- Cartera · un pago a una factura de venta con nota crédito ya no le devuelve el valor de la nota al saldo.
--
-- ESTADO: ESCRITA, NO APLICADA (20261110160000). Se aplica por el MCP cuando el dueño lo ordene. Va después de
-- 20261110150000; no depende de ninguna migración sin aplicar y es compatible con 20261110100000 (que reemplaza
-- fn_invoice_sales_paid y fn_excedente_nota_credito): esta solo LLAMA a fn_invoice_sales_paid, a través de
-- fn_factura_venta_recalcular_saldo, sea cual sea su versión. Reversión:
-- supabase/rollbacks/20261110160000_saldo_factura_pago_resta_notas_credito_rollback.sql (restaura EXACTAMENTE la
-- definición de hoy). Prueba en seco: docs/contador/pruebas/31_cartera_pago_tras_nota_credito.sql.
--
-- El error (latente). fn_recalc_invoice_balance_from_payments (disparador trg_recalc_invoice_balance_from_payments de
-- payments) calculaba el saldo de una factura de venta como total − pagado, SIN restar las notas crédito, mientras que
-- fn_factura_venta_recalcular_saldo (la que usan las notas crédito, los saldos a favor aplicados y los abonos) resta
-- fn_invoice_sales_acreditado. Si a una factura con nota crédito le llegaba un pago DESPUÉS de la nota, su saldo y su
-- estado quedaban inflados en el valor de la nota, y la cartera (accounts_receivable, que sigue a la factura por
-- tr_update_account_receivable → create_account_receivable) también. A 2026-11-10 hay 0 facturas afectadas (SELECT
-- por el MCP: 258 facturas, ninguna nota crédito; todas con saldo = total − pagado − notas): no hay datos que reparar.
--
-- Diseño elegido: la rama de VENTAS delega en fn_factura_venta_recalcular_saldo (una sola fórmula de saldo y estado
-- para la factura de venta, CLAUDE.md regla 7). La rama de COMPRAS queda idéntica, byte a byte.
-- Diferencias entre las dos funciones (estudiadas sobre las definiciones aplicadas, leídas por el MCP el 2026-11-10) y
-- qué se hizo con cada una:
--   · Notas crédito: el saldo pasa a ser total − pagado − notas vivas (lo que se corrige).
--   · Estado sin pagos: la vieja devolvía a «issued» una factura «partial»/«paid» cuando su pago se anulaba aunque
--     tuviera nota crédito (saldo = total); la nueva la deja «partial»/«paid» por la nota (igual que hace la nota).
--   · Borrador: la vieja no tocaba los borradores; fn_factura_venta_recalcular_saldo sí les escribiría el saldo (sin
--     cambiar el estado). Se conserva el filtro previo (draft, void, voided): un pago a un borrador sigue sin tocarlo.
--   · Anulada: «void» queda fuera en las dos. «cancelled» y «voided» no existen (invoice_sales_status_check solo admite
--     draft, issued, paid, partial, void); la función de notas también las excluye.
--   · La nota crédito misma: fn_factura_venta_recalcular_saldo no recalcula documentos credit_note. La vieja sí podía
--     hacerlo: un pago de origen «sale» buscaba la factura con «WHERE sale_id = … LIMIT 1», y las notas crédito del POS
--     (procesar_devolucion, pos_anular_venta_v1) llevan el MISMO sale_id que su factura. Si la consulta devolvía la nota,
--     la vieja le cambiaba el estado (issued → paid) y la factura solo se arreglaba de rebote por el disparador de la
--     nota. Delegar sin más dejaría ese pago SIN recalcular la factura; por eso la búsqueda por venta excluye las notas
--     crédito y es determinista: prefiere la factura no anulada y, entre varias, la primera creada.
--   · Lo pagado: las dos usan fn_invoice_sales_paid (pagos de los tres orígenes, descuento de cartera y saldo a favor
--     aplicado; con 20261110100000, también los abonos por retención aplicados).
-- Cartera: no se escribe a mano. fn_factura_venta_recalcular_saldo actualiza balance/status de la factura solo si
-- cambian, y tr_update_account_receivable lleva ese saldo y estado a accounts_receivable, igual que antes.
-- CREATE OR REPLACE conserva el ACL (hoy: EXECUTE solo para postgres y service_role; ni anon ni authenticated) y el
-- disparador.
--
-- Definición que reemplaza (pg_get_functiondef leído por el MCP el 2026-11-10):
--   fn_recalc_invoice_balance_from_payments()  md5 766dcc160a61fd0469a4c7633c6b70c6 (APLICADA)
-- Funciones que usa, sin cambiarlas: fn_factura_venta_recalcular_saldo(uuid) md5 aaed3eee3cc38b60e6ae717544f83eac.

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_balance_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_total numeric;
  v_balance numeric;
  v_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      -- Compras (F1.1): neto a pagar (total − retenciones) − pagado de los dos
      -- orígenes, con descuento (D4, D5).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
    ELSE
      -- Venta POS: su factura, nunca una nota crédito de la misma venta (devolución o
      -- anulación llevan el mismo sale_id). La no anulada primero; entre varias, la primera.
      SELECT id INTO v_invoice_id
      FROM invoice_sales
      WHERE sale_id = r.sid::uuid
        AND COALESCE(document_type, 'invoice') <> 'credit_note'
      ORDER BY (status = 'void'), created_at, id
      LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    -- Un pago no toca borradores ni anuladas (como antes).
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    -- Saldo y estado con la misma fórmula que las notas crédito, los saldos a favor
    -- y los abonos: total − pagado − notas crédito vivas. La cartera sigue a la
    -- factura por tr_update_account_receivable.
    PERFORM fn_factura_venta_recalcular_saldo(v_invoice_id);
  END LOOP;

  RETURN NULL;
END;
$function$;
$archivo31$),
  (11, '20261110160000_saldo_factura_pago_resta_notas_credito_rollback', '2a699e7650166d924390d3883499a6e3', false, $archivo31$-- Reversión de 20261110160000_saldo_factura_pago_resta_notas_credito.sql.
--
-- Restaura EXACTAMENTE la definición que la migración reemplazó:
--   fn_recalc_invoice_balance_from_payments()  pg_get_functiondef leído por el MCP el 2026-11-10,
--                                              md5 766dcc160a61fd0469a4c7633c6b70c6
-- (la prueba 31 comprueba el md5 después de revertir). CREATE OR REPLACE conserva el ACL y el disparador
-- trg_recalc_invoice_balance_from_payments de payments, que no se toca.
--
-- Datos: no revierte saldos. Las facturas que se recalcularon con la versión nueva (las que tienen nota crédito y
-- recibieron un pago) conservan su saldo correcto hasta su próximo pago; ese pago las recalcula otra vez con la fórmula
-- anterior (total − pagado, sin restar las notas).

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_balance_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_new_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      -- Compras (F1.1): neto a pagar (total − retenciones) − pagado de los dos
      -- orígenes, con descuento (D4, D5).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
    ELSE
      SELECT id INTO v_invoice_id FROM invoice_sales WHERE sale_id = r.sid::uuid LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    v_paid := fn_invoice_sales_paid(v_invoice_id);
    v_balance := GREATEST(v_total - v_paid, 0);

    v_new_status := v_status;
    IF v_paid > 0 THEN
      v_new_status := CASE WHEN v_balance = 0 THEN 'paid' ELSE 'partial' END;
    ELSIF v_status IN ('paid', 'partial') THEN
      -- Se anularon todos los pagos: la factura vuelve a estar solo emitida.
      v_new_status := 'issued';
    END IF;

    UPDATE invoice_sales
    SET balance = v_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice_id
      AND (balance IS DISTINCT FROM v_balance OR status IS DISTINCT FROM v_new_status);
  END LOOP;

  RETURN NULL;
END;
$function$
;
$archivo31$);
do $carga$
declare m record; s text;
begin
  for m in select * from carga order by n loop
    s := coalesce(m.texto, (select h.content from public.http_get(
           'https://raw.githubusercontent.com/Palomo-dev/go-admin-erp/75e301ff7c8578ecbc3a45258e0cfdd2e0ebd1f0/supabase/migrations/'
           || m.archivo || '.sql') h where h.status = 200));
    perform pg_temp.chk('md5 ' || m.archivo, m.md5, md5(s));
    if s is null or md5(s) <> m.md5 then raise exception 'carga: md5 de % distinto', m.archivo; end if;
    update carga set texto = s where n = m.n;
    if m.ejecutar then
      execute s;
    end if;
  end loop;
end $carga$;
-- Texto exacto de un archivo de la carga (md5 comprobado otra vez), para ejecutarlo dentro de la prueba.
create function pg_temp.archivo(a text) returns text language plpgsql as $$
declare m record;
begin
  select * into m from carga where archivo = a;
  if m.texto is null or md5(m.texto) <> m.md5 then raise exception 'archivo: md5 de % distinto', a; end if;
  return m.texto;
end $$;

-- ════ CUERPO: 31 ════
select set_config('dry.prueba', '31', true);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── B0 · La base hoy (todas las organizaciones, solo LECTURA): no hay facturas afectadas que reparar ─────────────────
do $b31$
begin
  perform pg_temp.chk('B0 facturas de venta de la base con saldo distinto de total − pagado − notas crédito (no borrador, no anulada) · con nota crédito',
    '0 · 0',
    (select count(*)::text from invoice_sales i
      where coalesce(i.document_type, 'invoice') <> 'credit_note' and i.status not in ('draft', 'void')
        and i.balance is distinct from greatest(i.total - fn_invoice_sales_paid(i.id) - fn_invoice_sales_acreditado(i.id), 0))
    || ' · ' ||
    (select count(*)::text from invoice_sales i
      where coalesce(i.document_type, 'invoice') <> 'credit_note' and fn_invoice_sales_acreditado(i.id) > 0));
  perform pg_temp.log('B0: ' || (select count(*) from invoice_sales where coalesce(document_type, 'invoice') <> 'credit_note')
    || ' facturas de venta en la base (todas las organizaciones) · ' || (select count(*) from invoice_sales where document_type = 'credit_note')
    || ' notas crédito');
end $b31$;

-- ── M0 · Antes de la migración (con la cadena sin aplicar ya cargada) ───────────────────────────────────────────────
do $m0$
begin
  perform pg_temp.chk('M0 hoy: el disparador de payments y la función de las notas están como se aplicaron (md5 de pg_get_functiondef)',
    '766dcc160a61fd0469a4c7633c6b70c6 · aaed3eee3cc38b60e6ae717544f83eac',
    pg_temp.def_md5('public.fn_recalc_invoice_balance_from_payments()') || ' · ' || pg_temp.def_md5('public.fn_factura_venta_recalcular_saldo(uuid)'));
  perform pg_temp.chk('M0b fn_invoice_sales_paid es la de 20261110100000 (no la aplicada hoy)', 'true',
    (pg_temp.def_md5('public.fn_invoice_sales_paid(uuid)') <> '4c772ca4a7d6926ce091a7910ea4e1d7'
     and pg_get_functiondef('public.fn_invoice_sales_paid(uuid)'::regprocedure) like '%fn_invoice_sales_retenciones_abonadas%')::text);
  perform set_config('d31.paid_md5', pg_temp.def_md5('public.fn_invoice_sales_paid(uuid)'), true);
  perform set_config('d31.compras', pg_temp.rama_compras(), true);
  perform pg_temp.log('M0: md5 de fn_invoice_sales_paid con 20261110100000 cargada: ' || current_setting('d31.paid_md5'));
end $m0$;

-- ── Facturas de control ──────────────────────────────────────────────────────────────────────────────────────────
create temp table ctl (mundo text, caso text, id uuid, nc uuid, venta uuid, primary key (mundo, caso));
create temp table foto (mundo text, caso text, total numeric, saldo numeric, estado text, cartera_saldo numeric, cartera_estado text,
                        nota text, pagado numeric, acreditado numeric, primary key (mundo, caso));
do $d31$
declare u uuid := (select owner_user_id from organizations where id = 374); b uuid;
begin
  insert into customers (organization_id, first_name, last_name) values (374, 'Cliente', 'Control 31') returning id into b;
  perform set_config('d31.u', u::text, true);
  perform set_config('d31.cliente', b::text, true);
end $d31$;

create function pg_temp.factura(p_mundo text, p_caso text, p_emitir boolean default true, p_venta uuid default null) returns uuid language plpgsql as $$
declare f uuid := gen_random_uuid();
begin
  insert into invoice_sales (id, organization_id, branch_id, status, customer_id, sale_id)
  values (f, 374, 585, 'draft', current_setting('d31.cliente')::uuid, p_venta);
  insert into invoice_items (invoice_id, invoice_type, invoice_sales_id, description, qty, unit_price, tax_rate, total_line)
  values (f, 'sale', f, 'Servicio de control 31', 1, 100000, 19, 119000);
  if p_emitir then
    update invoice_sales set status = 'issued' where id = f;
  end if;
  insert into ctl (mundo, caso, id, venta) values (p_mundo, p_caso, f, p_venta);
  return f;
end $$;
create function pg_temp.pago(p_src text, p_sid uuid, p_monto numeric) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into payments (organization_id, branch_id, source, source_id, method, amount, currency, status, created_by, payment_date)
  values (374, 585, p_src, p_sid::text, 'transfer', p_monto, 'COP', 'completed', current_setting('d31.u')::uuid, now())
  returning id into v;
  return v;
end $$;
-- Nota crédito emitida por la mitad (59.500), como la insertan fn_nota_credito_emitir y procesar_devolucion (esta,
-- con el sale_id de la venta).
create function pg_temp.nota(p_mundo text, p_caso text, p_factura uuid, p_venta uuid default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('app.asiento_por_lineas', 'on', true);
  insert into invoice_sales (organization_id, branch_id, customer_id, sale_id, status, document_type, related_invoice_id,
                             subtotal, tax_total, total, balance)
  values (374, 585, current_setting('d31.cliente')::uuid, p_venta, 'issued', 'credit_note', p_factura, -50000, -9500, -59500, 0)
  returning id into v;
  perform set_config('app.asiento_por_lineas', '', true);
  update ctl set nc = v where mundo = p_mundo and caso = p_caso;
  return v;
end $$;
create function pg_temp.escenario(m text) returns void language plpgsql as $$
declare f uuid; p uuid; v uuid;
begin
  perform pg_temp.factura(m, 'C1');                                                   -- sin pagos
  f := pg_temp.factura(m, 'C2'); perform pg_temp.pago('invoice_sales', f, 50000);      -- pago parcial
  f := pg_temp.factura(m, 'C3'); perform pg_temp.pago('invoice_sales', f, 119000);     -- pago total
  f := pg_temp.factura(m, 'C4'); perform pg_temp.nota(m, 'C4', f);                     -- nota y luego pago
  perform pg_temp.pago('invoice_sales', f, 30000);
  f := pg_temp.factura(m, 'C4b'); perform pg_temp.nota(m, 'C4b', f);                   -- nota, pago y el pago falla
  p := pg_temp.pago('invoice_sales', f, 30000);
  update payments set status = 'failed' where id = p;
  f := pg_temp.factura(m, 'C4c'); perform pg_temp.nota(m, 'C4c', f);                   -- nota y luego abono por cartera
  perform pg_temp.pago('account_receivable', (select ar.id from accounts_receivable ar where ar.invoice_id = f), 30000);
  f := pg_temp.factura(m, 'C5'); perform pg_temp.pago('invoice_sales', f, 30000);      -- pago y luego nota
  perform pg_temp.nota(m, 'C5', f);
  f := pg_temp.factura(m, 'C6'); p := pg_temp.pago('invoice_sales', f, 20000);         -- anulada; su pago falla después
  update invoice_sales set status = 'void' where id = f;
  update payments set status = 'failed' where id = p;
  f := pg_temp.factura(m, 'C7', false); perform pg_temp.pago('invoice_sales', f, 50000); -- borrador con pago
  insert into sales (organization_id, branch_id, user_id, status, customer_id)          -- venta POS con devolución
  values (374, 585, current_setting('d31.u')::uuid, 'pending', current_setting('d31.cliente')::uuid) returning id into v;
  f := pg_temp.factura(m, 'C8', true, v); perform pg_temp.nota(m, 'C8', f, v);
  perform pg_temp.pago('sale', v, 30000);
  insert into foto
  select c.mundo, c.caso, i.total, i.balance, i.status, ar.balance, ar.status,
         (select n.status from invoice_sales n where n.id = c.nc),
         fn_invoice_sales_paid(c.id), fn_invoice_sales_acreditado(c.id)
    from ctl c join invoice_sales i on i.id = c.id
    left join lateral (select a.balance, a.status from accounts_receivable a where a.invoice_id = c.id order by a.created_at limit 1) ar on true
   where c.mundo = m;
end $$;
-- Una factura de control en una línea: saldo · estado · cartera saldo/estado · estado de su nota.
create function pg_temp.linea(m text, c text) returns text language sql as $$
  select pg_temp.fmt(f.saldo) || ' · ' || f.estado || ' · ' || coalesce(pg_temp.fmt(f.cartera_saldo) || '/' || f.cartera_estado, 'sin cartera')
         || ' · nota ' || coalesce(f.nota, '-')
    from foto f where f.mundo = m and f.caso = c $$;

-- ── Mundo A: con la función aplicada hoy ─────────────────────────────────────────────────────────────────────────
select pg_temp.escenario('A');

-- ── La migración, exacta ─────────────────────────────────────────────────────────────────────────────────────────
do $m1$
begin
  execute pg_temp.archivo('20261110160000_saldo_factura_pago_resta_notas_credito');
  perform set_config('d31.nueva_md5', pg_temp.def_md5('public.fn_recalc_invoice_balance_from_payments()'), true);
  perform pg_temp.chk('M1 con la migración: la función del disparador cambia; la de las notas y fn_invoice_sales_paid (la de 20261110100000) no',
    'true · aaed3eee3cc38b60e6ae717544f83eac · true',
    (current_setting('d31.nueva_md5') <> '766dcc160a61fd0469a4c7633c6b70c6')::text || ' · '
      || pg_temp.def_md5('public.fn_factura_venta_recalcular_saldo(uuid)') || ' · '
      || (pg_temp.def_md5('public.fn_invoice_sales_paid(uuid)') = current_setting('d31.paid_md5'))::text);
  perform pg_temp.chk('M2 la rama de compras queda idéntica, byte a byte', 'true · true',
    (pg_temp.rama_compras() = current_setting('d31.compras'))::text || ' · ' || (length(current_setting('d31.compras')) > 500)::text);
  perform pg_temp.chk('M3 el disparador de payments sigue siendo el mismo y apunta a la función; el ACL no cambia',
    '1 · {postgres=X/postgres,service_role=X/postgres}',
    (select count(*)::text from pg_trigger where tgname = 'trg_recalc_invoice_balance_from_payments'
       and tgrelid = 'public.payments'::regclass and tgfoid = 'public.fn_recalc_invoice_balance_from_payments()'::regprocedure) || ' · '
      || (select proacl::text from pg_proc where oid = 'public.fn_recalc_invoice_balance_from_payments()'::regprocedure));
  perform pg_temp.log('M1: md5 de la función nueva: ' || current_setting('d31.nueva_md5'));
end $m1$;

-- ── Mundo B: con la migración ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.escenario('B');

do $c31$
declare x record;
begin
  perform pg_temp.chk('D1 casos que cambian de A (hoy) a B (migración): solo «nota crédito y luego pago»', 'C4,C4b,C4c,C8',
    (select string_agg(a.caso, ',' order by a.caso) from foto a join foto b on b.caso = a.caso and b.mundo = 'B'
      where a.mundo = 'A' and pg_temp.linea('A', a.caso) is distinct from pg_temp.linea('B', a.caso)));
  perform pg_temp.chk('D2 los demás (sin pagos, parcial, total, pago y luego nota, anulada, borrador) quedan IDÉNTICOS', '6',
    (select count(*)::text from foto a where a.mundo = 'A' and a.caso in ('C1', 'C2', 'C3', 'C5', 'C6', 'C7')
        and pg_temp.linea('A', a.caso) = pg_temp.linea('B', a.caso)));
  perform pg_temp.chk('D3 hoy (A): facturas con saldo distinto de total − pagado − notas (el error), sin borrador ni anulada', 'C4,C4b,C4c,C8',
    (select string_agg(f.caso, ',' order by f.caso) from foto f where f.mundo = 'A' and f.estado not in ('draft', 'void')
        and f.saldo is distinct from greatest(f.total - f.pagado - f.acreditado, 0)));
  perform pg_temp.chk('D4 con la migración (B): ninguna; y la cartera sigue a la factura en todas', '0 · 0',
    (select count(*)::text from foto f where f.mundo = 'B' and f.estado not in ('draft', 'void')
        and f.saldo is distinct from greatest(f.total - f.pagado - f.acreditado, 0)) || ' · '
      || (select count(*)::text from foto f where f.mundo = 'B' and f.estado not in ('draft', 'void') and f.cartera_saldo is distinct from f.saldo));
  perform pg_temp.chk('D5 C4 nota y luego pago: A → B', '89000.00 · partial · 89000.00/partial · nota issued → 29500.00 · partial · 29500.00/partial · nota issued',
    pg_temp.linea('A', 'C4') || ' → ' || pg_temp.linea('B', 'C4'));
  perform pg_temp.chk('D6 C4b nota, pago y el pago falla: A → B (hoy vuelve a «issued» por el total)', '119000.00 · issued · 119000.00/current · nota issued → 59500.00 · partial · 59500.00/partial · nota issued',
    pg_temp.linea('A', 'C4b') || ' → ' || pg_temp.linea('B', 'C4b'));
  perform pg_temp.chk('D7 C4c nota y luego abono por cartera: A → B', '89000.00 · partial · 89000.00/partial · nota issued → 29500.00 · partial · 29500.00/partial · nota issued',
    pg_temp.linea('A', 'C4c') || ' → ' || pg_temp.linea('B', 'C4c'));
  perform pg_temp.chk('D8 C8 venta POS con nota de devolución (mismo sale_id) y luego pago de la venta: A → B', '89000.00 · partial · 89000.00/partial · nota issued → 29500.00 · partial · 29500.00/partial · nota issued',
    pg_temp.linea('A', 'C8') || ' → ' || pg_temp.linea('B', 'C8'));
  perform pg_temp.chk('D9 C5 pago y luego nota: igual en los dos mundos (ya lo resolvía la nota)', '29500.00 · partial · 29500.00/partial · nota issued',
    pg_temp.linea('B', 'C5'));
  perform pg_temp.chk('D10 C6 anulada y C7 borrador: un pago no las toca en ninguno de los dos mundos', 'void · draft · true · true',
    (select estado from foto where mundo = 'B' and caso = 'C6') || ' · ' || (select estado from foto where mundo = 'B' and caso = 'C7') || ' · '
      || (pg_temp.linea('A', 'C6') = pg_temp.linea('B', 'C6'))::text || ' · ' || (pg_temp.linea('A', 'C7') = pg_temp.linea('B', 'C7'))::text);
  perform pg_temp.chk('D11 ninguna nota crédito cambia de estado por un pago (B)', 'issued',
    (select string_agg(distinct f.nota, ',') from foto f where f.mundo = 'B' and f.nota is not null));
  for x in select a.caso from foto a where a.mundo = 'A' order by a.caso loop
    perform pg_temp.log(rpad(x.caso, 4) || ' A ' || pg_temp.linea('A', x.caso) || '  |  B ' || pg_temp.linea('B', x.caso)
      || '  (pagado ' || pg_temp.fmt((select pagado from foto where mundo = 'B' and caso = x.caso))
      || ', notas ' || pg_temp.fmt((select acreditado from foto where mundo = 'B' and caso = x.caso)) || ')');
  end loop;
end $c31$;

-- ── Idempotencia y reversión ─────────────────────────────────────────────────────────────────────────────────────
do $r31$
begin
  execute pg_temp.archivo('20261110160000_saldo_factura_pago_resta_notas_credito');
  perform pg_temp.chk('R0 aplicarla dos veces no cambia nada (mismo md5)', 'true',
    (pg_temp.def_md5('public.fn_recalc_invoice_balance_from_payments()') = current_setting('d31.nueva_md5'))::text);
  execute pg_temp.archivo('20261110160000_saldo_factura_pago_resta_notas_credito_rollback');
  perform pg_temp.chk('R1 la reversión deja la función EXACTAMENTE como está aplicada hoy (md5 de pg_get_functiondef); no toca las otras dos',
    '766dcc160a61fd0469a4c7633c6b70c6 · aaed3eee3cc38b60e6ae717544f83eac · true',
    pg_temp.def_md5('public.fn_recalc_invoice_balance_from_payments()') || ' · '
      || pg_temp.def_md5('public.fn_factura_venta_recalcular_saldo(uuid)') || ' · '
      || (pg_temp.def_md5('public.fn_invoice_sales_paid(uuid)') = current_setting('d31.paid_md5'))::text);
end $r31$;
select pg_temp.escenario('A2');
do $r31b$
begin
  perform pg_temp.chk('R2 revertida, las facturas de control se comportan como hoy: A2 idéntico a A en los 9 casos deterministas', '9',
    (select count(*)::text from foto a where a.mundo = 'A' and a.caso <> 'C8' and pg_temp.linea('A', a.caso) = pg_temp.linea('A2', a.caso)));
  -- C8 con la función de hoy NO es determinista: «WHERE sale_id = … LIMIT 1» sin ORDER BY devuelve la factura o la nota
  -- crédito de la misma venta según el orden físico. Si devuelve la factura, su saldo queda inflado (89.000); si devuelve
  -- la nota, le cambia el estado a «paid» y la factura se arregla de rebote por el disparador de la nota (29.500).
  perform pg_temp.chk('R3 C8 en A2 (función de hoy): una de sus dos salidas posibles', 'factura inflada o nota «paid»',
    case pg_temp.linea('A2', 'C8')
      when '89000.00 · partial · 89000.00/partial · nota issued' then 'factura inflada o nota «paid»'
      when '29500.00 · partial · 29500.00/partial · nota paid' then 'factura inflada o nota «paid»'
      else pg_temp.linea('A2', 'C8') end);
  perform pg_temp.chk('Z1 facturas de control de la prueba: 3 mundos × 10', '30', (select count(*)::text from ctl));
  perform pg_temp.log('A2 ' || a.caso || ': A ' || pg_temp.linea('A', a.caso) || '  |  A2 ' || pg_temp.linea('A2', a.caso))
     from foto a where a.mundo = 'A' and pg_temp.linea('A', a.caso) is distinct from pg_temp.linea('A2', a.caso);
end $r31b$;

-- ════ FINAL: el resultado sale en el mensaje de esta excepción, que además revierte todo ═══════════════════════════
reset role;
do $fin$
declare t text; v text; b text; q text := current_query(); i int; j int; dentro text;
begin
  -- Lo ejecutado, sin lo que el cliente añada antes o después: desde la primera línea de este archivo hasta el último
  -- «end $ fin $;» (escrito con chr(36) para no cerrar este bloque) más su salto de línea. Su md5 se compara con el del disco.
  i := position('-- Pruebas en seco 31 ' in q);
  j := length(q) - position(reverse('end ' || chr(36) || 'fin' || chr(36) || ';') in reverse(q)) + 1;
  dentro := substr(q, i, j - i + 1) || chr(10);
  perform pg_temp.log('lo ejecutado: md5 ' || md5(dentro) || ' (' || octet_length(dentro) || ' bytes) · el cliente añadió '
    || (i - 1) || ' caracteres antes y ' || (length(q) - j) || ' después');
  select string_agg(x.s, ' · ' order by x.p) into t
    from (select prueba p, format('%s: %s de %s ok', prueba, count(*) filter (where ok), count(*)) s from r group by prueba) x;
  select string_agg(format('%s | %s | %s | %s | %s', n, prueba, verificacion, coalesce(obtenido, 'null'),
                           case when ok then 'ok' else 'FALLA · esperado: ' || coalesce(esperado, 'null') end), chr(10) order by n) into v from r;
  select string_agg(prueba || ' › ' || linea, chr(10) order by n) into b from bitacora;
  raise exception '%', 'PRUEBA EN SECO (se revierte) · ' || coalesce(t, '-') || chr(10) || coalesce(v, '') || chr(10) || coalesce(b, '');
end $fin$;
