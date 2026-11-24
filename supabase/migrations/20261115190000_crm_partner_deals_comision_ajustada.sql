-- CRM · Partners · «Registrar deal» (Figma 1318:91569): la comisión sugerida
-- (monto de la oportunidad × tasa efectiva) es editable por admin/manager y se
-- guarda quién la cambió y cuándo. Aditiva: columnas NULL-ables, sin datos que migrar.
alter table public.partner_deals
  add column if not exists commission_suggested numeric null,
  add column if not exists commission_adjusted_by uuid null,
  add column if not exists commission_adjusted_at timestamptz null;

comment on column public.partner_deals.commission_suggested is
  'Comisión sugerida al registrar el deal: monto de la oportunidad × tasa efectiva del partner (propia o del nivel). Registro, no dinero movido.';
comment on column public.partner_deals.commission_adjusted_by is
  'Usuario (admin/manager) que ajustó la comisión respecto a la sugerida; NULL si se usó la sugerida.';
comment on column public.partner_deals.commission_adjusted_at is
  'Cuándo se ajustó la comisión respecto a la sugerida; NULL si se usó la sugerida.';
