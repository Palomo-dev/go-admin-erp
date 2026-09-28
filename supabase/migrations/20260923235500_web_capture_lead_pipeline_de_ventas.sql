-- web_capture_lead: el lead web entra al embudo de VENTAS, o no entra.
--
-- Defecto
-- -------
-- La eleccion de pipeline era, en este orden:
--
--   select p.id from public.pipelines p
--    where p.organization_id = v_org.id and p.is_default is true
--    order by p.created_at asc limit 1;
--
--   if v_pipeline_id is null then
--     select p.id from public.pipelines p          -- <- CUALQUIER tipo
--      where p.organization_id = v_org.id
--      order by p.created_at asc limit 1;
--   end if;
--
-- El respaldo no mira `pipeline_type`: coge el pipeline MAS ANTIGUO de la
-- organizacion, sea de ventas, de onboarding o de renovacion. Y ese respaldo
-- no es teorico: de las 9 organizaciones con pipelines, 2 no tienen ninguno
-- marcado por defecto, y son justo las dos que reciben leads web.
--
-- Consecuencia medida (solo lectura, 2026-09-23): de 42 leads web
-- (`opportunities` con `source='website'` y `record_type='lead'`),
--   * 23 estan en un pipeline de tipo `onboarding` — el mas antiguo de una
--     organizacion cuyo unico otro embudo es de `renewal`: esa organizacion no
--     tiene NINGUN pipeline de ventas, asi que el respaldo lo invento;
--   * 19 estan en un pipeline de tipo `sales`, correcto por tipo, aunque la
--     organizacion tampoco lo tiene marcado por defecto.
--
-- Reproducido en seco antes del arreglo, en transaccion abortada:
--   CASO A (sin default, onboarding mas antiguo que ventas)
--     -> pipeline elegido tipo=onboarding, crm_warning=<null>
--   CASO B (la organizacion NO tiene pipeline de ventas)
--     -> lead creado en onboarding, crm_warning=<null>
-- En los dos casos el lead comercial acaba en un embudo que no es el suyo y
-- nadie se entera: `crm_warning` venia vacio.
--
-- Correccion
-- ----------
--   1. Se elige por TIPO: `coalesce(pipeline_type,'sales') = 'sales'`. La
--      columna es NULL-able con DEFAULT 'sales', asi que un NULL heredado
--      cuenta como ventas y no se pierde ningun embudo legitimo.
--   2. Dentro de los de ventas, primero el marcado `is_default`; a igualdad,
--      el mas antiguo; y `id` como desempate para que sea reproducible.
--   3. Si la organizacion no tiene NINGUN pipeline de ventas, el lead NO se
--      crea en otro embudo: queda constancia por dos vias —un `raise warning`
--      en el log del servidor y `crm_warning = 'no_sales_pipeline'` en el
--      jsonb de respuesta, que la ruta publica ya registra tal cual (es un
--      texto opaco para ella, no una lista cerrada: no rompe su contrato)—.
--      El contacto y su mensaje YA quedaron guardados en `customers` antes de
--      este punto, asi que no se pierde nada del visitante.
--   4. La etapa sigue saliendo del pipeline elegido (`s.pipeline_id =
--      v_pipeline_id`) y nunca de otro: las etapas pertenecen a un solo
--      embudo, y acertar el pipeline pero fallar la etapa dejaria el lead
--      igual de perdido. Se anaden desempates a `order by s.position` por la
--      misma razon de reproducibilidad (hoy no hay posiciones repetidas
--      dentro de un mismo pipeline: verificado, 0 casos).
--
-- Contrato conservado: firma
-- `web_capture_lead(integer,text,text,text,text,text,text,text)`, RETURNS
-- jsonb, volatilidad VOLATILE, `SECURITY DEFINER`, `SET search_path TO
-- 'public', 'pg_temp'`, owner (postgres) y ACL
-- ({postgres=X/postgres,service_role=X/postgres} — sin `anon`, como estaba).
-- `CREATE OR REPLACE`, sin `DROP FUNCTION`, que se llevaria la ACL por
-- delante. Cero UPDATE o DELETE sobre datos existentes: los 23 leads mal
-- colocados se reparan aparte, con la reasignacion de etapa que exige mover
-- una oportunidad de embudo, y lo decide el dueno.

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

  -- ── 4. Pipeline de VENTAS y su primera etapa ──────────────────────────────
  -- Se elige por TIPO, no por antiguedad. `pipeline_type` es NULL-able con
  -- DEFAULT 'sales', asi que un NULL heredado cuenta como ventas. Dentro de
  -- los de ventas manda el marcado por defecto; a igualdad, el mas antiguo,
  -- con el id como desempate para que la eleccion sea reproducible.
  select p.id into v_pipeline_id
    from public.pipelines p
   where p.organization_id = v_org.id
     and coalesce(p.pipeline_type, 'sales') = 'sales'
   order by (p.is_default is true) desc, p.created_at asc, p.id asc
   limit 1;

  if v_pipeline_id is not null then
    -- La etapa sale de ESTE pipeline y de ningun otro: las etapas pertenecen
    -- a un solo embudo, y acertar el pipeline pero fallar la etapa dejaria el
    -- lead igual de perdido.
    select s.id into v_stage_id
      from public.stages s
     where s.pipeline_id = v_pipeline_id
     order by s.position asc, s.created_at asc nulls last, s.id asc
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
    -- Sin pipeline de VENTAS (o sin etapas en el) no se crea el lead, y NO se
    -- cae en el primer embudo que aparezca: un lead comercial dentro de un
    -- embudo de onboarding o de renovacion esta perdido igual que si no se
    -- hubiera creado, y ademas falsea las metricas de ese embudo. El contacto
    -- y su mensaje YA quedaron guardados en customers: no se pierde nada del
    -- visitante. El fallo se registra por dos vias para que sea visible.
    v_crm_warning := case
                       when v_pipeline_id is null then 'no_sales_pipeline'
                       else 'no_stages'
                     end;

    if v_pipeline_id is null then
      raise warning 'web_capture_lead: la organizacion % no tiene ningun pipeline de ventas; el contacto queda en customers sin lead en el embudo', v_org.id;
    else
      raise warning 'web_capture_lead: el pipeline de ventas % de la organizacion % no tiene etapas; el contacto queda en customers sin lead en el embudo', v_pipeline_id, v_org.id;
    end if;
  end if;

  return jsonb_build_object(
    'organization_id', v_org.id,
    'customer_id',     v_customer_id,
    'customer_created', v_customer_new,
    'opportunity_id',  v_opportunity_id,
    'crm_warning',     v_crm_warning
  );
end;
$function$;
