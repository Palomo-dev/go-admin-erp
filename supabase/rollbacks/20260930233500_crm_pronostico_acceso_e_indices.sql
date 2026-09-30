-- Reversión administrativa: restituye la ACL previa, que permite lectura sin aislamiento.
-- Aplicar solo si se acepta expresamente esa exposición. No elimina datos ni índices.
grant select on public.mv_crm_forecast to anon, authenticated;
