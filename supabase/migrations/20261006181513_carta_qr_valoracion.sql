-- Aplicada el 2026-10-06 18:15:13 UTC con apply_migration (versión 20261006181513).
-- Carta QR en la mesa · 4/4 — «Valorar la visita».
-- Figma «16 Sitio web» 2032:75742, lámina 10, y lámina 20 «Conectado».
--
-- Decisión (coordinador, 2026-10-06): la valoración desde la mesa va en una tabla PROPIA y
-- aditiva. `pos_display_feedback` (pantalla del cliente del POS) exige terminal_id NOT NULL y
-- conserva su contrato; el POS lee las dos.
--
-- Qué hace (aditivo):
-- 1. `table_visit_feedback`: organización, sede, mesa, sesión, venta, puntaje 1–5, aspectos
--    (lista corta del editor: «La comida», «El servicio»…), comentario opcional, comensal y abono
--    en línea (si valoró después de pagar). RLS de lectura para miembros con acceso a la sede;
--    escritura solo por la RPC.
-- 2. `fn_mesa_valorar(org, mesa, puntaje, aspectos, comentario, comensal, abono)` (service
--    role): exige la sesión ACTIVA de la mesa o la que se cerró hace menos de 2 horas (se valora
--    al pagar, y el equipo suele cerrar la mesa en ese momento; pasado ese rato, una foto del QR
--    ya no deja opinar sobre una visita ajena). Tope de 12 valoraciones por sesión.
--
-- Verificado por MCP (2026-10-06): table_sessions (closed_at, status completed),
-- pos_display_feedback (terminal_id NOT NULL, 0 filas: no se toca).
-- Depende de 20261006180921 (fn_mesa_qr_texto) y 20261006181437 (table_online_payments).
--
-- ENSAYO (2026-10-06, execute_sql: UN bloque `do` con las 4 migraciones 20261006180921…181513
-- enteras —sin comentarios— y las pruebas, que se deshace con `raise exception`. Org 140, sede
-- 115, Mesa 1 con sesión activa (venta de 83.000, 3 líneas) y Mesa 2 libre; una conexión Wompi
-- sandbox y su método de pago creados DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK anon_pedido=42501 anon_solicitar=42501 anon_cuenta=42501 anon_resultado=42501
--   anon_valorar=42501 anon_atender=42501 anon_lee_solicitudes=42501 anon_lee_abonos=42501
--   anon_lee_valoraciones=42501 | auth_pedido=42501 auth_solicitar=42501 auth_abono=42501
--   auth_resultado=42501 auth_valorar=42501 auth_insert=42501 | sin_sesion=SIN_SESION
--   pedido_sin_sesion=null/0 otra_org=P0002 MESA_INVALIDA solicitar=true:open:mesero=<nombre>
--   repetido=true:true cancelar=true cuenta=true:bill_requested:bill_requested
--   cuenta_repetida=true avisos=2 aviso_cuenta=[Mesa 1 pide la cuenta | /app/pos/mesas/<mesa>]
--   | pedido: sesion=bill_requested rondas=3 total=83000.00 items_r1=1 estado_r1=servida
--   solicitudes=1 | cuenta: total=83000.00 saldo=83000.00 pasarela=null comensales=2
--   abono_sin_pasarela=SIN_PASARELA | iguales_visto_mal=MONTO_CAMBIO:41500.00
--   iguales=true:41500.00+4150.00:wompi_co:ref_ok=true en_curso=PAGO_EN_CURSO monto_bajo=MONTO
--   otra_org=42501 pago=paid:saldo=41500.00 repetido=YA_PROCESADO
--   pagos=1:invoice_sales/wompi/45650.00/carta_qr/tx-ensayo-1 abonado_lineas=41500.00
--   tip=4150.00 venta=pending/partial/41500.00 tips=1 | cuenta2: pagado=45650.00 saldo=41500.00
--   abonos=1 pend_comensal0=14500.00 resto=41500.00 pago2=paid:saldo=0.00
--   pago_que_excede=paid_unapplied:NO_APLICADO:venta_ya_pagada tras_pagar=CUENTA_PAGADA
--   venta_final=paid/paid/0.00 lineas_sin_pagar=0 avisos_pago=3 valorar_activa=true |
--   cerrada_pedido=null cerrada_solicitar=SIN_SESION valorar=true:El servicio+La comida:4
--   valorar_6=22023 valorar_sin_sesion=SIN_SESION | auth_lee_solicitudes=2 auth_lee_abonos=3
--   auth_lee_valoraciones=2 atender_ack=ack ack_otra_vez=false done=done actor_ajeno=42501
--   otra_org=42501
-- Lectura: anon y authenticated no ejecutan ninguna RPC pública ni leen/escriben las tablas
-- nuevas (authenticated miembro sí lee por RLS y atiende con la RPC de staff). Sin sesión
-- activa todo responde SIN_SESION. Otra organización: MESA_INVALIDA / 42501. El abono reparte
-- con pos_checkout_v1 (paid_amount 41.500 en líneas, propina 4.150 en sales.tip_amount y tips,
-- pago invoice_sales/wompi con origen carta_qr y la transacción); el mismo evento dos veces =
-- YA_PROCESADO; un segundo abono que llega con la cuenta ya pagada queda paid_unapplied con
-- aviso (venta_ya_pagada). Archivo del ensayo: no se versiona (scratchpad).

set lock_timeout = '10s';

create table if not exists public.table_visit_feedback (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  branch_id            integer not null references public.branches(id) on delete cascade,
  restaurant_table_id  uuid not null references public.restaurant_tables(id) on delete cascade,
  table_session_id     uuid not null references public.table_sessions(id) on delete cascade,
  sale_id              uuid null references public.sales(id) on delete set null,
  online_payment_id    uuid null references public.table_online_payments(id) on delete set null,
  rating               smallint not null check (rating between 1 and 5),
  aspects              text[] null check (aspects is null or cardinality(aspects) <= 8),
  comment              text null check (comment is null or char_length(comment) <= 1000),
  diner_label          text null check (diner_label is null or char_length(diner_label) <= 40),
  created_at           timestamptz not null default now()
);

comment on table public.table_visit_feedback is
  'Carta QR: valoración de la visita desde la mesa (puntaje, aspectos y comentario). Se escribe solo por fn_mesa_valorar. Sin datos personales.';
comment on column public.table_visit_feedback.aspects is 'Lo que el comensal marcó como «lo mejor» (textos de la sección «Valorar la visita»).';

create index if not exists idx_table_visit_feedback_org on public.table_visit_feedback (organization_id, created_at desc);
create index if not exists idx_table_visit_feedback_sesion on public.table_visit_feedback (table_session_id);

alter table public.table_visit_feedback enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'table_visit_feedback'
                   and policyname = 'table_visit_feedback_select_miembros') then
    create policy table_visit_feedback_select_miembros on public.table_visit_feedback
      for select to authenticated
      using (
        organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active = true)
        and public.app_branch_access(branch_id)
      );
  end if;
end $$;

revoke all on public.table_visit_feedback from anon, public;
revoke insert, update, delete, truncate on public.table_visit_feedback from authenticated;
grant select on public.table_visit_feedback to authenticated;
grant all on public.table_visit_feedback to service_role;

create or replace function public.fn_mesa_valorar(
  p_organization_id integer,
  p_table_id uuid,
  p_rating integer,
  p_aspectos text[] default null,
  p_comentario text default null,
  p_comensal text default null,
  p_abono_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_mesa public.restaurant_tables%rowtype;
  v_ses public.table_sessions%rowtype;
  v_aspectos text[];
  v_abono uuid;
  v_id uuid;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_mesa from public.restaurant_tables rt
   where rt.id = p_table_id and rt.organization_id = p_organization_id;
  if v_mesa.id is null then
    raise exception 'MESA_INVALIDA' using errcode = 'P0002';
  end if;
  -- La sesión activa, o la última cerrada hace menos de 2 horas.
  select * into v_ses from public.table_sessions ts
   where ts.restaurant_table_id = v_mesa.id and ts.organization_id = p_organization_id
     and (ts.status in ('active', 'bill_requested')
          or (ts.status = 'completed' and ts.closed_at > now() - interval '2 hours'))
   order by (ts.status <> 'completed') desc, ts.opened_at desc nulls last
   limit 1;
  if v_ses.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_SESION');
  end if;
  if (select count(*) from public.table_visit_feedback f where f.table_session_id = v_ses.id) >= 12 then
    return jsonb_build_object('ok', false, 'motivo', 'LIMITE');
  end if;

  select array_agg(x) into v_aspectos
    from (select distinct public.fn_mesa_qr_texto(a, 60) as x
            from unnest(coalesce(p_aspectos, '{}'::text[])) a) s
   where x is not null;
  if v_aspectos is not null and cardinality(v_aspectos) > 8 then
    v_aspectos := v_aspectos[1:8];
  end if;
  if p_abono_id is not null then
    select a.id into v_abono from public.table_online_payments a
     where a.id = p_abono_id and a.table_session_id = v_ses.id;
  end if;

  insert into public.table_visit_feedback (organization_id, branch_id, restaurant_table_id, table_session_id, sale_id,
                                           online_payment_id, rating, aspects, comment, diner_label)
  values (p_organization_id, v_mesa.branch_id, v_mesa.id, v_ses.id, v_ses.sale_id, v_abono, p_rating::smallint,
          v_aspectos, public.fn_mesa_qr_texto(p_comentario, 1000), public.fn_mesa_qr_texto(p_comensal, 40))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

comment on function public.fn_mesa_valorar(integer, uuid, integer, text[], text, text, uuid) is
  'Carta QR: guarda la valoración de la visita (sesión activa o cerrada hace < 2 h; tope 12 por sesión). Service role.';

revoke all on function public.fn_mesa_valorar(integer, uuid, integer, text[], text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_valorar(integer, uuid, integer, text[], text, text, uuid) to service_role;
