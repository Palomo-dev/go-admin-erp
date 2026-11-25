-- GO-pos · Venta a crédito o con saldo pendiente exige el documento del cliente
-- (instrucción del Contador, 2026-11-25, punto 1)
--
-- Instrucción, en resumen: «Mientras el cliente no tenga documento, el 222222222222 es lo correcto.
-- Desde ya, toda venta a crédito o con saldo pendiente debe pedirle el documento al cliente, porque
-- un fiado a consumidor final no se puede cobrar ni reportar bien.»
--
-- Regla: si al guardar queda saldo por cobrar (> $1, tolerancia de redondeo) y el adquiriente es
-- consumidor final (sin cliente) o un cliente sin identification_number (o con el NIT del consumidor
-- final), la base lo rechaza con `documento_requerido_credito` (detalle y pista en español; la
-- pantalla lo traduce y abre «Editar datos de facturación» para capturar el documento).
-- Las ventas de contado (pagadas completas) siguen exactamente igual.
--
-- Dónde se mira. Toda vía que deja saldo pasa por uno de estos tres documentos; el chequeo es un
-- CONSTRAINT TRIGGER diferido (al confirmar la transacción) que relee la fila: así un cobro que crea
-- la factura con saldo y la paga en la misma transacción (POS, cobro en caja de un pedido web,
-- cuenta dividida) no se rechaza por un estado intermedio.
--   · invoice_sales nace 'issued'/'partial' con saldo: POS a crédito (modo deuda), POS con pago
--     parcial o «paga al recibir», nota débito, factura del folio PMS, importación CSV, factura del
--     asistente.
--   · invoice_sales PASA a 'issued'/'partial' (desde borrador o pagada) o cambia de cliente: emisión
--     de la factura de venta manual (siempre nace con saldo; el recibo va aparte), parqueadero a
--     crédito (inserta pagada y luego la deja emitida con saldo).
--   · sales nace 'pending'/'partial' con saldo y SIN factura: venta del asistente con saldo.
--   · accounts_receivable nace con saldo sin factura ni devolución: cartera manual, parqueadero
--     a crédito sin factura.
-- Fuera de la regla (no son ventas a crédito):
--   · pedidos web: el pedido pendiente no es cartera; se factura al entregar ya pagado (y la tienda
--     con pasarela factura pagado). sales.source = 'web' pendiente queda igual.
--   · cuenta de mesa (sales.table_session_id): la cuenta dividida se paga por partes en el momento.
--   · venta cargada a una reserva (sales.reservation_id): va al folio del huésped.
--   · saldo que vuelve por un recibo ANULADO (payments.status = 'void'): restituye el estado
--     anterior; no se bloquea anular un recibo.
--   · devolución anulada (accounts_receivable.return_id): restituye la deuda que ya existía.
--   · notas crédito.
--   · faltante del cuadre del domiciliario (app.cobro_contraentrega = 'cuadre', que pone
--     logistica_cuadre_recibir_linea): es un faltante de caja, no una venta a crédito. Queda en la
--     lista de puntos para el Contador.
--
-- Verificado el 2026-11-25 antes de aplicar: 0 facturas abiertas con saldo y 0 cuentas por cobrar con
-- saldo en todas las organizaciones (nada histórico queda «ilegal»); el chequeo solo mira altas y
-- cambios, nunca filas viejas que se editan.
--
-- Reversión: supabase/rollbacks/20261126011000_credito_exige_documento_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ¿El cliente tiene documento válido? (no vacío y distinto del NIT del consumidor final)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cliente_con_documento(p_org integer, p_customer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.customers c
     where c.id = p_customer
       and c.organization_id = p_org
       and nullif(btrim(c.identification_number), '') is not null
       and btrim(c.identification_number) <> '222222222222'
       and btrim(c.identification_number) <> (select t.nit from public.fn_consumidor_final_contable(p_org) t)
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ¿Este documento deja saldo a alguien sin documento? Devuelve el detalle del rechazo o NULL.
--    p_tipo: 'factura' (invoice_sales), 'venta' (sales), 'cartera' (accounts_receivable).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_credito_sin_documento(p_tipo text, p_id text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_cliente uuid;
  v_saldo numeric;
  v_estado text;
  v_tipo_doc text;
  v_venta uuid;
  v_numero text;
  v_anulado numeric := 0;
  v_r record;
begin
  -- Faltante del cuadre del domiciliario: no es una venta a crédito (ver cabecera).
  if coalesce(current_setting('app.cobro_contraentrega', true), '') = 'cuadre' then
    return null;
  end if;

  if p_tipo = 'factura' then
    select i.organization_id, i.customer_id, i.balance, i.status, coalesce(i.document_type, 'invoice'), i.sale_id, i.number
      into v_org, v_cliente, v_saldo, v_estado, v_tipo_doc, v_venta, v_numero
      from public.invoice_sales i where i.id = p_id::uuid;
    if v_org is null or v_estado not in ('issued', 'partial') or v_tipo_doc = 'credit_note' then
      return null;
    end if;
    if v_venta is not null and exists (
      select 1 from public.sales s
       where s.id = v_venta and (s.table_session_id is not null or s.reservation_id is not null)
    ) then
      return null;
    end if;
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_anulado
      from public.payments p
     where p.organization_id = v_org and p.status = 'void'
       and ((p.source = 'invoice_sales' and p.source_id = p_id)
            or (v_venta is not null and p.source = 'sale' and p.source_id = v_venta::text));

  elsif p_tipo = 'venta' then
    select s.organization_id, s.customer_id, s.balance, s.status, s.source, s.table_session_id, s.reservation_id
      into v_r
      from public.sales s where s.id = p_id::uuid;
    if v_r.organization_id is null
       or v_r.status not in ('pending', 'partial')
       or coalesce(v_r.source, '') = 'web'
       or v_r.table_session_id is not null
       or v_r.reservation_id is not null then
      return null;
    end if;
    -- Con factura (aunque sea borrador), manda la factura.
    if exists (select 1 from public.invoice_sales i where i.sale_id = p_id::uuid) then
      return null;
    end if;
    v_org := v_r.organization_id;
    v_cliente := v_r.customer_id;
    v_saldo := v_r.balance;
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_anulado
      from public.payments p
     where p.organization_id = v_org and p.status = 'void'
       and p.source = 'sale' and p.source_id = p_id;

  elsif p_tipo = 'cartera' then
    select a.organization_id, a.customer_id, a.balance, a.status, a.invoice_id, a.return_id, a.sale_id
      into v_r
      from public.accounts_receivable a where a.id = p_id::uuid;
    if v_r.organization_id is null
       or v_r.invoice_id is not null
       or v_r.return_id is not null
       or coalesce(v_r.status, '') in ('paid', 'cancelled') then
      return null;
    end if;
    if v_r.sale_id is not null and exists (select 1 from public.invoice_sales i where i.sale_id = v_r.sale_id) then
      return null;
    end if;
    v_org := v_r.organization_id;
    v_cliente := v_r.customer_id;
    v_saldo := v_r.balance;
  else
    return null;
  end if;

  if coalesce(v_saldo, 0) - coalesce(v_anulado, 0) <= 1 then
    return null;
  end if;
  if v_cliente is not null and public.fn_cliente_con_documento(v_org, v_cliente) then
    return null;
  end if;
  return format('%s deja un saldo de %s por cobrar %s. Una venta a crédito o con saldo pendiente necesita el documento (NIT o cédula) del cliente.',
                case p_tipo when 'factura' then 'La factura' || coalesce(' ' || nullif(btrim(v_numero), ''), '')
                            when 'venta' then 'La venta'
                            else 'La cuenta por cobrar' end,
                round(v_saldo, 2),
                case when v_cliente is null then 'a consumidor final' else 'a un cliente sin documento' end);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Disparador diferido: relee la fila al confirmar y rechaza.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_credito_exige_documento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_detalle text;
begin
  v_detalle := public.fn_credito_sin_documento(
    case tg_table_name when 'invoice_sales' then 'factura' when 'sales' then 'venta' else 'cartera' end,
    new.id::text);
  if v_detalle is not null then
    raise exception 'documento_requerido_credito'
      using errcode = 'P0001',
            detail = v_detalle,
            hint = 'Registre el documento del cliente en «Editar datos de facturación» y vuelva a guardar, o cobre la venta completa (de contado).';
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_cliente_con_documento(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_credito_sin_documento(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_trg_credito_exige_documento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cliente_con_documento(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_credito_sin_documento(text, text) TO service_role;

DROP TRIGGER IF EXISTS zz_trg_factura_credito_exige_documento ON public.invoice_sales;
CREATE CONSTRAINT TRIGGER zz_trg_factura_credito_exige_documento
  AFTER INSERT ON public.invoice_sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (new.status IN ('issued', 'partial')
        AND coalesce(new.document_type, 'invoice') <> 'credit_note'
        AND coalesce(new.balance, 0) > 1)
  EXECUTE FUNCTION public.fn_trg_credito_exige_documento();

DROP TRIGGER IF EXISTS zz_trg_factura_credito_exige_documento_upd ON public.invoice_sales;
CREATE CONSTRAINT TRIGGER zz_trg_factura_credito_exige_documento_upd
  AFTER UPDATE OF status, customer_id ON public.invoice_sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (new.status IN ('issued', 'partial')
        AND coalesce(new.document_type, 'invoice') <> 'credit_note'
        AND (coalesce(old.status, '') NOT IN ('issued', 'partial')
             OR old.customer_id IS DISTINCT FROM new.customer_id))
  EXECUTE FUNCTION public.fn_trg_credito_exige_documento();

DROP TRIGGER IF EXISTS zz_trg_venta_credito_exige_documento ON public.sales;
CREATE CONSTRAINT TRIGGER zz_trg_venta_credito_exige_documento
  AFTER INSERT ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (new.status IN ('pending', 'partial')
        AND coalesce(new.balance, 0) > 1
        AND coalesce(new.source, '') <> 'web'
        AND new.table_session_id IS NULL
        AND new.reservation_id IS NULL)
  EXECUTE FUNCTION public.fn_trg_credito_exige_documento();

DROP TRIGGER IF EXISTS zz_trg_cartera_credito_exige_documento ON public.accounts_receivable;
CREATE CONSTRAINT TRIGGER zz_trg_cartera_credito_exige_documento
  AFTER INSERT ON public.accounts_receivable
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (new.invoice_id IS NULL AND new.return_id IS NULL AND coalesce(new.balance, 0) > 1)
  EXECUTE FUNCTION public.fn_trg_credito_exige_documento();
