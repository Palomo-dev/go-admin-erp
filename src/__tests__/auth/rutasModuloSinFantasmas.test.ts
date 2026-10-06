/**
 * El mapa ruta → módulo del middleware solo puede usar códigos que existen en
 * `modules`. 'branches' y 'branding' no existen: con ellos la ruta exacta
 * /app/organizacion/sucursales respondía «Módulo no activado» siempre.
 *
 * Ampliado el 2026-10-06 (módulo base «Sitio web»): TODO código del mapa debe
 * existir en `modules` y en el catálogo de navegación, y el de /app/sitio-web
 * ('website') debe crearlo una migración versionada como núcleo.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';

const fuente = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
const mapa = fuente.slice(fuente.indexOf('const routeToModuleMap'), fuente.indexOf('};', fuente.indexOf('const routeToModuleMap')));

/** Pares ruta → código del mapa, leídos del propio fuente del middleware. */
const pares = Array.from(mapa.matchAll(/'(\/app\/[^']*)':\s*'([^']+)'/g), (m) => ({ ruta: m[1], codigo: m[2] }));

/**
 * `modules.code` en producción, consultado por MCP el 2026-10-06 (proyecto
 * jgmgphmzusbluqhuqihj), más los que crea una migración versionada pendiente
 * de aplicar (ver `codigosCreadosPorMigracion`). Si agregas un módulo, agrégalo
 * aquí SOLO después de verificarlo en la base o de versionar su migración.
 */
const CODIGOS_EN_MODULES = new Set([
  'pm', 'gym', 'memberships', 'chat', 'organizations', 'clientes', 'roles', 'configuracion', 'pos',
  'inventory', 'pms_hotel', 'parking', 'transport', 'crm', 'hrm', 'finance', 'reports',
  'notifications', 'integrations', 'calendar', 'operations',
]);

/** Códigos que alguna migración de supabase/migrations inserta en `modules` como núcleo. */
function codigosNucleoCreadosPorMigracion(): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations');
  const codigos = new Set<string>();
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, archivo), 'utf8');
    for (const m of sql.matchAll(/insert into public\.modules\s*\(([^)]*)\)\s*values\s*\(\s*'([^']+)'([\s\S]*?)\)\s*on conflict/gi)) {
      const columnas = m[1].split(',').map((c) => c.trim());
      const valores = [`'${m[2]}'`, ...m[3].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((v) => v.trim()).filter(Boolean)];
      const iCore = columnas.indexOf('is_core');
      if (iCore >= 0 && valores[iCore] === 'true') codigos.add(m[2]);
    }
  }
  return codigos;
}

describe('mapa de rutas a módulos del middleware', () => {
  it.each(['branches', 'branding'])('no usa el código fantasma %s', (codigo) => {
    expect(mapa).not.toMatch(new RegExp(`:\\s*'${codigo}'`));
  });

  it('sucursales cae en Organizaciones (módulo base)', () => {
    expect(mapa).toContain("'/app/organizacion': 'organizations'");
    expect(mapa).not.toContain("'/app/organizacion/sucursales'");
  });

  it('se leyó el mapa completo', () => {
    expect(pares.length).toBeGreaterThanOrEqual(18);
  });

  it('todo código del mapa existe en `modules` (o lo crea una migración versionada)', () => {
    const conocidos = new Set([...CODIGOS_EN_MODULES, ...codigosNucleoCreadosPorMigracion()]);
    expect(pares.filter((p) => !conocidos.has(p.codigo))).toEqual([]);
  });

  it('todo código del mapa es un módulo del catálogo de navegación, con esa ruta', () => {
    const fuera = pares.filter((p) => !CATALOGO_NAV.some((m) => m.codigo === p.codigo && m.rutas.includes(p.ruta)));
    expect(fuera).toEqual([]);
  });
});

describe('Sitio web: módulo base con ruta propia', () => {
  it("'/app/sitio-web' → 'website', y Organización ya no lleva el sitio", () => {
    expect(pares).toContainEqual({ ruta: '/app/sitio-web', codigo: 'website' });
    expect(pares.some((p) => p.ruta.startsWith('/app/organizacion/branding') || p.ruta === '/app/organizacion/dominios')).toBe(false);
  });

  it("una migración versionada crea 'website' como núcleo (is_core = true)", () => {
    expect(codigosNucleoCreadosPorMigracion().has('website')).toBe(true);
  });
});
