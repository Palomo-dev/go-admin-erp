-- Reversion de 20260923235500_web_capture_lead_pipeline_de_ventas.
--
-- ADVERTENCIA: esta reversion REINTRODUCE el defecto. Devuelve el cuerpo
-- exacto que tenia la funcion antes del arreglo (md5 de pg_get_functiondef:
-- dcd1dc4c21d7b594098488c55e2c010b), en el que el respaldo de pipeline es:
--
--   select p.id from public.pipelines p
--    where p.organization_id = v_org.id
--    order by p.created_at asc limit 1;
--
-- es decir, el pipeline MAS ANTIGUO de la organizacion sin mirar
-- `pipeline_type`. Aplicarla vuelve a mandar los leads web al primer embudo
-- que aparezca —23 de los 42 leads web de hoy acabaron asi en un embudo de
-- onboarding— y sin ningun aviso: `crm_warning` vuelve a salir vacio en ese
-- caso.
--
-- Se conserva aqui solo para que la migracion tenga reversion real, no vacia,
-- segun docs/POLITICA-MIGRACIONES.md. No aplicarla salvo para reproducir el
-- fallo original.
--
-- No revierte datos: la migracion no modifico ninguna fila.

CREATE OR REPLACE FUNCTION public.web_capture_lead(p_organization_id integer, p_name text, p_email text, p_message text, p_phone text DEFAULT NULL::text, p_company text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_source_form text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org             record;
  v_email           text;
  v_name            text;
  v_message         text;
  v_phone           text;
  v_company         text;
  v_subject         text;
  v_source_form     text;
  v_first_name      text;
  v_last_name       text;
  v_customer_id     uuid;
  v_customer_new    boolean := false;
  v_pipeline_id     uuid;
  v_stage_id        uuid;
  v_opportunity_id  uuid;
  v_note            text;
  v_existing_notes  text;
  v_crm_warning     text := null;
begin
  -- ── 1. Normalizacion y validacion de entrada ──────────────────────────────
  v_email       := lower(btrim(coalesce(p_email, '')));
  v_name        := btrim(coalesce(p_name, ''));
  v_message     := btrim(coalesce(p_message, ''));
  v_phone       := nullif(btrim(coalesce(p_phone, '')), '');
  v_company     := nullif(btrim(coalesce(p_company, '')), '');
  v_subject     := nullif(btrim(coalesce(p_subject, '')), '');
  v_source_form := nullif(btrim(coalesce(p_source_form, '')), '');

  if v_email = '' or length(v_email) > 160
     or v_email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if length(v_message) > 4000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  if v_phone is not null and length(v_phone) > 40 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if v_company is not null and length(v_company) > 160 then
    raise exception 'invalid_company' using errcode = '22023';
  end if;

  if v_subject is not null and length(v_subject) > 200 then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;

  if v_source_form is not null and length(v_source_form) > 60 then
    v_source_form := left(v_source_form, 60);
  end if;

  -- ── 2. La organizacion existe, esta viva y el sitio le pertenece ──────────
  select o.id, o.status, o.subdomain
    into v_org
    from public.organizations o
   where o.id = p_organization_id;

  if not found then
    raise exception 'organization_not_found' using errcode = '22023';
  end if;

  if coalesce(v_org.status, 'active') in ('deleted', 'suspended') then
    raise exception 'organization_inactive' using errcode = '22023';
  end if;

  -- El sitio publico debe pertenecer a esta organizacion: o tiene subdominio
  -- propio, o tiene un dominio registrado y activo a su nombre.
  if v_org.subdomain is null
     and not exists (
       select 1
         from public.organization_domains d
        where d.organization_id = v_org.id
          and d.is_active is true
     ) then
    raise exception 'organization_without_site' using errcode = '22023';
  end if;

  -- ── 3. Cliente: reutilizar por correo dentro de la organizacion ───────────
  v_first_name := split_part(v_name, ' ', 1);
  v_last_name  := nullif(btrim(substr(v_name, length(v_first_name) + 1)), '');

  select c.id, c.notes
    into v_customer_id, v_existing_notes
    from public.customers c
   where c.organization_id = v_org.id
     and lower(c.email) = v_email
   limit 1;

  if v_customer_id is null then
    insert into public.customers (
      organization_id, email, first_name, last_name, phone,
      company_name, lifecycle_stage, notes
    ) values (
      v_org.id, v_email, v_first_name, v_last_name, v_phone,
      v_company, 'lead', null
    )
    on conflict (organization_id, email) do nothing
    returning id into v_customer_id;

    if v_customer_id is null then
      -- Carrera con otro envio simultaneo: releer la fila ganadora.
      select c.id, c.notes
        into v_customer_id, v_existing_notes
        from public.customers c
       where c.organization_id = v_org.id
         and lower(c.email) = v_email
       limit 1;
    else
      v_customer_new := true;
    end if;
  end if;

  if v_customer_id is null then
    raise exception 'customer_upsert_failed' using errcode = 'P0001';
  end if;

  -- Completar huecos sin pisar datos existentes.
  update public.customers c
     set phone        = coalesce(c.phone, v_phone),
         company_name = coalesce(c.company_name, v_company),
         first_name   = coalesce(nullif(btrim(c.first_name), ''), v_first_name),
         last_name    = coalesce(nullif(btrim(c.last_name), ''), v_last_name),
         updated_at   = now()
   where c.id = v_customer_id;

  -- Guardar el mensaje del visitante en la ficha (es lo que el CRM muestra).
  if v_message <> '' or v_subject is not null then
    v_note := '[Web ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']'
              || coalesce(' ' || v_subject || ':', '')
              || case when v_message <> '' then ' ' || v_message else '' end;

    update public.customers c
       set notes = case
                     when nullif(btrim(coalesce(c.notes, '')), '') is null then v_note
                     else c.notes || E'\n\n' || v_note
                   end,
           updated_at = now()
     where c.id = v_customer_id;
  end if;

  -- ── 4. Pipeline y primera etapa ───────────────────────────────────────────
  select p.id into v_pipeline_id
    from public.pipelines p
   where p.organization_id = v_org.id
     and p.is_default is true
   order by p.created_at asc
   limit 1;

  if v_pipeline_id is null then
    select p.id into v_pipeline_id
      from public.pipelines p
     where p.organization_id = v_org.id
     order by p.created_at asc
     limit 1;
  end if;

  if v_pipeline_id is not null then
    select s.id into v_stage_id
      from public.stages s
     where s.pipeline_id = v_pipeline_id
     order by s.position asc
     limit 1;
  end if;

  -- ── 5. Lead en opportunities (record_type = 'lead') ───────────────────────
  if v_pipeline_id is not null and v_stage_id is not null then
    insert into public.opportunities (
      organization_id, pipeline_id, stage_id, customer_id,
      name, amount, currency, status, source, record_type, metadata
    ) values (
      v_org.id,
      v_pipeline_id,
      v_stage_id,
      v_customer_id,
      left('Contacto Web: ' || coalesce(v_company, v_name, v_email), 255),
      0,
      'COP',
      'open',
      'website',
      'lead',
      jsonb_strip_nulls(jsonb_build_object(
        'channel',     'web_contact_form',
        'form',        v_source_form,
        'subject',     v_subject,
        'message',     nullif(v_message, ''),
        'company',     v_company,
        'captured_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
      ))
    )
    returning id into v_opportunity_id;
  else
    -- Sin pipeline/etapas no se puede crear el lead en el embudo, pero el
    -- contacto y su mensaje YA quedaron guardados en customers: no se pierde
    -- nada. La ruta registra este aviso para que el admin configure el CRM.
    v_crm_warning := case
                       when v_pipeline_id is null then 'no_pipeline'
                       else 'no_stages'
                     end;
  end if;

  return jsonb_build_object(
    'organization_id', v_org.id,
    'customer_id',     v_customer_id,
    'customer_created', v_customer_new,
    'opportunity_id',  v_opportunity_id,
    'crm_warning',     v_crm_warning
  );
end;
$function$
;
