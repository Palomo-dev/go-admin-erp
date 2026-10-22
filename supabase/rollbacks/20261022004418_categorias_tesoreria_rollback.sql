-- Revierte 20261022004418_categorias_tesoreria.
--
-- Restaura pos_caja_registrar_movimiento (md5 c9678841dca7b2f0fc02a70cbbc06d82),
-- fn_auto_journal_cash_movement (md5 4faa030643021db6bd3c17b16ef0c0a3) y
-- fn_auto_journal_bank (md5 bd878a0b8357fe8888036bad6803ea88), medidos antes
-- de esta migración.
--
-- No restaura categorías ni archivos: la migración no inserta categorías en
-- las organizaciones existentes. Si alguien ya guardó movimientos con
-- categoría, esas columnas se pierden al quitarlas. El bucket se borra solo
-- si quedó vacío; los soportes cargados no se eliminan.

drop trigger if exists trg_validar_datos_tesoreria_caja on public.cash_movements;
drop trigger if exists trg_validar_datos_tesoreria_banco on public.bank_transactions;

drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text);

create or replace function public.pos_caja_registrar_movimiento(
  p_session_id integer,
  p_tipo text,
  p_monto numeric,
  p_concepto text,
  p_concept_code text default null,
  p_referencia text default null,
  p_notas text default null,
  p_uuid uuid default null,
  p_creado_en timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  m public.cash_movements;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id, organization_id, branch_id, status, opened_at
    into s
    from public.cash_sessions
   where id = p_session_id
   for share;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;

  perform public.fn_assert_acceso_org(s.organization_id);
  if s.branch_id is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  if p_uuid is not null then
    select * into m from public.cash_movements where organization_id = s.organization_id and uuid = p_uuid;
    if found then
      return to_jsonb(m) || jsonb_build_object('ya_registrado', true);
    end if;
  end if;

  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;
  if p_tipo is null or p_tipo not in ('in', 'out') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_concepto), '') = '' then
    raise exception 'concepto_requerido' using errcode = '22023';
  end if;

  insert into public.cash_movements (
    uuid, organization_id, cash_session_id, branch_id, type, concept, concept_code,
    reference, amount, user_id, notes, created_at
  ) values (
    coalesce(p_uuid, gen_random_uuid()), s.organization_id, s.id, s.branch_id, p_tipo, btrim(p_concepto),
    nullif(btrim(p_concept_code), ''), nullif(btrim(p_referencia), ''), round(p_monto, 2), v_uid,
    nullif(btrim(p_notas), ''),
    case when p_creado_en is not null and p_creado_en >= s.opened_at and p_creado_en <= now() + interval '5 minutes'
         then p_creado_en else now() end
  )
  returning * into m;

  return to_jsonb(m) || jsonb_build_object('ya_registrado', false);
end;
$$;

revoke all on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz) to authenticated, service_role;

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_entry_id integer;
  v_session record;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
begin
  if new.return_id is not null then
    return new;
  end if;

  select cs.organization_id, cs.branch_id
    into v_session
    from public.cash_sessions cs
   where cs.id = new.cash_session_id;

  if v_session is null then
    return new;
  end if;

  v_es_entrada := coalesce(new.type, 'in') in ('in', 'deposit', 'income');
  v_importe := abs(coalesce(new.amount, 0));
  if coalesce(new.amount, 0) < 0 then
    v_es_entrada := not v_es_entrada;
  end if;
  if v_importe <= 0 then
    return new;
  end if;

  select a.accion, a.debito, a.credito
    into v_asiento
    from public.fn_asiento_movimiento_caja(
      v_session.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.concept_code
    ) a;

  if v_asiento.accion = 'omitir' then
    return new;
  end if;

  if v_asiento.accion is distinct from 'asiento' or v_asiento.debito is null or v_asiento.credito is null then
    perform public.fn_log_journal_failure(
      v_session.organization_id, v_session.branch_id, new.created_at,
      'cash_movements', new.id::text, 'cash_move:' || new.id::text,
      v_asiento.debito, v_asiento.credito, v_importe,
      'sin_cuenta', 'El egreso no tiene cuenta de gasto (clase 5) ni la del concepto; no se debita 4105');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := v_session.organization_id,
    p_branch_id := v_session.branch_id,
    p_entry_date := new.created_at,
    p_memo := 'Mov. Caja: ' || coalesce(new.type, '') || ' - ' || coalesce(new.concept, ''),
    p_source := 'cash_movements',
    p_source_id := new.id::text,
    p_debit_account := v_asiento.debito,
    p_credit_account := v_asiento.credito,
    p_amount := v_importe,
    p_fact_key := 'cash_move:' || new.id::text
  );

  return new;
end;
$function$;

create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_importe numeric := abs(coalesce(new.amount, 0));
begin
  if v_importe <= 0 then
    return new;
  end if;

  select branch_id, nullif(btrim(account_code), '')
    into v_branch_id, v_banco
    from public.bank_accounts
   where id = new.bank_account_id
     and organization_id = new.organization_id;

  select min(id) into v_default_branch from public.branches where organization_id = new.organization_id;
  v_branch_id := coalesce(v_branch_id, v_default_branch);

  if v_banco is null or public.fn_es_cuenta_de_titulo(new.organization_id, v_banco) then
    v_banco := public.fn_primera_cuenta_detalle(new.organization_id, array['1110', '1105']);
  end if;

  if new.amount < 0 then
    v_debito := public.fn_primera_cuenta_detalle(new.organization_id, array['5305', '5195', '5135']);
    v_credito := v_banco;
  else
    v_debito := v_banco;
    v_credito := public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']);
  end if;

  if v_debito is null or v_credito is null
     or left(v_debito, 1) = '4'
     or left(v_credito, 1) = '5' then
    perform public.fn_log_journal_failure(
      new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
      'bank_transactions', new.id::text, 'bank:' || new.id::text,
      v_debito, v_credito, v_importe,
      'sin_cuenta', 'El ajuste de banco no usa 5105 ni 4105 y no encontró cuenta de detalle');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch_id,
    p_entry_date := coalesce(new.trans_date, new.created_at, now()),
    p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
    p_source := 'bank_transactions',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := v_importe,
    p_fact_key := 'bank:' || new.id::text
  );

  return new;
end;
$function$;

alter table public.cash_movements
  drop column if exists soporte_path,
  drop column if exists tercero_nombre,
  drop column if exists tercero_nit,
  drop column if exists centro_costo_id,
  drop column if exists cuenta_contable,
  drop column if exists categoria_id;

alter table public.bank_transactions
  drop column if exists soporte_path,
  drop column if exists tercero_nombre,
  drop column if exists tercero_nit,
  drop column if exists centro_costo_id,
  drop column if exists cuenta_contable,
  drop column if exists categoria_id;

drop trigger if exists tr_zzz_categorias_tesoreria on public.organizations;
drop trigger if exists trg_categorias_tesoreria_guardar on public.categorias_tesoreria;

drop function if exists public.fn_vista_previa_asiento_tesoreria(integer, text, text, integer, text);
drop function if exists public.fn_asiento_tesoreria_elegido(integer, text, text, text);
drop function if exists public.fn_tesoreria_fallo_cuenta(integer, text);
drop function if exists public.fn_sembrar_categorias_tesoreria(integer);
drop function if exists public.trg_fn_sembrar_categorias_tesoreria();
drop function if exists public.fn_validar_datos_tesoreria();
drop function if exists public.fn_categorias_tesoreria_guardar();

drop table if exists public.categorias_tesoreria;

drop policy if exists soportes_tesoreria_miembros_select on storage.objects;
drop policy if exists soportes_tesoreria_miembros_insert on storage.objects;
drop policy if exists soportes_tesoreria_miembros_delete on storage.objects;

delete from storage.buckets
 where id = 'soportes-tesoreria'
   and not exists (
     select 1 from storage.objects where bucket_id = 'soportes-tesoreria'
   );
