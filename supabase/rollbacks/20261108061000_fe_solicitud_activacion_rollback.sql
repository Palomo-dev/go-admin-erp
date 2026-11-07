-- Reversión de 20261108061000_fe_solicitud_activacion.sql (solicitud de activación
-- del servicio de facturación electrónica). Borra la función y la tabla: si ya hay
-- solicitudes, respaldarlas antes.

drop function if exists public.fn_fe_solicitar_activacion(integer, text);
drop table if exists public.einvoicing_activation_requests;
