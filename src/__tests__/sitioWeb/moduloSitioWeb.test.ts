/**
 * Módulo base «Sitio web» (code 'website', Figma 01a/01b/01e/01f, 2026-10-05).
 *
 * 1. Menú: el módulo tiene entrada propia con las subpáginas del Figma, cada
 *    una con su page.tsx, y Organización ya no lleva «Sitio web» ni «Dominios».
 * 2. Redirecciones 308 desde las rutas viejas (next.config.js) y el editor
 *    servido bajo /app/sitio-web con un rewrite, sin bucles.
 * 3. Núcleo: /api/modules (con el servicio real) rechaza desactivarlo y la
 *    pantalla de Módulos no ofrece interruptor para los núcleo.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CATALOGO_NAV, moduloPorCodigo } from '@/lib/navigation/catalog';
import { rutaEditorSitio } from '@/components/sitio-web/rutasSitioWeb';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

// El resolutor de organización tiene su propia batería (modulosTenant.test.ts):
// aquí se dobla para probar SOLO la regla «un núcleo no se desactiva» con el
// servicio de módulos real.
const objetivo: { organizationId: number; via: string; userId: string; body: unknown; service: unknown } = {
  organizationId: 120,
  via: 'miembro',
  userId: 'u-1',
  body: null,
  service: null,
};
jest.mock('@/lib/security/modulosObjetivo', () => ({
  resolverObjetivoModulos: async () => objetivo,
  respuestaDeErrorOrg: () => new Response(null, { status: 500 }),
}));
jest.mock('@/lib/services/crm/pipelineTemplates', () => ({ createPipelineFromTemplate: jest.fn() }));

const RAIZ = process.cwd();
const existePagina = (href: string) => existsSync(join(RAIZ, 'src/app', href.replace(/^\//, ''), 'page.tsx'));

interface Regla {
  source: string;
  destination: string;
  permanent?: boolean;
}
// next.config.js es CommonJS: se carga tal cual lo carga Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(join(RAIZ, 'next.config.js')) as {
  redirects: () => Promise<Regla[]>;
  rewrites: () => Promise<Regla[]>;
};

describe('Sitio web en el menú lateral', () => {
  const modulo = moduloPorCodigo('website');

  test('es un módulo propio de Ventas, con raíz /app/sitio-web', () => {
    expect(modulo).toMatchObject({ id: 'sitio-web', etiqueta: 'sitioWeb', seccion: 'ventas', rutas: ['/app/sitio-web'] });
  });

  test('trae las subpáginas del Figma 01b, agrupadas como el panel 01a', () => {
    expect(modulo!.paginas.map((p) => p.href)).toEqual([
      '/app/sitio-web',
      '/app/sitio-web/paginas',
      '/app/sitio-web/diseno',
      '/app/sitio-web/plantillas',
      '/app/sitio-web/carta',
      '/app/sitio-web/tienda',
      '/app/sitio-web/ventas',
      '/app/sitio-web/dominios',
      '/app/sitio-web/seo',
      '/app/sitio-web/analitica',
      '/app/sitio-web/configuracion',
    ]);
    expect(Array.from(new Set(modulo!.paginas.map((p) => p.grupo)))).toEqual([
      'Tu sitio',
      'Según tu negocio',
      'Vender y crecer',
      'Ajustes del sitio',
    ]);
  });

  test('toda subpágina del módulo existe (page.tsx), sin fantasmas', () => {
    expect(modulo!.paginas.filter((p) => !existePagina(p.href)).map((p) => p.href)).toEqual([]);
  });

  test('ninguna página del módulo se oculta por catálogo: todas salen en el menú', () => {
    expect(modulo!.paginas.filter((p) => p.enMenu === false || p.requiere)).toEqual([]);
  });

  test('Organización ya no lleva «Sitio web» ni «Dominios», y la analítica salió del inicio', () => {
    const hrefs = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href));
    for (const viejo of ['/app/organizacion/branding', '/app/organizacion/dominios', '/app/inicio/analitica-web']) {
      expect(hrefs).not.toContain(viejo);
    }
    expect(moduloPorCodigo('organizations')!.paginas.some((p) => p.href.includes('branding') || p.href.includes('dominios'))).toBe(false);
  });

  test('las páginas viejas se movieron (no hay dos implementaciones)', () => {
    for (const viejo of [
      'src/app/app/organizacion/branding/page.tsx',
      'src/app/app/organizacion/branding/reviews/page.tsx',
      'src/app/app/organizacion/branding/editor/[pageId]/page.tsx',
      'src/app/app/organizacion/dominios/page.tsx',
      'src/app/app/inicio/analitica-web/page.tsx',
    ]) {
      expect([viejo, existsSync(join(RAIZ, viejo))]).toEqual([viejo, false]);
    }
  });
});

describe('redirecciones permanentes y editor (next.config.js)', () => {
  let redirecciones: Regla[] = [];
  let reescrituras: Regla[] = [];
  beforeAll(async () => {
    redirecciones = await nextConfig.redirects();
    reescrituras = await nextConfig.rewrites();
  });

  test.each([
    ['/app/organizacion/branding', '/app/sitio-web'],
    ['/app/organizacion/branding/reviews', '/app/sitio-web/tienda'],
    ['/app/organizacion/branding/editor/:pageId', '/app/sitio-web/editor/:pageId'],
    ['/app/organizacion/branding/:path*', '/app/sitio-web'],
    ['/organizacion/branding/editor/:pageId', '/app/sitio-web/editor/:pageId'],
    ['/app/organizacion/dominios', '/app/sitio-web/dominios'],
    ['/app/inicio/analitica-web', '/app/sitio-web/analitica'],
  ])('%s → %s (308)', (source, destination) => {
    expect(redirecciones).toContainEqual({ source, destination, permanent: true });
  });

  test('la regla concreta de reseñas va antes que el comodín de branding', () => {
    const i = (s: string) => redirecciones.findIndex((r) => r.source === s);
    expect(i('/app/organizacion/branding/reviews')).toBeLessThan(i('/app/organizacion/branding/:path*'));
    expect(i('/app/organizacion/branding/editor/:pageId')).toBeLessThan(i('/app/organizacion/branding/:path*'));
  });

  test('los destinos del sitio existen como página', () => {
    const destinos = redirecciones
      .filter((r) => r.destination.startsWith('/app/sitio-web') && !r.destination.includes(':'))
      .map((r) => r.destination);
    expect(destinos.length).toBeGreaterThan(0);
    expect(destinos.filter((d) => !existePagina(d))).toEqual([]);
  });

  test('el editor vive en /app/sitio-web/editor/:pageId y se sirve con la página existente, fuera del AppLayout', () => {
    expect(rutaEditorSitio('abc')).toBe('/app/sitio-web/editor/abc');
    expect(reescrituras).toContainEqual({
      source: '/app/sitio-web/editor/:pageId',
      destination: '/organizacion/branding/editor/:pageId',
    });
    expect(existsSync(join(RAIZ, 'src/app/organizacion/branding/editor/[pageId]/page.tsx'))).toBe(true);
    // Si existiera un page.tsx bajo /app, ganaría al rewrite y el editor saldría dentro del AppLayout.
    expect(existsSync(join(RAIZ, 'src/app/app/sitio-web/editor'))).toBe(false);
  });

  test('sin bucles: ninguna redirección sale de la ruta que sirve un rewrite ni de su propio destino', () => {
    const fuentes = new Set(redirecciones.map((r) => r.source));
    for (const r of reescrituras) expect(fuentes.has(r.source)).toBe(false);
    for (const r of redirecciones) expect(r.destination).not.toBe(r.source);
  });
});

describe('núcleo: no se puede desactivar', () => {
  test('POST /api/modules deactivate website → 400 y sin escritura (servicio real)', async () => {
    const escrituras: string[] = [];
    const cliente = {
      from: (tabla: string) => {
        const api = {
          select: () => api,
          eq: () => api,
          single: async () => ({ data: tabla === 'modules' ? { code: 'website', name: 'Sitio web', is_core: true } : null, error: null }),
          update: () => {
            escrituras.push(tabla);
            return api;
          },
        };
        return api;
      },
      rpc: async () => ({ data: null, error: null }),
    };
    objetivo.service = cliente;
    objetivo.body = { moduleCode: 'website', action: 'deactivate' };

    const { POST } = await import('@/app/api/modules/route');
    const res = await POST(new Request('http://localhost/api/modules', { method: 'POST' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, message: 'Los módulos core no pueden ser desactivados' });
    expect(escrituras).toEqual([]);
  });

  test('la pantalla de Módulos no deja conmutar un núcleo', () => {
    const fuente = readFileSync(join(RAIZ, 'src/app/app/organizacion/modulos/page.tsx'), 'utf8');
    expect(fuente).toMatch(/const canToggleModule = useCallback\(\(module: Module\) => \{\s*if \(module\.is_core\) return false;/);
    // La tarjeta de los núcleo dice «siempre activo» y no pinta Switch.
    const tarjetasNucleo = fuente.slice(fuente.indexOf('{coreModules.map('), fuente.indexOf('{paidModules.map('));
    expect(tarjetasNucleo).toContain("t('modules.alwaysActive')");
    expect(tarjetasNucleo).not.toContain('<Switch');
  });
});
