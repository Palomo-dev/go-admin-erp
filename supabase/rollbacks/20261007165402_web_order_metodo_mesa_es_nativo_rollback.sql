-- Reversión de 20261007165402_web_order_metodo_mesa_es_nativo: 'mesa' deja de ser nativo
-- (vuelve el defecto: sin aviso al insertar y expiración a los 30 min).
set lock_timeout = '10s';
create or replace function public.fn_web_order_metodo_nativo(p_organization_id integer, p_metodo text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(p_metodo, '') in ('cash', 'transfer')
      or exists (
           select 1
             from public.organization_payment_methods opm
            where opm.organization_id = p_organization_id
              and opm.payment_method_code = p_metodo
              and opm.integration_connection_id is null
         );
$function$;
