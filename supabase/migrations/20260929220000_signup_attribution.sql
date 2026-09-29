-- Atribución de campañas de marketing en el registro (contrato de consentimiento
-- del 27-sep-2026, sección «Atribución»; docs/uploads/contrato_consentimiento_atribucion.md;
-- tarea 02 atribución utm-ref).
--
-- Guarda de dónde viene cada organización nueva: UTM, referidos, IDs de clic,
-- ciudad y cómo nos conoció. Se persiste solo cuando la persona crea la cuenta
-- con la casilla de política marcada (separada de Términos). Con
-- marketing_consent=false, no se guardan IDs de clic ni se envía nada a
-- Meta/Google (CAPI, GA4 MP, conversiones offline, públicos). Borrado en cascada
-- con la organización/usuario.

create table if not exists public.signup_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  
  -- UTM parámetros (primer toque)
  utm_source_first text,
  utm_medium_first text,
  utm_campaign_first text,
  utm_content_first text,
  utm_term_first text,
  
  -- UTM parámetros (último toque)
  utm_source_last text,
  utm_medium_last text,
  utm_campaign_last text,
  utm_content_last text,
  utm_term_last text,
  
  -- IDs de clic y tracking (solo con consentimiento de marketing)
  gclid text,
  fbclid text,
  fbp text,
  fbc text,
  ga_client_id text,
  
  -- Navegación
  landing_page text,
  referrer text,
  
  -- Datos del registro
  how_heard text, -- «¿Cómo nos conociste?»
  city text, -- Ciudad obligatoria
  seller_ref text, -- Código de referido de vendedor
  
  -- Consentimiento
  marketing_consent boolean not null default false,
  consent_ts timestamptz,
  
  -- Metadata
  created_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  
  -- Una atribución por organización
  unique (organization_id)
);

-- Índices para búsqueda y análisis
create index idx_signup_attribution_utm_source_first on public.signup_attribution(utm_source_first) where utm_source_first is not null;
create index idx_signup_attribution_utm_campaign_first on public.signup_attribution(utm_campaign_first) where utm_campaign_first is not null;
create index idx_signup_attribution_how_heard on public.signup_attribution(how_heard) where how_heard is not null;
create index idx_signup_attribution_city on public.signup_attribution(city) where city is not null;
create index idx_signup_attribution_created_at on public.signup_attribution(created_at desc);

comment on table public.signup_attribution is 'Atribución de campañas de marketing para cada organización nueva. Solo se guarda con consentimiento de política de privacidad. Sin consentimiento de marketing, no se guardan IDs de clic.';
comment on column public.signup_attribution.marketing_consent is 'Consentimiento de marketing al crear la cuenta (checkbox separado de Términos)';
comment on column public.signup_attribution.how_heard is 'Respuesta a "¿Cómo nos conociste?" en el registro';
comment on column public.signup_attribution.city is 'Ciudad ingresada en el paso de organización';
comment on column public.signup_attribution.seller_ref is 'Código de referido de vendedor (?ref= en la URL)';

-- RLS: solo administradores de GO Admin (super admins) pueden leer.
-- No hay insert/update para anon/authenticated: solo se crea por la función.
alter table public.signup_attribution enable row level security;

create policy "signup_attribution_select_super_admins"
  on public.signup_attribution
  for select
  using (public.is_super_admin(auth.uid()));

-- Función para guardar la atribución al crear la organización.
-- SECURITY DEFINER: valida que auth.uid() sea miembro de la organización
-- (o que el llamador sea service_role). Sanea longitudes y hace
-- on conflict do nothing (idempotente).
create or replace function public.fn_guardar_signup_attribution(
  p_organization_id integer,
  p_attribution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_es_miembro boolean := false;
  v_id uuid;
begin
  -- Validar que el usuario sea miembro de la organización o que sea service_role
  if v_uid is not null then
    select exists(
      select 1 from organization_members
      where organization_id = p_organization_id
        and user_id = v_uid
        and is_active = true
    ) into v_es_miembro;
    
    if not v_es_miembro then
      raise exception 'fn_guardar_signup_attribution: no eres miembro de esta organización' using errcode = '42501';
    end if;
  end if;
  
  -- Sanear longitudes (máximo 200 caracteres por campo según contrato)
  insert into signup_attribution (
    organization_id,
    user_id,
    utm_source_first,
    utm_medium_first,
    utm_campaign_first,
    utm_content_first,
    utm_term_first,
    utm_source_last,
    utm_medium_last,
    utm_campaign_last,
    utm_content_last,
    utm_term_last,
    gclid,
    fbclid,
    fbp,
    fbc,
    ga_client_id,
    landing_page,
    referrer,
    how_heard,
    city,
    seller_ref,
    marketing_consent,
    consent_ts,
    raw
  )
  values (
    p_organization_id,
    v_uid,
    left(nullif(btrim(p_attribution ->> 'utm_source_first'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_medium_first'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_campaign_first'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_content_first'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_term_first'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_source_last'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_medium_last'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_campaign_last'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_content_last'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'utm_term_last'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'gclid'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'fbclid'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'fbp'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'fbc'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'ga_client_id'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'landing_page'), ''), 500),
    left(nullif(btrim(p_attribution ->> 'referrer'), ''), 500),
    left(nullif(btrim(p_attribution ->> 'how_heard'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'city'), ''), 200),
    left(nullif(btrim(p_attribution ->> 'seller_ref'), ''), 100),
    coalesce((p_attribution ->> 'marketing_consent')::boolean, false),
    case when (p_attribution ->> 'consent_ts') is not null then (p_attribution ->> 'consent_ts')::timestamptz else now() end,
    p_attribution
  )
  on conflict (organization_id) do nothing
  returning id into v_id;
  
  return jsonb_build_object('id', v_id, 'created', v_id is not null);
  
exception
  when others then
    -- Los errores se registran pero no bloquean el alta
    raise warning 'fn_guardar_signup_attribution: %', sqlerrm;
    return jsonb_build_object('id', null, 'created', false, 'error', sqlerrm);
end;
$$;

comment on function public.fn_guardar_signup_attribution is 'Guarda la atribución de marketing al crear una organización. Solo se llama con consentimiento de política de privacidad marcado. Idempotente (on conflict do nothing).';

-- Permisos: authenticated y service_role pueden ejecutar
grant execute on function public.fn_guardar_signup_attribution(integer, jsonb) to authenticated, service_role;
