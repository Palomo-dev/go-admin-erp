-- Aplicada por MCP el 2026-11-15 (apply_migration
-- `web_capture_lead_evento_mensaje_presupuesto`; el SQL aplicado es este, con
-- el encabezado abreviado). Verificado después: ACL
-- {postgres, service_role}, sin restos del ensayo.
--
-- Paquete D · D6b — el lead de evento privado guarda también el mensaje del
-- visitante y el presupuesto por persona tal como lo eligió (rango).
--
-- Contexto (verificado por MCP el 2026-11-15, proyecto taqjemqjtumhwptchcxk):
-- - D6 (`20261006113821_web_capture_lead_sede`) YA está aplicada: sobrecarga de
--   10 argumentos con `p_branch_id` y `p_details`, lista blanca, GRANT solo a
--   `service_role`, valida `invalid_branch` contra la organización del sitio.
-- - El aviso al equipo (`20261006114236_avisos_lead_web_al_equipo`) también está
--   aplicado: `fn_avisos_miembro_lead` ya tiene el bloque `lead.web`.
-- - La tarjeta «Evento privado» del detalle rápido del lead (Figma 1951:941568)
--   pinta además «Presupuesto por persona: $ 80.000 a $ 120.000» y «Mensaje».
--   Las opciones de presupuesto del sitio son RANGOS de texto: la lista blanca
--   de D6 solo admite `budget_per_person` numérico, así que un rango se perdía.
--   El mensaje libre solo quedaba mezclado con el resto en `customers.notes`.
--
-- Qué hace: `create or replace` de la MISMA firma de 10 argumentos (el ACL se
-- conserva y se reafirma abajo). Idéntica a D6 salvo dos claves más en la
-- lista blanca de `p_details`:
--   `budget_label` texto ≤ 60  (la opción de presupuesto tal como se eligió)
--   `message`      texto ≤ 2000 (lo que escribió el visitante; el formulario
--                  del sitio corta en 2000)
-- Todo lo demás se sigue descartando. La sede se sigue validando contra la
-- organización (`invalid_branch`): nunca se confía en el body.
--
-- ENSAYO (2026-11-15, bloque `do` vía execute_sql que aplica esta función, la
-- llama como service_role y se deshace con `raise exception`; org 1, sede de la
-- org 1 y sede de otra org):
--   ENSAYO_OK details={"guests":25,"message":"Queremos la terraza","event_date":
--   "2026-10-24","event_type":"Cumpleaños","budget_label":"$80.000 a $120.000"}
--   (clave `hack` descartada, mensaje de 2100 → 2000) | sede_ajena=[invalid_branch]
--   | anon=[42501 permission denied for function web_capture_lead]

create or replace function public.web_capture_lead(
  p_organization_id integer,
  p_name text,
  p_email text,
  p_message text,
  p_branch_id integer,
  p_details jsonb,
  p_phone text default null,
  p_company text default null,
  p_subject text default null,
  p_source_form text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_res      jsonb;
  v_det      jsonb := '{}'::jsonb;
  v_fecha    date;
  v_inv      integer;
  v_pres     numeric;
  v_cliente  uuid;
  v_captura  jsonb;
begin
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if p_details is not null and jsonb_typeof(p_details) = 'object' then
    if nullif(btrim(coalesce(p_details->>'event_type', '')), '') is not null then
      v_det := v_det || jsonb_build_object('event_type', left(btrim(p_details->>'event_type'), 60));
    end if;
    if coalesce(p_details->>'event_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        v_fecha := (p_details->>'event_date')::date;
        v_det := v_det || jsonb_build_object('event_date', to_char(v_fecha, 'YYYY-MM-DD'));
      exception when others then
        null;
      end;
    end if;
    if coalesce(p_details->>'guests', '') ~ '^\d{1,4}$' then
      v_inv := (p_details->>'guests')::integer;
      if v_inv between 1 and 5000 then
        v_det := v_det || jsonb_build_object('guests', v_inv);
      end if;
    end if;
    if nullif(btrim(coalesce(p_details->>'venue', '')), '') is not null then
      v_det := v_det || jsonb_build_object('venue', left(btrim(p_details->>'venue'), 120));
    end if;
    if coalesce(p_details->>'budget_per_person', '') ~ '^\d{1,9}(\.\d{1,2})?$' then
      v_pres := (p_details->>'budget_per_person')::numeric;
      v_det := v_det || jsonb_build_object('budget_per_person', v_pres);
    end if;
    -- D6b: presupuesto tal como se eligió (p. ej. un rango) y mensaje libre.
    if jsonb_typeof(p_details->'budget_label') = 'string'
       and nullif(btrim(p_details->>'budget_label'), '') is not null then
      v_det := v_det || jsonb_build_object('budget_label', left(btrim(p_details->>'budget_label'), 60));
    end if;
    if jsonb_typeof(p_details->'message') = 'string'
       and nullif(btrim(p_details->>'message'), '') is not null then
      v_det := v_det || jsonb_build_object('message', left(btrim(p_details->>'message'), 2000));
    end if;
  end if;

  v_res := public.web_capture_lead(
    p_organization_id => p_organization_id,
    p_name => p_name,
    p_email => p_email,
    p_message => p_message,
    p_phone => p_phone,
    p_company => p_company,
    p_subject => p_subject,
    p_source_form => p_source_form
  );

  v_cliente := nullif(v_res->>'customer_id', '')::uuid;
  if v_cliente is not null and (p_branch_id is not null or v_det <> '{}'::jsonb) then
    v_captura := jsonb_strip_nulls(jsonb_build_object(
      'form', left(nullif(btrim(coalesce(p_source_form, '')), ''), 60),
      'branch_id', p_branch_id,
      'details', case when v_det = '{}'::jsonb then null else v_det end,
      'captured_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
    ));

    update public.customers c
       set metadata = coalesce(c.metadata, '{}'::jsonb)
                      || jsonb_build_object('lead',
                           coalesce(c.metadata -> 'lead', '{}'::jsonb)
                           || jsonb_build_object('capturas',
                                coalesce((
                                  select jsonb_agg(x.e order by x.ord)
                                    from jsonb_array_elements(
                                           case when jsonb_typeof(c.metadata -> 'lead' -> 'capturas') = 'array'
                                                then c.metadata -> 'lead' -> 'capturas' else '[]'::jsonb end
                                         ) with ordinality as x(e, ord)
                                   where x.ord > greatest(
                                           jsonb_array_length(
                                             case when jsonb_typeof(c.metadata -> 'lead' -> 'capturas') = 'array'
                                                  then c.metadata -> 'lead' -> 'capturas' else '[]'::jsonb end
                                           ) - 19, 0)
                                ), '[]'::jsonb) || jsonb_build_array(v_captura))),
           updated_at = now()
     where c.id = v_cliente
       and c.organization_id = p_organization_id;
  end if;

  return v_res || jsonb_build_object('branch_id', p_branch_id);
end;
$function$;

comment on function public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text) is
  'Captura de lead web con sede y detalles saneados (lista blanca: event_type, event_date, guests, venue, budget_per_person, budget_label, message). Llama a web_capture_lead de 8 argumentos y anexa la captura a customers.metadata.lead.capturas (20 últimas).';

revoke all on function public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text) to service_role;
