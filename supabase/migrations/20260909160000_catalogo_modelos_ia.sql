-- =============================================================================
-- Fase 5.2/5.3 — Catalogo de modelos de IA y costo real
--
-- Problema:
--   - `AI_PROVIDERS` estaba cableado en aiSettingsService.ts con modelos
--     obsoletos (gpt-4-turbo, o1, claude-3-*, gemini-pro) que ademas no
--     coincidian con providerRegistry.ts.
--   - `openaiService.calculateCost()` tenia su propia tabla de precios muerta
--     que no conocia ninguno de los modelos en uso: caia siempre al precio de
--     gpt-4o-mini.
--   - `ai_jobs.total_cost` y `ai_usage_logs.cost_amount` estaban NULL en los
--     2.364 trabajos registrados.
--
-- Ahora el catalogo vive en la base y el costo se calcula contra
-- `provider_pricing`, que es la tarifa que el equipo ya mantiene.
--
-- Datos de contexto y tarifas: docs/crm-revenue-os/ANEXO-B-PROVEEDORES-Y-APIS.md
-- (secciones 5.1 OpenAI y 5.2 Google). No se inventa ninguna capacidad: lo que
-- no esta verificado queda NULL y la interfaz lo muestra como "—".
-- =============================================================================

create table if not exists public.ai_model_catalog (
  id             bigserial primary key,
  provider       text    not null,
  model          text    not null,
  label          text    not null,
  -- SKUs de provider_pricing. NULL = sin tarifa cargada -> costo no calculable.
  sku_entrada    text,
  sku_salida     text,
  -- Ventana de contexto en tokens de entrada. NULL = no verificado.
  contexto_tokens bigint,
  soporta_vision boolean,
  -- economico | equilibrado | premium | legacy
  gama           text    not null default 'equilibrado',
  recomendado    boolean not null default false,
  is_active      boolean not null default true,
  orden          integer not null default 100,
  nota           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ai_model_catalog_model_uk unique (provider, model),
  constraint ai_model_catalog_gama_ck check (gama in ('economico','equilibrado','premium','legacy'))
);

comment on table public.ai_model_catalog is
  'Modelos de IA que se pueden elegir en /crm/ia. Las tarifas NO viven aqui: se leen de provider_pricing por SKU.';
comment on column public.ai_model_catalog.contexto_tokens is
  'Ventana de contexto verificada. NULL cuando no hay dato confirmado: no se inventa.';

-- Catalogo global, de solo lectura para los inquilinos.
alter table public.ai_model_catalog enable row level security;

drop policy if exists ai_model_catalog_lectura on public.ai_model_catalog;
create policy ai_model_catalog_lectura on public.ai_model_catalog
  for select to authenticated using (true);

grant select on public.ai_model_catalog to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Semilla
-- -----------------------------------------------------------------------------
insert into public.ai_model_catalog
  (provider, model, label, sku_entrada, sku_salida, contexto_tokens, soporta_vision, gama, recomendado, orden, nota)
values
  ('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna',
   'gpt_5_6_luna_in', 'gpt_5_6_luna_out', 1048576, null, 'economico', true, 10,
   'Gama barata de la familia 5.6. Reemplazo oficial de gpt-4.1-nano.'),

  ('openai', 'gpt-5.6-terra', 'GPT-5.6 Terra',
   'gpt_5_6_terra_in', 'gpt_5_6_terra_out', 1048576, null, 'premium', false, 20,
   'Diez veces mas caro que Luna. Solo si las respuestas lo justifican.'),

  ('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash',
   'gemini_3_8_flash_in', 'gemini_3_8_flash_out', 1048576, null, 'equilibrado', false, 30,
   'Precio promocional hasta 2026-12-31; sube a 1,50/7,50 USD por millon en 2027.'),

  ('openai', 'gpt-4o', 'GPT-4o (legacy)',
   null, null, null, true, 'legacy', false, 90,
   'Sin tarifa cargada en provider_pricing: su costo no se puede calcular.'),

  ('openai', 'gpt-4o-mini', 'GPT-4o Mini (legacy)',
   null, null, null, true, 'legacy', false, 91,
   'Sin tarifa cargada en provider_pricing: su costo no se puede calcular.')
on conflict (provider, model) do update set
  label           = excluded.label,
  sku_entrada     = excluded.sku_entrada,
  sku_salida      = excluded.sku_salida,
  contexto_tokens = excluded.contexto_tokens,
  soporta_vision  = excluded.soporta_vision,
  gama            = excluded.gama,
  recomendado     = excluded.recomendado,
  orden           = excluded.orden,
  nota            = excluded.nota,
  updated_at      = now();

-- -----------------------------------------------------------------------------
-- Costo real de una generacion
--
-- Devuelve NULL —no cero— cuando el modelo no tiene tarifa cargada. Un cero
-- diria "esto no costo nada", que es falso; NULL dice "no lo se", que es cierto.
-- -----------------------------------------------------------------------------
create or replace function public.calcular_costo_llm(
  p_model             text,
  p_tokens_entrada    integer,
  p_tokens_salida     integer
)
returns numeric
language sql
stable
set search_path = public
as $fn$
  select case
           when pe.unit_cost_usd is null and ps.unit_cost_usd is null then null
           else round(
             coalesce(p_tokens_entrada, 0) / 1000000.0 * coalesce(pe.unit_cost_usd, 0)
           + coalesce(p_tokens_salida, 0)  / 1000000.0 * coalesce(ps.unit_cost_usd, 0)
           , 8)
         end
  from public.ai_model_catalog c
  left join public.provider_pricing pe
    on pe.sku = c.sku_entrada and pe.valid_to is null
  left join public.provider_pricing ps
    on ps.sku = c.sku_salida and ps.valid_to is null
  where c.model = p_model
  limit 1;
$fn$;

comment on function public.calcular_costo_llm(text, integer, integer) is
  'Costo en USD de una generacion, calculado contra provider_pricing. NULL si el modelo no tiene tarifa cargada.';

grant execute on function public.calcular_costo_llm(text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vista para la interfaz: catalogo + tarifa vigente
-- -----------------------------------------------------------------------------
create or replace view public.ai_modelos_disponibles as
select
  c.provider,
  c.model,
  c.label,
  c.gama,
  c.recomendado,
  c.contexto_tokens,
  c.soporta_vision,
  c.orden,
  c.nota,
  pe.unit_cost_usd as costo_entrada_usd_millon,
  ps.unit_cost_usd as costo_salida_usd_millon,
  (pe.unit_cost_usd is not null or ps.unit_cost_usd is not null) as tarifa_cargada
from public.ai_model_catalog c
left join public.provider_pricing pe on pe.sku = c.sku_entrada and pe.valid_to is null
left join public.provider_pricing ps on ps.sku = c.sku_salida and ps.valid_to is null
where c.is_active
order by c.orden;

grant select on public.ai_modelos_disponibles to authenticated, service_role;

notify pgrst, 'reload schema';
