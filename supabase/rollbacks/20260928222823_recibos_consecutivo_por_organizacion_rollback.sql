-- Rollback de 20260928222823_recibos_consecutivo_por_organizacion.sql
--
-- ADVERTENCIA: borra payments.receipt_number, y con ella los números asignados (backfill y
-- nuevos). Los recibos ya impresos o enviados con RC-0001… dejan de corresponder a un dato de
-- la base; el PDF vuelve a RC-<8 caracteres del id>. Los grupos de pago único creados con serie
-- CE conservan su número (no se reescriben).

drop trigger if exists trg_recibo_numero_pago on public.payments;

-- Las dos funciones del pago único vuelven a su numeración anterior (solo payment_groups, 6
-- dígitos, siempre RC). Misma técnica que la migración: se sustituye solo ese bloque.
do $rollback$
declare
  v_viejo constant text := $v$  perform pg_advisory_xact_lock(hashtextextended('recibo_pago:' || v_org, 0));
  select 'RC-' || lpad((coalesce(max(nullif(regexp_replace(g.receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 6, '0')
    into v_recibo
    from public.payment_groups g where g.organization_id = v_org;$v$;
  v_def text;
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
    if position(v_fn.nuevo in v_def) = 0 then
      continue; -- ya revertida
    end if;
    execute replace(v_def, v_fn.nuevo, v_viejo);
  end loop;
end;
$rollback$;

drop function if exists public.fn_payments_asignar_recibo();
drop function if exists public.fn_recibo_siguiente_numero(integer, text);
drop index if exists public.uq_payments_org_recibo;
alter table public.payments drop column if exists receipt_number;
drop function if exists public.fn_recibo_formatear(text, bigint);
drop function if exists public.fn_recibo_serie_pago(text);
drop function if exists public.fn_recibo_consecutivo(text);
