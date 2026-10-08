-- ai_credit_purchases: solo el servidor la escribe, y cada compra suma sus
-- créditos UNA sola vez.
--
-- Antes:
--   * anon y authenticated tenían INSERT/UPDATE/DELETE/TRUNCATE sobre la tabla y
--     la política permisiva `ai_credit_purchases_org_isolation` (FOR ALL) dejaba
--     a cualquier miembro activo crear, cambiar de estado o borrar compras de su
--     organización. Lo único que impedía regalarse créditos era, por accidente,
--     que authenticated no tiene INSERT/UPDATE sobre ai_settings y el trigger
--     (SECURITY INVOKER) fallaba con 42501. Las compras falsas en estado
--     `pending`, `failed` o `refunded` sí se podían crear.
--   * doble suma: el webhook de Stripe pasaba la compra a `completed` (el trigger
--     sumaba) y además sumaba a mano en ai_settings. Un reenvío del evento volvía
--     a sumar, y un `completed → pending → completed` sumaba otra vez.
--
-- Ahora:
--   1. Se revoca toda escritura de anon y authenticated (y la lectura de anon).
--      La lectura de los miembros (historial del plan) no cambia. Además, una
--      política RESTRICTIVE por si alguien vuelve a conceder la escritura.
--   2. `credits_applied_at`: marca de "créditos ya sumados". Se rellena con la
--      fecha de compra en las filas `completed` existentes (ya sumadas).
--   3. Un único punto de suma: el trigger BEFORE `trg_aplicar_creditos_compra_ia`
--      suma cuando la fila queda `completed` y aún no tiene la marca, y la pone
--      en la misma fila. La marca no se puede borrar ni preasignar al insertar,
--      así que ni un reenvío ni un vaivén de estado suman dos veces. El trigger
--      anterior `trg_sync_ai_credits` queda deshabilitado (no se elimina).
--      El webhook ya no suma a mano: solo cambia el estado de la compra.
--   4. UNIQUE en `stripe_checkout_session_id`: un Checkout es una compra (NULL
--      se repite libremente: las cargas manuales del panel de plataforma).
--
-- service_role (checkout, webhook, panel de plataforma) no pasa por RLS y
-- conserva sus permisos. El cobro de créditos sigue siendo solo
-- decrement_ai_credits / refund_ai_credits (chargeAiCredits / refundAiCredits).

-- 1. Escritura solo del servidor
revoke insert, update, delete, truncate, references, trigger on public.ai_credit_purchases from anon, authenticated;
revoke select on public.ai_credit_purchases from anon;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_credit_purchases' and policyname = 'ai_credit_purchases_sin_escritura_cliente_insert') then
    create policy ai_credit_purchases_sin_escritura_cliente_insert on public.ai_credit_purchases
      as restrictive for insert to anon, authenticated
      with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_credit_purchases' and policyname = 'ai_credit_purchases_sin_escritura_cliente_update') then
    create policy ai_credit_purchases_sin_escritura_cliente_update on public.ai_credit_purchases
      as restrictive for update to anon, authenticated
      using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_credit_purchases' and policyname = 'ai_credit_purchases_sin_escritura_cliente_delete') then
    create policy ai_credit_purchases_sin_escritura_cliente_delete on public.ai_credit_purchases
      as restrictive for delete to anon, authenticated
      using (false);
  end if;
end
$$;

comment on policy ai_credit_purchases_sin_escritura_cliente_insert on public.ai_credit_purchases is
  'Las compras de créditos IA las crea solo el servidor (service_role): checkout y webhook de Stripe verificados, o el panel de plataforma.';
comment on policy ai_credit_purchases_sin_escritura_cliente_update on public.ai_credit_purchases is
  'El estado de una compra de créditos IA lo cambia solo el servidor (webhook de Stripe con firma verificada).';
comment on policy ai_credit_purchases_sin_escritura_cliente_delete on public.ai_credit_purchases is
  'Las compras de créditos IA no se borran desde el cliente.';

-- 2. Marca de créditos sumados
alter table public.ai_credit_purchases add column if not exists credits_applied_at timestamptz;

comment on column public.ai_credit_purchases.credits_applied_at is
  'Momento en que los créditos de esta compra se sumaron a ai_settings. NULL = aún no sumados. La pone y la protege el trigger trg_aplicar_creditos_compra_ia.';

-- 3. Un único punto de suma
create or replace function public.fn_aplicar_creditos_compra_ia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    -- Nadie decide al insertar que los créditos "ya se sumaron".
    NEW.credits_applied_at := null;
  elsif OLD.credits_applied_at is not null then
    -- Una vez sumados, la marca no se borra ni se mueve.
    NEW.credits_applied_at := OLD.credits_applied_at;
  end if;

  if NEW.status = 'completed' and NEW.credits_applied_at is null then
    insert into public.ai_settings (organization_id, credits_remaining, purchased_credits, updated_at)
    values (NEW.organization_id, NEW.credits_amount, NEW.credits_amount, now())
    on conflict (organization_id)
    do update set
      credits_remaining = coalesce(ai_settings.credits_remaining, 0) + NEW.credits_amount,
      purchased_credits = coalesce(ai_settings.purchased_credits, 0) + NEW.credits_amount,
      updated_at = now();
    NEW.credits_applied_at := now();
  end if;

  return NEW;
end;
$$;

revoke execute on function public.fn_aplicar_creditos_compra_ia() from public, anon, authenticated;
revoke execute on function public.sync_ai_credits_to_settings() from public, anon, authenticated;

comment on function public.fn_aplicar_creditos_compra_ia() is
  'Trigger BEFORE de ai_credit_purchases: suma los créditos de una compra a ai_settings una sola vez (marca credits_applied_at). Único punto de suma de compras de créditos IA.';
comment on function public.sync_ai_credits_to_settings() is
  'Obsoleta desde 2026-10-08: su trigger trg_sync_ai_credits está deshabilitado. La reemplaza fn_aplicar_creditos_compra_ia (idempotente por compra).';

-- Las filas completed existentes ya se sumaron (con el trigger anterior): se
-- marcan antes de conectar el nuevo trigger para que no vuelvan a sumar.
alter table public.ai_credit_purchases disable trigger trg_sync_ai_credits;

update public.ai_credit_purchases
   set credits_applied_at = coalesce(purchased_at, updated_at, created_at, now())
 where status = 'completed'
   and credits_applied_at is null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ai_credit_purchases'::regclass and tgname = 'trg_aplicar_creditos_compra_ia') then
    create trigger trg_aplicar_creditos_compra_ia
      before insert or update on public.ai_credit_purchases
      for each row execute function public.fn_aplicar_creditos_compra_ia();
  end if;
end
$$;

-- 4. Un Checkout de Stripe = una compra
create unique index if not exists ux_ai_credit_purchases_checkout_session
  on public.ai_credit_purchases (stripe_checkout_session_id);
