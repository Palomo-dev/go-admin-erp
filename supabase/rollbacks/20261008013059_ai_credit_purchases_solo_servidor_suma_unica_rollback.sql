-- Rollback de 20261008013059_ai_credit_purchases_solo_servidor_suma_unica.
--
-- ATENCIÓN: devolver esto reabre el hueco. anon y authenticated recuperan la
-- escritura sobre ai_credit_purchases y vuelve el trigger anterior, que suma en
-- cada paso a `completed` (también en un `completed → pending → completed`).
-- El código del webhook posterior a esta migración ya no suma a mano, así que
-- con el trigger anterior cada compra pagada se sigue sumando una vez.
--
-- No toca saldos. La columna credits_applied_at se quita con sus marcas: si se
-- vuelve a aplicar la migración, el relleno de las filas completed la repone.

drop trigger if exists trg_aplicar_creditos_compra_ia on public.ai_credit_purchases;
alter table public.ai_credit_purchases enable trigger trg_sync_ai_credits;

drop function if exists public.fn_aplicar_creditos_compra_ia();
grant execute on function public.sync_ai_credits_to_settings() to public, anon, authenticated;
comment on function public.sync_ai_credits_to_settings() is null;

drop index if exists public.ux_ai_credit_purchases_checkout_session;
alter table public.ai_credit_purchases drop column if exists credits_applied_at;

drop policy if exists ai_credit_purchases_sin_escritura_cliente_insert on public.ai_credit_purchases;
drop policy if exists ai_credit_purchases_sin_escritura_cliente_update on public.ai_credit_purchases;
drop policy if exists ai_credit_purchases_sin_escritura_cliente_delete on public.ai_credit_purchases;

grant select on public.ai_credit_purchases to anon;
grant insert, update, delete, truncate, references, trigger on public.ai_credit_purchases to anon, authenticated;
