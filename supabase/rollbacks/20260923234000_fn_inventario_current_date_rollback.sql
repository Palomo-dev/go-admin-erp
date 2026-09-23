-- Reversion de 20260923234000_fn_inventario_current_date.
--
-- Retira la funcion de inventario. Es aditiva y no la usa ningun camino de
-- negocio: solo la llama scripts/verificar-current-date-en-postgres.mjs desde
-- CI. Quitarla no cambia ni una fila; lo unico que provoca es que el job
-- «Inventario CURRENT_DATE» falle con «no existe la RPC», que es el aviso
-- correcto: sin ella la comprobacion contra la base viva no se puede hacer.
--
-- Antes de aplicarla, retirar tambien el job de
-- .github/workflows/inventario-postgres.yml, o el CI quedara en rojo.

DROP FUNCTION IF EXISTS public.fn_inventario_current_date();
