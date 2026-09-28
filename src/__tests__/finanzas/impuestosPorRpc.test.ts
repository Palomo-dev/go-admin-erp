/// <reference types="jest" />
/**
 * B9 (2026-09-28): impuestos de la organización solo por RPC con permiso de
 * finanzas. Probado en transacción deshecha: crear dos «por defecto» deja uno;
 * fijar/quitar por defecto; tasa 150 → INVALID_RATE; dos por defecto a mano →
 * unique_violation; rol sin permiso → PERMISSION_DENIED / sin_permiso (42501);
 * otra organización → PERMISSION_DENIED.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sinComentarios = (src: string) => src.split('\n').filter((l) => !/^\s*(\*|\/\/|--)/.test(l)).join('\n');

describe('impuestos por RPC', () => {
  const sql = leer('supabase/migrations/20260928200000_impuestos_organizacion_por_rpc.sql');

  it('índice único parcial: un solo por defecto por organización', () => {
    expect(sql).toMatch(/create unique index if not exists uq_organization_taxes_un_por_defecto\s+on public\.organization_taxes \(organization_id\)\s+where is_default;/);
  });

  it('manage_organization_tax desmarca los demás ANTES de escribir el nuevo por defecto', () => {
    const cuerpo = sql.slice(sql.indexOf('create or replace function public.manage_organization_tax('), sql.indexOf('-- Firma antigua'));
    expect(cuerpo.indexOf('set is_default = false')).toBeGreaterThan(0);
    expect(cuerpo.indexOf('set is_default = false')).toBeLessThan(cuerpo.indexOf('insert into public.organization_taxes'));
    expect(cuerpo).toMatch(/fn_impuestos_exigir_gestion\(p_organization_id\)/);
  });

  it('guarda de finanzas en todas las escrituras y la tabla deja de admitir escritura directa', () => {
    for (const fn of ['delete_organization_tax', 'fn_impuesto_cambiar_activo', 'fn_impuesto_fijar_por_defecto']) {
      const ini = sql.indexOf(`create or replace function public.${fn}(`);
      expect(ini).toBeGreaterThan(0);
      expect(sql.slice(ini, sql.indexOf('$function$;', ini))).toMatch(/fn_impuestos_exigir_gestion\(p_organization_id\)/);
    }
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.organization_taxes from authenticated;/);
    expect(sql).toMatch(/revoke all on table public\.organization_taxes from anon;/);
  });

  it('el navegador ya no escribe organization_taxes directo', () => {
    for (const f of ['src/components/finanzas/impuestos/TaxesTable.tsx', 'src/components/finanzas/impuestos/TaxForm.tsx', 'src/lib/services/defaultTaxService.ts']) {
      expect(sinComentarios(leer(f))).not.toMatch(/from\('organization_taxes'\)\s*\.(update|insert|delete|upsert)\(/);
    }
    expect(leer('src/components/finanzas/impuestos/TaxesTable.tsx')).toMatch(/rpc\('fn_impuesto_cambiar_activo'/);
    expect(leer('src/lib/services/defaultTaxService.ts')).toMatch(/rpc\('fn_impuesto_fijar_por_defecto'/);
  });
});
