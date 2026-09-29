-- Reversión de 20260929230100_peso_f4_configurar_peso. Revertir antes
-- 20260929230200 (su comprobación usa fn_codigo_barras_choca_con_peso).

drop function if exists public.codigos_barras_configurar_peso(integer, boolean, text[], text, integer, integer, boolean);
drop function if exists public.fn_codigo_barras_choca_con_peso(text, text, bigint, integer, text[]);
