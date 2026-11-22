-- «Anular devolución» con saldo a favor ya usado (respuesta del Contador,
-- 2026-11-22). Antes se bloqueaba (saldo_a_favor_aplicado); ahora:
--   - Se anula. Lo que el cliente ya gastó del saldo queda como cuenta por
--     cobrar en su cartera (tercero el cliente), con la antigüedad desde la
--     anulación. La factura original sigue vigente y la compra donde gastó el
--     saldo no se toca.
--   - Asiento espejo exacto de la devolución, con fecha de hoy o la original si
--     su periodo sigue abierto (nunca en un periodo cerrado; si los dos están
--     cerrados no se anula): D saldo a favor solo por lo no usado, D cartera por
--     lo usado, C devolución en ventas e IVA por los mismos valores. Enlazado a
--     la devolución (source returns) y a la compra (memo y descripción), y en
--     journal_reversals contra los dos asientos que reemplaza.
--   - La pantalla avisa «El cliente ya usó $X…» y quien anula lo confirma
--     (p_confirmar_saldo_usado); queda en finance_audit_log.
--   - La anulación exige que la mercancía vuelva al cliente
--     (p_mercancia_vuelve). Si se queda en la bodega no se anula: venta nueva
--     con factura nueva.
--   - Un saldo a favor que ya no está vigente (anulado o vencido) sigue
--     bloqueando: saldo_a_favor_no_vigente.
-- Si la empresa decide no cobrarle, es una decisión comercial aparte
-- (descuento o castigo con soporte), fuera de esta anulación.

-- ── 1 ── La cuenta por cobrar sabe de qué devolución viene ─────────────────
alter table public.accounts_receivable add column if not exists return_id integer
  references public.returns(id) on delete set null;
comment on column public.accounts_receivable.return_id is
  'Devolución anulada que dejó esta cuenta por cobrar: lo que el cliente ya había usado de su saldo a favor (fn_devolucion_anular). NULL en la cartera de facturas.';
create unique index if not exists ux_accounts_receivable_return_id
  on public.accounts_receivable (return_id) where return_id is not null;

-- ── 2 ── Diagnóstico: el saldo usado ya no bloquea ─────────────────────────
create or replace function public.fn_devolucion_anulacion_estado(p_organization_id integer, p_return_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.returns%rowtype;
  v_nc public.invoice_sales%rowtype;
  v_estado_dian text;
  v_fecha_acept timestamptz;
  v_tz text;
  v_original timestamptz;
  v_fecha_orig date;
  v_hoy date;
  v_per_orig boolean;
  v_per_hoy boolean;
  v_caja integer;
  v_credito public.credit_notes%rowtype;
  v_credito_no_vigente boolean := false;
  v_usado numeric := 0;
  v_disponible numeric := 0;
  v_usos jsonb := '[]'::jsonb;
  v_cliente jsonb;
  v_bloqueo text;
  v_asientos jsonb;
  v_caso text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_r from public.returns
   where id = p_return_id and organization_id = p_organization_id;
  if not found then
    raise exception 'devolucion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Nota crédito y su estado ante la DIAN.
  if v_r.credit_note_invoice_id is not null then
    select * into v_nc from public.invoice_sales
     where id = v_r.credit_note_invoice_id and organization_id = p_organization_id;
  end if;
  if v_nc.id is not null then
    select max(coalesce(j.processed_at, j.updated_at)) into v_fecha_acept
      from public.electronic_invoicing_jobs j
     where j.invoice_id = v_nc.id and j.organization_id = p_organization_id and j.status = 'accepted';
    v_estado_dian := case
      when v_nc.status in ('void', 'voided', 'cancelled') then 'anulada'
      when v_nc.einvoice_status = 'accepted' or v_fecha_acept is not null then 'aceptada'
      when exists (select 1 from public.electronic_invoicing_jobs j
                    where j.invoice_id = v_nc.id and j.organization_id = p_organization_id
                      and j.status in ('processing', 'sent')) then 'en_envio'
      when v_nc.einvoice_status = 'rejected' or exists (
             select 1 from public.electronic_invoicing_jobs j
              where j.invoice_id = v_nc.id and j.organization_id = p_organization_id and j.status = 'rejected') then 'rechazada'
      else 'sin_transmitir'
    end;
  end if;

  -- Periodos: el de la devolución y el de hoy (día local y día que valida el
  -- disparador del asiento; los dos tienen que estar abiertos).
  v_tz := public.fn_timezone_for(p_organization_id, v_r.branch_id);
  v_original := coalesce(v_r.return_date, v_r.created_at);
  v_fecha_orig := (v_original at time zone v_tz)::date;
  v_hoy := public.fn_today_for(p_organization_id, v_r.branch_id);
  v_per_orig := public.fn_is_period_open(p_organization_id, v_fecha_orig)
                and public.fn_is_period_open(p_organization_id, v_original::date);
  v_per_hoy := public.fn_is_period_open(p_organization_id, v_hoy)
               and public.fn_is_period_open(p_organization_id, now()::date);

  if v_r.refund_method = 'cash' then
    v_caja := public.fn_caja_abierta_para(p_organization_id, v_r.branch_id, v_uid);
  end if;

  if v_r.customer_credit_id is not null then
    select * into v_credito from public.credit_notes
     where id = v_r.customer_credit_id and organization_id = p_organization_id;
    -- Contador 2026-11-22: lo que el cliente ya usó no bloquea la anulación;
    -- pasa a cuenta por cobrar. Solo bloquea un saldo que ya no está vigente
    -- (anulado o vencido a mano): ese valor ya salió del saldo a favor por otra vía.
    if v_credito.id is null or v_credito.status not in ('active', 'used') then
      v_credito_no_vigente := true;
    else
      v_disponible := greatest(round(coalesce(v_credito.balance, 0), 2), 0);
      v_usado := greatest(round(coalesce(v_credito.amount, 0), 2) - v_disponible, 0);
      select coalesce(jsonb_agg(jsonb_build_object(
               'aplicacion_id', a.id, 'factura_id', i.id, 'numero', i.number,
               'sale_id', i.sale_id, 'monto', a.amount, 'fecha', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
        into v_usos
        from public.credit_note_applications a
        left join public.invoice_sales i on i.id = a.invoice_id and i.organization_id = a.organization_id
       where a.credit_note_id = v_credito.id and a.organization_id = p_organization_id;
    end if;
    select jsonb_build_object('id', c.id, 'nombre', nullif(btrim(c.full_name), ''))
      into v_cliente
      from public.customers c
     where c.id = v_credito.customer_id and c.organization_id = p_organization_id;
  end if;

  -- Asientos de la devolución aún sin contra-asiento: el reintegro (origen
  -- returns), el devengo de la nota crédito y el saldo a favor.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', je.id, 'fecha', je.entry_date,
           'numero', case when je.comprobante_numero is not null
                          then coalesce(je.comprobante_prefijo, '') || je.comprobante_numero
                          else '#' || je.id end,
           'memo', je.memo) order by je.id), '[]'::jsonb)
    into v_asientos
    from public.journal_entries je
   where je.organization_id = p_organization_id
     and coalesce(je.posted, false)
     and ((je.source = 'returns' and je.source_id = v_r.id::text)
          or (v_r.credit_note_invoice_id is not null and je.fact_key = 'accrual:credit_note:' || v_r.credit_note_invoice_id::text)
          or (v_r.customer_credit_id is not null and je.fact_key = 'customer_credit:' || v_r.customer_credit_id::text))
     and not exists (select 1 from public.journal_entries x
                      where x.organization_id = je.organization_id and x.fact_key = 'reversal:' || je.id);

  v_bloqueo := case
    when v_r.status = 'cancelled' then 'ya_anulada'
    when v_r.status is distinct from 'processed' then 'estado_invalido'
    when v_estado_dian = 'aceptada' then 'nota_aceptada_dian'
    when v_estado_dian = 'en_envio' then 'nota_en_envio_dian'
    when v_estado_dian = 'anulada' then 'nota_ya_anulada'
    when coalesce(v_r.idempotency_key, '') like 'garantia:%' then 'devolucion_de_garantia'
    when exists (select 1 from public.membership_events e
                  where e.organization_id = p_organization_id
                    and e.metadata->>'documento' = 'devolucion:' || v_r.id::text) then 'devolucion_con_membresia'
    when v_credito_no_vigente then 'saldo_a_favor_no_vigente'
    when exists (select 1 from public.return_lines rl
                   join public.serial_numbers sn on sn.id = any(rl.serial_ids)
                  where rl.return_id = v_r.id and rl.organization_id = p_organization_id
                    and (sn.status not in ('in_stock', 'returned', 'damaged')
                         or (sn.status <> 'damaged' and sn.sale_id is not null))) then 'serial_no_disponible'
    when not v_per_orig and not v_per_hoy then 'periodo_cerrado'
    when v_r.refund_method = 'cash' and v_caja is null then 'efectivo_sin_caja'
    else null
  end;

  v_caso := case
    when v_bloqueo = 'ya_anulada' then 'ya_anulada'
    when v_bloqueo = 'nota_aceptada_dian' then 'nota_aceptada'
    when v_bloqueo is not null then 'bloqueada'
    else 'anulable'
  end;

  return jsonb_build_object(
    'return_id', v_r.id,
    'estado', v_r.status,
    'metodo', v_r.refund_method,
    'total', v_r.total_refund,
    'tiene_permiso', public.fn_tiene_permiso(p_organization_id, 'pos.void'),
    'nota', case when v_nc.id is null then null else jsonb_build_object(
              'id', v_nc.id, 'numero', v_nc.number, 'estado_dian', v_estado_dian,
              'fecha_aceptacion', v_fecha_acept) end,
    'fecha_original', v_fecha_orig,
    'hoy', v_hoy,
    'periodo_original_abierto', v_per_orig,
    'periodo_hoy_abierto', v_per_hoy,
    'caja_abierta', v_caja,
    'saldo_a_favor', case when v_r.customer_credit_id is null then null else jsonb_build_object(
              'id', v_r.customer_credit_id, 'monto', round(coalesce(v_credito.amount, 0), 2),
              'disponible', v_disponible, 'usado', v_usado, 'usos', v_usos,
              'otros_usos', greatest(v_usado - coalesce((select sum((u->>'monto')::numeric) from jsonb_array_elements(v_usos) u), 0), 0),
              'cliente', v_cliente) end,
    'asientos', v_asientos,
    'bloqueo', v_bloqueo,
    'caso', v_caso);
end;
$$;


comment on function public.fn_devolucion_anulacion_estado(integer, integer) is
  'Anular devolución: estado de la nota crédito ante la DIAN, periodos (original y hoy), caja abierta, saldo a favor (monto, disponible, usado y dónde se usó), asientos a reversar y bloqueo. caso = anulable | nota_aceptada | bloqueada | ya_anulada.';

-- ── 3 ── La anulación (firma nueva: confirmaciones de saldo y mercancía) ────
drop function if exists public.fn_devolucion_anular(integer, integer, text, text);

create or replace function public.fn_devolucion_anular(
  p_organization_id integer,
  p_return_id integer,
  p_motivo text,
  p_fecha_espejo text default 'hoy',
  p_confirmar_saldo_usado boolean default false,
  p_mercancia_vuelve boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text := left(regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), 500);
  v_r public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_diag jsonb;
  v_numero text;
  v_fecha timestamptz;
  v_asiento record;
  v_rev integer;
  v_revs jsonb := '[]'::jsonb;
  v_pendientes integer := 0;
  v_job record;
  v_jobs integer := 0;
  v_mov record;
  v_qty numeric;
  v_unidades numeric := 0;
  v_serial record;
  v_seriales integer := 0;
  v_factura uuid;
  v_caja integer;
  v_caja_branch integer;
  v_mov_caja integer;
  v_usado numeric := 0;
  v_disponible numeric := 0;
  v_credito public.credit_notes%rowtype;
  v_a1 integer;
  v_c1 integer;
  v_cta_cxc text;
  v_cta_saldo text;
  v_nit text;
  v_nombre text;
  v_base text;
  v_espejo integer;
  v_cxc uuid;
  v_compras text;
  v_desc text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if p_fecha_espejo is null or p_fecha_espejo not in ('hoy', 'original') then
    raise exception 'fecha_espejo_invalida' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_r from public.returns
   where id = p_return_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'devolucion_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not public.fn_tiene_permiso(p_organization_id, 'pos.void') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Idempotente: anularla otra vez no repite nada.
  if v_r.status = 'cancelled' then
    return jsonb_build_object('return_id', v_r.id, 'ya_anulada', true);
  end if;

  select * into v_sale from public.sales
   where id = v_r.sale_id and organization_id = p_organization_id
   for update;

  v_diag := public.fn_devolucion_anulacion_estado(p_organization_id, p_return_id);
  if v_diag->>'bloqueo' is not null then
    raise exception '%', v_diag->>'bloqueo' using errcode = '22023';
  end if;

  -- Contador 2026-11-22: anular la devolución es que el cliente se lleva otra
  -- vez la mercancía. Si se queda en la bodega no se anula: va una venta nueva
  -- con factura nueva (la pantalla la ofrece).
  if not coalesce(p_mercancia_vuelve, false) then
    raise exception 'mercancia_en_bodega' using errcode = '22023';
  end if;
  v_usado := coalesce((v_diag->'saldo_a_favor'->>'usado')::numeric, 0);
  v_disponible := coalesce((v_diag->'saldo_a_favor'->>'disponible')::numeric, 0);
  if v_usado > 0 and not coalesce(p_confirmar_saldo_usado, false) then
    raise exception 'confirmar_saldo_usado' using errcode = '22023';
  end if;

  if p_fecha_espejo = 'original' then
    if not (v_diag->>'periodo_original_abierto')::boolean then
      raise exception 'periodo_original_cerrado' using errcode = '22023';
    end if;
    v_fecha := coalesce(v_r.return_date, v_r.created_at);
  else
    if not (v_diag->>'periodo_hoy_abierto')::boolean then
      raise exception 'periodo_hoy_cerrado' using errcode = '22023';
    end if;
    v_fecha := now();
  end if;
  v_numero := 'DEV-' || lpad(v_r.id::text, 6, '0');

  -- a. Asientos espejo (la única reversa del sistema).
  --    Con saldo a favor ya usado (Contador 2026-11-22) el devengo de la nota
  --    crédito y el saldo a favor se reversan en UN asiento espejo:
  --      D saldo a favor solo por lo que el cliente no usó;
  --      D cartera (la misma que acreditó la nota) por lo usado, tercero el cliente;
  --      C devolución en ventas e IVA: las mismas cuentas y valores.
  if v_usado > 0 then
    select * into v_credito from public.credit_notes
     where id = v_r.customer_credit_id and organization_id = p_organization_id;
    select je.id into v_c1 from public.journal_entries je
     where je.organization_id = p_organization_id and coalesce(je.posted, false)
       and je.fact_key = 'customer_credit:' || v_r.customer_credit_id::text
       and not exists (select 1 from public.journal_entries x
                        where x.organization_id = je.organization_id and x.fact_key = 'reversal:' || je.id);
    if v_c1 is null then
      raise exception 'asiento_saldo_no_encontrado' using errcode = 'P0002',
        hint = 'El saldo a favor no tiene su asiento publicado: revise Pendientes contables.';
    end if;
    if v_r.credit_note_invoice_id is not null then
      select je.id into v_a1 from public.journal_entries je
       where je.organization_id = p_organization_id and coalesce(je.posted, false)
         and je.fact_key = 'accrual:credit_note:' || v_r.credit_note_invoice_id::text
         and not exists (select 1 from public.journal_entries x
                          where x.organization_id = je.organization_id and x.fact_key = 'reversal:' || je.id);
    end if;

    -- Cuenta del saldo a favor: la que acreditó el asiento del saldo.
    select jl.account_code into v_cta_saldo from public.journal_lines jl
     where jl.journal_entry_id = v_c1 and coalesce(jl.credit, 0) > 0
     order by jl.credit desc, jl.id limit 1;
    -- Cartera: la que acreditó la nota crédito; sin nota, la del devengo de ventas.
    if v_a1 is not null then
      select jl.account_code into v_cta_cxc from public.journal_lines jl
       where jl.journal_entry_id = v_a1 and coalesce(jl.credit, 0) > 0
       order by jl.credit desc, jl.id limit 1;
    end if;
    v_cta_cxc := coalesce(v_cta_cxc, (select r.debit_account_code from public.fn_regla_devengo_venta(p_organization_id) r));
    if v_cta_saldo is null or v_cta_cxc is null then
      raise exception 'sin_cuenta_por_cobrar' using errcode = 'P0002';
    end if;

    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')), nullif(btrim(c.full_name), '')
      into v_nit, v_nombre
      from public.customers c
     where c.id = v_credito.customer_id and c.organization_id = p_organization_id;
    if v_nit is null then
      select t.nit, coalesce(v_nombre, t.nombre) into v_nit, v_nombre
        from public.fn_consumidor_final_contable(p_organization_id) t;
    end if;

    v_base := upper(public.fn_moneda_base_organizacion(p_organization_id));
    if exists (select 1 from public.journal_entries je
                where je.id in (v_a1, v_c1) and upper(coalesce(je.currency_code, v_base)) <> v_base) then
      raise exception 'moneda_distinta' using errcode = '22023';
    end if;

    select string_agg(coalesce(u->>'numero', '—'), ', ' order by u->>'fecha')
      into v_compras from jsonb_array_elements(v_diag->'saldo_a_favor'->'usos') u;
    v_desc := 'Saldo a favor usado - anulación de la devolución ' || v_numero
              || coalesce(' - compra ' || v_compras, '');

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by,
      currency_code, exchange_rate, base_currency_code, fact_key
    ) values (
      p_organization_id, coalesce(v_r.branch_id, v_sale.branch_id), v_fecha,
      'Anulación de la devolución ' || v_numero || ' (espejo; lo usado del saldo a favor pasa a cartera)'
        || coalesce(' | compra ' || v_compras, ''),
      'returns', v_r.id::text, true, v_uid, v_base, 1, v_base,
      'return_void:' || v_r.id
    ) returning id into v_espejo;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id,
      currency_code, exchange_rate, debit_base, credit_base, tercero_nit, tercero_nombre
    )
    select v_espejo, n.account_code, n.descripcion,
           greatest(n.neto, 0), greatest(-n.neto, 0), p_organization_id,
           v_base, 1, greatest(n.neto, 0), greatest(-n.neto, 0), n.nit, n.nombre
      from (
        select b.account_code,
               round(sum(b.d) - sum(b.c), 2) as neto,
               case when b.account_code in (v_cta_cxc, v_cta_saldo) then v_nit else max(b.nit) end as nit,
               case when b.account_code in (v_cta_cxc, v_cta_saldo) then v_nombre else max(b.nombre) end as nombre,
               case when b.account_code = v_cta_cxc and v_cta_cxc <> v_cta_saldo then v_desc
                    else 'ESPEJO ' || coalesce(max(b.descripcion), 'anulación de la devolución ' || v_numero) end as descripcion,
               min(b.orden) as orden
          from (
            -- El devengo de la nota y el saldo a favor, invertidos...
            select jl.account_code, coalesce(jl.credit, 0) as d, coalesce(jl.debit, 0) as c,
                   jl.tercero_nit as nit, jl.tercero_nombre as nombre, jl.description as descripcion,
                   case when coalesce(jl.credit, 0) > 0 then 1 else 3 end as orden
              from public.journal_lines jl
             where jl.journal_entry_id in (v_a1, v_c1)
            union all
            -- ...con el débito al saldo a favor solo por lo no usado...
            select v_cta_saldo, -v_usado, 0, null, null, null, 1
            union all
            -- ...y lo usado a la cartera del cliente.
            select v_cta_cxc, v_usado, 0, null, null, null, 2
          ) b
         group by b.account_code
      ) n
     where n.neto <> 0
     order by n.orden, n.account_code;

    insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
    select p_organization_id, 'devolucion:' || v_r.id, 'anulacion_devolucion', x.id, v_espejo, v_motivo, v_uid
      from unnest(array[v_a1, v_c1]) as x(id) where x.id is not null;
    v_revs := v_revs || to_jsonb(v_espejo);

    -- La cuenta por cobrar en la cartera del cliente, con la antigüedad desde
    -- la anulación. Sin factura: la cartera es la única fuente del saldo y se
    -- cobra con fn_registrar_pago (documento 'account_receivable').
    insert into public.accounts_receivable (
      organization_id, customer_id, branch_id, amount, balance, due_date, status, return_id
    ) values (
      p_organization_id, v_credito.customer_id, coalesce(v_r.branch_id, v_sale.branch_id),
      v_usado, v_usado, now(), 'current', v_r.id
    ) returning id into v_cxc;
  end if;

  for v_asiento in
    select (e->>'id')::integer as id from jsonb_array_elements(v_diag->'asientos') e
     where (e->>'id')::integer is distinct from v_a1 and (e->>'id')::integer is distinct from v_c1
  loop
    v_rev := public.fn_revertir_asiento_en_fecha(v_asiento.id, 'anulacion_devolucion', 'devolucion:' || v_r.id, v_fecha, v_uid);
    if v_rev is null then
      v_pendientes := v_pendientes + 1;
    else
      v_revs := v_revs || to_jsonb(v_rev);
    end if;
  end loop;

  -- b. Nota crédito: lo que no salió a la DIAN se cancela y la nota queda
  --    anulada (trg_nota_credito_recalcula_factura recalcula la factura).
  if v_r.credit_note_invoice_id is not null then
    for v_job in
      select j.id from public.electronic_invoicing_jobs j
       where j.invoice_id = v_r.credit_note_invoice_id and j.organization_id = p_organization_id
         and j.status in ('pending', 'failed')
       for update
    loop
      update public.electronic_invoicing_jobs set status = 'cancelled', locked_at = null, locked_by = null where id = v_job.id;
      insert into public.electronic_invoicing_events (job_id, organization_id, event_type, event_message, metadata)
      values (v_job.id, p_organization_id, 'cancelled', 'Job cancelado: se anuló la devolución ' || v_numero,
              jsonb_build_object('actor', v_uid, 'accion', 'cancel', 'origen', 'fn_devolucion_anular', 'devolucion', v_r.id));
      v_jobs := v_jobs + 1;
    end loop;

    update public.invoice_sales
       set status = 'void',
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADA con la devolución ' || v_numero || ': ' || v_motivo
                        else notes || E'\n\nANULADA con la devolución ' || v_numero || ': ' || v_motivo end,
           updated_at = now()
     where id = v_r.credit_note_invoice_id and organization_id = p_organization_id;
  end if;

  -- c. Saldo a favor: lo que quedaba se cancela (lo usado ya pasó a cartera).
  if v_r.customer_credit_id is not null then
    update public.credit_notes
       set status = 'cancelled', balance = 0, updated_at = now(),
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADO: devolución ' || v_numero || ' anulada'
                        else notes || E'\n' || 'ANULADO: devolución ' || v_numero || ' anulada' end
     where id = v_r.customer_credit_id and organization_id = p_organization_id;
  end if;

  -- d. Inventario: sale otra vez lo que la devolución reingresó (productos e
  --    ingredientes de receta), neto de lo ya retirado.
  for v_mov in
    select sm.product_id, sm.branch_id, sum(sm.qty) as qty,
           (array_agg(sm.unit_cost order by sm.id))[1] as unit_cost
      from public.stock_movements sm
     where sm.organization_id = p_organization_id and sm.source = 'return'
       and sm.source_id = v_r.id::text and sm.direction = 'in'
     group by sm.product_id, sm.branch_id
  loop
    v_qty := v_mov.qty - coalesce((
      select sum(o.qty) from public.stock_movements o
       where o.organization_id = p_organization_id and o.source = 'return'
         and o.source_id = v_r.id::text and o.direction = 'out'
         and o.product_id = v_mov.product_id and o.branch_id = v_mov.branch_id), 0);
    continue when v_qty <= 0;
    perform public.fn_inv_int_mover(
      p_organization_id, v_mov.branch_id, v_mov.product_id, null, 'out', v_qty, v_mov.unit_cost,
      'return', v_r.id::text, 'Anulación de la devolución ' || v_numero, v_uid, '{}'::jsonb);
    v_unidades := v_unidades + v_qty;
  end loop;

  -- e. Seriales: vuelven a «vendidos» en la venta original.
  select i.id into v_factura from public.invoice_sales i
   where i.sale_id = v_sale.id and i.organization_id = p_organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice'
   order by i.created_at limit 1;
  for v_serial in
    select sn.* from public.serial_numbers sn
     where sn.organization_id = p_organization_id
       and sn.id in (select unnest(rl.serial_ids) from public.return_lines rl
                      where rl.return_id = v_r.id and rl.organization_id = p_organization_id)
     for update
  loop
    update public.serial_numbers set
      status = 'sold',
      sale_id = v_sale.id::text,
      sold_to_customer_id = coalesce(v_serial.sold_to_customer_id, v_sale.customer_id),
      sold_by_user_id = coalesce(v_serial.sold_by_user_id, v_sale.user_id),
      sale_channel = coalesce(nullif(v_serial.sale_channel, 'in_stock'), 'pos'),
      sale_date = coalesce(v_serial.sale_date, v_sale.sale_date),
      invoice_sale_id = coalesce(v_serial.invoice_sale_id, v_factura),
      current_branch_id = v_sale.branch_id,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status,
      from_branch_id, to_branch_id, source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, p_organization_id, 'return_voided', v_serial.status, 'sold',
      v_serial.current_branch_id, v_sale.branch_id, 'returns', v_r.id::text, v_sale.id,
      v_sale.customer_id, v_uid, v_motivo
    );
    v_seriales := v_seriales + 1;
  end loop;

  -- f. Efectivo: el cliente devuelve el dinero a una caja abierta. Con
  --    return_id el movimiento no genera asiento propio: el espejo del
  --    reintegro ya lleva la caja al débito.
  if v_r.refund_method = 'cash' then
    v_caja := public.fn_caja_abierta_para(p_organization_id, v_r.branch_id, v_uid);
    if v_caja is null then
      raise exception 'efectivo_sin_caja' using errcode = '22023',
        hint = 'Abra la caja para recibir el dinero que el cliente devuelve.';
    end if;
    select cs.branch_id into v_caja_branch from public.cash_sessions cs where cs.id = v_caja;
    insert into public.cash_movements (
      organization_id, cash_session_id, branch_id, type, concept, amount, user_id, notes, return_id
    ) values (
      p_organization_id, v_caja, coalesce(v_caja_branch, v_r.branch_id), 'in',
      'Anulación de la devolución ' || v_numero, v_r.total_refund, v_uid, v_motivo, v_r.id
    )
    returning id into v_mov_caja;
  end if;

  -- g. La devolución y la venta.
  update public.returns
     set status = 'cancelled', voided_at = now(), voided_by = v_uid, void_reason = v_motivo, updated_at = now()
   where id = v_r.id;

  update public.sales s
     set payment_status = 'paid'
   where s.id = v_sale.id
     and s.organization_id = p_organization_id
     and s.payment_status = 'refunded'
     and coalesce((
       select sum(r.total_refund) from public.returns r
        where r.sale_id = s.id and r.organization_id = s.organization_id
          and coalesce(r.status, 'processed') not in ('void', 'cancelled', 'anulado')
     ), 0) < coalesce(s.total, 0) - 0.01;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (p_organization_id, 'returns', v_r.id::text, 'void', v_uid,
          jsonb_build_object('numero', v_numero, 'total', v_r.total_refund, 'metodo', v_r.refund_method,
                             'venta', v_r.sale_id, 'fecha_espejo', p_fecha_espejo, 'fecha_asiento', v_fecha,
                             'contra_asientos', v_revs, 'asientos_pendientes', v_pendientes,
                             'nota_credito', v_r.credit_note_invoice_id,
                             'nota_estado_dian', v_diag->'nota'->>'estado_dian', 'jobs_fe_cancelados', v_jobs,
                             'saldo_a_favor', v_r.customer_credit_id, 'saldo_disponible_cancelado', v_disponible,
                             'saldo_usado_a_cartera', v_usado, 'cuenta_por_cobrar', v_cxc,
                             'saldo_usado_confirmado_por', case when v_usado > 0 then v_uid end,
                             'mercancia_vuelve_al_cliente', true, 'movimiento_caja', v_mov_caja,
                             'sesion_caja', v_caja, 'unidades_retiradas', v_unidades, 'seriales', v_seriales),
          v_motivo);

  return jsonb_build_object(
    'return_id', v_r.id, 'ya_anulada', false, 'numero', v_numero,
    'fecha_espejo', p_fecha_espejo, 'fecha_asiento', v_fecha,
    'contra_asientos', v_revs, 'asientos_pendientes', v_pendientes,
    'nota_credito_anulada', v_r.credit_note_invoice_id, 'jobs_fe_cancelados', v_jobs,
    'saldo_a_favor_cancelado', v_r.customer_credit_id,
    'saldo_usado', v_usado, 'cuenta_por_cobrar', v_cxc,
    'movimiento_caja', v_mov_caja, 'sesion_caja', v_caja,
    'unidades_retiradas', v_unidades, 'seriales', v_seriales);
end;
$$;


comment on function public.fn_devolucion_anular(integer, integer, text, text, boolean, boolean) is
  'Anula una devolución del POS en una transacción: asientos espejo (hoy u original si el periodo está abierto), nota crédito anulada (sin transmitir o rechazada), saldo a favor cancelado y lo ya usado a cuenta por cobrar del cliente (confirmado), inventario y seriales de vuelta, ingreso en caja abierta si fue en efectivo, venta a paid. Exige que la mercancía vuelva al cliente. Permiso pos.void.';

-- La cartera muestra el número de la devolución anulada en vez de un vacío.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_cxc_listado(integer, jsonb, text, integer, integer)'::regprocedure);
  v_ancla text := 'i.number as numero, i.status as estado_factura,';
begin
  if position('ar.return_id' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'fn_cxc_listado cambió: el ancla del número no aparece una sola vez';
  end if;
  execute replace(v_def, v_ancla,
    'coalesce(i.number, case when ar.return_id is not null then ''DEV-'' || lpad(ar.return_id::text, 6, ''0'') end) as numero, i.status as estado_factura,');
end;
$$;

revoke all on function public.fn_devolucion_anular(integer, integer, text, text, boolean, boolean) from public, anon;
grant execute on function public.fn_devolucion_anular(integer, integer, text, text, boolean, boolean) to authenticated, service_role;
