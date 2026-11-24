-- Revierte 20261115190000_crm_partner_deals_comision_ajustada.
-- Advertencia: borra la comisión sugerida y el rastro de ajuste (quién y cuándo)
-- de los deals ya registrados; commission_amount no se toca.
alter table public.partner_deals
  drop column if exists commission_adjusted_at,
  drop column if exists commission_adjusted_by,
  drop column if exists commission_suggested;
