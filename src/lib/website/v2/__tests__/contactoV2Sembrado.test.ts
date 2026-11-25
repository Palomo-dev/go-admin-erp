/**
 * Guardarraíl: TODO lo que siembra una página Contacto usa «Contacto v2»
 * (`seccionesContactoPorDefecto()` de src/lib/website/contrato/paginaContacto.ts, Figma 3104:84056).
 *
 * Por qué existe (2026-11-25): la org 338 ya estaba migrada a Contacto v2, pero «Plantilla
 * completa» le rehízo todas las páginas desde `PAGINAS_BASE_GIRO`, que seguía sembrando el contacto
 * viejo (`hero:minimal, contact_form:split, map:*`). Lo mismo hacían `create_default_pages` (sitio de
 * una organización nueva), «Restaurar páginas base» y la plantilla de sede. Si alguno vuelve a
 * sembrar el contacto viejo, esta prueba falla.
 *
 * Caminos cubiertos:
 * - `PAGINAS_BASE_GIRO` / `paginasBasePorGiro` (Plantilla completa, Restaurar páginas base, sede).
 * - `armarPlantillaCompleta` con TODAS las plantillas del catálogo.
 * - `documentoPlantillaSede` con todos los tipos de sede que tienen plantilla.
 * - La plantilla de página «Contacto» de «Nueva página» (con preguntas frecuentes).
 * - `create_default_pages` en la última migración que la define (constante `v_contacto`).
 * - Ningún archivo de src/ vuelve a escribir el juego viejo como texto `tipo:variante`.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import { validarDocumentoSitio, type DocumentoSitio, type PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { seccionesContactoPorDefecto } from '@/lib/website/contrato/paginaContacto';
import {
  PAGINAS_BASE_GIRO,
  paginasBasePorGiro,
  plantillaPorId,
  type Giro,
} from '@/components/sitio-web/paginas/plantillasPagina';
import { armarPlantillaCompleta, CATALOGO_PLANTILLAS, DATOS_VACIOS } from '../plantillaCompleta';
import { documentoPlantillaSede, TIPOS_SEDE_CON_PLANTILLA } from '../plantillaSede';

const RAIZ = path.resolve(__dirname, '../../../../..');

/** Contacto v2 sin ids: lo que debe sembrar cualquier camino. */
const V2 = seccionesContactoPorDefecto().map((s) => ({ tipo: s.section_type, variante: s.section_variant, contenido: s.content }));
const V2_CON_PREGUNTAS = seccionesContactoPorDefecto({ conPreguntas: true }).map((s) => ({
  tipo: s.section_type,
  variante: s.section_variant,
  contenido: s.content,
}));

function generador() {
  let n = 0;
  return () => `id-${++n}`;
}

const sinIds = (p: PaginaSitio) => p.secciones.map((s) => ({ tipo: s.tipo, variante: s.variante, contenido: s.contenido }));

function baseMinima(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, menuMegaId: null, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [{ id: 'p-home', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const GIROS = Object.keys(PAGINAS_BASE_GIRO) as Giro[];

describe('Contacto v2 en todos los sembrados', () => {
  test.each(GIROS)('PAGINAS_BASE_GIRO.%s: la página Contacto es Contacto v2 con sus textos', (giro) => {
    const contacto = paginasBasePorGiro(giro).find((p) => p.slug === 'contacto');
    expect(contacto).toBeDefined();
    expect(contacto!.secciones.map((s) => ({ tipo: s.tipo, variante: s.variante, contenido: s.contenido }))).toEqual(V2);
  });

  test('«Plantilla completa»: con cualquier plantilla del catálogo, Contacto (si la trae) es v2 y visible', () => {
    let conContacto = 0;
    for (const plantilla of CATALOGO_PLANTILLAS.plantillas) {
      const { documento } = armarPlantillaCompleta(baseMinima(), plantilla, DATOS_VACIOS, { extendidos: true, generarId: generador() });
      const contacto = documento.paginas.find((p) => p.slug === 'contacto');
      if (!contacto) continue;
      conContacto += 1;
      expect({ plantilla: plantilla.id, secciones: sinIds(contacto) }).toEqual({ plantilla: plantilla.id, secciones: V2 });
      expect(contacto.secciones.every((s) => s.visibilidad.movil && s.visibilidad.escritorio)).toBe(true);
    }
    // Casi todas traen Contacto («Café de especialidad» la quita a propósito).
    expect(conContacto).toBeGreaterThan(10);
  });

  test.each([...TIPOS_SEDE_CON_PLANTILLA])('plantilla de sede «%s»: Contacto (si la trae) es v2', (tipo) => {
    const documento = documentoPlantillaSede(baseMinima(), tipo, generador());
    expect(documento).not.toBeNull();
    const contacto = documento!.paginas.find((p) => p.slug === 'contacto');
    if (contacto) expect(sinIds(contacto)).toEqual(V2);
  });

  test('«Nueva página» › Contacto: Contacto v2 con preguntas frecuentes de ejemplo', () => {
    const plantilla = plantillaPorId('contacto');
    expect(plantilla?.secciones.map((s) => ({ tipo: s.tipo, variante: s.variante, contenido: s.contenido }))).toEqual(V2_CON_PREGUNTAS);
  });
});

describe('create_default_pages (organización nueva) siembra Contacto v2', () => {
  const dir = path.join(RAIZ, 'supabase/migrations');
  const ultima = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .filter((f) => /function\s+"?public"?\."?create_default_pages"?\s*\(/i.test(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort()
    .pop()!;
  const sql = fs.readFileSync(path.join(dir, ultima), 'utf8');

  test('la constante v_contacto es seccionesContactoPorDefecto() (tipos, variantes y textos)', () => {
    const m = /v_contacto constant jsonb := \$contacto\$([\s\S]*?)\$contacto\$/.exec(sql);
    expect(m).not.toBeNull();
    const sembrado = (JSON.parse(m![1]) as { t: string; v: string; c: Record<string, unknown> }[]).map((s) => ({
      tipo: s.t,
      variante: s.v,
      contenido: s.c,
    }));
    expect(sembrado).toEqual(V2);
  });

  test('toda página «contacto» se siembra con v_contacto y ningún bloque WHEN trae el contacto viejo', () => {
    expect(sql).toMatch(/CASE WHEN v_page->>'slug' = 'contacto' THEN v_contacto/);
    expect(sql).toMatch(/coalesce\(v_section->'c', get_section_default_content\(/);
    for (let tipo = 1; tipo <= 7; tipo += 1) {
      const m = new RegExp(`WHEN ${tipo} THEN '([\\s\\S]*?)'::jsonb`).exec(sql);
      expect(m).not.toBeNull();
      const paginas = JSON.parse(m![1].replace(/''/g, "'")).pages as { slug: string; sections: { t: string; v: string }[] }[];
      const contacto = paginas.find((p) => p.slug === 'contacto');
      expect(contacto?.sections.map((s) => `${s.t}:${s.v}`)).toEqual(V2.map((s) => `${s.tipo}:${s.variante}`));
    }
  });
});

describe('nadie vuelve a escribir el juego viejo de Contacto', () => {
  /** El juego viejo como texto `tipo:variante` (así lo escribían PAGINAS_BASE_GIRO y sus copias). */
  const VIEJO = /hero:minimal,\s*contact_form:split,\s*map:/;

  function archivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(ruta);
      return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
    });
  }

  test('ningún archivo de src/ siembra «hero:minimal, contact_form:split, map:…»', () => {
    const culpables = archivos(path.join(RAIZ, 'src')).filter((f) => VIEJO.test(fs.readFileSync(f, 'utf8')));
    expect(culpables.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });
});
