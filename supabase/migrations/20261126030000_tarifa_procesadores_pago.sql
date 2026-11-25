-- Tarifa de cada procesador de pago, configurable por organización (encargo «Recaudo por medio de
-- pago», aprobado el 2026-11-25; Figma «05 POS y ventas» 3300-421113).
--
-- La tarifa NUNCA se cablea: cada organización la define en Finanzas › Procesadores de pago ›
-- «Datos de los procesadores» (porcentaje, valor fijo por transacción, IVA de la comisión, %
-- adicional de tarjeta internacional y % de ReteFuente, ReteICA y ReteIVA). Con ella la pestaña
-- «Cobros» ESTIMA comisión, retenciones y neto de cada cobro hasta que se registra el abono real
-- (`payment_processor_payouts`), que es el que va a contabilidad. Esta tabla no toca asientos.
--
-- Vive donde ya viven los datos del procesador: `payment_processor_settings` (una fila por
-- organización y procesador, RLS de lectura por pertenencia; la escritura va por funciones
-- SECURITY DEFINER con guarda de acceso y permiso). Aditiva: columna NULL-able (sin tarifa = sin
-- estimación, la pantalla pide configurarla) y una función nueva.
--
-- Datos: la organización 358 recibe con Bold en el plan «abono inmediato u otro banco» (lo
-- confirmó el dueño el 2026-11-25): 3,59 % + $ 900 en todas las tarjetas y PSE/billeteras, +1 %
-- tarjeta internacional, IVA 19 % sobre la comisión (tabla oficial bold.co/tarifas, antes de IVA
-- y retenciones). Las retenciones quedan en 0 y SIN configurar a propósito: se ven en la app de
-- Bold y no se inventan.

alter table public.payment_processor_settings
  add column if not exists fee_schedule jsonb;

comment on column public.payment_processor_settings.fee_schedule is
  'Tarifa del procesador para ESTIMAR comisión, IVA de la comisión, retenciones y neto en «Cobros» (forma en src/lib/finanzas/procesadoresPago/tarifaProcesador.ts). NULL = sin tarifa. Lo real sale del abono registrado.';

create or replace function public.fn_procesador_pago_tarifa_guardar(
  p_organization_id integer,
  p_procesador text,
  p_tarifa jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_clave text;
  v_valor numeric;
  v_tramo text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.create' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fn_procesadores_pago_catalogo() k where k.codigo = p_procesador) then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(p_procesador, '(vacío)') using errcode = '22023';
  end if;

  if p_tarifa is not null then
    if jsonb_typeof(p_tarifa) <> 'object' then
      raise exception 'TARIFA_INVALIDA: se espera un objeto' using errcode = '22023';
    end if;
    -- Porcentajes entre 0 y 100.
    foreach v_clave in array array['internacionalPct', 'ivaComisionPct', 'reteFuentePct', 'reteIcaPct', 'reteIvaPct'] loop
      if p_tarifa ? v_clave then
        if jsonb_typeof(p_tarifa -> v_clave) <> 'number' then
          raise exception 'TARIFA_INVALIDA: % debe ser un número', v_clave using errcode = '22023';
        end if;
        v_valor := (p_tarifa ->> v_clave)::numeric;
        if v_valor < 0 or v_valor > 100 then
          raise exception 'TARIFA_INVALIDA: % fuera de 0 a 100', v_clave using errcode = '22023';
        end if;
      end if;
    end loop;
    -- Tramos: porcentaje 0..100 y valor fijo >= 0.
    foreach v_tramo in array array['base', 'tarjeta', 'tarjetaOtras', 'pseBilleteras'] loop
      if p_tarifa ? v_tramo and jsonb_typeof(p_tarifa -> v_tramo) <> 'null' then
        if jsonb_typeof(p_tarifa -> v_tramo) <> 'object'
           or jsonb_typeof(p_tarifa -> v_tramo -> 'porcentaje') <> 'number'
           or jsonb_typeof(p_tarifa -> v_tramo -> 'fijo') <> 'number' then
          raise exception 'TARIFA_INVALIDA: % necesita porcentaje y fijo', v_tramo using errcode = '22023';
        end if;
        if (p_tarifa -> v_tramo ->> 'porcentaje')::numeric not between 0 and 100
           or (p_tarifa -> v_tramo ->> 'fijo')::numeric < 0 then
          raise exception 'TARIFA_INVALIDA: % fuera de rango', v_tramo using errcode = '22023';
        end if;
      end if;
    end loop;
    if not (p_tarifa ? 'base') then
      raise exception 'TARIFA_INVALIDA: falta la tarifa base' using errcode = '22023';
    end if;
  end if;

  insert into public.payment_processor_settings (organization_id, processor, fee_schedule, updated_by, updated_at)
  values (p_organization_id, p_procesador, p_tarifa, v_uid, now())
  on conflict (organization_id, processor) do update
    set fee_schedule = excluded.fee_schedule,
        updated_by = excluded.updated_by,
        updated_at = now();

  return jsonb_build_object('procesador', p_procesador, 'tarifa', p_tarifa);
end;
$function$;

comment on function public.fn_procesador_pago_tarifa_guardar(integer, text, jsonb) is
  'Guarda (o borra con NULL) la tarifa de un procesador de la organización. Exige acceso a la organización y finance.create. Solo estima: no toca asientos.';

revoke all on function public.fn_procesador_pago_tarifa_guardar(integer, text, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_tarifa_guardar(integer, text, jsonb) to authenticated, service_role;

-- Organización 358: Bold, plan «abono inmediato u otro banco» (confirmado por el dueño). Solo si
-- aún no tiene tarifa: no pisa lo que la organización haya configurado.
insert into public.payment_processor_settings (organization_id, processor, fee_schedule, updated_at)
select 358, 'bold',
       jsonb_build_object(
         'version', 1,
         'plan', 'abonoInmediato',
         'base', jsonb_build_object('porcentaje', 3.59, 'fijo', 900),
         'tarjeta', null,
         'tarjetaOtras', null,
         'pseBilleteras', null,
         'pseSinRetenciones', false,
         'internacionalPct', 1,
         'ivaComisionPct', 19,
         'reteFuentePct', 0,
         'reteIcaPct', 0,
         'reteIvaPct', 0,
         'retencionesConfiguradas', false),
       now()
 where exists (select 1 from public.organizations o where o.id = 358)
on conflict (organization_id, processor) do update
  set fee_schedule = excluded.fee_schedule, updated_at = now()
  where public.payment_processor_settings.fee_schedule is null;
