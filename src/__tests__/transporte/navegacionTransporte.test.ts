/**
 * Transporte (Figma «23 Transporte» 2867:17, 2026-11-23). «Cambiar una página limpia la
 * navegación»: submenú en tres grupos sin «Configuración» ni «Inicio del día», pestañas en vez
 * de páginas sueltas (Paradas, Tarifas, Incidentes) con redirección 308, y los ajustes en el
 * diálogo de Configuración (sección `transporte.general`).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { RUTAS_MODULOS, paginaDeRuta } from '@/lib/navigation/rutasModulos';
import { seccionPorId } from '@/components/configuracion/config/configSectionsRegistry';
import { CONFIG_MODULES } from '@/components/configuracion/config/configModulesRegistry';

const RAIZ = process.cwd();
interface Regla {
  source: string;
  destination: string;
  permanent?: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(join(RAIZ, 'next.config.js')) as { redirects: () => Promise<Regla[]> };
const existePagina = (href: string) => existsSync(join(RAIZ, 'src/app', href.replace(/^\//, ''), 'page.tsx'));

describe('submenú de Transporte (2910:23236)', () => {
  const transporte = moduloPorCodigo('transport')!;

  test('tres grupos: Operación, Red y Flota; sin Configuración ni Inicio del día', () => {
    const enMenu = transporte.paginas.filter((p) => p.enMenu !== false);
    expect(enMenu.map((p) => [p.grupo, p.href.replace('/app/transporte/', '')])).toEqual([
      ['Operación', 'viajes'],
      ['Operación', 'boletos'],
      ['Operación', 'manifiestos'],
      ['Red', 'rutas'],
      ['Red', 'horarios'],
      ['Flota', 'flota'],
      ['Flota', 'vehiculos'],
      ['Flota', 'conductores'],
    ]);
    expect(transporte.paginas.some((p) => /configuracion|inicio|resumen|dashboard/.test(p.href))).toBe(false);
  });

  test('cada página del menú existe y el middleware la conoce', () => {
    for (const p of transporte.paginas.filter((x) => x.enMenu !== false)) expect([p.href, existePagina(p.href)]).toEqual([p.href, true]);
    const rutas = RUTAS_MODULOS.find((m) => m.codigo === 'transport')!;
    expect(rutas.paginas).toEqual(transporte.paginas.map((p) => p.href));
    expect(paginaDeRuta('/app/transporte/incidentes/abc', 'transport')).toBe('/app/transporte/incidentes');
  });

  test('las rutas que pasan a pestañas ya no son páginas', () => {
    for (const vieja of ['paradas', 'tarifas-pasajeros']) {
      expect(transporte.paginas.map((p) => p.href)).not.toContain(`/app/transporte/${vieja}`);
      expect(existePagina(`/app/transporte/${vieja}`)).toBe(false);
    }
    // El detalle de una novedad se queda (no redirige).
    expect(existePagina('/app/transporte/incidentes/[id]')).toBe(true);
    expect(existePagina('/app/transporte/incidentes')).toBe(false);
  });
});

describe('redirecciones 308 a pestañas (lámina 1 · sección 4)', () => {
  test.each([
    ['/app/transporte/paradas', '/app/transporte/rutas?pestana=paradas'],
    ['/app/transporte/tarifas-pasajeros', '/app/transporte/boletos?pestana=tarifas'],
    ['/app/transporte/incidentes', '/app/transporte/viajes?pestana=novedades'],
  ])('%s → %s', async (source, destination) => {
    const reglas = await nextConfig.redirects();
    expect(reglas.find((r) => r.source === source)).toEqual({ source, destination, permanent: true });
  });

  test('el detalle /incidentes/[id] no tiene redirección', async () => {
    const reglas = await nextConfig.redirects();
    expect(reglas.some((r) => r.source.startsWith('/app/transporte/incidentes/'))).toBe(false);
  });
});

describe('ajustes en el diálogo, no en una página', () => {
  test('sección transporte.general del módulo transport, con permiso propio', () => {
    expect(seccionPorId('transporte.general')).toMatchObject({ modulo: 'transporte', permiso: 'transporte.manage' });
    expect(CONFIG_MODULES.find((m) => m.id === 'transporte')).toMatchObject({ moduleCode: 'transport', grupo: 'operacion' });
    expect(existePagina('/app/transporte/configuracion')).toBe(false);
  });

  test('Viajes, Flota y Boletos llevan el atajo «Configurar»', () => {
    for (const f of ['src/components/transporte/viajes/ViajesPage.tsx', 'src/components/transporte/flota/FlotaPage.tsx', 'src/app/app/transporte/boletos/page.tsx']) {
      expect([f, /AtajoConfigurar seccion="transporte\.general"/.test(readFileSync(join(RAIZ, f), 'utf8'))]).toEqual([f, true]);
    }
  });

  test('Viajes abre en Despachos de hoy', () => {
    expect(readFileSync(join(RAIZ, 'src/components/transporte/viajes/ViajesPage.tsx'), 'utf8')).toMatch(/usePestana\(PESTANAS, 'despachos'\)/);
  });
});

describe('enlaces internos', () => {
  test('ningún enlace del módulo apunta a las rutas que pasaron a pestañas', () => {
    const archivos = [
      'src/components/transporte/QuickActions.tsx',
      'src/components/transporte/dashboard/DashboardQuickActions.tsx',
      'src/components/transporte/incidentes/id/IncidentHeader.tsx',
      'src/app/app/transporte/incidentes/[id]/page.tsx',
    ];
    for (const f of archivos) {
      expect([f, /['"`]\/app\/transporte\/(paradas|tarifas-pasajeros|incidentes)['"`]/.test(readFileSync(join(RAIZ, f), 'utf8'))]).toEqual([f, false]);
    }
  });
});
