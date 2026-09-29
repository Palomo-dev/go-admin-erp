-- Membresías — fase 3: renovación automática (docs/design/MEMBRESIAS-FASE-1-2.md §12).
-- Aplicada por MCP como `membresias_renovacion_automatica` (versión 20260929211718).
--
-- Qué hace «automática» (y qué NO): para los planes con membership_plans.renewal_mode = 'automatic',
-- la tarea horaria ya existente (pg_cron `membresias-vencer` → fn_membresias_vencer_todas) deja una
-- RENOVACIÓN PENDIENTE (evento `renewal_due` en membership_events) cuando faltan 7 días o menos para el
-- vencimiento. Nada más: no crea ventas, facturas, borradores, cuentas por cobrar ni pagos, no llama a
-- ninguna pasarela y no emite nada a la DIAN. Cobrar la renovación sigue siendo vender el producto del
-- plan (POS, factura o enlace de pago) y la membresía se extiende por el camino de siempre
-- (fn_membresias_activar_venta dentro de la venta o del pago). Si vence sin pago, fn_membresias_vencer
-- la pasa a past_due (con gracia) o expired, igual que a una manual.
--
-- Por qué no un borrador de factura automático: fn_factura_venta_guardar exige auth.uid() (la tarea
-- programada no tiene usuario) y en el alta inserta `sales` (pending) + `sale_items`, que ya cuentan en
-- reportes y en los ingresos del módulo. Generarlo sin usuario exigiría una segunda implementación de la
-- factura (regla 7) y decidir quién la firma: queda como decisión del dueño (§12).
--
-- Idempotencia: índice único parcial (membership_id, metadata->>'periodo_hasta_epoch') sobre
-- `renewal_due`; el periodo es el end_date vigente en segundos. Correr la tarea dos veces, o cada hora
-- durante los 7 días, deja UN evento por periodo. Al renovarse, end_date cambia y la pendiente del
-- periodo anterior deja de aplicar sola (la interfaz compara con el end_date actual).
--
-- 7 días = DIAS_AVISO_RENOVACION de src/lib/services/membresias/renovacion.ts (misma ventana que
-- «Vencen en 7 días» del listado). La prueba src/__tests__/membresias/renovacionAutomatica.test.ts
-- falla si una y otra divergen.

-- 1. Tipo de evento nuevo (amplía la CHECK: no invalida filas).
alter table public.membership_events drop constraint if exists membership_events_event_type_check;
alter table public.membership_events add constraint membership_events_event_type_check check (event_type in
  ('created', 'activated', 'renewed', 'frozen', 'unfrozen', 'cancelled', 'expired', 'payment_received',
   'payment_failed', 'access_granted', 'access_denied', 'plan_changed', 'notes_updated',
   'trimmed', 'grace_started', 'reactivated',
   'renewal_due'));

-- 2. Una renovación pendiente por membresía y periodo.
create unique index if not exists membership_events_renewal_due_uq
  on public.membership_events (membership_id, ((metadata->>'periodo_hasta_epoch')))
  where event_type = 'renewal_due';

-- 3. Generación por organización (la llama la tarea programada; no hay grant a authenticated).
create or replace function public.fn_membresias_generar_renovaciones(p_organization_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_tz text;
  v_r record;
  v_precio numeric;
  v_n integer := 0;
  v_filas integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  v_tz := public.fn_timezone_for(p_organization_id, null);

  for v_r in
    select m.id, m.end_date, m.status, mp.product_id, mp.id as plan_id
      from public.memberships m
      join public.membership_plans mp on mp.id = m.membership_plan_id and mp.organization_id = m.organization_id
     where m.organization_id = p_organization_id
       and mp.renewal_mode = 'automatic'
       and mp.product_id is not null
       and m.cancel_reason is distinct from 'renovacion_aplicada'
       and m.end_date <= now() + interval '7 days'
       and (m.status = 'active' or (m.status = 'past_due' and coalesce(m.grace_until, m.end_date) >= now()))
  loop
    select pp.price into v_precio
      from public.product_prices pp
     where pp.product_id = v_r.product_id
       and pp.effective_from <= now()
       and (pp.effective_to is null or pp.effective_to > now())
     order by pp.effective_from desc
     limit 1;

    insert into public.membership_events (membership_id, organization_id, event_type, description, old_value, new_value,
                                          performed_by, metadata)
    values (v_r.id, p_organization_id, 'renewal_due', 'Renovación pendiente de cobro', null, null, auth.uid(),
            jsonb_build_object(
              'periodo_hasta', v_r.end_date,
              'periodo_hasta_epoch', floor(extract(epoch from v_r.end_date))::bigint::text,
              'vence_dia', (v_r.end_date at time zone v_tz)::date,
              'plan_id', v_r.plan_id,
              'product_id', v_r.product_id,
              'precio', v_precio,
              'estado', v_r.status,
              'dias_aviso', 7))
    on conflict (membership_id, (metadata->>'periodo_hasta_epoch')) where event_type = 'renewal_due' do nothing;
    get diagnostics v_filas = row_count;
    v_n := v_n + v_filas;
  end loop;

  return jsonb_build_object('organization_id', p_organization_id, 'renovaciones', v_n);
end;
$function$;

revoke all on function public.fn_membresias_generar_renovaciones(integer) from public, anon, authenticated;

comment on function public.fn_membresias_generar_renovaciones(integer) is
  'Membresías: deja la renovación pendiente (evento renewal_due) de los planes con renovación automática 7 días antes del vencimiento. No mueve dinero ni crea documentos. Idempotente por periodo.';

-- 4. La tarea horaria genera las pendientes ANTES de vencer (una que vence en esta hora aún la recibe).
create or replace function public.fn_membresias_vencer_todas()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_org integer;
  v_res jsonb := '[]'::jsonb;
  v_r jsonb;
  v_ren jsonb;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'solo_tarea_programada' using errcode = '42501';
  end if;
  for v_org in
    select distinct m.organization_id from public.memberships m
     where m.status in ('active', 'past_due', 'frozen', 'pending')
  loop
    -- Renovaciones pendientes (fase 3): un fallo aquí no frena el vencimiento.
    begin
      v_ren := public.fn_membresias_generar_renovaciones(v_org);
    exception when others then
      v_ren := jsonb_build_object('organization_id', v_org, 'renovaciones', 0, 'error_renovaciones', sqlerrm);
    end;
    begin
      v_r := public.fn_membresias_vencer(v_org);
      v_r := v_r || jsonb_build_object('renovaciones', coalesce((v_ren->>'renovaciones')::int, 0));
      if v_ren ? 'error_renovaciones' then
        v_r := v_r || jsonb_build_object('error_renovaciones', v_ren->>'error_renovaciones');
      end if;
      if (v_r->>'congeladas')::int + (v_r->>'descongeladas')::int + (v_r->>'activadas')::int
         + (v_r->>'en_gracia')::int + (v_r->>'credito_vencido')::int + (v_r->>'vencidas')::int
         + (v_r->>'renovaciones')::int > 0 or v_r ? 'error_renovaciones' then
        v_res := v_res || v_r;
      end if;
    exception when others then
      v_res := v_res || jsonb_build_object('organization_id', v_org, 'error', sqlerrm);
    end;
  end loop;
  return v_res;
end;
$function$;
