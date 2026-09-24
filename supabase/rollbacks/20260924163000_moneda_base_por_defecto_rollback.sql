-- Rollback de 20260924163000_moneda_base_por_defecto.sql
--
-- Restaura los DEFAULT literales tal como estaban el 2026-09-24, quita los
-- triggers, devuelve el literal a las cuatro funciones y borra las dos
-- funciones nuevas. No toca datos: la migración tampoco los tocó. Las filas
-- insertadas mientras estuvo activa conservan la moneda base que recibieron.

-- 1. Literales de vuelta en las funciones (reemplazo inverso verificado).
do $$
declare
  r record;
  v_def text;
  v_n integer;
begin
  for r in
    select * from (values
      ('public.fn_create_commission_on_sale()',
       E'        public.fn_moneda_base_organizacion(NEW.organization_id), ''accrued'',',
       E'        ''USD'', ''accrued'','),
      ('public.web_capture_lead(integer,text,text,text,text,text,text,text)',
       E'      0,\n      public.fn_moneda_base_organizacion(v_org.id),',
       E'      0,\n      ''COP'','),
      ('public.create_employment_for_new_member()',
       E'      48,\n      public.fn_moneda_base_organizacion(NEW.organization_id),',
       E'      48,\n      ''COP'','),
      ('public.complete_invitation_registration(text,uuid,text,text,text,text,text)',
       E'    public.fn_moneda_base_organizacion(invite_record.organization_id), -- Moneda base de la organización',
       E'    ''COP'',                       -- Moneda por defecto')
    ) as t(firma, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.firma::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.viejo, ''))) / length(r.viejo);
    if v_n = 0 then
      continue; -- ya revertida
    end if;
    if v_n <> 1 then
      raise exception 'rollback moneda_base: % tiene % ocurrencias (se esperaba 1)', r.firma, v_n;
    end if;
    execute replace(v_def, r.viejo, r.nuevo);
  end loop;
end;
$$;

-- 2. Triggers fuera y DEFAULT literales de vuelta.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('invoice_sales',       'currency',           $d$'USD'::bpchar$d$),
      ('invoice_purchase',    'currency',           $d$'USD'::bpchar$d$),
      ('opportunities',       'currency',           $d$'USD'::bpchar$d$),
      ('quotations',          'currency',           $d$'COP'::character varying$d$),
      ('shipments',           'currency',           $d$'COP'::bpchar$d$),
      ('bank_accounts',       'currency',           $d$'USD'::bpchar$d$),
      ('commissions',         'currency',           $d$'USD'::bpchar$d$),
      ('journal_entries',     'currency_code',      $d$'COP'::character varying$d$),
      ('journal_entries',     'base_currency_code', $d$'COP'::character varying$d$),
      ('pipelines',           'goal_currency',      $d$'USD'::bpchar$d$),
      ('sales_targets',       'target_currency',    $d$'USD'::text$d$),
      ('sales_team_members',  'quota_currency',     $d$'COP'::text$d$),
      ('shipping_rates',      'currency',           $d$'COP'::bpchar$d$),
      ('support_documents',   'currency',           $d$'COP'::bpchar$d$),
      ('transport_fares',     'currency',           $d$'COP'::bpchar$d$),
      ('transport_incidents', 'currency',           $d$'COP'::bpchar$d$),
      ('transport_routes',    'currency',           $d$'COP'::bpchar$d$),
      ('trip_tickets',        'currency',           $d$'COP'::bpchar$d$),
      ('trips',               'currency',           $d$'COP'::bpchar$d$),
      ('employments',         'currency_code',      $d$'COP'::bpchar$d$)
    ) as t(tabla, columna, valor)
  loop
    execute format('drop trigger if exists trg_00_moneda_base_por_defecto on public.%I', r.tabla);
    execute format('alter table public.%I alter column %I set default %s', r.tabla, r.columna, r.valor);
  end loop;
end;
$$;

-- 3. Funciones nuevas.
drop function if exists public.fn_trg_moneda_base_por_defecto();
drop function if exists public.fn_moneda_base_organizacion(integer);
