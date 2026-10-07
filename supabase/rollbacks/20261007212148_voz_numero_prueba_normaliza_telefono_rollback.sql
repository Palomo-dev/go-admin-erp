-- Reversión: fn_voz_es_numero_prueba vuelve a comparar el teléfono tal cual (sin normalizar).
-- fn_voz_normalizar_e164 se deja: es pura, sin datos, y no la usa nada más tras la reversión.
create or replace function public.fn_voz_es_numero_prueba(p_org integer, p_phone text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.crm_voice_test_numbers t
     where t.organization_id = p_org
       and t.phone_e164 = p_phone
       and t.removed_at is null
  )
$function$;
