-- Devuelve el disparador a BEFORE INSERT y al mapeo anterior: factura,
-- nota manual y caja. Un borrador que se publique después deja de numerarse
-- en el update. sales, stock_movements, bank_transactions y payments vuelven
-- a quedar sin libro propio.
-- No borra comprobante_numero, comprobante_tipo ni comprobante_prefijo.
-- No rebobina comprobante_consecutivos. Los números ya asignados, incluidos
-- los del backfill, se quedan.

create or replace function public.fn_trg_comprobante_al_insertar()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tipo text;
  v_prefijo text;
  v_mov text;
  v_num integer;
  v_pref text;
begin
  if new.comprobante_numero is not null or coalesce(new.posted, false) is not true then
    return new;
  end if;

  if new.source in ('invoice_sales', 'invoice_purchase', 'credit_note', 'support_documents') then
    v_tipo := 'factura';
    v_prefijo := 'FV';
  elsif new.source = 'manual' then
    v_tipo := 'nota_contable';
    v_prefijo := 'NA';
  elsif new.source = 'cash_movements' and new.source_id is not null then
    select cm.type into v_mov
      from public.cash_movements cm
     where cm.id::text = new.source_id
       and cm.organization_id = new.organization_id;
    if v_mov = 'in' then
      v_tipo := 'recibo_caja';
      v_prefijo := 'RC';
    elsif v_mov = 'out' then
      v_tipo := 'comprobante_egreso';
      v_prefijo := 'CE';
    end if;
  end if;

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
  before insert on public.journal_entries
  for each row execute function public.fn_trg_comprobante_al_insertar();

drop function if exists public.fn_tipo_comprobante_de_asiento(integer, text, text);

notify pgrst, 'reload schema';
