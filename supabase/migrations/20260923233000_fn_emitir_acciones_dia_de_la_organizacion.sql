-- fn_emitir_acciones: el dia contable sale de la organizacion, no de UTC.
--
-- Contexto. La fase D (docs/PROGRESO-zonas-horarias.md, 2026-09-23) barrio las
-- funciones de `public` cuyo cuerpo decidia un dia calendario con
-- `CURRENT_DATE`, que en este servidor (`TimeZone = UTC`) es el dia UTC.
-- `fn_emitir_acciones` quedo fuera del barrido porque **no existia** cuando la
-- fase empezo: la creo otra sesion en paralelo y aparecio al repetir el
-- inventario para el informe de cierre (addendum de esa entrada).
--
-- Que cambia. Dos ocurrencias, las dos deciden un dia contable:
--
--   1. `public.fn_is_period_open(v_org, current_date)` — si el periodo contable
--      esta abierto. Se pregunta por el dia equivocado: una emision hecha a las
--      19:00 de Bogota del ultimo dia de un mes ya cerrado pasa el control
--      porque en UTC ya es el dia 1 del mes siguiente, que sigue abierto; y al
--      reves, una organizacion al este de Greenwich puede verse bloqueada por
--      un dia que para ella todavia no ha llegado.
--   2. `cap_transactions.effective_date` — la fecha efectiva del certificado de
--      acciones. Es una columna `date` (verificado en
--      information_schema.columns), es decir un dia calendario ya fijado: se
--      escribe el dia de la organizacion, no se convierte de zona (regla 5 de
--      docs/reglas-fechas-timezone.md).
--
-- Por que `fn_today_for_org(v_org)` y no `fn_today_for(v_org, v_branch)`:
--
--   - `fn_is_period_open(p_organization_id integer, p_date date)` resuelve
--     contra `fiscal_periods`, que es por ORGANIZACION. La sucursal no entra en
--     la decision. Ademas, en ese punto del cuerpo `v_branch` todavia no esta
--     asignada: se calcula tres lineas mas abajo.
--   - `cap_transactions` **no tiene `branch_id`** (verificado en
--     information_schema.columns: id, shareholder_id, share_class_id, round_id,
--     type, shares, price_per_share_cop, amount_cop, effective_date,
--     certificate_number, counterparty_shareholder_id, subscription_id,
--     document_id, notes, created_by, created_at). El libro de accionistas es de
--     la sociedad entera, no de una sede.
--   - `v_branch` existe solo para rellenar `journal_entries.branch_id`, y se
--     elige como "la sucursal principal activa" de la organizacion contable. Es
--     un relleno, no el lugar donde ocurre el hecho: usar su zona para fechar el
--     certificado seria darle a un dato de la sociedad la zona de una sede
--     elegida por un `order by ... limit 1`.
--
-- Lo que NO cambia. `journal_entries.entry_date` es `timestamptz` y se escribe
-- con `now()`: un instante, no un dia. `issued_at`, `updated_at` y
-- `confirmed_at` igual. Convertirlos a un dia seria el error contrario.
--
-- Se conservan exactamente: firma `(uuid, uuid, text)`, tipo de retorno
-- (`RETURNS TABLE`), `LANGUAGE plpgsql`, volatilidad VOLATILE, `SECURITY
-- DEFINER`, `SET search_path TO 'public', 'pg_temp'`, propietario y ACL
-- (`postgres=X/postgres`, `service_role=X/postgres`; anon y authenticated siguen
-- sin privilegio de ejecucion). Sin sobrecargas nuevas: es un CREATE OR REPLACE
-- sobre la misma firma.
--
-- Prueba en seco antes de aplicar (transaccion abortada con RAISE EXCEPTION,
-- organizacion sintetica movida a `Pacific/Kiritimati`, UTC+14):
--
--   current_date (dia UTC)                        = 2026-09-23
--   fn_today_for_org(v_org)                       = 2026-09-24
--   fn_is_period_open(org, current_date)          = true   (periodo abierto)
--   fn_is_period_open(org, fn_today_for_org(org)) = false  (periodo cerrado)
--
-- Con la organizacion en `America/Bogota` los dos dias coinciden y la prueba no
-- distingue nada: por eso la organizacion de prueba se mueve a UTC+14.

CREATE OR REPLACE FUNCTION public.fn_emitir_acciones(p_subscription_id uuid, p_admin_user_id uuid, p_referencia_tecleada text)
 RETURNS TABLE(certificate_number text, shareholder_id uuid, cap_transaction_id uuid, journal_entry_id integer, nominal_confirmado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub public.investor_subscriptions%rowtype;
  v_kyc public.investor_kyc_records%rowtype;
  v_ronda public.cap_rounds%rowtype;
  v_clase public.cap_share_classes%rowtype;
  v_iu public.investor_users%rowtype;
  v_pago public.investor_payments%rowtype;
  v_org integer := (select value::integer from public.investor_config where key = 'organizacion_contable_id');
  v_cta_bancos text := (select value from public.investor_config where key = 'cuenta_bancos');
  v_cta_capital text := (select value from public.investor_config where key = 'cuenta_capital_suscrito');
  v_cta_prima text := (select value from public.investor_config where key = 'cuenta_prima_colocacion');
  v_branch integer;
  v_dia_contable date;
  v_nominal numeric;
  v_capital numeric;
  v_prima numeric;
  v_accionista uuid;
  v_correo text;
  v_cert text;
  v_tx uuid;
  v_je integer;
  v_memo text;
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = p_admin_user_id and pa.status = 'active') then
    raise exception 'Solo un administrador de plataforma emite acciones' using errcode = '42501';
  end if;

  select * into v_sub from public.investor_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'Suscripción no encontrada' using errcode = 'P0002';
  end if;
  if v_sub.status <> 'paid' then
    raise exception 'Solo se emite una suscripción pagada (estado actual: %)', v_sub.status using errcode = 'P0001';
  end if;
  if p_referencia_tecleada is distinct from v_sub.payment_reference then
    raise exception 'La referencia escrita no coincide' using errcode = 'P0001';
  end if;
  select * into v_pago from public.investor_payments where subscription_id = v_sub.id and status = 'confirmed';
  if not found or v_pago.amount_cop <> v_sub.amount_cop then
    raise exception 'No hay un pago confirmado por el monto total' using errcode = 'P0001';
  end if;
  select * into v_kyc from public.investor_kyc_records where id = v_sub.kyc_record_id;
  if not found or v_kyc.status <> 'approved' then
    raise exception 'El KYC no está aprobado' using errcode = 'P0001';
  end if;

  if v_org is null then
    raise exception 'Falta configurar organizacion_contable_id en investor_config' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = v_cta_bancos)
     or not exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = v_cta_capital)
     or not exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = v_cta_prima) then
    raise exception 'Las cuentas contables configuradas no existen en el plan de cuentas de la organización contable' using errcode = 'P0001';
  end if;

  -- El dia contable es el de la organizacion contable, no el del servidor.
  -- Se resuelve UNA vez y se usa en los dos sitios que deciden un dia, para que
  -- el control del periodo y la fecha efectiva del certificado no puedan caer
  -- en dias distintos si la emision cruza la medianoche local.
  -- Por organizacion y no por sucursal: fiscal_periods es por organizacion y
  -- cap_transactions no tiene branch_id.
  v_dia_contable := public.fn_today_for_org(v_org);

  if not public.fn_is_period_open(v_org, v_dia_contable) then
    raise exception 'El periodo contable está cerrado' using errcode = 'P0001';
  end if;
  select b.id into v_branch from public.branches b where b.organization_id = v_org
  order by (b.is_main and b.is_active) desc, b.is_active desc, b.id limit 1;
  if v_branch is null then
    raise exception 'La organización contable no tiene sucursal' using errcode = 'P0001';
  end if;

  select * into v_ronda from public.cap_rounds where id = v_sub.round_id for update;
  select * into v_clase from public.cap_share_classes where id = v_ronda.share_class_id;
  select * into v_iu from public.investor_users where id = v_sub.investor_user_id for update;

  if v_clase.nominal_confirmado and v_clase.nominal_value_cop is not null then
    v_nominal := v_clase.nominal_value_cop;
  else
    v_nominal := 1000;
  end if;
  v_capital := round(v_sub.shares * least(v_nominal, v_sub.price_per_share_cop), 2);
  v_prima := v_sub.amount_cop - v_capital;
  if not v_clase.nominal_confirmado then
    v_prima := 0;
    v_capital := v_sub.amount_cop;
  end if;

  v_accionista := v_iu.shareholder_id;
  if v_accionista is null then
    select s.id into v_accionista from public.cap_shareholders s
    where s.doc_type = v_kyc.doc_type and upper(s.doc_number) = upper(v_kyc.doc_number) limit 1;
  end if;
  select lower(u.email) into v_correo from auth.users u where u.id = v_iu.auth_user_id;
  if v_accionista is null then
    insert into public.cap_shareholders (type, full_name, doc_type, doc_number, country_code, email, phone, address, status, kyc_status, is_founder)
    values (v_kyc.person_type, v_kyc.full_name, v_kyc.doc_type, v_kyc.doc_number, v_kyc.country_code, v_correo, v_kyc.phone, v_kyc.address, 'active', 'approved', false)
    returning id into v_accionista;
  else
    update public.cap_shareholders set status = 'active', kyc_status = 'approved' where id = v_accionista;
  end if;
  if v_iu.shareholder_id is null then
    update public.investor_users set shareholder_id = v_accionista, role = 'investor', updated_at = now() where id = v_iu.id;
  elsif v_iu.role <> 'investor' then
    update public.investor_users set role = 'investor', updated_at = now() where id = v_iu.id;
  end if;

  v_cert := upper(regexp_replace(v_ronda.code, '[^A-Za-z0-9]', '', 'g')) || '-' ||
            lpad(((select count(*) from public.cap_transactions t where t.round_id = v_ronda.id and t.type = 'issuance') + 1)::text, 6, '0');

  insert into public.cap_transactions (shareholder_id, share_class_id, round_id, type, shares, price_per_share_cop, amount_cop,
                                       effective_date, certificate_number, subscription_id, notes, created_by)
  values (v_accionista, v_ronda.share_class_id, v_ronda.id, 'issuance', v_sub.shares, v_sub.price_per_share_cop, v_sub.amount_cop,
          v_dia_contable, v_cert, v_sub.id, 'Emisión por suscripción ' || v_sub.payment_reference, p_admin_user_id)
  returning id into v_tx;

  v_memo := 'Suscripción de acciones ' || v_cert || ' ref ' || v_sub.payment_reference;
  if not v_clase.nominal_confirmado then
    v_memo := v_memo || ' | ATENCIÓN: valor nominal pendiente de confirmar contra los estatutos antes del cierre contable; se registró todo como capital suscrito (nominal supuesto 1.000, prima 0).';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, currency_code)
  values (v_org, v_branch, now(), v_memo, 'investor_subscription', v_sub.id::text, true, p_admin_user_id, 'COP')
  returning id into v_je;
  insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
  values (v_je, v_org, v_cta_bancos, 'Recaudo suscripción ' || v_sub.payment_reference, v_sub.amount_cop, 0),
         (v_je, v_org, v_cta_capital, 'Capital suscrito y pagado ' || v_cert, 0, v_capital);
  if v_prima > 0 then
    insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
    values (v_je, v_org, v_cta_prima, 'Prima en colocación de acciones ' || v_cert, 0, v_prima);
  end if;
  if (select sum(debit) - sum(credit) from public.journal_lines jl where jl.journal_entry_id = v_je) <> 0 then
    raise exception 'Asiento descuadrado' using errcode = 'P0001';
  end if;

  update public.investor_subscriptions
     set status = 'issued', issued_at = now(), shareholder_id = v_accionista,
         certificate_number = v_cert, journal_entry_id = v_je
   where id = v_sub.id;

  insert into public.investor_notifications (investor_user_id, kind, title, body)
  values (v_iu.id, 'acciones_emitidas', 'Acciones emitidas',
          'Tus acciones quedaron inscritas en el libro de accionistas. Certificado ' || v_cert || '.');

  return query select v_cert, v_accionista, v_tx, v_je, v_clase.nominal_confirmado;
end;
$function$;

comment on function public.fn_emitir_acciones(uuid, uuid, text) is
  'Emite acciones de una suscripcion pagada. El dia contable (control de periodo y effective_date del certificado) sale de fn_today_for_org sobre la organizacion contable; nunca del dia del servidor.';
