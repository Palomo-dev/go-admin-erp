/// <reference types="jest" />
/**
 * F1 (cierre) — contrato sobre el FUENTE de la Estructura comercial.
 *
 * `EstructuraComercialManager.tsx` tenía 1.308 líneas; ahora es la entrada
 * fina y cada pieza vive en `estructura-comercial/`. Este guardarraíl fija:
 * ningún archivo supera 300 líneas **medidas tras formatear a 100 columnas**
 * (no vale apilar 327 caracteres por línea), los subcomponentes existen y el
 * contrato con `CRMConfigPanel` no cambia (mismo import, mismo export, sin
 * props). La conducta de la UI no se prueba aquí: es la misma que antes.
 */
import fs from 'fs';
import path from 'path';
// prettier/index.cjs usa import() dinámico (imposible en jest CJS): el standalone con sus plugins carga en CJS.
import * as prettier from 'prettier/standalone';
import * as prettierTs from 'prettier/plugins/typescript';
import * as prettierEstree from 'prettier/plugins/estree';

const ROOT = process.cwd();
const BASE = 'src/components/configuracion/panels/crm';
const DIR = `${BASE}/sections/estructura-comercial`;
const ENTRY = `${BASE}/sections/EstructuraComercialManager.tsx`;

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const listTs = (dir: string) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`);

/** Líneas del archivo tras formatearlo a 100 columnas (prettier, parser de TypeScript). */
async function linesAt100(rel: string): Promise<number> {
  const out = await prettier.format(read(rel), {
    parser: 'typescript',
    plugins: [prettierTs, prettierEstree],
    printWidth: 100,
  });
  return out.replace(/\n$/, '').split('\n').length;
}

const PIEZAS = {
  tipos: ['types.ts'],
  datos: ['db.ts', 'dbRoles.ts', 'dbTeams.ts', 'dbTerritories.ts'],
  hooks: ['useRoles.ts', 'useTeams.ts', 'useTerritories.ts'],
  secciones: ['RolesSection.tsx', 'TeamsSection.tsx', 'TerritoriesSection.tsx'],
  dialogos: ['RoleDialog.tsx', 'TeamDialog.tsx', 'TeamMemberDialog.tsx', 'TerritoryDialog.tsx'],
  compartido: ['shared.tsx', 'TeamCard.tsx'],
};
const TODAS = Object.values(PIEZAS).flat().map((f) => `${DIR}/${f}`);
// Construida con escapes para que este archivo tampoco lleve bytes de control.
const CONTROL_BYTES = new RegExp('[\x00-\x08\x0b\x0c\x0e-\x1f]');

describe('límites duros: ≤ 300 líneas a 100 columnas', () => {
  it.each([ENTRY, ...listTs(DIR)])('%s', async (file) => {
    expect(await linesAt100(file)).toBeLessThanOrEqual(300);
  });

  it('la entrada quedó fina (< 80 líneas): solo pestañas', async () => {
    expect(await linesAt100(ENTRY)).toBeLessThan(80);
  });

  it('ningún archivo de la zona lleva bytes de control', () => {
    for (const file of [ENTRY, ...listTs(DIR)]) {
      expect(read(file)).not.toMatch(CONTROL_BYTES);
    }
  });
});

describe('los subcomponentes existen y la entrada delega en ellos', () => {
  it.each(TODAS)('%s existe', (file) => {
    expect(exists(file)).toBe(true);
  });

  it('la entrada monta las tres secciones desde estructura-comercial/ y no define ninguna', () => {
    const src = read(ENTRY);
    for (const s of ['RolesSection', 'TeamsSection', 'TerritoriesSection']) {
      expect(src).toMatch(new RegExp(`from\\s*['"]\\./estructura-comercial/${s}['"]`));
      expect(src).toMatch(new RegExp(`<${s}\\s*/>`));
      expect(src).not.toMatch(new RegExp(`function\\s+${s}\\b`));
    }
    expect(src).not.toMatch(/from\s*['"]@\/lib\/supabase\/config['"]/);
    expect(src).toMatch(/export function EstructuraComercialManager\(\)/);
  });

  it('cada sección usa su hook y sus diálogos; la capa de datos es una sola (`db`)', () => {
    const roles = read(`${DIR}/RolesSection.tsx`);
    expect(roles).toMatch(/useRoles\(\)/);
    expect(roles).toMatch(/<RoleDialog\b/);
    const teams = read(`${DIR}/TeamsSection.tsx`);
    expect(teams).toMatch(/useTeams\(\)/);
    expect(teams).toMatch(/<TeamDialog\b/);
    expect(teams).toMatch(/<TeamMemberDialog\b/);
    expect(teams).toMatch(/<TeamCard\b/);
    const terr = read(`${DIR}/TerritoriesSection.tsx`);
    expect(terr).toMatch(/useTerritories\(\)/);
    expect(terr).toMatch(/<TerritoryDialog\b/);
    for (const hook of PIEZAS.hooks) {
      expect(read(`${DIR}/${hook}`)).toMatch(/from\s*['"]\.\/db['"]/);
    }
    // Solo la capa `db*` habla con Supabase: ni hooks ni componentes.
    for (const file of [...PIEZAS.hooks, ...PIEZAS.secciones, ...PIEZAS.dialogos, ...PIEZAS.compartido]) {
      expect(read(`${DIR}/${file}`)).not.toMatch(/@\/lib\/supabase\/config/);
    }
  });

  it('CRMConfigPanel sigue importando EstructuraComercialManager por la misma ruta y sin props', () => {
    const panel = read(`${BASE}/CRMConfigPanel.tsx`);
    expect(panel).toMatch(/import \{ EstructuraComercialManager \} from '\.\/sections\/EstructuraComercialManager'/);
    expect(panel).toMatch(/<EstructuraComercialManager \/>/);
  });

  it('cada lectura de lista de la capa de datos filtra por organización (RLS + defensa en profundidad)', () => {
    const LECTORES: Record<string, string[]> = {
      'dbRoles.ts': ['getRoles', 'getJobPositions'],
      'dbTeams.ts': ['getTeams', 'getOrgMembers'],
      'dbTerritories.ts': ['getTerritories'],
    };
    for (const [file, metodos] of Object.entries(LECTORES)) {
      const src = read(`${DIR}/${file}`);
      for (const m of metodos) {
        const inicio = src.indexOf(`async ${m}(`);
        expect(inicio).toBeGreaterThanOrEqual(0);
        const fin = src.indexOf(`${'\n'}  async `, inicio + 1);
        const cuerpo = src.slice(inicio, fin === -1 ? undefined : fin);
        expect(cuerpo).toMatch(/requireOrgId\(\)/);
        expect(cuerpo).toMatch(/\.eq\('organization_id', orgId\)/);
      }
    }
  });
});
