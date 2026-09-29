-- Reversión de 20260929180000_clientes_busqueda_unica.sql
-- Aplicar DESPUÉS de las reversiones de 20260929180200 y 20260929180100.
-- Las pantallas que llaman fn_clientes_buscar dejan de buscar hasta revertir
-- también el código.

drop function if exists public.fn_clientes_buscar(integer, text, integer, integer, text, text);
drop function if exists public.fn_clientes_buscar_ids(integer, text, text, text);
drop index if exists public.idx_customers_busqueda_trgm;
drop function if exists public.fn_clientes_texto_busqueda(text, text, text, text, text, text, text);
drop function if exists public.fn_clientes_palabras(text);
