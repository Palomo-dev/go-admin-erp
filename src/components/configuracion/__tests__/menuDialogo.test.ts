/**
 * Menú del diálogo de Configuración: los cinco grupos del diseño, armados con
 * el campo `grupo` del registro (no con listas sueltas), solo con lo que el
 * servidor deja ver (plan + permisos) y con nombre en los cuatro idiomas.
 */
import { CONFIG_MODULES, ENTRADAS_EXTRA, GRUPOS_CONFIG } from '../config/configModulesRegistry';
import { SECCIONES_CONFIG, seccionPorId } from '../config/configSectionsRegistry';
import { construirMenu, entradaConSeccion, entradaDeSeccion, entradasPlanas } from '../config/menuConfiguracion';
import { resolverPermisosSecciones } from '../config/permisosSecciones';
import { seccionesDesdeRespuesta } from '../hooks/useSeccionesPermitidas';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

type Ns = { grupos: Record<string, string>; entradas: Record<string, string>; pestanas: Record<string, string> };
const IDIOMAS = { es, en, fr, pt } as unknown as Record<string, { configuracionDialogo: Ns }>;

const resumen = (menu: ReturnType<typeof construirMenu>) => menu.map((g) => [g.grupo, g.entradas.map((e) => e.id)]);

describe('agrupación', () => {
  test('con todas las secciones: los cinco grupos del diseño, en su orden', () => {
    const menu = construirMenu(SECCIONES_CONFIG);
    expect(menu.map((g) => g.grupo)).toEqual(['organizacion', 'ventas', 'clientes', 'operacion', 'conexiones']);
    expect(resumen(menu)).toEqual([
      ['organizacion', ['general', 'roles', 'plan', 'asistente']],
      ['ventas', ['pos', 'facturacion', 'sitioweb']],
      ['clientes', ['crm', 'chat', 'telefonia-voz', 'notificaciones']],
      ['operacion', ['calendario', 'hrm', 'pms', 'parking', 'gym']],
      ['conexiones', ['integraciones', 'timeline', 'datos-offline']],
    ]);
  });

  test('todo módulo y toda entrada extra tienen un grupo válido; ninguna sección queda fuera del menú', () => {
    for (const m of CONFIG_MODULES) expect(GRUPOS_CONFIG).toContain(m.grupo);
    for (const e of ENTRADAS_EXTRA) expect(GRUPOS_CONFIG).toContain(e.grupo);
    const enMenu = entradasPlanas(construirMenu(SECCIONES_CONFIG)).flatMap((e) => e.secciones.map((s) => s.id));
    expect([...enMenu].sort()).toEqual(SECCIONES_CONFIG.map((s) => s.id).sort());
  });

  test('una entrada reúne sus secciones como sub-pestañas, en el orden del registro', () => {
    const menu = construirMenu(SECCIONES_CONFIG);
    const chat = entradasPlanas(menu).find((e) => e.id === 'chat')!;
    expect(chat.secciones.map((s) => s.id)).toEqual(['chat.general', 'chat.ia']);
    const voz = entradaConSeccion(menu, 'crm.agente-voz')!;
    expect(voz.id).toBe('telefonia-voz');
    expect(voz.secciones.map((s) => s.id)).toEqual(['crm.agente-voz', 'crm.telefonia']);
    // El id estable de la sección no cambia aunque se muestre en otra entrada.
    expect(entradaDeSeccion(seccionPorId('general.asistente')!)).toBe('asistente');
    expect(entradaDeSeccion(seccionPorId('crm.email')!)).toBe('crm');
  });
});

describe('filtrado por plan y permisos (lo resuelve el servidor)', () => {
  test('sin el módulo en el plan, sus entradas y su grupo desaparecen', async () => {
    const permisos = await resolverPermisosSecciones(['pos'], async () => false);
    const menu = construirMenu(seccionesDesdeRespuesta(permisos, false).map((p) => p.seccion));
    const ids = entradasPlanas(menu).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['general', 'roles', 'asistente', 'pos', 'sitioweb']));
    expect(ids).not.toContain('crm');
    expect(ids).not.toContain('telefonia-voz');
    expect(ids).not.toContain('chat');
    expect(menu.map((g) => g.grupo)).not.toContain('clientes');
    expect(menu.map((g) => g.grupo)).not.toContain('operacion');
  });

  test('«Datos sin conexión» solo dentro de Go Admin Desktop', async () => {
    const permisos = await resolverPermisosSecciones([], async () => true);
    const web = entradasPlanas(construirMenu(seccionesDesdeRespuesta(permisos, false).map((p) => p.seccion))).map((e) => e.id);
    const escritorio = entradasPlanas(construirMenu(seccionesDesdeRespuesta(permisos, true).map((p) => p.seccion))).map((e) => e.id);
    expect(web).not.toContain('datos-offline');
    expect(escritorio).toContain('datos-offline');
  });

  test('una sección que el servidor no devuelve no aparece aunque su entrada exista', () => {
    const solo = SECCIONES_CONFIG.filter((s) => s.id === 'crm.telefonia');
    const menu = construirMenu(solo);
    expect(resumen(menu)).toEqual([['clientes', ['telefonia-voz']]]);
  });
});

describe('textos del menú', () => {
  test.each(Object.keys(IDIOMAS))('grupos y entradas con nombre en %s', (idioma) => {
    const ns = IDIOMAS[idioma].configuracionDialogo;
    for (const g of GRUPOS_CONFIG) expect({ idioma, g, ok: !!ns.grupos[g] }).toEqual({ idioma, g, ok: true });
    for (const id of [...CONFIG_MODULES.map((m) => m.id), ...ENTRADAS_EXTRA.map((e) => e.id)]) {
      expect({ idioma, id, ok: !!ns.entradas[id] }).toEqual({ idioma, id, ok: true });
    }
  });
});
