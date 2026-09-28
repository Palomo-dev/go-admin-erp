-- Consecutivo propio de recibos de caja (RC-0001…) y comprobantes de egreso (CE-0001…)
-- por organización. Decisión del dueño 2026-09-28.
--
-- Reutiliza el mecanismo que ya existía para los recibos del pago único (`payment_groups`,
-- `fn_registrar_pago` y `fn_saldo_favor_crear`): candado de transacción por organización +
-- máximo + 1, el mismo patrón de `fn_pos_numero_nota_credito`. No crea un segundo sistema:
-- `fn_recibo_siguiente_numero` pasa a ser el ÚNICO generador y lo llaman las dos funciones del
-- pago único y el trigger de `payments`. Así una serie por organización no se repite entre
-- `payment_groups.receipt_number` y `payments.receipt_number`.
--
-- Qué pagos llevan número propio (verificado con el MCP 2026-09-28):
--   * `payments` fuera de un pago único (`payment_group_id is null`), con `amount > 0` y en
--     estado `completed`: cobros de factura, venta del POS, abonos de cartera, pedido web, folio,
--     parqueadero, PMS, membresías… → serie RC; los de `invoice_purchase` / `account_payable`
--     → serie CE (misma regla que `ORIGENES_EGRESO` del motor de documentos).
--   * Los pagos de un pago único usan el número de su grupo (`payment_groups.receipt_number`).
--   * Sin número: intentos fallidos o pendientes (`failed`, `pending`) y devoluciones con importe
--     negativo (`credit_note`, `customer_credit_refund`): no son dinero recibido.
-- Un pago insertado `pending` recibe su número cuando pasa a `completed`.
-- El número es inmutable: anular el pago NO lo libera ni lo reutiliza (el máximo lo sigue
-- contando). La serie tampoco se reinicia.
--
-- Backfill (medido antes de aplicar, 2026-09-28): 3 361 pagos en 20 organizaciones (3 352 RC y
-- 9 CE en 3 organizaciones), en orden (created_at, id); incluye 1 pago anulado, que conserva su
-- número. Los 722 intentos fallidos de pedidos web y los 2 importes negativos quedan sin número.
-- Se hace con `session_replication_role = replica` para no disparar los triggers AFTER de
-- `payments` (recalcular facturas, cartera, auditoría): solo se escribe `receipt_number`.

-- ── Columna ──
alter table public.payments add column if not exists receipt_number text;

comment on column public.payments.receipt_number is
  'Consecutivo del comprobante del pago por organización: RC-0001 (recibo de caja) o CE-0001 '
  '(comprobante de egreso). Lo asigna solo el trigger trg_recibo_numero_pago vía '
  'fn_recibo_siguiente_numero; es inmutable. NULL en pagos de un pago único (el número es el '
  'de payment_groups.receipt_number), fallidos, pendientes o con importe negativo.';

-- ── Utilidades puras ──
create or replace function public.fn_recibo_consecutivo(p_numero text)
returns bigint
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '')::bigint
$$;

comment on function public.fn_recibo_consecutivo(text) is
  'Parte numérica de un número de recibo (RC-0042 → 42). Pura; la usa el índice del máximo.';

create or replace function public.fn_recibo_serie_pago(p_source text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case when p_source in ('invoice_purchase', 'account_payable') then 'CE' else 'RC' end
$$;

comment on function public.fn_recibo_serie_pago(text) is
  'Serie del comprobante de un pago según su origen: CE para egresos a proveedores, RC para el '
  'resto. Igual que ORIGENES_EGRESO del motor de documentos.';

create or replace function public.fn_recibo_formatear(p_serie text, p_numero bigint)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select p_serie || '-' || lpad(p_numero::text, greatest(4, length(p_numero::text)), '0')
$$;

comment on function public.fn_recibo_formatear(text, bigint) is
  'RC + 7 → RC-0007. Relleno mínimo de 4 dígitos que crece sin truncar (RC-12345).';

-- ── Índice: unicidad por organización y máximo en O(log n) ──
-- La serie va en el prefijo del texto, así que (organización, serie, número) único equivale a
-- receipt_number único por organización, y además impide RC-0001 y RC-00001 a la vez.
create unique index if not exists uq_payments_org_recibo
  on public.payments (organization_id, left(receipt_number, 2), public.fn_recibo_consecutivo(receipt_number))
  where receipt_number is not null;

-- ── Generador único ──
create or replace function public.fn_recibo_siguiente_numero(p_org integer, p_serie text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max bigint;
  v_grupos bigint;
begin
  if p_org is null then
    raise exception 'organizacion_requerida' using errcode = '22023';
  end if;
  if p_serie is null or p_serie not in ('RC', 'CE') then
    raise exception 'serie_invalida: %', p_serie using errcode = '22023';
  end if;

  -- Serializa la serie de la organización hasta el final de la transacción que crea el pago:
  -- sin huecos ni duplicados por concurrencia.
  perform pg_advisory_xact_lock(hashtextextended('recibo_pago:' || p_org || ':' || p_serie, 0));

  select max(public.fn_recibo_consecutivo(p.receipt_number)) into v_max
    from public.payments p
   where p.organization_id = p_org
     and p.receipt_number is not null
     and left(p.receipt_number, 2) = p_serie;

  select max(public.fn_recibo_consecutivo(g.receipt_number)) into v_grupos
    from public.payment_groups g
   where g.organization_id = p_org
     and left(g.receipt_number, 2) = p_serie;

  return public.fn_recibo_formatear(p_serie, greatest(coalesce(v_max, 0), coalesce(v_grupos, 0)) + 1);
end;
$$;

comment on function public.fn_recibo_siguiente_numero(integer, text) is
  'Único generador de números de recibo (RC) y comprobante de egreso (CE) por organización. '
  'Candado de transacción por organización y serie + máximo de payments y payment_groups. '
  'Solo lo llaman funciones del servidor (trigger de payments, fn_registrar_pago, '
  'fn_saldo_favor_crear): sin EXECUTE para clientes.';

-- Sin guarda de pertenencia a propósito: no la puede llamar ningún cliente (revoke abajo) y la
-- llaman triggers que también corren con service_role (tienda web), sin auth.uid().
revoke all on function public.fn_recibo_siguiente_numero(integer, text) from public, anon, authenticated;

-- ── Trigger de payments ──
create or replace function public.fn_payments_asignar_recibo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.receipt_number is not null then
    -- Emitido: inmutable. Anular (o cualquier cambio) no lo libera ni lo reemplaza.
    new.receipt_number := old.receipt_number;
    return new;
  end if;

  -- Nadie lo escribe a mano: solo el generador.
  new.receipt_number := null;

  if new.organization_id is null
     or new.payment_group_id is not null
     or new.status is distinct from 'completed'
     or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  new.receipt_number := public.fn_recibo_siguiente_numero(new.organization_id, public.fn_recibo_serie_pago(new.source));
  return new;
end;
$$;

comment on function public.fn_payments_asignar_recibo() is
  'BEFORE INSERT/UPDATE de payments: asigna receipt_number (RC/CE) cuando el pago queda '
  'completed fuera de un pago único y con importe positivo; lo conserva para siempre.';

revoke all on function public.fn_payments_asignar_recibo() from public, anon, authenticated;

-- ── Las dos funciones del pago único usan el generador (y el egreso pasa a CE) ──
-- Se sustituye SOLO el bloque de numeración sobre la definición viva, y se exige que aparezca
-- exactamente una vez: si otra sesión la cambió, la migración falla en vez de pisarla.
do $migracion$
declare
  v_viejo constant text := $v$  perform pg_advisory_xact_lock(hashtextextended('recibo_pago:' || v_org, 0));
  select 'RC-' || lpad((coalesce(max(nullif(regexp_replace(g.receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 6, '0')
    into v_recibo
    from public.payment_groups g where g.organization_id = v_org;$v$;
  v_def text;
  v_nuevo text;
  v_fn record;
begin
  for v_fn in
    select 'public.fn_registrar_pago(text, jsonb, text, text, date, text, integer, numeric, numeric, text, text, text, integer)'::regprocedure as oid,
           $n$  v_recibo := public.fn_recibo_siguiente_numero(v_org, case when p_direccion = 'pago' then 'CE' else 'RC' end);$n$ as nuevo
    union all
    select 'public.fn_saldo_favor_crear(uuid, integer, numeric, text, text, integer, integer, text, date, text)'::regprocedure,
           $n$  v_recibo := public.fn_recibo_siguiente_numero(v_org, 'RC');$n$
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    if position(v_fn.nuevo in v_def) > 0 then
      continue; -- ya aplicada (idempotente)
    end if;
    if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
      raise exception 'El bloque de numeración de % no aparece exactamente una vez', v_fn.oid;
    end if;
    v_nuevo := replace(v_def, v_viejo, v_fn.nuevo);
    execute v_nuevo;
  end loop;
end;
$migracion$;

-- ── Backfill: pagos ya emitidos, en orden cronológico por organización y serie ──
set local session_replication_role = replica;

with candidatos as (
  select p.id, p.organization_id, public.fn_recibo_serie_pago(p.source) as serie, p.created_at
    from public.payments p
   where p.receipt_number is null
     and p.organization_id is not null
     and p.payment_group_id is null
     and coalesce(p.amount, 0) > 0
     and p.status in ('completed', 'cancelled', 'voided', 'refunded', 'reversed')
), base as (
  -- Si ya hubiera números (re-ejecución o pagos nuevos), se continúa después del máximo.
  select c.organization_id, c.serie,
         greatest(
           coalesce((select max(public.fn_recibo_consecutivo(p.receipt_number)) from public.payments p
                      where p.organization_id = c.organization_id and p.receipt_number is not null
                        and left(p.receipt_number, 2) = c.serie), 0),
           coalesce((select max(public.fn_recibo_consecutivo(g.receipt_number)) from public.payment_groups g
                      where g.organization_id = c.organization_id and left(g.receipt_number, 2) = c.serie), 0)
         ) as desde
    from candidatos c
   group by c.organization_id, c.serie
), numerados as (
  select c.id,
         public.fn_recibo_formatear(c.serie, b.desde + row_number() over (
           partition by c.organization_id, c.serie order by c.created_at nulls first, c.id)) as numero
    from candidatos c
    join base b on b.organization_id = c.organization_id and b.serie = c.serie
)
update public.payments p
   set receipt_number = n.numero
  from numerados n
 where n.id = p.id;

set local session_replication_role = origin;

-- ── Trigger (después del backfill) ──
-- El nombre ordena después de trg_branch_default y trg_normalize_payment_status ('paid' →
-- 'completed'), que también son BEFORE y deben correr antes.
drop trigger if exists trg_recibo_numero_pago on public.payments;
create trigger trg_recibo_numero_pago
  before insert or update of status, receipt_number, payment_group_id on public.payments
  for each row execute function public.fn_payments_asignar_recibo();
