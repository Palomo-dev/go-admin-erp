-- Asistente de campañas de voz · paso 2 «Audiencia» (Figma CRM 1681:856945).
--
-- La vista previa de la audiencia necesita saber, en UNA ida a la base, qué
-- objetivos tienen baja voluntaria para llamadas. La regla ya existe en
-- `fn_can_contact` (do_not_call, metadata.do_not_call, contact_consents y
-- clientes fusionados): aquí solo se aplica a un lote, sin reimplementarla.
--
-- SECURITY INVOKER: corre con los permisos de quien llama; `fn_can_contact`
-- comprueba por su cuenta que la sesión sea miembro activo de la organización.
-- Lote máximo de 1.000 clientes, como `crm_segment_excluded_phones`.

create or replace function public.crm_voice_audiencia_bloqueados(p_org integer, p_customers uuid[])
returns uuid[]
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(cardinality(p_customers), 0) > 1000 then
    raise exception 'lote_invalido' using errcode = '22023';
  end if;
  return coalesce(
    (select array_agg(c) from unnest(p_customers) as c
      where not public.fn_can_contact(p_org, c, 'voice', 'utility')),
    array[]::uuid[]
  );
end;
$function$;

revoke all on function public.crm_voice_audiencia_bloqueados(integer, uuid[]) from public, anon;
grant execute on function public.crm_voice_audiencia_bloqueados(integer, uuid[]) to authenticated, service_role;

comment on function public.crm_voice_audiencia_bloqueados(integer, uuid[]) is
  'Clientes del lote (máx. 1000) que fn_can_contact bloquea para llamadas (baja voluntaria). Vista previa de la audiencia del asistente de campañas de voz.';
