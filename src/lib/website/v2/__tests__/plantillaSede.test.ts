/**
 * Plantilla del sitio de una sede según su tipo de negocio (`plantillaSede.ts`).
 *
 * - El juego de páginas por giro es el MISMO que siembra `create_default_pages` para una
 *   organización (bloque `WHEN <type_id>` de la última migración que define la función).
 * - Una sede restaurante nace con Inicio, Carta («Menú»), Pedir Online, Reservar Mesa y Carta QR,
 *   su menú de encabezado y los legales en el pie, y hereda identidad y tema del principal.
 * - El documento cumple el contrato y no arrastra menús del principal.
 */
import fs from 'fs';
import path from 'path';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  borradorIntacto,
  documentoPlantillaSede,
  esTipoSedePlantilla,
  resultadoDesdeRpc,
  TIPOS_SEDE_CON_PLANTILLA,
} from '@/lib/website/v2/plantillaSede';
import {
  giroDeSede,
  giroDeTipoSede,
  PAGINAS_BASE_GIRO,
  TIPO_ORGANIZACION_POR_GIRO,
  type Giro,
} from '@/components/sitio-web/paginas/plantillasPagina';

const RAIZ = path.resolve(__dirname, '../../../../..');

function generador() {
  let n = 0;
  return () => `id-${++n}`;
}

/** Principal mínimo y válido con un menú propio que la sede NO debe heredar. */
function principal(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Hotel de prueba' } },
    tema: { colores: { primario: { mode: 'value', value: '#0EA5E9' } }, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: 'menu-hotel', menuMegaId: null, opciones: { cta: 'Reservar' } },
      footer: { composicion: 'default', menuIds: ['menu-hotel'], opciones: {} },
    },
    menus: [{ id: 'menu-hotel', nombre: 'Principal', items: [{ id: 'i1', etiqueta: 'Habitaciones', tipo: 'page', paginaId: 'p-hab' }] }],
    paginas: [
      { id: 'p-home', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] },
      { id: 'p-hab', slug: 'espacios', tipo: 'builtin', titulo: 'Habitaciones', publicada: true, secciones: [] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** Bloque `WHEN <tipo>` de la última migración que define create_default_pages. */
function bloqueBd(tipo: number): Array<{ slug: string; title: string; show_in_header: boolean; sections: Array<{ t: string; v: string }> }> {
  const dir = path.join(RAIZ, 'supabase/migrations');
  const archivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .filter((f) => /function\s+"?public"?\."?create_default_pages"?\s*\(/i.test(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort();
  const sql = fs.readFileSync(path.join(dir, archivos[archivos.length - 1]), 'utf8');
  const m = new RegExp(`WHEN ${tipo} THEN '([\\s\\S]*?)'::jsonb`).exec(sql);
  if (!m) throw new Error(`sin bloque WHEN ${tipo}`);
  return JSON.parse(m[1].replace(/''/g, "'")).pages;
}

describe('PAGINAS_BASE_GIRO es el juego de create_default_pages (una sola plantilla)', () => {
  test.each(Object.keys(TIPO_ORGANIZACION_POR_GIRO) as Giro[])('%s', (giro) => {
    const bd = bloqueBd(TIPO_ORGANIZACION_POR_GIRO[giro]).map((p) => ({
      slug: p.slug,
      titulo: p.title,
      enMenu: p.show_in_header,
      secciones: p.sections.map((s) => `${s.t}:${s.v}`),
    }));
    const erp = PAGINAS_BASE_GIRO[giro].map((p) => ({
      slug: p.slug,
      titulo: p.titulo,
      enMenu: p.enMenu,
      secciones: p.secciones.map((s) => `${s.tipo}:${s.variante}`),
    }));
    expect(erp).toEqual(bd);
  });
});

describe('giro de la sede', () => {
  test('cada tipo de sede con plantilla tiene giro; sin tipo, main o vacío no', () => {
    for (const t of TIPOS_SEDE_CON_PLANTILLA) expect(giroDeTipoSede(t)).not.toBeNull();
    expect(giroDeTipoSede(null)).toBeNull();
    expect(giroDeTipoSede('')).toBeNull();
    expect(giroDeTipoSede('main')).toBeNull();
    expect(giroDeTipoSede('toString')).toBeNull();
    expect(esTipoSedePlantilla('main')).toBe(false);
    expect(giroDeSede('main', 'hotel')).toBe('hotel');
    expect(giroDeSede('restaurant', 'hotel')).toBe('restaurante');
  });
});

describe('documentoPlantillaSede', () => {
  test('sede restaurante de un hotel: páginas, secciones y menús de restaurante, válido', () => {
    const doc = documentoPlantillaSede(principal(), 'restaurant', generador());
    expect(doc).not.toBeNull();
    const v = validarDocumentoSitio(doc);
    expect(v.ok).toBe(true);
    const d = doc as DocumentoSitio;
    expect(d.paginas.map((p) => p.slug)).toEqual([
      'home', 'menu', 'domicilios', 'reservas-mesa', 'nosotros', 'contacto', 'galeria', 'terminos', 'privacidad', 'carta-qr',
    ]);
    const inicio = d.paginas.find((p) => p.slug === 'home')!;
    expect(inicio.secciones.map((s) => s.tipo)).toEqual(expect.arrayContaining(['restaurant_hero', 'menu_preview', 'reservation']));
    expect(d.paginas.find((p) => p.slug === 'carta-qr')!.secciones.map((s) => s.tipo)).toEqual([
      'restaurant_hero', 'table_service', 'menu_full', 'table_order', 'table_bill', 'visit_feedback', 'hours_location',
    ]);
    expect(d.paginas.find((p) => p.slug === 'menu')!.secciones.map((s) => s.tipo)).toContain('menu_full');
    // Nada del hotel: ni sus páginas ni su menú.
    expect(d.paginas.some((p) => p.slug === 'espacios')).toBe(false);
    expect(d.menus.some((m) => m.id === 'menu-hotel')).toBe(false);
    // Encabezado con las páginas del menú; legales en el pie; Carta QR fuera del menú.
    const enc = d.menus.find((m) => m.id === d.shell.header.menuPrincipalId)!;
    expect(enc.items.map((i) => i.etiqueta)).toEqual(['Inicio', 'Menú', 'Pedir Online', 'Reservar Mesa', 'Nosotros', 'Contacto']);
    // Pie y encabezado de la «Plantilla completa» del giro: la lámina de su plantilla por defecto
    // (`shellPorPlantilla.ts`, Noir Omakase en restaurante).
    expect(d.shell.footer.menuIds.map((id) => d.menus.find((m) => m.id === id)!.nombre)).toEqual(['Legales']);
    expect(d.shell.header.opciones).toMatchObject({ header_cta_text: 'Reservar mesa', header_cta_url: '/reservas-mesa' });
    // Identidad y tema heredados: la plantilla se arma sin su estilo.
    expect(d.identidad.nombre).toBeUndefined();
    expect(d.tema.colores.primario).toEqual({ mode: 'inherit' });
  });

  test.each(TIPOS_SEDE_CON_PLANTILLA.filter((t) => t !== 'restaurant'))('%s: válido y sin Carta QR', (tipo) => {
    const doc = documentoPlantillaSede(principal(), tipo, generador());
    expect(validarDocumentoSitio(doc).ok).toBe(true);
    expect(doc!.paginas.some((p) => p.slug === 'carta-qr')).toBe(false);
    expect(doc!.paginas[0].slug).toBe('home');
  });

  test('sin tipo con plantilla → null (la sede hereda del principal como antes)', () => {
    expect(documentoPlantillaSede(principal(), null, generador())).toBeNull();
    expect(documentoPlantillaSede(principal(), 'main', generador())).toBeNull();
  });

  test('no muta la base', () => {
    const base = principal();
    const copia = JSON.stringify(base);
    documentoPlantillaSede(base, 'restaurant', generador());
    expect(JSON.stringify(base)).toBe(copia);
  });
});

describe('borradorIntacto (misma regla que la RPC)', () => {
  test('con marca: intacto solo si la versión es la que dejó la plantilla', () => {
    expect(borradorIntacto({ versionBorrador: 2, versionPlantilla: 2, publicado: true })).toBe(true);
    expect(borradorIntacto({ versionBorrador: 3, versionPlantilla: 2, publicado: false })).toBe(false);
  });
  test('sin marca: intacto si nunca se guardó ni publicó', () => {
    expect(borradorIntacto({ versionBorrador: 1, versionPlantilla: null, publicado: false })).toBe(true);
    expect(borradorIntacto({ versionBorrador: 1, versionPlantilla: null, publicado: true })).toBe(false);
    expect(borradorIntacto({ versionBorrador: 2, versionPlantilla: null, publicado: false })).toBe(false);
    expect(borradorIntacto({ versionBorrador: null, versionPlantilla: null, publicado: false })).toBe(false);
  });
});

test('resultadoDesdeRpc traduce la fila de la RPC', () => {
  expect(resultadoDesdeRpc(528, 'restaurant', { accion: 'reemplazado', site_id: 's', version: 4, tipo_anterior: 'hotel', instantanea_id: 'i' })).toEqual({
    accion: 'reemplazado', branchId: 528, tipo: 'restaurant', sitioId: 's', version: 4, tipoAnterior: 'hotel', instantaneaId: 'i',
  });
  expect(resultadoDesdeRpc(1, 'hotel', null).accion).toBe('sin_cambios');
});
