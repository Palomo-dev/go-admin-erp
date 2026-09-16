-- ROLLBACK de 20260916050000_f10_fn_register_crm_payment
-- Efecto: desaparece la RPC transaccional. El servicio Node
-- (`registerCrmPayment`) la invoca por `rpc('fn_register_crm_payment')`, así
-- que revertir SOLO la BD deja el registro de pagos respondiendo
-- «Error registrando pago: function … does not exist»: hay que revertir
-- también el commit de `paymentService.ts` (vuelve a la versión de N llamadas
-- desde Node, con la carrera de saldo documentada como deuda A4).
-- No toca datos: los pagos ya registrados por la función se conservan.
DROP FUNCTION IF EXISTS public.fn_register_crm_payment(integer, uuid, numeric, text, text, text, timestamptz, jsonb, uuid, integer);
