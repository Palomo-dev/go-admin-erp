-- El catálogo de integraciones resembrado el 2026-11-03 (seeded_by
-- 'catalogo-integraciones-20261103') quedó con UUID nuevos, pero el código cablea los
-- UUID del catálogo del proyecto borrado como constantes:
--   ERP: boldConfig.ts, bookingTypes.ts, expediaTypes.ts, tripadvisorTypes.ts,
--        TripAdvisorContentPanel.tsx, PaymentMethodForm.tsx, channel-manager/page.tsx,
--        whatsapp/oauth/callback y whatsappSyncService.ts.
--   goadmin-websites: webhooks de bold, mercadopago, meta, paypal, payu y stripe,
--        lib/payments/wompi-firma.ts, lib/meta, lib/google-ads y lib/supabase/queries.ts.
-- Con ids distintos, un webhook de pasarela no encuentra su conexión y el Channel
-- Manager enlaza a un proveedor inexistente. Se devuelven al catálogo los UUID que el
-- código espera (fuente: esas constantes), sin tocar el código de pagos.
--
-- Seguro solo mientras no haya conexiones: integration_connections.connector_id y
-- integration_connectors.provider_id no tienen ON UPDATE CASCADE. Si existe alguna
-- conexión, se aborta sin cambiar nada.
--
-- Ensayo (ENSAYO_OK): 27 proveedores y 28 conectores antes y después; 12 proveedores y
-- 15 conectores con el UUID esperado; 0 conectores huérfanos.
-- Rollback: supabase/rollbacks/20261103234026_catalogo_integraciones_ids_que_espera_el_codigo_rollback.sql
do $rekey$
declare
  r record;
  v_cur uuid;
  v_n int;
begin
  if exists (select 1 from public.integration_connections) then
    raise exception 'REKEY_ABORTADO: ya hay % conexiones; reasignar ids rompería sus FK',
      (select count(*) from public.integration_connections);
  end if;

  -- 1) Proveedores: se recrea la fila con el UUID esperado, se mueven sus conectores y se
  --    retira la fila con el UUID provisional (no tiene nada más que la referencie).
  for r in select * from (values
      ('booking',     'd379fcab-12ad-41c7-80f9-91c66373d72f'::uuid),
      ('expedia',     '11d341a0-bf31-4288-abba-9033050061dc'::uuid),
      ('tripadvisor', '7a497612-d4a0-4314-8fd6-effc49c99661'::uuid),
      ('wompi',       '46c3d81f-c515-49ed-9067-958bcd50e946'::uuid),
      ('payu',        '1084bdca-1c07-4989-a3d8-8169de72e6c0'::uuid),
      ('mercadopago', 'ef7a28a1-f698-4518-91ed-c15166728bd3'::uuid),
      ('stripe',      '7d9abb20-5bbb-410c-b4da-c2231511be34'::uuid),
      ('paypal',      '18bee38f-9d27-4360-b2e3-3274bbb0b2d9'::uuid),
      ('bancolombia', '4befaa82-4a82-459d-bb9c-f508aa953542'::uuid),
      ('breb',        '487d94de-4273-4b42-a49b-27250ed05fc7'::uuid),
      ('redeban',     'a32ba5c2-064a-4041-b368-c4a2f1f8e4c9'::uuid),
      ('bold',        '67e3749b-d8e5-4c0a-ab23-309e46064cad'::uuid)
    ) t(code, id_esperado) loop
    select id into v_cur from public.integration_providers where code = r.code;
    if v_cur is null then
      raise exception 'REKEY: falta el proveedor %', r.code;
    end if;
    continue when v_cur = r.id_esperado;

    update public.integration_providers set code = code || '__rekey' where id = v_cur;
    insert into public.integration_providers
      (id, code, name, category, auth_type, website_url, docs_url, logo_url, is_active, metadata, created_at, updated_at)
    select r.id_esperado, r.code, name, category, auth_type, website_url, docs_url, logo_url, is_active,
           coalesce(metadata, '{}'::jsonb) || jsonb_build_object('id_restaurado', '2026-11-03'), created_at, now()
      from public.integration_providers where id = v_cur;
    update public.integration_connectors set provider_id = r.id_esperado where provider_id = v_cur;
    delete from public.integration_providers where id = v_cur;
  end loop;

  -- 2) Conectores: nadie los referencia (0 conexiones), se reasigna el id directamente.
  for r in select * from (values
      ('bold_link',           '6d732ae3-e9ff-41be-9d75-aa29ba86d927'::uuid),
      ('bold_pos',            '5ddaf08b-cd11-41b8-b772-350ca176239a'::uuid),
      ('mp_checkout',         'b00cfe3f-efa6-4656-93da-f42bf3073ab4'::uuid),
      ('meta_marketing',      '1894a4af-4be2-46a6-b342-ab734d4e0479'::uuid),
      ('paypal_checkout',     '944c6b76-e8bf-49f9-90ea-06f906e152e7'::uuid),
      ('payu_co',             'dc652aa4-5146-45cc-9df7-f58c7098ad00'::uuid),
      ('stripe_payments',     'a2b84a76-9557-4fee-88ba-8ee517ed8b88'::uuid),
      ('wompi_co',            '39950173-5f7c-48a9-a242-c6fdf5a07aee'::uuid),
      ('google_ads',          '876a3948-ddd2-4a80-9ffe-ed6d3882aa04'::uuid),
      ('whatsapp_cloud',      '9ba81290-1272-4cf1-9dc5-a06feb762d21'::uuid),
      ('booking_ota',         'eabc8169-3c24-46e9-94ee-8efac2d2d43e'::uuid),
      ('booking_ical',        'd5c764da-5ee7-4df0-8837-28b04302db9f'::uuid),
      ('expedia_ota',         'c189e389-12c7-4384-9a2d-e35a90316daa'::uuid),
      ('expedia_ical',        'b448f1a3-18b4-418e-98e4-a8b3df6a37f1'::uuid),
      ('tripadvisor_content', 'b8c3e7a1-2f4d-4a9b-8e1c-3d5f7a9b1c2e'::uuid)
    ) t(code, id_esperado) loop
    update public.integration_connectors
       set id = r.id_esperado,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('id_restaurado', '2026-11-03')
     where code = r.code and id <> r.id_esperado;
    get diagnostics v_n = row_count;
    if v_n = 0 and not exists (select 1 from public.integration_connectors where id = r.id_esperado and code = r.code) then
      raise exception 'REKEY: falta el conector %', r.code;
    end if;
  end loop;
end
$rekey$;
