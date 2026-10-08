/**
 * Registro único de Configuración (`configSectionsRegistry.ts`): ids estables
 * y únicos, cada sección con permiso, palabras clave en los cuatro idiomas y
 * un componente (o un enlace) que pintar.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_MODULES } from '../config/configModulesRegistry';
import { SECCIONES_CONFIG, PERMISO_ADMIN } from '../config/configSectionsRegistry';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

type Ns = { modulos: Record<string, string>; secciones: Record<string, Record<string, string>>; ajustes: Record<string, Record<string, string>> };
const IDIOMAS = { es, en, fr, pt } as unknown as Record<string, { configuracionUnificada: Ns }>;
const RENDERER = readFileSync(join(__dirname, '../layout/ConfiguracionPanelRenderer.tsx'), 'utf8');

/** Códigos que existen en `permissions` (verificados por MCP el 2026-10-07). */
const PERMISOS_CONOCIDOS = new Set([PERMISO_ADMIN, 'crm.stages.manage', 'roles.manage', 'notifications.manage', 'finance.approve']);

describe('registro de secciones', () => {
  test('ids únicos, estables y con la forma <modulo>.<seccion>', () => {
    const ids = SECCIONES_CONFIG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SECCIONES_CONFIG) expect(s.id).toBe(`${s.modulo}.${s.seccion}`);
  });

  test('toda sección pertenece a un módulo de Configuración y todo módulo tiene sección', () => {
    const modulos = new Set(CONFIG_MODULES.map((m) => m.id));
    for (const s of SECCIONES_CONFIG) expect({ id: s.id, modulo: modulos.has(s.modulo) }).toEqual({ id: s.id, modulo: true });
    for (const m of CONFIG_MODULES) expect({ modulo: m.id, secciones: SECCIONES_CONFIG.some((s) => s.modulo === m.id) }).toEqual({ modulo: m.id, secciones: true });
  });

  test('toda sección y todo ajuste piden un permiso conocido', () => {
    for (const s of SECCIONES_CONFIG) {
      expect({ id: s.id, permiso: PERMISOS_CONOCIDOS.has(s.permiso) }).toEqual({ id: s.id, permiso: true });
      for (const a of s.ajustes) if (a.permiso) expect(PERMISOS_CONOCIDOS.has(a.permiso)).toBe(true);
    }
  });

  test('las anclas de una sección no se repiten', () => {
    for (const s of SECCIONES_CONFIG) {
      const anclas = s.ajustes.map((a) => a.ancla);
      expect(new Set(anclas).size).toBe(anclas.length);
    }
  });

  test.each(Object.keys(IDIOMAS))('título, descripción y palabras clave en %s', (idioma) => {
    const ns = IDIOMAS[idioma].configuracionUnificada;
    for (const m of CONFIG_MODULES) expect({ idioma, modulo: m.id, ok: !!ns.modulos[m.id] }).toEqual({ idioma, modulo: m.id, ok: true });
    for (const s of SECCIONES_CONFIG) {
      const t = ns.secciones[s.clave];
      expect({ idioma, id: s.id, titulo: !!t?.titulo, descripcion: !!t?.descripcion, palabras: (t?.palabras ?? '').split(',').filter((p) => p.trim()).length > 0 }).toEqual({
        idioma,
        id: s.id,
        titulo: true,
        descripcion: true,
        palabras: true,
      });
      for (const a of s.ajustes) {
        const aj = ns.ajustes[a.clave];
        expect({ idioma, ajuste: a.clave, titulo: !!aj?.titulo, palabras: !!aj?.palabras }).toEqual({ idioma, ajuste: a.clave, titulo: true, palabras: true });
      }
    }
  });

  test('toda sección tiene componente en el renderizador o es un enlace', () => {
    for (const s of SECCIONES_CONFIG) {
      const conPanel = RENDERER.includes(`'${s.id}':`);
      expect({ id: s.id, pintable: conPanel || !!s.enlace }).toEqual({ id: s.id, pintable: true });
    }
  });

  test('Sitio web se queda en su módulo: aquí solo se enlaza (decisión del dueño, 2026-10-07)', () => {
    const sitio = SECCIONES_CONFIG.filter((s) => s.modulo === 'sitioweb');
    expect(sitio.map((s) => s.enlace)).toEqual(['/app/sitio-web/configuracion']);
    expect(sitio.every((s) => s.ajustes.length === 0)).toBe(true);
  });
});
