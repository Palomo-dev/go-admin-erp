/**
 * Las pantallas de ajustes que se mudaron a Configuración: cada ruta vieja
 * redirige (308, en el servidor) a su sección con `movido` para el aviso, y
 * las páginas viejas ya no existen ni se ofrecen como pestaña.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RUTAS_MOVIDAS, destinoRutaMovida, resolverSeccion, rutaSeccion, seccionPorId } from '../config/configSectionsRegistry';

interface Regla {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: { type: string; key: string; value?: string }[];
}
const RAIZ = join(__dirname, '../../../..');
// next.config.js es CommonJS: se carga tal cual lo carga Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(join(RAIZ, 'next.config.js')) as { redirects: () => Promise<Regla[]> };

let reglas: Regla[];
beforeAll(async () => {
  reglas = await nextConfig.redirects();
});

/** La regla que atiende una ruta vieja (con su query si la tenía). */
function reglaPara(desde: string): Regla | undefined {
  const [ruta, query] = desde.split('?');
  const params = new URLSearchParams(query ?? '');
  return reglas.find((r) => r.source === ruta && (r.has ?? []).every((h) => h.type === 'query' && params.get(h.key) === (h.value ?? params.get(h.key))) && (!!r.has === !!query));
}

describe('redirecciones de las rutas viejas', () => {
  test.each(RUTAS_MOVIDAS.map((r) => [r.desde, r]))('%s → su sección de Configuración', (_desde, r) => {
    const regla = reglaPara(r.desde);
    expect(regla).toBeDefined();
    expect(regla!.permanent).toBe(true);
    expect(regla!.destination).toBe(destinoRutaMovida(r));
    const destino = new URL(regla!.destination, 'https://erp.example');
    expect(destino.pathname).toBe('/app/configuracion');
    expect(destino.searchParams.get('movido')).toBe(r.origen);
    const s = seccionPorId(r.seccion)!;
    expect(resolverSeccion(destino.searchParams.get('modulo')!, destino.searchParams.get('seccion'))?.id).toBe(s.id);
    if (r.ancla) expect(destino.searchParams.get('ajuste')).toBe(r.ancla);
  });

  test('Agentes IA sin `?pestana=ajustes` NO redirige', () => {
    expect(reglas.filter((r) => r.source === '/app/crm/agentes-ia').every((r) => r.has?.some((h) => h.key === 'pestana' && h.value === 'ajustes'))).toBe(true);
  });

  test('las páginas viejas ya no existen (las atiende la redirección)', () => {
    expect(existsSync(join(RAIZ, 'src/app/app/chat/ia/configuracion/page.tsx'))).toBe(false);
    expect(existsSync(join(RAIZ, 'src/app/app/finanzas/facturacion-electronica/configuracion/page.tsx'))).toBe(false);
  });

  test('Agentes IA ya no tiene pestaña «Ajustes»: lleva el atajo «Configurar»', () => {
    const src = readFileSync(join(RAIZ, 'src/components/crm/agentes/AgentesIaPage.tsx'), 'utf8');
    expect(src).toMatch(/const SECCIONES = \["agentes", "voces", "campanas"\] as const;/);
    expect(src).not.toMatch(/DesinteresVozCard/);
    expect(src).toMatch(/<AtajoConfigurar seccion="crm\.agente-voz"/);
  });

  test.each([
    ['/app/pos/configuracion', 'pos.general'],
    ['/app/hrm/configuracion', 'hrm.general'],
    ['/app/roles/configuracion', 'roles.general'],
    ['/app/finanzas/configuracion/secuencias', 'facturacion.resumen'],
  ])('ruta que nunca existió %s → %s (sin aviso de «movido»)', (desde, seccion) => {
    const regla = reglaPara(desde);
    expect(regla?.destination).toBe(rutaSeccion(seccion));
  });

  test('Sitio web no se toca: sin redirecciones nuevas hacia Configuración', () => {
    expect(reglas.some((r) => r.source.startsWith('/app/sitio-web') && r.destination.startsWith('/app/configuracion'))).toBe(false);
  });
});

describe('deep links', () => {
  test('rutaSeccion arma el enlace estable con ancla y origen', () => {
    expect(rutaSeccion('crm.agente-voz', { ancla: 'desinteres' })).toBe('/app/configuracion?modulo=crm&seccion=agente-voz#desinteres');
    expect(rutaSeccion('chat.ia', { movido: 'chatIaConfiguracion' })).toBe('/app/configuracion?modulo=chat&seccion=ia&movido=chatIaConfiguracion');
    expect(rutaSeccion('no.existe')).toBe('/app/configuracion');
  });

  test('resolverSeccion: sin `seccion`, la primera del módulo; `?tab=` viejo de CRM se respeta', () => {
    expect(resolverSeccion('crm', null)?.id).toBe('crm.general');
    expect(resolverSeccion('crm', null, 'proveedores')?.id).toBe('crm.proveedores');
    expect(resolverSeccion('crm', 'agente-voz', 'proveedores')?.id).toBe('crm.agente-voz');
    expect(resolverSeccion('crm', 'no-existe')?.id).toBe('crm.general');
    expect(resolverSeccion('no-existe', null)).toBeUndefined();
  });
});
