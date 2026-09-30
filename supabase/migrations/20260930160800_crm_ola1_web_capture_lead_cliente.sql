-- CRM ola 1 · D2 — la captura web deja de crear oportunidades 'lead'.
--
-- Decisión del dueño (2026-09-29): un lead ES un cliente con
-- lifecycle_stage = 'lead'; las 42 oportunidades record_type = 'lead' que ya
-- existen se muestran en Oportunidades con la etiqueta «Lead» y NO se crean
-- nuevas. `web_capture_lead` (formulario de contacto de los sitios públicos,
-- repo goadmin-websites → app/api/contact) era el último escritor de ese tipo:
--
--   · conserva TODO lo anterior (validación, organización con sitio propio,
--     cliente por correo, completar huecos, mensaje en notes);
--   · en vez de insertar la oportunidad, marca el cliente como lead:
--     lead_source = 'web_form' (si no tenía origen), metadata.lead.ultima_captura_web
--     { channel, form, subject, company, captured_at } y reactiva el lead si
--     estaba descartado;
--   · el contrato de retorno no cambia de forma: opportunity_id y crm_warning
--     vuelven siempre NULL. Verificado en goadmin-websites: ambos se leen como
--     opcionales (solo se registran), así que el sitio no necesita cambio.
--
-- Sin cambios de permisos: sigue SECURITY DEFINER con EXECUTE solo para
-- service_role (se reafirma abajo).
--
-- Rollback: supabase/rollbacks/20260930160800_crm_ola1_web_capture_lead_cliente_rollback.sql
-- (restaura la versión viva anterior, md5 de prosrc 510aeb85780eaa6466266992356467de).

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
  v_opportunity_id  uuid;
  v_note            text;
  v_existing_notes  text;
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

  -- ── 4. CRM ola 1 (D2, 2026-09-29): el lead ES el cliente ──────────────────
  -- Ya no se crea una oportunidad `record_type='lead'`: el contacto web queda
  -- como cliente en etapa lead con origen «Formulario web» y la oportunidad la
  -- crea «Calificar» en el CRM. Por eso tampoco hace falta un embudo de ventas
  -- para no perder el lead: `opportunity_id` y `crm_warning` se devuelven
  -- siempre NULL (el sitio los trata como opcionales).
  update public.customers c
     set lead_source = coalesce(c.lead_source, 'web_form'),
         metadata    = coalesce(c.metadata, '{}'::jsonb)
                       || jsonb_build_object('lead',
                            coalesce(c.metadata -> 'lead', '{}'::jsonb)
                            || jsonb_build_object('ultima_captura_web', jsonb_strip_nulls(jsonb_build_object(
                                 'channel',     'web_contact_form',
                                 'form',        v_source_form,
                                 'subject',     v_subject,
                                 'company',     v_company,
                                 'captured_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
                               )))),
         -- Un lead descartado que vuelve a escribir se reactiva.
         lead_discarded_at   = case when c.lifecycle_stage = 'lead' then null else c.lead_discarded_at end,
         lead_discard_reason = case when c.lifecycle_stage = 'lead' then null else c.lead_discard_reason end,
         lead_discarded_by   = case when c.lifecycle_stage = 'lead' then null else c.lead_discarded_by end,
         updated_at  = now()
   where c.id = v_customer_id
     and c.organization_id = v_org.id;

  return jsonb_build_object(
    'organization_id', v_org.id,
    'customer_id',     v_customer_id,
    'customer_created', v_customer_new,
    'opportunity_id',  v_opportunity_id,
    'crm_warning',     null::text
  );
end;
$function$;

revoke all on function public.web_capture_lead(integer, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.web_capture_lead(integer, text, text, text, text, text, text, text) to service_role;
