-- Reversion de 20260910194939_tarifa_cacheada_y_costo_con_cache
--
-- Quita la tarifa de entrada cacheada y la version de 4 argumentos de
-- `calcular_costo_llm`. La version de 3 argumentos NO se toca: es la que usan la
-- Edge Function, el laboratorio y las rutas del asistente.
--
-- Consecuencia de revertir: si el prompt caching esta entrando, el costo pasara
-- a SOBRESTIMAR, porque cobrara toda la entrada a tarifa plena. No se pierde
-- ningun dato historico: `ai_jobs.total_cost` ya esta escrito.

drop function if exists public.calcular_costo_llm(text, integer, integer, integer);

alter table public.ai_model_catalog drop column if exists sku_entrada_cacheada;

delete from public.provider_pricing
 where sku in ('gpt_5_6_luna_cached', 'gpt_5_6_terra_cached');
