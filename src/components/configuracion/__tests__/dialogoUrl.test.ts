/**
 * Configuración es un diálogo con su estado en la URL (`?config=`): las rutas
 * viejas (página, sub-páginas, deep links con ancla y las redirecciones de
 * next.config.js) llevan a la sección correcta del diálogo, y abrir/cerrar no
 * toca los demás parámetros de la pantalla de atrás.
 */
import { join } from 'path';
import {
  destinoDesdeRutaVieja,
  esRutaVieja,
  hrefConDialogo,
  hrefSinDialogo,
  leerDestino,
  PARAM_CONFIG,
} from '../config/dialogoUrl';
import { RUTAS_MOVIDAS, rutaSeccion, SECCIONES_CONFIG } from '../config/configSectionsRegistry';

interface Regla {
  source: string;
  destination: string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(join(__dirname, '../../../..', 'next.config.js')) as { redirects: () => Promise<Regla[]> };

function destino(href: string) {
  const url = new URL(href, 'https://erp.example');
  return destinoDesdeRutaVieja(url.pathname, url.search, url.hash);
}

describe('rutas viejas → sección del diálogo', () => {
  test.each([
    ['/app/configuracion', { seccionId: null }],
    ['/app/configuracion/', { seccionId: null }],
    ['/app/configuracion?modulo=chat&seccion=ia', { seccionId: 'chat.ia' }],
    ['/app/configuracion?modulo=crm', { seccionId: 'crm.general' }],
    ['/app/configuracion?modulo=crm&tab=proveedores', { seccionId: 'crm.proveedores' }],
    ['/app/configuracion?modulo=crm&tab=creditos', { seccionId: 'crm.creditos' }],
    ['/app/configuracion?modulo=gym', { seccionId: 'gym.general' }],
    ['/app/configuracion?modulo=pos#pos-basculas', { seccionId: 'pos.general', ancla: 'pos-basculas' }],
    ['/app/configuracion?modulo=crm&seccion=agente-voz#desinteres', { seccionId: 'crm.agente-voz', ancla: 'desinteres' }],
    ['/app/configuracion?modulo=crm&seccion=agente-voz&ajuste=desinteres&movido=crmAgentesAjustes', { seccionId: 'crm.agente-voz', ancla: 'desinteres', movido: 'crmAgentesAjustes' }],
    ['/app/configuracion?modulo=no-existe', { seccionId: null }],
    ['/app/configuracion/asistente', { seccionId: 'general.asistente' }],
    ['/app/configuracion/pos/avisos-cliente', { seccionId: 'pos.avisos-cliente' }],
    ['/app/configuracion?config=chat.ia&config_ajuste=x', { seccionId: 'chat.ia', ancla: 'x' }],
  ])('%s', (href, esperado) => {
    expect(destino(href)).toEqual(esperado);
  });

  test('las demás rutas no son de Configuración (no se interceptan)', () => {
    expect(destino('/app/sitio-web/configuracion')).toBeNull();
    expect(destino('/app/configuracion-contable')).toBeNull();
    expect(destino('/app/finanzas/configuracion-contable')).toBeNull();
    expect(destino('/app/configuracion/otra-cosa')).toBeNull();
    expect(esRutaVieja('/app/configuracion/asistente')).toBe(true);
    expect(esRutaVieja('/app/pos')).toBe(false);
  });

  test('todo deep link estable de una sección abre esa misma sección', () => {
    for (const s of SECCIONES_CONFIG) {
      expect({ id: s.id, destino: destino(rutaSeccion(s.id))?.seccionId }).toEqual({ id: s.id, destino: s.id });
    }
  });

  test('cada redirección de next.config.js hacia Configuración llega a una sección del diálogo', async () => {
    const reglas = (await nextConfig.redirects()).filter((r) => r.destination.startsWith('/app/configuracion'));
    expect(reglas.length).toBeGreaterThan(0);
    for (const r of reglas) {
      const d = destino(r.destination);
      expect({ source: r.source, ok: !!d?.seccionId }).toEqual({ source: r.source, ok: true });
    }
    for (const m of RUTAS_MOVIDAS) {
      const r = reglas.find((x) => x.destination.includes(`movido=${m.origen}`))!;
      expect(destino(r.destination)).toMatchObject({ seccionId: m.seccion, movido: m.origen, ...(m.ancla ? { ancla: m.ancla } : {}) });
    }
  });
});

describe('estado del diálogo en la URL', () => {
  test('abrir conserva la ruta, los parámetros y el ancla de la pantalla de atrás', () => {
    expect(hrefConDialogo('/app/pos/ventas?estado=pagada&page=2', { seccionId: 'chat.ia' })).toBe('/app/pos/ventas?estado=pagada&page=2&config=chat.ia');
    expect(hrefConDialogo('/app/inicio', { seccionId: 'crm.agente-voz', ancla: 'desinteres', movido: 'crmAgentesAjustes' })).toBe(
      '/app/inicio?config=crm.agente-voz&config_ajuste=desinteres&config_movido=crmAgentesAjustes',
    );
    expect(hrefConDialogo('/app/inicio#hoy', { seccionId: null })).toBe('/app/inicio?config=#hoy');
  });

  test('cambiar de sección reemplaza el ajuste anterior', () => {
    expect(hrefConDialogo('/app/inicio?config=crm.agente-voz&config_ajuste=desinteres', { seccionId: 'chat.ia' })).toBe('/app/inicio?config=chat.ia');
  });

  test('cerrar deja la pantalla de atrás como estaba', () => {
    expect(hrefSinDialogo('/app/pos/ventas?estado=pagada&config=chat.ia&config_ajuste=x&config_movido=y')).toBe('/app/pos/ventas?estado=pagada');
    expect(hrefSinDialogo('/app/inicio?config=')).toBe('/app/inicio');
  });

  test('leerDestino: cerrado sin parámetro; sección desconocida = menú', () => {
    expect(leerDestino(new URLSearchParams('estado=x'))).toBeNull();
    expect(leerDestino(new URLSearchParams(`${PARAM_CONFIG}=`))).toEqual({ seccionId: null });
    expect(leerDestino(new URLSearchParams('config=no.existe&config_ajuste=a'))).toEqual({ seccionId: null });
    expect(leerDestino(new URLSearchParams('config=roles.general&config_movido=m'))).toEqual({ seccionId: 'roles.general', movido: 'm' });
  });
});
