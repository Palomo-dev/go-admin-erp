-- Rollback de 20261124180000_codigos_ingreso_tienda.sql
--
-- Borra la tabla de códigos de la tienda y la función de búsqueda del usuario de Auth.
-- No restaura datos: los códigos vencen a los 10 minutos y no hay nada que conservar.
-- Antes de aplicarlo, la tienda debe volver a una versión que no use el código propio
-- (si no, entrar con código, registrarse y cambiar la contraseña dejan de funcionar).

drop function if exists public.fn_tienda_usuario_auth_por_correo(text);
drop table if exists public.web_customer_login_codes;
