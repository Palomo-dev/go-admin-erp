-- Reversión de 20261121093236_hrm_nomina_propinas_elemento_dian.sql
-- Deja PROPINAS sin elemento DIAN, como estaba en 20261121031559.
update public.hr_payroll_concepts
   set dian_code = null, updated_at = now()
 where organization_id is null and code = 'PROPINAS';
