/// <reference types="jest" />
/**
 * Pendiente 4 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md, B8):
 * `initialize_organization_taxes` filtraba `tax_templates.country = 'CO'`
 * cuando el catálogo y `organizations.country_code` usan alfa-3 ('COL'): no
 * copiaba nada. Probado por MCP en un DO … RAISE que se deshace:
 *   admin de una organización 'COL' sin impuestos → 7 impuestos, 1 por defecto;
 *   segunda llamada → siguen 7; organización con país NULL → 7 (COL);
 *   empleado sin finance.create / finance.approve → 42501 sin_permiso.
 * Aquí se fija la forma del `.sql` aplicado y de su reversión.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sinComentarios = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const MIG = 'supabase/migrations/20260928210000_impuestos_iniciales_pais_de_la_organizacion.sql';
const RB = 'supabase/rollbacks/20260928210000_impuestos_iniciales_pais_de_la_organizacion_rollback.sql';

describe('initialize_organization_taxes: país de la organización', () => {
  const code = sinComentarios(leer(MIG));

  it('no cablea el país: lo lee de organizations.country_code, con COL (alfa-3) de respaldo', () => {
    expect(code).not.toMatch(/country\s*=\s*'CO'/);
    expect(code).toMatch(/coalesce\(nullif\(btrim\(o\.country_code\), ''\), 'COL'\)/);
    expect(code).toMatch(/where tt\.country = v_pais/);
  });

  it('exige la gestión de impuestos, como crear/editar/eliminar', () => {
    expect(code).toMatch(/perform public\.fn_impuestos_exigir_gestion\(org_id\)/);
    expect(code).not.toMatch(/fn_assert_acceso_org/);
    expect(code).toMatch(/revoke all on function public\.initialize_organization_taxes\(integer\) from public, anon/);
  });

  it('es idempotente y respeta el único impuesto por defecto', () => {
    expect(code).toMatch(/not exists \(select 1 from public\.organization_taxes t\s+where t\.organization_id = org_id and t\.template_id = tt\.id\)/);
    expect(code).toMatch(/\(not v_hay_por_defecto and tt\.code = 'IVA_19'\)/);
  });

  it('no crea impuestos a organizaciones existentes (sin INSERT fuera de la función)', () => {
    const fuera = code.replace(/\$function\$[\s\S]*?\$function\$/g, '');
    expect(fuera).not.toMatch(/insert\s+into/i);
  });

  it('el rollback restaura el cuerpo anterior exacto', () => {
    const rb = leer(RB);
    expect(rb).toMatch(/tt\.country = 'CO'/);
    expect(rb).toMatch(/perform public\.fn_assert_acceso_org\(org_id::integer\)/);
  });
});
