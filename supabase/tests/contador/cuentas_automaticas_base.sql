-- Base del ensayo de cuentas automáticas. Generada desde producción (solo SELECT), sin datos.
-- Estructura de las tablas que toca el motor y copia EXACTA de sus funciones (pg_get_functiondef).
-- Sin claves foráneas ni NOT NULL: el ensayo inserta solo lo que usa.
-- Solo para una base local vacía: borra el esquema public.

set client_min_messages = warning;
set check_function_bodies = off;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists prueba cascade;
create schema public;
create schema auth;
create schema prueba;
grant usage on schema public, auth, prueba to public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable
as $$ select nullif(current_setting('test.role', true), '') $$;
grant execute on function auth.uid(), auth.role() to public;

create table public."accounting_rules" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "name" text,
  "description" text,
  "source_type" text,
  "event_type" text,
  "debit_account_code" text,
  "credit_account_code" text,
  "tax_account_code" text,
  "use_tax_from_document" boolean default false,
  "is_active" boolean default true,
  "priority" smallint default 0,
  "conditions" jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "discount_account_code" text
);
create table public."ap_installments" (
  "id" uuid default gen_random_uuid(),
  "account_payable_id" uuid,
  "installment_number" smallint,
  "due_date" date,
  "amount" numeric,
  "principal" numeric,
  "interest" numeric default 0,
  "balance" numeric,
  "status" text default 'pending'::text,
  "paid_amount" numeric default 0,
  "paid_at" timestamp with time zone,
  "days_overdue" integer default 0,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "discount_amount" numeric default 0
);
create table public."branch_account_mappings" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "base_account_code" text,
  "sub_account_code" text,
  "created_at" timestamp with time zone default now(),
  "legacy_code" text
);
create sequence if not exists public."branches_id_seq";
create table public."branches" (
  "id" integer default nextval('public."branches_id_seq"'::regclass),
  "organization_id" integer,
  "name" character varying(255),
  "address" text,
  "city" character varying(100),
  "state" character varying(100),
  "country" text,
  "postal_code" character varying(20),
  "latitude" numeric(10,8),
  "longitude" numeric(11,8),
  "phone" character varying(50),
  "email" character varying(255),
  "manager_id" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "is_main" boolean default false,
  "tax_identification" character varying(100),
  "opening_hours" jsonb,
  "features" jsonb,
  "capacity" integer,
  "branch_type" character varying(100),
  "zone" character varying(100),
  "branch_code" text,
  "is_active" boolean default true,
  "uuid" uuid default gen_random_uuid(),
  "municipality_id" uuid,
  "country_code" character varying(3),
  "state_code" text,
  "is_web_stock_source" boolean default false,
  "slug" text,
  "subdomain" text,
  "custom_domain" text,
  "website_logo_url" text,
  "website_cover_url" text,
  "is_web_published" boolean default false,
  "timezone" text,
  "default_cost_center_id" uuid
);
create sequence if not exists public."categories_id_seq";
create table public."categories" (
  "id" integer default nextval('public."categories_id_seq"'::regclass),
  "organization_id" integer,
  "parent_id" integer,
  "name" text,
  "slug" text,
  "rank" integer default 0,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "icon" text,
  "color" text default '#6366f1'::text,
  "image_url" text,
  "description" text,
  "is_active" boolean default true,
  "display_order" integer default 0,
  "meta_title" text,
  "meta_description" text,
  "uuid" uuid default gen_random_uuid(),
  "metadata" jsonb default '{}'::jsonb,
  "requires_preparation" boolean default false,
  "station" text,
  "branch_id" integer,
  "cuenta_ingreso" text,
  "cuenta_costo" text,
  "cuenta_inventario" text,
  "cuenta_devolucion" text,
  "default_weight_kg" numeric(10,3)
);
create table public."chart_of_accounts" (
  "account_code" text,
  "organization_id" integer,
  "name" text,
  "type" text,
  "parent_code" text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "description" text,
  "nivel" text generated always as (
CASE
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) = 1)) THEN 'clase'::text
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) = 2)) THEN 'grupo'::text
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) = 4)) THEN 'cuenta'::text
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) = 6)) THEN 'subcuenta'::text
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) = 8)) THEN 'auxiliar'::text
    WHEN ((account_code ~ '^[0-9]+$'::text) AND (length(account_code) >= 10) AND ((length(account_code) % 2) = 0)) THEN 'subauxiliar'::text
    ELSE 'legacy'::text
END) stored,
  "clase" smallint generated always as (
CASE
    WHEN ("left"(account_code, 1) ~ '^[1-9]$'::text) THEN ("left"(account_code, 1))::smallint
    ELSE NULL::smallint
END) stored,
  "naturaleza" text,
  "es_movimiento" boolean,
  "requiere_tercero" boolean default false,
  "requiere_centro_costo" boolean default false,
  "activa" boolean generated always as (COALESCE(is_active, true)) stored,
  "concepto_exogena" text,
  "centro_costo_modo" text,
  "presentacion_niif" text,
  "created_by" uuid default auth.uid()
);
create table public."configuracion_contable" (
  "id" bigint generated by default as identity,
  "organization_id" integer,
  "branch_id" integer,
  "clave" text,
  "account_code" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."contabilidad_consumidor_final" (
  "organization_id" integer,
  "nit" text,
  "nombre" text,
  "updated_at" timestamp with time zone default now()
);
create sequence if not exists public."contabilidad_revision_iva_id_seq";
create table public."contabilidad_revision_iva" (
  "id" bigint default nextval('public."contabilidad_revision_iva_id_seq"'::regclass),
  "organization_id" integer,
  "origen" text,
  "origen_id" text,
  "cuenta_titulo" text,
  "cuenta_asignada" text,
  "motivo" text default 'IVA sin tarifa: se asignó 19%, revisar'::text,
  "created_at" timestamp with time zone default now()
);
create table public."cost_centers" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "code" text,
  "name" text,
  "parent_id" uuid,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "branch_id" integer,
  "level" smallint,
  "type" text,
  "template_key" text,
  "is_default" boolean default false
);
create table public."customers" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "email" text,
  "phone" text,
  "first_name" text,
  "last_name" text,
  "identification_type" text,
  "identification_number" text,
  "address" text,
  "city" text,
  "notes" text,
  "is_registered" boolean default false,
  "user_id" uuid,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "doc_type" text generated always as (identification_type) stored,
  "doc_number" text generated always as (identification_number) stored,
  "roles" text[] default '{cliente,huesped}'::text[],
  "tags" text[] default '{}'::text[],
  "preferences" jsonb default '{}'::jsonb,
  "avatar_url" text,
  "is_online" boolean default false,
  "last_seen_at" timestamp with time zone,
  "dv" integer,
  "company_name" text,
  "trade_name" text,
  "legal_organization_id" integer default 2,
  "tribute_id" integer default 21,
  "fiscal_municipality_id" uuid,
  "fiscal_responsibilities" text[],
  "customer_type" text default 'person'::text,
  "parent_customer_id" uuid,
  "full_name" text generated always as (
CASE
    WHEN (customer_type = 'company'::text) THEN COALESCE(NULLIF(TRIM(BOTH FROM company_name), ''::text), NULLIF(TRIM(BOTH FROM trade_name), ''::text), NULLIF(TRIM(BOTH FROM ((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text))), ''::text), 'Empresa sin nombre'::text)
    ELSE NULLIF(TRIM(BOTH FROM ((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text))), ''::text)
END) stored,
  "health_score" integer,
  "health_score_updated_at" timestamp with time zone,
  "company_size" text,
  "branches_count" integer,
  "current_software" text,
  "lifecycle_stage" text default 'lead'::text,
  "vertical_id" uuid,
  "timezone" text default 'America/Bogota'::text,
  "do_not_call" boolean default false,
  "status" text default 'active'::text,
  "inactivated_at" timestamp with time zone,
  "search_text" text,
  "owner_id" uuid,
  "lead_source" text,
  "lead_score" integer,
  "icp_band" text,
  "last_contact_at" timestamp with time zone,
  "lead_discarded_at" timestamp with time zone,
  "lead_discard_reason" text,
  "lead_discarded_by" uuid
);
create table public."employee_loans" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "employment_id" uuid,
  "loan_number" text,
  "loan_type" text default 'general'::text,
  "description" text,
  "currency_code" character(3),
  "principal" numeric(12,2),
  "interest_rate" numeric(6,4) default 0,
  "total_interest" numeric(12,2) default 0,
  "total_amount" numeric(12,2),
  "balance" numeric(12,2),
  "installments_total" integer,
  "installment_amount" numeric(12,2),
  "installments_paid" integer default 0,
  "disbursement_date" date,
  "first_payment_date" date,
  "last_payment_date" date,
  "requested_at" timestamp with time zone default now(),
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejected_by" uuid,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text,
  "status" text default 'requested'::text,
  "auto_deduct" boolean default true,
  "max_deduction_pct" numeric(5,2) default 30,
  "notes" text,
  "supporting_documents" jsonb default '[]'::jsonb,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."fiscal_periods" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "year" smallint,
  "month" smallint,
  "period_type" text default 'monthly'::text,
  "start_date" date,
  "end_date" date,
  "status" text default 'open'::text,
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "reopened_by" uuid,
  "reopened_at" timestamp with time zone,
  "reopen_reason" text
);
create table public."invoice_items" (
  "id" uuid default gen_random_uuid(),
  "invoice_id" uuid,
  "invoice_type" text,
  "product_id" integer,
  "description" text,
  "qty" numeric(12,3) default 0,
  "unit_price" numeric(12,2) default 0,
  "tax_code" text,
  "tax_rate" numeric(6,4) default 0,
  "total_line" numeric(12,2) default 0,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "discount_amount" numeric(12,2) default 0,
  "invoice_sales_id" uuid,
  "invoice_purchase_id" uuid,
  "tax_included" boolean default false,
  "code_reference" text,
  "discount_rate" numeric(5,2) default 0,
  "unit_measure_id" integer default 70,
  "standard_code_id" integer default 1,
  "is_excluded" integer default 0,
  "tribute_id" integer default 1,
  "withholding_taxes" jsonb default '[]'::jsonb,
  "note" text,
  "serial_numbers" text[] default '{}'::text[],
  "serial_ids" integer[] default '{}'::integer[],
  "support_document_id" uuid,
  "credited_item_id" uuid,
  "impuestos_linea" jsonb,
  "cuenta_contable" text,
  "cost_center_id" uuid
);
create table public."invoice_purchase" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "supplier_id" integer,
  "po_id" integer,
  "number_ext" text,
  "issue_date" timestamp with time zone default now(),
  "due_date" timestamp with time zone,
  "currency" character(3),
  "subtotal" numeric(12,2) default 0,
  "tax_total" numeric(12,2) default 0,
  "total" numeric(12,2) default 0,
  "balance" numeric(12,2) default 0,
  "status" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "notes" text,
  "payment_terms" integer,
  "payment_method" text,
  "tax_included" boolean default false,
  "salesperson_id" uuid,
  "commission_rate" numeric default 0,
  "commission_type" text default 'none'::text,
  "payment_terms_id" uuid,
  "commission_method" text default 'percentage'::text,
  "commission_amount" numeric default 0,
  "stock_received_at" timestamp with time zone,
  "cost_center_id" uuid,
  "distribucion_id" uuid
);
create table public."invoice_purchase_withholdings" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "invoice_id" uuid,
  "concept" text,
  "base" numeric default 0,
  "rate" numeric default 0,
  "amount" numeric default 0,
  "tax_code" text,
  "created_at" timestamp with time zone default now()
);
create table public."invoice_sales" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "customer_id" uuid,
  "sale_id" uuid,
  "number" text,
  "issue_date" timestamp with time zone default now(),
  "due_date" timestamp with time zone,
  "currency" character(3),
  "subtotal" numeric(12,2) default 0,
  "tax_total" numeric(12,2) default 0,
  "total" numeric(12,2) default 0,
  "balance" numeric(12,2) default 0,
  "status" text,
  "xml_uuid" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "notes" text,
  "payment_method" text,
  "tax_included" boolean default false,
  "payment_terms" integer,
  "description" text,
  "related_invoice_id" uuid,
  "document_type" text,
  "reference_code" text,
  "operation_type" text default '10'::text,
  "payment_form" text default '1'::text,
  "payment_method_code" text default '10'::text,
  "send_email" boolean default false,
  "validated_at" timestamp with time zone,
  "qr_image" text,
  "allowance_charges" jsonb default '[]'::jsonb,
  "billing_period" jsonb,
  "salesperson_id" uuid,
  "commission_rate" numeric default 0,
  "commission_type" text default 'none'::text,
  "payment_terms_id" uuid,
  "commission_method" text default 'percentage'::text,
  "commission_amount" numeric default 0,
  "opportunity_id" uuid,
  "einvoice_status" text,
  "einvoice_number" text,
  "einvoice_qr" text,
  "idempotency_key" text,
  "quotation_id" uuid,
  "terms_conditions" text
);
create table public."job_position_permissions" (
  "id" uuid default gen_random_uuid(),
  "job_position_id" uuid,
  "permission_id" integer,
  "allowed" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create sequence if not exists public."journal_entries_id_seq";
create table public."journal_entries" (
  "id" integer default nextval('public."journal_entries_id_seq"'::regclass),
  "organization_id" integer,
  "branch_id" integer,
  "entry_date" timestamp with time zone default now(),
  "memo" text,
  "posted" boolean default false,
  "source" text,
  "source_id" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "currency_code" character varying,
  "exchange_rate" numeric default 1.0,
  "base_currency_code" character varying,
  "fact_key" text,
  "comprobante_tipo" text,
  "comprobante_prefijo" text,
  "comprobante_numero" integer
);
create sequence if not exists public."journal_entry_failures_id_seq";
create table public."journal_entry_failures" (
  "id" bigint default nextval('public."journal_entry_failures_id_seq"'::regclass),
  "organization_id" integer,
  "branch_id" integer,
  "entry_date" timestamp with time zone,
  "source" text,
  "source_id" text,
  "fact_key" text,
  "debit_account" text,
  "credit_account" text,
  "amount" numeric,
  "reason" text,
  "detail" text,
  "created_at" timestamp with time zone default now(),
  "resolved_at" timestamp with time zone,
  "resolved_entry_id" integer,
  "resolution" text,
  "asiento_propuesto" jsonb,
  "attempts" integer default 1,
  "last_attempt_at" timestamp with time zone
);
create sequence if not exists public."journal_lines_id_seq";
create table public."journal_lines" (
  "id" integer default nextval('public."journal_lines_id_seq"'::regclass),
  "journal_entry_id" integer,
  "account_code" text,
  "description" text,
  "debit" numeric(12,2) default 0,
  "credit" numeric(12,2) default 0,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "organization_id" integer default 0,
  "currency_code" character varying,
  "exchange_rate" numeric,
  "debit_base" numeric default 0,
  "credit_base" numeric default 0,
  "cost_center_id" uuid,
  "tercero_nit" text,
  "tercero_nombre" text,
  "redondeo_traza" jsonb
);
create table public."loan_installments" (
  "id" uuid default gen_random_uuid(),
  "loan_id" uuid,
  "installment_number" integer,
  "due_date" date,
  "amount" numeric(12,2),
  "principal_portion" numeric(12,2),
  "interest_portion" numeric(12,2) default 0,
  "status" text default 'pending'::text,
  "amount_paid" numeric(12,2) default 0,
  "paid_at" timestamp with time zone,
  "payroll_item_id" uuid,
  "payroll_slip_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."organization_members" (
  "id" bigint generated by default as identity,
  "organization_id" integer,
  "user_id" uuid,
  "created_at" timestamp with time zone default now(),
  "is_super_admin" boolean default false,
  "is_active" boolean default true,
  "role_id" integer,
  "job_position_id" uuid,
  "is_temporary" boolean default false
);
create table public."organization_taxes" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "template_id" integer,
  "name" character varying(100),
  "rate" numeric(5,2),
  "description" text,
  "is_default" boolean default false,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "tax_included" boolean default false,
  "kind" text default 'tax'::text,
  "min_base_uvt" numeric(12,2)
);
create sequence if not exists public."organizations_id_seq";
create table public."organizations" (
  "id" integer default nextval('public."organizations_id_seq"'::regclass),
  "name" character varying(255),
  "description" text,
  "logo_url" text,
  "website" character varying(255),
  "email" character varying(255),
  "phone" character varying(50),
  "tax_id" character varying(100),
  "status" character varying(20) default 'active'::character varying,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "type_id" integer,
  "owner_user_id" uuid,
  "address" text,
  "city" text,
  "state" text,
  "country" text default 'Colombia'::text,
  "postal_code" text,
  "nit" text,
  "primary_color" text,
  "secondary_color" text,
  "subdomain" text,
  "custom_domain" text,
  "legal_name" text,
  "created_by" uuid,
  "plan_id" integer,
  "uuid" uuid default gen_random_uuid(),
  "country_code" character varying(3),
  "dv" integer,
  "registration_code" text,
  "economic_activity" text,
  "municipality_id" uuid,
  "graphic_representation_name" text,
  "fiscal_responsibilities" text[],
  "timezone" text default 'America/Bogota'::text
);
create sequence if not exists public."p1_puc_bitacora_id_seq";
create table public."p1_puc_bitacora" (
  "id" bigint default nextval('public."p1_puc_bitacora_id_seq"'::regclass),
  "migracion" text,
  "organization_id" integer,
  "objeto" text,
  "clave" text,
  "campo" text,
  "valor_anterior" text,
  "valor_nuevo" text,
  "created_at" timestamp with time zone default now()
);
create table public."payroll_periods" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "name" text,
  "period_start" date,
  "period_end" date,
  "payment_date" date,
  "frequency" text,
  "status" text default 'open'::text,
  "total_employees" integer,
  "total_gross" numeric(14,2),
  "total_deductions" numeric(14,2),
  "total_net" numeric(14,2),
  "total_employer_cost" numeric(14,2),
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "notes" text,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."payroll_slips" (
  "id" uuid default gen_random_uuid(),
  "payroll_run_id" uuid,
  "employment_id" uuid,
  "currency_code" character(3),
  "base_salary" numeric(12,2),
  "salary_period" text,
  "basic_salary" numeric(12,2) default 0,
  "transport_allowance" numeric(12,2) default 0,
  "overtime_pay" numeric(12,2) default 0,
  "night_premium" numeric(12,2) default 0,
  "holiday_premium" numeric(12,2) default 0,
  "commissions" numeric(12,2) default 0,
  "bonuses" numeric(12,2) default 0,
  "other_earnings" numeric(12,2) default 0,
  "gross_pay" numeric(12,2),
  "health_deduction" numeric(12,2) default 0,
  "pension_deduction" numeric(12,2) default 0,
  "solidarity_fund" numeric(12,2) default 0,
  "tax_withholding" numeric(12,2) default 0,
  "loan_deductions" numeric(12,2) default 0,
  "advance_deductions" numeric(12,2) default 0,
  "other_deductions" numeric(12,2) default 0,
  "total_deductions" numeric(12,2),
  "net_pay" numeric(12,2),
  "employer_health" numeric(12,2) default 0,
  "employer_pension" numeric(12,2) default 0,
  "employer_arl" numeric(12,2) default 0,
  "employer_parafiscales" numeric(12,2) default 0,
  "employer_severance" numeric(12,2) default 0,
  "employer_severance_interest" numeric(12,2) default 0,
  "employer_vacation_provision" numeric(12,2) default 0,
  "employer_bonus_provision" numeric(12,2) default 0,
  "total_employer_cost" numeric(12,2) default 0,
  "regular_hours" numeric(6,2) default 0,
  "overtime_day_hours" numeric(6,2) default 0,
  "overtime_night_hours" numeric(6,2) default 0,
  "holiday_hours" numeric(6,2) default 0,
  "status" text default 'draft'::text,
  "payment_id" uuid,
  "paid_at" timestamp with time zone,
  "notes" text,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create sequence if not exists public."permissions_id_seq";
create table public."permissions" (
  "id" integer default nextval('public."permissions_id_seq"'::regclass),
  "code" character varying(100),
  "description" text,
  "module" character varying(50),
  "created_at" timestamp with time zone default now(),
  "category" text,
  "name" text
);
create sequence if not exists public."products_id_seq";
create table public."products" (
  "id" integer default nextval('public."products_id_seq"'::regclass),
  "organization_id" integer,
  "sku" text,
  "name" text,
  "category_id" integer,
  "unit_code" character(4),
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "description" text,
  "barcode" text,
  "status" text default 'active'::text,
  "tag_id" integer,
  "parent_product_id" integer,
  "tax_id" integer,
  "is_parent" boolean default false,
  "variant_data" jsonb default '{}'::jsonb,
  "uuid" uuid default gen_random_uuid(),
  "station" text,
  "track_stock" boolean default true,
  "is_composite" boolean default false,
  "production_type" text default 'simple'::text,
  "product_type" text default 'product'::text,
  "brand" text,
  "reference" text,
  "track_serial" boolean default false,
  "serial_pattern" text,
  "auto_generate_serial" boolean default false,
  "warranty_months" integer,
  "rating_avg" numeric(3,2),
  "reviews_count" integer default 0,
  "busqueda_nombre" text,
  "busqueda_marca" text,
  "busqueda_descripcion" text,
  "weight_kg" numeric,
  "length_cm" numeric,
  "width_cm" numeric,
  "height_cm" numeric,
  "service_type" text,
  "track_lots" boolean default false,
  "sale_mode" text default 'unit'::text,
  "qty_decimals" smallint default 0,
  "price_ref_qty" numeric(12,3),
  "price_ref_unit_code" character(4),
  "min_sale_qty" numeric(12,3),
  "default_tare_qty" numeric(12,3),
  "tare_required" boolean default false,
  "require_scale" boolean default false,
  "scale_plu" integer,
  "cuenta_ingreso" text,
  "cuenta_costo" text,
  "cuenta_inventario" text,
  "cuenta_devolucion" text,
  "preferred_supplier_product_id" uuid
);
create table public."profiles" (
  "id" uuid,
  "email" character varying(255),
  "first_name" character varying(100),
  "last_name" character varying(100),
  "avatar_url" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "department" character varying(100),
  "status" character varying(50) default 'active'::character varying,
  "phone" text,
  "metadata" jsonb default '{}'::jsonb,
  "preferred_language" text default 'es'::text,
  "last_org_id" integer,
  "auth_provider" text default 'email'::text
);
create table public."puc_plantilla" (
  "codigo" text,
  "nombre" text,
  "tipo" text,
  "padre" text,
  "descripcion" text,
  "naturaleza" text,
  "es_movimiento" boolean,
  "requiere_tercero" boolean default false,
  "requiere_centro_costo" boolean default false,
  "centro_costo_modo" text,
  "presentacion_niif" text
);
create sequence if not exists public."purchase_orders_id_seq";
create table public."purchase_orders" (
  "id" integer default nextval('public."purchase_orders_id_seq"'::regclass),
  "organization_id" integer,
  "branch_id" integer,
  "supplier_id" integer,
  "status" text,
  "expected_date" date,
  "total" numeric(12,2) default 0,
  "created_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "uuid" uuid default gen_random_uuid()
);
create sequence if not exists public."role_permissions_id_seq";
create table public."role_permissions" (
  "role_id" integer,
  "permission_id" integer,
  "scope" character varying(80),
  "allowed" boolean default true,
  "id" integer default nextval('public."role_permissions_id_seq"'::regclass)
);
create table public."sale_items" (
  "id" uuid default gen_random_uuid(),
  "sale_id" uuid,
  "product_id" integer,
  "quantity" numeric(12,3) default 1,
  "unit_price" numeric(12,2),
  "total" numeric(12,2),
  "notes" jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "tax_amount" numeric(12,2) default 0,
  "tax_rate" numeric(6,4) default 0,
  "discount_amount" numeric(12,2) default 0,
  "paid_at" timestamp with time zone,
  "paid_by_split_id" text,
  "serial_ids" integer[] default '{}'::integer[],
  "tax_included" boolean,
  "paid_amount" numeric default 0,
  "promo_excluded" boolean default false,
  "promo_excluded_by" uuid,
  "promo_excluded_at" timestamp with time zone,
  "promo_excluded_reason" text,
  "recipe_id" integer
);
create table public."sales" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "customer_id" uuid,
  "user_id" uuid,
  "total" numeric(12,2) default 0,
  "balance" numeric(12,2) default 0,
  "status" text,
  "sale_date" timestamp with time zone default now(),
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "payment_status" text default 'pending'::text,
  "tax_total" numeric(12,2) default 0,
  "subtotal" numeric(12,2) default 0,
  "discount_total" numeric(12,2) default 0,
  "reservation_id" uuid,
  "tax_included" boolean default false,
  "tax_breakdown" jsonb,
  "salesperson_id" uuid,
  "commission_rate" numeric default 0,
  "commission_type" text default 'salesperson'::text,
  "tip_amount" numeric default 0,
  "tip_server_id" uuid,
  "driver_id" uuid,
  "table_session_id" uuid,
  "delivery_fee" numeric default 0,
  "opportunity_id" uuid,
  "source" text default 'pos'::text,
  "include_in_cash_register" boolean default true,
  "web_order_id" uuid,
  "device_created_at" timestamp with time zone,
  "server_received_at" timestamp with time zone default now(),
  "clock_skew_seconds" integer,
  "time_review_reason" text
);
create sequence if not exists public."suppliers_id_seq";
create table public."suppliers" (
  "id" integer default nextval('public."suppliers_id_seq"'::regclass),
  "organization_id" integer,
  "name" text,
  "nit" text,
  "contact" text,
  "phone" text,
  "email" text,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "uuid" uuid default gen_random_uuid(),
  "icon" text,
  "color" text default '#10b981'::text,
  "logo_url" text,
  "description" text,
  "address" text,
  "city" text,
  "state" text,
  "country" text default 'Colombia'::text,
  "postal_code" text,
  "tax_id" text,
  "tax_regime" text,
  "fiscal_responsibilities" text[],
  "payment_terms" text,
  "credit_days" integer default 0,
  "website" text,
  "is_active" boolean default true,
  "rating" numeric(2,1),
  "bank_name" text,
  "bank_account" text,
  "account_type" text,
  "supplier_type" text default 'company'::text,
  "parent_supplier_id" integer,
  "doc_type" text,
  "dv" character(1),
  "municipality_code" character varying(5),
  "identification_document_code" character varying(2),
  "country_code" character(2) default 'CO'::bpchar,
  "legal_organization_code" character(1),
  "trade_name" text
);
create table public."support_documents" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "supplier_id" integer,
  "invoice_purchase_id" uuid,
  "reference_code" text,
  "numbering_range_id" integer,
  "number" text,
  "issue_date" timestamp with time zone default now(),
  "created_time" text,
  "observation" text,
  "payment_details" jsonb default '[]'::jsonb,
  "cash_rounding_amount" numeric(12,2) default 0,
  "establishment" jsonb,
  "provider" jsonb,
  "subtotal" numeric(14,2) default 0,
  "tax_total" numeric(14,2) default 0,
  "total" numeric(14,2) default 0,
  "currency" character(3),
  "status" text default 'draft'::text,
  "cufe" character varying(150),
  "qr_code" text,
  "qr_image" text,
  "validated_at" timestamp with time zone,
  "is_validated" boolean default false,
  "sent_to_dian" boolean default false,
  "sent_at" timestamp with time zone,
  "factus_response" jsonb,
  "error_code" text,
  "error_message" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "tax_included" boolean default false
);
create table public."tax_account_mapping" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "tax_template_id" integer,
  "organization_tax_id" uuid,
  "account_code" character varying(20),
  "account_type" character varying(20) default 'tax_payable'::character varying,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create sequence if not exists public."tax_templates_id_seq";
create table public."tax_templates" (
  "id" integer default nextval('public."tax_templates_id_seq"'::regclass),
  "country" character varying(3) default 'CO'::bpchar,
  "code" text,
  "name" character varying(100),
  "rate" numeric(5,2),
  "description" text,
  "valid_from" timestamp with time zone,
  "valid_to" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "kind" text default 'tax'::text
);
create table public."tips" (
  "id" uuid default gen_random_uuid(),
  "organization_id" integer,
  "branch_id" integer,
  "sale_id" uuid,
  "payment_id" uuid,
  "server_id" uuid,
  "amount" numeric(12,2),
  "tip_type" text default 'cash'::text,
  "is_distributed" boolean default false,
  "distributed_at" timestamp with time zone,
  "distribution_batch_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" text
);

create unique index on public.chart_of_accounts (organization_id, account_code);
create unique index on public.branch_account_mappings (organization_id, branch_id, base_account_code);
create unique index on public.journal_entries (organization_id, fact_key);
create unique index on public.configuracion_contable (organization_id, coalesce(branch_id, 0), clave);
alter table public.categories add primary key (id);
alter table public.products add primary key (id);
alter table public.profiles add primary key (id);

-- check_user_permission
CREATE OR REPLACE FUNCTION public.check_user_permission(p_user_id uuid, p_organization_id integer, p_permission_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role_id INTEGER;
  v_job_position_id UUID;
  v_is_super_admin BOOLEAN;
  v_role_allowed BOOLEAN;
  v_job_allowed BOOLEAN;
  v_job_has_permission BOOLEAN;
BEGIN
  -- Obtener datos del miembro
  SELECT om.role_id, om.job_position_id, om.is_super_admin
  INTO v_role_id, v_job_position_id, v_is_super_admin
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id
    AND om.is_active = true
  LIMIT 1;

  -- Si no es miembro activo, denegar
  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Super admin tiene todos los permisos
  IF v_is_super_admin = true THEN
    RETURN true;
  END IF;

  -- Verificar si el CARGO tiene este permiso definido
  IF v_job_position_id IS NOT NULL THEN
    SELECT jpp.allowed INTO v_job_allowed
    FROM job_position_permissions jpp
    JOIN permissions p ON p.id = jpp.permission_id
    WHERE jpp.job_position_id = v_job_position_id
      AND p.code = p_permission_code
    LIMIT 1;
    
    v_job_has_permission := FOUND;
    
    -- Si el cargo tiene el permiso definido, usar su valor (PRECEDENCIA)
    IF v_job_has_permission THEN
      RETURN COALESCE(v_job_allowed, false);
    END IF;
  END IF;

  -- Si el cargo no tiene el permiso, verificar en el ROL
  SELECT rp.allowed INTO v_role_allowed
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  WHERE rp.role_id = v_role_id
    AND p.code = p_permission_code
  LIMIT 1;

  RETURN COALESCE(v_role_allowed, false);
END;
$function$;

-- fn_aplicar_configuracion_contable
CREATE OR REPLACE FUNCTION public.fn_aplicar_configuracion_contable(p_organization_id integer, p_branch_id integer, p_source text, p_debit_account text, p_credit_account text, p_tax_account text)
 RETURNS TABLE(debito text, credito text, impuesto text, fallo text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_fallo text;
begin
  select r.cuenta, r.fallo into v_debito, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'debito', p_debit_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := nullif(btrim(p_credit_account), '');
    impuesto := nullif(btrim(p_tax_account), '');
    fallo := v_fallo;
    return next;
    return;
  end if;

  select r.cuenta, r.fallo into v_credito, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'credito', p_credit_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := v_credito;
    impuesto := nullif(btrim(p_tax_account), '');
    fallo := v_fallo;
    return next;
    return;
  end if;

  select r.cuenta, r.fallo into v_impuesto, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'impuesto', p_tax_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := v_credito;
    impuesto := v_impuesto;
    fallo := v_fallo;
    return next;
    return;
  end if;

  if v_debito is not null and v_credito is not null and v_debito = v_credito then
    debito := v_debito;
    credito := v_credito;
    impuesto := v_impuesto;
    fallo := 'Las cuentas configuradas de débito y crédito quedaron iguales (' || v_debito || ')';
    return next;
    return;
  end if;

  debito := v_debito;
  credito := v_credito;
  impuesto := v_impuesto;
  fallo := null;
  return next;
end;
$function$;

-- fn_armar_asiento_documento
CREATE OR REPLACE FUNCTION public.fn_armar_asiento_documento(p_tipo text, p_id uuid, p_lineas jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_branch integer;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_neto numeric := 0;
  v_fecha timestamptz;
  v_memo text;
  v_source text;
  v_created_by uuid;
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_rol text;
  v_impuesto_al_credito boolean;
  v_lineas jsonb := '[]'::jsonb;
  v_pesos numeric := 0;
  v_asignado numeric := 0;
  v_parte numeric;
  v_cuenta text;
  v_fallo text;
  v_exige record;
  v_i integer := 0;
  v_n integer := 0;
  v_base numeric := 0;
  v_reparto jsonb := '[]'::jsonb;
  v_suma_debe numeric := 0;
  v_suma_haber numeric := 0;
  v_fila record;
  v_inc numeric := 0;
  v_inc_cta text;
begin
  if p_tipo = 'compra' then
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           'Compra ' || coalesce(i.number_ext, i.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_purchase i where i.id = p_id;
    v_source := 'invoice_purchase';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'documento_soporte' then
    select d.organization_id, d.branch_id, abs(coalesce(d.total, 0)), abs(coalesce(d.tax_total, 0)),
           coalesce(d.issue_date, now()), d.created_by,
           'Documento soporte ' || coalesce(d.number, d.reference_code, d.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.support_documents d where d.id = p_id;
    v_source := 'support_documents';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'nota_credito' and p_lineas is not null then
    select coalesce(sum(abs(coalesce((l->>'total_line')::numeric, 0))), 0)
      into v_total
      from jsonb_array_elements(p_lineas) l;
    select i.organization_id, i.branch_id, coalesce(i.issue_date, now()), i.created_by,
           abs(coalesce(i.tax_total, 0)), abs(coalesce(i.total, 0))
      into v_org, v_branch, v_fecha, v_created_by, v_tax, v_base
      from public.invoice_sales i where i.id = p_id;
    if v_base > 0 then
      v_tax := least(v_total, round(v_tax * v_total / v_base, 2));
    else
      v_tax := 0;
    end if;
    v_memo := 'Nota crédito';
    v_source := 'invoice_sales';
    v_impuesto_al_credito := false;
  else
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           case
             when i.document_type = 'credit_note' then 'Nota crédito ' || coalesce(i.number, i.id::text)
             when i.document_type = 'debit_note' then 'Nota débito ' || coalesce(i.number, i.id::text)
             else 'Venta ' || coalesce(i.number, i.id::text)
           end
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_sales i where i.id = p_id;
    v_source := 'invoice_sales';
    v_impuesto_al_credito := p_tipo is distinct from 'nota_credito';
  end if;

  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;

  if p_tipo in ('compra', 'documento_soporte') then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(v_org) r;
  elsif p_tipo = 'nota_credito' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = v_org
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
    -- FIX (A): la nota crédito reversa el impuesto donde lo causó la venta (nunca 2405) y no debita el
    -- título/legado 4105: usa el ingreso de la regla de venta.
    v_impuesto := coalesce((select r.tax_account_code from public.fn_regla_devengo_venta(v_org) r), v_impuesto);
    if v_debito = '4105' then
      v_debito := coalesce((select r.credit_account_code from public.fn_regla_devengo_venta(v_org) r), v_debito);
    end if;
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(v_org) r;
  end if;

  if v_debito is null then
    return jsonb_build_object('ok', false, 'fallo', 'No hay regla contable activa para este documento', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      v_org, v_branch,
      case when p_tipo = 'nota_credito' then 'sale_credit_note' else v_source end,
      v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_cfg.fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  if not coalesce(v_usa_impuesto, false) then
    v_tax := 0;
  end if;
  v_total := round(coalesce(v_total, 0), 2);
  v_tax := round(coalesce(v_tax, 0), 2);
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  -- FIX (A): INC por LÍNEA. Compras/soporte: el INC no es descontable -> al costo (sale del impuesto).
  -- Ventas/notas: la parte INC va a la cuenta INC (2495) y el resto (IVA) a la cuenta de IVA.
  if v_tax > 0 then
    v_inc := public.fn_impuesto_inc_parte(
      case when p_tipo in ('compra', 'documento_soporte') then v_source else 'invoice_sales' end, p_id::text, v_tax);
    if v_inc > 0 and p_tipo not in ('compra', 'documento_soporte') then
      v_inc_cta := public.fn_cuenta_inc(v_org);
      if v_inc_cta is null then
        v_inc := 0;
      end if;
    end if;
    v_inc := least(v_inc, v_tax);
  end if;
  v_neto := round(v_total - v_tax, 2);
  if p_tipo in ('compra', 'documento_soporte') then
    v_neto := round(v_neto + v_inc, 2);
    v_tax := round(v_tax - v_inc, 2);
    v_inc := 0;
  else
    v_tax := round(v_tax - v_inc, 2);
  end if;
  if v_tax > 0 and v_cfg.impuesto like '2495%' then
    v_cfg.impuesto := coalesce(public.fn_cuenta_iva_generado(v_org), v_cfg.impuesto);
  end if;

  if round(coalesce(v_total, 0), 0) <= 0 then
    return jsonb_build_object(
      'ok', true, 'sin_importe', true, 'fallo', null,
      'lineas', '[]'::jsonb, 'debitos', 0,
      'organization_id', v_org, 'branch_id', v_branch, 'source', v_source
    );
  end if;

  select t.nit, t.nombre into v_nit, v_nombre
    from public.fn_tercero_de_documento(
      case when p_tipo = 'nota_debito' then 'venta' else p_tipo end,
      p_id
    ) t;

  if p_lineas is not null and p_tipo = 'nota_credito' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over () as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(v_org, nullif(l->>'product_id', '')::integer, 'devolucion', l->>'cuenta_contable'),
                 v_cfg.debito
               ) as cuenta,
               abs(coalesce((l->>'total_line')::numeric, 0)) as monto,
               coalesce(nullif(btrim(l->>'descripcion'), ''), 'Nota crédito') as descripcion
          from jsonb_array_elements(p_lineas) l
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(
                   v_org,
                   ii.product_id,
                   case
                     when p_tipo in ('compra', 'documento_soporte') and coalesce(pr.track_stock, false) then 'inventario'
                     when p_tipo in ('compra', 'documento_soporte') then 'costo'
                     when p_tipo = 'nota_credito' then 'devolucion'
                     else 'ingreso'
                   end,
                   ii.cuenta_contable
                 ),
                 case when v_impuesto_al_credito then v_cfg.credito else v_cfg.debito end
               ) as cuenta,
               abs(coalesce(ii.total_line, 0)) as monto,
               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii
          left join public.products pr on pr.id = ii.product_id and pr.organization_id = v_org
         where case p_tipo
                 when 'compra' then ii.invoice_purchase_id = p_id
                 when 'documento_soporte' then ii.support_document_id = p_id
                 else ii.invoice_sales_id = p_id
               end
      ) s;
  end if;

  select coalesce(sum((e->>'monto')::numeric), 0), count(*)
    into v_pesos, v_n
    from jsonb_array_elements(v_reparto) e;
  v_asignado := 0;

  for v_fila in
    select (e->>'cuenta') as cuenta,
           (e->>'monto')::numeric as monto,
           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e
     order by (e->>'orden')::integer
  loop
    v_i := v_i + 1;
    if v_pesos = 0 then
      v_parte := case when v_i = 1 then v_neto else 0 end;
    elsif v_i = v_n then
      v_parte := round(v_neto - v_asignado, 2);
    else
      v_parte := round(v_neto * v_fila.monto / v_pesos, 2);
      v_asignado := v_asignado + v_parte;
    end if;
    if v_parte = 0 then
      continue;
    end if;
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_fila.cuenta);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre,
      'cost_center_id', public.fn_centro_documento(v_org, v_branch, p_tipo, p_id)
    ));
  end loop;

  if v_tax > 0 and v_cfg.impuesto is not null then
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_cfg.impuesto);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_tax end,
      'credito', case when v_impuesto_al_credito then v_tax else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;

  if v_inc > 0 then
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_inc_cta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_inc_cta,
      'descripcion', 'INC - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_inc end,
      'credito', case when v_impuesto_al_credito then v_inc else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;

  v_cuenta := public.fn_cuenta_movimiento_o_detalle(
    v_org, v_branch,
    case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end
  );
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
  if v_fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;
  select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
  if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
    return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
    'cuenta', v_cuenta,
    'descripcion', v_memo,
    'debito', case when v_impuesto_al_credito then v_total else 0 end,
    'credito', case when v_impuesto_al_credito then 0 else v_total end,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre
  ));

  select coalesce(sum((l->>'debito')::numeric), 0), coalesce(sum((l->>'credito')::numeric), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(v_lineas) l;
  if round(v_suma_debe, 2) <> round(v_suma_haber, 2) or v_suma_debe = 0 then
    return jsonb_build_object(
      'ok', false,
      'fallo', 'El asiento no cuadra con las líneas del documento',
      'lineas', '[]'::jsonb,
      'organization_id', v_org
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'fallo', null,
    'organization_id', v_org,
    'branch_id', v_branch,
    'fecha', v_fecha,
    'memo', v_memo,
    'source', v_source,
    'source_id', p_id,
    'created_by', v_created_by,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre,
    'lineas', v_lineas,
    'debitos', v_total,
    'creditos', v_total,
    'cuadra', true
  );
end;
$function$;

-- fn_asegurar_auxiliar_1435
CREATE OR REPLACE FUNCTION public.fn_asegurar_auxiliar_1435(p_org integer, p_branch integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_codigo text;
  v_sufijo text;
  v_nombre text;
  v_rn integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_org is null or p_branch is null then
    return null;
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch and b.organization_id = p_org
  ) then
    return null;
  end if;

  select m.sub_account_code into v_codigo
  from public.branch_account_mappings m
  where m.organization_id = p_org
    and m.branch_id = p_branch
    and m.base_account_code in ('1435', '1405')
    and m.sub_account_code ~ '^143501[0-9]{2}$'
    and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = p_org and c.account_code = m.sub_account_code
    )
  order by case when m.base_account_code = '1435' then 0 else 1 end
  limit 1;

  if v_codigo is null then
    select o.rn into v_rn
    from (
      select b.id, row_number() over (order by b.is_main desc nulls last, b.id) as rn
      from public.branches b
      where b.organization_id = p_org
    ) o
    where o.id = p_branch;

    select lpad(n::text, 2, '0') into v_sufijo
    from generate_series(1, 99) as n
    where not exists (
      select 1
      from public.branch_account_mappings m
      where m.organization_id = p_org
        and m.branch_id <> p_branch
        and m.sub_account_code = '143501' || lpad(n::text, 2, '0')
    )
    order by case when n = coalesce(v_rn, 1) then 0 else 1 end, n
    limit 1;

    if v_sufijo is null then
      return null;
    end if;
    v_codigo := '143501' || v_sufijo;
  end if;

  select left(b.name, 70) into v_nombre
  from public.branches b
  where b.id = p_branch;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '1', 'Activo', 'asset', null, 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '14', 'Inventarios', 'asset', '1', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '1435', 'Mercancías no fabricadas por la empresa', 'asset', '14', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '143501', 'Inventario por sede', 'asset', '1435', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values (
    p_org, v_codigo, 'Inventario ' || coalesce(nullif(btrim(v_nombre), ''), v_codigo),
    'asset', '143501', 'debito', true, 'no_aplica'
  )
  on conflict (organization_id, account_code) do update
    set es_movimiento = true,
        parent_code = '143501'
  where public.chart_of_accounts.parent_code is distinct from '143501'
     or public.chart_of_accounts.es_movimiento is distinct from true;

  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code)
  values
    (p_org, p_branch, '1435', v_codigo),
    (p_org, p_branch, '1405', v_codigo)
  on conflict (organization_id, branch_id, base_account_code) do update
    set sub_account_code = excluded.sub_account_code
  where public.branch_account_mappings.sub_account_code !~ '^143501[0-9]{2}$';

  return v_codigo;
end;
$function$;

-- fn_asegurar_cuentas_retencion
CREATE OR REPLACE FUNCTION public.fn_asegurar_cuentas_retencion(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '23654001')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '23670501')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '23680501') then
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '23'
  ) then
    v_parent := '23';
  end if;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description, naturaleza, requiere_tercero
  ) values
    (p_organization_id, '2365', 'Retención en la fuente', 'liability', v_parent, true,
     'Retenciones en la fuente practicadas a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2367', 'Impuesto a las ventas retenido', 'liability', v_parent, true,
     'ReteIVA practicado a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2368', 'Impuesto de industria y comercio retenido', 'liability', v_parent, true,
     'ReteICA practicado a proveedores, por pagar', 'credito', true)
  on conflict (organization_id, account_code) do nothing;
  -- 134130: auxiliares de 2365 por concepto (23654001 compras por defecto).
  perform public.fn_pasivos_asegurar_auxiliares(p_organization_id, null);
end;
$function$;

-- fn_asiento_compra_aplicar_retenciones
CREATE OR REPLACE FUNCTION public.fn_asiento_compra_aplicar_retenciones(p_entry_id integer, p_invoice_id uuid, p_credit_account text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv record;
  v_ret numeric;
  v_linea integer;
  v_memo text;
  v_prev text;
  v_w record;
  v_descuadre numeric;
  v_cuenta text;
  v_fallo text;
begin
  if p_entry_id is null then
    return;
  end if;

  select id, organization_id, branch_id, issue_date, total into v_inv
  from invoice_purchase where id = p_invoice_id;

  select coalesce(sum(w.amount), 0) into v_ret
  from invoice_purchase_withholdings w
  where w.invoice_id = p_invoice_id and w.amount > 0;

  if v_inv.id is null or v_ret <= 0 then
    return;
  end if;

  -- Sin configuración, v_cuenta es p_credit_account y el asiento se busca igual que antes.
  select r.cuenta, r.fallo into v_cuenta, v_fallo
  from public.fn_resolver_cuenta_configurada(
    v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', p_credit_account
  ) r;

  if v_fallo is not null then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id,
      null, p_credit_account, v_ret,
      'cuenta_no_configurada', v_fallo);
    return;
  end if;

  select jl.id, e.memo into v_linea, v_memo
  from journal_entries e
  join journal_lines jl on jl.journal_entry_id = e.id
  where e.id = p_entry_id
    and e.organization_id = v_inv.organization_id
    and e.source = 'invoice_purchase'
    and e.source_id = p_invoice_id::text
    and e.created_at = now()
    and jl.account_code = v_cuenta
    and jl.debit = 0
    and jl.credit = v_inv.total
  order by jl.id
  limit 1;

  -- QA 25-oct: el llamador (fn_auto_journal_purchase) ya pasa el crédito RESUELTO; volver a resolverlo
  -- puede dar otra cuenta. Se busca la línea con cualquiera de las dos y, si no aparece habiendo
  -- retenciones, se FALLA con aviso (antes se saltaban las retenciones en silencio).
  if v_linea is null then
    select jl.id, e.memo into v_linea, v_memo
    from journal_entries e
    join journal_lines jl on jl.journal_entry_id = e.id
    where e.id = p_entry_id
      and e.organization_id = v_inv.organization_id
      and e.source = 'invoice_purchase'
      and e.source_id = p_invoice_id::text
      and e.created_at = now()
      and jl.account_code = p_credit_account
      and jl.debit = 0
      and jl.credit = v_inv.total
    order by jl.id
    limit 1;
  end if;

  if v_linea is null then
    raise exception 'RETENCIONES_SIN_LINEA_PROVEEDOR: el asiento % de la compra % no tiene la línea del proveedor por el total (cuenta % / resuelta %); las retenciones (%) no se pueden aplicar',
      p_entry_id, p_invoice_id, p_credit_account, v_cuenta, v_ret
      using errcode = '22023',
            hint = 'Revise la configuración contable de la clave del crédito de compras (invoice_purchase/credito).';
  end if;

  if v_ret >= v_inv.total then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id, null, p_credit_account, v_ret,
      'withholding_exceeds_total', 'Las retenciones igualan o superan el total de la factura; el asiento queda por el total');
    return;
  end if;

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    select r.cuenta, r.fallo into v_cuenta, v_fallo
    from public.fn_resolver_cuenta_configurada(
      v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', v_w.cuenta
    ) r;

    if v_fallo is not null then
      perform fn_log_journal_failure(
        v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
        'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id,
        null, p_credit_account, v_w.amount,
        'cuenta_no_configurada', v_fallo);
      return;
    end if;
  end loop;

  perform fn_asegurar_cuentas_retencion(v_inv.organization_id);

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  update journal_lines
     set credit = v_inv.total - v_ret, updated_at = now()
   where id = v_linea;
  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    select r.cuenta into v_cuenta
    from public.fn_resolver_cuenta_configurada(
      v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', v_w.cuenta
    ) r;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (p_entry_id, v_cuenta, v_w.concept || ' - ' || v_memo, 0, v_w.amount);
  end loop;

  select round(coalesce(sum(debit), 0) - coalesce(sum(credit), 0), 2) into v_descuadre
  from journal_lines where journal_entry_id = p_entry_id;
  if v_descuadre <> 0 then
    raise exception 'ASIENTO_DESCUADRADO: el asiento % de la compra % queda descuadrado en %', p_entry_id, p_invoice_id, v_descuadre
      using errcode = '22023';
  end if;
end;
$function$;

-- fn_asiento_documento_por_lineas
CREATE OR REPLACE FUNCTION public.fn_asiento_documento_por_lineas(p_id uuid, p_tipo text, p_fact_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_armado jsonb;
  v_entry_id integer;
  v_linea jsonb;
  v_lineas jsonb;
  v_exacto_d numeric;
  v_exacto_c numeric;
  v_d numeric;
  v_c numeric;
  v_red jsonb;
begin
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, null);
  if coalesce((v_armado->>'ok')::boolean, false) is not true then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'cuenta_linea',
      coalesce(v_armado->>'fallo', 'No se pudo armar el asiento')
    );
    return null;
  end if;

  if not public.fn_is_period_open(
    (v_armado->>'organization_id')::integer,
    ((v_armado->>'fecha')::timestamptz)::date
  ) then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'period_closed',
      'Periodo contable cerrado para la fecha ' || (((v_armado->>'fecha')::timestamptz)::date)
    );
    return null;
  end if;

  -- Cada línea queda en pesos por sí sola. La diferencia va en su propia línea, nunca en otra.
  select coalesce(sum(coalesce((l->>'debito')::numeric, 0)), 0),
         coalesce(sum(coalesce((l->>'credito')::numeric, 0)), 0)
    into v_exacto_d, v_exacto_c
    from jsonb_array_elements(coalesce(v_armado->'lineas', '[]'::jsonb)) l;

  select coalesce(jsonb_agg(x.l || jsonb_build_object('debito', x.d, 'credito', x.c) order by x.o), '[]'::jsonb),
         coalesce(sum(x.d), 0), coalesce(sum(x.c), 0)
    into v_lineas, v_d, v_c
    from (
      select e.l, e.o,
             round(coalesce((e.l->>'debito')::numeric, 0), 0) as d,
             round(coalesce((e.l->>'credito')::numeric, 0), 0) as c
        from jsonb_array_elements(coalesce(v_armado->'lineas', '[]'::jsonb)) with ordinality e(l, o)
    ) x
   where x.d <> 0 or x.c <> 0;

  v_red := public.fn_linea_redondeo(
    (v_armado->>'organization_id')::integer, (v_armado->>'branch_id')::integer,
    v_d, v_c, v_exacto_d, v_exacto_c
  );
  if coalesce((v_red->>'pendiente')::boolean, false) then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
    perform public.fn_redondeo_pendiente_registrar(
      (v_armado->>'organization_id')::integer, (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz, v_armado->>'source', p_id::text, p_fact_key,
      v_armado->>'memo', nullif(v_armado->>'created_by', '')::uuid,
      v_lineas, v_red, v_exacto_d, v_exacto_c
    );
    return null;
  end if;

  begin
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
    ) values (
      (v_armado->>'organization_id')::integer,
      (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz,
      v_armado->>'memo',
      v_armado->>'source',
      p_id::text,
      true,
      nullif(v_armado->>'created_by', '')::uuid,
      p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    return v_entry_id;
  end;

  for v_linea in select * from jsonb_array_elements(v_lineas) loop
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id, tercero_nit, tercero_nombre, cost_center_id
    ) values (
      v_entry_id,
      v_linea->>'cuenta',
      v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      (v_armado->>'organization_id')::integer,
      nullif(v_linea->>'tercero_nit', ''),
      nullif(v_linea->>'tercero_nombre', ''),
      case when p_tipo = 'compra' and exists (select 1 from public.invoice_purchase ip where ip.id = p_id and ip.organization_id = (v_armado->>'organization_id')::integer and ip.distribucion_id is not null) then null else nullif(v_linea->>'cost_center_id', '')::uuid end
    );
  end loop;
  if v_red is not null then
    perform public.fn_redondeo_insertar_linea(v_entry_id, v_red);
  end if;
  return v_entry_id;
end;
$function$;

-- fn_assert_acceso_org
CREATE OR REPLACE FUNCTION public.fn_assert_acceso_org(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Acceso denegado a la organización' using errcode = '42501';
    end if;
    return;
  end if;
  if p_org is not null and (
       exists (select 1 from public.organization_members om
               where om.user_id = v_uid and om.organization_id = p_org and om.is_active = true)
    or exists (select 1 from public.organizations o
               where o.id = p_org and (o.owner_user_id = v_uid or o.created_by = v_uid))
  ) then
    return;
  end if;
  raise exception 'Acceso denegado a la organización' using errcode = '42501';
end;
$function$;

-- fn_auto_journal_purchase
CREATE OR REPLACE FUNCTION public.fn_auto_journal_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule record;
  v_entry_id integer;
  v_fact_key text;
  v_debito text;
  v_credito text;
  v_aux text;
  v_impuesto text;
  v_inc numeric := 0;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'received' then
    return new;
  end if;

  if coalesce(new.total, 0) >= 0 and round(coalesce(new.total, 0), 0) <= 0 then
    return new;
  end if;

  v_fact_key := 'accrual:purchase:' || new.id::text;

  if exists (
    select 1 from journal_entries
    where organization_id = new.organization_id
      and source = 'invoice_purchase'
      and source_id = new.id::text
      and memo like 'Compra %'
  ) then
    return new;
  end if;

  select * into v_rule from fn_regla_devengo_compra(new.organization_id);

  if v_rule.debit_account_code is null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key, null, null, new.total,
      'no_rule', 'Sin regla contable activa de compra');
    return new;
  end if;

  v_debito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.debit_account_code
  );
  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  v_aux := public.fn_asegurar_auxiliar_1435(new.organization_id, new.branch_id);
  if v_aux is not null and (
       v_debito is null
       or v_debito in ('1405', '1435')
       or v_debito like '1405%'
       or v_debito like '1435%'
       or left(v_debito, 1) = '6'
     ) then
    v_debito := v_aux;
  end if;

  -- QA ROJO 8dc44d22 N1: en las 9 orgs donde 2205 queda de MOVIMIENTO por saldo sin NIT (134135 v_suaves),
  -- el resolver devolvía 2205 y la compra acreditaba 2205 mientras pagos/OC/inventario/borradores iban a
  -- 22050501 (proveedor partido). Si existe 22050501 de movimiento, la compra va ahí; 2205/220505 quedan
  -- solo con el saldo histórico sin NIT.
  if v_credito is null
     or v_credito in ('2105', '1405', '1435', '2205', '220505')
     or v_credito like '1405%'
     or v_credito like '1435%'
     or left(v_credito, 1) = '6' then
    v_credito := coalesce(
      (select a.account_code from public.chart_of_accounts a
        where a.organization_id = new.organization_id and a.account_code = '22050501'
          and a.es_movimiento is not false and coalesce(a.is_active, true)),
      public.fn_puc_cuenta_para_asiento(new.organization_id, '2205', 'Proveedores nacionales'),
      v_credito
    );
  end if;

  -- IVA descontable (QA 25-oct: antes '240810' fijo sin mirar es_movimiento, 64 reglas). Ahora:
  -- mapeo de impuesto / clave iva_descontable (fn_cuenta_iva) y, si no, el auxiliar de 240810 de la
  -- sede (tarifa 19% si la línea no la trae). La cuenta de la regla, si es título, pasa por el resolver.
  v_impuesto := nullif(btrim(v_rule.tax_account_code), '');
  if v_impuesto like '2405%' then
    v_impuesto := null;
  end if;
  if v_impuesto is not null and v_impuesto <> '2408' then
    v_impuesto := public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id, v_impuesto, null, 'descontable');
  else
    v_impuesto := coalesce(
      public.fn_cuenta_iva(new.organization_id, new.branch_id, 'invoice_purchase', null),
      public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id, '240810', null, 'descontable')
    );
  end if;
  if btrim(coalesce(v_rule.tax_account_code, '')) = '2408' then
    perform public.fn_marcar_revision_iva(new.organization_id, 'invoice_purchase', new.id::text, '2408', v_impuesto);
  end if;

  -- Contador 25-oct-2026 (134115) / FIX (A): el INC pagado en compras NO es descontable. Se calcula por LÍNEA
  -- (INC% o tarifa 8%) y esa parte del impuesto va al costo/gasto (débito); solo el IVA va a 2408.
  if v_rule.use_tax_from_document then
    v_inc := public.fn_impuesto_inc_parte('invoice_purchase', new.id::text, new.tax_total);
  end if;

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then
    v_entry_id := public.fn_asiento_documento_por_lineas(new.id, 'compra', v_fact_key);
  elsif public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id) is not null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'tercero_requerido',
      public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id));
  else
    v_entry_id := fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := new.branch_id,
      p_entry_date := coalesce(new.issue_date, now()),
      p_memo := 'Compra ' || coalesce(new.number_ext, new.id::text),
      p_source := 'invoice_purchase',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := new.total,
      p_tax_account := case when abs(coalesce(new.tax_total, 0)) - v_inc > 0 then v_impuesto end,
      p_tax_amount := case when v_rule.use_tax_from_document then greatest(abs(coalesce(new.tax_total, 0)) - v_inc, 0) else 0 end,
      p_tax_is_credit := false,
      p_fact_key := v_fact_key
    );
  end if;

  perform fn_asiento_compra_aplicar_retenciones(v_entry_id, new.id, v_credito);

  return new;
end;
$function$;

-- fn_auto_journal_sale
CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_base_key text;
    v_fact_key text;
    v_prev_id integer;
    v_i integer;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
    v_inc numeric := 0;
    v_inc_cta text;
    v_mixto boolean := false;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type NOT IN ('invoice', 'debit_note') THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea venta

    IF NEW.status IS NULL OR NEW.status NOT IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;

    -- Ya hay un devengo vivo de esta factura (con la clave de la factura o con
    -- la de su venta): no se crea otro.
    IF EXISTS (
        SELECT 1 FROM journal_entries je
         WHERE je.organization_id = NEW.organization_id
           AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
                OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%'))
           AND NOT EXISTS (SELECT 1 FROM journal_entries r
                            WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id)
    ) THEN
        RETURN NEW;
    END IF;

    v_base_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    v_fact_key := v_base_key;
    FOR v_i IN 1..20 LOOP
        SELECT id INTO v_prev_id FROM journal_entries
        WHERE organization_id = NEW.organization_id AND fact_key = v_fact_key;
        EXIT WHEN v_prev_id IS NULL;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE organization_id = NEW.organization_id AND fact_key = 'reversal:' || v_prev_id);
        v_fact_key := v_base_key || ':reemision:' || v_i;
    END LOOP;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
        RETURN NEW;
    END IF;

    -- FIX (A) 25-oct-2026: INC por LÍNEA. Todo INC -> cuenta INC (2495); todo IVA -> IVA generado;
    -- mixto INC+IVA -> asiento por líneas (fn_armar_asiento_documento separa INC e IVA).
    IF v_rule.use_tax_from_document AND coalesce(NEW.tax_total, 0) <> 0 THEN
      v_inc := public.fn_impuesto_inc_parte('invoice_sales', NEW.id::text, NEW.tax_total);
      v_inc_cta := public.fn_cuenta_inc(NEW.organization_id);
      IF v_inc > 0 AND v_inc_cta IS NOT NULL THEN
        IF v_inc >= abs(NEW.tax_total) THEN
          v_rule.tax_account_code := v_inc_cta;
        ELSE
          v_mixto := true;
        END IF;
      END IF;
    END IF;

    if v_mixto or public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end) then
      v_entry_id := public.fn_asiento_documento_por_lineas(NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end, v_fact_key);
    elsif public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id) is not null then
      perform fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
        'invoice_sales', NEW.id::text, v_fact_key,
        v_rule.debit_account_code, v_rule.credit_account_code, NEW.total,
        'tercero_requerido',
        public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id));
    else
      -- configuracion_antes_de_sede: sin cuenta propia, primero la configuración.
      v_branch := NEW.branch_id;
      IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
      ) THEN
        SELECT id INTO v_branch FROM branches
        WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
        LIMIT 1;
        IF v_branch IS NULL THEN
          SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
        END IF;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'debito', v_rule.debit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'credito', v_rule.credit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_credito, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := case when NEW.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
      );
    end if;

    RETURN NEW;
END;
$function$;

-- fn_bloqueo_tercero_documento
CREATE OR REPLACE FUNCTION public.fn_bloqueo_tercero_documento(p_organization_id integer, p_branch_id integer, p_source text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_tipo text;
  v_cuenta text;
  v_exige record;
begin
  if p_source = 'invoice_purchase' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(p_organization_id) r;
    v_tipo := 'compra';
  elsif p_source = 'sale_credit_note' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = p_organization_id
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
    v_tipo := 'nota_credito';
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(p_organization_id) r;
    v_tipo := 'venta';
  end if;
  if v_debito is null then
    return null;
  end if;
  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      p_organization_id, p_branch_id, p_source, v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return null;
  end if;
  select t.nit into v_nit from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null then
    return null;
  end if;
  foreach v_cuenta in array array[v_cfg.debito, v_cfg.credito, case when v_usa_impuesto then v_cfg.impuesto else null end]
  loop
    if v_cuenta is null then
      continue;
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(p_organization_id, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) then
      return 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero';
    end if;
  end loop;
  return null;
end;
$function$;

-- fn_centro_defecto
CREATE OR REPLACE FUNCTION public.fn_centro_defecto(p_org integer, p_branch integer)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select b.default_cost_center_id
       from public.branches b
       join public.cost_centers c on c.id = b.default_cost_center_id
      where b.id = p_branch
        and b.organization_id = p_org
        and c.organization_id = p_org
        and c.is_active),
    (select c.id
       from public.cost_centers c
      where c.organization_id = p_org
        and c.is_default
        and c.is_active
      order by c.code
      limit 1),
    (select c.id
       from public.cost_centers c
      where c.organization_id = p_org
        and c.code = '100'
        and c.is_active
      limit 1)
  );
$function$;

-- fn_centro_documento
CREATE OR REPLACE FUNCTION public.fn_centro_documento(p_org integer, p_branch integer, p_tipo text, p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    case
      when p_tipo = 'compra' then (
        select ip.cost_center_id
          from public.invoice_purchase ip
         where ip.id = p_id
           and ip.organization_id = p_org
      )
    end,
    public.fn_centro_defecto(p_org, p_branch)
  );
$function$;

-- fn_centro_para_cuenta
CREATE OR REPLACE FUNCTION public.fn_centro_para_cuenta(p_org integer, p_branch integer, p_cuenta text, p_centro uuid, p_cuenta_sin_centro text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_cuenta_sin_centro is not null
     and p_cuenta is not distinct from p_cuenta_sin_centro then null
    when public.fn_modo_centro(p_org, p_cuenta) = 'no_aplica' then null
    else p_centro
  end;
$function$;

-- fn_clase_retencion
CREATE OR REPLACE FUNCTION public.fn_clase_retencion(p_tax_code text, p_concept text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_texto text;
begin
  foreach v_texto in array array[upper(coalesce(btrim(p_tax_code), '')), upper(coalesce(btrim(p_concept), ''))] loop
    continue when v_texto = '';
    if v_texto ~ 'RETE[ _-]?ICA|INDUSTRIA Y COMERCIO' then return 'reteica'; end if;
    if v_texto ~ 'RETE[ _-]?IVA|IMPUESTO A LAS VENTAS' then return 'reteiva'; end if;
    if v_texto ~ 'RETE[ _-]?FUENTE|EN LA FUENTE|(^|[^A-Z])RETE_[0-9]' then return 'retefuente'; end if;
    if v_texto ~ '(^|[^A-Z])ICA([^A-Z]|$)' then return 'reteica'; end if;
    if v_texto ~ '(^|[^A-Z])IVA([^A-Z]|$)' then return 'reteiva'; end if;
  end loop;
  return 'retefuente';
end;
$function$;

-- fn_clave_cuenta_configurable
CREATE OR REPLACE FUNCTION public.fn_clave_cuenta_configurable(p_source text, p_lado text, p_codigo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when s.code is null then null
    when s.code = '240810' or s.code ~ '^240810[0-9]{2}$' then 'iva_descontable'
    when s.code = '240805' or s.code ~ '^240805[0-9]{2}$' then 'iva_generado'
    when p_lado = 'impuesto' and s.code in ('2408', '2405') then
      case when s.origen = any (array['purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'])
        then 'iva_descontable' else 'iva_generado' end
    when p_lado = 'descuento' and s.code = '4175' then 'descuentos'
    when s.code = '1105' then 'caja'
    when s.code = '1110' then 'bancos'
    when s.code = '1305' and s.origen <> all (array['loan', 'loans', 'employee_loans', 'installment', 'installments', 'loan_installments', 'ap_installments']) then 'clientes'
    when s.code in ('2105', '2205', '220505', '22050501') then 'proveedores'
    when s.code in ('1405', '1435') then 'inventario'
    when s.code in ('6105', '6135', '6140') or s.code ~ '^61(35|40)05[0-9]{2}$' then 'costo_ventas'
    when s.code = '2365' or s.code ~ '^2365[0-9]{2}([0-9]{2})?$' then 'retefuente'
    when s.code in ('2367', '236705', '23670501') then 'reteiva'
    when s.code in ('2368', '236805', '23680501') then 'reteica'
    when s.code = '2805' then 'anticipos'
    when s.code in ('529505', '52950501', '520518', '52051801') then 'comisiones'  -- AJUSTE B4: 5235 = Servicios
    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'
    when s.code = '5105' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina'
    when s.code in ('2505', '250505', '25050501') and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_por_pagar'
    when s.code = '2370' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_aportes'
    when s.code in ('4175', '4705') then 'devoluciones'
    when p_lado = 'debito' and s.code in ('4105', '4135', '4110', '414015', '4145', '4235', '4115', '4140', '414005', '414095', '4155') then 'devoluciones'
    when s.code in ('4105', '4135', '4110', '414015', '4145') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '414005', '414095', '4155') then 'ventas_servicios'
    else null
  end
  from (select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen) s;
$function$;

-- fn_consumidor_final_contable
CREATE OR REPLACE FUNCTION public.fn_consumidor_final_contable(p_organization_id integer, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(nullif(btrim(c.nit), ''), '222222222222'),
         coalesce(nullif(btrim(c.nombre), ''), 'Consumidor final')
    from (select 1) semilla
    left join public.contabilidad_consumidor_final c
      on c.organization_id = p_organization_id;
$function$;

-- fn_create_journal_entry
CREATE OR REPLACE FUNCTION public.fn_create_journal_entry(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text, p_amount numeric, p_tax_account text DEFAULT NULL::text, p_tax_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid, p_tax_is_credit boolean DEFAULT false, p_fact_key text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_cuenta_sin_centro text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
  v_iva_regla text;
  v_monto_exacto numeric;
  v_impuesto_exacto numeric;
  v_neto numeric;
  v_d numeric;
  v_c numeric;
  v_red jsonb;
  v_lineas jsonb;
begin
  if p_fact_key is not null then
    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;

    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'Importe nulo o no positivo');
    return null;
  end if;

  if p_debit_account is null or p_credit_account is null then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'account_null', 'La regla contable no trae cuenta de debito o de credito');
    return null;
  end if;

  if p_debit_account = p_credit_account then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'same_account', 'Debito y credito sobre la misma cuenta ' || p_debit_account);
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_debit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'debit_account_missing', 'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_credit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'credit_account_missing', 'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 and not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_tax_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not fn_is_period_open(p_organization_id, p_entry_date::date) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
    return null;
  end if;

  if p_branch_id is null or p_branch_id = 0 or not exists (
    select 1 from branches where id = p_branch_id and organization_id = p_organization_id
  ) then
    select id into v_branch_id
    from branches
    where organization_id = p_organization_id and is_main = true and is_active = true
    limit 1;

    if v_branch_id is null then
      select min(id) into v_branch_id from branches where organization_id = p_organization_id;
    end if;
  else
    v_branch_id := p_branch_id;
  end if;

  v_iva_regla := p_tax_account;
  select * into v_cfg
  from public.fn_aplicar_configuracion_contable(
    p_organization_id, v_branch_id, p_source,
    p_debit_account, p_credit_account, p_tax_account
  );

  if v_cfg.fallo is not null then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, v_cfg.debito, v_cfg.credito, p_amount,
      'cuenta_no_configurada', v_cfg.fallo);
    return null;
  end if;

  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);
  p_credit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_credit_account);
  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  -- centro_costo_en_linea: la cuenta de banco o caja no lleva centro.
  if p_cuenta_sin_centro is not null then
    p_cuenta_sin_centro := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_cuenta_sin_centro);
  end if;

  if exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in (p_debit_account, p_credit_account)
      and es_movimiento is false
  ) or (
    p_tax_account is not null and coalesce(p_tax_amount, 0) > 0 and exists (
      select 1 from chart_of_accounts
      where organization_id = p_organization_id
        and account_code = p_tax_account
        and es_movimiento is false
    )
  ) then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  -- redondeo_pesos: total, impuesto y neto quedan en pesos cada uno. La diferencia va en su propia línea.
  v_monto_exacto := p_amount;
  v_impuesto_exacto := coalesce(p_tax_amount, 0);
  p_amount := round(p_amount, 0);
  p_tax_amount := round(coalesce(p_tax_amount, 0), 0);
  if p_tax_amount < 0 then
    p_tax_amount := 0;
  end if;
  if p_tax_amount > p_amount then
    p_tax_amount := p_amount;
  end if;
  if p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'El importe redondeado a pesos quedo en cero');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 then
    v_neto := greatest(round(v_monto_exacto - v_impuesto_exacto, 0), 0);
    if p_tax_is_credit then
      v_d := p_amount;
      v_c := v_neto + p_tax_amount;
    else
      v_d := v_neto + p_tax_amount;
      v_c := p_amount;
    end if;
    v_red := public.fn_linea_redondeo(p_organization_id, v_branch_id, v_d, v_c, v_monto_exacto, v_monto_exacto);
    if coalesce((v_red->>'pendiente')::boolean, false) then
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta', p_debit_account, 'descripcion', p_memo,
          'debito', case when p_tax_is_credit then p_amount else v_neto end, 'credito', 0,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro)),
        jsonb_build_object('cuenta', p_tax_account, 'descripcion', 'IVA - ' || p_memo,
          'debito', case when p_tax_is_credit then 0 else p_tax_amount end,
          'credito', case when p_tax_is_credit then p_tax_amount else 0 end,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro)),
        jsonb_build_object('cuenta', p_credit_account, 'descripcion', p_memo, 'debito', 0,
          'credito', case when p_tax_is_credit then v_neto else p_amount end,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro))
      );
      perform public.fn_redondeo_pendiente_registrar(
        p_organization_id, v_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_memo, p_created_by, v_lineas, v_red, v_monto_exacto, v_monto_exacto
      );
      return null;
    end if;
  else
    -- Sin línea de impuesto no hay nada que repartir: las dos líneas llevan el mismo total en pesos.
    v_neto := p_amount - coalesce(p_tax_amount, 0);
  end if;

  begin
    insert into journal_entries (
      organization_id, branch_id, entry_date, memo,
      source, source_id, posted, created_by, fact_key
    ) values (
      p_organization_id, v_branch_id, p_entry_date, p_memo,
      p_source, p_source_id, true, p_created_by, p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    if p_fact_key is null then
      raise;
    end if;

    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;
    return v_entry_id;
  end;

  if p_tax_is_credit then
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro));

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_credit_account, p_memo, 0, v_neto, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_debit_account, p_memo, v_neto, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro));

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  end if;

  if v_red is not null then
    perform public.fn_redondeo_insertar_linea(
      v_entry_id, v_red,
      public.fn_centro_para_cuenta(p_organization_id, p_branch_id, v_red->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
    );
  end if;

  return v_entry_id;
end;
$function$;

-- fn_cuenta_auxiliar_de_titulo
CREATE OR REPLACE FUNCTION public.fn_cuenta_auxiliar_de_titulo(p_org integer, p_branch integer, p_codigo text, p_tarifa numeric DEFAULT NULL::numeric, p_lado text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cod text := nullif(btrim(p_codigo), '');
  v_base text;
  v_aux text;
  v_sub text;
  v_cinco boolean := coalesce(round(p_tarifa) = 5, false);
begin
  if v_cod is null or p_org is null then
    return v_cod;
  end if;

  v_aux := case v_cod
    when '4295'   then '42959501'
    when '3705'   then '37050502'
    when '6135'   then '61350501'
    when '530515' then '53051501'
    when '5395'   then '53959501'
    when '6140'   then '61400501'
    when '240805' then case when v_cinco then '24080502' else '24080501' end
    when '240810' then case when v_cinco then '24081002' else '24081001' end
    when '2408'   then case
                         when p_lado in ('descontable', 'compra', 'purchase')
                           then case when v_cinco then '24081002' else '24081001' end
                         else case when v_cinco then '24080502' else '24080501' end
                       end
  end;
  if v_aux is not null then
    v_base := v_cod;
  else
    v_base := case
      when v_cod in ('42959501', '42959502', '42958101') then '4295'
      when v_cod in ('37050501', '37050502') then '3705'
      when v_cod in ('61350501', '61350502') then '6135'
      when v_cod = '53051501' then '530515'
      when v_cod = '53959501' then '5395'
      when v_cod in ('61400501', '61400502') then '6140'
      when v_cod in ('24080501', '24080502') then '240805'
      when v_cod in ('24081001', '24081002') then '240810'
    end;
    if v_base is null then
      return v_cod;              -- no es una de las cuentas que pasan a título
    end if;
    v_aux := v_cod;
  end if;

  -- 1) Auxiliar único de la sede.
  if p_branch is not null then
    select m.sub_account_code into v_sub
      from public.branch_account_mappings m
      join public.chart_of_accounts c
        on c.organization_id = m.organization_id and c.account_code = m.sub_account_code
       and c.es_movimiento is true and coalesce(c.is_active, true)
     where m.organization_id = p_org and m.branch_id = p_branch
       and m.base_account_code in (v_base, v_aux)
       -- QA 25-oct (O1): al 5% no sirve el mapeo de la base (240805->24080501); solo el del auxiliar 5%.
       and (v_aux not in ('24080502', '24081002') or m.base_account_code = v_aux or m.sub_account_code = v_aux)
     order by (m.base_account_code = v_aux) desc
     limit 1;
    if v_sub is not null then
      return v_sub;
    end if;
  end if;

  -- 2) Auxiliar de respaldo.
  if exists (select 1 from public.chart_of_accounts c
              where c.organization_id = p_org and c.account_code = v_aux
                and c.es_movimiento is true and coalesce(c.is_active, true)) then
    return v_aux;
  end if;

  -- 3) Antes del plan: el código original mientras siga siendo de movimiento. es_movimiento NULL NO
  --    cuenta como movimiento (QA 25-oct, igual que el TS).
  if exists (select 1 from public.chart_of_accounts c
              where c.organization_id = p_org and c.account_code = v_cod
                and c.es_movimiento is true and coalesce(c.is_active, true))
     and not public.fn_es_cuenta_de_titulo(p_org, v_cod) then
    return v_cod;
  end if;

  -- 4) Nunca el título: el auxiliar (si no existe, el asiento falla y queda en el log de fallos).
  return v_aux;
end;
$function$;

-- fn_cuenta_catalogo_linea
CREATE OR REPLACE FUNCTION public.fn_cuenta_catalogo_linea(p_organization_id integer, p_product_id integer, p_rol text, p_cuenta_linea text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    nullif(btrim(p_cuenta_linea), ''),
    case p_rol
      when 'costo' then nullif(btrim(p.cuenta_costo), '')
      when 'inventario' then nullif(btrim(p.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(p.cuenta_devolucion), ''), nullif(btrim(p.cuenta_ingreso), ''))
      else nullif(btrim(p.cuenta_ingreso), '')
    end,
    case p_rol
      when 'costo' then nullif(btrim(c.cuenta_costo), '')
      when 'inventario' then nullif(btrim(c.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(c.cuenta_devolucion), ''), nullif(btrim(c.cuenta_ingreso), ''))
      else nullif(btrim(c.cuenta_ingreso), '')
    end
  )
  from (select 1) semilla
  left join public.products p
    on p.id = p_product_id and p.organization_id = p_organization_id
  left join public.categories c
    on c.id = p.category_id and c.organization_id = p.organization_id;
$function$;

-- fn_cuenta_configurada_de_sede
CREATE OR REPLACE FUNCTION public.fn_cuenta_configurada_de_sede(p_organization_id integer, p_branch_id integer, p_source text, p_lado text, p_codigo text, OUT cuenta text, OUT fallo text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub text;
  v_fallo text;
  v_hijos text[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select r.cuenta, r.fallo into cuenta, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, p_lado, p_codigo
  ) r;

  if cuenta is null then
    fallo := v_fallo;
    return;
  end if;

  -- 1) Mapeo por sede (solo a una cuenta que reciba movimientos).
  if p_branch_id is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    join public.chart_of_accounts c
      on c.organization_id = m.organization_id
     and c.account_code = m.sub_account_code
     and c.es_movimiento is distinct from false
    where m.organization_id = p_organization_id
      and m.branch_id = p_branch_id
      and m.base_account_code = cuenta
    limit 1;

    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;

  -- 2) Inventario: siempre el auxiliar 143501xx de la sede (nunca 1405 ni 1435 sola).
  if cuenta in ('1405', '1435')
     or cuenta like '1405%'
     or cuenta ~ '^143501[0-9]{2}$'
     or cuenta ~ '^143505' then
    v_sub := case
      when p_branch_id is not null then public.fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id)
      else public.fn_inventario_auxiliar_1435(p_organization_id, null)
    end;
    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;

  -- 3) Sin fallo previo: comportamiento de siempre.
  if v_fallo is null then
    return;
  end if;

  -- 4) Venía con fallo (título / fuera del plan): ¿ya quedó en una cuenta de movimiento?
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = cuenta
      and c.es_movimiento is distinct from false
  ) then
    fallo := null;
    return;
  end if;

  -- 5) Cuenta de título con un único auxiliar de movimiento: usarlo.
  --    Excepto impuestos (24xx): p. ej. 2408 tiene 240805 generado y 240810 descontable; no se adivina.
  if cuenta like '24%' then
    fallo := v_fallo;
    return;
  end if;
  select array_agg(c.account_code order by c.account_code) into v_hijos
  from public.chart_of_accounts c
  where c.organization_id = p_organization_id
    and c.account_code like cuenta || '_%'
    and c.es_movimiento is true
    and c.is_active is distinct from false;

  if coalesce(array_length(v_hijos, 1), 0) = 1 then
    cuenta := v_hijos[1];
    fallo := null;
    return;
  end if;

  fallo := v_fallo || case
    when coalesce(array_length(v_hijos, 1), 0) > 1
      then '. Tiene varios auxiliares (' || array_to_string(v_hijos[1:5], ', ') || '); elige uno en Configuración contable'
    else ''
  end;
end;
$function$;

-- fn_cuenta_inc
CREATE OR REPLACE FUNCTION public.fn_cuenta_inc(p_organization_id integer)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.account_code
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code in (public.fn_cuenta_por_clave(p_organization_id, null, 'impuesto_consumo'), '24950501')
     and c.account_code like '2495%'
     and coalesce(c.is_active, true) and c.es_movimiento is not false
   order by (c.account_code = '24950501')
   limit 1;
$function$;

-- fn_cuenta_inventario_producto
CREATE OR REPLACE FUNCTION public.fn_cuenta_inventario_producto(p_organization_id integer, p_branch_id integer, p_product_id integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_product_id is not null then
    v_cuenta := public.fn_cuenta_catalogo_linea(p_organization_id, p_product_id, 'inventario', null);
    if v_cuenta is not null and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = p_organization_id
        and c.account_code = v_cuenta
        and coalesce(c.is_active, true)
        and c.es_movimiento is distinct from false
    ) then
      return v_cuenta;
    end if;
  end if;

  v_cuenta := public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'inventario');
  if v_cuenta is not null then
    return v_cuenta;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
  v_cuenta := case when v_type = 1 then '1405' else '1435' end;
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = v_cuenta
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return null;
end;
$function$;

-- fn_cuenta_iva
CREATE OR REPLACE FUNCTION public.fn_cuenta_iva(p_organization_id integer, p_branch_id integer, p_source text, p_cuenta_regla text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_map text;
  v_clave text;
  v_conf text;
begin
  -- Contador 25-oct-2026 (134115): el INC (2495xx) NO es IVA. Si la regla trae un auxiliar de INC de movimiento,
  -- se usa tal cual (ni el mapeo de IVA ni la clave iva_generado lo pisan).
  if nullif(btrim(p_cuenta_regla), '') like '2495%' and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = btrim(p_cuenta_regla)
       and c.es_movimiento is true) then
    return btrim(p_cuenta_regla);
  end if;

  select tam.account_code into v_map
    from public.tax_account_mapping tam
    left join public.organization_taxes ot
      on ot.id = tam.organization_tax_id
     and ot.organization_id = p_organization_id
    left join public.tax_templates tt
      on tt.id = tam.tax_template_id
   where tam.organization_id = p_organization_id
     and coalesce(tam.is_active, true)
     and (
       (ot.id is not null and coalesce(ot.is_active, true) and ot.kind = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%')
       or (tt.id is not null and coalesce(tt.kind, 'tax') = 'tax'
         and (coalesce(tt.code, '') ilike '%iva%' or coalesce(tt.name, '') ilike '%iva%')
         and coalesce(tt.code, '') not ilike '%rete%'
         and coalesce(tt.name, '') not ilike '%rete%')
     )
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = tam.account_code
          and c.es_movimiento is distinct from false
     )
   order by tam.updated_at desc nulls last, tam.id desc
   limit 1;
  if v_map is not null then
    return v_map;
  end if;

  v_clave := public.fn_clave_cuenta_configurable(
    p_source,
    'impuesto',
    case
      when coalesce(p_source, '') = any (array[
        'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
      ]) then '2408'  -- FIX (A): 2405 fuera de las reglas de impuesto
      else '2408'
    end
  );
  if v_clave is not null then
    select c.account_code into v_conf
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = v_clave
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    if v_conf is not null and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id
         and c.account_code = v_conf
         and c.es_movimiento is distinct from false
    ) then
      return v_conf;
    end if;
  end if;

  -- La cuenta de la regla puede ser un título (2408/240805/240810): auxiliar de sede/tarifa, sin tarifa 19%.
  return public.fn_cuenta_auxiliar_de_titulo(p_organization_id, p_branch_id, nullif(btrim(p_cuenta_regla), ''), null,
    case when coalesce(p_source, '') = any (array[
      'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
    ]) then 'descontable' else 'generado' end);
end;
$function$;

-- fn_cuenta_iva_generado
CREATE OR REPLACE FUNCTION public.fn_cuenta_iva_generado(p_organization_id integer)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select x.cta from (
    select coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_generado'),
                    public.fn_cuenta_auxiliar_de_titulo(p_organization_id, null, '240805', null, 'generado')) as cta) x
   where x.cta like '2408%'
     and exists (select 1 from public.chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = x.cta
                    and coalesce(c.is_active, true) and c.es_movimiento is distinct from false);
$function$;

-- fn_cuenta_movimiento_o_detalle
CREATE OR REPLACE FUNCTION public.fn_cuenta_movimiento_o_detalle(p_organization_id integer, p_branch_id integer, p_cuenta text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v text := nullif(btrim(p_cuenta), '');
  v_det text;
  v_base text;
begin
  if v is null then
    return null;
  end if;
  if public.fn_validar_cuenta_movimiento(p_organization_id, v) is null
     and not public.fn_es_cuenta_de_titulo(p_organization_id, v) then
    return v;
  end if;

  v_base := public.fn_puc_codigo_normalizado(v);
  if v_base is null and v ~ '^1405' then
    v_base := '1405';
  end if;

  if v_base = '1405' or v like '1405%' then
    v_det := public.fn_inventario_auxiliar_1435(p_organization_id, p_branch_id);
    if v_det is null
       or public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is not null
       or public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      v_det := public.fn_puc_cuenta_para_asiento(
        p_organization_id, '1435', 'Mercancías no fabricadas por la empresa'
      );
    end if;
    if v_det is not null
       and public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is null
       and not public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      return v_det;
    end if;
  end if;

  if v_base is not null then
    select c.account_code into v_det
      from public.chart_of_accounts c
     where c.organization_id = p_organization_id
       and c.account_code like v_base || '%'
       and c.account_code <> v_base
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
       and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
     order by length(c.account_code), c.account_code
     limit 1;
    if v_det is not null then
      return v_det;
    end if;
    v_det := public.fn_puc_cuenta_para_asiento(p_organization_id, v_base, v_base);
    if v_det is not null
       and public.fn_validar_cuenta_movimiento(p_organization_id, v_det) is null
       and not public.fn_es_cuenta_de_titulo(p_organization_id, v_det) then
      return v_det;
    end if;
  end if;

  return v;
end;
$function$;

-- fn_cuenta_por_clave
CREATE OR REPLACE FUNCTION public.fn_cuenta_por_clave(p_organization_id integer, p_branch_id integer, p_clave text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select c.account_code into v_cuenta
  from public.configuracion_contable c
  where c.organization_id = p_organization_id and c.clave = p_clave
    and (c.branch_id = p_branch_id or c.branch_id is null)
    and nullif(btrim(c.account_code), '') is not null
  order by c.branch_id nulls last
  limit 1;
  if v_cuenta is null then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    select s.account_code into v_cuenta from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = p_clave;
  end if;
  if v_cuenta is null then
    return null;
  end if;
  -- Títulos que pasan a auxiliar (4295, 6135, 240805, 240810, ...): auxiliar de la sede.
  v_cuenta := public.fn_cuenta_auxiliar_de_titulo(p_organization_id, p_branch_id, v_cuenta, null,
    case when p_clave = 'iva_descontable' then 'descontable' else 'generado' end);
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id and c.account_code = v_cuenta
      and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return null;
end;
$function$;

-- fn_cuenta_redondeo
CREATE OR REPLACE FUNCTION public.fn_cuenta_redondeo(p_org integer, p_branch integer, p_clave text, OUT cuenta text, OUT fallo text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
begin
  select c.account_code into v_cuenta
    from public.configuracion_contable c
   where c.organization_id = p_org
     and c.clave = p_clave
     and (c.branch_id is null or c.branch_id = p_branch)
   order by c.branch_id nulls last
   limit 1;

  if v_cuenta is null then
    fallo := case when p_clave = 'redondeo'
                  then 'Falta la cuenta de redondeo a favor en la configuración contable'
                  else 'Falta la cuenta de redondeo en contra en la configuración contable' end;
    return;
  end if;

  fallo := public.fn_validar_cuenta_movimiento(p_org, v_cuenta);
  if fallo is null then
    cuenta := v_cuenta;
  else
    fallo := 'La cuenta de redondeo no sirve: ' || fallo;
  end if;
end;
$function$;

-- fn_cuenta_retencion_compra
CREATE OR REPLACE FUNCTION public.fn_cuenta_retencion_compra(p_organization_id integer, p_tax_code text, p_concept text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_codigo text := upper(coalesce(btrim(p_tax_code), ''));
  v_concepto text := upper(coalesce(btrim(p_concept), ''));
begin
  if v_codigo <> '' or v_concepto <> '' then
    select m.account_code into v_cuenta
    from tax_account_mapping m
    left join tax_templates tt on tt.id = m.tax_template_id
    left join organization_taxes ot on ot.id = m.organization_tax_id and ot.organization_id = p_organization_id
    left join tax_templates tt2 on tt2.id = ot.template_id
    where m.organization_id = p_organization_id
      and m.is_active
      and ((v_codigo <> '' and v_codigo in (upper(tt.code), upper(tt2.code)))
           or (v_concepto <> '' and upper(btrim(ot.name)) = v_concepto))
      and exists (select 1 from chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = m.account_code)
    order by coalesce(v_concepto <> '' and upper(btrim(ot.name)) = v_concepto, false) desc,
             (m.organization_tax_id is not null) desc,
             m.created_at, m.id
    limit 1;

    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  -- AJUSTE (M7): ReteIVA/ReteICA a sus auxiliares 23670501/23680501 (la madre solo si la org no los tiene).
  return case public.fn_clase_retencion(p_tax_code, p_concept)
    when 'reteica' then coalesce((select c.account_code from public.chart_of_accounts c
                                   where c.organization_id = p_organization_id and c.account_code = '23680501'
                                     and c.es_movimiento is not false), '2368')
    when 'reteiva' then coalesce((select c.account_code from public.chart_of_accounts c
                                   where c.organization_id = p_organization_id and c.account_code = '23670501'
                                     and c.es_movimiento is not false), '2367')
    else coalesce(
      -- Contador 25-oct-2026: un auxiliar de 2365 por concepto; compras por defecto (23654001).
      (select c.account_code from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.es_movimiento is not false
          and c.account_code = case
            when v_concepto ~ 'COMISI' or v_codigo ~ 'COMISI' then '23652001'
            -- AJUSTE: RETE_11 = «Retención honorarios 11%»; RETE_4 = servicios.
            when v_concepto ~ 'HONORARIO' or v_codigo ~ 'HONORARIO' or v_codigo = 'RETE_11' then '23651501'
            when v_codigo = 'RETE_4' then '23652501'
            when v_concepto ~ 'ARREND|ARRIEND' or v_codigo ~ 'ARREND|ARRIEND' then '23653001'
            when v_concepto ~ 'SERVICIO' or v_codigo ~ 'SERVICIO' then '23652501'
            when v_concepto ~ 'SALARI|LABORAL|NOMINA|NÓMINA' then '23650501'
            else '23654001' end),
      (select c.account_code from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = '23654001' and c.es_movimiento is not false),
      '2365')
  end;
end;
$function$;

-- fn_cuenta_retencion_exige_nit
CREATE OR REPLACE FUNCTION public.fn_cuenta_retencion_exige_nit(p_cuenta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(btrim(p_cuenta) ~ '^236[578]', false)
$function$;

-- fn_cuentas_catalogo_guardar
CREATE OR REPLACE FUNCTION public.fn_cuentas_catalogo_guardar(p_organization_id integer, p_tipo text, p_id integer, p_ingreso text, p_costo text, p_inventario text, p_devolucion text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fallo text;
  v_cuenta text;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.create')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.edit')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.create')
    or public.fn_tiene_permiso(p_organization_id, 'product_management')
    or public.fn_tiene_permiso(p_organization_id, 'inventory_management')
  ) then
    raise exception 'SIN_PERMISO: guardar las cuentas del catálogo' using errcode = '42501';
  end if;
  if p_tipo not in ('producto', 'categoria') then
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;

  foreach v_cuenta in array array[p_ingreso, p_costo, p_inventario, p_devolucion] loop
    if nullif(btrim(v_cuenta), '') is null then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(p_organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception '%', v_fallo using errcode = '22023';
    end if;
  end loop;

  if p_tipo = 'producto' then
    update public.products
       set cuenta_ingreso = nullif(btrim(p_ingreso), ''),
           cuenta_costo = nullif(btrim(p_costo), ''),
           cuenta_inventario = nullif(btrim(p_inventario), ''),
           cuenta_devolucion = nullif(btrim(p_devolucion), ''),
           updated_at = now()
     where id = p_id and organization_id = p_organization_id;
  else
    update public.categories
       set cuenta_ingreso = nullif(btrim(p_ingreso), ''),
           cuenta_costo = nullif(btrim(p_costo), ''),
           cuenta_inventario = nullif(btrim(p_inventario), ''),
           cuenta_devolucion = nullif(btrim(p_devolucion), ''),
           updated_at = now()
     where id = p_id and organization_id = p_organization_id;
  end if;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
end;
$function$;

-- fn_cuentas_movimiento_stock
CREATE OR REPLACE FUNCTION public.fn_cuentas_movimiento_stock(p_organization_id integer, p_source text, p_direction text, OUT debito text, OUT credito text, OUT evento text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv text;
  v_cmv text;
  v_faltante text;
  v_tmp text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select o.type_id into v_type
  from public.organizations o
  where o.id = p_organization_id;

  select ar.credit_account_code
    into v_inv
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = 'adjusted'
    and ar.is_active
  order by ar.priority
  limit 1;
  -- QA 25-oct: nunca 1405 (ni 1435 de grupo). Respaldo: auxiliar 1435 de la org, si no 14350101.
  v_inv := coalesce(nullif(btrim(v_inv), ''), public.fn_inventario_auxiliar_1435(p_organization_id, null), '14350101');
  -- 6135 pasa a título en 134060: el respaldo es su auxiliar 61350501. Igual que con 1435, el auxiliar
  -- de la sede lo resuelve después fn_cuenta_configurada_de_sede (branch_account_mappings 6135->61350501).
  -- Hoteles y restaurantes (regla del contador): 61400501 / mermas de cocina 61400502.
  v_cmv := case when v_type in (1, 2) then '61400501' else '61350501' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    case when v_type in (1, 2) then '61400502' else '61350502' end
  );

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = evento
    and ar.is_active
  order by ar.priority
  limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '37050501';
    elsif evento = 'sale' then
      debito := v_cmv;
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := v_cmv;
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '22050501';
    elsif evento = 'loss' then
      debito := v_faltante;
      credito := v_inv;
    else
      debito := v_inv;
      credito := '42959501';
    end if;
  end if;

  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '42959501';
  end if;

  -- Faltante: 61350502 (Mermas y faltantes) es la cuenta correcta desde el 25-oct; cualquier otra
  -- cuenta de costo (6xxx) o 5150/6105 se corrige al faltante configurado.
  if evento = 'loss' and debito is distinct from '61350502'
     and (left(coalesce(debito, ''), 1) = '6' or debito in ('5150', '6105')) then
    debito := v_faltante;
  end if;
end;
$function$;

-- fn_documento_tiene_cuenta_propia
CREATE OR REPLACE FUNCTION public.fn_documento_tiene_cuenta_propia(p_organization_id integer, p_id uuid, p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.invoice_items ii
      left join public.products p
        on p.id = ii.product_id and p.organization_id = p_organization_id
     where case p_tipo
             when 'compra' then ii.invoice_purchase_id = p_id
             when 'documento_soporte' then ii.support_document_id = p_id
             else ii.invoice_sales_id = p_id
           end
       and public.fn_cuenta_catalogo_linea(
             p_organization_id,
             ii.product_id,
             case
               when p_tipo in ('compra', 'documento_soporte') and coalesce(p.track_stock, false)
                 then 'inventario'
               when p_tipo in ('compra', 'documento_soporte') then 'costo'
               when p_tipo = 'nota_credito' then 'devolucion'
               else 'ingreso'
             end,
             ii.cuenta_contable
           ) is not null
  );
$function$;

-- fn_es_cuenta_de_titulo
CREATE OR REPLACE FUNCTION public.fn_es_cuenta_de_titulo(p_organization_id integer, p_cuenta text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select length(coalesce(p_cuenta, '')) < 4
      or exists (
        select 1
          from public.chart_of_accounts h
         where h.organization_id = p_organization_id
           and coalesce(h.is_active, true)
           and h.account_code <> p_cuenta
           and (
             h.parent_code = p_cuenta
             or left(h.account_code, length(p_cuenta)) = p_cuenta
           )
      );
$function$;

-- fn_exigencias_cuenta
CREATE OR REPLACE FUNCTION public.fn_exigencias_cuenta(p_organization_id integer, p_cuenta text, OUT requiere_tercero boolean, OUT requiere_centro_costo boolean)
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(a.requiere_tercero, false) or public.fn_cuenta_retencion_exige_nit(a.account_code),
    coalesce(a.centro_costo_modo, 'no_aplica') = 'obligatorio'
      and exists (
        select 1
          from public.cost_centers c
         where c.organization_id = p_organization_id
           and c.is_active
      )
  from public.chart_of_accounts a
  where a.organization_id = p_organization_id
    and a.account_code = nullif(btrim(p_cuenta), '');
$function$;

-- fn_finanzas_exigir_permiso
CREATE OR REPLACE FUNCTION public.fn_finanzas_exigir_permiso(p_org integer, p_codigos text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return;  -- solo el service role llega aquí (fn_assert_acceso_org rechaza anon)
  end if;
  if exists (select 1 from public.organization_members om
              where om.user_id = v_uid and om.organization_id = p_org and om.is_active
                and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2))) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permisos', p_codigos)::text;
end;
$function$;

-- fn_impuesto_inc_parte
CREATE OR REPLACE FUNCTION public.fn_impuesto_inc_parte(p_tabla text, p_id text, p_tax numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inc numeric := 0;
  v_all numeric := 0;
begin
  if coalesce(p_tax, 0) = 0 or p_id is null then
    return 0;
  end if;
  if p_tabla = 'sales' then
    select coalesce(sum(w) filter (where es_inc), 0), coalesce(sum(w), 0) into v_inc, v_all
      from (select abs(coalesce(si.tax_amount, 0)) as w,
                   abs((case when si.tax_rate > 1 then si.tax_rate / 100 else si.tax_rate end) - 0.08) < 0.0005 as es_inc
              from public.sale_items si
             where si.sale_id::text = p_id and coalesce(si.tax_rate, 0) > 0) x;
  else
    select coalesce(sum(w) filter (where es_inc), 0), coalesce(sum(w), 0) into v_inc, v_all
      from (select abs(case when coalesce(ii.tax_included, false) then coalesce(ii.total_line, 0) * r / (1 + r)
                            else coalesce(ii.total_line, 0) * r end) as w,
                   (upper(coalesce(ii.tax_code, '')) like 'INC%' or abs(r - 0.08) < 0.0005) as es_inc
              from (select i.*, case when i.tax_rate > 1 then i.tax_rate / 100 else coalesce(i.tax_rate, 0) end as r
                      from public.invoice_items i
                     where case p_tabla
                             when 'invoice_purchase' then i.invoice_purchase_id::text = p_id
                             when 'support_documents' then i.support_document_id::text = p_id
                             else i.invoice_sales_id::text = p_id
                           end) ii
             where ii.r > 0 or upper(coalesce(ii.tax_code, '')) like 'INC%') x;
  end if;
  if v_all = 0 or v_inc = 0 then
    return 0;
  end if;
  if v_inc >= v_all then
    return abs(p_tax);
  end if;
  return round(abs(p_tax) * v_inc / v_all, 2);
end;
$function$;

-- fn_inventario_auxiliar_1435
CREATE OR REPLACE FUNCTION public.fn_inventario_auxiliar_1435(p_org integer, p_branch integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sub text;
  v_sufijo text;
  v_ok text;
begin
  if p_org is null then
    return null;
  end if;

  if p_branch is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    where m.organization_id = p_org
      and m.branch_id = p_branch
      and m.base_account_code = '1435'
      and m.sub_account_code like '1435%'
    limit 1;
  end if;

  if v_sub is not null and exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_org
      and c.account_code = v_sub
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_sub;
  end if;

  if p_branch is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    where m.organization_id = p_org
      and m.branch_id = p_branch
      and m.base_account_code = '1405'
      and m.sub_account_code ~ '^1405-[0-9]{1,2}$'
    limit 1;
    if v_sub is not null then
      v_sufijo := lpad(substring(v_sub from '[0-9]+$'), 2, '0');
      v_ok := '143505' || v_sufijo;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_org
          and c.account_code = v_ok
          and coalesce(c.is_active, true)
          and c.es_movimiento is distinct from false
      ) then
        return v_ok;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_org
      and c.account_code = '1435'
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return '1435';
  end if;

  select c.account_code into v_ok
  from public.chart_of_accounts c
  where c.organization_id = p_org
    and c.account_code like '1435%'
    and c.account_code <> '1435'
    and coalesce(c.is_active, true)
    and c.es_movimiento is distinct from false
  order by length(c.account_code), c.account_code
  limit 1;
  if v_ok is not null and left(v_ok, 4) = '1435' then
    return v_ok;
  end if;
  return null;
end;
$function$;

-- fn_is_period_open
CREATE OR REPLACE FUNCTION public.fn_is_period_open(p_organization_id integer, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);

  select status into v_status
    from public.fiscal_periods
   where organization_id = p_organization_id
     and p_date between start_date and end_date
     and period_type = 'monthly'
   limit 1;

  -- Sin periodo mensual se considera abierto, salvo que lo cierre uno mayor.
  if v_status is not null and v_status <> 'open' then
    return false;
  end if;

  if exists (select 1 from public.fiscal_periods
              where organization_id = p_organization_id
                and p_date between start_date and end_date
                and period_type in ('quarterly', 'yearly')
                and status <> 'open') then
    return false;
  end if;

  return true;
end;
$function$;

-- fn_linea_redondeo
CREATE OR REPLACE FUNCTION public.fn_linea_redondeo(p_org integer, p_branch integer, p_debitos numeric, p_creditos numeric, p_exacto_debitos numeric, p_exacto_creditos numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dif numeric := coalesce(p_debitos, 0) - coalesce(p_creditos, 0);
  v_clave text;
  v_cuenta text;
  v_fallo text;
begin
  if v_dif = 0 then
    return null;
  end if;
  -- Sobran débitos: falta un crédito, que es a favor. Sobran créditos: falta un débito, en contra.
  v_clave := case when v_dif > 0 then 'redondeo' else 'redondeo_en_contra' end;
  select r.cuenta, r.fallo into v_cuenta, v_fallo
    from public.fn_cuenta_redondeo(p_org, p_branch, v_clave) r;

  return jsonb_build_object(
    'pendiente', v_cuenta is null,
    'fallo', v_fallo,
    'clave', v_clave,
    'cuenta', v_cuenta,
    'diferencia', abs(v_dif),
    'debito', case when v_dif < 0 then abs(v_dif) else 0 end,
    'credito', case when v_dif > 0 then v_dif else 0 end,
    'traza', jsonb_build_object(
      'clave', v_clave,
      'diferencia', abs(v_dif),
      'debitos_exactos', p_exacto_debitos,
      'creditos_exactos', p_exacto_creditos,
      'debitos_en_pesos', coalesce(p_debitos, 0),
      'creditos_en_pesos', coalesce(p_creditos, 0)
    )
  );
end;
$function$;

-- fn_log_journal_failure
CREATE OR REPLACE FUNCTION public.fn_log_journal_failure(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_source text, p_source_id text, p_fact_key text, p_debit_account text, p_credit_account text, p_amount numeric, p_reason text, p_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO journal_entry_failures (
        organization_id, branch_id, entry_date, source, source_id, fact_key,
        debit_account, credit_account, amount, reason, detail
    ) VALUES (
        p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_debit_account, p_credit_account, p_amount, p_reason, p_detail
    )
    ON CONFLICT (organization_id, fact_key, reason)
      WHERE resolved_at IS NULL AND fact_key IS NOT NULL
    DO UPDATE SET detail = EXCLUDED.detail,
                  last_attempt_at = now();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo registrar el rechazo contable (%): %', p_reason, SQLERRM;
END;
$function$;

-- fn_marcar_revision_iva
CREATE OR REPLACE FUNCTION public.fn_marcar_revision_iva(p_org integer, p_origen text, p_origen_id text, p_titulo text, p_asignada text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into public.contabilidad_revision_iva (organization_id, origen, origen_id, cuenta_titulo, cuenta_asignada)
  values (p_org, p_origen, p_origen_id, p_titulo, p_asignada);
$function$;

-- fn_metodo_es_pasarela
CREATE OR REPLACE FUNCTION public.fn_metodo_es_pasarela(p_metodo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m in (
           'wompi', 'wompi_co', 'epayco', 'mercadopago', 'mercado_pago', 'mp', 'mp_checkout', 'payu', 'payu_co',
           'stripe', 'stripe_payments', 'paypal', 'paypal_checkout', 'bold', 'bold_link', 'bold_qr', 'bold_card',
           'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect', 'bancolombia_transfer',
           'boton_bancolombia', 'su_plus', 'nequi', 'daviplata', 'card', 'credit_card', 'debit_card', 'prepaid_card',
           'account_money', 'visa', 'master', 'mastercard', 'amex', 'diners', 'debvisa', 'debmaster', 'efecty',
           'link', 'venmo', 'apple_pay', 'google_pay', 'sistecredito', 'conekta', 'oxxo', 'openpay', 'kushki', 'dlocal')
      or m like 'wompi%' or m like 'bold\_%' or m like 'mp\_%' or m like 'payu\_%'
      or m like 'stripe\_%' or m like 'paypal\_%' or m like 'mercadopago%'
    from (select lower(btrim(coalesce(p_metodo, ''))) as m) x;
$function$;

-- fn_modo_centro
CREATE OR REPLACE FUNCTION public.fn_modo_centro(p_org integer, p_cuenta text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select a.centro_costo_modo
       from public.chart_of_accounts a
      where a.organization_id = p_org
        and a.account_code = nullif(btrim(p_cuenta), '')),
    'no_aplica'
  );
$function$;

-- fn_nc_asiento_devolucion
CREATE OR REPLACE FUNCTION public.fn_nc_asiento_devolucion(p_org integer, p_nc uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nc public.invoice_sales%rowtype;
  v_rule record;
  v_total numeric;
  v_tax numeric;
  v_neto numeric;
  v_cfg text;
  v_n integer;
  v_cuenta text;
  v_entry integer;
  v_asignado numeric := 0;
  v_monto numeric;
  v_i integer := 0;
  v_grupo record;
  v_inc numeric := 0;
  v_inc_cta text;
  v_tax_cta text;
begin
  if p_nc is null then
    return;
  end if;
  select * into v_nc
    from public.invoice_sales
   where id = p_nc and organization_id = p_org and document_type = 'credit_note';
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.journal_entries je
     where je.organization_id = p_org
       and je.fact_key = 'accrual:credit_note:' || p_nc::text
  ) then
    return;
  end if;

  select * into v_rule
    from public.accounting_rules
   where organization_id = p_org
     and source_type = 'sale_credit_note'
     and event_type = 'created'
     and is_active
   order by priority
   limit 1;
  if v_rule is null then
    perform public.fn_log_journal_failure(
      p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
      'invoice_sales', p_nc::text, 'accrual:credit_note:' || p_nc::text,
      null, null, abs(coalesce(v_nc.total, 0)),
      'no_rule', 'Sin regla contable activa de nota crédito');
    return;
  end if;

  v_total := abs(coalesce(v_nc.total, 0));
  v_tax := case when coalesce(v_rule.use_tax_from_document, false)
                then abs(coalesce(v_nc.tax_total, 0)) else 0 end;
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := v_total - v_tax;
  if v_total <= 0 then
    return;
  end if;

  -- QA 801206c2 ALTO-C: la NC reversa el impuesto donde la venta lo causó. INC decidido por LÍNEA
  -- (fn_impuesto_inc_parte, tax_code INC% o tarifa 8% con tolerancia): todo INC -> cuenta INC (2495);
  -- mixto INC+IVA -> asiento por líneas (fn_armar_asiento_documento separa INC e IVA).
  if v_tax > 0 then
    v_inc := public.fn_impuesto_inc_parte('invoice_sales', p_nc::text, v_tax);
    v_inc_cta := public.fn_cuenta_inc(p_org);
    if v_inc > 0 and v_inc_cta is not null then
      if v_inc >= v_tax then
        v_tax_cta := v_inc_cta;
      else
        perform public.fn_asiento_documento_por_lineas(p_nc, 'nota_credito', 'accrual:credit_note:' || p_nc::text);
        return;
      end if;
    end if;
  end if;

  select c.account_code into v_cfg
    from public.configuracion_contable c
   where c.organization_id = p_org
     and c.clave = 'devoluciones'
     and (c.branch_id = v_nc.branch_id or c.branch_id is null)
   order by c.branch_id nulls last
   limit 1;

  select count(*) into v_n
    from (
      select coalesce(
               nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
               nullif(v_cfg, ''),
               v_rule.debit_account_code
             ) as cuenta
        from public.invoice_items ii
       where ii.invoice_sales_id = p_nc
       group by 1
    ) g;

  if coalesce(v_n, 0) <= 1 then
    select coalesce(
             nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
             nullif(v_cfg, ''),
             v_rule.debit_account_code
           ) into v_cuenta
      from public.invoice_items ii
     where ii.invoice_sales_id = p_nc
     limit 1;
    v_cuenta := coalesce(v_cuenta, v_rule.debit_account_code);
    perform public.fn_create_journal_entry(
      p_organization_id := p_org,
      p_branch_id := v_nc.branch_id,
      p_entry_date := coalesce(v_nc.issue_date, now()),
      p_memo := 'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      p_source := 'invoice_sales',
      p_source_id := p_nc::text,
      p_debit_account := v_cuenta,
      p_credit_account := v_rule.credit_account_code,
      p_amount := v_total,
      p_tax_account := coalesce(v_tax_cta, v_rule.tax_account_code),
      p_tax_amount := v_tax,
      p_tax_is_credit := false,
      p_fact_key := 'accrual:credit_note:' || p_nc::text,
      p_created_by := auth.uid()
    );
    return;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values (
    p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    'invoice_sales', p_nc::text, true, auth.uid(),
    'accrual:credit_note:' || p_nc::text
  ) returning id into v_entry;

  for v_grupo in
    select g.cuenta, g.peso, row_number() over (order by g.cuenta) as nro,
           count(*) over () as cuantos
      from (
        select coalesce(
                 nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
                 nullif(v_cfg, ''),
                 v_rule.debit_account_code
               ) as cuenta,
               sum(abs(coalesce(ii.total_line, 0))) as peso
          from public.invoice_items ii
         where ii.invoice_sales_id = p_nc
         group by 1
      ) g
     order by g.cuenta
  loop
    v_i := v_i + 1;
    if v_i = v_grupo.cuantos then
      v_monto := v_neto - v_asignado;
    elsif coalesce((select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0) = 0 then
      v_monto := round(v_neto / v_grupo.cuantos, 2);
    else
      v_monto := round(v_neto * v_grupo.peso / nullif(
        (select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0), 2);
    end if;
    v_asignado := v_asignado + coalesce(v_monto, 0);
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_grupo.cuenta),
      'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      coalesce(v_monto, 0), 0, coalesce(v_monto, 0), 0
    );
  end loop;

  if v_tax > 0 and v_rule.tax_account_code is not null then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(
        p_org, v_nc.branch_id,
        coalesce(v_tax_cta, public.fn_cuenta_iva(p_org, v_nc.branch_id, 'invoice_sales', v_rule.tax_account_code))),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      v_tax, 0, v_tax, 0
    );
  end if;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
  ) values (
    v_entry,
    public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_rule.credit_account_code),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    0, v_total, 0, v_total
  );
end;
$function$;

-- fn_nombre_clave_contable
CREATE OR REPLACE FUNCTION public.fn_nombre_clave_contable(p_clave text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_clave
    when 'caja' then 'Caja'
    when 'bancos' then 'Bancos'
    when 'clientes' then 'Clientes'
    when 'proveedores' then 'Proveedores'
    when 'ventas_productos' then 'Ventas de productos'
    when 'ventas_servicios' then 'Ventas de servicios'
    when 'devoluciones' then 'Devoluciones'
    when 'descuentos' then 'Descuentos'
    when 'costo_ventas' then 'Costo de ventas'
    when 'inventario' then 'Inventario'
    when 'iva_generado' then 'IVA generado'
    when 'iva_descontable' then 'IVA descontable'
    when 'retefuente' then 'ReteFuente'
    when 'reteiva' then 'ReteIVA'
    when 'reteica' then 'ReteICA'
    when 'propinas' then 'Propinas'
    when 'comisiones' then 'Comisiones'
    when 'anticipos' then 'Anticipos'
    when 'nomina' then 'Nómina'
    when 'nomina_por_pagar' then 'Nómina por pagar'
    when 'nomina_aportes' then 'Aportes de nómina'
    else p_clave
  end;
$function$;

-- fn_pasivos_asegurar_auxiliares
CREATE OR REPLACE FUNCTION public.fn_pasivos_asegurar_auxiliares(p_org integer, p_migracion text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select * from (values
      ('220505',   '2205',   'Proveedores nacionales',                     false,  1),
      ('22050501', '220505', 'Proveedores nacionales',                     true,   2),
      ('250505',   '2505',   'Salarios por pagar',                         false,  3),
      ('25050501', '250505', 'Salarios por pagar',                         true,   4),
      ('25050502', '250505', 'Comisiones por pagar a empleados',           true,   5),
      ('233520',   '2335',   'Comisiones',                                 false,  6),
      ('23352001', '233520', 'Comisiones por pagar a terceros',            true,   7),
      ('23352002', '233520', 'Comisiones por pagar a OTA',                 true,   8),
      ('233595',   '2335',   'Otros',                                      false,  9),
      ('23359501', '233595', 'Otros costos y gastos por pagar',            true,  10),
      ('236505',   '2365',   'Salarios y pagos laborales',                 false, 11),
      ('23650501', '236505', 'Retención salarios y pagos laborales',       true,  12),
      ('236515',   '2365',   'Honorarios',                                 false, 13),
      ('23651501', '236515', 'Retención honorarios',                       true,  14),
      ('236520',   '2365',   'Comisiones',                                 false, 15),
      ('23652001', '236520', 'Retención comisiones',                       true,  16),
      ('236525',   '2365',   'Servicios',                                  false, 17),
      ('23652501', '236525', 'Retención servicios',                        true,  18),
      ('236530',   '2365',   'Arrendamientos',                             false, 19),
      ('23653001', '236530', 'Retención arrendamientos',                   true,  20),
      ('236540',   '2365',   'Compras',                                    false, 21),
      ('23654001', '236540', 'Retención compras',                          true,  22),
      -- AJUSTE (M7): ReteIVA/ReteICA practicados (compras) y retenciones que nos practican (ventas, 1355).
      ('236705',   '2367',   'Impuesto a las ventas retenido',             false, 23),
      ('23670501', '236705', 'ReteIVA por pagar',                          true,  24),
      ('236805',   '2368',   'Impuesto de industria y comercio retenido',  false, 25),
      ('23680501', '236805', 'ReteICA por pagar',                          true,  26),
      ('13551501', '135515', 'Retención en la fuente que nos practicaron', true,  27),
      ('13551701', '135517', 'ReteIVA que nos practicaron',                true,  28),
      ('13551801', '135518', 'ReteICA que nos practicaron',                true,  29)
    ) as t(codigo, padre, nombre, mov, orden)
    order by orden   -- todo padre antes que sus hijos
  loop
    continue when exists (select 1 from public.chart_of_accounts
                           where organization_id = p_org and account_code = r.codigo);
    continue when not exists (select 1 from public.chart_of_accounts
                               where organization_id = p_org and account_code = r.padre);
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, r.codigo, r.nombre, p.type, r.padre, true,
           p.naturaleza, r.mov, coalesce(p.requiere_tercero, false), p.requiere_centro_costo,
           p.centro_costo_modo, p.presentacion_niif, now(), now()
      from public.chart_of_accounts p
     where p.organization_id = p_org and p.account_code = r.padre
    on conflict (organization_id, account_code) do nothing;
    if found then
      v_n := v_n + 1;
      if p_migracion is not null then
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values (p_migracion, p_org, 'cuenta_nueva', r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;

-- fn_propuesta_configuracion_sector
CREATE OR REPLACE FUNCTION public.fn_propuesta_configuracion_sector(p_type_id integer)
 RETURNS TABLE(clave text, account_code text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '414015'
        when 2 then '4140'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '4140'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '61400501' else '61350501' end
      when 'faltante_inventario' then case when p_type_id in (1, 2) then '61400502' else v.defecto end
      -- Inventario: nunca 1405 ni el título 1435 (título en 55 de 56 orgs H/R): auxiliar de movimiento
      -- 14350101, igual que el TS (QA 25-oct). fn_sembrar_configuracion_contable puede afinarlo por sede.
      when 'inventario' then '14350101'
      else v.defecto
    end
  from (values
    ('caja', '1105'),
    ('bancos', '1110'),
    ('clientes', '1305'),
    ('proveedores', '2205'),
    ('ventas_productos', '4135'),
    ('ventas_servicios', '4235'),
    ('devoluciones', '4175'),
    ('descuentos', '4175'),
    ('costo_ventas', '61350501'),
    ('inventario', '14350101'),
    ('iva_generado', '24080501'),
    ('iva_descontable', '24081001'),
    ('retefuente', '2365'),
    ('reteiva', '2367'),
    ('reteica', '2368'),
    ('propinas', '5105'),
    ('comisiones', '529505'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370'),
    ('faltante_inventario', '519595'),
    ('gastos_extraordinarios', '5315'),
    ('consumo_interno', '519595'),
    ('manifiesto_por_pagar', '2205'),
    ('manifiesto_transporte', '2335'),
    ('saldo_inicial', '37050501'),
    ('impuesto_consumo', '2495'),
    ('redondeo', '42958101'),
    ('ingresos_diversos', '42959501'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$function$;

-- fn_puc_asegurar_cuenta
CREATE OR REPLACE FUNCTION public.fn_puc_asegurar_cuenta(p_organization_id integer, p_codigo text, p_nombre text, p_movimiento boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_codigo text := public.fn_puc_codigo_normalizado(p_codigo);
  v_largo integer;
  v_paso integer;
  v_prefijo text;
  v_padre text;
  v_nombre text;
  v_tipo text;
  v_nat text;
  v_modo text;
  v_pres text;
  v_desc text;
  v_tercero boolean;
  v_mov boolean;
  v_padre_mov boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_codigo !~ '^[1-9][0-9]*$' then
    return null;
  end if;
  v_largo := length(v_codigo);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    return null;
  end if;

  v_paso := 1;
  while v_paso <= v_largo loop
    v_prefijo := left(v_codigo, v_paso);
    if not exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = v_prefijo
    ) then
      v_padre := case
        when v_paso = 1 then null
        when v_paso = 2 then left(v_prefijo, 1)
        when v_paso = 4 then left(v_prefijo, 2)
        when v_paso = 6 then left(v_prefijo, 4)
        when v_paso = 8 then left(v_prefijo, 6)
        else left(v_prefijo, v_paso - 2)
      end;
      if v_padre is not null and not exists (
        select 1 from public.chart_of_accounts
        where organization_id = p_organization_id and account_code = v_padre
      ) then
        return null;
      end if;

      select p.nombre, p.tipo, p.naturaleza, p.requiere_tercero, p.centro_costo_modo,
             p.presentacion_niif, p.descripcion
        into v_nombre, v_tipo, v_nat, v_tercero, v_modo, v_pres, v_desc
      from public.puc_plantilla p
      where p.codigo = v_prefijo;

      v_mov := case when v_paso = v_largo then p_movimiento else false end;
      if v_paso in (1, 2) then
        v_mov := false;
      end if;
      v_nombre := coalesce(
        v_nombre,
        case when v_prefijo = v_codigo then nullif(btrim(p_nombre), '') end,
        'Cuenta ' || v_prefijo
      );
      v_tipo := coalesce(v_tipo, (
        select c.type from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_padre
      ), case left(v_prefijo, 1)
        when '1' then 'asset'
        when '2' then 'liability'
        when '3' then 'equity'
        when '4' then 'income'
        when '5' then 'expense'
        when '6' then 'expense'
        when '7' then 'expense'
        else 'order'
      end);
      v_nat := coalesce(v_nat, case
        when left(v_prefijo, 2) in ('84', '86', '88') then 'credito'
        when left(v_prefijo, 2) in ('94', '96', '98') then 'debito'
        when left(v_prefijo, 1) in ('1', '5', '6', '7', '8') then 'debito'
        else 'credito'
      end);
      v_modo := coalesce(v_modo, case
        when v_mov and left(v_prefijo, 1) in ('5', '6', '7') then 'obligatorio'
        when left(v_prefijo, 1) in ('4', '5', '6', '7') then 'opcional'
        else 'no_aplica'
      end);
      v_padre_mov := v_padre is not null and exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = v_padre
          and c.es_movimiento is true
      );

      -- Un grupo que ya es de movimiento sigue recibiendo asientos.
      -- El auxiliar convive: los reportes suman por prefijo.
      if v_padre_mov then
        execute 'alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta';
      end if;
      begin
        insert into public.chart_of_accounts (
          organization_id, account_code, name, type, parent_code, is_active, description,
          naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
          centro_costo_modo, presentacion_niif
        ) values (
          p_organization_id, v_prefijo, v_nombre, v_tipo, v_padre, true, v_desc,
          v_nat, v_mov, coalesce(v_tercero, false), v_modo = 'obligatorio',
          v_modo, coalesce(v_pres, public.fn_puc_presentacion_defecto(v_prefijo))
        )
        on conflict (organization_id, account_code) do nothing;
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
      exception when others then
        if v_padre_mov then
          execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
        end if;
        raise;
      end;
    end if;

    if v_paso = 1 then
      v_paso := 2;
    elsif v_paso = 2 then
      v_paso := 4;
    elsif v_paso = 4 then
      v_paso := 6;
    elsif v_paso = 6 then
      v_paso := 8;
    else
      v_paso := v_paso + 2;
    end if;
  end loop;
  return v_codigo;
end;
$function$;

-- fn_puc_codigo_normalizado
CREATE OR REPLACE FUNCTION public.fn_puc_codigo_normalizado(p_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select replace(coalesce(p_code, ''), '-', '');
$function$;

-- fn_puc_cuenta_de_sede
CREATE OR REPLACE FUNCTION public.fn_puc_cuenta_de_sede(p_organization_id integer, p_branch_id integer, p_cuenta text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_mov boolean;
  v_sub text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_cuenta is null then
    return null;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = p_organization_id
    and account_code = p_cuenta;

  if v_mov is distinct from false or p_branch_id is null then
    return p_cuenta;
  end if;

  select sub_account_code into v_sub
  from public.branch_account_mappings
  where organization_id = p_organization_id
    and branch_id = p_branch_id
    and base_account_code = p_cuenta
  limit 1;

  if v_sub is not null and exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id
      and account_code = v_sub
      and es_movimiento is distinct from false
  ) then
    return v_sub;
  end if;

  return p_cuenta;
end;
$function$;

-- fn_puc_cuenta_para_asiento
CREATE OR REPLACE FUNCTION public.fn_puc_cuenta_para_asiento(p_organization_id integer, p_codigo text, p_nombre text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_codigo text := public.fn_puc_codigo_normalizado(p_codigo);
  v_cuenta text;
  v_largo integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_codigo is null then
    return null;
  end if;

  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = v_codigo
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_codigo;
  end if;

  select c.account_code into v_cuenta
  from public.chart_of_accounts c
  where c.organization_id = p_organization_id
    and c.account_code <> v_codigo
    and public.fn_puc_codigo_normalizado(c.account_code) like v_codigo || '%'
    and coalesce(c.is_active, true)
    and c.es_movimiento is distinct from false
  order by length(public.fn_puc_codigo_normalizado(c.account_code)), c.account_code
  limit 1;
  if v_cuenta is not null then
    return v_cuenta;
  end if;

  v_largo := length(v_codigo);
  if v_largo <= 2 then
    return null;
  end if;
  perform public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo, p_nombre, false);
  if v_largo = 4 then
    perform public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '05', coalesce(p_nombre, v_codigo) || ' por sede', false);
    return public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '0501', coalesce(p_nombre, v_codigo), true);
  end if;
  return public.fn_puc_asegurar_cuenta(p_organization_id, v_codigo || '01', coalesce(p_nombre, v_codigo), true);
end;
$function$;

-- fn_puc_presentacion_defecto
CREATE OR REPLACE FUNCTION public.fn_puc_presentacion_defecto(p_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case left(public.fn_puc_codigo_normalizado(p_code), 2)
    when '11' then 'corriente'
    when '13' then 'corriente'
    when '14' then 'corriente'
    when '22' then 'corriente'
    when '23' then 'corriente'
    when '24' then 'corriente'
    when '25' then 'corriente'
    when '26' then 'corriente'
    when '28' then 'corriente'
    when '15' then 'no_corriente'
    when '16' then 'no_corriente'
    when '18' then 'no_corriente'
    when '19' then 'no_corriente'
    when '29' then 'no_corriente'
    when '12' then 'segun_plazo'
    when '17' then 'segun_plazo'
    when '21' then 'segun_plazo'
    when '27' then 'segun_plazo'
    else null
  end;
$function$;

-- fn_redondeo_insertar_linea
CREATE OR REPLACE FUNCTION public.fn_redondeo_insertar_linea(p_entry_id integer, p_redondeo jsonb, p_centro uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit, cost_center_id, redondeo_traza
  ) values (
    p_entry_id, p_redondeo->>'cuenta', 'Redondeo a pesos',
    (p_redondeo->>'debito')::numeric, (p_redondeo->>'credito')::numeric,
    p_centro, p_redondeo->'traza'
  );
end;
$function$;

-- fn_redondeo_pendiente_registrar
CREATE OR REPLACE FUNCTION public.fn_redondeo_pendiente_registrar(p_org integer, p_branch integer, p_fecha timestamp with time zone, p_source text, p_source_id text, p_fact_key text, p_memo text, p_created_by uuid, p_lineas jsonb, p_redondeo jsonb, p_exacto_debitos numeric, p_exacto_creditos numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_propuesto jsonb;
  v_detalle text;
  v_id bigint;
begin
  v_propuesto := jsonb_build_object(
    'memo', p_memo, 'source', p_source, 'source_id', p_source_id, 'fact_key', p_fact_key,
    'fecha', p_fecha, 'branch_id', p_branch, 'created_by', p_created_by,
    'lineas', p_lineas,
    'clave', p_redondeo->>'clave',
    'diferencia', (p_redondeo->>'diferencia')::numeric,
    'debitos_en_pesos', (p_redondeo->'traza'->>'debitos_en_pesos')::numeric,
    'creditos_en_pesos', (p_redondeo->'traza'->>'creditos_en_pesos')::numeric,
    'exacto_debitos', p_exacto_debitos,
    'exacto_creditos', p_exacto_creditos
  );
  v_detalle := coalesce(p_redondeo->>'fallo', 'Falta la cuenta de redondeo')
    || '. Diferencia de ' || (p_redondeo->>'diferencia') || ' por redondeo: el asiento queda pendiente y no se publica descuadrado.';

  select f.id into v_id
    from public.journal_entry_failures f
   where f.organization_id = p_org
     and f.reason = 'redondeo_sin_cuenta'
     and f.resolved_at is null
     and (case when p_fact_key is not null then f.fact_key = p_fact_key
               else f.source is not distinct from p_source and f.source_id is not distinct from p_source_id end)
   order by f.id
   limit 1
   for update;

  if v_id is null then
    insert into public.journal_entry_failures (
      organization_id, branch_id, entry_date, source, source_id, fact_key,
      amount, reason, detail, asiento_propuesto
    ) values (
      p_org, p_branch, p_fecha, p_source, p_source_id, p_fact_key,
      (p_redondeo->>'diferencia')::numeric, 'redondeo_sin_cuenta', v_detalle, v_propuesto
    );
  else
    update public.journal_entry_failures
       set amount = (p_redondeo->>'diferencia')::numeric, detail = v_detalle, asiento_propuesto = v_propuesto
     where id = v_id;
  end if;
end;
$function$;

-- fn_regla_devengo_compra
CREATE OR REPLACE FUNCTION public.fn_regla_devengo_compra(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payable text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.debit_account_code into v_payable
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select r.debit_account_code,
         coalesce(v_payable, r.credit_account_code),
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
  order by
    (r.credit_account_code = v_payable) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if v_credit = '2105' or (v_type in (4, 6) and v_credit in ('2105', '2205', '22050501')) then
      if v_type in (4, 6) then
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'compra_servicio'), '23359501');
      else
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'), '22050501');
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      elsif v_credit = '2105' then
        v_credit := case when v_type in (4, 6) then '23359501' else '22050501' end;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_descontable'),
        public.fn_cuenta_auxiliar_de_titulo(p_organization_id, null, '240810', null, 'descontable'));
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$function$;

-- fn_regla_devengo_venta
CREATE OR REPLACE FUNCTION public.fn_regla_devengo_venta(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recv text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.credit_account_code into v_recv
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select coalesce(v_recv, r.debit_account_code),
         r.credit_account_code,
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
    and r.credit_account_code like '4%'
  order by
    (r.debit_account_code = v_recv) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_credit is null and v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if coalesce(v_type, 3) in (1, 2, 3)
       and v_credit in ('4105', '4110', '4115', '4135', '4140', '414005', '414015', '414095') then  -- 414015: título en restaurantes tras 134120
      v_destino := public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos');
      if v_destino is null then
        v_destino := case
          when v_type = 1 then '41401501'
          when v_type = 2 and exists (
            select 1 from public.chart_of_accounts c
            where c.organization_id = p_organization_id and c.account_code = '4140'
              and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
          ) then '4140'
          when v_type = 2 then '414005'
          else '4135'
        end;
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      end if;
    end if;

    -- FIX (A): el INC se decide por LÍNEA del documento (fn_impuesto_inc_parte / fn_cuenta_inc en los
    -- llamadores), no por org. Aquí la cuenta de impuesto es siempre IVA generado: 2405, 2408 o una 2495
    -- heredada pasan al auxiliar de IVA generado (el IVA 19% nunca va a 24950501).
    if v_tax = '2405' or v_tax = '2408' or v_tax like '2495%' then
      v_destino := public.fn_cuenta_iva_generado(p_organization_id);
      if v_destino is not null then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$function$;

-- fn_resolver_cuenta_configurada
CREATE OR REPLACE FUNCTION public.fn_resolver_cuenta_configurada(p_organization_id integer, p_branch_id integer, p_source text, p_lado text, p_codigo text, OUT cuenta text, OUT fallo text)
 RETURNS record
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_clave text;
  v_nombre text;
  v_conf text;
begin
  cuenta := nullif(btrim(p_codigo), '');
  fallo := null;
  v_clave := public.fn_clave_cuenta_configurable(p_source, p_lado, cuenta);
  if v_clave is null or cuenta is null then
    return;
  end if;

  select c.account_code into v_conf
  from public.configuracion_contable c
  where c.organization_id = p_organization_id
    and c.clave = v_clave
    and (c.branch_id = p_branch_id or c.branch_id is null)
  order by c.branch_id nulls last
  limit 1;

  if v_conf is null then
    return;
  end if;

  v_nombre := public.fn_nombre_clave_contable(v_clave);

  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = v_conf
  ) then
    fallo := 'La cuenta configurada ' || v_conf || ' (' || v_nombre || ') no está en el plan contable';
    cuenta := v_conf;
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id
      and account_code = v_conf
      and es_movimiento is false
  ) then
    fallo := 'La cuenta configurada ' || v_conf || ' (' || v_nombre || ') no es de movimiento';
    cuenta := v_conf;
    return;
  end if;

  cuenta := v_conf;
end;
$function$;

-- fn_tercero_de_documento
CREATE OR REPLACE FUNCTION public.fn_tercero_de_documento(p_tipo text, p_id uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_sales i
      left join public.customers c
        on c.id = i.customer_id
       and c.organization_id = i.organization_id
     where i.id = p_id;

    -- El devengo del POS usa el id de la venta, que no es el id de la factura.
    if not found and p_tipo = 'venta' then
      select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
             nullif(btrim(c.full_name), ''),
             s.organization_id
        into nit, nombre, v_org
        from public.sales s
        left join public.customers c
          on c.id = s.customer_id
         and c.organization_id = s.organization_id
       where s.id = p_id;
    end if;

    if nit is null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$function$;

-- fn_tiene_permiso
CREATE OR REPLACE FUNCTION public.fn_tiene_permiso(p_organization_id integer, p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active)
     and p_code = any (coalesce(public.get_user_permission_codes(auth.uid(), p_organization_id), array[]::text[]));
$function$;

-- fn_validar_cuenta_linea_documento
CREATE OR REPLACE FUNCTION public.fn_validar_cuenta_linea_documento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_fallo text;
begin
  new.cuenta_contable := nullif(btrim(new.cuenta_contable), '');
  if new.cuenta_contable is null then
    return new;
  end if;
  if new.invoice_sales_id is not null then
    select organization_id into v_org from public.invoice_sales where id = new.invoice_sales_id;
  elsif new.invoice_purchase_id is not null then
    select organization_id into v_org from public.invoice_purchase where id = new.invoice_purchase_id;
  elsif new.support_document_id is not null then
    select organization_id into v_org from public.support_documents where id = new.support_document_id;
  end if;
  if v_org is null then
    return new;
  end if;
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, new.cuenta_contable);
  if v_fallo is not null then
    raise exception '%', v_fallo using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- fn_validar_cuenta_movimiento
CREATE OR REPLACE FUNCTION public.fn_validar_cuenta_movimiento(p_organization_id integer, p_cuenta text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text := nullif(btrim(p_cuenta), '');
  v_activa boolean;
  v_mov boolean;
begin
  if v_cuenta is null then
    return 'Elige una cuenta de movimiento';
  end if;
  select a.is_active, a.es_movimiento
    into v_activa, v_mov
    from public.chart_of_accounts a
   where a.organization_id = p_organization_id
     and a.account_code = v_cuenta;
  if not found then
    return 'La cuenta ' || v_cuenta || ' no está en el plan contable';
  end if;
  if v_activa is false then
    return 'La cuenta ' || v_cuenta || ' no está activa';
  end if;
  if v_mov is false or public.fn_es_cuenta_de_titulo(p_organization_id, v_cuenta) then
    return 'La cuenta ' || v_cuenta || ' no es de movimiento';
  end if;
  return null;
end;
$function$;

-- fn_validar_cuentas_catalogo
CREATE OR REPLACE FUNCTION public.fn_validar_cuentas_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_fallo text;
begin
  new.cuenta_ingreso := nullif(btrim(new.cuenta_ingreso), '');
  new.cuenta_costo := nullif(btrim(new.cuenta_costo), '');
  new.cuenta_inventario := nullif(btrim(new.cuenta_inventario), '');
  new.cuenta_devolucion := nullif(btrim(new.cuenta_devolucion), '');
  foreach v_cuenta in array array[new.cuenta_ingreso, new.cuenta_costo, new.cuenta_inventario, new.cuenta_devolucion] loop
    if v_cuenta is null then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(new.organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception '%', v_fallo using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$function$;

-- fn_vista_previa_asiento_documento
CREATE OR REPLACE FUNCTION public.fn_vista_previa_asiento_documento(p_tipo text, p_id uuid, p_lineas jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_armado jsonb;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_tipo = 'compra' then
    select organization_id into v_org from public.invoice_purchase where id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select organization_id into v_org from public.support_documents where id = p_id;
  else
    select organization_id into v_org from public.invoice_sales where id = p_id;
  end if;
  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;
  perform public.fn_assert_acceso_org(v_org);
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.view', 'finance.create']);
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, p_lineas);
  return v_armado;
end;
$function$;

-- get_user_permission_codes
CREATE OR REPLACE FUNCTION public.get_user_permission_codes(p_user_id uuid, p_organization_id integer)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role_id INTEGER;
  v_job_position_id UUID;
  v_is_super_admin BOOLEAN;
  v_permissions TEXT[];
BEGIN
  -- Quién puede preguntar por quién (resuelto en la base, nunca por nombre de rol).
  IF v_uid IS NULL THEN
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Acceso denegado a los permisos' USING errcode = '42501';
    END IF;
    -- service_role o trabajo interno: sin restricción.
  ELSIF p_user_id IS DISTINCT FROM v_uid THEN
    PERFORM public.fn_assert_acceso_org(p_organization_id);
    IF NOT EXISTS (
         SELECT 1 FROM public.organization_members om
         WHERE om.user_id = v_uid
           AND om.organization_id = p_organization_id
           AND om.is_active = true
           AND (coalesce(om.is_super_admin, false) OR om.role_id IN (1, 2))
       )
       AND NOT coalesce(public.check_user_permission(v_uid, p_organization_id, 'users.view'), false)
    THEN
      RAISE EXCEPTION 'Acceso denegado a los permisos de otro usuario' USING errcode = '42501';
    END IF;
  END IF;

  -- Obtener datos del miembro
  SELECT om.role_id, om.job_position_id, om.is_super_admin
  INTO v_role_id, v_job_position_id, v_is_super_admin
  FROM organization_members om
  WHERE om.user_id = p_user_id
    AND om.organization_id = p_organization_id
    AND om.is_active = true
  LIMIT 1;

  -- Super admin tiene todos los permisos
  IF v_is_super_admin = true THEN
    SELECT ARRAY_AGG(p.code)
    INTO v_permissions
    FROM permissions p;
    RETURN v_permissions;
  END IF;

  -- Combinar ROL + CARGO con precedencia
  WITH role_perms AS (
    SELECT p.id, p.code, rp.allowed
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id
  ),
  job_perms AS (
    SELECT p.id, p.code, jpp.allowed
    FROM job_position_permissions jpp
    JOIN permissions p ON p.id = jpp.permission_id
    WHERE jpp.job_position_id = v_job_position_id
      AND v_job_position_id IS NOT NULL
  ),
  combined AS (
    SELECT DISTINCT
      COALESCE(jp.id, rp.id) AS permission_id,
      COALESCE(jp.code, rp.code) AS code,
      CASE
        WHEN jp.id IS NOT NULL THEN jp.allowed  -- Cargo tiene precedencia
        ELSE rp.allowed
      END AS final_allowed
    FROM role_perms rp
    FULL OUTER JOIN job_perms jp ON jp.id = rp.id
  )
  SELECT ARRAY_AGG(c.code)
  INTO v_permissions
  FROM combined c
  WHERE c.final_allowed = true;

  RETURN COALESCE(v_permissions, ARRAY[]::TEXT[]);
END;
$function$;

