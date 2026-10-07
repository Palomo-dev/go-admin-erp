-- Números de prueba: el teléfono del cliente se normaliza a E.164 antes de compararlo.
-- crm_voice_test_numbers guarda E.164 (normalizarNumeroRne en TS), pero customers.phone puede
-- venir con espacios («+57 3042632496»): la comparación exacta fallaba y el número de prueba
-- seguía con el tope de 2 intentos por día (org 125, 2026-10-07). Mismo criterio que
-- normalizarNumeroRne (src/lib/services/crm/voiceAgent/rne.ts).
create or replace function public.fn_voz_normalizar_e164(p_raw text)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_texto text := btrim(coalesce(p_raw, ''));
  v_dig text;
  v_e164 text;
begin
  if v_texto = '' then return null; end if;
  v_dig := regexp_replace(v_texto, '\D', '', 'g');
  if v_dig = '' then return null; end if;
  if left(v_texto, 1) = '+' then v_e164 := '+' || v_dig;
  elsif length(v_dig) = 12 and left(v_dig, 2) = '57' then v_e164 := '+' || v_dig;
  elsif length(v_dig) = 10 and (left(v_dig, 1) = '3' or left(v_dig, 2) = '60') then v_e164 := '+57' || v_dig;
  elsif length(v_dig) = 11 and (left(v_dig, 2) = '03' or left(v_dig, 3) = '060') then v_e164 := '+57' || substr(v_dig, 2);
  else return null;
  end if;
  if v_e164 !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  return v_e164;
end;
$function$;

revoke all on function public.fn_voz_normalizar_e164(text) from public, anon;
grant execute on function public.fn_voz_normalizar_e164(text) to authenticated, service_role;

create or replace function public.fn_voz_es_numero_prueba(p_org integer, p_phone text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.crm_voice_test_numbers t
     where t.organization_id = p_org
       and t.phone_e164 = public.fn_voz_normalizar_e164(p_phone)
       and t.removed_at is null
  )
$function$;
