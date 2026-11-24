-- Reversión de 20261123165634_logistica_f1_cuadre_recibir_y_cerrar.
--
-- Solo quita la función. No toca cuadres ni cobros ya hechos. La hoja «Recibir dinero» llama esta
-- RPC: revertir también su código (volver a recibir línea por línea y cerrar).

drop function if exists public.logistica_cuadre_recibir_y_cerrar(uuid, jsonb, text, text, text, text);
