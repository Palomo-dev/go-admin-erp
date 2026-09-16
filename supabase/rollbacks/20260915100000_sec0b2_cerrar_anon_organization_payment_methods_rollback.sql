-- 20260915100000_sec0b2_cerrar_anon_organization_payment_methods_rollback.sql
-- Revierte 20260915100000_sec0b2_cerrar_anon_organization_payment_methods.sql
--
-- Restaura el GRANT SELECT a anon y la política abierta al público. Vuelve a exponer la
-- configuración de métodos de pago de todas las organizaciones a cualquiera con la anon
-- key. No toca datos.

GRANT SELECT ON public.organization_payment_methods TO anon;
DROP POLICY IF EXISTS "Allow anon select organization_payment_methods" ON public.organization_payment_methods;
CREATE POLICY "Allow anon select organization_payment_methods"
  ON public.organization_payment_methods FOR SELECT TO public USING (true);
