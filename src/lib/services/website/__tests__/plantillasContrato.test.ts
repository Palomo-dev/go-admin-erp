/**
 * Contrato de plantillas ERP ↔ sitio (2026-10-06).
 *
 * Fuente que manda: `lib/templates/presets.ts` de goadmin-websites (el único
 * lugar con la plantilla completa: tema y páginas con secciones). El ERP guarda
 * dos copias parciales que deben decir lo mismo:
 *  - `TEMPLATE_PRESETS` (websiteSettingsService.ts): tema de cada plantilla.
 *  - `create_default_pages(org, type_id)` (base de datos, disparador al crear
 *    la organización): las páginas con que nace el sitio. Para restaurante
 *    (type_id 1) son las de `restaurant_modern`. Se lee de la última migración
 *    versionada que la define (supabase/pendientes o supabase/migrations).
 * Además, toda sección y variante que usen las plantillas de restaurante debe
 * existir en el catálogo del editor (si no, el editor no puede editarla).
 *
 * El repositorio del sitio se busca en `GOADMIN_WEBSITES_DIR` o como hermano de
 * este (`../goadmin-websites`). Si no está (CI de un solo repositorio), el
 * contrato con el sitio se omite y lo dice; la parte que solo mira el ERP corre
 * siempre.
 */

jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: jest.fn() },
  getProjectRef: jest.fn(() => 'test'),
}));
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
import { SECTION_CATALOG } from '@/lib/services/websitePageBuilderService';
import { TEMPLATE_PRESETS } from '@/lib/services/websiteSettingsService';

interface SeccionSitio { section_type: string; section_variant: string }
interface PaginaSitio {
  slug: string; title: string; show_in_header: boolean; show_in_footer: boolean;
  header_order: number; footer_order: number; sections: SeccionSitio[];
}
interface PresetSitio {
  id: string; name: string; business_type: string; is_default: boolean;
  theme: { primary_color: string; secondary_color: string; theme_mode: 'light' | 'dark' };
  fonts: { heading: string; body: string };
  header_style: string; footer_style: string; pages: PaginaSitio[];
}

const RAIZ_ERP = path.resolve(__dirname, '../../../../..');
const DIR_SITIO = process.env.GOADMIN_WEBSITES_DIR || path.resolve(RAIZ_ERP, '../goadmin-websites');
const ARCHIVO_PRESETS = path.join(DIR_SITIO, 'lib/templates/presets.ts');
const HAY_SITIO = fs.existsSync(ARCHIVO_PRESETS);

/** Plantillas de restaurante con carta y reserva propias (las de las secciones nuevas). */
const RESTAURANTE_CARTA = ['restaurant_modern', 'restaurant_elegant', 'restaurant_rustic'];

function cargarPresetsSitio(): PresetSitio[] {
  // presets.ts no importa nada: se transpila y se evalúa tal cual.
  const fuente = fs.readFileSync(ARCHIVO_PRESETS, 'utf8');
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const modulo: { exports: Record<string, unknown> } = { exports: {} };
  new Function('module', 'exports', js)(modulo, modulo.exports);
  const getPresetsForBusinessType = modulo.exports.getPresetsForBusinessType as (t: string) => PresetSitio[];
  const tipos = Array.from(new Set(TEMPLATE_PRESETS.map((p) => p.business_type)));
  return tipos.flatMap((t) => getPresetsForBusinessType(t));
}

/** Bloque `WHEN <tipo>` de la última migración que define create_default_pages. */
function paginasPorDefectoBd(tipo: number): { archivo: string; paginas: unknown[] } {
  const dirs = ['supabase/migrations', 'supabase/pendientes'].map((d) => path.join(RAIZ_ERP, d));
  const candidatos = dirs
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f)))
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .filter((f) => /function\s+"?public"?\."?create_default_pages"?\s*\(/i.test(fs.readFileSync(f, 'utf8')))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const archivo = candidatos[candidatos.length - 1];
  const sql = fs.readFileSync(archivo, 'utf8');
  const m = new RegExp(`WHEN ${tipo} THEN '([\\s\\S]*?)'::jsonb`).exec(sql);
  if (!m) throw new Error(`No hay bloque WHEN ${tipo} en ${archivo}`);
  return { archivo: path.relative(RAIZ_ERP, archivo), paginas: JSON.parse(m[1].replace(/''/g, "'")).pages };
}

describe('Plantillas: catálogo del editor (solo ERP)', () => {
  test('la última definición de create_default_pages para restaurante usa secciones del catálogo', () => {
    const { paginas } = paginasPorDefectoBd(1);
    const catalogo = new Map(SECTION_CATALOG.map((s) => [s.type, new Set(s.variants.map((v) => v.id))]));
    const faltan = (paginas as Array<{ slug: string; sections: Array<{ t: string; v: string }> }>)
      .flatMap((p) => p.sections.map((s) => ({ ...s, slug: p.slug })))
      .filter((s) => !catalogo.get(s.t)?.has(s.v))
      .map((s) => `${s.slug}: ${s.t}:${s.v}`);
    expect(faltan).toEqual([]);
  });
});

(HAY_SITIO ? describe : describe.skip)('Plantillas: ERP ↔ goadmin-websites (manda el sitio)', () => {
  const sitio = HAY_SITIO ? cargarPresetsSitio() : [];
  const porId = new Map(sitio.map((p) => [p.id, p]));

  test('las plantillas de restaurante con carta existen en los dos lados', () => {
    for (const id of RESTAURANTE_CARTA) {
      expect(porId.has(id)).toBe(true);
      expect(TEMPLATE_PRESETS.some((p) => p.id === id)).toBe(true);
    }
  });

  test('TEMPLATE_PRESETS repite el tema del sitio (id, tipo, por defecto, colores, fuentes, estilos)', () => {
    const diferencias: string[] = [];
    for (const erp of TEMPLATE_PRESETS) {
      const web = porId.get(erp.id);
      if (!web) {
        diferencias.push(`${erp.id}: no existe en el sitio`);
        continue;
      }
      const esperado = {
        name: web.name,
        business_type: web.business_type,
        is_default: web.is_default,
        theme_mode: web.theme.theme_mode,
        colors: { primary: web.theme.primary_color, secondary: web.theme.secondary_color },
        fonts: web.fonts,
        header_style: web.header_style,
        footer_style: web.footer_style,
      };
      const real = {
        name: erp.name,
        business_type: erp.business_type,
        is_default: erp.is_default,
        theme_mode: erp.theme_mode,
        colors: erp.colors,
        fonts: erp.fonts,
        header_style: erp.header_style,
        footer_style: erp.footer_style,
      };
      if (JSON.stringify(esperado) !== JSON.stringify(real)) {
        diferencias.push(`${erp.id}: sitio ${JSON.stringify(esperado)} ≠ ERP ${JSON.stringify(real)}`);
      }
    }
    expect(diferencias).toEqual([]);
  });

  test('las plantillas de restaurante solo usan secciones y variantes del catálogo del editor', () => {
    const catalogo = new Map(SECTION_CATALOG.map((s) => [s.type, new Set(s.variants.map((v) => v.id))]));
    const faltan = RESTAURANTE_CARTA.flatMap((id) =>
      porId.get(id)!.pages.flatMap((p) =>
        p.sections
          .filter((s) => !catalogo.get(s.section_type)?.has(s.section_variant))
          .map((s) => `${id}/${p.slug}: ${s.section_type}:${s.section_variant}`),
      ),
    );
    expect(faltan).toEqual([]);
  });

  test('las plantillas de restaurante usan las secciones nuevas (carta completa, reserva, sedes)', () => {
    for (const id of RESTAURANTE_CARTA) {
      const p = porId.get(id)!;
      const tipos = (slug: string) => p.pages.find((pg) => pg.slug === slug)?.sections.map((s) => s.section_type) ?? [];
      expect(tipos('home')).toEqual(expect.arrayContaining(['restaurant_hero', 'signature_dishes', 'gallery_bento', 'hours_location']));
      expect(tipos('menu')).toContain('menu_full');
      expect(tipos('reservas-mesa')).toContain('reservation');
      expect(p.pages.flatMap((pg) => pg.sections.map((s) => s.section_type))).toContain('private_events');
      // `/reservas` es el asistente de habitaciones del sitio: una página con ese slug no se vería.
      expect(p.pages.map((pg) => pg.slug)).not.toContain('reservas');
    }
  });

  test('create_default_pages (restaurante) crea exactamente las páginas de restaurant_modern', () => {
    const { archivo, paginas } = paginasPorDefectoBd(1);
    const esperado = porId.get('restaurant_modern')!.pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      show_in_header: p.show_in_header,
      show_in_footer: p.show_in_footer,
      header_order: p.header_order,
      footer_order: p.footer_order,
      sections: p.sections.map((s) => ({ t: s.section_type, v: s.section_variant })),
    }));
    expect({ archivo, paginas }).toEqual({ archivo, paginas: esperado });
  });
});

if (!HAY_SITIO) {
  test('contrato con goadmin-websites omitido: no se encontró el repositorio del sitio', () => {
    // eslint-disable-next-line no-console
    console.warn(`plantillasContrato: no existe ${ARCHIVO_PRESETS}; define GOADMIN_WEBSITES_DIR para correrlo.`);
    expect(HAY_SITIO).toBe(false);
  });
}
