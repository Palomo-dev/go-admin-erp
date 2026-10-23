-- El consecutivo solo se tomaba en BEFORE INSERT y se saltaba si el asiento
-- todavía no estaba publicado. Un borrador que después pasaba a publicado
-- se quedaba sin número. sales, stock_movements, bank_transactions y
-- payments no tenían libro.
--
-- Ahora el mismo disparador numera en BEFORE UPDATE OF posted cuando el
-- asiento pasa a publicado y aún no tiene número. La fuente se traduce a
-- factura, recibo de caja, comprobante de egreso o nota contable. El
-- backfill numera los publicados que siguen en null, por organización y
-- tipo, en orden de fecha e id, después del último número ya usado.
-- No reescribe un consecutivo que ya existía.

create or replace function public.fn_tipo_comprobante_de_asiento(
  p_organization_id integer,
  p_source text,
  p_source_id text,
  out tipo text,
  out prefijo text
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_mov text;
  v_pago text;
  v_monto numeric;
  v_banco text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_source in ('invoice_sales', 'invoice_purchase', 'credit_note', 'support_documents', 'sales', 'sale') then
    tipo := 'factura';
    prefijo := 'FV';
    return;
  end if;

  if p_source = 'cash_movements' and p_source_id is not null then
    select cm.type into v_mov
      from public.cash_movements cm
     where cm.id::text = p_source_id
       and cm.organization_id = p_organization_id;
    if v_mov = 'in' then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    elsif v_mov = 'out' then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    end if;
  end if;

  if p_source = 'payments' and p_source_id is not null then
    select p.source into v_pago
      from public.payments p
     where p.id::text = p_source_id
       and p.organization_id = p_organization_id;
    if v_pago in ('invoice_sales', 'account_receivable', 'sale', 'web_order') then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    elsif v_pago in ('invoice_purchase', 'account_payable') then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    end if;
  end if;

  if p_source = 'bank_transactions' and p_source_id is not null then
    select bt.amount, bt.transaction_type into v_monto, v_banco
      from public.bank_transactions bt
     where bt.id::text = p_source_id
       and bt.organization_id = p_organization_id;
    if v_monto < 0 or (coalesce(v_monto, 0) = 0 and v_banco in ('withdrawal', 'out', 'debit', 'egreso')) then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    elsif v_monto > 0 or v_banco in ('deposit', 'in', 'credit', 'consignacion') then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    end if;
  end if;

  -- manual, stock_movements y el resto de los publicados (reversión, cartera,
  -- comisión, ajuste) comparten la nota contable.
  tipo := 'nota_contable';
  prefijo := 'NA';
end;
$fn$;

revoke all on function public.fn_tipo_comprobante_de_asiento(integer, text, text) from public, anon, authenticated;

comment on function public.fn_tipo_comprobante_de_asiento(integer, text, text) is
  'Libro del asiento: factura, recibo de caja, comprobante de egreso o nota contable, según la fuente.';

create or replace function public.fn_trg_comprobante_al_insertar()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tipo text;
  v_prefijo text;
  v_num integer;
  v_pref text;
begin
  if new.comprobante_numero is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.posted, false) or coalesce(new.posted, false) is not true then
      return new;
    end if;
  elsif coalesce(new.posted, false) is not true then
    return new;
  end if;

  select c.tipo, c.prefijo into v_tipo, v_prefijo
    from public.fn_tipo_comprobante_de_asiento(new.organization_id, new.source, new.source_id) c;

  if v_tipo is null then
    return new;
  end if;

  select c.numero, c.prefijo into v_num, v_pref
    from public.fn_tomar_consecutivo_comprobante(new.organization_id, v_tipo, v_prefijo) c;
  new.comprobante_tipo := v_tipo;
  new.comprobante_prefijo := v_pref;
  new.comprobante_numero := v_num;
  return new;
end;
$fn$;

revoke all on function public.fn_trg_comprobante_al_insertar() from public, anon, authenticated;

drop trigger if exists trg_comprobante_al_insertar on public.journal_entries;
create trigger trg_comprobante_al_insertar
  before insert or update of posted on public.journal_entries
  for each row execute function public.fn_trg_comprobante_al_insertar();

do $bf$
declare
  v_prev text;
  v_sin integer;
  v_dup integer;
begin
  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  lock table public.comprobante_consecutivos in exclusive mode;

  with base as (
    select e.id,
           e.organization_id,
           e.entry_date,
           t.tipo,
           t.prefijo
      from public.journal_entries e
      cross join lateral public.fn_tipo_comprobante_de_asiento(e.organization_id, e.source, e.source_id) t
     where coalesce(e.posted, false)
       and e.comprobante_numero is null
       and t.tipo is not null
  ),
  techo as (
    select organization_id, comprobante_tipo as tipo, max(comprobante_numero) as max_num
      from public.journal_entries
     where comprobante_numero is not null
     group by organization_id, comprobante_tipo
  ),
  orden as (
    select b.id,
           b.tipo,
           coalesce(nullif(c.prefijo, ''), b.prefijo) as prefijo,
           coalesce(t.max_num, 0) + row_number() over (
             partition by b.organization_id, b.tipo
             order by b.entry_date nulls last, b.id
           ) as numero
      from base b
      left join techo t
        on t.organization_id = b.organization_id
       and t.tipo = b.tipo
      left join public.comprobante_consecutivos c
        on c.organization_id = b.organization_id
       and c.tipo = b.tipo
  )
  update public.journal_entries e
     set comprobante_tipo = o.tipo,
         comprobante_prefijo = o.prefijo,
         comprobante_numero = o.numero
    from orden o
   where e.id = o.id
     and e.comprobante_numero is null;

  insert into public.comprobante_consecutivos as c (organization_id, tipo, prefijo, siguiente)
  select e.organization_id,
         e.comprobante_tipo,
         coalesce(min(e.comprobante_prefijo), ''),
         max(e.comprobante_numero) + 1
    from public.journal_entries e
   where e.comprobante_numero is not null
     and e.comprobante_tipo is not null
   group by e.organization_id, e.comprobante_tipo
  on conflict (organization_id, tipo) do update
     set siguiente = greatest(c.siguiente, excluded.siguiente);

  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);

  select count(*) into v_sin
    from public.journal_entries
   where coalesce(posted, false)
     and comprobante_numero is null;
  if v_sin <> 0 then
    raise exception 'quedaron % asientos publicados sin consecutivo', v_sin;
  end if;

  select count(*) into v_dup
    from (
      select 1
        from public.journal_entries
       where comprobante_numero is not null
       group by organization_id, comprobante_tipo, comprobante_numero
      having count(*) > 1
    ) d;
  if v_dup <> 0 then
    raise exception 'hay % grupos de consecutivo repetido', v_dup;
  end if;
end;
$bf$;

notify pgrst, 'reload schema';
