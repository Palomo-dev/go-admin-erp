/**
 * Logística separada de Transporte (Figma «21 Logística» 2792:17, 2026-11-23). «Cambiar una
 * página limpia la navegación»: menú, rutas del middleware, redirecciones 308, buscador y
 * enlaces internos se mueven juntos. Sin página «Configuración» en el submenú: los ajustes viven
 * en el diálogo de Configuración (docs/configuracion/UNIFICACION-CONFIGURACION.md).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CATALOGO_NAV, SECCIONES, moduloPorCodigo } from '@/lib/navigation/catalog';
import { moduloDeRuta, paginaDeRuta } from '@/lib/navigation/rutasModulos';
import { GRUPOS_ENTIDAD } from '@/lib/busquedaGlobal/definiciones';

const RAIZ = process.cwd();
interface Regla {
  source: string;
  destination: string;
  permanent?: boolean;
}
// next.config.js es CommonJS: se carga tal cual lo carga Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(join(RAIZ, 'next.config.js')) as { redirects: () => Promise<Regla[]> };

const existePagina = (href: string) => existsSync(join(RAIZ, 'src/app', href.replace(/^\//, ''), 'page.tsx'));

describe('menú: Logística y Transporte en «Operación»', () => {
  const logistica = moduloPorCodigo('logistica')!;
  const transporte = moduloPorCodigo('transport')!;

  test('la sección Operación existe entre Ventas y Gestión', () => {
    const orden = SECCIONES.map((s) => s.codigo);
    expect(orden.indexOf('operacion')).toBe(orden.indexOf('ventas') + 1);
    expect(orden.indexOf('gestion')).toBe(orden.indexOf('operacion') + 1);
  });

  test('Logística es un módulo propio, con su raíz', () => {
    expect(logistica).toMatchObject({ id: 'logistica', etiqueta: 'logistics', seccion: 'operacion', rutas: ['/app/logistica'] });
    expect(transporte.seccion).toBe('operacion');
  });

  test('submenú de Logística (2792:1680) sin «Configuración»', () => {
    const enMenu = logistica.paginas.filter((p) => p.enMenu !== false).map((p) => p.href);
    expect(enMenu).toEqual([
      '/app/logistica/por-despachar',
      '/app/logistica/envios',
      '/app/logistica/domiciliarios',
      '/app/logistica/cuadres',
      '/app/logistica/seguimiento',
      '/app/logistica/mis-envios',
      '/app/logistica/conductores',
      '/app/logistica/vehiculos',
      '/app/logistica/zonas',
      '/app/logistica/reglas',
    ]);
    expect(logistica.paginas.some((p) => /configuracion|transportadoras/.test(p.href))).toBe(false);
  });

  test('Transporte se queda con lo suyo y el catálogo común', () => {
    // Figma «23 Transporte» (2026-11-23): Paradas, Tarifas de pasajeros e Incidentes pasan a
    // pestañas (ver src/__tests__/transporte/navegacionTransporte.test.ts); el catálogo común
    // (conductores y vehículos) queda en el grupo «Flota».
    expect(transporte.paginas.map((p) => p.href.replace('/app/transporte/', '')).sort()).toEqual(
      ['boletos', 'conductores', 'flota', 'horarios', 'incidentes', 'manifiestos', 'rutas', 'vehiculos', 'viajes'].sort(),
    );
    expect(transporte.paginas.filter((p) => p.grupo === 'Flota').map((p) => p.href)).toEqual(['/app/transporte/flota', '/app/transporte/vehiculos', '/app/transporte/conductores']);
    expect(logistica.paginas.filter((p) => p.grupo === 'Catálogo común').map((p) => p.href)).toEqual(['/app/logistica/conductores', '/app/logistica/vehiculos']);
  });

  test('las páginas que construye este frente existen', () => {
    for (const href of ['/app/logistica', '/app/logistica/por-despachar', '/app/logistica/envios', '/app/logistica/envios/[id]', '/app/logistica/seguimiento', '/app/logistica/conductores', '/app/logistica/vehiculos']) {
      expect([href, existePagina(href)]).toEqual([href, true]);
    }
  });

  test('el middleware sabe a qué módulo y página pertenece cada ruta nueva', () => {
    expect(moduloDeRuta('/app/logistica/envios/abc')).toBe('logistica');
    expect(paginaDeRuta('/app/logistica/envios/abc', 'logistica')).toBe('/app/logistica/envios');
    expect(moduloDeRuta('/app/transporte/viajes')).toBe('transport');
  });

  test('ningún otro módulo del catálogo usa rutas de Logística', () => {
    const ajenos = CATALOGO_NAV.filter((m) => m.codigo !== 'logistica').flatMap((m) => m.paginas.filter((p) => p.href.startsWith('/app/logistica')));
    expect(ajenos).toEqual([]);
  });
});

describe('redirecciones 308 desde Transporte', () => {
  test.each([
    ['/app/transporte/envios', '/app/logistica/envios'],
    ['/app/transporte/envios/:id', '/app/logistica/envios/:id'],
    ['/app/transporte/tracking', '/app/logistica/seguimiento'],
    ['/app/transporte/tarifas-envio', '/app/logistica/zonas'],
    ['/app/transporte/transportadoras', '/app/integraciones/conexiones/logistica'],
    ['/app/transporte/etiquetas', '/app/logistica/etiquetas'],
    ['/app/transporte/mis-envios', '/app/logistica/mis-envios'],
    ['/app/transporte/direcciones-clientes', '/app/logistica/direcciones-clientes'],
  ])('%s → %s', async (source, destination) => {
    const reglas = await nextConfig.redirects();
    expect(reglas.find((r) => r.source === source)).toEqual({ source, destination, permanent: true });
  });

  test('las rutas viejas ya no son páginas del catálogo', () => {
    const hrefs = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href));
    for (const vieja of ['envios', 'tracking', 'tarifas-envio', 'transportadoras', 'etiquetas', 'mis-envios', 'direcciones-clientes']) {
      expect(hrefs).not.toContain(`/app/transporte/${vieja}`);
    }
  });
});

describe('enlaces internos y buscador', () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === 'node_modules' || n === '__tests__') return [];
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  test('ningún enlace del código apunta a una ruta vieja de envíos de Transporte', () => {
    const viejo = /['"`]\/app\/transporte\/(envios|tracking|tarifas-envio|transportadoras|etiquetas|direcciones-clientes)\b/;
    const malos = archivos(join(RAIZ, 'src'))
      .filter((f) => !/src[\\/]app[\\/]app[\\/]transporte[\\/](mis-envios|tarifas-envio)/.test(f))
      .filter((f) => viejo.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(RAIZ, ''));
    expect(malos).toEqual([]);
  });

  test('el buscador global busca envíos y lleva a Logística', () => {
    expect(GRUPOS_ENTIDAD.find((g) => g.tipo === 'shipment')?.paginas[0]).toBe('/app/logistica/envios');
  });

  test('la migración del módulo existe con su reversión', () => {
    const mig = readdirSync(join(RAIZ, 'supabase/migrations')).find((f) => f.endsWith('_logistica_modulo_navegacion.sql'));
    expect(mig).toBeDefined();
    expect(existsSync(join(RAIZ, 'supabase/rollbacks', mig!.replace('.sql', '_rollback.sql')))).toBe(true);
    expect(readFileSync(join(RAIZ, 'supabase/migrations', mig!), 'utf8')).toMatch(/insert into public\.modules[\s\S]*'logistica'/);
  });
});
