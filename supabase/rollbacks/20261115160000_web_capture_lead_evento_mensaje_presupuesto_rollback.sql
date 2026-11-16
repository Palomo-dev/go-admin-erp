-- Rollback de 20261115160000_web_capture_lead_evento_mensaje_presupuesto (D6b).
-- Vuelve a la definición de D6 (20261006113821_web_capture_lead_sede): misma
-- firma de 10 argumentos, sin `budget_label` ni `message` en la lista blanca.
-- No revierte datos: las capturas ya guardadas en
-- customers.metadata.lead.capturas conservan esas dos claves (la ficha las
-- pinta si están y las omite si no).

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
  'Captura de lead web con sede y detalles saneados (lista blanca). Llama a web_capture_lead de 8 argumentos y anexa la captura a customers.metadata.lead.capturas (20 últimas).';

revoke all on function public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.web_capture_lead(integer, text, text, text, integer, jsonb, text, text, text, text) to service_role;
