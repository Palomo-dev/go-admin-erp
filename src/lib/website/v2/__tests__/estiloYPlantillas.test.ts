/**
 * Diseño y Plantillas (Figma A/06a-06i): lectura y escritura del estilo en el
 * borrador V2, catálogo por giro, «En uso» y «Usar esta plantilla» (conserva el
 * contenido). Además, el contrato con goadmin-websites: las plantillas base y la
 * estructura de Inicio copiada deben coincidir con `lib/templates/presets.ts`
 * cuando el repositorio del sitio está al lado (si no, esa parte se omite).
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
import ts from 'typescript';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  SECCIONES_INICIO_BASE,
  construirCatalogo,
  contarPorGiro,
  estiloEnUso,
  estilosDelGiro,
  giroCatalogoDeTipo,
  paresTipograficos,
  plantillaEnUso,
  plantillaPorId,
  plantillasDelGiro,
} from '@/lib/website/contrato/catalogoPlantillas';
import {
  ajustesVivosDeEstilo,
  contrasteAcento,
  escribirEstilo,
  leerEstilo,
  mismoEstilo,
  radioBoton,
  secundarioDe,
  temaParaLienzo,
  textoSobreAcento,
  tokensExtendidosDisponibles,
} from '../tokensEstilo';
import { aplicarEstiloPlantilla } from '../usarPlantilla';
import { TEMPLATE_PRESETS } from '@/lib/services/websiteSettingsService';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';

const CATALOGO = construirCatalogo(TEMPLATE_PRESETS);

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Mi empresa S.A.S.' } },
    tema: { modo: { mode: 'value', value: 'light' }, colores: { primario: { mode: 'value', value: '#123456' } }, tipografia: {} },
    seo: {},
    contenido: { textoPie: { mode: 'value', value: 'Texto del pie' } },
    shell: {
      header: { composicion: 'default', menuPrincipalId: 'm1', opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [{ id: 'm1', nombre: 'Principal', items: [{ id: 'i1', etiqueta: 'Carta', tipo: 'page', paginaId: 'p2' }] }],
    paginas: [
      {
        id: 'p1',
        slug: 'home',
        tipo: 'home',
        titulo: 'Inicio',
        publicada: true,
        secciones: [
          { id: 's-faq', tipo: 'faq', variante: 'accordion', version: 1, contenido: { titulo: 'Preguntas' } },
          { id: 's-hero', tipo: 'hero', variante: 'split', version: 1, contenido: { title: 'Hola' }, visibilidad: { movil: false, escritorio: true } },
          { id: 's-menu', tipo: 'menu_preview', variante: 'tabs', version: 1, contenido: { titulo: 'Nuestra carta' } },
          { id: 's-propia', tipo: 'texto_propio', variante: null, version: 1, contenido: { x: 1 } },
        ],
      },
      { id: 'p2', slug: 'carta', tipo: 'menu', titulo: 'Carta', publicada: true, secciones: [{ id: 's-c', tipo: 'hero', variante: 'minimal', version: 1, contenido: {} }] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const valido = (d: DocumentoSitio) => {
  const r = validarDocumentoSitio(d);
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
};

describe('catálogo de plantillas (A/06b)', () => {
  test('restaurante: las 8 de Figma, en su orden, y la primera por defecto', () => {
    expect(plantillasDelGiro(CATALOGO, 'restaurante').map((p) => p.nombre)).toEqual([
      'Noir Omakase',
      'Velvet Lounge',
      'Fine Dining Oscuro',
      'Editorial Marfil',
      'Mediterráneo',
      'Bistró Ilustrado',
      'Pop Callejero',
      'Carta QR',
    ]);
    expect(plantillaPorId(CATALOGO, 'velvet_lounge')?.subgiro).toBe('Bar de coctelería');
  });

  test('los demás giros salen de las plantillas reales del sitio; los contadores, del catálogo', () => {
    const c = contarPorGiro(CATALOGO);
    expect(c.restaurante).toBe(8);
    expect(c.tienda).toBe(TEMPLATE_PRESETS.filter((p) => p.business_type === 'retail').length);
    expect(c.todas).toBe(CATALOGO.plantillas.length);
    expect(CATALOGO.plantillas.some((p) => p.id === 'restaurant_modern')).toBe(false);
    expect(plantillasDelGiro(CATALOGO, 'tienda')[0].porDefecto).toBe(true);
  });

  test('cada base existe en el sitio y cada sección y variante en el catálogo del editor', () => {
    const bases = new Set(TEMPLATE_PRESETS.map((p) => p.id));
    for (const p of CATALOGO.plantillas) {
      expect(bases.has(p.base)).toBe(true);
      for (const [tipo, variante] of p.inicio) {
        const def = getSectionDefinition(tipo);
        expect({ plantilla: p.id, tipo, existe: !!def }).toEqual({ plantilla: p.id, tipo, existe: true });
        expect({ plantilla: p.id, tipo, variante, ok: def!.variants.some((v) => v.id === variante) }).toEqual({ plantilla: p.id, tipo, variante, ok: true });
      }
    }
  });

  test('giro desde organizations.type_id', () => {
    expect(giroCatalogoDeTipo(1)).toBe('restaurante');
    expect(giroCatalogoDeTipo(3)).toBe('tienda');
    expect(giroCatalogoDeTipo(7)).toBe('parqueadero');
    expect(giroCatalogoDeTipo(null)).toBeNull();
    expect(estilosDelGiro(CATALOGO, 'restaurante')).toHaveLength(8);
  });

  test('pares tipográficos sin repetir', () => {
    const pares = paresTipograficos(estilosDelGiro(CATALOGO, 'restaurante'));
    expect(pares[0]).toEqual({ titulos: 'Cormorant', cuerpo: 'Inter', clase: 'elegante' });
    expect(new Set(pares.map((p) => `${p.titulos}|${p.cuerpo}`)).size).toBe(pares.length);
  });

  test('«En uso»: preset guardado, id exacto, o la base con la misma fuente; si no es claro, ninguna', () => {
    expect(plantillaEnUso(CATALOGO, { preset: 'pop_callejero' })?.id).toBe('pop_callejero');
    expect(plantillaEnUso(CATALOGO, { plantillaBase: 'hotel_luxury' })?.id).toBe('hotel_luxury');
    expect(plantillaEnUso(CATALOGO, { plantillaBase: 'restaurant_modern' })?.id).toBe('carta_qr');
    expect(plantillaEnUso(CATALOGO, { plantillaBase: 'restaurant_elegant', fuenteTitulos: 'Playfair Display' })?.id).toBe('velvet_lounge');
    expect(plantillaEnUso(CATALOGO, { plantillaBase: 'restaurant_elegant', fuenteTitulos: 'Roboto' })).toBeNull();
    expect(plantillaEnUso(CATALOGO, { plantillaBase: 'hotel' })).toBeNull();
  });

  test('preset elegido en Diseño', () => {
    const estilos = estilosDelGiro(CATALOGO, 'restaurante');
    const marfil = estilos.find((e) => e.id === 'editorial_marfil')!;
    expect(estiloEnUso(estilos, { ...marfil, preset: null }, null)?.id).toBe('editorial_marfil');
    expect(estiloEnUso(estilos, { ...marfil, acento: '#C8A97E', preset: null }, plantillaPorId(CATALOGO, 'editorial_marfil'))?.id).toBe('editorial_marfil');
    expect(estiloEnUso(estilos, { ...marfil, acento: '#C8A97E', preset: null }, null)).toBeNull();
  });
});

describe('estilo del sitio en el borrador (A/06a)', () => {
  const marfil = plantillaPorId(CATALOGO, 'editorial_marfil')!.estilo;

  test('lo que el documento no define sale del preset base, nunca de un color cableado', () => {
    const e = leerEstilo(documento(), marfil);
    expect(e.acento).toBe('#123456');
    expect(e.fondo).toBe(marfil.fondo);
    expect(e.fuenteTitulos).toBe('Libre Caslon Text');
    expect(e.radio).toBe(0);
    expect(e.preset).toBeNull();
  });

  test('sin tokens extendidos no escribe preset, radio, botón ni movimiento (el sitio público valida estricto)', () => {
    const d = escribirEstilo(documento(), { ...marfil, preset: 'editorial_marfil', radio: 24 }, false);
    const r = valido(d);
    expect(r.tema.preset).toBeUndefined();
    expect(r.tema.radio).toBeUndefined();
    expect(r.tema.colores.primario).toEqual({ mode: 'value', value: '#8C2F1B' });
    expect(r.tema.colores.secundario).toEqual({ mode: 'value', value: secundarioDe(marfil) });
    expect(r.tema.tipografia.titulos).toEqual({ mode: 'value', value: 'Libre Caslon Text' });
    expect(r.paginas).toEqual(documento().paginas);
  });

  test('con tokens extendidos los escribe y el contrato los acepta; ida y vuelta igual', () => {
    const editable = { ...marfil, preset: 'editorial_marfil', radio: 12 as const, estiloBoton: 'sombra_dura' as const, movimiento: 'alto' as const };
    const r = valido(escribirEstilo(documento(), editable, true));
    expect(r.tema.radio).toEqual({ mode: 'value', value: 12 });
    expect(mismoEstilo(leerEstilo(r, marfil), editable, true)).toBe(true);
  });

  test('el contrato rechaza valores fuera de las listas', () => {
    const d = documento();
    const malo = { ...d, tema: { ...d.tema, radio: { mode: 'value', value: 7 } } };
    expect(validarDocumentoSitio(malo).ok).toBe(false);
  });

  test('contraste del acento (A/06a: 2,9:1 no pasa) y texto sobre el acento', () => {
    expect(contrasteAcento({ acento: '#C8A97E', fondo: '#F6F1E7' }).cumple).toBe(false);
    expect(contrasteAcento({ acento: '#8C2F1B', fondo: '#F6F1E7' }).cumple).toBe(true);
    expect(textoSobreAcento('#FFE94D')).toBe('#111111');
    expect(textoSobreAcento('#8C2F1B')).toBe('#FFFFFF');
  });

  test('vista previa en vivo con las columnas que el sitio aplica sin guardar', () => {
    expect(ajustesVivosDeEstilo(marfil)).toEqual({
      primary_color: '#8C2F1B',
      secondary_color: '#1F1B16',
      background_color: '#F6F1E7',
      text_color: '#1F1B16',
      theme_mode: 'light',
    });
    expect(radioBoton({ radio: 4, estiloBoton: 'pastilla' })).toBe(9999);
    expect(tokensExtendidosDisponibles()).toBe(false);
  });

  test('tema en edición para el lienzo: el grupo `tema` tal cual, con el principal solo en sedes con revisión', () => {
    const d = escribirEstilo(documento(), { ...marfil, preset: null }, true);
    expect(temaParaLienzo(null, false, null)).toBeNull();
    const principal = temaParaLienzo(d, false, { documento: documento(), origen: 'revision' });
    expect(principal).toEqual({ tema: d.tema, esSede: false, principal: null });
    expect(principal?.tema.tipografia.titulos).toEqual({ mode: 'value', value: marfil.fuenteTitulos });
    expect(principal?.tema.estiloBoton).toEqual({ mode: 'value', value: marfil.estiloBoton });
    expect(temaParaLienzo(d, true, { documento: documento(), origen: 'revision' })?.principal).toEqual(documento().tema);
    // Principal legacy: no aporta tokens (D12), igual que el sitio publicado.
    expect(temaParaLienzo(d, true, { documento: documento(), origen: 'legacy' })?.principal).toBeNull();
    // Lo que se manda es válido para el contrato que el sitio aplica (esquema estricto).
    expect(validarDocumentoSitio({ ...d, tema: principal?.tema }).ok).toBe(true);
  });
});

describe('usar plantilla › solo estilo (A/06c): cambia colores y fuentes, el contenido se conserva', () => {
  test('aplica estilo y base; páginas, secciones (en su orden), menús, identidad y contenido no cambian', () => {
    const velvet = plantillaPorId(CATALOGO, 'velvet_lounge')!;
    const antes = documento();
    const d = valido(aplicarEstiloPlantilla(antes, velvet, false));
    expect(d.tema.plantillaBase).toEqual({ mode: 'value', value: 'restaurant_elegant' });
    expect(d.tema.colores.primario).toEqual({ mode: 'value', value: '#D4AF37' });
    expect(d.tema.modo).toEqual({ mode: 'value', value: 'dark' });
    expect(d.paginas).toEqual(antes.paginas);
    expect(d.identidad).toEqual(antes.identidad);
    expect(d.contenido).toEqual(antes.contenido);
    expect(d.menus).toEqual(antes.menus);
    expect(d.shell).toEqual(antes.shell);
  });

  test('con tokens extendidos guarda el id del preset, y «En uso» lo reconoce', () => {
    const pop = plantillaPorId(CATALOGO, 'pop_callejero')!;
    const d = valido(aplicarEstiloPlantilla(documento(), pop, true));
    expect(d.tema.preset).toEqual({ mode: 'value', value: 'pop_callejero' });
    expect(plantillaEnUso(CATALOGO, { preset: 'pop_callejero', plantillaBase: 'restaurant_casual' })?.id).toBe('pop_callejero');
  });
});

// ─── Contrato con goadmin-websites ──────────────────────────────────────────────────────────

const RAIZ_ERP = path.resolve(__dirname, '../../../../..');
const DIR_SITIO = process.env.GOADMIN_WEBSITES_DIR || path.resolve(RAIZ_ERP, '../goadmin-websites');
const ARCHIVO_PRESETS = path.join(DIR_SITIO, 'lib/templates/presets.ts');
const HAY_SITIO = fs.existsSync(ARCHIVO_PRESETS);

interface PresetSitio {
  id: string;
  pages: { slug: string; sections: { section_type: string; section_variant: string }[] }[];
}

function presetsDelSitio(): PresetSitio[] {
  const salida = ts.transpileModule(fs.readFileSync(ARCHIVO_PRESETS, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  // presets.ts no importa nada: se transpila y se evalúa tal cual (como plantillasContrato.test.ts).
  const modulo: { exports: Record<string, unknown> } = { exports: {} };
  new Function('module', 'exports', salida)(modulo, modulo.exports);
  const porNegocio = modulo.exports.getPresetsForBusinessType as (t: string) => PresetSitio[];
  return Array.from(new Set(TEMPLATE_PRESETS.map((p) => p.business_type))).flatMap((t) => porNegocio(t));
}

(HAY_SITIO ? describe : describe.skip)('contrato con goadmin-websites (lib/templates/presets.ts)', () => {
  test('la estructura de Inicio copiada coincide con la del sitio', () => {
    const presets = presetsDelSitio();
    expect(presets.length).toBeGreaterThan(0);
    for (const [id, inicio] of Object.entries(SECCIONES_INICIO_BASE)) {
      const p = presets.find((x) => x.id === id);
      expect({ id, existe: !!p }).toEqual({ id, existe: true });
      const home = p!.pages.find((x) => x.slug === 'home') ?? p!.pages[0];
      expect({ id, inicio: home.sections.map((s) => [s.section_type, s.section_variant]) }).toEqual({ id, inicio: inicio.map((s) => [...s]) });
    }
  });

  test('toda base de una plantilla existe en el sitio', () => {
    const ids = new Set(presetsDelSitio().map((p) => p.id));
    for (const p of CATALOGO.plantillas) expect({ base: p.base, existe: ids.has(p.base) }).toEqual({ base: p.base, existe: true });
  });
});
