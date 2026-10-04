-- Revertir primero el consumidor de la aplicación. Solo retira vistas;
-- no transforma ni elimina actividades, notas, tareas, correos o clientes.
-- Sin CASCADE: una dependencia nueva exige revisión en lugar de eliminarla.
DROP VIEW IF EXISTS public.crm_customer_email_messages;
DROP VIEW IF EXISTS public.crm_customer_stage_history;
DROP VIEW IF EXISTS public.crm_customer_tasks;
DROP VIEW IF EXISTS public.crm_customer_notes;
DROP VIEW IF EXISTS public.crm_customer_activities;
