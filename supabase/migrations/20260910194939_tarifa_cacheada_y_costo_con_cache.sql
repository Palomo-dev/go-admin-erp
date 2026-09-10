-- Tarifa de entrada cacheada. Sin esto, en cuanto el prompt caching entre, el
-- costo calculado SOBRESTIMA: cobra toda la entrada a tarifa plena.
-- Fuente: ANEXO-B 4.2 -> gpt-5.6-luna $0.20 / $0.02 (cacheado) / $1.20
insert into public.provider_pricing
  (provider, sku, unit, unit_cost_usd, currency, valid_from, verified, source_url, notes)
values
  ('openai', 'gpt_5_6_luna_cached', 'token_1m_in', 0.02, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'entrada cacheada (0.1x); ANEXO-B 4.2'),
  ('openai', 'gpt_5_6_terra_cached', 'token_1m_in', 0.20, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'entrada cacheada (0.1x); ANEXO-B 4.2')
on conflict do nothing;

alter table public.ai_model_catalog
  add column if not exists sku_entrada_cacheada text;

update public.ai_model_catalog set sku_entrada_cacheada = 'gpt_5_6_luna_cached'
 where provider='openai' and model='gpt-5.6-luna';
update public.ai_model_catalog set sku_entrada_cacheada = 'gpt_5_6_terra_cached'
 where provider='openai' and model='gpt-5.6-terra';

-- Version de 4 argumentos. La de 3 se conserva intacta para no romper a quien
-- ya la llama (Edge Function, laboratorio, rutas del asistente).
create or replace function public.calcular_costo_llm(
  p_model            text,
  p_tokens_entrada   integer,
  p_tokens_salida    integer,
  p_tokens_cacheados integer
)
returns numeric
language sql
stable
set search_path = public
as $fn$
  select case
           when pe.unit_cost_usd is null and ps.unit_cost_usd is null then null
           else round(
             -- Los tokens cacheados van a su tarifa; el resto, a tarifa plena.
             greatest(coalesce(p_tokens_entrada,0) - coalesce(p_tokens_cacheados,0), 0)
               / 1000000.0 * coalesce(pe.unit_cost_usd, 0)
           + coalesce(p_tokens_cacheados,0)
               / 1000000.0 * coalesce(pc.unit_cost_usd, pe.unit_cost_usd, 0)
           + coalesce(p_tokens_salida, 0)
               / 1000000.0 * coalesce(ps.unit_cost_usd, 0)
           , 8)
         end
  from public.ai_model_catalog c
  left join public.provider_pricing pe on pe.sku = c.sku_entrada          and pe.valid_to is null
  left join public.provider_pricing ps on ps.sku = c.sku_salida           and ps.valid_to is null
  left join public.provider_pricing pc on pc.sku = c.sku_entrada_cacheada and pc.valid_to is null
  where c.model = p_model or p_model like c.model || '-%'
  order by (c.model = p_model) desc, length(c.model) desc
  limit 1;
$fn$;

revoke all on function public.calcular_costo_llm(text, integer, integer, integer) from public, anon;
grant execute on function public.calcular_costo_llm(text, integer, integer, integer) to authenticated, service_role;

comment on function public.calcular_costo_llm(text, integer, integer, integer) is
  'Costo en USD contra provider_pricing, descontando los tokens servidos desde cache a su tarifa reducida.';
