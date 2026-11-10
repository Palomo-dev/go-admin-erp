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
      expect(variantesVisibles('hero', clave).sort()).toEqual(['carousel_editorial', 'fullscreen', 'minimal', 'slider', 'split', 'video']);
      expect(campo('hero', clave).defaultValue).toBe(true);
    }
  });

  it('«Mostrar overlay oscuro» solo en pantalla completa, slider, video y carrusel editorial: Minimal y Dividido no tienen overlay', () => {
    expect(variantesVisibles('hero', 'show_overlay').sort()).toEqual(['carousel_editorial', 'fullscreen', 'slider', 'video']);
    expect(campo('hero', 'show_overlay').defaultValue).toBe(true);
  });

  it('opacidad y color del overlay solo donde el sitio los lee (desde D4 también Slider y Dividido)', () => {
    for (const clave of ['overlay_opacity', 'overlay_color']) {
      expect(variantesVisibles('hero', clave, { show_overlay: true }).sort()).toEqual(['carousel_editorial', 'fullscreen', 'slider', 'split', 'video']);
      expect(variantesVisibles('hero', clave, { show_overlay: false })).toEqual([]);
    }
  });

  it('«Ancho completo» solo en el slider, la única variante que lo lee', () => {
    expect(variantesVisibles('hero', 'full_width')).toEqual(['slider']);
  });
});

describe('«Mostrar descripción»: el switch dice lo que el sitio hace con la clave ausente', () => {
  it.each(['services_list', 'pricing_table', 'membership_plans'])(
    '%s pinta la descripción salvo `false` → encendido por defecto',
    (tipo) => {
      expect(campo(tipo, 'show_description').defaultValue).toBe(true);
    },
  );

  // Las tarjetas de habitación empezaron a leer el interruptor el 2026-10-07 y antes no pintaban
  // la descripción: «Tarjetas» nace apagado; «Detallado» la pinta salvo `false`.
  it('room_types: «Detallado» encendido, «Tarjetas» apagado por defecto', () => {
    const def = getSectionDefinition('room_types')!;
    const enVariante = (v: string) => def.contentFields.filter((f) => f.key === 'show_description' && campoVisible(f, {}, v));
    expect(enVariante('detailed').map((f) => f.defaultValue)).toEqual([true]);
    expect(enVariante('cards').map((f) => f.defaultValue)).toEqual([false]);
  });

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

describe('capa de la portada (QA 27-oct, D4): el editor muestra lo que pinta la tienda', () => {
  const conFoto = { image_url: 'https://x/a.jpg' };
  it.each([
    ['fullscreen', conFoto, 70],
    ['fullscreen', { image_url_mobile: 'https://x/m.jpg' }, 70],
    ['fullscreen', {}, 100],
    ['fullscreen', { image_url: '', image_url_mobile: null }, 100],
    ['video', {}, 60],
    ['slider', conFoto, 40],
    ['split', conFoto, 0],
  ])('%s %j sin valor guardado → %i %%', (variante, contenido, esperado) => {
    const visibles = (getSectionDefinition('hero')?.contentFields ?? []).filter(
      (f) => f.key === 'overlay_opacity' && campoVisible(f, contenido as Record<string, unknown>, variante),
    );
    expect(visibles).toHaveLength(1);
    expect(visibles[0].defaultValue).toBe(esperado);
  });
});

/** Default que pinta el inspector en esa variante con la clave ausente (una sola definición visible). */
function defaultEn(tipo: string, clave: string, variante: string, contenido: Record<string, unknown> = {}): unknown {
  const visibles = (getSectionDefinition(tipo)?.contentFields ?? []).filter((f) => f.key === clave && campoVisible(f, contenido, variante));
  expect(visibles).toHaveLength(1);
  return visibles[0].defaultValue;
}

describe('«Café de especialidad»: cada variante nueva con los defaults de su lámina (contrato seccionesCafe.ts)', () => {
  it('Carrusel editorial: sin flechas, 6 s, fundido, barras, pantalla completa, a la izquierda y bajo el encabezado', () => {
    expect(defaultEn('hero', 'show_arrows', 'carousel_editorial')).toBe(false);
    expect(defaultEn('hero', 'interval_ms', 'carousel_editorial', { autoplay: true })).toBe(6000);
    expect(defaultEn('hero', 'transition', 'carousel_editorial')).toBe('fade');
    expect(defaultEn('hero', 'dot_style', 'carousel_editorial', { show_dots: true })).toBe('bars');
    expect(defaultEn('hero', 'height', 'carousel_editorial')).toBe('100vh');
    expect(defaultEn('hero', 'text_align', 'carousel_editorial')).toBe('left');
    expect(defaultEn('hero', 'overlap_header', 'carousel_editorial')).toBe(true);
    expect(defaultEn('hero', 'overlay_opacity', 'carousel_editorial', { show_overlay: true })).toBe(45);
  });

  it('el slider y las demás portadas no cambian', () => {
    expect(defaultEn('hero', 'interval_ms', 'slider', { autoplay: true })).toBe(5000);
    expect(defaultEn('hero', 'transition', 'slider')).toBe('slide');
    expect(defaultEn('hero', 'height', 'fullscreen')).toBe('auto');
    expect(defaultEn('hero', 'text_align', 'split')).toBe('center');
    expect(defaultEn('hero', 'overlap_header', 'fullscreen')).toBe(false);
  });

  it('Carrusel editorial: fotos y hasta 3 botones propios; la imagen única y el video no aplican', () => {
    const def = getSectionDefinition('hero')!;
    const enEditorial = (k: string) => def.contentFields.filter((f) => f.key === k && campoVisible(f, {}, 'carousel_editorial'));
    expect(enEditorial('buttons').map((f) => f.maxItems)).toEqual([3]);
    expect(enEditorial('slides')[0].itemFields?.map((f) => f.key)).toEqual(['image_url', 'image_url_mobile', 'alt']);
    // Plantillas de tienda: «Tarjetas flotantes» trae su copia y «Dividida con productos» hereda la de «Dividido».
    expect(variantesVisibles('hero', 'buttons').sort()).toEqual(['carousel_editorial', 'floating', 'fullscreen', 'minimal', 'slider', 'split', 'split_products', 'video']);
    expect(variantesVisibles('hero', 'image_url')).not.toContain('carousel_editorial');
    expect(variantesVisibles('hero', 'eyebrow')).toEqual(['carousel_editorial']);
    expect(variantesVisibles('hero', 'slides_per_view')).toEqual(['slider']);
  });

  it('Capítulos: etiqueta e imagen por capítulo, animación e entrada encendidas, separación 28', () => {
    const def = getSectionDefinition('how_it_works')!;
    const items = def.contentFields.filter((f) => f.key === 'items' && campoVisible(f, {}, 'chapters'));
    expect(items).toHaveLength(1);
    expect(items[0].itemFields?.map((f) => f.key)).toEqual(expect.arrayContaining(['step', 'label', 'title', 'description', 'image_url', 'image_alt', 'icon']));
    expect(items[0].maxItems).toBe(6);
    for (const clave of ['show_numbers', 'hover_motion', 'reveal_on_scroll']) {
      expect(variantesVisibles('how_it_works', clave)).toEqual(['chapters']);
      expect(defaultEn('how_it_works', clave, 'chapters')).toBe(true);
    }
    expect(defaultEn('how_it_works', 'gap', 'chapters')).toBe(28);
    expect(defaultEn('how_it_works', 'gap', 'steps')).toBe(16);
    expect(defaultEn('how_it_works', 'card_radius', 'chapters')).toBe(24);
  });

  it('Línea de puntos: sin fotos, tamaño regular y los interruptores nuevos solo en esa variante', () => {
    expect(defaultEn('menu_full', 'show_photos', 'dotted')).toBe(false);
    expect(defaultEn('menu_full', 'size', 'dotted')).toBe('regular');
    expect(defaultEn('menu_full', 'size', 'anchors')).toBe('auto');
    for (const clave of ['show_options', 'show_branch_selector', 'show_counter', 'sticky_tabs']) {
      expect(variantesVisibles('menu_full', clave)).toEqual(['dotted']);
      expect(defaultEn('menu_full', clave, 'dotted')).toBe(true);
    }
    expect(defaultEn('menu_full', 'show_compare_price', 'dotted')).toBe(false);
  });

  it('Plano de mesas: reglas del formulario de siempre, y «Registrar también» solo por WhatsApp', () => {
    for (const clave of ['branch_ids', 'min_guests', 'max_guests', 'max_days', 'show_notes', 'require_email', 'policy_text', 'success_message', 'pending_message']) {
      expect(variantesVisibles('reservation', clave)).toContain('floor_plan');
    }
    expect(variantesVisibles('reservation', 'also_register', { booking_mode: 'whatsapp' })).toEqual(['floor_plan']);
    expect(variantesVisibles('reservation', 'also_register', { booking_mode: 'erp' })).toEqual([]);
    expect(variantesVisibles('reservation', 'ask_time_first', { booking_mode: 'whatsapp' })).toEqual([]);
    expect(variantesVisibles('reservation', 'ask_time_first')).toEqual(['floor_plan']);
    for (const clave of ['table_optional', 'dim_small_tables', 'show_legend', 'show_capacity']) {
      expect(defaultEn('reservation', clave, 'floor_plan')).toBe(true);
    }
  });
});
