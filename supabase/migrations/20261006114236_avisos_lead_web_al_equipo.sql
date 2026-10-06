-- Aplicada por MCP el 2026-10-06 (reensayo con el ERP 995026ed y el sitio be7e3a5: ENSAYO_OK). Aviso al equipo cuando entra un lead por la web.
--
-- Estado verificado por MCP antes de escribir esto:
-- - `trg_avisos_miembro_lead` (AFTER INSERT OR UPDATE OF owner_id ON customers)
--   solo avisa al ASIGNADO (`owner_id`). Los leads de la web llegan sin dueño:
--   los 17 `lead_source = 'web_form'` que hay hoy tienen `owner_id` NULL, así
--   que nadie se enteraba.
-- - Los formularios del sitio (contacto, eventos privados, demo) entran por
--   `web_capture_lead`, que INSERTA el cliente con `lead_source` NULL y en un
--   UPDATE posterior pone `lead_source = coalesce(lead_source, 'web_form')` y
--   `metadata.lead.ultima_captura_web.form`. Por eso el disparador escucha
--   también `UPDATE OF lead_source`: en el INSERT todavía no se sabe que es web.
-- - Destinatarios: `fn_avisos_miembro_destinatarios(org, 'crm.leads.view')`
--   (miembros activos con ese permiso, `admin.full_access`, rol 1-2 o super
--   admin), el mismo mecanismo que caja e inventario.
-- - Las organizaciones que hoy reciben leads web (orgs 135, 137 y 145) NO tienen
--   el módulo `crm` activo, sí `clientes`. Por eso el aviso lleva a Leads si hay
--   CRM y a la ficha de Clientes si no. Sin ninguno de los dos, no se avisa.
--
-- Qué hace: amplía `fn_avisos_miembro_lead` con un primer bloque. Si el cliente
-- es lead vivo, sin dueño, y su `lead_source` PASA a `web_form` (o nace así),
-- pone un aviso por destinatario con `fn_avisos_miembro_poner` y pide el correo
-- como los demás avisos. El bloque del asignado queda idéntico.
--
-- Sin duplicados: la llave de idempotencia es
-- `<org>:lead.web:customer:<id>:<destinatario>`, sin marca de tiempo. Un mismo
-- lead avisa una vez por persona aunque vuelva a escribir (además, si ya era
-- `web_form`, el UPDATE no cambia `lead_source` y no entra).
--
-- Evento: se reutiliza `lead.asignado`, que ya admite
-- `member_notices_event_check`. Un evento propio (`lead.web`) exige ampliar
-- ese CHECK, y ampliar un CHECK en Postgres es quitarlo y volver a crearlo: fuera de
-- lo que admite esta ronda. El aviso se distingue por título, por la llave
-- (`lead.web:`) y por `subject_key = 'lead.web:<id>'`. Hoy ningún grupo de
-- preferencias de correo cubre eventos `lead.*` (`reglas.ts`).
--
-- El bloque nuevo va dentro de `begin … exception when others` (como caja y
-- stock): un fallo del aviso nunca tumba la captura del lead del sitio.
--
-- Ensayo 2026-10-06 (bloque `do` que aplica esto, prueba y se deshace con
-- `raise exception`, vía `execute_sql`):
--   ENSAYO_OK web_service_role=2 avisos (2 destinatarios, repetido sin
--   duplicar) href=/app/clientes/<id> cuerpo=[«Visitante Ensayo» escribió
--   desde el formulario de eventos privados. Todavía no tiene responsable.] |
--   authenticated sin dueño=1 (excluye al autor) | nace asignado: web=0
--   asignado=1 | org con CRM=2 href=/app/crm/leads?lead=<id> |
--   anon=[42501 permission denied for function web_capture_lead]
-- (org 145 sin CRM y org 128 con CRM. `web_capture_lead` como service_role,
-- que es como lo llama el sitio, dos veces con el mismo correo. Alta manual
-- como `authenticated` miembro de la org 145.)

create or replace function public.fn_avisos_miembro_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_id uuid;
  v_actor text;
  v_nombre text;
  v_id uuid;
  v_aviso boolean := false;
  v_dest uuid;
  v_key text;
  v_form text;
  v_origen text;
  v_href text;
begin
  -- ── 1. Lead nuevo de la web, sin asignar: aviso a quien ve leads ──────────
  if new.organization_id is not null
     and new.lifecycle_stage is not distinct from 'lead'
     and new.lead_discarded_at is null
     and new.owner_id is null
     and new.lead_source is not distinct from 'web_form'
     and (tg_op = 'INSERT' or old.lead_source is distinct from new.lead_source)
  then
    begin
      -- Con CRM, el aviso lleva a Leads. Sin CRM (lo normal en las tiendas que
      -- reciben leads web hoy), a la ficha en Clientes. Sin ninguno, no hay a
      -- dónde llevar a nadie y no se avisa.
      select case
               when bool_or(m.module_code = 'crm') then '/app/crm/leads?lead=' || new.id::text
               when bool_or(m.module_code = 'clientes') then '/app/clientes/' || new.id::text
             end
        into v_href
        from public.organization_modules m
       where m.organization_id = new.organization_id
         and m.module_code in ('crm', 'clientes')
         and m.is_active = true;

      if v_href is not null then
        v_nombre := nullif(btrim(coalesce(new.full_name, '')), '');
        if v_nombre is null then
          v_nombre := 'Sin nombre';
        end if;
        v_form := nullif(btrim(coalesce(new.metadata #>> '{lead,ultima_captura_web,form}', '')), '');
        v_origen := case
          when v_form = 'private_events' then 'el formulario de eventos privados'
          when v_form = 'saas_demo_cta' then 'la solicitud de demostración'
          when v_form like 'contact%' then 'el formulario de contacto'
          else 'un formulario del sitio web'
        end;
        v_actor_id := auth.uid();

        for v_dest in
          select d.user_id from public.fn_avisos_miembro_destinatarios(new.organization_id, 'crm.leads.view') d
        loop
          v_key := new.organization_id::text || ':lead.web:customer:' || new.id::text || ':' || v_dest::text;
          v_id := public.fn_avisos_miembro_poner(
            new.organization_id, v_dest, v_actor_id,
            'lead.asignado', 'customer', new.id,
            'Llegó un lead desde la web',
            '«' || v_nombre || '» escribió desde ' || v_origen || '. Todavía no tiene responsable.',
            v_href,
            v_key,
            'lead.web:' || new.id::text
          );
          v_aviso := v_aviso or v_id is not null;
        end loop;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- ── 2. Lead asignado: aviso al responsable (misma regla que antes) ────────
  if new.organization_id is not null
     and new.lifecycle_stage is not distinct from 'lead'
     and new.lead_discarded_at is null
     and new.owner_id is not null
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
  then
    v_actor_id := auth.uid();
    v_actor := coalesce(public.fn_avisos_miembro_nombre(v_actor_id), 'Alguien de la organización');
    v_nombre := nullif(btrim(coalesce(new.full_name, '')), '');
    if v_nombre is null then
      v_nombre := 'Sin nombre';
    end if;

    v_id := public.fn_avisos_miembro_poner(
      new.organization_id, new.owner_id, v_actor_id,
      'lead.asignado', 'customer', new.id,
      'Te asignaron un lead',
      v_actor || ' te asignó el lead «' || v_nombre || '».',
      '/app/crm/leads?lead=' || new.id::text,
      'lead.asignado:' || new.organization_id::text || ':' || new.id::text || ':' || new.owner_id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    );
    v_aviso := v_aviso or v_id is not null;
  end if;

  if v_aviso then
    begin
      perform public.fn_crm_cron_post('/api/cron/avisos-miembro', '{"solo":"correo"}'::jsonb);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_avisos_miembro_lead() from public, anon, authenticated;

-- Escucha también `lead_source` (Postgres 15 admite CREATE OR REPLACE TRIGGER).
create or replace trigger trg_avisos_miembro_lead
  after insert or update of owner_id, lead_source on public.customers
  for each row execute function public.fn_avisos_miembro_lead();
