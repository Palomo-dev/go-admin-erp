-- Reversión deliberadamente sin DROP: los dos índices solo soportan FK existentes.
-- No cambia APIs, permisos, evidencia ni saldos; se conservan al revertir el consumidor.
do $rollback$ begin null; end $rollback$;
