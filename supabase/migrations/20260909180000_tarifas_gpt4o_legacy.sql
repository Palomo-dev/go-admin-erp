-- =============================================================================
-- Tarifas de gpt-4o y gpt-4o-mini (legacy)
--
-- Las 38 organizaciones estan en estos dos modelos y no tenian fila en
-- `provider_pricing`, asi que `calcular_costo_llm()` devolvia NULL y las
-- columnas `ai_jobs.total_cost` y `ai_usage_logs.cost_amount` quedaban vacias:
-- los creditos se contaban, pero el dinero no se podia medir.
--
-- Fuente: docs/crm-revenue-os/ANEXO-B-PROVEEDORES-Y-APIS.md §4.2, linea 519
--   | `gpt-4o` / `gpt-4o-mini` | — | $2.50/$10 · $0.15/$0.60 | legacy |
-- Coincide con la tabla de precios que estaba cableada en `openaiService.ts`
-- antes de eliminarla ($0.0025/$0.01 y $0.00015/$0.0006 por 1K tokens).
--
-- `verified = false` a proposito: el dato viene del ANEXO-B, no de una
-- comprobacion contra la pagina de precios de OpenAI. Quien audite la tarifa
-- debe saber de donde salio.
-- =============================================================================

insert into public.provider_pricing
  (provider, sku, unit, unit_cost_usd, currency, valid_from, verified, source_url, notes)
values
  ('openai', 'gpt_4o_in',       'token_1m_in',  2.50, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'legacy; tomado de ANEXO-B §4.2 (no verificado contra la pagina de OpenAI)'),
  ('openai', 'gpt_4o_out',      'token_1m_out', 10.00, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'legacy; tomado de ANEXO-B §4.2 (no verificado contra la pagina de OpenAI)'),
  ('openai', 'gpt_4o_mini_in',  'token_1m_in',  0.15, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'legacy; tomado de ANEXO-B §4.2 (no verificado contra la pagina de OpenAI)'),
  ('openai', 'gpt_4o_mini_out', 'token_1m_out', 0.60, 'USD', current_date, false,
   'https://openai.com/api/pricing', 'legacy; tomado de ANEXO-B §4.2 (no verificado contra la pagina de OpenAI)')
on conflict do nothing;

-- Conectar los modelos legacy del catalogo con sus SKUs recien cargados.
update public.ai_model_catalog
   set sku_entrada = 'gpt_4o_in',
       sku_salida  = 'gpt_4o_out',
       nota        = 'Legacy. Tarifa tomada del ANEXO-B, sin verificar contra OpenAI.',
       updated_at  = now()
 where provider = 'openai' and model = 'gpt-4o';

update public.ai_model_catalog
   set sku_entrada = 'gpt_4o_mini_in',
       sku_salida  = 'gpt_4o_mini_out',
       nota        = 'Legacy. Tarifa tomada del ANEXO-B, sin verificar contra OpenAI.',
       updated_at  = now()
 where provider = 'openai' and model = 'gpt-4o-mini';
