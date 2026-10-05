-- fn_alta_organizacion pasa a SECURITY DEFINER: escribe la suscripción de la organización
-- que acaba de crear, y la escritura de subscriptions/organization_modules no debe depender
-- de los privilegios de la sesión. Ya exige sesión (auth.uid()) y solo escribe la
-- organización nueva (dueño = la sesión), su sucursal, su membresía y el perfil propio.
-- Ensayado con la escritura de esas tablas cerrada a authenticated: crea organización,
-- suscripción en prueba y módulos básicos.
alter function public.fn_alta_organizacion(jsonb) security definer;
revoke all on function public.fn_alta_organizacion(jsonb) from public, anon;
grant execute on function public.fn_alta_organizacion(jsonb) to authenticated, service_role;
