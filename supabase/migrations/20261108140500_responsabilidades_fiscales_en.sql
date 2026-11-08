-- H2 de la nota técnica del Contador (docs/contador/NOTA-TECNICA-TRIBUTARIO-Y-ANTICIPOS-2026-11-07.md, §6):
-- las responsabilidades del RUT de la empresa, VIGENTES EN UNA FECHA, salen del perfil tributario por vigencias.
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- Reversión: supabase/rollbacks/20261108140500_responsabilidades_fiscales_en_rollback.sql
--
-- Causa: fn_perfil_tributario_guardar copia las responsabilidades a organizations.fiscal_responsibilities solo
-- al guardar y solo si la vigencia guardada rige ese día. Una vigencia que empieza después no se aplica sola.
--
-- fn_responsabilidades_fiscales_en(org, fecha):
--   · la vigencia de organization_tax_profiles que rige en `fecha` (vigente_desde ≤ fecha ≤ vigente_hasta o abierta);
--   · si ninguna rige ese día (la organización no tiene perfil, o la fecha es anterior a su primera vigencia):
--     organizations.fiscal_responsibilities, lo que se leía hasta hoy;
--   · fecha NULL = hoy en la zona horaria de la organización (America/Bogota solo como respaldo).
-- SECURITY INVOKER, solo lectura: con la sesión del usuario la RLS de organizations y de organization_tax_profiles
-- (pertenencia) decide qué ve; con el rol de servicio (cola de facturación) lee sin RLS, como ya lo hace hoy.
-- Nace cerrada a anon. No cambia fn_perfil_tributario_guardar ni ningún dato.
--
-- Lectores en el servidor (mismo commit): el motor de documentos (representación gráfica de la factura, la nota
-- crédito y el documento soporte: responsabilidades vigentes en la fecha de emisión) y la verificación del emisor de
-- /api/factus/config (las de hoy). El payload que se envía a Factus NO lleva las responsabilidades del emisor
-- (Factus las toma de la empresa registrada en su cuenta): no cambia.
--
-- Prueba en seco (begin … rollback, org 374; 12 de 12): docs/contador/pruebas/08_responsabilidades_fiscales_en.sql y su .resultado.txt.

create or replace function public.fn_responsabilidades_fiscales_en(p_organization_id integer, p_fecha date default null)
returns text[]
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with org as (
    select o.id,
           o.fiscal_responsibilities,
           coalesce(p_fecha, (now() at time zone coalesce(nullif(o.timezone, ''), 'America/Bogota'))::date) as dia
      from public.organizations o
     where o.id = p_organization_id
  )
  select coalesce(
    (select p.responsabilidades
       from public.organization_tax_profiles p
       join org on org.id = p.organization_id
      where p.vigente_desde <= org.dia
        and (p.vigente_hasta is null or p.vigente_hasta >= org.dia)
      order by p.vigente_desde desc
      limit 1),
    (select org.fiscal_responsibilities from org)
  );
$function$;

comment on function public.fn_responsabilidades_fiscales_en(integer, date) is
  'Responsabilidades del RUT de la organización vigentes en la fecha (perfil tributario por vigencias); sin vigencia que rija: organizations.fiscal_responsibilities. Fecha NULL = hoy en la zona de la organización.';

revoke all on function public.fn_responsabilidades_fiscales_en(integer, date) from public, anon;
grant execute on function public.fn_responsabilidades_fiscales_en(integer, date) to authenticated, service_role;
