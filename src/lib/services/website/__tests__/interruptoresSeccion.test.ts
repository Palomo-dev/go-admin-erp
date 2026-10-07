/**
 * Interruptores del inspector (pestaña Contenido / Diseño) ↔ lo que pinta el sitio.
 *
 * El inspector guarda cada interruptor en `contenido[clave]` y el sitio (goadmin-websites)
 * recibe ese objeto tal cual. Dos formas de que un interruptor mienta:
 *  1. Se ofrece en una variante cuyo componente no tiene ese elemento (el overlay en «Minimal»).
 *  2. Con la clave ausente el switch se pinta en un estado distinto del que muestra el sitio
 *     (`defaultValue` solo decide el estado inicial del switch; no se escribe en el contenido).
 *
 * El lado del sitio lo verifica `scripts/verify-interruptores.mjs` en goadmin-websites, que pinta
 * los componentes reales con cada interruptor ausente y apagado.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { getSectionDefinition, type ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { campoVisible } from '@/components/sitio-web/editor/inspector/CampoSeccion';

function campo(tipo: string, clave: string): ContentFieldDef {
  const def = getSectionDefinition(tipo);
  const c = def?.contentFields.find((f) => f.key === clave);
  if (!c) throw new Error(`${tipo} no declara ${clave}`);
  return c;
}

/**
 * Variantes en las que el inspector muestra el campo, con el contenido dado. Un campo puede estar
 * desdoblado en varias definiciones con la misma clave (default distinto por variante, ver
 * `interruptoresSitio.ts`): cuenta cualquiera de ellas.
 */
function variantesVisibles(tipo: string, clave: string, contenido: Record<string, unknown> = {}): string[] {
  const def = getSectionDefinition(tipo)!;
  const defs = def.contentFields.filter((f) => f.key === clave);
  return def.variants.map((v) => v.id).filter((v) => defs.some((f) => campoVisible(f, contenido, v)));
}

describe('Portada (hero): cada interruptor solo donde el sitio lo pinta', () => {
  it('«Mostrar título» y «Mostrar botón» en todas las variantes, encendidos por defecto (el sitio los lee con `!== false`)', () => {
    for (const clave of ['show_title', 'show_cta']) {
      expect(variantesVisibles('hero', clave).sort()).toEqual(['fullscreen', 'minimal', 'slider', 'split', 'video']);
      expect(campo('hero', clave).defaultValue).toBe(true);
    }
  });

  it('«Mostrar overlay oscuro» solo en pantalla completa, slider y video: Minimal y Dividido no tienen overlay', () => {
    expect(variantesVisibles('hero', 'show_overlay').sort()).toEqual(['fullscreen', 'slider', 'video']);
    expect(campo('hero', 'show_overlay').defaultValue).toBe(true);
  });

  it('opacidad y color del overlay solo donde el sitio los lee (el slider usa un velo fijo)', () => {
    for (const clave of ['overlay_opacity', 'overlay_color']) {
      expect(variantesVisibles('hero', clave, { show_overlay: true }).sort()).toEqual(['fullscreen', 'video']);
      expect(variantesVisibles('hero', clave, { show_overlay: false })).toEqual([]);
    }
  });

  it('«Ancho completo» solo en el slider, la única variante que lo lee', () => {
    expect(variantesVisibles('hero', 'full_width')).toEqual(['slider']);
  });
});

describe('«Mostrar descripción»: el switch dice lo que el sitio hace con la clave ausente', () => {
  it.each(['services_list', 'pricing_table', 'membership_plans', 'room_types'])(
    '%s pinta la descripción salvo `false` → encendido por defecto',
    (tipo) => {
      expect(campo(tipo, 'show_description').defaultValue).toBe(true);
    },
  );

  it.each(['products_grid', 'featured_products', 'offers', 'specialties', 'menu_preview'])(
    '%s sigue apagado por defecto (la tarjeta de producto la pinta solo con `true`)',
    (tipo) => {
      expect(campo(tipo, 'show_description').defaultValue).toBe(false);
    },
  );
});

describe('Formulario de contacto', () => {
  it('«Mostrar mapa» solo en «Con mapa», encendido por defecto (esa variante siempre lo pintó)', () => {
    expect(variantesVisibles('contact_form', 'show_map')).toEqual(['with_map']);
    expect(campo('contact_form', 'show_map').defaultValue).toBe(true);
  });

  it('teléfono, email y dirección solo en las variantes que los pintan', () => {
    for (const clave of ['show_phone', 'show_email', 'show_address']) {
      expect(variantesVisibles('contact_form', clave).sort()).toEqual(['split', 'with_map']);
    }
  });
});
