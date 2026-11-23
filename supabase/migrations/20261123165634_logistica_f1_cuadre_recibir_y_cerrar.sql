-- Logística Fase 1 (endurecimiento): «Recibir y cerrar» el cuadre del domiciliario en UNA transacción.
--
-- Antes la hoja «Recibir dinero» llamaba `logistica_cuadre_recibir_linea` una vez por envío y luego
-- `logistica_cuadre_cerrar`: si algo fallaba a mitad, quedaban cobros registrados en la caja con el
-- cuadre abierto. `logistica_cuadre_recibir_y_cerrar` hace todo o nada:
--   - recibe cada línea con la RPC que ya existe (no reimplementa cobros: la misma
--     `logistica_cuadre_recibir_linea`, que llama `fn_cobrar_pedido_web_en_caja` o
--     `fn_registrar_pago`) y cierra con `logistica_cuadre_cerrar`;
--   - si cualquier paso falla, Postgres revierte TODO (cobros, líneas y cierre);
--   - idempotente: si el cuadre ya está cerrado devuelve su resumen con `ya_cerrado = true` sin
--     cobrar de nuevo; una línea que ya no está pendiente (recibida en un intento anterior por la
--     RPC de una línea) se omite y se cuenta en `omitidas`.
-- `p_recibos`: [{linea_id*, metodo*, monto*, referencia, factura, motivo_diferencia}]. Permisos: los
-- de `fn_logistica_cuadre_exigir` (miembro activo, acceso a la sede, fn_caja_puede 'pos.create').

create or replace function public.logistica_cuadre_recibir_y_cerrar(
  p_settlement_id uuid,
  p_recibos jsonb,
  p_motivo text default null,
  p_responsable text default null,
  p_detalle_responsable text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cs public.courier_settlements;
  v_r jsonb;
  v_linea uuid;
  v_monto numeric;
  v_estado text;
  v_res jsonb;
  v_recibidas integer := 0;
  v_omitidas integer := 0;
  v_cobros jsonb := '[]'::jsonb;
begin
  if p_recibos is null or jsonb_typeof(p_recibos) <> 'array' then
    raise exception 'RECIBOS_INVALIDOS' using errcode = '22023';
  end if;

  select * into v_cs from public.courier_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'CUADRE_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_logistica_cuadre_exigir(v_cs.organization_id, v_cs.branch_id);

  if v_cs.status = 'closed' then
    return public.fn_logistica_cuadre_resumen(v_cs.id)
           || jsonb_build_object('ya_cerrado', true, 'recibidas', 0, 'omitidas', jsonb_array_length(p_recibos), 'cobros', '[]'::jsonb);
  end if;
  if v_cs.status <> 'open' then
    raise exception 'CUADRE_CERRADO' using errcode = '22023';
  end if;

  for v_r in select value from jsonb_array_elements(p_recibos) loop
    begin
      v_linea := (v_r ->> 'linea_id')::uuid;
      v_monto := (v_r ->> 'monto')::numeric;
    exception when others then
      raise exception 'RECIBOS_INVALIDOS' using errcode = '22023';
    end;
    if v_linea is null or v_monto is null then
      raise exception 'RECIBOS_INVALIDOS' using errcode = '22023';
    end if;

    select l.status into v_estado from public.courier_settlement_lines l
     where l.id = v_linea and l.settlement_id = v_cs.id;
    if not found then
      raise exception 'LINEA_NO_ENCONTRADA' using errcode = 'P0002';
    end if;
    if v_estado <> 'pending' then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;

    v_res := public.logistica_cuadre_recibir_linea(
      v_linea,
      v_r ->> 'metodo',
      v_monto,
      nullif(btrim(coalesce(v_r ->> 'referencia', '')), ''),
      case when jsonb_typeof(v_r -> 'factura') = 'object' then v_r -> 'factura' end,
      nullif(btrim(coalesce(v_r ->> 'motivo_diferencia', '')), ''));
    v_recibidas := v_recibidas + 1;
    v_cobros := v_cobros || jsonb_build_array(jsonb_build_object('linea_id', v_linea, 'cobro', v_res -> 'cobro'));
  end loop;

  v_res := public.logistica_cuadre_cerrar(v_cs.id, p_motivo, p_responsable, p_detalle_responsable, p_notas);
  return v_res || jsonb_build_object('ya_cerrado', false, 'recibidas', v_recibidas, 'omitidas', v_omitidas, 'cobros', v_cobros);
end;
$function$;

revoke execute on function public.logistica_cuadre_recibir_y_cerrar(uuid, jsonb, text, text, text, text) from public, anon;
grant execute on function public.logistica_cuadre_recibir_y_cerrar(uuid, jsonb, text, text, text, text) to authenticated, service_role;

comment on function public.logistica_cuadre_recibir_y_cerrar(uuid, jsonb, text, text, text, text) is
  'Logística: recibe varias líneas del cuadre del domiciliario y lo cierra en una sola transacción; idempotente si ya está cerrado.';
